// Calidad gráfica automática: si el juego va lento, baja la resolución; si va sobrado, la sube.
// También detecta si el navegador está dibujando sin tarjeta gráfica (por software).
import { gl } from './renderer.js';

const MIN_SCALE = 0.4, STEP = 0.1;
const SLOW_MS = 22, FAST_MS = 18; // tiempo entre fotogramas (60 fps = 16,7 ms)

export const quality = { scale: 1, software: false };
let avg = 16.7, frames = 0, wait = 90;

export function detectSoftware() {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
  quality.software = /swiftshader|basic render|llvmpipe|software/i.test(name);
  if (quality.software) quality.scale = 0.5;
  return quality.software;
}

// Llamar cada fotograma con los ms que han pasado. Devuelve true si ha cambiado la escala.
export function adaptQuality(frameMs) {
  if (document.hidden) return false;
  avg += (Math.min(frameMs, 100) - avg) * 0.05;
  if (++frames < wait) return false;
  if (avg > SLOW_MS && quality.scale > MIN_SCALE) {
    quality.scale = +(quality.scale - STEP).toFixed(2);
    frames = 0; wait = 90;
    return true;
  }
  if (avg < FAST_MS && quality.scale < 1) {
    quality.scale = +(quality.scale + STEP).toFixed(2);
    frames = 0; wait = 600; // tras subir, espera más antes de volver a probar
    return true;
  }
  return false;
}
