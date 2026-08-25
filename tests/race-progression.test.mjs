import assert from 'node:assert/strict';
import { generateEpisodeSchedule } from '../src/relational-racing.js';
import {
  LEVEL_PLAN,
  SINGLE_RACE_CONFIG,
  decorateProgressiveEpisodes,
  progressiveLevelAtDistance,
  levelDefinition,
} from '../src/race-progression.js';

assert.equal(LEVEL_PLAN.length, 10, 'the game must expose exactly ten progressive levels');
assert.equal(SINGLE_RACE_CONFIG.eventCount, 10);
assert.equal(SINGLE_RACE_CONFIG.levelCount, 10);
assert.ok(SINGLE_RACE_CONFIG.playerSpeed >= 480, 'the one race must launch at Mach-class speed');
assert.ok(SINGLE_RACE_CONFIG.checkpointCount >= 20, 'the long race requires distributed circuit gates');

const generated = generateEpisodeSchedule({
  seed: 'single-race-progression',
  mode: 'grand-prix',
  courseLength: 51000,
  count: 10,
  history: [],
});
const levels = decorateProgressiveEpisodes(generated, 'single-race-progression');

assert.equal(levels.length, 10);
assert.deepEqual(levels.map((event) => event.level), [1,2,3,4,5,6,7,8,9,10]);
assert.deepEqual(levels.map((event) => event.family), LEVEL_PLAN.map((level) => level.family));
assert.ok(levels.every((event, index) => event.levelName === LEVEL_PLAN[index].name));
assert.ok(levels.every((event, index) => event.evidenceStrength === LEVEL_PLAN[index].evidence));
assert.ok(levels.every((event, index) => index === 0 || event.observeDistance > levels[index - 1].observeDistance));
assert.ok(levels.every((event, index) => index === 0 || event.evidenceStrength <= levels[index - 1].evidenceStrength));
assert.deepEqual(levels.filter((event) => event.demonstration).map((event) => event.level), [1, 2]);
assert.deepEqual(levels.filter((event) => event.heldOutComposition).map((event) => event.level), [9, 10]);
assert.equal(new Set(levels.map((event) => event.signature)).size, 10, 'every level needs a unique structural signature');

for (const event of levels) {
  assert.equal(progressiveLevelAtDistance(levels, event.observeDistance), event.level);
  assert.equal(levelDefinition(event.level).name, event.levelName);
}
assert.equal(progressiveLevelAtDistance(levels, 0), 1);
assert.equal(progressiveLevelAtDistance(levels, 1e9), 10);

console.log('Progression v5: one race, ten ordered levels, withdrawing evidence and held-out composition validated.');
