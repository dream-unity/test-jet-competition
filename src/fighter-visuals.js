import { clamp, V3, Q } from './math3d.js';

function combineMeshes(meshes) {
  const positions = [];
  const normals = [];
  const indices = [];
  let offset = 0;
  for (const mesh of meshes) {
    positions.push(...mesh.positions);
    normals.push(...mesh.normals);
    if (mesh.indices) indices.push(...mesh.indices.map((index) => index + offset));
    else indices.push(...Array.from({ length: mesh.positions.length / 3 }, (_, index) => index + offset));
    offset += mesh.positions.length / 3;
  }
  return { positions, normals, indices, mode: 'triangles' };
}

function transformMesh(mesh, transform, reverseWinding = false) {
  const positions = [];
  const normals = [];
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const position = transform([
      mesh.positions[index],
      mesh.positions[index + 1],
      mesh.positions[index + 2],
    ], false);
    const normal = transform([
      mesh.normals[index],
      mesh.normals[index + 1],
      mesh.normals[index + 2],
    ], true);
    positions.push(...position);
    normals.push(...V3.normalize(normal));
  }
  let indices = mesh.indices ? [...mesh.indices] : undefined;
  if (reverseWinding && indices) {
    for (let index = 0; index < indices.length; index += 3) {
      [indices[index + 1], indices[index + 2]] = [indices[index + 2], indices[index + 1]];
    }
  }
  return { ...mesh, positions, normals, ...(indices ? { indices } : {}) };
}

function createLathe(profile, segments = 28) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let ring = 0; ring < profile.length; ring += 1) {
    const current = profile[ring];
    const previous = profile[Math.max(0, ring - 1)];
    const next = profile[Math.min(profile.length - 1, ring + 1)];
    const dz = next[0] - previous[0] || 1;
    const drx = next[1] - previous[1];
    const dry = next[2] - previous[2];
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = segment / segments * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      positions.push(c * current[1], s * current[2], current[0]);
      normals.push(...V3.normalize([c / Math.max(0.05, current[1]) - drx / dz, s / Math.max(0.05, current[2]) - dry / dz, -(drx * c + dry * s) / dz]));
    }
  }
  const row = segments + 1;
  for (let ring = 0; ring < profile.length - 1; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = ring * row + segment;
      const b = (ring + 1) * row + segment;
      const c = (ring + 1) * row + segment + 1;
      const d = ring * row + segment + 1;
      indices.push(a, b, d, b, c, d);
    }
  }
  return { positions, normals, indices, mode: 'triangles' };
}

function createUvSphere(latitudes = 14, longitudes = 24) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let lat = 0; lat <= latitudes; lat += 1) {
    const v = lat / latitudes;
    const phi = v * Math.PI;
    const y = Math.cos(phi);
    const radius = Math.sin(phi);
    for (let lon = 0; lon <= longitudes; lon += 1) {
      const u = lon / longitudes;
      const theta = u * Math.PI * 2;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;
      positions.push(x, y, z);
      normals.push(x, y, z);
    }
  }
  const row = longitudes + 1;
  for (let lat = 0; lat < latitudes; lat += 1) {
    for (let lon = 0; lon < longitudes; lon += 1) {
      const a = lat * row + lon;
      const b = (lat + 1) * row + lon;
      const c = (lat + 1) * row + lon + 1;
      const d = lat * row + lon + 1;
      indices.push(a, b, d, b, c, d);
    }
  }
  return { positions, normals, indices, mode: 'triangles' };
}

function createPolygonPrismXY(polygon, depth = 0.22) {
  // polygon is [x,z], extruded along y.
  const positions = [];
  const normals = [];
  const indices = [];
  const count = polygon.length;
  for (const y of [-depth / 2, depth / 2]) {
    const normal = y < 0 ? [0, -1, 0] : [0, 1, 0];
    for (const [x, z] of polygon) {
      positions.push(x, y, z);
      normals.push(...normal);
    }
  }
  for (let index = 1; index < count - 1; index += 1) {
    indices.push(0, index + 1, index);
    indices.push(count, count + index, count + index + 1);
  }
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    const [x0, z0] = polygon[index];
    const [x1, z1] = polygon[next];
    const edge = V3.normalize([z1 - z0, 0, -(x1 - x0)]);
    const base = positions.length / 3;
    positions.push(x0, -depth / 2, z0, x1, -depth / 2, z1, x1, depth / 2, z1, x0, depth / 2, z0);
    normals.push(...edge, ...edge, ...edge, ...edge);
    indices.push(base, base + 1, base + 3, base + 1, base + 2, base + 3);
  }
  return { positions, normals, indices, mode: 'triangles' };
}

