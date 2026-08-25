# Apex Relational Racing — One-Race v5 Design Contract

This contract defines the invariants the active game must preserve.

## 1. One-race contract

The player is offered one game mode: one continuous six-jet race with ten ordered relational levels and one finish line. Training support, assessment and transfer must occur inside that progression rather than as separate modes or menus.

## 2. Progressive-level contract

Levels 1–2 may provide embodied demonstrations and maximum causal evidence. Assistance must then diminish structurally. Levels 9–10 must compose previously encountered relations under reduced assistance. Difficulty may not be reduced to speed alone.

## 3. Observable-solution contract

Every variable that changes the efficient trajectory must be available through visible race state: aircraft motion, race role, formation geometry, course curvature, rotor orientation, energy signal or temporal boundary state. Seeded generation may vary the world but may not secretly choose an answer side.

## 4. Causal-consequence contract

A correct path must intersect a physical acceleration field generated from the same relation the player observed. A wrong path must intersect drag/turbulence or miss the acceleration field. Abstract correctness bonuses cannot substitute for the physical field.

## 5. Continuous-response contract

The response is a time-indexed trajectory, not a picture, button or symbolic answer. Classification fits the pre-feedback trajectory against competing causal hypotheses.

## 6. Error-topology contract

Every family must generate plausible alternative models, including current-state chasing, inversion, wrong frame, wrong role, obsolete role, omitted operation, operation-order reversal and temporal-order errors where applicable.

## 7. Measurement-separation contract

Relational model selection is captured before physical outcome feedback. Motor execution is measured after commitment but before the correct field becomes explicit, relative to the selected model and an individual motor calibration. Physical success remains a third variable.

## 8. Direct-control contract

W, Arrow Up, upward touch-stick movement and upward mouse drag must all command climb by default. Their downward counterparts command dive. Direct and inverted pitch may be selected explicitly, but every input device must share the selected convention.

A/D, Left/Right, horizontal primary-stick and horizontal mouse drag request an accessible coordinated turn. Q/E retain independent manual roll; Z/X retain independent rudder yaw. No input path may silently use a conflicting sign convention.

## 9. Fluid-fighter contract

Thrust follows aircraft orientation. Pitch, yaw and roll change orientation rather than global screen coordinates. Bank changes the lift axis; hard turns consume energy; gravity, lift, drag, angle of attack, stall, G-load, climb/dive exchange, afterburner and airbrake affect motion.

The runtime must use substepped integration and preserve fine control near neutral while retaining full manoeuvre authority. It must support banked turns, loops, barrel rolls, inverted flight and independent rudder alignment.

## 10. Speed contract

The competition launches in a fighter-class speed regime and supports sustained Mach-class acceleration. The course must be scaled to the performance envelope so that increased speed does not collapse reaction time or finish the race before all ten levels occur.

## 11. Course-continuity contract

Course gates guide and validate the route. Missing one may apply a modest competitive penalty, but may not freeze progression, reverse the aircraft, teleport it or magnetically drag it backward to an obsolete checkpoint.

## 12. Competitive-role contract

AI aircraft are game-state variables and competitors. Role-dependent rules must use visibly defined roles. AI may not reveal its relational line before player commitment.

## 13. Anti-shortcut contract

Absolute colour, aircraft identity, left/right, altitude, environment and presentation style must be counterbalanced. Identical relations must survive transformed appearances; similar appearances may contain different relations. Cross-session signatures reduce repeated structures.

## 14. Transfer contract

Foundational relations are introduced independently within Levels 1–8. Levels 9–10 use held-out compositions rather than opening a separate transfer mode or merely increasing speed.

## 15. Deployment contract

The game remains self-contained, repository-relative and playable through GitHub Pages without a backend, remote runtime dependency, downloaded model, analytics service or external font. The deployed HTML, CSS and runtime modules must be compared byte-for-byte against validated source.
