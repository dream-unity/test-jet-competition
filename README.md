# Impulse Run

**Dream Unity — visual relational fighter-jet racing**

[Play the deployed GitHub Pages game](https://dream-unity.github.io/test-jet-competition/)

Impulse Run is a dependency-free browser-native 3D racing game in which the player watches a visual transformation, transfers that relationship to a new formation, and commits by flying through the matching corridor. No symbolic premises are presented: the flight path itself is the answer.

The steering frame now also becomes part of the relational environment. At seeded, irregular intervals, a pair of moving visual correspondences demonstrates how input motion will transform into aircraft motion. The player must infer the new control-to-outcome relation and adapt in flight. Boost, brake and pause remain stable so the manipulation trains spatial control-frame reasoning rather than arbitrary button memorisation.

## Core loop

**See → visually relate → anticipate → commit trajectory → fly**

Each race interleaves high-speed arcade flight with procedurally generated visual analogies. The challenge engine varies geometry, orientation, scale, depth, motion, reference frame, attribute mapping, candidate layout and operation composition. Incorrect corridors are generated from explicit processing-error models, including inverse transformations, wrong axes, reversed trajectories, incomplete compositions, surface-only matches and reference-frame substitutions.

## Dynamic control-frame reasoning

The control-remapping layer uses the eight orthogonal symmetries of a square control plane:

- stable identity mapping;
- horizontal or vertical reflection;
- 180-degree rotation;
- clockwise or counter-clockwise quarter rotation;
- diagonal or anti-diagonal axis exchange.

Every mapping preserves input magnitude, so only the relation between control direction and flight direction changes. Before activation, two non-collinear moving probes directly demonstrate the upcoming transformation. Their directions, presentation encoding, mapping transition and timing are procedurally varied; no verbal rule or logic premise is shown.

Cadence is mode-specific but always bounded between 16 and 30 seconds after the first change:

- **Vector Training:** 24–30 seconds, long cue, mainly single-relation remaps and a longer visual reference.
- **Relational Grand Prix:** 18–26 seconds, approximately 22-second centre, 70/30 simple-to-compound balance.
- **Assessment Run:** 19–25 seconds, counterbalanced mapping exposure and guarded measurement windows around corridor commitment.
- **Transfer Trial:** 16–24 seconds, short references and a majority of compound rotations or axis exchanges.

A seeded triangular-jitter schedule prevents rhythmic anticipation. Immediate mapping repetition is prohibited, exposure is balanced, recent transition signatures are penalised, and cross-session cue signatures are retained locally so subsequent runs can avoid recently encountered configurations.

## Control-frame assessment channel

Control-frame adaptation is measured separately from corridor reasoning and ordinary flight execution. Each switch can record:

- mapping family, complexity, cue duration, actual interval and any fairness deferral;
- visual probe correspondences and transition novelty signature;
- pre-switch trajectory reference and its measurement eligibility;
- first meaningful action, inference latency and first-action correctness;
- old-frame perseveration, inverse response, axis exchange, exploratory response or response inhibition;
- recovery time, switch cost, integrated control error and a short 12 Hz trajectory trace;
- mapping/family exposure, adaptation trend, transition novelty and cross-session schedule history.

Assessment and Training guard switches that would otherwise occur immediately around commitment or gate execution. Grand Prix allows a bounded proportion of overlaps, and Transfer Trial permits more deliberate interference. This preserves interpretable measurement while retaining real-time relational inference under pressure.

The session export uses `dream-unity.impulse-run.telemetry.v2` and includes three analytically separate channels: corridor-relation records, piloting records and control-frame records.

## Relational integrity

- Seven corridor challenge families: rotation, reflection, relative trajectory, scale/offset, operation composition, reference-frame transfer and structural remapping.
- Twenty-four orientation frames, twenty-three non-identity cube rotations and twenty-four reflection matrices.
- Eight orthogonal control-frame mappings with deterministic, machine-tested inversion and magnitude preservation.
- Deterministic seeded generation with machine-validated unique candidate solutions.
- Session and cross-session novelty tracking to reduce item memorisation and practice effects.
- Three-, four- and five-corridor layouts spanning horizontal, vertical, diagonal, diamond, square, cross and pentagonal flight choices.
- Adaptive difficulty in Grand Prix and Training modes; balanced fixed difficulty in Assessment; high-novelty parameter distributions in Transfer Trial.
- AI competitors cannot select or enter their answer corridor until the player’s trajectory has been committed.

## Separate measurement channels

The commitment plane records the player’s selected corridor and decision latency before the gate is reached. At the gate plane, the game separately records trajectory consistency, distance from the committed corridor centre, speed retention, gate passage and collision outcomes. A player can therefore reason incorrectly but pilot the chosen path precisely, or reason correctly but execute it poorly; the two outcomes remain distinct.

Control-frame switches form a third channel. They are scored from the player’s adaptation to the changing sensorimotor relation, not from corridor correctness or raw race position. Data remains in local browser storage unless the player explicitly exports a session JSON file. The game does not claim clinical or validated general-intelligence measurement.

## Racing systems

- Responsive arcade flight with pitch/yaw steering, visible roll, afterburner energy, air brake, shield and speed loss from collisions.
- Six-racer field with overtaking, catch-up dynamics, shared challenge sectors and non-revealing AI commitment logic.
- Chase camera, speed-sensitive field of view, procedural neon city course, moving hazards, boost rings, checkpoints, race position and timing.
- Keyboard, mouse-drag, gamepad and multitouch controls.
- Four modes: Relational Grand Prix, Vector Training, Assessment Run and Transfer Trial.
- Synthesised engine, boost, collision, relation-cue and control-shift audio with no downloaded media.

## Controls

### Desktop

- **WASD / arrow keys:** steer horizontally and vertically through the currently active control frame
- **Q / E:** manual visual roll input
- **Shift:** boost; never remapped
- **Space:** air brake; never remapped
- **Mouse drag:** direct steering through the current frame
- **Escape / P:** pause; never remapped
- **Gamepad:** left stick steer, face/trigger buttons boost and brake

### Mobile

Use the left virtual flight stick and the right Boost and Brake controls. Touch controls respect display safe areas and support simultaneous input. The same control-frame transformation is applied consistently to keyboard, mouse, gamepad and touch steering.

## Development and validation

There is no build step and no runtime dependency. Serve the repository root over HTTP:

```bash
python3 -m http.server 8080
```

Run deterministic stress and deployment validation:

```bash
npm test
```

The suite generates and validates more than 1,800 corridor challenges, validates all eight control mappings, stress-tests deterministic schedules across every mode, verifies bounded jitter, cue correctness, mapping coverage, cross-session novelty avoidance and diagnostic response topology, syntax-checks every module, rejects root-absolute or remote runtime assets, and validates the asset manifest.

## Deployment

`.github/workflows/pages.yml` validates the game and deploys the repository root to GitHub Pages on every push to `main`. Official GitHub Actions are pinned to immutable commit hashes. The live-verification workflow compares the deployed HTML, both CSS files and every JavaScript module byte-for-byte against the tested source. The site uses repository-relative paths and requires no backend.