function createVerticalFin(depth = 0.18) {
  const polygon = [
    [-2.2, 0],
    [-1.3, 1.55],
    [0.8, 1.15],
    [1.2, 0],
  ];
  // Build in z/y plane and extrude x by rotating a horizontal prism.
  const horizontal = createPolygonPrismXY(polygon, depth);
  return transformMesh(horizontal, ([x, y, z], normal) => normal ? [y, z, x] : [y, z, x]);
}

function createBoxData() {
  const p = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
  ];
  const faces = [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0],
  ];
  const positions = [];
  const normals = [];
  const indices = [];
  for (const [a, b, c, d] of faces) {
    const normal = V3.normalize(V3.cross(V3.sub(p[b], p[a]), V3.sub(p[c], p[a])));
    const base = positions.length / 3;
    for (const index of [a, b, c, d]) {
      positions.push(...p[index]);
      normals.push(...normal);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, indices, mode: 'triangles' };
}

function parseColor(color) {
  if (Array.isArray(color)) return color.length === 4 ? [...color] : [...color, 1];
  const value = String(color).replace('#', '');
  const normalized = value.length === 3 ? value.split('').map((character) => character + character).join('') : value;
  const numeric = Number.parseInt(normalized, 16);
  return [((numeric >> 16) & 255) / 255, ((numeric >> 8) & 255) / 255, (numeric & 255) / 255, 1];
}

function composeQuaternionMatrix(position, quaternion, scale) {
  const [x, y, z, w] = Q.normalize(quaternion);
  const [sx, sy, sz] = scale;
  const xx = x * x; const yy = y * y; const zz = z * z;
  const xy = x * y; const xz = x * z; const yz = y * z;
  const wx = w * x; const wy = w * y; const wz = w * z;
  return new Float32Array([
    (1 - 2 * (yy + zz)) * sx,
    (2 * (xy + wz)) * sx,
    (2 * (xz - wy)) * sx,
    0,
    (2 * (xy - wz)) * sy,
    (1 - 2 * (xx + zz)) * sy,
    (2 * (yz + wx)) * sy,
    0,
    (2 * (xz + wy)) * sz,
    (2 * (yz - wx)) * sz,
    (1 - 2 * (xx + yy)) * sz,
    0,
    position[0], position[1], position[2], 1,
  ]);
}

