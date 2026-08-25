/** Dependency-free WebGL renderer for Apex Relational Racing. */

const Vec3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (v, s) => [v[0] * s, v[1] * s, v[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  length: (v) => Math.hypot(v[0], v[1], v[2]),
  normalize(v) {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  },
};

function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[row] * b[column * 4]
        + a[4 + row] * b[column * 4 + 1]
        + a[8 + row] * b[column * 4 + 2]
        + a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function mat4Perspective(fovyRadians, aspect, near, far) {
  const f = 1 / Math.tan(fovyRadians / 2);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

function mat4LookAt(eye, center, up = [0, 1, 0]) {
  const z = Vec3.normalize(Vec3.sub(eye, center));
  let x = Vec3.normalize(Vec3.cross(up, z));
  if (Vec3.length(x) < 1e-5) x = [1, 0, 0];
  const y = Vec3.cross(z, x);
  const out = mat4Identity();
  out[0] = x[0]; out[1] = y[0]; out[2] = z[0];
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1];
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2];
  out[12] = -Vec3.dot(x, eye);
  out[13] = -Vec3.dot(y, eye);
  out[14] = -Vec3.dot(z, eye);
  return out;
}

function composeEulerMatrix(position, rotation, scale) {
  const [rx, ry, rz] = rotation;
  const [sx, sy, sz] = scale;
  const cx = Math.cos(rx); const sxn = Math.sin(rx);
  const cy = Math.cos(ry); const syn = Math.sin(ry);
  const cz = Math.cos(rz); const szn = Math.sin(rz);
  // Rz * Ry * Rx, with scale applied to basis columns.
  return new Float32Array([
    (cz * cy) * sx,
    (szn * cy) * sx,
    (-syn) * sx,
    0,
    (cz * syn * sxn - szn * cx) * sy,
    (szn * syn * sxn + cz * cx) * sy,
    (cy * sxn) * sy,
    0,
    (cz * syn * cx + szn * sxn) * sz,
    (szn * syn * cx - cz * sxn) * sz,
    (cy * cx) * sz,
    0,
    position[0], position[1], position[2], 1,
  ]);
}

function parseColor(color) {
  if (Array.isArray(color)) return color.length === 4 ? [...color] : [...color, 1];
  const value = String(color).replace('#', '');
  const normalized = value.length === 3 ? value.split('').map((character) => character + character).join('') : value;
  const numeric = Number.parseInt(normalized, 16);
  return [
    ((numeric >> 16) & 255) / 255,
    ((numeric >> 8) & 255) / 255,
    (numeric & 255) / 255,
    1,
  ];
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGL shader compilation failed: ${message}`);
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`WebGL program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

function faceNormal(a, b, c) {
  return Vec3.normalize(Vec3.cross(Vec3.sub(b, a), Vec3.sub(c, a)));
}

function meshFromTriangles(triangles) {
  const positions = [];
  const normals = [];
  for (const triangle of triangles) {
    const normal = faceNormal(triangle[0], triangle[1], triangle[2]);
    for (const vertex of triangle) {
      positions.push(...vertex);
      normals.push(...normal);
    }
  }
  return { positions, normals, mode: 'triangles' };
}

function createCubeData() {
  const p = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
  ];
  const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
  const triangles = [];
  for (const [a, b, c, d] of faces) triangles.push([p[a], p[b], p[c]], [p[a], p[c], p[d]]);
  return meshFromTriangles(triangles);
}

function createOctahedronData() {
  const top = [0, 1, 0];
  const bottom = [0, -1, 0];
  const ring = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]];
  const triangles = [];
  for (let index = 0; index < 4; index += 1) {
    const next = (index + 1) % 4;
    triangles.push([top, ring[index], ring[next]], [bottom, ring[next], ring[index]]);
  }
  return meshFromTriangles(triangles);
}

function createTetrahedronData() {
  const p = [[0, 0.9, 0], [-0.8, -0.55, 0.62], [0.8, -0.55, 0.62], [0, -0.55, -0.82]];
  return meshFromTriangles([
    [p[0], p[1], p[2]], [p[0], p[2], p[3]], [p[0], p[3], p[1]], [p[1], p[3], p[2]],
  ]);
}

