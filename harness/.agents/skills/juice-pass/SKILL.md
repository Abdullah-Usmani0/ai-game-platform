---
name: juice-pass
description: Make every GDD feedback event actually produce its channels at runtime and tune within clamps. Use in the JUICE stage or when the gate's juice check fails.
---
# Juice pass

The `feedback-binder` system (always present) emits `feedback { channel }` and `audio_play` for every event in `design/feedback.json`,
which the scaffold derives from the GDD front matter plus the genre's own custom events (`custom:finisher`, `custom:door_open`).
The juice gate proves the whole table from the event history of every smoke seed, each seed on its own
(`reports/playtest-seed<N>.json`; `playtest-report.json` is the merged summary).

When the gate fails with `feedback_missing`: the event in question did not reach the binder (a bespoke system must `ctx.emit` it)
or `design/feedback.json` lacks the channel. Fix the emit or the table; never remove the event from the GDD to pass.
When it warns `event_never_fired`: the scripted runs never trigger it (acceptable for rare events; add a scripted scenario in `tests/playtest` if it should).
`feedback_pileup`: more than 4 feedback events of one channel in a tick; throttle in the emitting system.
`sfx_unresolved`: the event is bound to `sfx` but the renderer has no sound for it, so the game would stay silent; bind
`sfx` to an event that has one (hit, death, pickup, jump, dash...) or use another channel for this event.

Clamps (`clamps.json`) are enforced by the renderer: shake amplitude scales with `style.camera.maxShake`, hitstop is 50 ms, flash 120 ms.
Checklist: `checklist.md`.
