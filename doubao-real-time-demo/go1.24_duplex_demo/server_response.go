package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"encoding/json"

	"github.com/golang/glog"
	"github.com/google/uuid"
	"github.com/gordonklaus/portaudio"
	"github.com/gorilla/websocket"
	"layeh.com/gopus"
)

const (
	sampleRate      = 16000
	sampleRate24k   = 24000
	channels        = 1
	framesPerBuffer = 512
	bufferSeconds   = 100
	DefaultPCM      = "pcm"
	PcmS16LE        = "pcm_s16le"
	OggOpus         = "ogg_opus"
	SpeechOpus      = "speech_opus"
)

var (
	audio           []byte
	bufferLock      sync.Mutex
	buffer          = make([]float32, 0, sampleRate*bufferSeconds)
	s16Buffer       = make([]int16, 0, sampleRate*bufferSeconds)
	opusDecoder     *gopus.Decoder
	opusDecoderLock sync.Mutex
	oggParser       = &oggOpusParser{}

	ttsPlaybackPending = atomic.Bool{}
	ttsPlaybackDoneCh  = make(chan struct{}, 1)
	isSendingGreeting  = atomic.Bool{}
	isUserQuerying     = atomic.Bool{}

	ReplyID = ""
)

// ============== Ogg/Opus 解析（移植自 go1.24） ==============

type oggOpusParser struct {
	rawBuf    []byte
	packetBuf []byte
}

func (p *oggOpusParser) Reset() {
	p.rawBuf = p.rawBuf[:0]
	p.packetBuf = p.packetBuf[:0]
}

func (p *oggOpusParser) Push(data []byte) [][]byte {
	p.rawBuf = append(p.rawBuf, data...)
	var packets [][]byte
	for {
		if len(p.rawBuf) < 27 {
			return packets
		}
		if string(p.rawBuf[:4]) != "OggS" {
			idx := -1
			for i := 1; i+3 < len(p.rawBuf); i++ {
				if p.rawBuf[i] == 'O' && p.rawBuf[i+1] == 'g' && p.rawBuf[i+2] == 'g' && p.rawBuf[i+3] == 'S' {
					idx = i
					break
				}
			}
			if idx < 0 {
				p.rawBuf = p.rawBuf[:0]
				return packets
			}
			p.rawBuf = p.rawBuf[idx:]
			if len(p.rawBuf) < 27 {
				return packets
			}
		}
		pageSegments := int(p.rawBuf[26])
		headerSize := 27 + pageSegments
		if len(p.rawBuf) < headerSize {
			return packets
		}
		payloadLen := 0
		for i := 0; i < pageSegments; i++ {
			payloadLen += int(p.rawBuf[27+i])
		}
		pageSize := headerSize + payloadLen
		if len(p.rawBuf) < pageSize {
			return packets
		}
		payload := p.rawBuf[headerSize:pageSize]
		offset := 0
		for i := 0; i < pageSegments; i++ {
			lacing := int(p.rawBuf[27+i])
			if offset+lacing > len(payload) {
				p.rawBuf = p.rawBuf[pageSize:]
				return packets
			}
			p.packetBuf = append(p.packetBuf, payload[offset:offset+lacing]...)
			offset += lacing
			if lacing < 255 {
				packet := make([]byte, len(p.packetBuf))
				copy(packet, p.packetBuf)
				packets = append(packets, packet)
				p.packetBuf = p.packetBuf[:0]
			}
		}
		p.rawBuf = p.rawBuf[pageSize:]
	}
}

// ============== 接收循环：按 type 分发 ==============