function createTorusData(majorRadius = 1, minorRadius = 0.08, majorSegments = 40, minorSegments = 9) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let major = 0; major <= majorSegments; major += 1) {
    const u = major / majorSegments * Math.PI * 2;
    const cu = Math.cos(u); const su = Math.sin(u);
    for (let minor = 0; minor <= minorSegments; minor += 1) {
      const v = minor / minorSegments * Math.PI * 2;
      const cv = Math.cos(v); const sv = Math.sin(v);
      positions.push((majorRadius + minorRadius * cv) * cu, (majorRadius + minorRadius * cv) * su, minorRadius * sv);
      normals.push(cv * cu, cv * su, sv);
    }
  }
  const row = minorSegments + 1;
  for (let major = 0; major < majorSegments; major += 1) {
    for (let minor = 0; minor < minorSegments; minor += 1) {
      const a = major * row + minor;
      const b = (major + 1) * row + minor;
      const c = (major + 1) * row + minor + 1;
      const d = major * row + minor + 1;
      indices.push(a, b, d, b, c, d);
    }
  }
  return { positions, normals, indices, mode: 'triangles' };
}

function createConeData(segments = 22) {
  const triangles = [];
  const tip = [0, 0, 1.4];
  const center = [0, 0, -0.6];
  for (let index = 0; index < segments; index += 1) {
    const a = index / segments * Math.PI * 2;
    const b = (index + 1) / segments * Math.PI * 2;
    const p1 = [Math.cos(a), Math.sin(a), -0.6];
    const p2 = [Math.cos(b), Math.sin(b), -0.6];
    triangles.push([tip, p1, p2], [center, p2, p1]);
  }
  return meshFromTriangles(triangles);
}

function createStarData(count = 900, seed = 1) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const positions = [];
  for (let index = 0; index < count; index += 1) {
    positions.push(
      (random() * 2 - 1) * 1050,
      random() * 650 - 120,
      random() * 2200 - 350,
    );
  }
  return { positions, normals: new Array(count * 3).fill(0), mode: 'points' };
}

