import * as THREE from 'three';
import { Ride } from './Ride.js';
import { toon, glow, stripeMat, makeSign, PASTEL } from '../core/materials.js';
import { mergeStatic, mesh } from '../core/merge.js';
import { SPOTS } from '../park/layout.js';
import { smooth } from '../core/rng.js';

const HORSES = 12;
const RUN = 40;
const MAXW = 0.55; // rad/s

function buildHorse(color, unicorn) {
  const g = new THREE.Group();
  const body = toon(color);
  const white = toon(0xffffff);
  const mane = toon(unicorn ? 0xc4a8ff : 0xffd86b);
  g.add(mesh(new THREE.CapsuleGeometry(0.42, 1.0, 6, 12), body, { y: 0, rx: Math.PI / 2 }));
  // 목과 머리
  g.add(mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 10), body, { y: 0.45, z: 0.75, rx: -0.6 }));
  const head = mesh(new THREE.CapsuleGeometry(0.24, 0.45, 4, 10), body, { y: 0.8, z: 1.05, rx: Math.PI / 2 - 0.3 });
  g.add(head);
  g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), toon(0x3b2f3f), { x: 0.18, y: 0.92, z: 1.08 }));
  g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), toon(0x3b2f3f), { x: -0.18, y: 0.92, z: 1.08 }));
  for (const s of [-1, 1]) g.add(mesh(new THREE.ConeGeometry(0.08, 0.2, 6), body, { x: 0.12 * s, y: 1.12, z: 0.92 }));
  if (unicorn) g.add(mesh(new THREE.ConeGeometry(0.07, 0.4, 8), toon(PASTEL.gold), { y: 1.22, z: 1.1, rx: 0.5 }));
  // 갈기
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.SphereGeometry(0.13, 8, 6), mane, { y: 0.55 + i * 0.12, z: 0.55 + i * 0.12 }));
  // 꼬리
  g.add(mesh(new THREE.ConeGeometry(0.16, 0.6, 8), mane, { y: 0.05, z: -0.85, rx: -2.3 }));
  // 다리 (달리는 자세)
  const legs = [
    [0.2, 0.55, -0.5],
    [-0.2, 0.55, 0.3],
    [0.2, -0.55, 0.6],
    [-0.2, -0.55, -0.2],
  ];
  for (const [x, z, r] of legs) g.add(mesh(new THREE.CapsuleGeometry(0.09, 0.45, 4, 8), body, { x, y: -0.45, z, rx: r }));
  // 안장
  g.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 14), toon(0xff6fa0), { y: 0.42, rz: 0 }));
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), white, { y: 0.47 }));
  mergeStatic(g);
  return g;
}

// 🎠 별빛 회전목마
export class Carousel extends Ride {
  constructor(ctx) {
    const { x, z } = SPOTS.carousel;
    super(ctx, {
      id: 'carousel',
      name: '별빛 회전목마',
      icon: '🎠',
      mode: 'run',
      seats: HORSES,
      countdown: 8,
      duration: RUN,
      cam: 'third',
      board: { x: x - 9, z: z - 1, r: 3.6 },
      exit: { x: x - 9.5, z: z + 2, ry: -Math.PI / 2 },
    });
    this.group.position.set(x, 0, z);
    this.build();
  }

