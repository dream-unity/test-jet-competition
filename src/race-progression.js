import { clamp } from './math3d.js';

/**
 * One continuous race. Each relational episode is a level in a single escalating
 * competition; there are no separate training/assessment/transfer modes.
 */
export const LEVEL_PLAN = Object.freeze([
  Object.freeze({ level: 1, family: 'vortex-convergence', name: 'VORTEX READING', evidence: 1, explicit: true, demonstration: true }),
  Object.freeze({ level: 2, family: 'formation-mirror', name: 'FORMATION AXIS', evidence: 0.98, explicit: true, demonstration: true }),
  Object.freeze({ level: 3, family: 'rotating-frame', name: 'MOVING FRAME', evidence: 0.94, explicit: true, demonstration: false }),
  Object.freeze({ level: 4, family: 'temporal-relay', name: 'TEMPORAL WINDOW', evidence: 0.9, explicit: true, demonstration: false }),
  Object.freeze({ level: 5, family: 'energy-intercept', name: 'ENERGY INTERCEPT', evidence: 0.85, explicit: false, demonstration: false }),
  Object.freeze({ level: 6, family: 'race-role', name: 'LIVE RACE ROLE', evidence: 0.8, explicit: false, demonstration: false }),
  Object.freeze({ level: 7, family: 'vortex-convergence', name: 'PREDICTIVE VORTEX', evidence: 0.74, explicit: false, demonstration: false }),
  Object.freeze({ level: 8, family: 'rotating-frame', name: 'ADVANCED REFERENCE FRAME', evidence: 0.69, explicit: false, demonstration: false }),
  Object.freeze({ level: 9, family: 'vortex-frame-compose', name: 'VORTEX × FRAME', evidence: 0.64, explicit: false, demonstration: false, heldOut: true }),
  Object.freeze({ level: 10, family: 'formation-temporal-compose', name: 'FORMATION × TIME', evidence: 0.6, explicit: false, demonstration: false, heldOut: true }),
]);

export const SINGLE_RACE_CONFIG = Object.freeze({
  label: 'ONE RACE // TEN RELATIONAL LEVELS',
  button: 'LAUNCH THE RACE',
  playerSpeed: 500,
  aiSpeed: 482,
  eventCount: LEVEL_PLAN.length,
  evidence: 1,
  demonstrations: 2,
  explicitFamily: true,
  feedback: true,
  levelCount: LEVEL_PLAN.length,
  checkpointCount: 20,
});

export function progressiveLevelAtDistance(episodes, distance) {
  if (!episodes?.length) return 1;
  const active = episodes.find((event) => distance <= event.endDistance + 50);
  return active?.level || episodes.at(-1)?.level || 1;
}

export function levelDefinition(level) {
  return LEVEL_PLAN[clamp(Math.round(level || 1) - 1, 0, LEVEL_PLAN.length - 1)];
}

export function decorateProgressiveEpisodes(episodes, seed) {
  return episodes.map((event, index) => {
    const level = LEVEL_PLAN[index] || LEVEL_PLAN.at(-1);
    return {
      ...event,
      level: level.level,
      levelName: level.name,
      family: level.family,
      difficulty: clamp(level.level, 1, 10),
      evidenceStrength: level.evidence,
      explicitFamily: level.explicit,
      demonstration: level.demonstration,
      heldOutComposition: Boolean(level.heldOut),
      signature: `single-race-v5:${level.level}:${level.family}:${event.signature}:${seed}`,
    };
  });
}