func realtimeAPIOutputAudio(ctx context.Context, conn *websocket.Conn) {
	if !isAudioFileInput() {
		go startPlayer(ctx)
	}

	for {
		mt, frame, err := conn.ReadMessage()
		if err != nil {
			glog.Errorf("Receive message error: %v", err)
			return
		}
		if mt != websocket.TextMessage && mt != websocket.BinaryMessage {
			continue
		}
		if len(frame) == 0 {
			glog.Errorf("Receive message with empty frame data")
			continue
		}
		var base baseEvent
		if err := json.Unmarshal(frame, &base); err != nil {
			glog.Errorf("Unmarshal event type error: %v, frame=%s", err, truncate(frame, 200))
			continue
		}
		// 打印每个下行事件原始 frame，便于 debug（音频 delta 较大，截断打印）
		if !bytes.Contains(frame, []byte(`"`+TypeResponseOutputAudioDelta+`"`)) {
			glog.Infof("[recv event] type=%s frame=%s", base.Type, truncate(frame, 500))
		}

		// glog.Infof("[recv event] type=%s frame=%s", base.Type, truncate(frame, 500))

		if done := dispatchEvent(ctx, conn, base.Type, frame); done {
			return
		}
	}
}

// dispatchEvent 处理单个下行事件；返回 true 表示接收循环应退出。
func dispatchEvent(ctx context.Context, conn *websocket.Conn, eventType string, frame []byte) bool {
	switch eventType {
	case TypeSessionCreated, TypeSessionUpdated:
		var e SessionCreatedEvent
		_ = json.Unmarshal(frame, &e)
		if e.Session.ID != "" {
			dialogID = e.Session.ID
		}
		glog.Infof("[%s] dialog_id=%s", eventType, dialogID)

	case TypeSessionClosed:
		glog.Infof("[session.closed]")
		return true

	case TypeInputAudioBufferCommitted:
		glog.Infof("[input_audio_buffer.committed]")

	// ---- ASR ----
	case TypeTranscriptionStarted:
		// 用户开始说话：清空本地 TTS 音频缓存。
		buffer = buffer[:0]
		s16Buffer = s16Buffer[:0]
		ttsPlaybackPending.Store(false)
		oggParser.Reset()
		isUserQuerying.Store(true)
		glog.Infof("[transcription.started]")

	case TypeTranscriptionDelta:
		var e TranscriptionEvent
		_ = json.Unmarshal(frame, &e)
		glog.Infof("[ASR delta] item=%s delta=%s", e.ItemID, e.Delta)

	case TypeTranscriptionCompleted:
		var e TranscriptionEvent
		_ = json.Unmarshal(frame, &e)
		glog.Infof("[ASR completed] item=%s transcript=%s", e.ItemID, e.Transcript)
		isUserQuerying.Store(false)
		// Customer demo: probabilistically trigger an intervention TTS response.
		// This shows how to use speech_text_buffer.replacement.* while a session is active.
		if rand.Intn(100000)%100 == 0 {
			go func() {
				isSendingGreeting.Store(true)
				time.Sleep(1 * time.Second)
				glog.Infof("hit replacement intervention, start sending...")
				sid := uuid.New().String()
				_ = speechTextReplacementAppend(conn, &SpeechTextBufferEvent{SpeechID: sid, Text: "这是干预回复，"})
				_ = speechTextReplacementCommit(conn, &SpeechTextBufferEvent{SpeechID: sid, Text: "我来帮你换个说法。"})
			}()
		}

	case TypeTranscriptionFailed:
		glog.Errorf("[ASR failed] %s", truncate(frame, 300))

	// ---- 大模型文本 ----
	case TypeResponseOutputTextDelta:
		var e ResponseTextEvent
		_ = json.Unmarshal(frame, &e)
		glog.Infof("[Chat delta] resp=%s delta=%s", e.ResponseID, e.Delta)

	case TypeResponseOutputTextDone:
		var e ResponseTextEvent
		_ = json.Unmarshal(frame, &e)
		glog.Infof("[Chat done] resp=%s text=%s", e.ResponseID, e.Text)

	// ---- TTS 音频 ----
	case TypeResponseOutputAudioStarted:
		var e ResponseAudioEvent
		_ = json.Unmarshal(frame, &e)
		ReplyID = e.ResponseID
		glog.Infof("[TTS start] resp=%s tts_type=%s", e.ResponseID, e.TTSType)
		if isSendingGreeting.Load() && (e.TTSType == "chat_tts_text" || e.TTSType == "external_rag") {
			buffer = buffer[:0]
			s16Buffer = s16Buffer[:0]
			ttsPlaybackPending.Store(false)
			oggParser.Reset()
			isSendingGreeting.Store(false)
		}

	case TypeResponseOutputAudioDelta:
		var e ResponseAudioEvent
		_ = json.Unmarshal(frame, &e)
		data, err := base64.StdEncoding.DecodeString(e.Delta)
		if err != nil {
			glog.Errorf("[TTS delta] base64 decode error: %v", err)
			break
		}
		handleIncomingAudio(data)
		audio = append(audio, data...)

	case TypeResponseOutputAudioDone:
		var e ResponseAudioEvent
		_ = json.Unmarshal(frame, &e)
		glog.Infof("[TTS done] resp=%s status=%s", e.ResponseID, e.StatusCode)
		ttsPlaybackPending.Store(true)
		// 音频文件模式：一轮 TTS 结束即保存音频并结束会话
		if isAudioFileInput() {
			saveAudioToPCMFile("output.pcm")
			glog.Infof("[TTS ended] audio-file mode finished, output saved.")
			return true
		}

	// ---- Function Call ----
	case TypeResponseFunctionCallArgumentsDone:
		var e FunctionCallArgumentsDoneEvent
		if err := json.Unmarshal(frame, &e); err != nil {
			glog.Errorf("[FC] unmarshal error: %v", err)
			break
		}
		go handleFunctionCallResponse(ctx, conn, &e)

	// ---- 上下文 ----
	case TypeConversationItemAdded, TypeConversationItemRetrieved, TypeConversationItemUpdated:
		var e ConversationItemEvent
		_ = json.Unmarshal(frame, &e)
		for _, it := range e.Items {
			glog.Infof("[%s] item_id=%s role=%s", eventType, it.ID, it.Role)
		}

	case TypeConversationItemDeleted:
		var e ConversationItemEvent
		_ = json.Unmarshal(frame, &e)
		for _, it := range e.Items {
			glog.Infof("[%s] item_id=%s", eventType, it.ID)
		}

	// ---- Usage ----
	case TypeResponseCanceled:
		var e baseEvent
		_ = json.Unmarshal(frame, &e)
		glog.Infof("[response.canceled] event_id=%s", e.EventID)

	case TypeResponseDone:
		glog.Infof("[response.done] %s", truncate(frame, 500))

	// ---- 错误 ----
	case TypeError:
		var e ErrorEvent
		_ = json.Unmarshal(frame, &e)
		glog.Errorf("[error] type=%s code=%s message=%s", e.Error.Type, e.Error.Code, e.Error.Message)

	default:
		glog.Infof("[unhandled event] type=%s %s", eventType, truncate(frame, 200))
	}
	return false
}

