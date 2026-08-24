/** Lightweight dependency-free WebGL renderer for Impulse Run. */

export const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (v, s) => [v[0] * s, v[1] * s, v[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  length: (v) => Math.hypot(v[0], v[1], v[2]),
  normalize(v) {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

export function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

export function mat4Perspective(fovyRadians, aspect, near, far) {
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

export function mat4LookAt(eye, center, up = [0, 1, 0]) {
  const z = V3.normalize(V3.sub(eye, center));
  let x = V3.normalize(V3.cross(up, z));
  if (V3.length(x) < 1e-5) x = [1, 0, 0];
  const y = V3.cross(z, x);
  const out = mat4Identity();
  out[0] = x[0]; out[1] = y[0]; out[2] = z[0];
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1];
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2];
  out[12] = -V3.dot(x, eye);
  out[13] = -V3.dot(y, eye);
  out[14] = -V3.dot(z, eye);
  return out;
}

function mat4Translation(x, y, z) {
  const out = mat4Identity();
  out[12] = x; out[13] = y; out[14] = z;
  return out;
}

function mat4Scale(x, y, z) {
  const out = mat4Identity();
  out[0] = x; out[5] = y; out[10] = z;
  return out;
}

function mat4RotationX(angle) {
  const c = Math.cos(angle); const s = Math.sin(angle);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}

function mat4RotationY(angle) {
  const c = Math.cos(angle); const s = Math.sin(angle);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

function mat4RotationZ(angle) {
  const c = Math.cos(angle); const s = Math.sin(angle);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function composeMatrix(position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  let out = mat4Translation(position[0], position[1], position[2]);
  out = mat4Multiply(out, mat4RotationZ(rotation[2]));
  out = mat4Multiply(out, mat4RotationY(rotation[1]));
  out = mat4Multiply(out, mat4RotationX(rotation[0]));
  out = mat4Multiply(out, mat4Scale(scale[0], scale[1], scale[2]));
  return out;
}

function parseColor(color) {
  if (Array.isArray(color)) return color.length === 4 ? color : [...color, 1];
  const value = String(color).replace('#', '');
  const normalized = value.length === 3 ? value.split('').map((character) => character + character).join('') : value;
  const numeric = Number.parseInt(normalized, 16);
  return [((numeric >> 16) & 255) / 255, ((numeric >> 8) & 255) / 255, (numeric & 255) / 255, 1];
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGL shader compilation failed: ${error}`);
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
  return V3.normalize(V3.cross(V3.sub(b, a), V3.sub(c, a)));
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
  const top = [0, 1, 0]; const bottom = [0, -1, 0];
  const ring = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]];
  const triangles = [];
  for (let i = 0; i < 4; i += 1) {
    const next = (i + 1) % 4;
    triangles.push([top, ring[i], ring[next]], [bottom, ring[next], ring[i]]);
  }
  return meshFromTriangles(triangles);
}

function createTetrahedronData() {
  const p = [[0, 0.9, 0], [-0.8, -0.55, 0.62], [0.8, -0.55, 0.62], [0, -0.55, -0.82]];
  return meshFromTriangles([[p[0], p[1], p[2]], [p[0], p[2], p[3]], [p[0], p[3], p[1]], [p[1], p[3], p[2]]]);
}

function createJetData() {
  const nose = [0, 0, 3.3];
  const tailTop = [0, 0.48, -2.2];
  const tailBottom = [0, -0.35, -2.1];
  const leftRoot = [-0.65, 0, -0.2];
  const rightRoot = [0.65, 0, -0.2];
  const leftWing = [-3.15, -0.08, -1.15];
  const rightWing = [3.15, -0.08, -1.15];
  const leftTail = [-1.35, 0, -2.25];
  const rightTail = [1.35, 0, -2.25];
  const fin = [0, 1.18, -2.0];
  const triangles = [
    [nose, leftRoot, tailTop], [nose, tailTop, rightRoot],
    [nose, tailBottom, leftRoot], [nose, rightRoot, tailBottom],
    [leftRoot, leftWing, tailBottom], [leftWing, leftTail, tailBottom],
    [rightRoot, tailBottom, rightWing], [rightWing, tailBottom, rightTail],
    [leftRoot, rightRoot, nose], [leftWing, rightWing, leftRoot], [rightWing, rightRoot, leftRoot],
    [tailTop, fin, tailBottom],
    [tailTop, leftRoot, leftTail], [tailTop, leftTail, tailBottom],
    [tailTop, rightTail, rightRoot], [tailTop, tailBottom, rightTail],
  ];
  return meshFromTriangles(triangles);
}

function createTorusData(majorRadius = 1, minorRadius = 0.08, majorSegments = 36, minorSegments = 8) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let i = 0; i <= majorSegments; i += 1) {
    const u = (i / majorSegments) * Math.PI * 2;
    const cu = Math.cos(u); const su = Math.sin(u);
    for (let j = 0; j <= minorSegments; j += 1) {
      const v = (j / minorSegments) * Math.PI * 2;
      const cv = Math.cos(v); const sv = Math.sin(v);
      positions.push((majorRadius + minorRadius * cv) * cu, (majorRadius + minorRadius * cv) * su, minorRadius * sv);
      normals.push(cv * cu, cv * su, sv);
    }
  }
  const row = minorSegments + 1;
  for (let i = 0; i < majorSegments; i += 1) {
    for (let j = 0; j < minorSegments; j += 1) {
      const a = i * row + j;
      const b = (i + 1) * row + j;
      const c = (i + 1) * row + j + 1;
      const d = i * row + j + 1;
      indices.push(a, b, d, b, c, d);
    }
  }
  return { positions, normals, indices, mode: 'triangles' };
}

function createConeData(segments = 18) {
  const triangles = [];
  const tip = [0, 0, 1.4];
  const center = [0, 0, -0.6];
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    const b = ((i + 1) / segments) * Math.PI * 2;
    const p1 = [Math.cos(a), Math.sin(a), -0.6];
    const p2 = [Math.cos(b), Math.sin(b), -0.6];
    triangles.push([tip, p1, p2], [center, p2, p1]);
  }
  return meshFromTriangles(triangles);
}

function createStarData(count = 700, seed = 1) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const positions = [];
  for (let i = 0; i < count; i += 1) {
    const x = (random() * 2 - 1) * 800;
    const y = random() * 420 - 80;
    const z = random() * 1600 - 200;
    positions.push(x, y, z);
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
    gl_PointSize = max(1.0, uPointSize * (520.0 / max(1.0, clip.w)));
    vWorld = world.xyz;
    vNormal = normalize(mat3(uModel) * aNormal);
  }
`;

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
    if (uPointMode > 0.5) {
      vec2 point = gl_PointCoord * 2.0 - 1.0;
      float radius = dot(point, point);
      if (radius > 1.0) discard;
      float core = pow(max(0.0, 1.0 - radius), 1.8);
      float distanceToCamera = distance(vWorld, uCamera);
      float fog = smoothstep(uFogNear, uFogFar, distanceToCamera);
      vec3 star = uColor.rgb * (0.55 + core * 1.7);
      gl_FragColor = vec4(mix(star, uFogColor, fog), uColor.a * (0.25 + core * 0.75));
      return;
    }
    vec3 lightDirection = normalize(vec3(-0.28, 0.7, -0.64));
    float diffuse = max(0.0, dot(normalize(vNormal), lightDirection));
    float rim = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(uCamera - vWorld))), 2.2);
    float light = mix(0.25 + diffuse * 0.75 + rim * 0.32, 1.0, clamp(uEmissive, 0.0, 1.0));
    float distanceToCamera = distance(vWorld, uCamera);
    float fog = smoothstep(uFogNear, uFogFar, distanceToCamera);
    vec3 color = uColor.rgb * light;
    gl_FragColor = vec4(mix(color, uFogColor, fog), uColor.a * (1.0 - fog * 0.55));
  }
`;

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
      jet: this.createMesh(createJetData()),
      torus: this.createMesh(createTorusData()),
      cone: this.createMesh(createConeData()),
      stars: this.createMesh(createStarData()),
    };
    this.fogColor = [0.007, 0.015, 0.035];
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
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * pixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl.viewport(0, 0, width, height);
    }
    return width / height;
  }

  beginFrame({ eye, target, up = [0, 1, 0], fov = 68, fogNear = 90, fogFar = 760 } = {}) {
    const gl = this.gl;
    const aspect = this.resize();
    const projection = mat4Perspective((fov * Math.PI) / 180, aspect, 0.1, 1800);
    const view = mat4LookAt(eye, target, up);
    this.viewProj = mat4Multiply(projection, view);
    this.camera = [...eye];
    this.fogNear = fogNear;
    this.fogFar = fogFar;
    this.drawCalls = 0;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.locations.viewProj, false, this.viewProj);
    gl.uniform3fv(this.locations.camera, this.camera);
    gl.uniform3fv(this.locations.fogColor, this.fogColor);
    gl.uniform1f(this.locations.fogNear, fogNear);
    gl.uniform1f(this.locations.fogFar, fogFar);
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
    gl.uniformMatrix4fv(this.locations.model, false, composeMatrix(position, rotation, scale));
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
    const delta = V3.sub(b, a);
    const length = V3.length(delta);
    const midpoint = V3.scale(V3.add(a, b), 0.5);
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
