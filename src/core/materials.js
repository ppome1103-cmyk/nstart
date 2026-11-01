import * as THREE from 'three';

// 공용 재질 모음. 같은 색은 같은 재질을 재사용해서 합치기(merge)와 성능에 유리하게.
let gradientMap = null;
export function getGradientMap() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([110, 110, 110, 255, 185, 185, 185, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const cache = new Map();
export function toon(color, opts = {}) {
  const key = `${new THREE.Color(color).getHexString()}|${JSON.stringify(opts)}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: getGradientMap(), ...opts });
    cache.set(key, m);
  }
  return m;
}

const basicCache = new Map();
export function basic(color, opts = {}) {
  const key = `${new THREE.Color(color).getHexString()}|${JSON.stringify(opts)}`;
  let m = basicCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, ...opts });
    basicCache.set(key, m);
  }
  return m;
}

// 밤에 빛나는 재질 (전구, 네온). setNight(f)로 한 번에 밝기 조절.
const glowMats = [];
export function glow(color, dayLevel = 0.15) {
  const key = `glow|${new THREE.Color(color).getHexString()}|${dayLevel}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color,
      emissive: color,
      emissiveIntensity: dayLevel,
      gradientMap: getGradientMap(),
    });
    m.userData.dayLevel = dayLevel;
    cache.set(key, m);
    glowMats.push(m);
  }
  return m;
}

export function setGlowLevel(night) {
  for (const m of glowMats) {
    m.emissiveIntensity = THREE.MathUtils.lerp(m.userData.dayLevel, 1.6, night);
  }
}

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

// 줄무늬 텍스처 (천막, 지붕)
const stripeCache = new Map();
export function stripeTexture(c1, c2, stripes = 8, horizontal = false) {
  const key = `${c1}|${c2}|${stripes}|${horizontal}`;
  if (stripeCache.has(key)) return stripeCache.get(key);
  const c = document.createElement('canvas');
  c.width = horizontal ? 4 : 256;
  c.height = horizontal ? 256 : 4;
  const g = c.getContext('2d');
  const n = stripes * 2;
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? c2 : c1;
    if (horizontal) g.fillRect(0, (i * c.height) / n, c.width, c.height / n + 1);
    else g.fillRect((i * c.width) / n, 0, c.width / n + 1, c.height);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  stripeCache.set(key, t);
  return t;
}

export function stripeMat(c1, c2, stripes, horizontal) {
  const key = `stripe|${c1}|${c2}|${stripes}|${horizontal}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({
      map: stripeTexture(c1, c2, stripes, horizontal),
      gradientMap: getGradientMap(),
    });
    cache.set(key, m);
  }
  return m;
}

// 간판 글씨 텍스처
export function signTexture(text, { bg = '#ff8fb4', fg = '#ffffff', font = 64, padding = 0.6, border = '#ffffff' } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const f = `900 ${font}px "Apple SD Gothic Neo","Noto Sans KR",sans-serif`;
  g.font = f;
  const w = Math.ceil(g.measureText(text).width + font * padding * 2);
  const h = Math.ceil(font * 1.6);
  c.width = w;
  c.height = h;
  g.font = f;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(4, 4, w - 8, h - 8, h * 0.3);
  g.fill();
  if (border) {
    g.lineWidth = 6;
    g.strokeStyle = border;
    g.stroke();
  }
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + font * 0.05);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { tex: t, aspect: w / h };
}

export function makeSign(text, height = 1, opts) {
  const { tex, aspect } = signTexture(text, opts);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(height * aspect, height),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }),
  );
  mesh.userData.dynamic = true; // 텍스처 재질은 합치지 않기
  return mesh;
}

export const PASTEL = {
  pink: 0xff9fc0,
  hotpink: 0xff6fa0,
  sky: 0x8fd0ff,
  blue: 0x6fa8ff,
  mint: 0x8fe3c0,
  lavender: 0xc4a8ff,
  yellow: 0xffd86b,
  peach: 0xffab8f,
  cream: 0xfff3e6,
  white: 0xffffff,
  red: 0xff6b6b,
  wood: 0xc9926b,
  darkwood: 0x8a5a3c,
  gold: 0xffc94a,
  gray: 0xc7c2d6,
  darkgray: 0x6f6a80,
  green: 0x7fd67a,
  purple: 0x8f6fd0,
};
