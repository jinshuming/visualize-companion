# Visualize Companion — Product Requirements (living document)

> **Owner:** Shuming Jin (GitHub `jinshuming`) · **Created:** 2026-10-01 · **Last updated:** 2026-10-03
>
> This file is the source of truth for what the owner wants and why. Every agent (human or AI) must read it
> **before starting work** and keep it current. If this file and a conversation disagree, the newest owner
> instruction wins, and this file must be updated to match in the same change.

---

## 0. Rules for agents

1. **Read this whole file first.** Then read the code you will touch.
2. **Owner requirements are binding.** Items tagged **[Owner]** are the owner's own words or direct decisions.
   Do not reinterpret, shrink or "simplify" them to ship faster. If something can't be done today, build the
   hook, record the gap here, and say so plainly.
3. **Keep this file alive.** When the owner states a new requirement, principle, preference or decision, add it
   here in the same change (Requirements + Decision log, with the date). Do not wait to be asked.
4. **Be honest about status.** Use exactly these labels and never present a mock as real:
   `Done` (works for real) · `Mock` (UI/behaviour is faked) · `Planned` (designed, not built) ·
   `Blocked` (needs a decision, credential or capability) · `Unverified` (believed, not tested).
5. **Do not lower the quality bar.** The product goal is the *highest-quality* character, motion, expression and
   voice available. Prefer "not yet" over "good enough" — and write the gap down.
6. **Real device first.** Rendering and performance claims must be checked on the owner's iPhone, not only the
   simulator (the simulator uses the Mac GPU and hid a character-not-rendering bug).
7. **Outward-facing actions need the owner's explicit OK, per action:** pushing to GitHub, publishing assets,
   uploading to TestFlight/App Store Connect, spending PINOC credits, using the company Apple team. Approval for
   one does not carry over to the next.
8. **Respect the design system** (section 6), especially the *no saturated colour* rule. `DS.audit()` must stay clean.
9. **Bilingual by default.** Every user-visible string goes through `L.t(en, zh)`; English is the default language.
10. **Privacy.** The user's reference photo stays on the device unless the owner approves an upload flow and the UI
    says so.

---

## 1. Vision

A native iOS app where each user gets a **digital-human partner** they can chat with, look at in a real 3D space,
and talk to by voice — an immersive, premium, emotionally believable companion. Interaction patterns follow
Replika-style apps; the visual language is iOS 26 **Liquid Glass**, calm and airy.

Core experience loop: **onboarding creates "your" companion → chat over a half-body avatar → orbit the full body
in a room → voice call with face close-up.**

---

## 2. Principles (the owner's values)

| # | Principle | Source |
|---|---|---|
| P1 | **Highest-quality character.** Use the best Gaussian-splat human the pipeline can produce. | [Owner] 2026-10-01 |
| P2 | **Alive, not a statue.** Rich body-motion control and controllable facial expression. | [Owner] 2026-10-01 |
| P3 | **Behaviour follows the conversation.** Body language and facial expression change with what is said and felt. | [Owner] 2026-10-01 |
| P4 | **The most emotionally nuanced voice (TTS) available.** | [Owner] 2026-10-01 |
| P5 | **Immersive, premium, spatial.** Real 3D room, 360° orbit, iOS 26 Liquid Glass. | [Owner] earlier in project |
| P6 | **Calm colour.** Reduce saturated colour. When colour appears, it is a translucent, light pastel. | [Owner] 2026-10-01 |
| P7 | **Bilingual, English first.** English default, switchable to 中文. | [Owner] 2026-10-01 |
| P8 | **Honesty.** Mock vs real is always labelled; no fake capability claims. | Working agreement |
| P9 | **Real-device truth.** Performance and rendering verified on a physical iPhone. | Working agreement |

---

## 3. Requirements

### R1 — New-user onboarding creates the partner **[Owner]**
> New users choose their own gender, answer a few questions, and upload one reference photo. The system generates
> their partner's appearance from that input. *(Mock the UI first.)*

