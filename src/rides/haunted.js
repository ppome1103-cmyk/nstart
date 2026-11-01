import * as THREE from 'three';
import { Ride } from './Ride.js';
import { Track } from '../core/track.js';
import { toon, glow, makeSign, PASTEL } from '../core/materials.js';
import { mergeStatic, mesh } from '../core/merge.js';
import { SPOTS } from '../park/layout.js';
import { clamp } from '../core/rng.js';
import { sfx } from '../audio.js';

const W = 9; // 건물 반폭 (x)
const D = 7; // 반깊이 (z)
const H = 6;
const SPEED = 2.3;

function buildGhost(scale = 1) {
  const g = new THREE.Group();
  const white = new THREE.MeshToonMaterial({ color: 0xffffff, emissive: 0xcfe8ff, emissiveIntensity: 0.55 });
  g.add(mesh(new THREE.SphereGeometry(0.7, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), white, { y: 0.6 }));
  g.add(mesh(new THREE.CylinderGeometry(0.7, 0.85, 1.0, 16, 1, true), white, { y: 0.1 }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), white, { x: Math.cos(a) * 0.68, y: -0.42, z: Math.sin(a) * 0.68 }));
  }
  const dark = new THREE.MeshBasicMaterial({ color: 0x2b2433 });
  g.add(mesh(new THREE.SphereGeometry(0.11, 8, 6), dark, { x: 0.24, y: 0.75, z: 0.62, sy: 1.4 }));
  g.add(mesh(new THREE.SphereGeometry(0.11, 8, 6), dark, { x: -0.24, y: 0.75, z: 0.62, sy: 1.4 }));
  g.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), dark, { y: 0.4, z: 0.66, sy: 1.3, sz: 0.5 }));
  const blush = new THREE.MeshBasicMaterial({ color: 0xffa0c0 });
  g.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), blush, { x: 0.42, y: 0.55, z: 0.55, sz: 0.4 }));
  g.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), blush, { x: -0.42, y: 0.55, z: 0.55, sz: 0.4 }));
  // 팔
  for (const s of [-1, 1]) g.add(mesh(new THREE.CapsuleGeometry(0.12, 0.35, 4, 8), white, { x: 0.75 * s, y: 0.3, z: 0.25, rz: 0.9 * s, rx: -0.6 }));
  g.scale.setScalar(scale);
  return g;
}

function buildBat() {
  const g = new THREE.Group();
  const m = toon(0x3b2f50);
  g.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), m));
  const wings = [];
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.6 * s, 0.25);
    shape.lineTo(0.45 * s, -0.05);
    shape.lineTo(0.25 * s, 0.05);
    shape.lineTo(0, -0.1);
    const w = mesh(new THREE.ShapeGeometry(shape), toon(0x3b2f50, { side: THREE.DoubleSide }), { cast: false });
    w.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(w);
    g.add(holder);
    wings.push(holder);
  }
  g.add(mesh(new THREE.SphereGeometry(0.04, 6, 4), glow(0xff5f5f, 1), { x: 0.07, y: 0.07, z: 0.17 }));
  g.add(mesh(new THREE.SphereGeometry(0.04, 6, 4), glow(0xff5f5f, 1), { x: -0.07, y: 0.07, z: 0.17 }));
  g.userData.wings = wings;
  return g;
}

function buildPumpkin(s = 1) {
  const g = new THREE.Group();
  const m = toon(0xff9f45);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(mesh(new THREE.SphereGeometry(0.4, 10, 8), m, { x: Math.cos(a) * 0.18, y: 0.35, z: Math.sin(a) * 0.18, sx: 0.8, sy: 0.85 }));
  }
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.25, 6), toon(0x5fbf63), { y: 0.75 }));
  const face = glow(0xffe066, 0.9);
  g.add(mesh(new THREE.ConeGeometry(0.08, 0.12, 3), face, { x: 0.15, y: 0.45, z: 0.5, rx: Math.PI / 2 }));
  g.add(mesh(new THREE.ConeGeometry(0.08, 0.12, 3), face, { x: -0.15, y: 0.45, z: 0.5, rx: Math.PI / 2 }));
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.06, 0.05), face, { y: 0.25, z: 0.52 }));
  g.scale.setScalar(s);
  mergeStatic(g);
  return g;
}