func truncate(b []byte, n int) []byte {
	if len(b) > n {
		return b[:n]
	}
	return b
}

// ============== 音频解码 + 播放（移植自 go1.24） ==============

func startPlayer(ctx context.Context) {
	outputSampleRate := sampleRate24k
	outputDevice, err := portaudio.DefaultOutputDevice()
	if err != nil {
		glog.Errorf("Failed to get default output device: %v", err)
		return
	}
	outputParameters := portaudio.StreamParameters{
		Output: portaudio.StreamDeviceParameters{
			Device:   outputDevice,
			Channels: channels,
			Latency:  10 * time.Millisecond,
		},
		SampleRate:      float64(outputSampleRate),
		FramesPerBuffer: framesPerBuffer,
	}
	var outputStream *portaudio.Stream
	switch ttsFormat {
	case DefaultPCM:
		outputStream, err = portaudio.OpenStream(outputParameters, func(out []float32) {
			bufferLock.Lock()
			defer bufferLock.Unlock()
			if len(buffer) < len(out) {
				copy(out, buffer)
				for i := len(buffer); i < len(out); i++ {
					out[i] = 0
				}
				buffer = buffer[:0]
			} else {
				copy(out, buffer)
				buffer = buffer[len(out):]
			}
			if len(buffer) == 0 {
				onTTSPlaybackFinished()
			}
		})
	case PcmS16LE, OggOpus:
		outputStream, err = portaudio.OpenStream(outputParameters, func(out []int16) {
			bufferLock.Lock()
			defer bufferLock.Unlock()
			if len(s16Buffer) < len(out) {
				copy(out, s16Buffer)
				for i := len(s16Buffer); i < len(out); i++ {
					out[i] = 0
				}
				s16Buffer = s16Buffer[:0]
			} else {
				copy(out, s16Buffer)
				s16Buffer = s16Buffer[len(out):]
			}
			if len(s16Buffer) == 0 {
				onTTSPlaybackFinished()
			}
		})
	}
	if outputStream == nil || err != nil {
		glog.Errorf("Failed to open PortAudio output stream: %v", err)
		return
	}

	if err := outputStream.Start(); err != nil {
		glog.Errorf("Failed to start PortAudio output stream: %v", err)
		return
	}
	glog.Info("PortAudio output stream started for playback.")
	<-ctx.Done()
	outputStream.Close()
	go saveAudioToPCMFile("output.pcm")
	glog.Info("PortAudio output stream stopped.")
}

