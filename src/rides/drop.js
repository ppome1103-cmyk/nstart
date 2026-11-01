import * as THREE from 'three';
import { Ride } from './Ride.js';
import { toon, glow, stripeMat, makeSign, PASTEL } from '../core/materials.js';
import { mergeStatic, mesh } from '../core/merge.js';
import { SPOTS } from '../park/layout.js';
import { rng, clamp, easeInOut } from '../core/rng.js';

const SEATS = 8;
const TOP = 34;
const LOW = 1.2;
const BRAKE_Y = 9;
const RISE = 16;

// 🗼 하늘 낙하 (자이로드롭)
export class DropTower extends Ride {
  constructor(ctx) {
    const { x, z } = SPOTS.drop;
    super(ctx, {
      id: 'drop',
      name: '하늘 낙하',
      icon: '🗼',
      mode: 'run',
      seats: SEATS,
      countdown: 8,
      duration: 34,
      cam: 'first',
      board: { x: x + 5.6, z: z + 3.2, r: 3.4 },
      exit: { x: x + 6, z: z + 5.5, ry: 0.6 },
    });
    this.group.position.set(x, 0, z);
    this.build();
  }

  // 시작 시각으로 정해지는 기다림 시간 (두 폰이 같게)
  holdTime() {
    return 2 + rng(Math.floor((this.start || 0) * 10))() * 4;
  }

  // 운행 시간 → 높이, 속도
  profile(rt) {
    const t0 = 2;
    if (rt < t0) return { y: LOW, v: 0, stage: 'wait' };
    if (rt < t0 + RISE) {
      const f = (rt - t0) / RISE;
      return { y: LOW + (TOP - LOW) * easeInOut(f), v: 0, stage: 'rise' };
    }
    const hold = this.holdTime();
    const tDrop = t0 + RISE + hold;
    if (rt < tDrop) return { y: TOP + Math.sin(rt * 3) * 0.02, v: 0, stage: 'top' };
    const ff = Math.sqrt((2 * (TOP - BRAKE_Y)) / 9.8);
    const e = rt - tDrop;
    if (e < ff) return { y: TOP - 0.5 * 9.8 * e * e, v: 9.8 * e, stage: 'fall' };
    const vb = 9.8 * ff;
    const decel = (vb * vb) / (2 * (BRAKE_Y - LOW - 0.5));
    const tb = vb / decel;
    const e2 = e - ff;
    if (e2 < tb) return { y: BRAKE_Y - (vb * e2 - 0.5 * decel * e2 * e2), v: vb - decel * e2, stage: 'brake' };
    const e3 = e2 - tb;
    // 살짝 출렁
    const yEnd = BRAKE_Y - (vb * tb - 0.5 * decel * tb * tb);
    const settle = clamp(e3 / 3, 0, 1);
    return { y: yEnd + (LOW - yEnd) * easeInOut(settle) + Math.sin(e3 * 8) * 0.12 * (1 - settle), v: 0, stage: 'end' };
  }

  get events() {
    if (!this.start) return [];
    const hold = this.holdTime();
    const tDrop = 2 + RISE + hold;
    return [
      { time: 2, type: 'rise', sound: 'creak' },
      { time: 2 + RISE - 0.5, type: 'top', say: '😳', sound: 'chime' },
      { time: tDrop - 0.25, type: 'click', sound: 'clack' },
      { time: tDrop, type: 'drop', sound: 'scream', say: '😱', vibrate: [200, 40, 300], shake: 0.4, hands: true, flash: 0.15 },
      { time: tDrop + 0.9, type: 'photo', photo: true },
      { time: tDrop + 2.3, type: 'brake', sound: 'thud', shake: 0.8, vibrate: 150 },
      { time: tDrop + 2.6, type: 'hiss', sound: 'hiss', say: '🤩' },
    ];
  }
  set events(v) {}

