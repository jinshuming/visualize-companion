package main

import (
	"context"
	"flag"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/golang/glog"
	"github.com/google/uuid"
	"github.com/gordonklaus/portaudio"
	"github.com/gorilla/websocket"
)

const (
	configPath      = "config.toml"
	AuthTypeXAPIKey = "x-api-key"
	AuthTypeBearer  = "bearer"
)

var (
	// 如果传了这个,则走本地文件的wav作为输入,在demo中输出结果pcm后直接退出
	audioFilePath = flag.String("audio", "", "audio file to send server, if not set, use mic as input")

	// Demo 默认配置；运行时优先读取 config.toml。
	apikey   = ""
	authType = AuthTypeXAPIKey

	// 火山引擎搜索 Search API 示例 Key；使用 volc_search 工具前在 config.toml 中配置。
	volcSearchAPIKey = ""

	// 模型
	model = "1.2.6.1"

	systemPrompt = "You are a creative assistant that helps with design tasks."

	// 客户接入新增自定义参数
	speaker   = "zh_male_xiaotian_jupiter_bigtts"
	ttsFormat = PcmS16LE // TTS 下行音频格式：DefaultPCM / PcmS16LE / OggOpus；与 session.audio.output.format 对齐
	asrFormat = SpeechOpus

	// 无需修改的参数
	wsURL    = url.URL{Scheme: "wss", Host: "openspeech.bytedance.com", Path: "/api/v3/duplex/realtime/dialogue"}
	dialogID = ""
)

func init() {
	rand.New(rand.NewSource(time.Now().UnixNano()))
}

func isAudioFileInput() bool {
	return audioFilePath != nil && *audioFilePath != ""
}

// buildSessionConfig 构造 session.update 的 session 与 extension。
// extension 外层对齐文档固定为 asr/tts/dialog/s2s/extra，内层均为 map 透传。
func buildSessionConfig() (SessionConfig, *ExtensionData) {
	tools := []FunctionTool{
		{
			Type:        "function",
			Name:        ToolNameVolcSearch,
			Description: "Search the internet for up-to-date information. Use this tool when the user asks for current, factual, or web-based information. If the user's request depends on location, such as nearby places, local weather, local news, traffic, restaurants, stores, hospitals, events, or local services, and the location is not available in the conversation context, do not call this tool. Ask the user for their city, district, address, or current location first.",
			Parameters: &JSONSchema{
				Type: "object",
				Properties: map[string]*JSONSchema{
					"query": {Type: "array"},
				},
				Required: []string{"query"},
			},
		},
		{
			Type:        "function",
			Name:        ToolNameExit,
			Description: "用于识别用户是否明确表达结束、退出当前对话的意图。仅当用户明确提出终止会话、结束交互、关闭对话时，才可调用此工具。正向触发关键词包含但不限于：中文类（退出、结束、关闭、不聊了、到此为止、终止对话、再见、拜拜、结束吧、挂了、退下、滚蛋、滚下去、停止对话、结束聊天、退了、结束会话）、英文类（exit、close、end、quit、stop）。注意：用户仅切换话题、暂停讨论、稍后再聊、吐槽抱怨但未明确要求结束对话时，严禁调用此工具。",
			Parameters: &JSONSchema{
				Type: "object",
				Properties: map[string]*JSONSchema{
					"reason": {Type: "string"},
				},
				Required: []string{"reason"},
			},
		},
	}

	sess := SessionConfig{
		Model:        model,
		Instructions: systemPrompt,
		Audio: &SessionAudio{
			Input: &SessionAudioInput{
				Format: &AudioFormat{Type: asrFormat, Rate: 16000},
			},
			Output: &SessionAudioOutput{
				Format: &AudioFormat{Type: ttsFormat, Rate: 24000},
				Voice:  speaker,
			},
		},
		Tools: tools,
	}

	ext := &ExtensionData{
		ASR: ASRPayload{Extra: make(map[string]interface{})},
		TTS: TTSPayload{Extra: make(map[string]interface{})},
		Dialog: DialogPayload{
			Location: &LocationInfo{
				Longitude:   114.305556,
				Latitude:    22.620000,
				City:        "深圳",
				Country:     "中国",
				Province:    "广东省",
				District:    "南山区",
				Town:        "深圳",
				CountryCode: "CN",
				Address:     "中国深圳市南山区",
			},
			Extra: map[string]interface{}{
				"audit_response":       "抱歉，这个问题我无法回答，你可以换个其他话题，我会尽力为你提供帮助。",
				"enable_loudness_norm": true,
				"enable_music":         false,
			},
		},
	}
	return sess, ext
}

