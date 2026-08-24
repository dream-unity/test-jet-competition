/**
 * Impulse Run procedural visual-relational challenge engine.
 * Pure ES module: shared by the browser game and deterministic Node tests.
 */

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;

export function hashString(input) {
  let h = 2166136261 >>> 0;
  const text = String(input);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

export class PRNG {
  constructor(seed = 1) {
    this.state = hashString(seed) || 0x6d2b79f5;
  }

  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min, maxInclusive) {
    return Math.floor(this.next() * (maxInclusive - min + 1)) + min;
  }

  bool(probability = 0.5) {
    return this.next() < probability;
  }

  pick(items) {
    return items[Math.floor(this.next() * items.length)];
  }

  shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

const IDENTITY_3 = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);

export function mat3Identity() {
  return [...IDENTITY_3];
}

export function mat3Transpose(m) {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function mat3Multiply(a, b) {
  const out = new Array(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      out[row * 3 + col] =
        a[row * 3] * b[col] +
        a[row * 3 + 1] * b[col + 3] +
        a[row * 3 + 2] * b[col + 6];
    }
  }
  return out;
}

export function mat3Vector(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

function determinant3(m) {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

function permutations(values) {
  if (values.length <= 1) return [values];
  const result = [];
  values.forEach((value, index) => {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    permutations(rest).forEach((suffix) => result.push([value, ...suffix]));
  });
  return result;
}

function signedPermutationMatrices() {
  const matrices = [];
  const perms = permutations([0, 1, 2]);
  for (const perm of perms) {
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const m = new Array(9).fill(0);
          m[0 * 3 + perm[0]] = sx;
          m[1 * 3 + perm[1]] = sy;
          m[2 * 3 + perm[2]] = sz;
          matrices.push({ matrix: m, determinant: Math.round(determinant3(m)) });
        }
      }
    }
  }
  return matrices;
}

const SIGNED_PERMUTATIONS = signedPermutationMatrices();
const ROTATIONS = SIGNED_PERMUTATIONS.filter(
  ({ determinant, matrix }) => determinant === 1 && matrix.join(',') !== IDENTITY_3.join(','),
);
const ALL_ROTATION_FRAMES = [
  { matrix: mat3Identity(), determinant: 1 },
  ...ROTATIONS,
];
const REFLECTIONS = SIGNED_PERMUTATIONS.filter(({ determinant }) => determinant === -1);

