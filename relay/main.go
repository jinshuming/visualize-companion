// Command relay is the development backend for real-time voice calls (PRODUCT.md R9a).
//
// The app opens a WebSocket to this relay; the relay opens one to Doubao Seeduplex 3.0 with the API key
// (which never ships in the app) and passes JSON text frames through unchanged in both directions.
// When the app disconnects, the relay closes the upstream session gracefully (session.close, then close).
//
//	go run .                    # serve on :8787, path /realtime
//	go run . -probe input.wav   # send a 16 kHz mono wav through Doubao and report latency
//	go run . -probe input.wav -session s.json   # same, with an exact session.create payload
package main

import (
	"bufio"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const upstreamURL = "wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue"

var (
	addr  = flag.String("addr", ":8787", "listen address")
	probe = flag.String("probe", "", "wav file (16 kHz mono int16) to send once through Doubao, then exit")
	quiet = flag.Bool("quiet", false, "do not log event types")

	sessionFile = flag.String("session", "", "with -probe: JSON file holding the session.create event to send")
)

func main() {
	flag.Parse()
	loadEnv(".env")
	key := os.Getenv("VOLC_API_KEY")
	if key == "" {
		log.Fatal("VOLC_API_KEY is not set (put it in relay/.env)")
	}
	if *probe != "" {
		runProbe(key, *probe)
		return
	}

	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	http.HandleFunc("/realtime", func(w http.ResponseWriter, r *http.Request) {
		client, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		bridge(client, key, r.RemoteAddr)
	})
	http.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok\n")) })

	_, port, _ := net.SplitHostPort(*addr)
	log.Printf("relay listening on %s", *addr)
	for _, ip := range lanIPs() {
		log.Printf("  app setting → ws://%s:%s/realtime", ip, port)
	}
	log.Fatal(http.ListenAndServe(*addr, nil))
}

// dialUpstream opens the Doubao socket with the key. The connect id ties our logs to the server's X-Tt-Logid.
func dialUpstream(key string) (*websocket.Conn, error) {
	h := http.Header{}
	h.Set("X-Api-Key", key)
	h.Set("X-Api-Connect-Id", uuid.NewString())
	conn, resp, err := websocket.DefaultDialer.Dial(upstreamURL, h)
	if resp != nil {
		log.Printf("upstream logid=%s", resp.Header.Get("X-Tt-Logid"))
		if err != nil && resp.Body != nil {
			// A refused handshake carries Doubao's error event as the body, e.g. a service not enabled.
			if body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048)); len(body) > 0 {
				return nil, &refusedError{status: resp.StatusCode, body: body}
			}
		}
	}
	return conn, err
}

type refusedError struct {
	status int
	body   []byte
}

func (e *refusedError) Error() string { return fmt.Sprintf("HTTP %d %s", e.status, e.body) }

// bridge pumps text frames both ways until either side closes.
func bridge(client *websocket.Conn, key, who string) {
	defer client.Close()
	up, err := dialUpstream(key)
	if err != nil {
		log.Printf("[%s] upstream dial failed: %v", who, err)
		msg := []byte(`{"type":"error","error":{"message":"relay could not reach Doubao"}}`)
		if r, ok := err.(*refusedError); ok {
			msg = r.body
		}
		client.WriteMessage(websocket.TextMessage, msg)
		return
	}
	defer up.Close()
	log.Printf("[%s] call started", who)

	var upMu sync.Mutex // gorilla allows one concurrent writer per connection
	writeUp := func(msg []byte) error {
		upMu.Lock()
		defer upMu.Unlock()
		return up.WriteMessage(websocket.TextMessage, msg)
	}

	closed := make(chan struct{}) // closed when upstream reports session.closed or drops
	go func() {
		defer close(closed)
		for {
			_, msg, err := up.ReadMessage()
			if err != nil {
				return
			}
			t := eventType(msg)
			logEvent(who, "↓", t)
			if client.WriteMessage(websocket.TextMessage, msg) != nil || t == "session.closed" {
				return
			}
		}
	}()

	sentClose := false
	for {
		_, msg, err := client.ReadMessage()
		if err != nil {
			break
		}
		t := eventType(msg)
		if t != "input_audio_buffer.append" {
			logEvent(who, "↑", t)
		}
		if t == "session.close" {
			sentClose = true
		}
		if writeUp(msg) != nil {
			break
		}
	}
	// The app hung up (or dropped). Close the session properly so Doubao does not report ContextCanceled.
	if !sentClose {
		writeUp([]byte(`{"type":"session.close"}`))
	}
	select {
	case <-closed:
	case <-time.After(3 * time.Second):
	}
	log.Printf("[%s] call ended", who)
}

// eventType reads the "type" field without decoding the JSON. Base64 audio has no quotes, so the first
// "type" key is the event's own wherever the encoder put it.
func eventType(msg []byte) string {
	s := string(msg)
	i := strings.Index(s, `"type"`)
	if i < 0 {
		return "?"
	}
	s = s[i+6:]
	a := strings.Index(s, `"`)
	if a < 0 {
		return "?"
	}
	s = s[a+1:]
	if b := strings.Index(s, `"`); b >= 0 {
		return s[:b]
	}
	return "?"
}

var lastDelta sync.Map // who → time of last logged audio delta, to keep the log readable

func logEvent(who, dir, t string) {
	if *quiet {
		return
	}
	if t == "response.output_audio.delta" || t == "response.output_text.delta" || t == "conversation.item.input_audio_transcription.delta" {
		k := who + t
		if v, ok := lastDelta.Load(k); ok && time.Since(v.(time.Time)) < time.Second {
			return
		}
		lastDelta.Store(k, time.Now())
	}
	log.Printf("[%s] %s %s", who, dir, t)
}

func loadEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if k, v, ok := strings.Cut(line, "="); ok && !strings.HasPrefix(line, "#") && os.Getenv(k) == "" {
			os.Setenv(strings.TrimSpace(k), strings.TrimSpace(v))
		}
	}
}

func lanIPs() []string {
	var out []string
	addrs, _ := net.InterfaceAddrs()
	for _, a := range addrs {
		if n, ok := a.(*net.IPNet); ok && !n.IP.IsLoopback() && n.IP.To4() != nil {
			out = append(out, n.IP.String())
		}
	}
	return out
}
