# Apex Relational Racing — Design Contract

This contract defines the invariants the active game must preserve.

## 1. Observable-solution contract

Every variable that changes the efficient trajectory must be available through visible race state: aircraft motion, race role, formation geometry, course curvature, rotor orientation, energy signal or temporal boundary state. Seeded generation may vary the world but may not secretly choose an answer side.

## 2. Causal-consequence contract

A correct path must intersect a physical acceleration field generated from the same relation the player observed. A wrong path must intersect drag/turbulence or miss the acceleration field. Abstract correctness bonuses cannot substitute for the physical field.

## 3. Continuous-response contract

The response is a time-indexed trajectory, not a picture, button or discrete symbolic answer. Classification fits the pre-feedback trajectory against competing causal hypotheses.

## 4. Error-topology contract

Every family must generate plausible alternative models, including current-state chasing, inversion, wrong frame, wrong role, obsolete role, omitted operation, operation-order reversal and temporal-order errors where applicable.

## 5. Measurement-separation contract

Relational model selection is captured before physical outcome feedback. Motor execution is measured after commitment but before the correct field becomes explicit, relative to the selected model and an individual motor calibration. Physical success remains a third variable.

## 6. Fighter-flight contract

Thrust follows aircraft orientation. Pitch, yaw and roll change orientation rather than global screen coordinates. Bank changes the lift axis; hard turns consume energy; gravity, lift, drag, angle of attack, stall, G-load, climb/dive exchange, afterburner and airbrake affect motion.

## 7. Competitive-role contract

AI aircraft are game-state variables and competitors. Role-dependent rules must use visibly defined roles. AI may not reveal its relational line before player commitment.

## 8. Anti-shortcut contract

Absolute colour, aircraft identity, left/right, altitude, environment and presentation style must be counterbalanced. Identical relations must survive transformed appearances; similar appearances may contain different relations. Cross-session signatures reduce repeated structures.

## 9. Transfer contract

Foundational relations are introduced independently. Transfer mode uses held-out compositions rather than merely increasing speed or reducing visibility.

## 10. Deployment contract

The game remains self-contained, repository-relative and playable through GitHub Pages without a backend, remote runtime dependency, downloaded model, analytics service or external font.
