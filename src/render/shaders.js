// Shaders GLSL (WebGL2). Se trabaja en espacio de color lineal y al final se aplica
// tone mapping ACES + corrección gamma.
const HEAD = '#version 300 es\nprecision highp float;\n';

// Funciones compartidas: ruido procedural, color del cielo y tone mapping
const COMMON = `
uniform vec3 uSun; uniform vec3 uSunCol; uniform float uTime;
uniform vec3 uHorizon; uniform vec3 uZenith;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
vec3 skyCol(vec3 d) {
  float y = max(d.y, 0.0);
  vec3 c = mix(uHorizon, uZenith, pow(y, 0.5));
  float s = max(dot(d, uSun), 0.0);
  return c + uSunCol * (pow(s, 1500.0) * 30.0 + pow(s, 10.0) * 0.05);
}
vec3 tonemap(vec3 x) {
  x = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  return pow(x, vec3(1.0 / 2.2));
}
`;

// ---- Escena principal ----
export const MAIN_VS = HEAD + `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aCol;
layout(location=3) in vec2 aUv; layout(location=4) in float aMat;
uniform mat4 uVP, uModel, uLightVP;
out vec3 vPos; out vec3 vNor; out vec3 vCol; out vec2 vUv; out float vMat; out vec4 vLight;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vPos = w.xyz; vNor = mat3(uModel) * aNor; vCol = aCol; vUv = aUv; vMat = aMat;
  vLight = uLightVP * w;
  gl_Position = uVP * w;
}`;

export const MAIN_FS = HEAD + 'precision highp sampler2DShadow;\n' + COMMON + `
in vec3 vPos; in vec3 vNor; in vec3 vCol; in vec2 vUv; in float vMat; in vec4 vLight;
uniform sampler2DShadow uShadow; uniform vec3 uCam;
uniform vec3 uGroundA, uGroundB, uGroundC; // colores del suelo según el circuito
uniform float uFog;
out vec4 outColor;

// Sombra suavizada con 9 muestras (PCF)
float shadowAt() {
  vec3 p = vLight.xyz / vLight.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  vec2 t = 1.5 / vec2(textureSize(uShadow, 0));
  float s = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++)
    s += texture(uShadow, vec3(p.xy + vec2(x, y) * t, p.z - 0.0004));
  return s / 9.0;
}

// Color base según el material (asfalto y hierba con textura de ruido)
vec3 albedo(int m, float dist) {
  vec3 b = pow(vCol, vec3(2.2));
  float near = clamp(1.0 - dist / 700.0, 0.0, 1.0);
  if (m == 4) {
    float grain = noise(vPos.xz * 0.7) * 0.5 + noise(vPos.xz * 0.17) * 0.5;
    b *= mix(1.0, 0.75 + 0.5 * grain, near) * (0.8 + 0.4 * fbm(vPos.xz * 0.006));
  }
  if (m == 5) {
    b = mix(uGroundA, uGroundB, fbm(vPos.xz * 0.0025));
    b = mix(b, uGroundC, smoothstep(0.6, 0.8, fbm(vPos.xz * 0.0013 + 3.0)) * 0.6);
    b *= mix(1.0, 0.7 + 0.6 * noise(vPos.xz * 0.45), near);
  }
  if (m == 8) b = pow(0.5 + 0.5 * cos(6.2832 * (uTime * 0.4 + vPos.y * 0.04 + vec3(0.0, 0.33, 0.67))), vec3(2.2));
  if (m == 10) b = vec3(mod(floor(vUv.x) + floor(vUv.y), 2.0) * 0.75 + 0.01);
  return b;
}

// Luz del sol + cielo, brillo especular y reflejos con efecto Fresnel
vec3 shade(int m, vec3 base, vec3 N, vec3 V) {
  float sh = shadowAt(), ndl = max(dot(N, uSun), 0.0);
  vec3 amb = mix(vec3(0.12, 0.11, 0.09), vec3(0.42, 0.5, 0.68), N.y * 0.5 + 0.5) * 0.75;
  vec3 col = base * (amb + uSunCol * ndl * sh);
  float spec = 0.04, gloss = 16.0, refl = 0.0;
  if (m == 1) { spec = 1.2; gloss = 250.0; refl = 0.05; }  // pintura
  if (m == 2) { spec = 2.0; gloss = 400.0; refl = 0.12; }  // cristal
  if (m == 7) { spec = 1.5; gloss = 60.0; refl = 1.0; }    // cromo
  if (m == 8) { spec = 1.0; gloss = 80.0; refl = 0.2; }    // caja arcoíris
  if (m == 4) { spec = 0.1; gloss = 20.0; }                // asfalto
  vec3 H = normalize(uSun + V);
  col += uSunCol * spec * pow(max(dot(N, H), 0.0), gloss) * ndl * sh;
  if (refl > 0.0) {
    vec3 R = reflect(-V, N);
    vec3 env = skyCol(R);
    if (R.y < 0.0) env = mix(env, vec3(0.05, 0.07, 0.04), clamp(-R.y * 5.0, 0.0, 1.0));
    float fr = refl + (1.0 - refl) * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    col = m == 7 ? mix(col, env * base * 1.5, 0.6) : mix(col, env * (0.5 + 0.5 * sh), fr * 0.6);
  }
  return col;
}

void main() {
  int m = int(vMat + 0.5);
  if (m == 9) { // sombra de contacto (semitransparente)
    float a = 1.0 - smoothstep(0.2, 1.0, length(vUv * 2.0 - 1.0));
    outColor = vec4(0.0, 0.0, 0.0, a * 0.45);
    return;
  }
  vec3 V = uCam - vPos; float dist = length(V); V /= dist;
  vec3 N = normalize(vNor);
  if (dot(N, V) < 0.0) N = -N;
  vec3 base = albedo(m, dist);
  vec3 col = m == 3 ? base * 4.0 : shade(m, base, N, V);
  vec3 D = -V;
  float fog = 1.0 - exp(-dist * uFog);
  col = mix(col, skyCol(normalize(vec3(D.x, max(D.y, 0.0) * 0.3 + 0.01, D.z))), fog);
  outColor = vec4(tonemap(col), 1.0);
}`;

// ---- Mapa de sombras: solo profundidad ----
export const SHADOW_VS = HEAD + `
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP, uModel;
void main() { gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`;

export const SHADOW_FS = HEAD + 'void main() {}';

// ---- Cielo: un triángulo que cubre la pantalla ----
export const SKY_VS = HEAD + `
out vec2 vNdc;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  vNdc = p;
  gl_Position = vec4(p, 0.999, 1.0);
}`;

export const SKY_FS = HEAD + COMMON + `
in vec2 vNdc;
uniform vec3 uFwd, uRight, uUp; uniform vec2 uTan;
uniform float uClouds; // umbral de nubes: más bajo = más nublado
out vec4 outColor;
void main() {
  vec3 d = normalize(uFwd + vNdc.x * uTan.x * uRight + vNdc.y * uTan.y * uUp);
  vec3 col = skyCol(d);
  if (d.y > 0.0) { // nubes que se mueven
    vec2 uv = d.xz / (d.y + 0.08) * 1.2 + vec2(uTime * 0.006, uTime * 0.002);
    float c = smoothstep(uClouds, uClouds + 0.3, fbm(uv * 1.6));
    float lit = 0.8 + 0.3 * max(dot(d, uSun), 0.0);
    col = mix(col, vec3(1.05, 1.0, 0.97) * 1.3 * lit, c * smoothstep(0.0, 0.25, d.y) * 0.9);
  }
  outColor = vec4(tonemap(col), 1.0);
}`;