func handleIncomingAudio(data []byte) {
	if isSendingGreeting.Load() {
		return
	}
	switch ttsFormat {
	case PcmS16LE:
		sampleCount := len(data) / 2
		samples := make([]int16, sampleCount)
		for i := 0; i < sampleCount; i++ {
			bits := binary.LittleEndian.Uint16(data[i*2 : (i+1)*2])
			samples[i] = int16(bits)
		}
		bufferLock.Lock()
		defer bufferLock.Unlock()
		s16Buffer = append(s16Buffer, samples...)
		if len(s16Buffer) > sampleRate*bufferSeconds {
			s16Buffer = s16Buffer[len(s16Buffer)-(sampleRate*bufferSeconds):]
		}
	case DefaultPCM:
		sampleCount := len(data) / 4
		samples := make([]float32, sampleCount)
		for i := 0; i < sampleCount; i++ {
			bits := binary.LittleEndian.Uint32(data[i*4 : (i+1)*4])
			samples[i] = math.Float32frombits(bits)
		}
		bufferLock.Lock()
		defer bufferLock.Unlock()
		buffer = append(buffer, samples...)
		if len(buffer) > sampleRate*bufferSeconds {
			buffer = buffer[len(buffer)-(sampleRate*bufferSeconds):]
		}
	case OggOpus:
		opusDecoderLock.Lock()
		if opusDecoder == nil {
			var err error
			opusDecoder, err = gopus.NewDecoder(sampleRate24k, channels)
			if err != nil {
				opusDecoderLock.Unlock()
				glog.Errorf("Failed to create opus decoder: %v", err)
				return
			}
		}
		packets := oggParser.Push(data)
		if len(packets) == 0 {
			opusDecoderLock.Unlock()
			return
		}
		decodedAll := make([]int16, 0, len(packets)*framesPerBuffer)
		for _, packet := range packets {
			decoded, err := opusDecoder.Decode(packet, (sampleRate24k*120)/1000, false)
			if err != nil {
				glog.Errorf("Decode opus packet failed: %v", err)
				continue
			}
			decodedAll = append(decodedAll, decoded...)
		}
		opusDecoderLock.Unlock()
		if len(decodedAll) == 0 {
			return
		}
		bufferLock.Lock()
		defer bufferLock.Unlock()
		s16Buffer = append(s16Buffer, decodedAll...)
		if len(s16Buffer) > sampleRate24k*bufferSeconds {
			s16Buffer = s16Buffer[len(s16Buffer)-(sampleRate24k*bufferSeconds):]
		}
	}
}

func onTTSPlaybackFinished() {
	if !ttsPlaybackPending.CompareAndSwap(true, false) {
		return
	}
	select {
	case ttsPlaybackDoneCh <- struct{}{}:
	default:
	}
	glog.Info("TTS playback finished.")
}

func saveAudioToPCMFile(s string) {
	if len(audio) == 0 {
		glog.Info("No audio data to save.")
		return
	}
	pcmPath := filepath.Join("./", s)
	if err := os.Remove(pcmPath); err != nil && os.IsNotExist(err) {
		glog.Errorf("remove file failed: %v", err)
	}
	if err := os.WriteFile(pcmPath, audio, 0644); err != nil {
		glog.Exitf("Save pcm file: %v", err)
	}
}
