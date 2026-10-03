package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/golang/glog"
	"github.com/gordonklaus/portaudio"
	"github.com/gorilla/websocket"
	"layeh.com/gopus"
)

var wsWriteLock sync.Mutex
var eventIDCounter atomic.Uint64

// sessionCloseOnce 确保 session.close 只发送一次（正常结束 defer 与 Ctrl+C watcher 二选一）。
var sessionCloseOnce sync.Once

// micStopped 标记麦克风采集是否已停止；置位后采集回调不再上行音频，
// 用于退出时先停麦克风、再发 session.close。
var micStopped atomic.Bool

// stopMic 停止麦克风上行（幂等）：先置位让采集回调停止发送，避免 session.close 之后仍有音频上行。
func stopMic() {
	micStopped.Store(true)
}

// sendEvent 把任意事件结构体序列化为 JSON，并以 TextMessage 发送。
// 除高频的麦克风音频上行（input_audio_buffer.append）外，统一打印上行事件日志。
func sendEvent(conn *websocket.Conn, v any) error {
	payload, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}
	if !bytes.Contains(payload, []byte(`"`+TypeInputAudioBufferAppend+`"`)) {
		glog.Infof("[send event] %s", payload)
	}
	wsWriteLock.Lock()
	defer wsWriteLock.Unlock()
	if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
		return fmt.Errorf("send event: %w", err)
	}
	return nil
}

func newEventID() string {
	return fmt.Sprintf("event_%d", eventIDCounter.Add(1))
}

// ============== session.create / session.update ==============

func sessionCreate(conn *websocket.Conn, sessionID string, sess SessionConfig, ext *ExtensionData) error {
	if sess.ID == "" {
		sess.ID = sessionID
	}
	evt := &SessionUpdateEvent{
		Type:      TypeSessionCreate,
		EventID:   newEventID(),
		Session:   sess,
		Extension: ext,
	}
	if err := sendEvent(conn, evt); err != nil {
		return fmt.Errorf("send session.create: %w", err)
	}

	// 等待 session.created
	for {
		mt, frame, err := conn.ReadMessage()
		if err != nil {
			return fmt.Errorf("read session.created: %w", err)
		}
		if mt != websocket.TextMessage && mt != websocket.BinaryMessage {
			continue
		}
		var base baseEvent
		if err := json.Unmarshal(frame, &base); err != nil {
			glog.Infof("session.update response (unparsed): %s", frame)
			continue
		}
		switch base.Type {
		case TypeSessionCreated:
			var created SessionCreatedEvent
			if err := json.Unmarshal(frame, &created); err != nil {
				return fmt.Errorf("unmarshal session.created: %w", err)
			}
			dialogID = created.Session.ID
			glog.Infof("Session created, dialog_id=%s", dialogID)
			return nil
		case TypeError:
			return fmt.Errorf("session.update error: %s", frame)
		default:
			glog.Infof("Ignore event before session.created: %s", base.Type)
		}
	}
}

// sessionUpdate 仅发送 session.update 事件，不阻塞等待响应。
// 对应的 session.updated 下行由主接收循环 realtimeAPIOutputAudio 处理。
func sessionUpdate(conn *websocket.Conn, sessionID string, sess SessionConfig, ext *ExtensionData) error {
	if sess.ID == "" {
		sess.ID = sessionID
	}
	evt := &SessionUpdateEvent{
		Type:      TypeSessionUpdate,
		EventID:   newEventID(),
		Session:   sess,
		Extension: ext,
	}
	if err := sendEvent(conn, evt); err != nil {
		return fmt.Errorf("send session.update: %w", err)
	}
	return nil
}

// ============== 流式打招呼 / 干预回复 ==============

func speechTextAppend(conn *websocket.Conn, req *SpeechTextBufferEvent) error {
	if isUserQuerying.Load() {
		glog.Errorf("speechTextAppend cant be called while user is querying.")
		return nil
	}
	req.Type = TypeSpeechTextBufferAppend
	req.EventID = newEventID()
	return sendEvent(conn, req)
}

func speechTextCommit(conn *websocket.Conn, req *SpeechTextBufferEvent) error {
	req.Type = TypeSpeechTextBufferCommit
	req.EventID = newEventID()
	return sendEvent(conn, req)
}

func speechTextReplacementAppend(conn *websocket.Conn, req *SpeechTextBufferEvent) error {
	req.Type = TypeSpeechTextBufferReplacementAppend
	req.EventID = newEventID()
	return sendEvent(conn, req)
}

func speechTextReplacementCommit(conn *websocket.Conn, req *SpeechTextBufferEvent) error {
	req.Type = TypeSpeechTextBufferReplacementCommit
	req.EventID = newEventID()
	return sendEvent(conn, req)
}

// ============== 会话上下文管理（统一 items 数组形式） ==============

func conversationItemCreate(conn *websocket.Conn, items ...ConversationItemDef) error {
	evt := &ConversationItemsCreateEvent{
		Type:    TypeConversationItemCreate,
		EventID: newEventID(),
		Items:   items,
	}
	return sendEvent(conn, evt)
}

func conversationItemUpdate(conn *websocket.Conn, items ...ConversationItemDef) error {
	evt := &ConversationItemsCreateEvent{
		Type:    TypeConversationItemUpdate,
		EventID: newEventID(),
		Items:   items,
	}
	return sendEvent(conn, evt)
}

func conversationItemRetrieve(conn *websocket.Conn, items ...ConversationItemDef) error {
	evt := &ConversationItemRefEvent{
		Type:    TypeConversationItemRetrieve,
		EventID: newEventID(),
		Items:   items,
	}
	return sendEvent(conn, evt)
}