function vectorAdd(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vectorScale(v, scalar) {
  return [v[0] * scalar, v[1] * scalar, v[2] * scalar];
}

function vectorRound(v, precision = 1000) {
  return v.map((value) => Math.round(value * precision) / precision);
}

function matrixCode(matrix) {
  return matrix.map((value) => (value < 0 ? 'n' : value > 0 ? 'p' : '0')).join('');
}

function operationCode(steps) {
  return steps
    .map(
      (step) =>
        `${step.space[0]}:${matrixCode(step.matrix)}:${step.scale}:${step.offset.join('.')}:${step.colorShift}:${step.shapeShift}`,
    )
    .join('|');
}

function clonePattern(pattern) {
  return {
    frame: [...pattern.frame],
    points: pattern.points.map((point) => ({
      ...point,
      position: [...point.position],
    })),
  };
}

function applyStepToPoint(point, step, frame) {
  const inverseFrame = mat3Transpose(frame);
  let position = [...point.position];

  if (step.space === 'world') {
    position = mat3Vector(frame, position);
    position = vectorAdd(vectorScale(mat3Vector(step.matrix, position), step.scale), step.offset);
    position = mat3Vector(inverseFrame, position);
  } else {
    position = vectorAdd(vectorScale(mat3Vector(step.matrix, position), step.scale), step.offset);
  }

  return {
    ...point,
    position: vectorRound(position),
    color: ((point.color + step.colorShift) % 6 + 6) % 6,
    shape: ((point.shape + step.shapeShift) % 3 + 3) % 3,
  };
}

export function applyOperations(pattern, steps) {
  const result = clonePattern(pattern);
  for (const step of steps) {
    result.points = result.points.map((point) => applyStepToPoint(point, step, result.frame));
  }
  return result;
}

function canonicalPattern(pattern) {
  const points = [...pattern.points].sort((a, b) => a.id - b.id);
  return points
    .map((point) => {
      const p = point.position.map((value) => Math.round(value * 1000) / 1000);
      return `${point.id}:${p.join(',')}:${point.color}:${point.shape}`;
    })
    .join('|');
}

function frameCode(frame) {
  return matrixCode(frame);
}

function randomFrame(rng, forceNonIdentity = false) {
  const candidates = forceNonIdentity ? ROTATIONS : ALL_ROTATION_FRAMES;
  return [...rng.pick(candidates).matrix];
}

function randomAxisOffset(rng, magnitude = 0.7) {
  const axis = rng.int(0, 2);
  const offset = [0, 0, 0];
  offset[axis] = (rng.bool() ? 1 : -1) * magnitude;
  return offset;
}

function makeIrregularPattern(rng, pointCount, frame, symmetry = false) {
  const positions = [];
  const used = new Set();

  const addPosition = (position) => {
    const key = position.join(',');
    if (used.has(key)) return false;
    used.add(key);
    positions.push(position);
    return true;
  };

  if (symmetry && pointCount >= 4) {
    const pairCount = Math.floor(pointCount / 2);
    for (let i = 0; i < pairCount; i += 1) {
      let p;
      do {
        p = [rng.int(1, 3) * 0.65, rng.int(-3, 3) * 0.55, rng.int(-2, 2) * 0.55];
      } while (used.has(p.join(',')) || used.has([-p[0], p[1], p[2]].join(',')));
      addPosition(p);
      addPosition([-p[0], p[1], p[2]]);
    }
  }

  while (positions.length < pointCount) {
    const candidate = [rng.int(-3, 3) * 0.65, rng.int(-3, 3) * 0.55, rng.int(-2, 2) * 0.6];
    if (candidate.every((value) => Math.abs(value) < 0.01)) continue;
    addPosition(candidate);
  }

  const colors = rng.shuffle(Array.from({ length: pointCount }, (_, index) => index % 6));
  const shapes = rng.shuffle(Array.from({ length: pointCount }, (_, index) => index % 3));

  return {
    frame: [...frame],
    points: positions.slice(0, pointCount).map((position, id) => ({
      id,
      position,
      color: colors[id],
      shape: shapes[id],
      pulse: rng.next(),
    })),
  };
}

function primitiveStep(rng, family, level, space = 'local') {
  const step = {
    matrix: mat3Identity(),
    scale: 1,
    offset: [0, 0, 0],
    colorShift: 0,
    shapeShift: 0,
    space,
    kind: family,
  };

  switch (family) {
    case 'rotation':
      step.matrix = [...rng.pick(ROTATIONS).matrix];
      break;
    case 'reflection':
      step.matrix = [...rng.pick(REFLECTIONS).matrix];
      break;
    case 'trajectory':
      step.matrix = [...rng.pick(ROTATIONS).matrix];
      step.offset = randomAxisOffset(rng, rng.pick([0.55, 0.75, 0.95]));
      break;
    case 'expansion':
      step.scale = rng.pick([0.72, 0.8, 1.25, 1.4]);
      step.offset = level >= 5 && rng.bool(0.55) ? randomAxisOffset(rng, 0.55) : [0, 0, 0];
      break;
    case 'frame':
      step.matrix = [...rng.pick(ROTATIONS).matrix];
      step.space = 'local';
      if (level >= 7 && rng.bool(0.4)) step.offset = randomAxisOffset(rng, 0.6);
      break;
    case 'attribute':
      step.matrix = level >= 7 ? [...rng.pick(ROTATIONS).matrix] : mat3Identity();
      step.colorShift = rng.pick([1, 2, 3, 4, 5]);
      step.shapeShift = level >= 8 && rng.bool() ? rng.pick([1, 2]) : 0;
      break;
    default:
      step.matrix = [...rng.pick(ROTATIONS).matrix];
      break;
  }

  return step;
}

function selectFamily(rng, level, variant) {
  const available = ['rotation'];
  if (level >= 2) available.push('reflection');
  if (level >= 3) available.push('trajectory', 'expansion');
  if (level >= 5) available.push('composition');
  if (level >= 6) available.push('frame');
  if (level >= 7) available.push('attribute');

  if (variant === 'transfer') {
    const transferPool = available.filter((family) => ['frame', 'composition', 'trajectory', 'attribute'].includes(family));
    if (transferPool.length) return rng.pick(transferPool);
  }
  if (variant === 'assessment') {
    const index = Math.floor((level - 1) % available.length);
    return available[index];
  }
  return rng.pick(available);
}

function buildOperations(rng, family, level) {
  if (family !== 'composition') {
    return [primitiveStep(rng, family, level, family === 'frame' ? 'local' : 'local')];
  }

  const depth = level >= 9 ? 3 : 2;
  const pool = ['rotation', 'reflection', 'trajectory', 'expansion'];
  const steps = [];
  for (let i = 0; i < depth; i += 1) {
    const kind = rng.pick(pool);
    const step = primitiveStep(rng, kind, level, 'local');
    if (level >= 8 && i === depth - 1 && rng.bool(0.35)) step.colorShift = rng.pick([1, 2, 4, 5]);
    steps.push(step);
  }
  return steps;
}

function inverseStep(step) {
  const inverseMatrix = mat3Transpose(step.matrix);
  const inverseScale = 1 / step.scale;
  const transformedOffset = mat3Vector(inverseMatrix, step.offset);
  return {
    ...step,
    matrix: inverseMatrix,
    scale: inverseScale,
    offset: vectorScale(transformedOffset, -inverseScale),
    colorShift: -step.colorShift,
    shapeShift: -step.shapeShift,
  };
}

function invertOperations(steps) {
  return [...steps].reverse().map(inverseStep);
}

function mutationCandidates(rng, steps, level) {
  const mutations = [];
  const add = (label, mutated) => {
    if (mutated.length) mutations.push({ label, steps: mutated });
  };

  add('inverse', invertOperations(steps));

  if (steps.length > 1) {
    add('omitted-last', steps.slice(0, -1).map((step) => ({ ...step, matrix: [...step.matrix], offset: [...step.offset] })));
    add('reversed-order', [...steps].reverse().map((step) => ({ ...step, matrix: [...step.matrix], offset: [...step.offset] })));
    add('first-step-only', [{ ...steps[0], matrix: [...steps[0].matrix], offset: [...steps[0].offset] }]);
  }

  const wrongAxis = steps.map((step, index) =>
    index === 0
      ? { ...step, matrix: [...rng.pick(ROTATIONS).matrix], offset: [...step.offset] }
      : { ...step, matrix: [...step.matrix], offset: [...step.offset] },
  );
  add('wrong-axis', wrongAxis);

  const wrongFrame = steps.map((step, index) =>
    index === 0
      ? { ...step, space: step.space === 'local' ? 'world' : 'local', matrix: [...step.matrix], offset: [...step.offset] }
      : { ...step, matrix: [...step.matrix], offset: [...step.offset] },
  );
  add('wrong-frame', wrongFrame);

  const reversedOffset = steps.map((step, index) =>
    index === 0
      ? { ...step, offset: vectorScale(step.offset, -1), matrix: [...step.matrix] }
      : { ...step, matrix: [...step.matrix], offset: [...step.offset] },
  );
  add('reversed-trajectory', reversedOffset);

  const wrongScale = steps.map((step, index) =>
    index === 0
      ? { ...step, scale: step.scale === 1 ? rng.pick([0.75, 1.3]) : 1 / step.scale, matrix: [...step.matrix], offset: [...step.offset] }
      : { ...step, matrix: [...step.matrix], offset: [...step.offset] },
  );
  add('wrong-magnitude', wrongScale);

  const noAttributes = steps.map((step) => ({
    ...step,
    matrix: [...step.matrix],
    offset: [...step.offset],
    colorShift: 0,
    shapeShift: 0,
  }));
  add('surface-only', noAttributes);

  if (level >= 5) {
    const partial = steps.map((step, index) => ({
      ...step,
      matrix: [...step.matrix],
      offset: index === steps.length - 1 ? vectorScale(step.offset, 0.5) : [...step.offset],
      scale: index === steps.length - 1 ? 1 + (step.scale - 1) * 0.5 : step.scale,
    }));
    add('partial-transform', partial);
  }

  return rng.shuffle(mutations);
}

function normalizeStep(step) {
  return {
    ...step,
    matrix: step.matrix.map((value) => Math.abs(value) < 1e-8 ? 0 : value),
    offset: step.offset.map((value) => Math.abs(value) < 1e-8 ? 0 : Math.round(value * 1000) / 1000),
    scale: Math.round(step.scale * 1000) / 1000,
  };
}

function makeChallengeInternal(seed, level = 1, variant = 'mixed') {
  const rng = new PRNG(`${seed}:${level}:${variant}`);
  const safeLevel = clamp(Math.round(level), 1, 10);
  const family = selectFamily(rng, safeLevel, variant);
  const candidateCount = safeLevel >= 8 ? 5 : safeLevel >= 4 ? 4 : 3;
  const pointCount = clamp(3 + Math.floor(safeLevel / 2), 3, 7);
  const sourceFrame = family === 'frame' ? randomFrame(rng, true) : randomFrame(rng, safeLevel >= 5 && rng.bool(0.4));
  let queryFrame = family === 'frame' ? randomFrame(rng, true) : [...sourceFrame];
  if (family === 'frame') {
    let guard = 0;
    while (frameCode(queryFrame) === frameCode(sourceFrame) && guard < 10) {
      queryFrame = randomFrame(rng, true);
      guard += 1;
    }
  }

  const symmetry = family === 'reflection' && safeLevel >= 5 && rng.bool(0.35);
  const source = makeIrregularPattern(rng, pointCount, sourceFrame, symmetry);
  const query = makeIrregularPattern(rng, pointCount, queryFrame, symmetry && rng.bool());
  const operations = buildOperations(rng, family, safeLevel).map(normalizeStep);
  const transformed = applyOperations(source, operations);
  const correctPattern = applyOperations(query, operations);
  const correctSignature = canonicalPattern(correctPattern);

  const candidatePool = [{ pattern: correctPattern, errorModel: 'correct', operations }];
  const seen = new Set([correctSignature]);
  const mutations = mutationCandidates(rng, operations, safeLevel);

  for (const mutation of mutations) {
    const normalized = mutation.steps.map(normalizeStep);
    const pattern = applyOperations(query, normalized);
    const signature = canonicalPattern(pattern);
    if (!seen.has(signature)) {
      seen.add(signature);
      candidatePool.push({ pattern, errorModel: mutation.label, operations: normalized });
    }
    if (candidatePool.length >= candidateCount) break;
  }

  let fillerGuard = 0;
  while (candidatePool.length < candidateCount && fillerGuard < 100) {
    fillerGuard += 1;
    const kind = rng.pick(['rotation', 'reflection', 'trajectory', 'expansion', 'attribute']);
    const fillerOps = [primitiveStep(rng, kind, safeLevel, rng.bool(0.25) ? 'world' : 'local')].map(normalizeStep);
    const pattern = applyOperations(query, fillerOps);
    const signature = canonicalPattern(pattern);
    if (!seen.has(signature)) {
      seen.add(signature);
      candidatePool.push({ pattern, errorModel: `near-${kind}`, operations: fillerOps });
    }
  }

  if (candidatePool.length !== candidateCount) {
    throw new Error(`Unable to generate ${candidateCount} unique candidates for seed ${seed}`);
  }

  const shuffled = rng.shuffle(candidatePool);
  const correctIndex = shuffled.findIndex((candidate) => candidate.errorModel === 'correct');
  const layout = selectLayout(rng, candidateCount, safeLevel);
  const operationSignature = operationCode(operations);
  const noveltySignature = hashString(
    `${family}:${operationSignature}:${frameCode(sourceFrame)}:${frameCode(queryFrame)}:${pointCount}`,
  ).toString(36);

  return {
    version: 1,
    seed: String(seed),
    level: safeLevel,
    family,
    source,
    transformed,
    query,
    candidates: shuffled.map((candidate, index) => ({
      index,
      pattern: candidate.pattern,
      errorModel: candidate.errorModel,
    })),
    correctIndex,
    candidateCount,
    layout,
    operationSignature,
    noveltySignature,
    presentation: {
      morphDuration: clamp(1.55 - safeLevel * 0.055, 0.82, 1.5),
      ghostCount: safeLevel >= 6 ? 3 : 2,
      hideFrames: family !== 'frame' && safeLevel < 8,
      temporal: family === 'trajectory' || family === 'composition',
    },
  };
}

function selectLayout(rng, count, level) {
  const layouts = count === 3
    ? ['horizontal', 'vertical', 'diagonal-up', 'diagonal-down']
    : count === 4
      ? ['diamond', 'square', 'cross-open']
      : ['cross', 'pentagon'];
  const type = rng.pick(layouts);
  const spread = level >= 7 ? 38 : 34;

  if (type === 'horizontal') return { type, positions: [[-spread, 0], [0, 0], [spread, 0]] };
  if (type === 'vertical') return { type, positions: [[0, spread * 0.72], [0, 0], [0, -spread * 0.72]] };
  if (type === 'diagonal-up') return { type, positions: [[-spread, -18], [0, 0], [spread, 18]] };
  if (type === 'diagonal-down') return { type, positions: [[-spread, 18], [0, 0], [spread, -18]] };
  if (type === 'diamond') return { type, positions: [[-spread, 0], [0, 26], [spread, 0], [0, -26]] };
  if (type === 'square') return { type, positions: [[-30, 22], [30, 22], [-30, -22], [30, -22]] };
  if (type === 'cross-open') return { type, positions: [[-spread, 0], [0, 26], [spread, 0], [0, -26]] };
  if (type === 'cross') return { type, positions: [[0, 0], [-spread, 0], [spread, 0], [0, 26], [0, -26]] };
  return {
    type: 'pentagon',
    positions: Array.from({ length: 5 }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / 5;
      return [Math.cos(angle) * spread, Math.sin(angle) * 26];
    }),
  };
}