- **Status: Mock.** Flow built: welcome → 5 questions (your gender, who you'd like to meet, personality, look,
  what you'll do together) → reference photo (system photo picker; a sample-photo shortcut exists for testing) →
  animated "generating" screen → reveal with the live 3D character, rename field, "Another look" → start chatting.
- The "generation" is a stand-in: `OnboardingStore.rankCandidates()` ranks the **existing 7 characters** against the
  answers. The photo is saved locally (`reference.jpg`) and not used.
- **Real implementation (Planned):** photo → PINOC `generate_character` (1–5 photos, `refine` on) → `.vsplat`.
  See section 4. Needs: owner approval for credits, an upload path (PINOC `prepare_upload`), progress UI driven by
  real task state, failure/retry UX, and a consent line about the photo leaving the device.
- Character library is thin on male options (1). Real generation removes this limit.

### R1a — Music taste and visual-style preference in onboarding **[Owner]** (2026-10-02)
> When a new user enters the app, let them choose the music genres they like, and make the whole selection process
> lighter and more fun. At the end, add a choice for the partner's visual style: realistic, CG stylized, cartoon.

- **Status: Mock, Unverified** (written without a build; needs an Xcode build and a run on the owner's iPhone).
- Flow is now: welcome → 5 questions → **music** → photo → **visual style (last choice)** → generating → reveal.
- **Music step:** multi-select sticker wall of 12 genres (pop, K-pop/J-pop, rock, electronic, hip-hop/R&B, lo-fi,
  jazz/soul, classical, folk/acoustic, indie, country, anime & game OST). Playful touches: tiles bounce, tilt like
  stickers and pop a floating note; a pastel equalizer "vibe meter" dances harder as more genres are picked; a
  reaction line answers each pick; "Shuffle for me" picks three at random; haptics on select. At least one required.
- **Visual-style step:** Realistic / Stylized CG / Cartoon cards, previewed with matching library characters.
  The library has **no stylized-CG character yet**, so that card shows a symbol and the matcher falls back to traits.
  Current mapping: `realistic` = Chloe, Jolene, Sam; `cartoon` = the chibi characters.
- The mock matcher ranks visual-style match first, then personality/look/activity/**music** overlap (genre tags in
  `Companion.tagTable`). Choices are saved to `UserDefaults` (`pref.musicGenres`, `pref.visualStyle`) for the future
  chat brain (R10) and real generation (R1).
- **Planned:** pass visual style to PINOC generation (prompt/style control — capability not yet verified), let music
  taste flavour persona and conversation topics, add dedicated preview art for each style (incl. a stylized-CG character).

### R2 — Highest-quality Gaussian character **[Owner]**
> I need the highest-quality character (the highest-quality Gaussian human).

- **Status: Blocked on a quality definition + Unverified.** Current assets are PINOC `optimized` tier,
  131,072 splats each (the `original` tier is larger and archival). Source: PINOC library + three characters the
  owner supplied.
- To do: establish what "highest quality" means measurably (splat count, texture fidelity, face detail, refine pass,
  multi-photo input) and test the quality/performance frontier **on device** (see perf data in section 4).
- Rule: never ship a lower tier silently to hit frame rate; surface the trade-off to the owner.

### R3 — Rich body-motion control **[Owner]**
- **Status: Partial.** 5 clips wired (idle, wave, nod, clap, cheer) from PINOC's free library (54 clips).
  Per-clip yaw correction is needed because some clips bake a root rotation. Clips hard-cut (no crossfade) for that reason.
- **Planned:** a gesture vocabulary driven by conversation (R5); layered animation (upper body gestures over idle,
  engine supports bone-masked layers); text-to-motion for gaps (`generate_motion`, 1 credit/second, owner approval);
  proper blending that handles yaw.

### R4 — Controllable facial expression **[Owner]**
> Expressions can be controlled.

- **Status: Partially verified (2026-10-03).** The engine has **no blendshape, viseme or expression API**
  (`@viggle/splat-engine` 0.1.1), but the characters themselves are skinned to the **441-bone full-body + facial rig**.
  Measured on Chloe (47,343 splats, 4 bone influences each): face and neck splats carry weights on `FACIAL_*` bones
  (e.g. jawline splats mix `head` ≈0.6 with `FACIAL_L_12IPV_Jawline3/6`, `CheekL4`; also `FACIAL_C_Jaw`, `ChinS4`,
  `NeckA*`, `LowerLipRotation`). The MetaHuman motion GLBs carry tracks for all 882 channels, facial included.
- **So driving expression through facial bones is feasible in principle.** Not yet done: pose those bones from code
  (jaw open, brows, lids, mouth corners), define an expression set (neutral, smile, sad, surprised, …) with intensity,
  and check that the splat face deforms believably (candy-wrapper/stretch artifacts are the risk).
- **Next step:** the expression experiment above, on one realistic and one chibi character. Record results here.

### R5 — Conversation-driven body language and expression **[Owner]**
> Based on the conversation, the character shows different body movements and expressions.

- **Status: Mock.** The mock chat engine maps keyword intents to 4 gestures (nod / wave / cheer / clap).
- **Planned:** the chat model returns structured output per reply, e.g.
  `{ text, emotion, intensity, gesture, gaze }`, which drives R3/R4 and the TTS style (R6). Include idle behaviours
  (breathing, blinking, gaze shifts, listening posture) so she is never frozen while the user speaks.

- **Idle blinking — Done in simulator, Unverified on device (2026-10-03).** Owner asked for human-like timed blinking.
  Every character now blinks on a natural schedule: ~15/min with random 2–6.5 s gaps, 12 % double blinks, close ≈75 ms,
  hold ≈35 ms, open ≈140 ms (`stage.js`: `blinkTick`, `setBlinking(on)`).
  - **How:** the eyeball Gaussians (those weighted to `FACIAL_L/R_EyeParallel`, ~1.2 k splats) are recoloured at runtime —
    an "upper lid" sweeps down in the local skin colour with a thin lash line on its edge, then reverses. The colour
    texture is updated by writing only the eye texels into an in-memory copy and uploading it (≈0.2 ms/frame in the
    simulator; a full `updateColorData` cost ≈1.7 ms).
  - **Why not eyelid bones:** tested on Chloe — rotating `EyelidUpper/Lower*` bones about z narrows the eye at ~35° and
    smears it at larger angles (the lids carry few splats and cannot cover the eyeball); x/y give distortion; scaling the eye
    bones does nothing visible; on chibi characters (Mina, Neko) the painted eyes did not respond at all.
  - **Looks right on:** Chloe, Jolene, Mina, Neko (inspected). **Not inspected:** Sam, Leo, Riko.
  - **Known limits:** the closed eye is a skin-coloured patch with a lash line, not real eyelid geometry; faint iris ghosting
    and slightly pale tone can remain; it recolours the rest-pose eye region so extreme head poses are untested; it only
    affects the currently rendered LOD (all current characters are single-LOD).
  - **Next:** measure cost and frame rate on the owner's iPhone; eyelid shape/lash polish; link blink rate to emotion
    (slower when calm, faster when nervous), gaze shifts and micro-saccades.

### R6 — The most emotionally nuanced TTS **[Owner]**
> Voice emotion should be as subtle as possible.

- **Status: Below the bar.** Today: iOS `AVSpeechSynthesizer` (functional, not emotional). Speech-to-text is
  Apple `SFSpeechRecognizer`.
- **To evaluate (all Unverified; none integrated):** ElevenLabs (expressive v3 models), OpenAI `gpt-4o-mini-tts`
  (steerable by instructions), Hume Octave (emotion-aware), and the TapTap Maker MCP voice tools available in the dev
  environment (`text_to_dialogue`, `audition_voices_for_character`, `confirm_character_voice`).
- **Evaluation criteria:** fine emotion control (not just presets), streaming latency for calls, Chinese **and**
  English quality, voice consistency per character, cost per minute, licensing for companion use, on-device vs cloud.
- **Also needed:** lip-sync (none today). Options: viseme timings from the TTS provider, or audio-energy-driven jaw.

### R7 — Chat over a half-body avatar **[Owner]**
- **Status: Done.** Character bust on the left third, messages on the right, frosted controls. Tokens sampled from
  the reference screenshots. (Bubbles are now pastel per P6.)

### R8 — 360° space view **[Owner]**
- **Status: Done.** Full-body character in a 3D room; drag to orbit, pinch to zoom, double-tap to reset;
  three pastel room themes (lavender, peach, dusk).
- **Gap:** the room is simple geometry (walls, floor, window, chair), unlit, built in code. Higher-fidelity
  environment (splat scan or authored scene) is Planned.

### R9 — Voice call **[Owner]**
- **Status: Done for the loop, Unverified on device.** Hands-free: listen → silence detect → reply → speak → listen.
  Face close-up framing per character style, mute, loudspeaker, hang-up, call timer.
- **Gaps:** voice quality (R6), lip-sync, and the microphone path has only been exercised in the simulator.

### R10 — Chat brain
- **Status: Mock** (`MockChatEngine`, persona-flavoured canned lines, EN+ZH). **Planned:** Claude API behind the
  `ChatEngine` protocol with persona prompt, memory, and the structured emotion/gesture output from R5.
  The API key must be supplied by the owner and never committed.

### R11 — Language **[Owner]**
- **Status: Done.** English default, 中文 switch in Settings; replies and speech language follow. Persisted.
  Existing chat history is not translated on switch.

---

## 4. Verified facts about the current stack (as of 2026-10-01)

**PINOC (via MCP)**
- Characters: `generate_character` from **1–5 photos or a text prompt**; refine pass is on by default
  (10 credits; 6 without refine). Output is a rigged Gaussian-splat `.vsplat` (VIGGCHAR v1), tiers `optimized`/`original`.
- Motions: 54 free library clips; `generate_motion` text→motion (1 credit/s, up to 60 s, returns 4 samples);
  `generate_motion_from_video`. Motions are 441-bone MetaHuman GLBs.
- Credit balance observed: 2,834. Characters render **only** through Viggle's splat engine.

**Engine** (`@viggle/splat-engine` 0.1.1 on PlayCanvas 2.18)
- Supports crossfade, bone-masked animation layers (`upperBody` / `lowerBody` / custom), 441-bone rig.
- No facial-expression / viseme API. No native iOS renderer — the app renders in a `WKWebView`.
- **iOS must use WebGL2.** iPhone WebGPU lacks `float32-filterable`, so splat characters fail to draw while the scene
  looks fine. The app probes the adapter and forces WebGL2 on iOS. (Bug found on the owner's iPhone 13 Pro.)

**Splat data model** (inspected on Chloe, 2026-10-03)
- Each splat has position, opacity, rotation, scale and **only a DC colour** (`f_dc_0..2`) — no spherical harmonics, no
  normals. Colour is fixed per splat; the engine multiplies it by a scene light factor (ambient + sun/point lights +
  optional shadow map) but cannot re-light by surface orientation.
- Consequence: lighting/shadow **baked into the capture stays baked** and does not follow articulation.

**Known artifact — dark band under the chin when the head lowers** (reported by the owner, 2026-10-03)
- Reproduced on Chloe at the peak of the nod (≈3.2–3.6 s): a darker brown band under the jaw/neck. Likely cause: the
  contact shadow under the chin is baked into the neck/jaw skin colours and does not re-light as the head moves.
- A tempting explanation was ruled out: 373 near-black (luminance < 0.32), small, mostly-opaque splats sit in the chin
  band, but hiding them (engine variant mask) changed the under-chin brightness by ~0.3/255 — not the cause.
- Not yet tested: re-colouring the under-chin/neck splats at asset level, limiting nod amplitude, and a PINOC
  regeneration or refine pass. Treat as an R2 (quality) item.

**Gesture timing bug found while debugging.** Clip lengths are wave 1.67 s, nod 3.67 s, clap 1.17 s, cheer 2.50 s; the
app used to cut every gesture at 2.4 s, so the nod never reached its peak. Gesture lengths now follow the clips.

**Performance** (iPhone 13 Pro, WebGL2, measured with the in-app probe)
- 60 fps, 0 janky frames in chat, gesture, space idle, space orbit and call close-up at the default 2× resolution (1.32 MP).
- At 3× (2.96 MP) the call close-up dropped to 52 fps. The app starts at 2× and steps down (1.5×, 1×) if frames run long.
- Not yet measured: sustained runs (thermal throttling), memory, battery, ProMotion (WKWebView caps at 60 Hz).
- Each character is ~1.3 MB, 131k splats; load ≈ 0.3 s warm.

**Dev environment**
- Xcode 27 / iOS 27 SDK; simulator iPhone 17 Pro; physical test device: owner's iPhone 13 Pro. Personal-team signing
  works (7-day profile). TestFlight is **Blocked** — needs a paid team and an App Store Connect record; the only paid
  team available is a company account and the owner has not approved uploading there (decision 2026-10-01: not now).

---

## 5. Architecture in one screen

- `App/Veplika/` (SwiftUI): `Models` (Companion, Localization, Onboarding), `Services` (ChatEngine protocol + mock,
  ChatStore, CallSession, SpeechService), `Stage` (WKWebView bridge + custom `veplika://` scheme handler),
  `Views` (RootView, Chat/Space/Call layers, Onboarding, DesignTokens).
- `web/src/` bundles PlayCanvas + splat-engine (worker inlined) into one file. `stage.js` wires the parts, picks the WebGL
  backend, owns the character and clips and exposes `window.stage`; `room.js` builds the themed room; `camera.js` is the
  orbit rig (`chat`, `space`, `call`); `blink.js` is idle blinking; `perf.js` is adaptive resolution, the perf probe and
  the diagnostics badge. The Swift side talks to it only through `AvatarController`.
- `Resources/` holds `.vsplat` characters and `.glb` motions. `scripts/sync_web.sh` builds and copies them into the app.
- Debug launch arguments (scripted runs live in `Stage/DebugHarness.swift`): `-seedDemo`, `-perfProbe`, `-resetOnboarding`,
  `-onboardingAuto`, `-skipOnboarding`, `-thumbCapture` (+ `-companion <id>`). Settings has a "Show render diagnostics" toggle.

---

## 6. Design system

**Files:** `App/Veplika/Views/DesignTokens.swift` (tokens, glass helpers) and the room themes in `web/stage.js`.

- **Two layers.** `DS.Pastel` primitives → `DS.Palette` semantic tokens. UI code uses semantic tokens only.
- **The colour rule (P6, [Owner] 2026-10-01).** No saturated colour. Fills are neutrals or pastels with
  **chroma = max(r,g,b) − min(r,g,b) ≤ 0.34**. Colour appears as a translucent tint over glass, never as a vivid solid
  block. Dark values exist only as text ink (`DS.Palette.ink`). `DS.audit()` checks every palette token and every
  companion accent at launch (debug) and prints violations.
- **Components:** Liquid Glass (`glassEffect`) tinted cool grey-violet; user bubble soft periwinkle, companion bubble
  near-white, both with ink text; hang-up is soft coral with dark ink.
- **Type:** Avenir Next for UI text; SF Rounded for onboarding titles.
- **Metrics:** measured from the Replika-style reference screenshots (top buttons 38 pt, input 50 pt, call bar 62 pt…).
- **Motion:** spring for selection, smooth glide for camera/mode changes.
- **Do not:** add vivid reds/blues/greens, solid saturated buttons, neon gradients, or system-default green toggles
  (tint with `DS.Palette.brand`).

---

## 7. Roadmap (suggested order — owner decides)

1. **Facial-expression feasibility test** on a real PINOC character (R4). Gate for everything expressive.
2. **Real chat brain** with structured `{text, emotion, gesture}` output (R10, R5).
3. **TTS bake-off** on the owner's own sample lines in EN + ZH, with emotion variants (R6); pick and integrate.
4. **Real onboarding generation** via PINOC from the user's photo (R1) — needs credit approval and a consent screen.
5. Motion vocabulary + layered blending; idle/listening behaviours (R3, R5).
6. Quality/perf frontier for "highest-quality" characters on device, incl. a 5-minute sustained run (R2).
7. Lip-sync (R6).
8. Higher-fidelity environments (R8).
9. Distribution: TestFlight once the owner picks a paid team and creates the app record.

---

## 8. Open questions for the owner

- What is the target audience and platform scope (iPhone only? iPad)? Currently iPhone, portrait.
- Should the partner be generated to look like the user's photo, resemble someone the user likes, or be inspired by it? (Affects the PINOC call and the consent copy.)
- Content boundaries for a companion product (romance, age gating, safety) — none defined yet.
- Which Apple team/account should ship builds?
- Budget: PINOC credits per new user, TTS cost per minute.

---

## 9. Decision log

| Date | Decision | By |
|---|---|---|
| 2026-10-01 | Build an iOS-native app replicating Replika-style interaction with PINOC characters; iOS 26 Liquid Glass. | Owner |
| 2026-10-01 | Render splats via splat-engine in `WKWebView` (no native iOS renderer exists). | Owner (chose over 2D avatars) |
| 2026-10-01 | Chat engine is a local mock until a real model is wired. | Owner |
| 2026-10-01 | English default; Chinese switchable in-app. | Owner |
| 2026-10-01 | Public GitHub repo `jinshuming/visualize-companion`; commits use the GitHub noreply email; the original four character files may be public. | Owner |
| 2026-10-01 | Force WebGL2 on iOS (WebGPU lacks float32-filterable on iPhone). | Found on device |
| 2026-10-01 | Default render resolution 2× with automatic step-down. | Perf data on iPhone 13 Pro |
| 2026-10-01 | No saturated colour anywhere; pastel/translucent only; enforced by `DS.audit()`. | Owner |
| 2026-10-01 | Onboarding built as a mock (questions + photo + generated reveal); real generation later. | Owner |
| 2026-10-03 | Blink by recolouring eye splats (lid sweep + lash line) rather than by moving eyelid bones. | Experiment results |
| 2026-10-03 | Gesture playback length follows each clip's real duration (nod no longer cut at 2.4 s). | Debugging |
| 2026-10-01 | Skip TestFlight for now. Do not upload to the company Apple team without explicit approval. | Owner |
| 2026-10-02 | Onboarding asks for favourite music genres (fun, light multi-select) and, as the last choice, the partner's visual style: realistic / CG stylized / cartoon. | Owner |

---

## 10. Changelog of this document

- 2026-10-03 — Simplification pass: no behaviour change. Stopped tracking `App/build-device/` (2.7k build files), split
  `web/stage.js` into modules, removed the facial-bone/blink/dark-splat experiment code (findings stay in R4/R5), merged the
  two mesh backdrops, folded `Companion`'s side tables into the struct, moved debug runners out of `RootView`.
- 2026-10-03 — Added idle blinking under R5 with the eyelid-bone experiment results.
- 2026-10-03 — R4 upgraded to Partially verified (facial bones are weighted); added splat data model, the under-chin
  shadow investigation, and the gesture-timing finding.
- 2026-10-02 — Added R1a (music taste + visual-style preference in onboarding).
- 2026-10-01 — Created from the owner's product brief (onboarding flow; highest-quality characters, rich motion and
  expression control, conversation-driven behaviour, most nuanced TTS) plus project history and verified facts.
