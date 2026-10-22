// Motor de render WebGL2: compila shaders, sube la geometría y dibuja cada fotograma
// en tres pasadas: sombras -> cielo -> escena.
import { SUN, SUN_COL, SHADOW_SIZE } from '../config.js';
import { modelMatrix, IDENTITY } from '../core/mat4.js';
import { game } from '../game/state.js';
import { cameraView, lightMatrix } from './camera.js';
import { FLOATS_PER_VERTEX } from './geometry.js';
import { MAIN_VS, MAIN_FS, SHADOW_VS, SHADOW_FS, SKY_VS, SKY_FS } from './shaders.js';
import { buildWorld, buildProps } from './world.js';
import { buildLambo, buildKart, buildItemBox, buildBanana, buildFlame, buildBlob } from './models.js';

export const canvas = document.getElementById('gl');
export const gl = canvas.getContext('webgl2', { antialias: true });

let progMain, progShadow, progSky, shadowMap, emptyVao;
const meshes = {};
const carMeshes = {};

// ---- Preparación ----
function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function program(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  p.locs = {};
  return p;
}

// Posición de un uniform (se guarda para no buscarla cada fotograma)
function loc(p, name) {
  if (!(name in p.locs)) p.locs[name] = gl.getUniformLocation(p, name);
  return p.locs[name];
}

function upload(data) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  let off = 0;
  [3, 3, 3, 2, 1].forEach((size, i) => { // posición, normal, color, uv, material
    gl.enableVertexAttribArray(i);
    gl.vertexAttribPointer(i, size, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, off);
    off += size * 4;
  });
  gl.bindVertexArray(null);
  return { vao, count: data.length / FLOATS_PER_VERTEX };
}

function makeShadowMap() {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo };
}

// Llamar después de construir la pista
export function initRenderer() {
  progMain = program(MAIN_VS, MAIN_FS);
  progShadow = program(SHADOW_VS, SHADOW_FS);
  progSky = program(SKY_VS, SKY_FS);
  shadowMap = makeShadowMap();
  emptyVao = gl.createVertexArray();
  meshes.world = upload(buildWorld());
  meshes.props = upload(buildProps());
  meshes.box = upload(buildItemBox());
  meshes.banana = upload(buildBanana());
  meshes.flames = [upload(buildFlame(18)), upload(buildFlame(24))];
  meshes.blob = upload(buildBlob());
}

// Un modelo por tipo y color de coche, creado la primera vez que se necesita
function carMesh(c) {
  const key = c.model + c.color;
  if (!carMeshes[key]) carMeshes[key] = upload(c.model === 'lambo' ? buildLambo(c.color) : buildKart(c.color));
  return carMeshes[key];
}

// ---- Dibujo ----
function drawMesh(prog, mesh, model) {
  gl.uniformMatrix4fv(loc(prog, 'uModel'), false, model);
  gl.bindVertexArray(mesh.vao);
  gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
}

const carModel = c => modelMatrix(c.x, c.y, c.angle);

// Todo lo que proyecta sombra
function drawCasters(prog, t) {
  drawMesh(prog, meshes.props, IDENTITY);
  game.cars.forEach(c => drawMesh(prog, carMesh(c), carModel(c)));
  game.boxes.forEach(b => {
    if (b.t <= 0) drawMesh(prog, meshes.box, modelMatrix(b.x, b.y, t * 1.5, 20 + Math.sin(t * 3) * 3));
  });
  game.bananas.forEach(b => drawMesh(prog, meshes.banana, modelMatrix(b.x, b.y, 0)));
}

function setLight(prog, t) {
  gl.uniform3fv(loc(prog, 'uSun'), SUN);
  gl.uniform3fv(loc(prog, 'uSunCol'), SUN_COL);
  gl.uniform1f(loc(prog, 'uTime'), t);
}

// 1) Profundidad vista desde el sol
function shadowPass(lightVP, t) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowMap.fbo);
  gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(2, 4); // evita el "acné" de las sombras
  gl.useProgram(progShadow);
  gl.uniformMatrix4fv(loc(progShadow, 'uLightVP'), false, lightVP);
  drawCasters(progShadow, t);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// 2) Cielo con nubes de fondo
function skyPass(v, t) {
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(progSky);
  setLight(progSky, t);
  gl.uniform3fv(loc(progSky, 'uFwd'), v.fwd);
  gl.uniform3fv(loc(progSky, 'uRight'), v.right);
  gl.uniform3fv(loc(progSky, 'uUp'), v.up);
  gl.uniform2fv(loc(progSky, 'uTan'), v.tan);
  gl.bindVertexArray(emptyVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// 3) Escena con luz, sombras y reflejos
function mainPass(v, lightVP, t) {
  gl.enable(gl.DEPTH_TEST);
  gl.useProgram(progMain);
  setLight(progMain, t);
  gl.uniformMatrix4fv(loc(progMain, 'uVP'), false, v.VP);
  gl.uniformMatrix4fv(loc(progMain, 'uLightVP'), false, lightVP);
  gl.uniform3fv(loc(progMain, 'uCam'), v.eye);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, shadowMap.tex);
  gl.uniform1i(loc(progMain, 'uShadow'), 0);
  drawMesh(progMain, meshes.world, IDENTITY);
  drawCasters(progMain, t);
  game.cars.forEach(c => {
    if (c.boost > 0) drawMesh(progMain, meshes.flames[Math.random() < 0.5 ? 0 : 1], carModel(c));
  });
  drawBlobs();
}

function drawBlobs() {
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  game.cars.forEach(c => drawMesh(progMain, meshes.blob, carModel(c)));
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

// t = tiempo en segundos (anima nubes y cajas)
export function render(t) {
  const v = cameraView(canvas.width / canvas.height), lightVP = lightMatrix();
  shadowPass(lightVP, t);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  skyPass(v, t);
  mainPass(v, lightVP, t);
}
