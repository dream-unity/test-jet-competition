# Impulse Run

**Dream Unity — visual relational fighter-jet racing**

[Play the deployed GitHub Pages game](https://dream-unity.github.io/test-jet-competition/)

Impulse Run is a dependency-free browser-native 3D racing game in which the player watches a visual transformation, transfers that relationship to a new formation, and commits by flying through the matching corridor. No symbolic premises are presented: the flight path itself is the answer.

## Core loop

**See → visually relate → anticipate → commit trajectory → fly**

Each race interleaves high-speed arcade flight with procedurally generated visual analogies. The challenge engine varies geometry, orientation, scale, depth, motion, reference frame, attribute mapping, candidate layout and operation composition. Incorrect corridors are generated from explicit processing-error models, including inverse transformations, wrong axes, reversed trajectories, incomplete compositions, surface-only matches and reference-frame substitutions.

## Relational integrity

- Seven challenge families: rotation, reflection, relative trajectory, scale/offset, operation composition, reference-frame transfer and structural remapping.
- Twenty-four orientation frames, twenty-three non-identity cube rotations and twenty-four reflection matrices.
- Deterministic seeded generation with machine-validated unique candidate solutions.
- Session and cross-session novelty tracking to reduce item memorisation and practice effects.
- Three-, four- and five-corridor layouts spanning horizontal, vertical, diagonal, diamond, square, cross and pentagonal flight choices.
- Adaptive difficulty in Grand Prix and Training modes; balanced fixed difficulty in Assessment; high-novelty parameter distributions in Transfer Trial.
- AI competitors cannot select or enter their answer corridor until the player’s trajectory has been committed.

## Separate measurement channels

The commitment plane records the player’s selected corridor and decision latency before the gate is reached. At the gate plane, the game separately records trajectory consistency, distance from the committed corridor centre, speed retention, gate passage and collision outcomes. A player can therefore reason incorrectly but pilot the chosen path precisely, or reason correctly but execute it poorly; the two outcomes remain distinct.

Session telemetry includes challenge family, difficulty, novelty signature, chosen distractor model, commitment latency, relational correctness, motor precision, actual corridor, gate hit and speed. Data remains in local browser storage unless the player explicitly exports a session JSON file. The game does not claim clinical or validated general-intelligence measurement.

## Racing systems

- Responsive arcade flight with pitch/yaw steering, visible roll, afterburner energy, air brake, shield and speed loss from collisions.
- Six-racer field with overtaking, catch-up dynamics, shared challenge sectors and non-revealing AI commitment logic.
- Chase camera, speed-sensitive field of view, procedural neon city course, moving hazards, boost rings, checkpoints, race position and timing.
- Keyboard, mouse-drag, gamepad and multitouch controls.
- Four modes: Relational Grand Prix, Vector Training, Assessment Run and Transfer Trial.
- Synthesised engine, boost, collision and feedback audio with no downloaded media.

## Controls

### Desktop

- **WASD / arrow keys:** steer horizontally and vertically
- **Q / E:** manual roll input
- **Shift:** boost
- **Space:** air brake
- **Mouse drag:** direct steering
- **Escape / P:** pause
- **Gamepad:** left stick steer, face/trigger buttons boost and brake

### Mobile

Use the left virtual flight stick and the right Boost and Brake controls. Touch controls respect display safe areas and support simultaneous input.

## Development and validation

There is no build step and no runtime dependency. Serve the repository root over HTTP:

```bash
python3 -m http.server 8080
```

Run deterministic stress and deployment validation:

```bash
npm test
```

The test suite generates and validates more than 1,800 challenges across all difficulty levels, verifies deterministic output and uniqueness, checks session novelty, syntax-checks every module, rejects root-absolute or remote runtime assets, and validates the asset manifest.

## Deployment

`.github/workflows/pages.yml` validates the game and deploys the repository root to GitHub Pages on every push to `main`. Official GitHub Actions are pinned to immutable commit hashes. The site uses repository-relative paths and requires no backend.
