package main

// events.go defines the JSON event types and payloads used by the realtime demo.
// Service-specific options can be passed through session.create/session.update extension fields.

// ============== 事件 type 常量 ==============

const (
	// ---- 上行 client events ----
	TypeSessionCreate                     = "session.create"
	TypeSessionUpdate                     = "session.update"
	TypeSessionClose                      = "session.close"
	TypeInputAudioBufferAppend            = "input_audio_buffer.append"
	TypeInputAudioBufferCommit            = "input_audio_buffer.commit"
	TypeSpeechTextBufferAppend            = "speech_text_buffer.append"
	TypeSpeechTextBufferCommit            = "speech_text_buffer.commit"
	TypeSpeechTextBufferReplacementAppend = "speech_text_buffer.replacement.append"
	TypeSpeechTextBufferReplacementCommit = "speech_text_buffer.replacement.commit"
	TypeConversationItemCreate            = "conversation.item.create"
	TypeConversationItemUpdate            = "conversation.item.update"
	TypeConversationItemRetrieve          = "conversation.item.retrieve"
	TypeConversationItemDelete            = "conversation.item.delete"
	TypeResponseCancel                    = "response.cancel"

	// ---- 下行 server events ----
	TypeSessionCreated = "session.created"
	TypeSessionUpdated = "session.updated"
	TypeSessionClosed  = "session.closed"

	TypeInputAudioBufferCommitted = "input_audio_buffer.committed"

	TypeTranscriptionStarted   = "conversation.item.input_audio_transcription.started"
	TypeTranscriptionDelta     = "conversation.item.input_audio_transcription.delta"
	TypeTranscriptionCompleted = "conversation.item.input_audio_transcription.completed"
	TypeTranscriptionFailed    = "conversation.item.input_audio_transcription.failed"

	TypeResponseOutputTextDelta = "response.output_text.delta"
	TypeResponseOutputTextDone  = "response.output_text.done"

	TypeResponseOutputAudioStarted = "response.output_audio.started"
	TypeResponseOutputAudioDelta   = "response.output_audio.delta"
	TypeResponseOutputAudioDone    = "response.output_audio.done"

	TypeConversationItemAdded     = "conversation.item.added"
	TypeConversationItemRetrieved = "conversation.item.retrieved"
	TypeConversationItemUpdated   = "conversation.item.updated"
	TypeConversationItemDeleted   = "conversation.item.deleted"

	TypeResponseFunctionCallArgumentsDone = "response.function_call_arguments.done"

	TypeResponseCanceled = "response.canceled"
	TypeResponseDone     = "response.done"
	TypeError            = "error"
)

// ============== 通用 ==============

// baseEvent 仅用于先解析出 type 字段，再决定如何二次反序列化。
type baseEvent struct {
	Type    string `json:"type"`
	EventID string `json:"event_id,omitempty"`
}

// ============== session.update ==============

type SessionUpdateEvent struct {
	Type      string         `json:"type"`
	EventID   string         `json:"event_id,omitempty"`
	Session   SessionConfig  `json:"session"`
	Extension *ExtensionData `json:"extension,omitempty"`
}

type SessionConfig struct {
	ID           string         `json:"id,omitempty"`
	Model        string         `json:"model,omitempty"`
	Instructions string         `json:"instructions,omitempty"`
	Audio        *SessionAudio  `json:"audio,omitempty"`
	Tools        []FunctionTool `json:"tools,omitempty"`
}

type SessionAudio struct {
	Input  *SessionAudioInput  `json:"input,omitempty"`
	Output *SessionAudioOutput `json:"output,omitempty"`
}

type SessionAudioInput struct {
	Format *AudioFormat `json:"format,omitempty"`
}

type AudioFormat struct {
	Type string `json:"type"`
	Rate int    `json:"rate"`
}

type SessionAudioOutput struct {
	Format   *AudioFormat `json:"format,omitempty"`
	Speed    int          `json:"speed,omitempty"`
	Loudness int          `json:"loudness,omitempty"`
	Voice    string       `json:"voice,omitempty"`
}

type ExtensionData struct {
	ASR    ASRPayload    `json:"asr"`
	TTS    TTSPayload    `json:"tts"`
	Dialog DialogPayload `json:"dialog"`
}

type ASRPayload struct {
	Extra map[string]interface{} `json:"extra,omitempty"`
}

type TTSPayload struct {
	Extra map[string]interface{} `json:"extra,omitempty"`
}

type DialogPayload struct {
	Location *LocationInfo          `json:"location,omitempty"`
	Extra    map[string]interface{} `json:"extra"`
}

type LocationInfo struct {
	Longitude   float64 `json:"longitude"`
	Latitude    float64 `json:"latitude"`
	City        string  `json:"city"`
	Country     string  `json:"country"`
	Province    string  `json:"province"`
	District    string  `json:"district"`
	Town        string  `json:"town"`
	CountryCode string  `json:"country_code"`
	Address     string  `json:"address"`
}

// ============== input_audio_buffer ==============

