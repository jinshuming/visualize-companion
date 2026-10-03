package main

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/gorilla/websocket"
)

// runProbe checks the key and protocol without the app: it sends a wav in real time (20 ms frames, then
// silence), prints the transcript and reply, the latency from end of speech to first reply audio,
// and saves the reply as probe-reply.wav.
func runProbe(key, path string) {
	pcm := readWavPCM(path)
	up, err := dialUpstream(key)
	if err != nil {
		log.Fatalf("dial: %v", err)
	}
	defer up.Close()

	send := func(v any) {
		b, _ := json.Marshal(v)
		if err := up.WriteMessage(websocket.TextMessage, b); err != nil {
			log.Fatalf("send: %v", err)
		}
	}
	if *sessionFile != "" {
		// Try an exact session.create payload, e.g. the one the app sends.
		b, err := os.ReadFile(*sessionFile)
		if err != nil {
			log.Fatal(err)
		}
		if err := up.WriteMessage(websocket.TextMessage, b); err != nil {
			log.Fatalf("send: %v", err)
		}
	} else {
		send(map[string]any{
			"type": "session.create",
			"session": map[string]any{
				"model":        "1.2.6.1",
				"instructions": "You are a warm, friendly companion on a voice call. Keep replies short.",
				"audio": map[string]any{
					"input":  map[string]any{"format": map[string]any{"type": "pcm", "rate": 16000}},
					"output": map[string]any{"format": map[string]any{"type": "pcm_s16le", "rate": 24000}, "voice": "zh_female_vv_jupiter_bigtts"},
				},
			},
		})
	}

	events := make(chan map[string]any, 256)
	go func() {
		defer close(events)
		for {
			_, msg, err := up.ReadMessage()
			if err != nil {
				return
			}
			var e map[string]any
			if json.Unmarshal(msg, &e) == nil {
				events <- e
			}
		}
	}()

	waitFor := func(t string) {
		for e := range events {
			if e["type"] == t {
				return
			}
			if e["type"] == "error" {
				log.Fatalf("error: %v", e)
			}
		}
		log.Fatalf("connection closed before %s", t)
	}
	waitFor("session.created")
	log.Printf("session created")

	const frame = 640 // 20 ms at 16 kHz int16
	silence := make([]byte, frame)
	speechEnd := time.Time{}
	var firstAudio time.Duration
	var reply []byte
	start := time.Now()
	tick := time.NewTicker(20 * time.Millisecond)
	defer tick.Stop()

	for n := 0; ; n++ {
		chunk := silence
		if off := n * frame; off < len(pcm) {
			chunk = pcm[off:min(off+frame, len(pcm))]
		} else if speechEnd.IsZero() {
			speechEnd = time.Now()
		}
		send(map[string]any{"type": "input_audio_buffer.append", "audio": base64.StdEncoding.EncodeToString(chunk)})

	drain:
		for {
			select {
			case e, ok := <-events:
				if !ok {
					log.Fatal("connection closed")
				}
				switch e["type"] {
				case "conversation.item.input_audio_transcription.completed":
					log.Printf("heard: %v", e["text"])
				case "response.function_call_arguments.done":
					// Answer every call so the model can go on to its spoken reply.
					var results []map[string]any
					items, _ := e["items"].([]any)
					for _, it := range items {
						call, _ := it.(map[string]any)
						log.Printf("tool call: %v(%v)", call["name"], call["arguments"])
						results = append(results, map[string]any{"call_id": call["call_id"], "role": "tool",
							"content": []map[string]any{{"type": "input_text", "text": `{"ok":true}`}}})
					}
					send(map[string]any{"type": "conversation.item.create", "items": results})
				case "response.output_text.done":
					log.Printf("reply: %v", e["text"])
				case "response.output_audio.delta":
					if firstAudio == 0 && !speechEnd.IsZero() {
						firstAudio = time.Since(speechEnd)
						log.Printf("first reply audio %d ms after the wav ended", firstAudio.Milliseconds())
					}
					b, _ := base64.StdEncoding.DecodeString(e["delta"].(string))
					reply = append(reply, b...)
				case "response.output_audio.done":
					if code, ok := e["status_code"]; ok {
						log.Printf("audio done, status_code=%v (20000002 = user wants to end the call)", code)
					}
					if len(reply) > 0 {
						writeWav("probe-reply.wav", reply, 24000)
						log.Printf("saved probe-reply.wav (%.1f s)", float64(len(reply))/48000)
						send(map[string]any{"type": "session.close"})
						waitFor("session.closed")
						return
					}
				case "error":
					log.Fatalf("error: %v", e)
				}
			default:
				break drain
			}
		}
		if time.Since(start) > 40*time.Second {
			log.Fatal("no reply within 40 s")
		}
		<-tick.C
	}
}

// readWavPCM returns the data chunk of a 16 kHz mono int16 wav.
func readWavPCM(path string) []byte {
	b, err := os.ReadFile(path)
	if err != nil || len(b) < 12 {
		log.Fatalf("read %s: %v", path, err)
	}
	for i := 12; i+8 <= len(b); {
		id, size := string(b[i:i+4]), int(binary.LittleEndian.Uint32(b[i+4:i+8]))
		if id == "fmt " {
			ch, rate := binary.LittleEndian.Uint16(b[i+10:]), binary.LittleEndian.Uint32(b[i+12:])
			if ch != 1 || rate != 16000 {
				log.Fatalf("%s must be 16 kHz mono (got %d Hz, %d ch)", path, rate, ch)
			}
		}
		if id == "data" {
			return b[i+8 : min(i+8+size, len(b))]
		}
		i += 8 + size + size%2
	}
	log.Fatalf("%s has no data chunk", path)
	return nil
}

func writeWav(path string, pcm []byte, rate uint32) {
	h := make([]byte, 44)
	copy(h, "RIFF")
	binary.LittleEndian.PutUint32(h[4:], uint32(36+len(pcm)))
	copy(h[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(h[16:], 16)
	binary.LittleEndian.PutUint16(h[20:], 1)
	binary.LittleEndian.PutUint16(h[22:], 1)
	binary.LittleEndian.PutUint32(h[24:], rate)
	binary.LittleEndian.PutUint32(h[28:], rate*2)
	binary.LittleEndian.PutUint16(h[32:], 2)
	binary.LittleEndian.PutUint16(h[34:], 16)
	copy(h[36:], "data")
	binary.LittleEndian.PutUint32(h[40:], uint32(len(pcm)))
	os.WriteFile(path, append(h, pcm...), 0o644)
}
