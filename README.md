# Dream Unity — Vector Rift

**Vector Rift** is a complete browser-based 3D fighter-jet racing competition in which the player's flight path answers procedural visual-relational challenges.

## Play

GitHub Pages: **https://dream-unity.github.io/test-jet-competition/**

The deployment workflow tests the relational engine before publishing the static game.

## Core loop

**See → visually relate → anticipate → commit trajectory → fly**

Each field displays a transformation between two 3D formations, then presents a new formation and three or four continuation corridors. The player applies the demonstrated relationship visually and flies the corresponding corridor. No textual premises or symbolic logic questions are used.

## Relational engine

The procedural generator varies:

- constellation topology, node roles, visual skin, scale, depth and orientation;
- rotation, reflection, role-cycling, radial displacement, axis exchange and anisotropic transformation;
- single, double and triple-operation composition;
- horizontal, vertical, diamond and rotated corridor layouts;
- plausible distractors representing incomplete transformation, reversed parameters, surface similarity, wrong operation order and mistaken reference frame;
- adaptive rule depth and periodic novel-transfer probes.

Every challenge is validated to contain exactly one correct continuation. A seeded generator avoids fixed-puzzle memorisation and supports reproducible testing.

## Racing systems

- responsive 3D arcade flight and chase camera;
- five AI racers with distinct reasoning-error profiles;
- AI cognitive veil: opponents cannot reveal a corridor before player commitment;
- overtaking, rubber-banded competition, boost reserve, recharge rings, airbrake, collisions and checkpoints;
- desktop keyboard/mouse controls and dedicated multitouch controls;
- procedural audio, adaptive render resolution and persistent personal bests.

## Independent telemetry

**Relational performance:** accuracy, inference latency, points, rule depth, transfer accuracy and distractor-error topology.

**Piloting performance:** gate precision, control stability, collision penalty, speed and boost utilisation.

The selected corridor is recorded at the commitment plane from the projected trajectory. Subsequent gate execution is scored separately, so last-second steering cannot rewrite the reasoning choice.

## Controls

| Platform | Flight | Boost | Airbrake | Pause |
|---|---|---|---|---|
| Desktop | WASD / arrows, or hold mouse | Space / Shift | X / Ctrl | P / Esc |
| Mobile | Left thumb stick | Right boost button | Right airbrake button | HUD pause |

## Development

```bash
npm test
npm run check
```

The test suite validates deterministic generation, transformation consistency, unique candidates, score separation, adaptive difficulty, DOM integrity and the non-propositional design constraint.

## Technology

Vanilla JavaScript, Three.js, Web Audio, CSS and GitHub Pages. No build step or downloaded game assets are required.