// InputAudioBufferAppendEvent 上行：发送音频分片（base64）。
type InputAudioBufferAppendEvent struct {
	Type    string `json:"type"`
	EventID string `json:"event_id,omitempty"`
	Audio   string `json:"audio"` // base64
}

// SimpleEvent 仅有 type/event_id 的事件（input_audio_buffer.commit / session.close / response.cancel）。
type SimpleEvent struct {
	Type    string `json:"type"`
	EventID string `json:"event_id,omitempty"`
}

// ============== speech_text_buffer（流式打招呼/干预回复） ==============

// SpeechTextBufferEvent 上行：流式打招呼/干预回复（append/commit/replacement）。
type SpeechTextBufferEvent struct {
	Type      string `json:"type"`
	EventID   string `json:"event_id,omitempty"`
	SpeechID  string `json:"speech_id,omitempty"`
	Text      string `json:"text,omitempty"`
	TTSPrompt string `json:"tts_prompt,omitempty"`
}

// ============== conversation.item ==============

type Role string

const (
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
	RoleTool      Role = "tool"
)

// ConversationContent message item 的内容块。
type ConversationContent struct {
	Type string `json:"type"` // input_text / text
	Text string `json:"text"`
}

// ConversationItemDef 一条会话 item（message 结构）。
type ConversationItemDef struct {
	ID      string                `json:"id,omitempty"`
	Type    string                `json:"type"` // message
	Role    Role                  `json:"role,omitempty"`
	CallID  string                `json:"call_id,omitempty"` // function_call_output 回传时携带
	Status  string                `json:"status,omitempty"`
	Content []ConversationContent `json:"content,omitempty"`
}

// ConversationItemCreateEvent 上行：conversation.item.create。
type ConversationItemCreateEvent struct {
	Type    string              `json:"type"`
	EventID string              `json:"event_id,omitempty"`
	Item    ConversationItemDef `json:"item"`
}

// ConversationItemsCreateEvent 上行：conversation.item.create / update（items 数组形式）。
type ConversationItemsCreateEvent struct {
	Type    string                `json:"type"`
	EventID string                `json:"event_id,omitempty"`
	Items   []ConversationItemDef `json:"items"`
}

// ConversationItemRefEvent 上行：retrieve / delete。
// item_id 注释掉、统一用 items 数组承载（对齐当前服务端协议）。
type ConversationItemRefEvent struct {
	Type    string                `json:"type"`
	EventID string                `json:"event_id,omitempty"`
	Items   []ConversationItemDef `json:"items"`
}

// ============== 下行事件结构体 ==============

// SessionCreatedEvent 下行：session.created / session.updated。
type SessionCreatedEvent struct {
	Type    string `json:"type"`
	EventID string `json:"event_id"`
	Session struct {
		ID string `json:"id"`
	} `json:"session"`
}

// TranscriptionEvent 下行：ASR started/delta/completed。
type TranscriptionEvent struct {
	Type       string `json:"type"`
	EventID    string `json:"event_id"`
	ItemID     string `json:"item_id"`
	Delta      string `json:"delta"`
	Transcript string `json:"transcript"`
}

// ResponseTextEvent 下行：response.output_text.delta/done。
type ResponseTextEvent struct {
	Type       string `json:"type"`
	EventID    string `json:"event_id"`
	QuestionID string `json:"question_id"`
	ResponseID string `json:"response_id"`
	Delta      string `json:"delta"`
	Text       string `json:"text"`
}

// ResponseAudioEvent 下行：response.output_audio.start/delta/done。
type ResponseAudioEvent struct {
	Type       string `json:"type"`
	EventID    string `json:"event_id"`
	QuestionID string `json:"question_id"`
	ResponseID string `json:"response_id"`
	TTSType    string `json:"tts_type"`
	Delta      string `json:"delta"` // base64 音频
	StatusCode string `json:"status_code"`
}

// FunctionCallItem 下行 response.function_call_arguments.done 中的单个函数调用。
type FunctionCallItem struct {
	CallID    string `json:"call_id"`
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// FunctionCallArgumentsDoneEvent 下行：response.function_call_arguments.done。
// 服务端以 items 数组下发一个或多个函数调用。
type FunctionCallArgumentsDoneEvent struct {
	Type    string             `json:"type"`
	EventID string             `json:"event_id"`
	Items   []FunctionCallItem `json:"items"`
}

// ErrorEvent 下行：error。
type ErrorEvent struct {
	Type  string `json:"type"`
	Error struct {
		Type    string `json:"type"`
		Code    string `json:"code"`
		Message string `json:"message"`
		Param   any    `json:"param"`
		EventID string `json:"event_id"`
	} `json:"error"`
}

// ConversationItemEvent 下行：conversation.item.added / retrieved / updated / deleted。
// 服务端以 items 数组下发；added/retrieved/updated 的 item 含真实 id，deleted 同样在 items 中带 id。
type ConversationItemEvent struct {
	Type    string                `json:"type"`
	EventID string                `json:"event_id"`
	Items   []ConversationItemDef `json:"items"`
}
