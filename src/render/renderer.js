// Motor de render WebGL2: compila shaders, sube la geometría y dibuja cada fotograma
// en tres pasadas: sombras -> cielo -> escena.
import { SHADOW_SIZE as SHADOW_SIZE_PC, IS_TOUCH, TRACK_WIDTH } from '../config.js';
import { modelMatrix, IDENTITY } from '../core/mat4.js';
import { game } from '../game/state.js';
import { track, bankRoll, sideOf } from '../game/track.js';
import { cameraView, lightMatrix } from './camera.js';
import { FLOATS_PER_VERTEX } from './geometry.js';
import { MAIN_VS, MAIN_FS, SHADOW_VS, SHADOW_FS, SKY_VS, SKY_FS } from './shaders.js';
import { buildWorld, buildProps, buildLights, buildLoopLane } from './world.js';
import { buildLambo, buildKart, buildItemBox, buildBanana, buildCoco, COCO_R, buildIce, buildFlame, buildBlob, buildHeadlights } from './models.js';

const SHADOW_SIZE = IS_TOUCH ? 1024 : SHADOW_SIZE_PC; // sombras más ligeras en móvil

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
  const vao = gl.createVertexArray(), buf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  let off = 0;
  [3, 3, 3, 2, 1].forEach((size, i) => { // posición, normal, color, uv, material
    gl.enableVertexAttribArray(i);
    gl.vertexAttribPointer(i, size, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, off);
    off += size * 4;
  });
  gl.bindVertexArray(null);
  return { vao, buf, count: data.length / FLOATS_PER_VERTEX };
}

function release(mesh) {
  if (!mesh) return;
  gl.deleteBuffer(mesh.buf);
  gl.deleteVertexArray(mesh.vao);
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

// Llamar después de construir la primera pista
export function initRenderer() {
  progMain = program(MAIN_VS, MAIN_FS);
  progShadow = program(SHADOW_VS, SHADOW_FS);
  progSky = program(SKY_VS, SKY_FS);
  shadowMap = makeShadowMap();
  emptyVao = gl.createVertexArray();
  loadWorld();
  meshes.box = upload(buildItemBox());
  meshes.banana = upload(buildBanana());
  meshes.coco = upload(buildCoco());
  meshes.flames = [upload(buildFlame(18)), upload(buildFlame(24))];
  meshes.blob = upload(buildBlob());
  meshes.headlights = upload(buildHeadlights());
}

// Vuelve a generar el escenario del circuito actual (al cambiar de mapa)
export function loadWorld() {
  release(meshes.world);
  release(meshes.props);
  release(meshes.lights);
  meshes.world = upload(buildWorld());
  meshes.props = upload(buildProps());
  meshes.lights = track.map.theme.night ? upload(buildLights()) : null;
  release(meshes.loop);
  meshes.loop = track.loop ? upload(buildLoopLane()) : null;
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

// en la curva peraltada el coche se inclina según por dónde va de la pared
const carModel = c => modelMatrix(c.x, c.y, c.angle, c.z, c.pitch, c.loop >= 0 ? 0 : bankRoll(c.seg, sideOf(c.seg, c.x, c.y)));
// sombra de contacto y faros: en el suelo bajo el coche (también si va por un puente)
const groundModel = c => modelMatrix(c.x, c.y, c.angle, c.ground || 0);

// Todo lo que proyecta sombra
function drawCasters(prog, t) {
  drawMesh(prog, meshes.props, IDENTITY);
  if (meshes.loop) { // carril del looping: solo por dentro (en la sombra, entero)
    if (prog === progMain) gl.enable(gl.CULL_FACE);
    drawMesh(prog, meshes.loop, IDENTITY);
    gl.disable(gl.CULL_FACE);
  }
  game.cars.forEach(c => drawMesh(prog, carMesh(c), carModel(c)));
  game.boxes.forEach(b => {
    if (b.t <= 0) drawMesh(prog, meshes.box, modelMatrix(b.x, b.y, t * 1.5, (b.h || 0) + 20 + Math.sin(t * 3) * 3));
  });
  game.bananas.forEach(b => drawMesh(prog, meshes.banana, modelMatrix(b.x, b.y, 0, b.h || 0)));
  game.coconuts.forEach(k => drawMesh(prog, meshes.coco, modelMatrix(k.x, k.y, k.angle, (k.h || 0) + COCO_R, -k.roll)));
}

// Las placas de hielo se construyen al aparecer y se borran al derretirse
const iceMeshes = new Map();
function drawIces() {
  const keep = new Set();
  game.ices.forEach(ice => {
    const key = ice.seg + ':' + ice.segs;
    keep.add(key);
    if (!iceMeshes.has(key)) iceMeshes.set(key, upload(buildIce(track.points, ice.seg, ice.segs, TRACK_WIDTH / 2)));
    drawMesh(progMain, iceMeshes.get(key), IDENTITY);
  });
  iceMeshes.forEach((mesh, key) => { if (!keep.has(key)) { release(mesh); iceMeshes.delete(key); } });
}

// Luz y cielo del circuito actual
function setLight(prog, t) {
  const th = track.map.theme;
  gl.uniform3fv(loc(prog, 'uSun'), th.sun);
  gl.uniform3fv(loc(prog, 'uSunCol'), th.sunCol);
  gl.uniform3fv(loc(prog, 'uHorizon'), th.horizon);
  gl.uniform3fv(loc(prog, 'uZenith'), th.zenith);
  gl.uniform1f(loc(prog, 'uDisc'), th.disc ?? 1500);
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
  gl.uniform1f(loc(progSky, 'uClouds'), track.map.theme.clouds);
  gl.uniform1f(loc(progSky, 'uStars'), track.map.theme.stars ?? 0);
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
  const th = track.map.theme;
  ['uGroundA', 'uGroundB', 'uGroundC'].forEach((name, i) => gl.uniform3fv(loc(progMain, name), th.ground[i]));
  gl.uniform1f(loc(progMain, 'uFog'), th.fog);
  gl.uniform1f(loc(progMain, 'uAmbient'), th.ambient ?? 1);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, shadowMap.tex);
  gl.uniform1i(loc(progMain, 'uShadow'), 0);
  drawMesh(progMain, meshes.world, IDENTITY);
  drawIces();
  drawCasters(progMain, t);
  game.cars.forEach(c => {
    if (c.boost > 0) drawMesh(progMain, meshes.flames[Math.random() < 0.5 ? 0 : 1], carModel(c));
  });
  drawBlobs();
  if (meshes.lights) drawLights();
}

function drawBlobs() {
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  game.cars.forEach(c => drawMesh(progMain, meshes.blob, groundModel(c)));
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

// 4) De noche: charcos de luz de las farolas y faros de los coches, que se suman a lo de debajo.
// Es una forma barata de "iluminar" sin calcular luces de verdad.
function drawLights() {
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.depthMask(false);
  drawMesh(progMain, meshes.lights, IDENTITY);
  game.cars.forEach(c => { if (c.sink <= 0) drawMesh(progMain, meshes.headlights, groundModel(c)); });
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