  build() {
    const g = this.group;
    g.add(mesh(new THREE.CylinderGeometry(4.6, 5, 0.6, 32), toon(0xf1e6ff), { y: 0.3 }));
    g.add(mesh(new THREE.CylinderGeometry(1.2, 1.4, TOP + 6, 24), stripeMat('#8fd0ff', '#ffffff', 18, true), { y: (TOP + 6) / 2 }));
    // 꼭대기 장식
    g.add(mesh(new THREE.CylinderGeometry(3.2, 2.0, 1.4, 24), toon(PASTEL.pink), { y: TOP + 6.5 }));
    g.add(mesh(new THREE.ConeGeometry(2.6, 3.4, 24), stripeMat('#ff8fb4', '#ffffff', 8), { y: TOP + 8.9 }));
    g.add(mesh(new THREE.SphereGeometry(0.5, 12, 10), glow(0xffd86b, 0.6), { y: TOP + 11 }));
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      g.add(mesh(new THREE.SphereGeometry(0.18, 6, 5), glow([0xffe066, 0xff8fb4, 0x8fd0ff][i % 3], 0.4), { x: Math.cos(a) * 3.25, y: TOP + 6.5, z: Math.sin(a) * 3.25, cast: false }));
    }
    // 세로 레일
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.add(mesh(new THREE.BoxGeometry(0.25, TOP + 5, 0.25), toon(0xffffff), { x: Math.cos(a) * 1.45, y: (TOP + 5) / 2, z: Math.sin(a) * 1.45 }));
    }
    // 높이 표시 (밤에 빛남)
    for (let h = 5; h < TOP; h += 5) g.add(mesh(new THREE.TorusGeometry(1.42, 0.07, 6, 24), glow(0xffd86b, 0.2), { y: h, rx: Math.PI / 2, cast: false }));
    // 울타리
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - 0.52), Math.cos(a - 0.52))) < 0.3) continue;
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6), toon(0xffffff), { x: Math.cos(a) * 5.4, y: 0.55, z: Math.sin(a) * 5.4 }));
    }
    mergeStatic(g);
    const sign = makeSign('🗼 하늘 낙하', 1.1, { bg: '#8fd0ff', font: 70 });
    sign.position.set(Math.cos(0.52) * 1.5, 6.5, Math.sin(0.52) * 1.5);
    sign.rotation.y = Math.PI / 2 - 0.52;
    g.add(sign);

    // 좌석 링
    const car = new THREE.Group();
    car.userData.dynamic = true;
    car.add(mesh(new THREE.CylinderGeometry(3.0, 3.0, 0.5, 32), toon(PASTEL.lavender), { y: 0 }));
    car.add(mesh(new THREE.TorusGeometry(3.0, 0.2, 8, 32), toon(PASTEL.pink), { y: 0.25, rx: Math.PI / 2 }));
    car.add(mesh(new THREE.CylinderGeometry(1.7, 1.7, 1.6, 24, 1, true), toon(0xffffff), { y: 0.9 }));
    for (let i = 0; i < SEATS; i++) {
      const a = (i / SEATS) * Math.PI * 2;
      const seat = new THREE.Group();
      seat.position.set(Math.cos(a) * 2.35, 0.3, Math.sin(a) * 2.35);
      seat.rotation.y = Math.PI / 2 - a; // 바깥을 보도록
      seat.add(mesh(new THREE.BoxGeometry(0.75, 0.15, 0.6), toon(0xfff3e6), { y: 0.1 }));
      seat.add(mesh(new THREE.BoxGeometry(0.75, 1.3, 0.15), toon(0xfff3e6), { y: 0.75, z: -0.32 }));
      // 어깨 안전바
      for (const s of [-1, 1]) seat.add(mesh(new THREE.TorusGeometry(0.35, 0.05, 6, 10, Math.PI), toon(PASTEL.gold), { x: 0.2 * s, y: 1.0, z: -0.05, ry: Math.PI / 2 }));
      car.add(seat);
    }
    mergeStatic(car);
    g.add(car);
    this.car = car;
    this.ctx.world.colliders.push({ x: g.position.x, z: g.position.z, r: 5.4 });
  }

  carY(t) {
    if (this.phase(t) !== 'running') return LOW;
    return this.profile(this.runTime(t)).y;
  }

  update(dt, t) {
    this.car.position.y = this.carY(t);
    this.car.rotation.y = this.phase(t) === 'running' && this.profile(this.runTime(t)).stage === 'rise' ? Math.sin(t * 0.3) * 0.02 : 0;
  }

  seatTransform(seat, t, outPos, outQuat) {
    const a = (seat / SEATS) * Math.PI * 2;
    outPos.set(this.group.position.x + Math.cos(a) * 2.45, this.carY(t) + 0.5, this.group.position.z + Math.sin(a) * 2.45);
    outQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 - a);
    return outPos;
  }

  riderInfo(seat, t) {
    if (this.phase(t) !== 'running') return { pose: 'hold' };
    const p = this.profile(this.runTime(t));
    if (p.stage === 'fall') return { pose: 'hold', lines: clamp(p.v / 16, 0.3, 1), wind: clamp(p.v / 20, 0, 1), fov: 18, shake: 0.6 };
    if (p.stage === 'brake') return { pose: 'hold', lines: 0.4, wind: 0.5, fov: 8, shake: 2.5 };
    if (p.stage === 'top') return { pose: 'hold', wind: 0.25, shake: 0.05 };
    if (p.stage === 'rise') return { pose: 'hold', wind: 0.1 + (p.y / TOP) * 0.15 };
    return { pose: 'hold' };
  }

  statusText(t) {
    if (this.phase(t) === 'running') {
      const p = this.profile(this.runTime(t));
      if (p.stage === 'top') return '언제 떨어질까...?';
      return `높이 ${Math.round(p.y * 1.25)}m`;
    }
    return super.statusText(t);
  }

  thirdPersonCam(seat, t, outPos, outTarget) {
    const a = (seat / SEATS) * Math.PI * 2;
    const ctrl = this.ctx.controls();
    const y = this.carY(t);
    const b = a + ctrl.lookYaw * 0.5;
    outPos.set(this.group.position.x + Math.cos(b) * 11, y + 3 + ctrl.lookPitch * 6, this.group.position.z + Math.sin(b) * 11);
    outTarget.set(this.group.position.x + Math.cos(a) * 2.4, y + 0.6, this.group.position.z + Math.sin(a) * 2.4);
    return true;
  }

  photoCam(t) {
    const seat = [...this.riders.keys()][0] ?? 0;
    const a = (seat / SEATS) * Math.PI * 2;
    const y = this.carY(t);
    const c = this.group.position;
    return {
      pos: new THREE.Vector3(c.x + Math.cos(a + 0.12) * 6, y + 1.4, c.z + Math.sin(a + 0.12) * 6),
      target: new THREE.Vector3(c.x + Math.cos(a) * 2.4, y + 0.9, c.z + Math.sin(a) * 2.4),
    };
  }
}