  build() {
    const g = this.group;
    g.add(mesh(new THREE.CylinderGeometry(7.6, 7.9, 0.5, 40), toon(0xf1e6ff), { y: 0.25 }));
    g.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 7, 16), toon(PASTEL.gold), { y: 3.5 }));
    // 지붕
    g.add(mesh(new THREE.CylinderGeometry(7.8, 7.8, 0.9, 40, 1, true), stripeMat('#ff9fc0', '#fff3e6', 14), { y: 6.6 }));
    g.add(mesh(new THREE.ConeGeometry(8.2, 3.2, 40), stripeMat('#ff8fb4', '#ffffff', 12), { y: 8.65 }));
    g.add(mesh(new THREE.SphereGeometry(0.6, 14, 10), toon(PASTEL.gold), { y: 10.4 }));
    g.add(mesh(new THREE.ConeGeometry(0.3, 1, 8), toon(PASTEL.gold), { y: 11.2 }));
    // 지붕 테두리 물결 장식 + 전구
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      g.add(mesh(new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon(i % 2 ? 0xffffff : 0xffd86b), { x: Math.cos(a) * 7.8, y: 6.15, z: Math.sin(a) * 7.8 }));
      g.add(mesh(new THREE.SphereGeometry(0.12, 6, 5), glow([0xffe066, 0xff8fb4, 0x8fd0ff][i % 3], 0.35), { x: Math.cos(a) * 7.95, y: 6.95, z: Math.sin(a) * 7.95, cast: false }));
    }
    // 바깥 울타리
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.25) continue; // 입구
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), toon(0xffffff), { x: Math.cos(a) * 8.6, y: 0.5, z: Math.sin(a) * 8.6 }));
    }
    g.add(mesh(new THREE.TorusGeometry(8.6, 0.06, 4, 60), toon(PASTEL.pink), { y: 1.0, rx: Math.PI / 2 }));
    mergeStatic(g);

    // 도는 판
    const rot = new THREE.Group();
    rot.userData.dynamic = true;
    g.add(rot);
    rot.add(mesh(new THREE.CylinderGeometry(7.2, 7.2, 0.3, 40), toon(0xfff3e6), { y: 0.65 }));
    rot.add(mesh(new THREE.CylinderGeometry(2.2, 2.2, 5.2, 24), stripeMat('#c4a8ff', '#ffffff', 8), { y: 3.3 }));
    // 가운데 거울 기둥 장식
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      rot.add(mesh(new THREE.CircleGeometry(0.55, 14), glow(0xbfe9ff, 0.4), { x: Math.cos(a) * 2.22, y: 3.3, z: Math.sin(a) * 2.22, ry: Math.PI / 2 - a, cast: false }));
    }
    mergeStatic(rot);
    this.rot = rot;

    this.horses = [];
    const colors = [0xffffff, 0xff9fc0, 0x8fd0ff, 0xfff3e6, 0xffd86b, 0xc4a8ff];
    for (let i = 0; i < HORSES; i++) {
      const ring = i % 2 ? 4.0 : 5.9;
      const a = (i / HORSES) * Math.PI * 2;
      const holder = new THREE.Group();
      holder.position.set(Math.cos(a) * ring, 0, Math.sin(a) * ring);
      holder.rotation.y = Math.PI - a; // 도는 방향 바라보기
      const pole = mesh(new THREE.CylinderGeometry(0.07, 0.07, 5.6, 8), toon(PASTEL.gold), { y: 3.5 });
      holder.add(pole);
      const horse = buildHorse(colors[i % colors.length], i % 3 === 0);
      horse.position.y = 2;
      holder.add(horse);
      rot.add(holder);
      this.horses.push({ holder, horse, phase: i * 1.7 });
    }
    this.ctx.world.colliders.push({ x: g.position.x, z: g.position.z, r: 8.4 });
  }

  spin(t) {
    // 회전 각도: 가속 → 일정 → 감속 (적분)
    if (this.phase(t) !== 'running') return this._restAngle || 0;
    const rt = this.runTime(t);
    const acc = 6;
    const T = RUN;
    let a;
    if (rt < acc) a = (MAXW * rt * rt) / (2 * acc);
    else if (rt < T - acc) a = (MAXW * acc) / 2 + MAXW * (rt - acc);
    else {
      const d = rt - (T - acc);
      a = (MAXW * acc) / 2 + MAXW * (T - 2 * acc) + MAXW * d - (MAXW * d * d) / (2 * acc);
    }
    return (this._restAngle || 0) + a;
  }

  update(dt, t) {
    const ph = this.phase(t);
    if (ph === 'idle' && this._wasRunning) {
      this._restAngle = this.rot.rotation.y;
      this._wasRunning = false;
    }
    if (ph === 'running') this._wasRunning = true;
    const ang = this.spin(t);
    this.rot.rotation.y = ang;
    const moving = ph === 'running';
    for (const h of this.horses) {
      const target = moving ? 2 + Math.sin(t * 2.2 + h.phase) * 0.45 : 2;
      h.horse.position.y += (target - h.horse.position.y) * Math.min(1, dt * 3);
      h.horse.rotation.x = moving ? Math.sin(t * 2.2 + h.phase + 1) * 0.08 : 0;
    }
  }

  seatTransform(seat, t, outPos, outQuat) {
    const h = this.horses[seat];
    h.horse.updateMatrixWorld();
    outPos.set(0, 0.5, -0.1).applyMatrix4(h.horse.matrixWorld);
    h.horse.getWorldQuaternion(outQuat);
    return outPos;
  }

  riderInfo(seat, t) {
    const running = this.phase(t) === 'running';
    return { pose: 'sit', wind: running ? 0.12 : 0 };
  }

  checkEvents(t, cb) {
    super.checkEvents(t, cb);
    // 오르골 크게
    if (this.ctx.mineOn(this) && this.phase(t) === 'running') this.ctx.musicBoost?.(0.5);
  }

  thirdPersonCam(seat, t, outPos, outTarget) {
    const h = this.horses[seat];
    h.horse.updateMatrixWorld();
    const c = new THREE.Vector3().setFromMatrixPosition(h.horse.matrixWorld);
    const center = this.group.position;
    const out = new THREE.Vector3(c.x - center.x, 0, c.z - center.z).normalize();
    const ctrl = this.ctx.controls();
    out.applyAxisAngle(new THREE.Vector3(0, 1, 0), ctrl.lookYaw * 0.6);
    outPos.set(c.x + out.x * 5, c.y + 1.8 + ctrl.lookPitch * 4, c.z + out.z * 5);
    outTarget.set(c.x, c.y + 0.6, c.z);
    return true;
  }

  photoCam(t) {
    const seat = [...this.riders.keys()][0] ?? 0;
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    this.seatTransform(seat, t, p, q);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    return { pos: p.clone().addScaledVector(fwd, 3.2).add(new THREE.Vector3(0, 1.2, 0)), target: p.clone().add(new THREE.Vector3(0, 0.8, 0)) };
  }
}

export { smooth };
