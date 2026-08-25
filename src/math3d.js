export const EPSILON = 1e-8;

export const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const smootherstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

export const V3 = Object.freeze({
  create: (x = 0, y = 0, z = 0) => [x, y, z],
  clone: (v) => [v[0], v[1], v[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (v, scalar) => [v[0] * scalar, v[1] * scalar, v[2] * scalar],
  multiply: (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]],
  madd: (a, b, scalar) => [a[0] + b[0] * scalar, a[1] + b[1] * scalar, a[2] + b[2] * scalar],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  lengthSq: (v) => v[0] * v[0] + v[1] * v[1] + v[2] * v[2],
  length: (v) => Math.hypot(v[0], v[1], v[2]),
  distance: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  normalize(v) {
    const length = Math.hypot(v[0], v[1], v[2]);
    return length > EPSILON ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, 0];
  },
  projectOnPlane(v, normal) {
    return this.sub(v, this.scale(normal, this.dot(v, normal)));
  },
  reject(v, axis) {
    const normalized = this.normalize(axis);
    return this.sub(v, this.scale(normalized, this.dot(v, normalized)));
  },
  lerp: (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)],
  angle(a, b) {
    const denominator = Math.sqrt(this.lengthSq(a) * this.lengthSq(b));
    if (denominator < EPSILON) return 0;
    return Math.acos(clamp(this.dot(a, b) / denominator, -1, 1));
  },
  almostEqual(a, b, tolerance = 1e-6) {
    return this.distance(a, b) <= tolerance;
  },
});

export const V2 = Object.freeze({
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  scale: (v, scalar) => [v[0] * scalar, v[1] * scalar],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1],
  cross: (a, b) => a[0] * b[1] - a[1] * b[0],
  length: (v) => Math.hypot(v[0], v[1]),
  distance: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
  normalize(v) {
    const length = Math.hypot(v[0], v[1]);
    return length > EPSILON ? [v[0] / length, v[1] / length] : [0, 0];
  },
  lerp: (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)],
  rotate(v, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
  },
  reflectAcrossAxis(v, axis) {
    const n = this.normalize(axis);
    const projection = this.scale(n, this.dot(v, n));
    return this.sub(this.scale(projection, 2), v);
  },
  clampLength(v, maximum) {
    const length = this.length(v);
    return length > maximum && length > EPSILON ? this.scale(v, maximum / length) : [...v];
  },
});