export function generateChallenge({ seed, level = 1, variant = 'mixed', avoidSignatures = [] }) {
  const avoided = avoidSignatures instanceof Set ? avoidSignatures : new Set(avoidSignatures);
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const challenge = makeChallengeInternal(`${seed}:${attempt}`, level, variant);
    if (!avoided.has(challenge.noveltySignature)) return challenge;
  }
  throw new Error('Unable to generate a novel challenge after 64 attempts');
}

export class RelationalGenerator {
  constructor(seed = Date.now(), history = []) {
    this.seed = String(seed);
    this.counter = 0;
    this.history = new Set(history);
  }

  next(level = 1, variant = 'mixed') {
    const challenge = generateChallenge({
      seed: `${this.seed}:${this.counter}`,
      level,
      variant,
      avoidSignatures: this.history,
    });
    this.counter += 1;
    this.history.add(challenge.noveltySignature);
    return challenge;
  }
}

export function validateChallenge(challenge) {
  const errors = [];
  if (!challenge || typeof challenge !== 'object') return { valid: false, errors: ['challenge missing'] };
  if (!Array.isArray(challenge.candidates)) errors.push('candidates missing');
  if (challenge.correctIndex < 0 || challenge.correctIndex >= challenge.candidates.length) errors.push('correct index out of range');
  if (challenge.candidates.length !== challenge.layout.positions.length) errors.push('layout/candidate count mismatch');

  const signatures = challenge.candidates.map((candidate) => canonicalPattern(candidate.pattern));
  if (new Set(signatures).size !== signatures.length) errors.push('candidate patterns are not unique');

  const correctSignature = canonicalPattern(challenge.candidates[challenge.correctIndex].pattern);
  const matchingCorrect = signatures.filter((signature) => signature === correctSignature).length;
  if (matchingCorrect !== 1) errors.push('correct answer is not unique');
  if (challenge.candidates[challenge.correctIndex].errorModel !== 'correct') errors.push('correct index does not point to correct candidate');

  const pointCount = challenge.query.points.length;
  for (const candidate of challenge.candidates) {
    if (candidate.pattern.points.length !== pointCount) errors.push('candidate point count mismatch');
    for (const point of candidate.pattern.points) {
      if (point.position.some((value) => !Number.isFinite(value))) errors.push('non-finite coordinate');
    }
  }

  return { valid: errors.length === 0, errors };
}

export const INTERNALS = Object.freeze({
  rotations: ROTATIONS.length,
  reflections: REFLECTIONS.length,
  frames: ALL_ROTATION_FRAMES.length,
});