// 👻 유령의 집: 수레를 타고 깜깜한 집 안을 지나가요
export class Haunted extends Ride {
  constructor(ctx) {
    const { x, z } = SPOTS.haunted;
    super(ctx, {
      id: 'haunted',
      name: '두근두근 유령의 집',
      icon: '👻',
      mode: 'run',
      seats: 2,
      countdown: 7,
      cam: 'first',
      board: { x: x - 4.5, z: z - D - 3.2, r: 3.4 },
      exit: { x: x + 5, z: z - D - 3.4, ry: Math.PI },
    });
    this.group.position.set(x, 0, z);
    const P = (lx, lz) => new THREE.Vector3(x + lx, 0.2, z + lz);
    // 수레 길: 입구(왼쪽) → 방 세 개 → 출구(오른쪽)
    const pts = [
      P(-4.5, -D - 2.5),
      P(-4.5, -D + 0.5),
      P(-5.5, -3.5),
      P(-7.2, -0.5),
      P(-6.6, 3.5),
      P(-4.2, 5.2),
      P(-1.8, 3.0),
      P(-1.6, -1.0),
      P(0.6, -3.6),
      P(3.0, -2.2),
      P(2.6, 1.6),
      P(4.0, 4.8),
      P(7.0, 4.4),
      P(7.4, 0.5),
      P(6.0, -3.6),
      P(5.0, -D + 0.5),
      P(5.0, -D - 2.6),
    ];
    this.track = new Track(pts, { closed: false, spacing: 0.4, curveType: 'catmullrom', tension: 0.5 });
    const L = this.track.length;
    // 무서운 장면에서는 천천히
    this.scares = [
      { s: 6.5, kind: 'ghost', pos: [-7.8, 1.5, -2.5] },
      { s: 11, kind: 'bats' },
      { s: 16, kind: 'portrait' },
      { s: 22, kind: 'ghost', pos: [-0.2, 1.6, 1.2] },
      { s: 28, kind: 'pumpkins' },
      { s: 34, kind: 'ghost', pos: [3.8, 1.6, 2.6] },
      { s: L - 9, kind: 'big' },
    ];
    // 시간 → 위치 표 (속도 변화)
    const sArr = [];
    let s = 0;
    const dt = 1 / 30;
    let t = 0;
    while (s < L && t < 120) {
      sArr.push(s);
      let v = SPEED;
      for (const sc of this.scares) if (s > sc.s - 1.2 && s < sc.s + 0.6) v = 0.7;
      if (t < 1.5) v = SPEED * (t / 1.5);
      s += v * dt;
      t += dt;
    }
    sArr.push(L);
    this.sArr = sArr;
    this.duration = sArr.length / 30 + 1.5;
    const timeAt = (target) => sArr.findIndex((v) => v >= target) / 30;
    this.events = this.scares.map((sc) => ({
      time: timeAt(sc.s - 0.6),
      type: sc.kind,
      say: sc.kind === 'big' ? '😱' : ['😨', '😳', '🙀'][Math.floor(sc.s) % 3],
      sound: sc.kind === 'bats' ? 'pop' : 'boo',
      shake: sc.kind === 'big' ? 0.9 : 0.35,
      vibrate: sc.kind === 'big' ? [100, 50, 200] : 60,
      flash: sc.kind === 'big' ? 0.5 : 0,
    }));
    this.events.push({ time: timeAt(this.scares[6].s - 0.3), type: 'photo', photo: true });
    for (const ev of this.events) ev.scareTime = ev.time;
    this.build();
  }