export const Q = Object.freeze({
  identity: () => [0, 0, 0, 1],
  clone: (q) => [q[0], q[1], q[2], q[3]],
  normalize(q) {
    const length = Math.hypot(q[0], q[1], q[2], q[3]);
    return length > EPSILON ? [q[0] / length, q[1] / length, q[2] / length, q[3] / length] : [0, 0, 0, 1];
  },
  conjugate: (q) => [-q[0], -q[1], -q[2], q[3]],
  multiply(a, b) {
    const [ax, ay, az, aw] = a;
    const [bx, by, bz, bw] = b;
    return [
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    ];
  },
  fromAxisAngle(axis, angle) {
    const n = V3.normalize(axis);
    const half = angle * 0.5;
    const s = Math.sin(half);
    return this.normalize([n[0] * s, n[1] * s, n[2] * s, Math.cos(half)]);
  },
  rotateVector(q, v) {
    const qv = [v[0], v[1], v[2], 0];
    const result = this.multiply(this.multiply(q, qv), this.conjugate(q));
    return [result[0], result[1], result[2]];
  },
  inverseRotateVector(q, v) {
    return this.rotateVector(this.conjugate(q), v);
  },
  integrateBodyRates(q, bodyRates, dt) {
    const magnitude = V3.length(bodyRates);
    if (magnitude < EPSILON || dt <= 0) return this.normalize(q);
    const delta = this.fromAxisAngle(V3.scale(bodyRates, 1 / magnitude), magnitude * dt);
    return this.normalize(this.multiply(q, delta));
  },
  slerp(a, b, t) {
    let target = [...b];
    let dot = a[0] * target[0] + a[1] * target[1] + a[2] * target[2] + a[3] * target[3];
    if (dot < 0) {
      target = target.map((value) => -value);
      dot = -dot;
    }
    if (dot > 0.9995) {
      return this.normalize([
        lerp(a[0], target[0], t),
        lerp(a[1], target[1], t),
        lerp(a[2], target[2], t),
        lerp(a[3], target[3], t),
      ]);
    }
    const theta0 = Math.acos(clamp(dot, -1, 1));
    const theta = theta0 * t;
    const sinTheta = Math.sin(theta);
    const sinTheta0 = Math.sin(theta0);
    const s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
    const s1 = sinTheta / sinTheta0;
    return [
      a[0] * s0 + target[0] * s1,
      a[1] * s0 + target[1] * s1,
      a[2] * s0 + target[2] * s1,
      a[3] * s0 + target[3] * s1,
    ];
  },
  fromBasis(right, up, forward) {
    // Column-major 3x3 basis, converted to quaternion.
    const m00 = right[0]; const m01 = up[0]; const m02 = forward[0];
    const m10 = right[1]; const m11 = up[1]; const m12 = forward[1];
    const m20 = right[2]; const m21 = up[2]; const m22 = forward[2];
    const trace = m00 + m11 + m22;
    let x; let y; let z; let w;
    if (trace > 0) {
      const s = Math.sqrt(trace + 1) * 2;
      w = 0.25 * s;
      x = (m21 - m12) / s;
      y = (m02 - m20) / s;
      z = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
      w = (m21 - m12) / s;
      x = 0.25 * s;
      y = (m01 + m10) / s;
      z = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
      w = (m02 - m20) / s;
      x = (m01 + m10) / s;
      y = 0.25 * s;
      z = (m12 + m21) / s;
    } else {
      const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
      w = (m10 - m01) / s;
      x = (m02 + m20) / s;
      y = (m12 + m21) / s;
      z = 0.25 * s;
    }
    return this.normalize([x, y, z, w]);
  },
  lookRotation(forward, upHint = [0, 1, 0]) {
    const f = V3.normalize(forward);
    let right = V3.cross(upHint, f);
    if (V3.lengthSq(right) < EPSILON) right = V3.cross([1, 0, 0], f);
    right = V3.normalize(right);
    const up = V3.normalize(V3.cross(f, right));
    return this.fromBasis(right, up, f);
  },
  toEulerXYZ(q) {
    // Euler angles compatible with Rz * Ry * Rx in renderer.composeMatrix.
    const [x, y, z, w] = this.normalize(q);
    const m00 = 1 - 2 * (y * y + z * z);
    const m10 = 2 * (x * y + z * w);
    const m20 = 2 * (x * z - y * w);
    const m21 = 2 * (y * z + x * w);
    const m22 = 1 - 2 * (x * x + y * y);
    let pitch;
    let yaw;
    let roll;
    yaw = Math.asin(clamp(-m20, -1, 1));
    if (Math.abs(m20) < 0.999999) {
      pitch = Math.atan2(m21, m22);
      roll = Math.atan2(m10, m00);
    } else {
      pitch = 0;
      roll = Math.atan2(-2 * (x * y - z * w), 1 - 2 * (y * y + z * z));
    }
    return [pitch, yaw, roll];
  },
});

export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0, 1, 2].map((axis) => 0.5 * (
    2 * p1[axis]
    + (-p0[axis] + p2[axis]) * t
    + (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2
    + (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3
  ));
}

export function catmullRomDerivative(p0, p1, p2, p3, t) {
  const t2 = t * t;
  return [0, 1, 2].map((axis) => 0.5 * (
    (-p0[axis] + p2[axis])
    + 2 * (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t
    + 3 * (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t2
  ));
}

export function hashString(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return hash >>> 0;
}

export class PRNG {
  constructor(seed = 'dream-unity') {
    this.state = hashString(seed) || 0x6d2b79f5;
  }

  next() {
    let value = this.state += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    this.state = value >>> 0;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  range(minimum, maximum) {
    return minimum + (maximum - minimum) * this.next();
  }

  int(minimum, maximum) {
    return Math.floor(this.range(minimum, maximum + 1));
  }

  bool(probability = 0.5) {
    return this.next() < probability;
  }

  pick(items) {
    return items[Math.floor(this.next() * items.length)];
  }

  shuffle(items) {
    const output = [...items];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(this.next() * (index + 1));
      [output[index], output[swap]] = [output[swap], output[index]];
    }
    return output;
  }
}