func conversationItemDelete(conn *websocket.Conn, items ...ConversationItemDef) error {
	evt := &ConversationItemRefEvent{
		Type:    TypeConversationItemDelete,
		EventID: newEventID(),
		Items:   items,
	}
	return sendEvent(conn, evt)
}

// sessionClose 发送 session.close；通过 once 保证整个生命周期只发送一次，
// 避免「正常结束 defer」「Ctrl+C watcher」重复发送或在连接关闭后再发报错。
func sessionClose(conn *websocket.Conn) error {
	var err error
	sessionCloseOnce.Do(func() {
		// 先停止麦克风上行，再发 session.close，避免关闭后仍有音频写连接
		stopMic()
		err = sendEvent(conn, &SimpleEvent{Type: TypeSessionClose, EventID: newEventID()})
		if err == nil {
			glog.Info("session.close request is sent.")
		}
	})
	return err
}

// ============== 音频上行：input_audio_buffer.append / commit ==============

func inputAudioAppend(conn *websocket.Conn, audioData []byte) error {
	evt := &InputAudioBufferAppendEvent{
		Type:  TypeInputAudioBufferAppend,
		Audio: base64.StdEncoding.EncodeToString(audioData),
	}
	return sendEvent(conn, evt)
}

func inputAudioCommit(conn *websocket.Conn) error {
	return sendEvent(conn, &SimpleEvent{Type: TypeInputAudioBufferCommit, EventID: newEventID()})
}

// sendAudio 麦克风实时采集 + opus 编码 -> input_audio_buffer.append。
func sendAudio(ctx context.Context, c *websocket.Conn) {
	go func() {
		defer func() {
			if err := recover(); err != nil {
				glog.Errorf("panic: %v", err)
			}
		}()
		encoder, err := gopus.NewEncoder(16000, 1, gopus.Audio)
		if err != nil {
			glog.Fatalf("Failed to create Opus encoder: %v", err)
		}
		encoder.SetBitrate(16000)
		defaultInputDevice, err := portaudio.DefaultInputDevice()
		if err != nil {
			glog.Errorf("Failed to get default input device: %v", err)
			return
		}
		glog.Infof("Using default input device: %s", defaultInputDevice.Name)
		streamParameters := portaudio.StreamParameters{
			Input: portaudio.StreamDeviceParameters{
				Device:   defaultInputDevice,
				Channels: 1,
				Latency:  defaultInputDevice.DefaultLowInputLatency,
			},
			SampleRate:      16000,
			FramesPerBuffer: 320,
		}

		stream, err := portaudio.OpenStream(streamParameters, func(in []int16) {
			// 已请求停止采集（退出中）则不再上行，避免 session.close 之后仍发送音频
			if micStopped.Load() {
				glog.Infof("mic stopped, skip send audio append.")
				return
			}
			var packet []byte
			switch asrFormat {
			case DefaultPCM:
				audioBytes := make([]byte, len(in)*2)
				for i, sample := range in {
					audioBytes[i*2] = byte(sample & 0xff)
					audioBytes[i*2+1] = byte((sample >> 8) & 0xff)
				}
				packet = audioBytes
			case SpeechOpus:
				packet, err = encoder.Encode(in, len(in), len(in)*2)
				if err != nil {
					glog.Errorf("Opus encode error: %v", err)
					return
				}
			}
			select {
			case <-ctx.Done():
				glog.Infof("context canceled, skip send audio append.")
				return
			default:
				// glog.Infof("send audio append: %d", len(packet))
				if err := inputAudioAppend(c, packet); err != nil {
					glog.Errorf("Error sending audio message: %v", err)
					return
				}
			}

		})
		if err != nil {
			glog.Errorf("Failed to open microphone input stream: %v", err)
			return
		}
		defer stream.Close()

		if err := stream.Start(); err != nil {
			glog.Errorf("Failed to start microphone input stream: %v", err)
			return
		}
		glog.Info("Microphone input stream started. please speak...")

		select {
		case <-ctx.Done():
			glog.Info("Stopping microphone input stream due to context cancellation...")
			// 仅停止采集；stream 由 defer stream.Close() 释放，避免重复 Stop/Close 导致 PortAudio double free。
			if err := stream.Stop(); err != nil {
				glog.Errorf("Failed to stop microphone input stream: %v", err)
			}
			_ = sessionClose(c)
			// end

		}
		glog.Info("Microphone input stream stopped.")
	}()
}

// sendAudioFromWav 读取 wav/pcm 文件，分片 base64 后通过 input_audio_buffer.append 推送。
func sendAudioFromWav(ctx context.Context, c *websocket.Conn, audioFile string) error {
	content, err := os.ReadFile(audioFile)
	if err != nil {
		return err
	}
	if strings.HasSuffix(audioFile, ".wav") {
		content = content[44:]
	}

	sleepDuration := 20 * time.Millisecond
	bufferSize := 640
	curPos := 0

	for curPos < len(content) {
		if curPos+bufferSize >= len(content) {
			bufferSize = len(content) - curPos
		}
		if err := inputAudioAppend(c, content[curPos:curPos+bufferSize]); err != nil {
			return fmt.Errorf("send audio append: %w", err)
		}
		curPos += bufferSize

		if curPos < len(content) {
			select {
			case <-ctx.Done():
				return fmt.Errorf("context canceled during sleep: %w", ctx.Err())
			case <-time.After(sleepDuration):
			}
		}
	}
	// 文件发完，提交音频
	return inputAudioCommit(c)
}

func sendSilenceAudio(ctx context.Context, c *websocket.Conn) error {
	// 16000Hz, 16bit, 1 channel, 10ms silence
	silence := make([]byte, 320) // 160 samples * 2 bytes/sample = 320 bytes
	if err := inputAudioAppend(c, silence); err != nil {
		return fmt.Errorf("send silence audio append: %w", err)
	}

	return nil
}
