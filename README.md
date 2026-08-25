# Apex Relational Racing

**Dream Unity — causal relational fighter-jet competition**

[Play the deployed GitHub Pages build](https://dream-unity.github.io/test-jet-competition/)

Apex Relational Racing is a self-contained browser-native 3D racing game in which relational reasoning is expressed through the aircraft's continuous trajectory. It contains no active picture analogies, candidate-answer rings, symbolic premises, or hidden arbitrary control remaps.

The player flies a volumetric futuristic fighter through a long three-dimensional circuit while reading relationships among competitors, vortex motion, formation axes, rotating structures, relative energy and temporal race events. Correctly entering the causal airflow relation produces real forward acceleration, afterburner recovery and a persistent flow-drive advantage. Misreading the relation produces drag and competitive separation.

## Core loop

**Observe the race → infer the relation → predict its transformation → commit a flight path → enter the physical field → update the model → compete.**

The world evidence and the scoring rule use the same observable state. No solution depends on an unrendered random side, secret role selector or private answer token.

## Fighter flight

The v4 runtime replaces the old forward-moving cursor model with quaternion-oriented arcade fighter dynamics:

- true three-dimensional position, velocity, orientation and angular velocity;
- independent pitch, roll and yaw;
- bank-and-pull turning, loops, barrel rolls and inverted flight;
- thrust, throttle, afterburner, airbrake, lift, drag and gravity;
- angle of attack, sideslip, stalls, G-load and manoeuvre energy loss;
- climb/dive energy exchange and speed-sensitive control authority;
- body-relative chase camera with optional high-roll camera;
- conventional aircraft pitch: pull back/down to raise the nose;
- sixteen enforced oriented checkpoints across a procedural 10 km+ 3D spline.

## Fighter airframes

Aircraft are generated as multi-component volumetric meshes rather than sixteen-triangle arrowheads. The renderer constructs:

- tapered elliptical fuselage;
- one or two engine bodies;
- physical exhaust nozzles and afterburner plumes;
- curved canopy;
- swept wings with thickness;
- tailplanes, canards and single/twin vertical fins;
- intake bodies, wingtip lights, wakes and contrails;
- three differentiated fictional airframes with distance-based detail reduction.

All geometry and audio are generated from repository code. There are no downloaded models, textures, fonts, analytics or runtime libraries.

## Causal relational families

### Predictive vortex convergence

Two racers generate visible inner and outer wingtip-vortex trajectories. The useful field is the future convergence of the appropriate vortices, not either jet's current position. Error models include current-state chasing, single-wake capture, inverse-vortex selection, reversed prediction and the wrong racer pair.

### Leader-axis formation

The leader and highest-ranked wingman define a visible formation axis. The efficient slot is the wingman's position reflected through the leader's body-relative axis. It moves continuously with bank, formation motion and leader changes. Errors include following the wingman, mirroring in world coordinates, collapsing onto the leader and tracking the wrong leader.

### Rotating reference frame

A visible rotor supplies a moving local coordinate system. The player must transform a racer-relative relation into the rotor's predicted orientation at arrival. Errors distinguish current-frame capture, world-frame substitution, inversion and wrong-reference selection.

### Temporal relay

A physical aperture activates during an interval created by the ordering of two visible racers crossing two visible boundaries. The spatial route alone is insufficient: early, late and reversed-order trajectories are independently identifiable.

### Relative-energy interception

A visibly boosting racer, relative altitude, lateral motion, player energy and upcoming course curvature jointly determine the energy-efficient intercept. Errors include chasing the current position, inverting the altitude-energy relation, omitting lead and tracking the wrong energy source.

### Live competitive role

The relevant object is a visible role, such as the current leader, rather than a fixed coloured aircraft. Overtaking changes the relational problem. The fastest line is outside the leader relative to live course curvature, not absolute left or right.

### Composed transfer

Held-out transfer sectors combine vortex prediction with a rotating frame, or formation reflection with a temporal window. Components are learned independently before being composed.

## Measurement architecture

The game separates three channels:

1. **Relational model selection** — pre-feedback trajectory samples are fit against the correct causal model and explicit diagnostic alternatives.
2. **Flight execution** — after commitment but before field feedback, movement is scored against the model the player actually selected, using an individually estimated motor-noise baseline.
3. **Physical consequence** — time spent in correct and diagnostic airflow fields changes thrust, drag, afterburner energy, persistent flow drive and race position.

This permits a player to infer incorrectly yet fly that mistaken model precisely, or infer correctly but execute poorly. Streaming model fits estimate the first stable inference before commitment; commitment latency is retained separately in telemetry.

## Practice-effect resistance

- continuous trajectories rather than a finite answer bank;
- procedural courses, rotor geometry, timing, actor motion and composition;
- live roles and race order alter the solution during play;
- cross-session structural-signature avoidance;
- counterbalanced absolute side and altitude;
- transform-equivariant rules tested under rotated configurations;
- distractors are generative cognitive-error models, not decorative alternatives;
- transfer mode emphasizes held-out compositions;
- no single colour, side, jet identity or environment consistently predicts the efficient path.

## AI competitors

AI racers have separate prediction, frame-transformation, temporal, role-updating, composition, inference-latency and motor profiles. They select among the same causal and diagnostic models, then execute with profile-specific motor noise. Their relational trajectory remains concealed until the player has committed.

## Modes

- **Relational Grand Prix** — full six-jet competition with reduced demonstrations after the opening sectors.
- **Relational Flight School** — embodied ghost demonstrations and maximum causal evidence.
- **Blind Assessment Run** — calibrated motor baseline, withheld live scores and no explicit demonstrations.
- **Held-Out Transfer Circuit** — faster flight with predominantly novel relation compositions.

## Controls

### Desktop

- **A / D or left / right:** roll
- **S or down:** pull back / pitch up
- **W or up:** pitch down
- **Q / E:** yaw
- **R / F:** throttle up / down
- **Shift:** afterburner
- **Space:** airbrake
- **Mouse drag:** direct pitch and roll
- **C:** camera
- **P / Escape:** pause

### Touch

- left stick: pitch and roll;
- right stick: yaw and throttle;
- hold Afterburner or Airbrake independently.

## Architecture

- `src/fighter-game.js` — race, cognition, AI, telemetry, camera and rendering orchestration;
- `src/fighter-flight.js` — quaternion arcade fighter dynamics;
- `src/course3d.js` — arc-length 3D spline and parallel-transport course frames;
- `src/relational-racing.js` — observable causal rule engine and trajectory-hypothesis fitting;
- `src/fighter-visuals.js` — procedural fighter airframes and quaternion mesh rendering;
- `src/fighter-input.js` — keyboard, mouse, gamepad and dual-stick touch input;
- `src/renderer-v4.js` — dependency-free WebGL renderer;
- `src/fighter-audio.js` — synthesized engine, wind and event audio;
- `src/math3d.js` — vectors, quaternions, splines and deterministic PRNG;
- `DESIGN_CONTRACT.md` — cognitive and implementation invariants;
- `tests/` — deterministic flight, course, visual, relational-validity and static-deployment tests.

## Validation

```bash
npm test
```

The suite validates fighter manoeuvrability and energy dynamics, course frames and offset recovery, all relational families, noisy model identification, transformation equivariance, reasoning/motor dissociation, temporal fields, role changes, held-out composition, cross-session novelty, fighter mesh complexity, source syntax and the complete static Pages surface.

The implementation is engineered toward maximal relational-training and fighter-racing quality. Claims about generalized intelligence transfer, psychometric reliability or clinical validity require controlled empirical studies and are not inferred from software architecture alone.