export function drawQuaternion(renderer, meshName, {
  position = [0, 0, 0],
  quaternion = [0, 0, 0, 1],
  scale = [1, 1, 1],
  color = '#ffffff',
  alpha = 1,
  emissive = 0,
  additive = false,
  depthWrite = true,
  pointSize = 2,
} = {}) {
  const gl = renderer.gl;
  const mesh = typeof meshName === 'string' ? renderer.meshes[meshName] : meshName;
  if (!mesh) return;
  const rgba = parseColor(color);
  rgba[3] *= alpha;
  gl.useProgram(renderer.program);
  gl.uniformMatrix4fv(renderer.locations.model, false, composeQuaternionMatrix(position, quaternion, scale));
  gl.uniform4fv(renderer.locations.color, rgba);
  gl.uniform1f(renderer.locations.emissive, emissive);
  gl.uniform1f(renderer.locations.pointMode, mesh.mode === gl.POINTS ? 1 : 0);
  gl.uniform1f(renderer.locations.pointSize, pointSize);
  gl.depthMask(depthWrite);
  gl.blendFunc(gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.position);
  gl.enableVertexAttribArray(renderer.locations.position);
  gl.vertexAttribPointer(renderer.locations.position, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normal);
  gl.enableVertexAttribArray(renderer.locations.normal);
  gl.vertexAttribPointer(renderer.locations.normal, 3, gl.FLOAT, false, 0, 0);
  if (mesh.indexed) {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
    gl.drawElements(mesh.mode, mesh.count, gl.UNSIGNED_SHORT, 0);
  } else {
    gl.drawArrays(mesh.mode, 0, mesh.count);
  }
  renderer.drawCalls += 1;
  gl.depthMask(true);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

function drawPart(renderer, parentPosition, parentQuaternion, mesh, options = {}) {
  const localPosition = options.localPosition || [0, 0, 0];
  const localQuaternion = options.localQuaternion || Q.identity();
  const worldPosition = V3.add(parentPosition, Q.rotateVector(parentQuaternion, localPosition));
  const quaternion = Q.multiply(parentQuaternion, localQuaternion);
  drawQuaternion(renderer, mesh, {
    ...options,
    position: worldPosition,
    quaternion,
  });
}

export function registerFighterMeshes(renderer) {
  if (renderer.meshes.fighterFuselageV4) return;
  const fuselageProfile = [
    [-5.6, 0.28, 0.28], [-5.0, 0.9, 0.7], [-4.0, 1.22, 0.9], [-2.4, 1.34, 1.02],
    [-0.2, 1.22, 1.0], [1.8, 1.05, 0.86], [3.7, 0.72, 0.62], [5.35, 0.27, 0.25], [6.45, 0.02, 0.02],
  ];
  const engineProfile = [
    [-3.8, 0.72, 0.72], [-3.2, 0.82, 0.82], [-0.3, 0.84, 0.8], [1.8, 0.68, 0.62], [2.4, 0.18, 0.18],
  ];
  const nozzleProfile = [[-0.55, 0.74, 0.74], [0.15, 0.78, 0.78], [0.35, 0.64, 0.64]];
  const leftWing = createPolygonPrismXY([[-0.55, 2.0], [-5.4, -0.45], [-4.55, -2.15], [-0.72, -1.75]], 0.24);
  const rightWing = transformMesh(leftWing, ([x, y, z]) => [-x, y, z], true);
  const leftTail = createPolygonPrismXY([[-0.52, -2.45], [-2.75, -3.5], [-2.35, -4.35], [-0.7, -3.85]], 0.19);
  const rightTail = transformMesh(leftTail, ([x, y, z]) => [-x, y, z], true);
  const leftCanard = createPolygonPrismXY([[-0.46, 2.75], [-1.85, 1.95], [-1.55, 1.25], [-0.5, 1.55]], 0.14);
  const rightCanard = transformMesh(leftCanard, ([x, y, z]) => [-x, y, z], true);

  renderer.meshes.fighterFuselageV4 = renderer.createMesh(createLathe(fuselageProfile, 30));
  renderer.meshes.fighterEngineV4 = renderer.createMesh(createLathe(engineProfile, 20));
  renderer.meshes.fighterNozzleV4 = renderer.createMesh(createLathe(nozzleProfile, 20));
  renderer.meshes.fighterCanopyV4 = renderer.createMesh(createUvSphere(14, 24));
  renderer.meshes.fighterWingPairV4 = renderer.createMesh(combineMeshes([leftWing, rightWing]));
  renderer.meshes.fighterTailPairV4 = renderer.createMesh(combineMeshes([leftTail, rightTail]));
  renderer.meshes.fighterCanardPairV4 = renderer.createMesh(combineMeshes([leftCanard, rightCanard]));
  renderer.meshes.fighterFinV4 = renderer.createMesh(createVerticalFin(0.22));
  renderer.meshes.fighterBoxV4 = renderer.createMesh(createBoxData());
}

const AIRFRAMES = Object.freeze({
  apex: {
    scale: 1,
    engines: 2,
    canards: true,
    twinFins: true,
    wingScale: [1, 1, 1],
  },
  kestrel: {
    scale: 0.92,
    engines: 1,
    canards: false,
    twinFins: false,
    wingScale: [0.92, 1, 1.08],
  },
  spectre: {
    scale: 1.06,
    engines: 2,
    canards: false,
    twinFins: true,
    wingScale: [1.12, 1, 0.92],
  },
});

export function renderFighter(renderer, state, {
  color = '#dff8ff',
  accent = '#55f7ff',
  canopy = '#5ac8ff',
  airframe = 'apex',
  alpha = 1,
  emissive = 0.22,
  player = false,
  lod = 0,
} = {}) {
  registerFighterMeshes(renderer);
  const spec = AIRFRAMES[airframe] || AIRFRAMES.apex;
  const position = state.position;
  const q = state.orientation;
  const baseScale = spec.scale;
  drawPart(renderer, position, q, 'fighterFuselageV4', {
    scale: [baseScale, baseScale, baseScale], color, alpha, emissive,
  });
  drawPart(renderer, position, q, 'fighterWingPairV4', {
    scale: spec.wingScale.map((value) => value * baseScale), color, alpha, emissive: emissive * 0.82,
  });
  drawPart(renderer, position, q, 'fighterTailPairV4', {
    scale: [baseScale, baseScale, baseScale], color: accent, alpha, emissive: emissive * 1.1,
  });

  if (lod < 2) {
    drawPart(renderer, position, q, 'fighterCanopyV4', {
      localPosition: [0, 0.72, 1.72],
      scale: [0.78 * baseScale, 0.48 * baseScale, 1.62 * baseScale],
      color: canopy,
      alpha: Math.min(alpha, 0.82),
      emissive: 0.52,
      depthWrite: false,
    });
    if (spec.canards) {
      drawPart(renderer, position, q, 'fighterCanardPairV4', {
        scale: [baseScale, baseScale, baseScale], color: accent, alpha, emissive: emissive * 0.9,
      });
    }
  }

  const engineXs = spec.engines === 2 ? [-1.05, 1.05] : [0];
  for (const x of engineXs) {
    drawPart(renderer, position, q, 'fighterEngineV4', {
      localPosition: [x, -0.18, -1.1],
      scale: [0.78 * baseScale, 0.78 * baseScale, 0.82 * baseScale],
      color: lod > 0 ? color : '#9ab4c8', alpha, emissive: emissive * 0.65,
    });
    drawPart(renderer, position, q, 'fighterNozzleV4', {
      localPosition: [x, -0.18, -4.15],
      scale: [0.72 * baseScale, 0.72 * baseScale, 0.82 * baseScale],
      color: '#384452', alpha, emissive: state.afterburnerActive ? 0.95 : 0.34,
    });
  }

  if (lod < 2) {
    const finXs = spec.twinFins ? [-0.88, 0.88] : [0];
    for (const x of finXs) {
      const localRoll = spec.twinFins ? (x < 0 ? -0.12 : 0.12) : 0;
      drawPart(renderer, position, q, 'fighterFinV4', {
        localPosition: [x, 0.42, -3.2],
        localQuaternion: Q.fromAxisAngle([0, 0, 1], localRoll),
        scale: [baseScale, baseScale, baseScale],
        color: accent, alpha, emissive,
      });
    }
    for (const x of [-1.12, 1.12]) {
      drawPart(renderer, position, q, 'fighterBoxV4', {
        localPosition: [x, -0.34, 1.15],
        localQuaternion: Q.fromAxisAngle([1, 0, 0], -0.12),
        scale: [0.45 * baseScale, 0.42 * baseScale, 1.22 * baseScale],
        color: '#1c2d3f', alpha, emissive: 0.2,
      });
    }
  }

  const exhaustLength = 2.2 + clamp(state.speed / 470, 0, 1.3) * 2.8 + (state.afterburnerActive ? 5.8 : 0);
  for (const x of engineXs) {
    const flamePosition = V3.add(position, Q.rotateVector(q, [x, -0.18, -5.1]));
    const flameQuaternion = Q.multiply(q, Q.fromAxisAngle([0, 1, 0], Math.PI));
    drawQuaternion(renderer, 'cone', {
      position: flamePosition,
      quaternion: flameQuaternion,
      scale: [
        (state.afterburnerActive ? 0.7 : 0.38) * baseScale,
        (state.afterburnerActive ? 0.7 : 0.38) * baseScale,
        exhaustLength * baseScale,
      ],
      color: state.afterburnerActive ? '#ff5ce1' : accent,
      alpha: state.afterburnerActive ? 0.86 : 0.54,
      emissive: 1,
      additive: true,
      depthWrite: false,
    });
  }

  if (player) {
    const wingtipLocal = [[-5.1 * baseScale, 0, -0.55], [5.1 * baseScale, 0, -0.55]];
    for (const [index, local] of wingtipLocal.entries()) {
      const world = V3.add(position, Q.rotateVector(q, local));
      renderer.glow('octa', {
        position: world,
        scale: [0.16, 0.16, 0.16],
        color: index === 0 ? '#ff4fd8' : '#75ff9b',
        alpha: 0.85,
        emissive: 1,
        additive: true,
        depthWrite: false,
      }, 0.3, 1.8);
    }
  }
}

export function fighterAttachmentWorld(state, localPosition) {
  return V3.add(state.position, Q.rotateVector(state.orientation, localPosition));
}

export const FIGHTER_AIRFRAMES = AIRFRAMES;
