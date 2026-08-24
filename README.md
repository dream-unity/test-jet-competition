# Impulse Run

**Dream Unity — endogenous relational fighter-jet racing**

[Play the deployed GitHub Pages game](https://dream-unity.github.io/test-jet-competition/)

Impulse Run is a dependency-free browser-native 3D fighter-jet competition in which relational reasoning is part of the race itself. There are no picture-answer gates in the active gameplay. Opponents, wakes, rotating structures, formations, moving reference frames and temporal race events create the reasoning problem; the player's continuous flight trajectory is the response.

## Design principle

**Observe race dynamics → infer relationships → predict their transformation → commit a trajectory → experience physical consequence → update the model → compete.**

The game deliberately avoids the structure "solve an analogy, select a picture, resume racing." Instead it implements analogous relational operations through concrete flight dynamics. Absolute colour, side, vehicle identity and course position are procedurally varied so that a single superficial feature cannot reliably predict the fastest line.

## Relational racing families

The endogenous world generator currently produces eight families:

- **Slipstream intercept** — predict a competitor's future wake-relative opportunity rather than chase its current position.
- **Wake intersection** — reason over the relative motion of two competitors and intercept the future relation between their wakes.
- **Rotating frame** — transform a racer-relative position through a visibly rotating environmental frame.
- **Formation geometry** — mirror or reposition relative to a leader/wing relationship that changes as race order changes.
- **Moving reference frame** — fly through a rotating/reflected field whose orientation transforms both useful trajectory and steering consequences.
- **Temporal intercept** — act inside a window defined by the ordering of competitor crossings, not by a fixed countdown.
- **Composed intercept** — combine prediction, rotation/reflection and offset relations into a single trajectory.
- **Competitive role shift** — the reference competitor is defined by live race order, so overtaking can change the reasoning problem itself.

Every family generates continuous target trajectories and plausible diagnostic alternatives such as current-state chasing, inverse relations, world-frame substitution, stale-reference tracking, single-racer capture, incomplete composition and temporal-order errors. These labels exist only in telemetry; the player experiences flight consequences rather than test-answer labels.

## Reasoning is engine performance

Race position is the principal behavioural consequence of relational performance.

A correctly inferred trajectory:

- adds an immediate thrust impulse;
- increases a persistent reasoning-drive term;
- regenerates boost;
- builds a correct-inference streak that strengthens overtaking opportunities.

A wrong relational model:

- applies immediate aerodynamic drag;
- decreases persistent reasoning drive;
- drains some boost;
- resets the reasoning streak, allowing competitors to pull away.

The consequence is intentionally physical rather than a detached `+100` score. Strong relational performance makes the aircraft faster; repeated errors progressively cost competitive position.

## AI competitors are relational variables and competitors

The five AI racers are not merely decoration. Their live position, velocity and race order are inputs to the player's relational state. The same race world also drives each AI pilot's decision model through separate reasoning accuracy and inference latency.

To prevent answer leakage, AI competitors do not begin steering toward their inferred relational line until the player's trajectory has been committed. Afterwards, a strong AI may exploit the correct relation and accelerate, while another may commit to a diagnostic wrong model and lose speed. This makes reasoning visible through race dynamics without showing an answer key.

## Environmental control-frame reasoning

The earlier arbitrary 16–30 second remapping schedule is bypassed in active gameplay. Steering transformations now occur only inside **visible moving-frame fields** that are part of the race environment.

The field geometry specifies a member of the eight magnitude-preserving D4 control mappings:

- identity;
- horizontal or vertical reflection;
- 180-degree rotation;
- clockwise or counter-clockwise quarter rotation;
- diagonal or anti-diagonal axis exchange.

The player therefore reasons over:

**field orientation × aircraft trajectory × control input → resulting movement.**

Boost, brake and pause remain stable. The control transformation is applied consistently to keyboard, mouse, gamepad and touchscreen steering. First-action correctness, old-frame perseveration, compensation latency and recovery are recorded separately from route inference and ordinary piloting.

## Separate measurement channels

The game separates three kinds of performance:

1. **Relational trajectory inference** — whether the player's committed projected trajectory matches the live relational solution rather than a meaningful error model.
2. **Piloting execution** — how consistently and accurately the player flies the trajectory after commitment, including dynamic tracking error.
3. **Environmental control-frame adaptation** — how rapidly and correctly steering is transformed inside moving reference-frame fields.

Telemetry also records family, live reference racers, inference latency, commitment confidence margin, error topology, motor precision, control context, speed consequence, reasoning drive and novelty signature. This supports within-game assessment and error analysis without claiming that the game is already a clinically validated IQ test.

## Difficulty and practice-effect resistance

Difficulty increases structurally rather than merely by increasing speed. Runs progress from single moving relations toward reference-frame changes, role switching, temporal-spatial integration and multi-stage composition. Transfer mode biases toward unfamiliar dynamic and composed relationships.

Practice-effect controls include:

- deterministic-but-seeded procedural generation;
- randomized polarity, phase, orientation, radius, offset and prediction horizon;
- randomized live competitor roles and race-order references;
- reflected and rotated environmental frames;
- cross-session novelty signatures stored locally;
- counterbalanced lateral solutions so "always go left/right" cannot become a shortcut;
- continuous target geometry instead of a memorisable finite answer bank;
- live targets that change with opponents, making identical-looking course geometry insufficient to solve the relation.

## Racing systems

- Responsive arcade fighter-jet flight with pitch/yaw steering, visible roll, boost, air brake, shield and collision speed loss.
- Six-racer field with overtaking and catch-up dynamics.
- Chase camera and speed-sensitive field of view.
- Procedural neon city course, moving hazards, rotating structures, wake geometry and temporal boundaries.
- Desktop keyboard/mouse, gamepad and multitouch controls.
- Four modes: Relational Grand Prix, Vector Training, Assessment Run and Transfer Trial.
- Synthesised engine, boost, collision and feedback audio with no downloaded media.

## Controls

### Desktop

- **WASD / arrow keys:** steer horizontally and vertically
- **Q / E:** manual visual roll
- **Shift:** boost
- **Space:** air brake
- **Mouse drag:** direct steering
- **Escape / P:** pause
- **Gamepad:** left stick steer; face/trigger buttons boost and brake

### Mobile

Use the left virtual flight stick and the right Boost and Brake controls. Inside a moving-frame field, the same environmental transformation is applied to all steering devices.

## Architecture

- `src/main.js` — underlying flight/race/render orchestration retained as the stable engine substrate.
- `src/world-relations.js` — deterministic endogenous relational-world generator and continuous solution/error geometry.
- `src/world-racing.js` — active gameplay layer replacing picture-puzzle sectors with world-coupled relational racing, reasoning-driven engine consequences, relational AI and environmental control fields.
- `src/renderer.js` — dependency-free WebGL renderer.
- `src/systems.js` — input and synthesized audio.
- `src/control-relations.js` — legacy control-relation library retained for compatibility/testing; its timed schedule is bypassed by the active endogenous runtime.
- `tests/world-relations.test.mjs` — stress tests for deterministic generation, family coverage, D4 control mappings, target bounds, lateral counterbalancing and absence of picture-answer logic in the active runtime.

## Development and validation

There is no build step and no runtime dependency. Serve the repository root over HTTP:

```bash
python3 -m http.server 8080
```

Run the full deterministic validation suite:

```bash
npm test
```

The tests cover the original flight/renderer substrate plus the endogenous relational-racing model, including hundreds of seeded schedules, all eight world-relation families, all eight control transformations, bounded live targets, diagnostic alternatives, structural novelty, left/right counterbalancing, syntax validity and repository-relative static deployment.

## Deployment

`.github/workflows/pages.yml` validates the game and deploys the repository root to GitHub Pages on pushes to `main`. The application uses repository-relative paths and has no backend or runtime third-party dependency.

Performance telemetry is experimental. The architecture is designed to maximize relational-reasoning training and assessment potential, but general-intelligence transfer and psychometric validity require controlled empirical validation.