// realTimeDialog Duplex 协议主流程：session.create -> 模式分发 -> 接收循环。
// 退出时统一发送 session.close（无论正常结束还是 Ctrl+C）。
func realTimeDialog(ctx context.Context, c *websocket.Conn, sessionID string) {
	defer func() {
		if err := sessionClose(c); err != nil {
			glog.Errorf("Failed to close session: %v", err)
		}
		glog.Info("realTimeDialog finished.")
	}()

	sess, ext := buildSessionConfig()
	if err := sessionCreate(c, sessionID, sess, ext); err != nil {
		glog.Errorf("realTimeDialog sessionCreate error: %v", err)
		return
	}

	if isAudioFileInput() {
		audioFileInputMod(ctx, c)
	} else {
		audioRealtimeMod(ctx, c)
	}
}

func audioFileInputMod(ctx context.Context, c *websocket.Conn) {
	defer func() {
		if r := recover(); r != nil {
			glog.Errorf("realTimeDialog recover: %v", r)
		}
		// 兜底保存（正常情况下已在 TTS ended 时保存）
		saveAudioToPCMFile("output.pcm")
	}()

	go func() {
		if err := sendAudioFromWav(ctx, c, *audioFilePath); err != nil {
			glog.Errorf("sendAudioFromWav error: %v", err)
		}

		for {
			select {
			case <-ctx.Done():
				return
			// 补20ms静音
			case <-time.After(time.Millisecond * 20):
				if err := sendSilenceAudio(ctx, c); err != nil {
					glog.Errorf("sendSilenceAudio error: %v", err)
				}
			}
		}
	}()

	realtimeAPIOutputAudio(ctx, c)
}

func audioRealtimeMod(ctx context.Context, c *websocket.Conn) {
	defer func() {
		_ = sessionClose(c)
		glog.Info("realTimeDialog finished.")
	}()

	// Greeting example: send a proactive streaming TTS greeting after session starts.
	// Customers can remove this block if they only need user-triggered responses.
	sid := uuid.New().String()
	_ = speechTextAppend(c, &SpeechTextBufferEvent{SpeechID: sid, Text: "你好，"})
	_ = speechTextAppend(c, &SpeechTextBufferEvent{SpeechID: sid, Text: "我是豆包"})
	_ = speechTextCommit(c, &SpeechTextBufferEvent{SpeechID: sid, Text: "很高兴为你服务。"})

	// 麦克风采集上行
	sendAudio(ctx, c)
	// 接收服务端返回数据
	realtimeAPIOutputAudio(ctx, c)
}

func main() {
	_ = flag.Set("logtostderr", "true")
	flag.Parse()
	if err := loadConfig(configPath); err != nil {
		glog.Errorf("load config error: %v", err)
		return
	}
	if isAudioFileInput() {
		asrFormat = DefaultPCM
	}

	if apikey == "" {
		glog.Error("apikey is required")
		return
	}

	if !isAudioFileInput() {
		if err := portaudio.Initialize(); err != nil {
			glog.Fatalf("portaudio initialize error: %v", err)
			return
		}
		defer func() {
			if err := portaudio.Terminate(); err != nil {
				glog.Errorf("Failed to terminate portaudio: %v", err)
			}
		}()
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	header := http.Header{}
	switch authType {
	case AuthTypeBearer:
		header.Set("Authorization", "Bearer "+apikey)
	default:
		header.Set("X-Api-Key", apikey)
	}
	conn, resp, err := websocket.DefaultDialer.DialContext(ctx, wsURL.String(), header)
	defer func() {
		if resp != nil {
			glog.Infof("Websocket dial response logid: %s", resp.Header.Get("X-Tt-Logid"))
		}
	}()

	if err != nil {
		glog.Errorf("Websocket dial error: %v", err)
		return
	}
	defer func() {
		glog.Infof("Websocket response dialogID: %s", dialogID)
		_ = conn.Close()
	}()

	realTimeDialog(ctx, conn, uuid.New().String())

	// 主流程结束后取消 ctx，等待麦克风/播放 goroutine 释放 PortAudio stream，
	// 再触发 defer 中的 portaudio.Terminate，避免 stream 未关闭导致 double free。
	cancel()
}
