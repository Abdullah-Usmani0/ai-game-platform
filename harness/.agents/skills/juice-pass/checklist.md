| Item | Machine check |
|---|---|
| Coyote time | jump within 6 ticks after leaving a ledge fires (feel.spec) |
| Jump buffer | jump pressed within 6 ticks before landing fires on landing |
| Variable jump | short vs held jump heights differ |
| Hit pause | feedback channel hitstop on hit; renderer freezes 50 ms |
| Screen shake | feedback channel shake; amplitude bounded by style.camera.maxShake |
| Flash / knockback / particles | feedback channels on hit and death |
| Audio | every core verb and pickup has audio_play; no silent first 10 s |
| Celebrate success | level_complete binds sfx + particle |
| Difficulty | deaths per segment from bots; first 30 s cannot fail (validator) |
