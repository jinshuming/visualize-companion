# Visualize Companion

An iOS-native digital-human companion app. Chat with a 3D character that lives in a room, orbit around it 360°, or call it by voice. Built with SwiftUI and iOS 26 Liquid Glass; characters are [PINOC](https://viggle.ai/pinoc/app) Gaussian-splat avatars rendered by Viggle's `@viggle/splat-engine` inside a `WKWebView`.

Interaction and visual design are inspired by Replika-style companion apps. This is an independent project and is not affiliated with Replika.

> **Product requirements, principles and status live in [`PRODUCT.md`](PRODUCT.md).** Read it before contributing (human or AI agent).

## Features
- **Chat over a half-body avatar** — character on the left, messages on the right, frosted glass controls.
- **360° space view** — full-body character in a 3D room; drag to orbit, pinch to zoom, double-tap to reset; three room themes.
- **Voice call** — hands-free loop: listen → reply → speak, with mute, loudspeaker and hang-up.
- **Onboarding** — gender, a few questions and a reference photo create your companion (UI mock; real generation is planned).
- **English / 中文** — English by default, switch in Settings. Replies and speech follow the language.
- Gestures (wave / nod / clap / cheer), intimacy levels, per-companion chat history.
- Calm pastel design system (no saturated colour), tokens in [`DesignTokens.swift`](App/Veplika/Views/DesignTokens.swift).

## Build
Requires Xcode 26+ (iOS 26 SDK), Node 20+, [XcodeGen](https://github.com/yonaskolb/XcodeGen).

```bash
brew install xcodegen
./scripts/sync_web.sh                 # bundle the splat stage + copy characters/motions into the app
cd App && xcodegen generate && open Veplika.xcodeproj
```
Run on an iOS 26 simulator or a device (splat rendering is GPU-heavy, so test on device for performance). Launch with the `-seedDemo` argument in a debug build to preview a populated chat.

## Layout
| Path | What |
|---|---|
| `Resources/` | PINOC characters (`.vsplat`) and motion clips (`.glb`) |
| `web/` | Stage page: PlayCanvas + splat-engine, room, orbit camera (bundled with esbuild, worker inlined) |
| `App/Veplika/` | Swift sources: `Models`, `Services`, `Stage` (WKWebView bridge), `Views` |
| `scripts/sync_web.sh` | Builds the stage and copies assets into the app bundle folder |

## Chat engine
Replies currently come from a local persona-flavoured mock (`MockChatEngine`). To use a real model, implement the `ChatEngine` protocol and pass it to `ChatStore(engine:)`.

## Credits
- Characters and motions: PINOC by Viggle.
- Rendering: [`@viggle/splat-engine`](https://www.npmjs.com/package/@viggle/splat-engine) (MIT) on [PlayCanvas](https://playcanvas.com).