const VERTEX_SHADER = `
precision highp float;
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform float uPointSize;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vec4 clip = uViewProj * world;
  gl_Position = clip;
  gl_PointSize = max(1.0, uPointSize * (640.0 / max(1.0, clip.w)));
  vWorld = world.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
}`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec4 uColor;
uniform vec3 uCamera;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uEmissive;
uniform float uPointMode;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  float distanceToCamera = distance(vWorld, uCamera);
  float fog = smoothstep(uFogNear, uFogFar, distanceToCamera);
  if (uPointMode > 0.5) {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float radius = dot(point, point);
    if (radius > 1.0) discard;
    float core = pow(max(0.0, 1.0 - radius), 1.7);
    vec3 star = uColor.rgb * (0.45 + core * 1.9);
    gl_FragColor = vec4(mix(star, uFogColor, fog), uColor.a * (0.2 + core * 0.8));
    return;
  }
  vec3 lightDirection = normalize(vec3(-0.28, 0.72, -0.63));
  vec3 normal = normalize(vNormal);
  float diffuse = max(0.0, dot(normal, lightDirection));
  float rim = pow(1.0 - max(0.0, dot(normal, normalize(uCamera - vWorld))), 2.15);
  float light = mix(0.22 + diffuse * 0.74 + rim * 0.42, 1.0, clamp(uEmissive, 0.0, 1.0));
  vec3 color = uColor.rgb * light;
  gl_FragColor = vec4(mix(color, uFogColor, fog), uColor.a * (1.0 - fog * 0.58));
}`;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { antialias: true, alpha: true, powerPreference: 'high-performance' })
      || canvas.getContext('webgl', { antialias: true, alpha: true, powerPreference: 'high-performance' });
    if (!this.gl) throw new Error('WebGL is unavailable in this browser.');
    const gl = this.gl;
    this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.locations = {
      position: gl.getAttribLocation(this.program, 'aPosition'),
      normal: gl.getAttribLocation(this.program, 'aNormal'),
      model: gl.getUniformLocation(this.program, 'uModel'),
      viewProj: gl.getUniformLocation(this.program, 'uViewProj'),
      color: gl.getUniformLocation(this.program, 'uColor'),
      camera: gl.getUniformLocation(this.program, 'uCamera'),
      fogColor: gl.getUniformLocation(this.program, 'uFogColor'),
      fogNear: gl.getUniformLocation(this.program, 'uFogNear'),
      fogFar: gl.getUniformLocation(this.program, 'uFogFar'),
      emissive: gl.getUniformLocation(this.program, 'uEmissive'),
      pointMode: gl.getUniformLocation(this.program, 'uPointMode'),
      pointSize: gl.getUniformLocation(this.program, 'uPointSize'),
    };
    this.meshes = {
      cube: this.createMesh(createCubeData()),
      octa: this.createMesh(createOctahedronData()),
      tetra: this.createMesh(createTetrahedronData()),
      torus: this.createMesh(createTorusData()),
      cone: this.createMesh(createConeData()),
      stars: this.createMesh(createStarData()),
    };
    this.fogColor = [0.006, 0.012, 0.03];
    this.camera = [0, 0, 0];
    this.viewProj = mat4Identity();
    this.drawCalls = 0;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.002, 0.006, 0.018, 0);
  }

  createMesh(data) {
    const gl = this.gl;
    const mesh = {
      position: gl.createBuffer(),
      normal: gl.createBuffer(),
      index: null,
      count: data.indices ? data.indices.length : data.positions.length / 3,
      mode: data.mode === 'points' ? gl.POINTS : gl.TRIANGLES,
      indexed: Boolean(data.indices),
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.position);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.positions), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normal);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.normals || new Array(data.positions.length).fill(0)), gl.STATIC_DRAW);
    if (data.indices) {
      mesh.index = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.indices), gl.STATIC_DRAW);
    }
    return mesh;
  }

  resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.65);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * pixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl.viewport(0, 0, width, height);
    }
    return width / height;
  }

  beginFrame({ eye, target, up = [0, 1, 0], fov = 68, fogNear = 100, fogFar = 1200 } = {}) {
    const aspect = this.resize();
    this.camera = [...eye];
    this.fogNear = fogNear;
    this.fogFar = fogFar;
    this.viewProj = mat4Multiply(mat4Perspective(fov * Math.PI / 180, aspect, 0.1, 2600), mat4LookAt(eye, target, up));
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.locations.viewProj, false, this.viewProj);
    gl.uniform3fv(this.locations.camera, this.camera);
    gl.uniform3fv(this.locations.fogColor, this.fogColor);
    gl.uniform1f(this.locations.fogNear, fogNear);
    gl.uniform1f(this.locations.fogFar, fogFar);
    this.drawCalls = 0;
  }

  draw(meshName, {
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = [1, 1, 1],
    color = '#ffffff',
    alpha = 1,
    emissive = 0,
    additive = false,
    depthWrite = true,
    pointSize = 2,
  } = {}) {
    const gl = this.gl;
    const mesh = typeof meshName === 'string' ? this.meshes[meshName] : meshName;
    if (!mesh) return;
    const rgba = parseColor(color);
    rgba[3] *= alpha;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.locations.model, false, composeEulerMatrix(position, rotation, scale));
    gl.uniform4fv(this.locations.color, rgba);
    gl.uniform1f(this.locations.emissive, emissive);
    gl.uniform1f(this.locations.pointMode, mesh.mode === gl.POINTS ? 1 : 0);
    gl.uniform1f(this.locations.pointSize, pointSize);
    gl.depthMask(depthWrite);
    gl.blendFunc(gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.position);
    gl.enableVertexAttribArray(this.locations.position);
    gl.vertexAttribPointer(this.locations.position, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normal);
    gl.enableVertexAttribArray(this.locations.normal);
    gl.vertexAttribPointer(this.locations.normal, 3, gl.FLOAT, false, 0, 0);
    if (mesh.indexed) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
      gl.drawElements(mesh.mode, mesh.count, gl.UNSIGNED_SHORT, 0);
    } else {
      gl.drawArrays(mesh.mode, 0, mesh.count);
    }
    this.drawCalls += 1;
    gl.depthMask(true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  glow(meshName, options = {}, strength = 0.18, expansion = 1.18) {
    const scale = options.scale || [1, 1, 1];
    this.draw(meshName, {
      ...options,
      scale: scale.map((value) => value * expansion),
      alpha: (options.alpha ?? 1) * strength,
      emissive: 1,
      additive: true,
      depthWrite: false,
    });
  }

  drawBar(a, b, width, color, options = {}) {
    const delta = Vec3.sub(b, a);
    const length = Vec3.length(delta);
    if (length < 1e-5) return;
    const midpoint = Vec3.scale(Vec3.add(a, b), 0.5);
    const yaw = Math.atan2(delta[0], delta[2]);
    const horizontal = Math.hypot(delta[0], delta[2]);
    const pitch = -Math.atan2(delta[1], horizontal);
    this.draw('cube', {
      position: midpoint,
      rotation: [pitch, yaw, 0],
      scale: [width, width, length],
      color,
      ...options,
    });
  }

  setFogColor(color) {
    this.fogColor = parseColor(color).slice(0, 3);
  }
}

export const RendererMath = Object.freeze({ mat4Identity, mat4Multiply, mat4Perspective, mat4LookAt, composeEulerMatrix });
