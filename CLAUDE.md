# Agent instructions

**Before doing any work, read [`PRODUCT.md`](PRODUCT.md) in full.** It holds the owner's values, binding requirements,
honest capability status, design-system rules and the decision log. Follow it.

Essentials (details in PRODUCT.md §0):

- Owner requirements are binding; never silently lower the quality bar (highest-quality character, rich motion,
  controllable expression, most emotionally nuanced TTS).
- Update `PRODUCT.md` in the same change whenever the owner states a new requirement, principle or decision.
- Label status honestly: Done / Mock / Planned / Blocked / Unverified.
- No saturated colour in the UI — light, translucent pastels only. Keep `DS.audit()` clean.
- Every user-visible string goes through `L.t(en, zh)`; English is the default.
- Verify rendering and performance on the owner's real iPhone, not just the simulator.
- Ask for explicit approval before any outward-facing action (git push, publishing, TestFlight, spending PINOC credits).
