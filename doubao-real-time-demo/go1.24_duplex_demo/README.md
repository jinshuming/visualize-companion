# Realtime Duplex Dialog Demo

This demo shows how to connect to the realtime duplex dialogue WebSocket API with a JSON event protocol.

## Requirements

- Go 1.24 or later
- PortAudio installed locally if you use microphone input or audio playback
- A valid API key

## Configuration

Edit `config.toml` before running:

- `auth.api_key`: realtime dialogue API key.
- `search.api_key`: Volcano Engine Search API key used by the `volc_search` function-call example.
- `session.asr_format`: optional. Empty means the code default is used.
- `session.tts_format`: optional. Empty means the code default is used.

The demo connects to:

```text
wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue
```

## Run

Microphone input mode:

```bash
go run .
```

Audio file input mode:

```bash
go run . -audio ./whoareyou.wav
```

When running with `-audio`, the received audio is saved as `output.pcm`.

## Main Flow

1. Connect to the WebSocket endpoint with the auth settings from `config.toml`.
2. Send `session.create` with model, instructions, audio formats, and voice.
3. Send audio input through `input_audio_buffer.append`.
4. Receive ASR, text, audio, function-call, and usage events from the server.
5. Send `session.close` before exiting.

## Key Files

- `main.go`: startup, configuration, WebSocket connection, and mode dispatch.
- `events.go`: JSON event types and payload structures.
- `client_request.go`: client-to-server event helpers.
- `server_response.go`: server event dispatch and audio playback.
- `fc.go`: optional function-tool schema definitions.
