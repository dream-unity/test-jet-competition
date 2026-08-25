import {
  clamp,
  lerp,
  V3,
  Q,
  PRNG,
  catmullRom,
} from './math3d.js';

const BASE_CONTROL_POINTS = Object.freeze([
  [0, 145, 0],
  [15, 165, 520],
  [135, 220, 1040],
  [330, 185, 1580],
  [410, 110, 2130],
  [210, 90, 2700],
  [-75, 150, 3280],
  [-330, 285, 3830],
  [-365, 470, 4350],
  [-130, 610, 4860],
  [210, 565, 5360],
  [430, 390, 5880],
  [300, 205, 6440],
  [15, 105, 7030],
  [-310, 155, 7620],
  [-455, 310, 8180],
  [-225, 470, 8720],
  [85, 430, 9260],
  [300, 265, 9800],
  [0, 155, 10450],
]);

function rawSplineSamples(controlPoints, subdivisions = 36) {
  const padded = [controlPoints[0], ...controlPoints, controlPoints.at(-1)];
  const samples = [];
  for (let segment = 0; segment < controlPoints.length - 1; segment += 1) {
    const p0 = padded[segment];
    const p1 = padded[segment + 1];
    const p2 = padded[segment + 2];
    const p3 = padded[segment + 3];
    for (let step = 0; step < subdivisions; step += 1) {
      samples.push(catmullRom(p0, p1, p2, p3, step / subdivisions));
    }
  }
  samples.push(controlPoints.at(-1));
  return samples;
}

function cumulativeDistances(points) {
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(cumulative[index - 1] + V3.distance(points[index - 1], points[index]));
  }
  return cumulative;
}

function resampleByDistance(points, spacing = 14) {
  const cumulative = cumulativeDistances(points);
  const total = cumulative.at(-1);
  const output = [];
  let cursor = 0;
  for (let distance = 0; distance <= total; distance += spacing) {
    while (cursor < cumulative.length - 2 && cumulative[cursor + 1] < distance) cursor += 1;
    const start = cumulative[cursor];
    const end = cumulative[cursor + 1];
    const t = end > start ? (distance - start) / (end - start) : 0;
    output.push({ distance, position: V3.lerp(points[cursor], points[cursor + 1], t) });
  }
  if (output.at(-1).distance < total - 1) output.push({ distance: total, position: [...points.at(-1)] });
  return output;
}

function rotateFrameAroundForward(right, up, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    right: V3.add(V3.scale(right, c), V3.scale(up, s)),
    up: V3.add(V3.scale(up, c), V3.scale(right, -s)),
  };
}

function buildFrames(samples) {
  let previousUp = [0, 1, 0];
  let previousTangent = [0, 0, 1];
  for (let index = 0; index < samples.length; index += 1) {
    const previous = samples[Math.max(0, index - 1)].position;
    const next = samples[Math.min(samples.length - 1, index + 1)].position;
    const forward = V3.normalize(V3.sub(next, previous));
    let up = V3.projectOnPlane(previousUp, forward);
    if (V3.lengthSq(up) < 1e-6) up = V3.projectOnPlane([0, 1, 0], forward);
    if (V3.lengthSq(up) < 1e-6) up = [1, 0, 0];
    up = V3.normalize(up);
    let right = V3.normalize(V3.cross(up, forward));
    up = V3.normalize(V3.cross(forward, right));

    const turn = V3.cross(previousTangent, forward);
    const signedCurvature = V3.dot(turn, up);
    const edgeFade = Math.min(1, index / 12, (samples.length - 1 - index) / 12);
    const bank = clamp(-signedCurvature * 7.5, -0.82, 0.82) * clamp(edgeFade, 0, 1);
    ({ right, up } = rotateFrameAroundForward(right, up, bank));

    samples[index] = {
      ...samples[index],
      forward,
      right: V3.normalize(right),
      up: V3.normalize(up),
      bank,
      orientation: Q.fromBasis(V3.normalize(right), V3.normalize(up), forward),
    };
    previousUp = up;
    previousTangent = forward;
  }
  return samples;
}

