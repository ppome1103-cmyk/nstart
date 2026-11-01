import * as THREE from 'three';
import { Ride } from './Ride.js';
import { Track, simulate } from '../core/track.js';
import { flumePoints } from './flumePath.js';
import { toon, glow, makeSign, PASTEL } from '../core/materials.js';
import { mergeStatic, mesh } from '../core/merge.js';
import { clamp } from '../core/rng.js';

const START_S = 2;

// 물길 단면을 레일을 따라 밀어서 만들기
function troughGeometry(track, profile) {
  const pos = [];
  const idx = [];
  const b = new THREE.Vector3();
  const rows = track.n + 1;
  const cols = profile.length;
  for (let i = 0; i < rows; i++) {
    const p = track.pos[i];
    const u = track.up[i];
    b.crossVectors(u, track.tan[i]).normalize();
    for (const [x, y] of profile) {
      pos.push(p.x + b.x * x + u.x * y, p.y + b.y * x + u.y * y, p.z + b.z * x + u.z * y);
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      const c = (i + 1) * cols + j;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function waterGeometry(track, width, height) {
  const pos = [];
  const uv = [];
  const idx = [];
  const b = new THREE.Vector3();
  for (let i = 0; i <= track.n; i++) {
    const p = track.pos[i];
    const u = track.up[i];
    b.crossVectors(u, track.tan[i]).normalize();
    for (const s of [-1, 1]) {
      pos.push(p.x + b.x * width * s + u.x * height, p.y + b.y * width * s + u.y * height, p.z + b.z * width * s + u.z * height);
      uv.push(s > 0 ? 1 : 0, (i * track.step) / 3);
    }
  }
  for (let i = 0; i < track.n; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 🌊 통나무 후룸
export class Flume extends Ride {
  constructor(ctx) {
    super(ctx, {
      id: 'flume',
      name: '퐁당 통나무',
      icon: '🌊',
      mode: 'run',
      seats: 4,
      countdown: 8,
      cam: 'first',
      board: { x: -43, z: 0.5, r: 3.6 },
      exit: { x: -42.5, z: 4, ry: Math.PI / 2 },
    });
    const tr = (this.track = new Track(flumePoints(), { closed: true, spacing: 0.5 }));
    const L = tr.length;
    // 구간 찾기
    let liftA = 0;
    let liftB = 0;
    let dropA = 0;
    let splash = 0;
    for (let i = 0; i < tr.n; i++) {
      const s = i * tr.step;
      const ty = tr.tan[i].y;
      if (!liftA && ty > 0.3) liftA = s - 1;
      if (liftA && !liftB && ty < 0.2 && s > liftA + 3) liftB = s;
      if (liftB && !dropA && ty < -0.25) dropA = s - 1;
      if (dropA && !splash && ty > -0.1 && s > dropA + 3) splash = s;
    }
    Object.assign(this, { liftA, liftB, dropA, splashS: splash });
    const wrap = (s) => ((s % L) + L) % L;
    this.sim = simulate(tr, {
      s0: START_S,
      sEnd: L + START_S,
      v0: 0,
      rule: (s, v, g, dt) => {
        const w = wrap(s);
        if (s > L - 5) return Math.max(0.8, v - 2 * dt);
        if (w >= liftA && w < liftB && s < L) return 2.0;
        if (w >= splash && w < splash + 7) return Math.max(2.8, v - 14 * dt);
        if (w >= dropA && w < splash) return v + (g - 0.004 * v * v) * dt;
        // 물살: 2.6 m/s 쪽으로
        return v + (g * 0.6 + (2.6 - v) * 1.2) * dt;
      },
    });
    this.duration = this.sim.duration + 1;
    const tAt = (target) => {
      for (let t = 0; t < this.sim.duration; t += 0.02) if (this.sim.sAt(t) >= target) return t;
      return 0;
    };
    this.tSplash = tAt(splash);
    this.events = [
      { time: tAt(liftA), type: 'lift', say: '😮' },
      { time: tAt(dropA) + 0.1, type: 'drop', sound: 'scream', say: '😱', vibrate: [80, 40, 120], hands: true },
      { time: tAt(dropA) + 0.9, type: 'photo', photo: true },
      { time: this.tSplash, type: 'splash', sound: 'splash', say: '💦', splash: 34, vibrate: 220, shake: 0.7 },
      { time: this.tSplash + 1.6, type: 'laugh', say: '🤣' },
    ];
    this.splashTime = -99;
    this.build();
  }

  build() {
    const tr = this.track;
    const g = this.group;
    const profile = [
      [-1.55, 1.15],
      [-1.35, 1.2],
      [-1.2, 0.2],
      [-0.9, -0.05],
      [0.9, -0.05],
      [1.2, 0.2],
      [1.35, 1.2],
      [1.55, 1.15],
      [1.5, 0.0],
      [1.1, -0.35],
      [-1.1, -0.35],
      [-1.5, 0.0],
      [-1.55, 1.15],
    ];
    const trough = new THREE.Mesh(troughGeometry(tr, profile), toon(0xffe2a8, { side: THREE.DoubleSide }));
    trough.castShadow = true;
    trough.receiveShadow = true;
    g.add(trough);
    // 물
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    const cg = c.getContext('2d');
    cg.fillStyle = '#6fcff2';
    cg.fillRect(0, 0, 64, 128);
    cg.strokeStyle = 'rgba(255,255,255,0.55)';
    cg.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      cg.beginPath();
      const y = i * 22 + 6;
      cg.moveTo(8 + (i % 2) * 20, y);
      cg.quadraticCurveTo(28, y + 6, 50 - (i % 2) * 10, y);
      cg.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.waterTex = tex;
    const water = new THREE.Mesh(waterGeometry(tr, 1.12, 0.45), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92 }));
    water.userData.dynamic = true;
    g.add(water);
    // 리프트 벨트 무늬
    g.add(tr.instanceAlong(new THREE.BoxGeometry(1.8, 0.08, 0.25), toon(0x5a5470), 0.6, { upOff: 0.0, from: this.liftA, to: this.liftB }));
    g.add(tr.supports(toon(0xc9926b), { every: 3, minHeight: 0.8, radius: 0.22, under: 0.4 }));
    // 물보라 웅덩이
    const sp = tr.getPos(this.splashS + 2);
    const pool = mesh(new THREE.CircleGeometry(5.5, 32), new THREE.MeshToonMaterial({ color: 0x7fd3f0 }), { x: sp.x, y: 0.08, z: sp.z, rx: -Math.PI / 2, cast: false });
    g.add(pool);
    g.add(mesh(new THREE.TorusGeometry(5.5, 0.35, 8, 40), toon(0xd9c8f5), { x: sp.x, y: 0.15, z: sp.z, rx: Math.PI / 2 }));
    // 바위와 산 (리프트 언덕 장식)
    const rock = toon(0xc7c2d6);
    for (const [x, z, s] of [
      [-62, -16, 5.5],
      [-60, -10, 4.5],
      [-59, -3, 4],
      [-56, -15, 3],
    ]) {
      const m = mesh(new THREE.DodecahedronGeometry(s, 0), rock, { x, y: s * 0.55, z, sy: 1.3 });
      g.add(m);
      this.ctx.world.colliders.push({ x, z, r: s * 0.9 });
    }
    // 폭포
    const fall = mesh(new THREE.PlaneGeometry(2.4, 8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85 }), { x: -59.5, y: 4, z: -7.2, cast: false });
    fall.userData.dynamic = true;
    g.add(fall);
    // 역
    g.add(mesh(new THREE.BoxGeometry(3, 0.8, 9), toon(0xfff3e6), { x: -43.6, y: 0.4, z: -1 }));
    for (const z of [-5, 3]) g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 4, 8), toon(PASTEL.sky), { x: -42.6, y: 2.8, z }));
    g.add(mesh(new THREE.BoxGeometry(5.6, 0.35, 10), toon(PASTEL.sky), { x: -44.6, y: 4.9, z: -1 }));
    mergeStatic(g);
    const sign = makeSign('🌊 퐁당 통나무', 1.1, { bg: '#6fcff2', font: 70 });
    sign.position.set(-42.1, 5.8, -1);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
    this.ctx.world.platforms.push({ x: -43.6, z: -1, hw: 1.5, hd: 4.5, top: 0.8, rot: 0 });
    // 물길 막기
    for (let s = 0; s < tr.length; s += 2.5) {
      const p = tr.getPos(s);
      if (p.y < 3) this.ctx.world.colliders.push({ x: p.x, z: p.z, r: 1.6 });
    }

    // 통나무 배
    const log = new THREE.Group();
    const wood = toon(0xc98f5e);
    log.add(mesh(new THREE.CylinderGeometry(1.0, 1.0, 4.2, 16, 1, true, -Math.PI / 2, Math.PI), toon(0xc98f5e, { side: THREE.DoubleSide }), { y: 0.95, rx: Math.PI / 2 }));
    log.add(mesh(new THREE.BoxGeometry(1.7, 0.12, 4.0), toon(0x9a6a40), { y: 0.2 }));
    for (const z of [-2.1, 2.1]) log.add(mesh(new THREE.CircleGeometry(1.0, 16, Math.PI, Math.PI), toon(0xe9c9a3, { side: THREE.DoubleSide }), { y: 0.95, z }));
    // 테두리
    for (const s2 of [-1, 1]) log.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.2, 8), toon(0xb07a4a), { x: s2 * 1.0, y: 0.95, rx: Math.PI / 2 }));
    // 나이테
    log.add(mesh(new THREE.TorusGeometry(0.55, 0.04, 4, 20, Math.PI), toon(0xc98f5e), { y: 0.95, z: 2.11, rz: Math.PI }));
    // 귀여운 얼굴
    log.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), toon(0x3b2f3f), { x: 0.3, y: 0.55, z: 2.13 }));
    log.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), toon(0x3b2f3f), { x: -0.3, y: 0.55, z: 2.13 }));
    log.add(mesh(new THREE.TorusGeometry(0.12, 0.03, 4, 10, Math.PI), toon(0x3b2f3f), { y: 0.35, z: 2.13, rz: Math.PI }));
    // 의자
    for (const z of [-0.9, 0.6]) log.add(mesh(new THREE.BoxGeometry(1.4, 0.3, 0.6), toon(0xffe7b0), { y: 0.38, z }));
    mergeStatic(log);
    this.log = log;
    this.ctx.scene.add(log);

    // 물보라 파티클
    const n = 220;
    const pos = new Float32Array(n * 3);
    this.sprayDirs = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 3 + Math.random() * 7;
      const out = 1 + Math.random() * 4;
      this.sprayDirs.push(new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out));
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.spray = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.9, depthWrite: false }));
    this.spray.frustumCulled = false;
    this.spray.visible = false;
    this.ctx.scene.add(this.spray);
    this.sprayOrigin = tr.getPos(this.splashS + 1);
  }

  boatS(t) {
    if (this.phase(t) !== 'running') return START_S;
    return this.sim.sAt(Math.min(this.runTime(t), this.sim.duration));
  }

  update(dt, t) {
    const s = this.boatS(t);
    const tr = this.track;
    tr.getPos(s, this.log.position);
    tr.getQuat(s, this.log.quaternion);
    const up = tr.getUp(s);
    this.log.position.addScaledVector(up, 0.15 + Math.sin(t * 2) * 0.04);
    this.log.rotateZ(Math.sin(t * 1.6) * 0.04);
    this.waterTex.offset.y -= dt * 0.9;
    // 물보라 (운행 시간 기준)
    const since = this.phase(t) === 'running' ? this.runTime(t) - this.tSplash : -1;
    if (since >= 0 && since < 2.2) {
      this.spray.visible = true;
      const p = this.spray.geometry.attributes.position.array;
      for (let i = 0; i < this.sprayDirs.length; i++) {
        const d = this.sprayDirs[i];
        const tt = since * (0.7 + (i % 5) * 0.08);
        p[i * 3] = this.sprayOrigin.x + d.x * tt;
        p[i * 3 + 1] = Math.max(0.3, this.sprayOrigin.y + d.y * tt - 4.9 * tt * tt);
        p[i * 3 + 2] = this.sprayOrigin.z + d.z * tt;
      }
      this.spray.geometry.attributes.position.needsUpdate = true;
      this.spray.material.opacity = 0.9 * (1 - since / 2.2);
    } else this.spray.visible = false;
  }

  seatTransform(seat, t, outPos, outQuat) {
    const row = seat < 2 ? 0.75 : -0.75;
    const side = seat % 2 ? -0.32 : 0.32;
    this.log.updateMatrixWorld();
    outPos.set(side, 0.62, row).applyMatrix4(this.log.matrixWorld);
    outQuat.copy(this.log.quaternion);
    return outPos;
  }

  riderInfo(seat, t) {
    if (this.phase(t) !== 'running') return { pose: 'hold' };
    const v = this.sim.vAt(this.runTime(t));
    return { pose: 'hold', lines: clamp((v - 6) / 8, 0, 0.9), wind: clamp(v / 14, 0, 1), fov: clamp((v - 3) * 1.4, 0, 16), shake: v > 8 ? 0.4 : 0.02 };
  }

  photoCam(t) {
    const s = this.boatS(t) + 6;
    const p = this.track.getPos(s);
    return { pos: p.clone().add(new THREE.Vector3(0, 2.2, 0)), target: this.track.getPos(this.boatS(t)).add(new THREE.Vector3(0, 1.2, 0)) };
  }
}

export { glow };