  build() {
    const g = this.group;
    const wallMat = toon(0x8f6fd0);
    const inner = toon(0x2e2442, { side: THREE.DoubleSide });
    // 바깥 벽 (입구/출구 구멍)
    const doorW = 2.6;
    const wall = (x, z, w, d, h = H, mat = wallMat, y = h / 2) => g.add(mesh(new THREE.BoxGeometry(w, h, d), mat, { x, y, z }));
    // 앞쪽 벽 (z = -D): 문 두 개 (x=-4.5, x=5)
    wall(-7.4, -D, 3.2, 0.4);
    wall(0.25, -D, 7.1, 0.4);
    wall(7.65, -D, 2.7, 0.4);
    wall(-4.5, -D, doorW, 0.4, 2.5, wallMat, H - 1.25 + 0.0);
    wall(5, -D, doorW, 0.4, 2.5, wallMat, H - 1.25);
    wall(0, D, W * 2, 0.4);
    wall(-W, 0, 0.4, D * 2);
    wall(W, 0, 0.4, D * 2);
    // 천장 + 지붕
    g.add(mesh(new THREE.BoxGeometry(W * 2, 0.3, D * 2), inner, { y: H }));
    const roof = mesh(new THREE.ConeGeometry(W * 1.35, 4.5, 4), toon(0x5a3f8f), { y: H + 2.2, ry: Math.PI / 4, sz: D / W });
    g.add(roof);
    // 삐뚤어진 탑
    g.add(mesh(new THREE.CylinderGeometry(1.8, 2.1, 9, 10), wallMat, { x: -W + 1.2, y: 4.5, z: D - 1.5 }));
    g.add(mesh(new THREE.ConeGeometry(2.4, 4.2, 10), toon(0x5a3f8f), { x: -W + 1.2, y: 11, z: D - 1.5, rz: 0.15 }));
    g.add(mesh(new THREE.SphereGeometry(0.4, 10, 8), glow(0xc4ff8f, 0.6), { x: -W + 0.6, y: 13.1, z: D - 1.5 }));
    // 창문 (밖에서 보이게)
    const win = glow(0xd7ff8f, 0.5);
    for (const x of [-6, -1, 3, 7]) {
      g.add(mesh(new THREE.PlaneGeometry(1.2, 1.5), win, { x, y: 4.2, z: -D - 0.22, ry: Math.PI, cast: false }));
      g.add(mesh(new THREE.BoxGeometry(1.4, 0.15, 0.2), toon(0x3b2f50), { x, y: 4.2, z: -D - 0.25 }));
    }
    // 바닥 (안)
    g.add(mesh(new THREE.BoxGeometry(W * 2, 0.1, D * 2), toon(0x2b2238), { y: 0.05, cast: false }));
    // 방 나누는 벽
    wall(-3.0, -1.2, 0.3, 7.6, H, inner);
    wall(1.4, 3.6, 0.3, 6.8, H, inner);
    wall(4.0, -3.15, 0.3, 4.9, H, inner);
    // 수레 레일
    const railMat = toon(0x6f6a80);
    this.ctx.scene.add(this.track.tube(0.45, -0.1, 0.05, railMat, 4));
    this.ctx.scene.add(this.track.tube(-0.45, -0.1, 0.05, railMat, 4));
    // 묘비, 울타리 (밖)
    const stone = toon(0xc7c2d6);
    for (const [x, z] of [
      [-8, -D - 3],
      [-1, -D - 3.2],
      [8.3, -D - 2.6],
      [-7, -D - 5],
    ]) {
      g.add(mesh(new THREE.BoxGeometry(0.9, 1.2, 0.3), stone, { x, y: 0.6, z }));
      g.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12, 1, false, 0, Math.PI), stone, { x, y: 1.2, z, rx: Math.PI / 2, rz: Math.PI / 2 }));
    }
    mergeStatic(g);
    // 밖의 호박
    for (const [x, z, s] of [
      [-2, -D - 1.2, 1],
      [2.2, -D - 1.4, 0.8],
      [8.6, -D - 1.0, 1.2],
    ]) {
      const p = buildPumpkin(s);
      p.position.set(x, 0, z);
      p.rotation.y = Math.PI;
      g.add(p);
    }
    const sign = makeSign('👻 두근두근 유령의 집', 1.1, { bg: '#5a3f8f', fg: '#d7ff8f', font: 64, border: '#d7ff8f' });
    sign.position.set(0, H + 0.6, -D - 0.5);
    sign.rotation.y = Math.PI;
    g.add(sign);
    // 충돌
    const c = g.position;
    this.ctx.world.boxes.push({ x: c.x, z: c.z + 0.4, hw: W + 0.2, hd: D, rot: 0 });

    // 안쪽 무서운 것들
    this.ghosts = [];
    for (const sc of this.scares) {
      if (sc.kind === 'ghost') {
        const gh = buildGhost(1);
        gh.position.set(...sc.pos);
        gh.visible = false;
        g.add(gh);
        this.ghosts.push({ obj: gh, sc, base: new THREE.Vector3(...sc.pos) });
      }
    }
    this.big = buildGhost(2.4);
    this.big.position.set(8.0, 2.2, -4.6);
    this.big.visible = false;
    g.add(this.big);
    const bigSign = makeSign('까꿍!', 0.9, { bg: '#ff6fa0', font: 80 });
    bigSign.position.set(0, 2.2, 0.6);
    this.big.add(bigSign);
    this.bats = [];
    for (let i = 0; i < 6; i++) {
      const b = buildBat();
      b.visible = false;
      g.add(b);
      this.bats.push(b);
    }
    // 액자 (눈이 따라와요)
    const frame = new THREE.Group();
    frame.add(mesh(new THREE.BoxGeometry(2, 2.6, 0.15), toon(PASTEL.gold)));
    frame.add(mesh(new THREE.PlaneGeometry(1.6, 2.2), toon(0x6a5a8a), { z: 0.08, cast: false }));
    frame.add(mesh(new THREE.SphereGeometry(0.5, 12, 10), toon(0xffe3d3), { y: 0.3, z: 0.1, sz: 0.3 }));
    this.portraitEyes = [];
    for (const s of [-1, 1]) {
      const e = mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), { x: 0.18 * s, y: 0.38, z: 0.22 });
      const pupil = mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }), { z: 0.08 });
      e.add(pupil);
      frame.add(e);
      this.portraitEyes.push(pupil);
    }
    frame.position.set(-8.7, 2.6, 1.5);
    frame.rotation.y = Math.PI / 2;
    g.add(frame);
    // 호박 방
    this.pumpkins = [];
    for (let i = 0; i < 5; i++) {
      const p = buildPumpkin(0.8 + (i % 2) * 0.3);
      p.position.set(0.6 + i * 0.6, 0.1, -5.7 + (i % 2) * 0.6);
      g.add(p);
      this.pumpkins.push(p);
    }
    // 촛불 빛
    this.candles = [];
    const candleBodies = new THREE.Group();
    g.add(candleBodies);
    for (const [x, z] of [
      [-8.2, -5],
      [-8.2, 5],
      [0, 6.2],
      [8.2, 6],
      [8.2, -2],
      [-2, -5.8],
    ]) {
      candleBodies.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), toon(0xfff3e6), { x, y: 1.5, z }));
      const flame = mesh(new THREE.SphereGeometry(0.1, 8, 6), glow(0xffb84a, 1.2), { x, y: 1.85, z, cast: false });
      g.add(flame);
      this.candles.push(flame);
    }
    mergeStatic(candleBodies);

    // 수레
    const cart = new THREE.Group();
    cart.add(mesh(new THREE.BoxGeometry(1.6, 0.6, 1.6), toon(0x3b2f50), { y: 0.45 }));
    cart.add(mesh(new THREE.BoxGeometry(1.6, 0.9, 0.2), toon(0x3b2f50), { y: 0.9, z: -0.7 }));
    for (const s of [-1, 1]) {
      const wing = new THREE.Shape();
      wing.moveTo(0, 0);
      wing.lineTo(0.9 * s, 0.5);
      wing.lineTo(0.7 * s, 0.1);
      wing.lineTo(0.45 * s, 0.25);
      wing.lineTo(0.3 * s, -0.05);
      cart.add(mesh(new THREE.ShapeGeometry(wing), toon(0x5a3f8f, { side: THREE.DoubleSide }), { x: 0.8 * s, y: 0.9, z: -0.7 }));
    }
    cart.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), glow(0xff5f5f, 0.8), { x: 0.4, y: 0.75, z: 0.81 }));
    cart.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), glow(0xff5f5f, 0.8), { x: -0.4, y: 0.75, z: 0.81 }));
    mergeStatic(cart);
    this.cart = cart;
    this.ctx.scene.add(cart);
    // 수레 손전등
    const lamp = new THREE.SpotLight(0xfff1c4, 0, 14, 0.6, 0.6, 1.2);
    lamp.position.set(0, 1.6, 0.5);
    lamp.target.position.set(0, 0.8, 5);
    cart.add(lamp);
    cart.add(lamp.target);
    this.lamp = lamp;
  }

  sAt(t) {
    if (this.phase(t) !== 'running') return 0;
    const f = this.runTime(t) * 30;
    const i = Math.floor(f);
    if (i >= this.sArr.length - 1) return this.track.length;
    return this.sArr[i] + (this.sArr[i + 1] - this.sArr[i]) * (f - i);
  }

  inside(t) {
    if (this.phase(t) !== 'running') return false;
    const s = this.sAt(t);
    return s > 3 && s < this.track.length - 3;
  }

  update(dt, t) {
    const s = this.sAt(t);
    this.track.getPos(s, this.cart.position);
    this.track.getQuat(s, this.cart.quaternion);
    const mine = this.ctx.mineOn(this);
    const inside = this.inside(t);
    // 내가 타고 안에 있을 때만 깜깜하게
    this.ctx.setIndoor?.(mine && inside ? 1 : 0);
    this.lamp.intensity = mine && inside ? 16 * (0.85 + Math.random() * 0.15) : 0;
    for (const c of this.candles) c.scale.setScalar(0.8 + Math.random() * 0.4);
    const running = this.phase(t) === 'running';
    // 유령이 튀어나와요
    for (const gh of this.ghosts) {
      const d = s - (gh.sc.s - 1.4);
      const show = running && d > 0 && d < 4;
      gh.obj.visible = show;
      if (show) {
        const k = clamp(d / 0.4, 0, 1);
        gh.obj.scale.setScalar(0.2 + 0.8 * k);
        const cartP = this.cart.position.clone().sub(this.group.position);
        gh.obj.position.lerpVectors(gh.base, cartP.setY(1.4), clamp(d / 2.5, 0, 0.55));
        gh.obj.position.y += Math.sin(t * 6) * 0.1;
        gh.obj.lookAt(this.cart.position.clone().setY(1.4));
      }
    }
    // 큰 유령
    const big = this.scares[6];
    const db = s - (big.s - 1.0);
    this.big.visible = running && db > 0 && db < 5;
    if (this.big.visible) {
      const k = clamp(db / 0.35, 0, 1);
      this.big.scale.setScalar(2.4 * (0.3 + 0.7 * k) * (1 + Math.sin(t * 10) * 0.03));
      this.big.lookAt(this.cart.position.clone().setY(2));
    }
    // 박쥐
    const bs = this.scares[1].s;
    const dbat = s - (bs - 1.5);
    const batsOn = running && dbat > 0 && dbat < 5;
    this.bats.forEach((b, i) => {
      b.visible = batsOn;
      if (!batsOn) return;
      const f = dbat / 5;
      b.position.set(-6 + Math.sin(i * 2 + f * 6) * 1.6, 2 + Math.sin(i * 3 + f * 8) * 0.8, 4 - f * 9 + i * 0.4);
      b.rotation.y = Math.PI;
      const flap = Math.sin(t * 30 + i) * 0.8;
      b.userData.wings[0].rotation.z = flap;
      b.userData.wings[1].rotation.z = -flap;
    });
    // 액자 눈
    const cp = this.cart.position;
    for (const e of this.portraitEyes) {
      const local = e.parent.worldToLocal(cp.clone().setY(1.5));
      local.normalize().multiplyScalar(0.06);
      e.position.set(local.x, local.y, 0.08);
    }
    // 호박 흔들
    const dp = s - (this.scares[4].s - 1.5);
    this.pumpkins.forEach((p, i) => {
      p.rotation.z = running && dp > 0 && dp < 4 ? Math.sin(t * 20 + i) * 0.3 : 0;
      p.position.y = running && dp > 0 && dp < 4 ? 0.1 + Math.abs(Math.sin(t * 10 + i)) * 0.4 : 0.1;
    });
    if (mine && running && Math.random() < dt * 0.15) sfx.creak();
  }

  seatTransform(seat, t, outPos, outQuat) {
    this.cart.updateMatrixWorld();
    outPos.set(seat % 2 ? -0.38 : 0.38, 0.75, -0.1).applyMatrix4(this.cart.matrixWorld);
    outQuat.copy(this.cart.quaternion);
    return outPos;
  }

  riderInfo(seat, t) {
    const inside = this.inside(t);
    // 무서운 순간에는 얼굴 가리기
    const s = this.sAt(t);
    let scared = false;
    for (const sc of this.scares) if (s > sc.s - 1.2 && s < sc.s + 0.8) scared = true;
    return { pose: scared ? 'scared' : 'hold', dark: inside ? 0.55 : 0, shake: scared ? 0.3 : 0 };
  }

  photoCam(t) {
    const p = this.cart.position.clone();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.cart.quaternion);
    return { pos: p.clone().addScaledVector(fwd, 2.6).add(new THREE.Vector3(0, 1.6, 0)), target: p.clone().add(new THREE.Vector3(0, 1.1, 0)) };
  }
}