export class Course3D {
  constructor(seed = 'fighter-course', { spacing = 14, width = 115, height = 82 } = {}) {
    this.seed = seed;
    this.spacing = spacing;
    this.width = width;
    this.height = height;
    const rng = new PRNG(`${seed}:course`);
    this.controlPoints = BASE_CONTROL_POINTS.map((point, index) => {
      if (index === 0 || index === BASE_CONTROL_POINTS.length - 1) return [...point];
      return [
        point[0] + rng.range(-42, 42),
        Math.max(72, point[1] + rng.range(-28, 28)),
        point[2] + rng.range(-18, 18),
      ];
    });
    const dense = rawSplineSamples(this.controlPoints, 40);
    this.samples = buildFrames(resampleByDistance(dense, spacing));
    this.length = this.samples.at(-1).distance;
  }

  frameAt(distance) {
    const d = clamp(distance, 0, this.length);
    const indexFloat = d / this.spacing;
    const index = Math.min(this.samples.length - 2, Math.max(0, Math.floor(indexFloat)));
    const a = this.samples[index];
    const b = this.samples[index + 1];
    const denominator = b.distance - a.distance;
    const t = denominator > 0 ? (d - a.distance) / denominator : 0;
    const forward = V3.normalize(V3.lerp(a.forward, b.forward, t));
    let up = V3.normalize(V3.lerp(a.up, b.up, t));
    let right = V3.normalize(V3.cross(up, forward));
    up = V3.normalize(V3.cross(forward, right));
    const orientation = Q.slerp(a.orientation, b.orientation, t);
    return {
      distance: d,
      position: V3.lerp(a.position, b.position, t),
      forward,
      right,
      up,
      bank: lerp(a.bank, b.bank, t),
      orientation,
    };
  }

  offsetToWorld(distance, lateral = 0, vertical = 0, longitudinal = 0) {
    const frame = this.frameAt(distance + longitudinal);
    return V3.add(
      frame.position,
      V3.add(V3.scale(frame.right, lateral), V3.scale(frame.up, vertical)),
    );
  }

  worldToOffset(position, distance) {
    const frame = this.frameAt(distance);
    const delta = V3.sub(position, frame.position);
    return {
      lateral: V3.dot(delta, frame.right),
      vertical: V3.dot(delta, frame.up),
      longitudinal: V3.dot(delta, frame.forward),
    };
  }

  nearestProgress(position, hintDistance = 0, searchRadius = 520) {
    const centerIndex = Math.round(clamp(hintDistance, 0, this.length) / this.spacing);
    const radius = Math.max(8, Math.ceil(searchRadius / this.spacing));
    const start = Math.max(0, centerIndex - radius);
    const end = Math.min(this.samples.length - 1, centerIndex + radius);
    let bestIndex = start;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (let index = start; index <= end; index += 1) {
      const distanceSq = V3.lengthSq(V3.sub(position, this.samples[index].position));
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestIndex = index;
      }
    }
    const best = this.samples[bestIndex];
    const offset = this.worldToOffset(position, best.distance);
    return {
      distance: clamp(best.distance + offset.longitudinal, 0, this.length),
      sampleIndex: bestIndex,
      crossTrackDistance: Math.hypot(offset.lateral, offset.vertical),
      lateral: offset.lateral,
      vertical: offset.vertical,
      longitudinal: offset.longitudinal,
    };
  }

  checkpointDistances(count = 18) {
    return Array.from({ length: count }, (_, index) => (index + 1) * this.length / (count + 1));
  }

  sectorIndex(distance, sectorCount = 10) {
    return Math.min(sectorCount - 1, Math.max(0, Math.floor(clamp(distance, 0, this.length - 0.001) / this.length * sectorCount)));
  }
}

export const COURSE_TEMPLATE = BASE_CONTROL_POINTS;
