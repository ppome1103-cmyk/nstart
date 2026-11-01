import * as THREE from 'three';
import { Ride } from './Ride.js';
import { toon, glow, makeSign, PASTEL } from '../core/materials.js';
import { mergeStatic, mesh, beam } from '../core/merge.js';
import { SPOTS } from '../park/layout.js';

const R = 13; // 바퀴 반지름
const HUB = 15.5; // 중심 높이
const CABINS = 12;
const PERIOD = 80; // 한 바퀴 시간 (초)

// 🎡 구름 관람차: 계속 천천히 돌아요. 아래쪽 칸에 타고 한 바퀴 돌면 내려요.
export class Ferris extends Ride {
  constructor(ctx) {
    const { x, z } = SPOTS.ferris;
    super(ctx, {
      id: 'ferris',
      name: '구름 관람차',
      icon: '🎡',
      mode: 'loop',
      seats: CABINS * 2,
      cam: 'third',
      board: { x: x - 6.5, z, r: 3.6 },
      exit: { x: x - 7, z: z + 3, ry: -Math.PI / 2 },
    });
    this.group.position.set(x, 0, z);
    this.group.rotation.y = Math.PI / 2; // 바퀴 면이 광장(서쪽)을 보도록
    this.boardTimes = new Map();
    this.build();
  }

  build() {
    const g = this.group;
    const white = toon(0xffffff);
    const lav = toon(PASTEL.lavender);
    // 다리 (A자 두 쌍)
    for (const side of [-1, 1]) {
      const zz = side * 2.2;
      g.add(beam(new THREE.Vector3(-7, 0, zz), new THREE.Vector3(0, HUB, zz * 0.55), 0.35, lav, 8));
      g.add(beam(new THREE.Vector3(7, 0, zz), new THREE.Vector3(0, HUB, zz * 0.55), 0.35, lav, 8));
      g.add(beam(new THREE.Vector3(-4.2, 6, zz * 0.8), new THREE.Vector3(4.2, 6, zz * 0.8), 0.18, lav, 6));
    }
    g.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 3.2, 16), toon(PASTEL.gold), { y: HUB, rx: Math.PI / 2 }));
    // 탑승장
    g.add(mesh(new THREE.BoxGeometry(6, 0.5, 4), toon(0xfff3e6), { y: 0.25 }));
    g.add(mesh(new THREE.BoxGeometry(3.4, 0.25, 7), toon(0xf1e6ff), { x: 0, y: 0.13, z: 0 }));
    mergeStatic(g);

    // 도는 바퀴
    const wheel = new THREE.Group();
    wheel.position.y = HUB;
    wheel.userData.dynamic = true;
    g.add(wheel);
    const rimMat = toon(PASTEL.pink);
    for (const zz of [-0.9, 0.9]) {
      wheel.add(mesh(new THREE.TorusGeometry(R, 0.22, 8, 64), rimMat, { z: zz }));
      wheel.add(mesh(new THREE.TorusGeometry(R * 0.55, 0.14, 6, 40), white, { z: zz }));
      for (let i = 0; i < CABINS; i++) {
        const a = (i / CABINS) * Math.PI * 2;
        wheel.add(beam(new THREE.Vector3(0, 0, zz), new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, zz), 0.07, white, 5));
        const a2 = a + Math.PI / CABINS;
        wheel.add(beam(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, zz), new THREE.Vector3(Math.cos(a2) * R * 0.55, Math.sin(a2) * R * 0.55, zz), 0.05, white, 4));
      }
    }
    for (let i = 0; i < CABINS; i++) {
      const a = (i / CABINS) * Math.PI * 2;
      wheel.add(beam(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, -0.9), new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0.9), 0.08, white, 5));
    }
    // 테두리 전구
    const bulbColors = [0xffe066, 0xff8fb4, 0x8fd0ff, 0x8fe3c0];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      for (const zz of [-1.1, 1.1]) wheel.add(mesh(new THREE.SphereGeometry(0.16, 6, 5), glow(bulbColors[i % 4], 0.3), { x: Math.cos(a) * R, y: Math.sin(a) * R, z: zz, cast: false }));
    }
    // 하트 장식 (중심)
    const hs = new THREE.Shape();
    hs.moveTo(0, -1.2);
    hs.bezierCurveTo(-2, 0, -1.4, 1.6, 0, 0.6);
    hs.bezierCurveTo(1.4, 1.6, 2, 0, 0, -1.2);
    const heartGeo = new THREE.ExtrudeGeometry(hs, { depth: 0.3, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 2 });
    for (const zz of [-1.7, 1.4]) wheel.add(mesh(heartGeo, glow(0xff6fa0, 0.4), { z: zz }));
    mergeStatic(wheel);
    this.wheel = wheel;

    // 칸 (항상 똑바로)
    this.cabins = [];
    const cabinColors = [0xff9fc0, 0x8fd0ff, 0xffd86b, 0x8fe3c0, 0xc4a8ff, 0xffab8f];
    for (let i = 0; i < CABINS; i++) {
      const cab = new THREE.Group();
      const col = toon(cabinColors[i % cabinColors.length]);
      cab.add(mesh(new THREE.CylinderGeometry(1.25, 1.1, 0.25, 16), col, { y: -2.3 }));
      cab.add(mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.8, 16, 1, true), col, { y: -1.8 }));
      cab.add(mesh(new THREE.SphereGeometry(1.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), col, { y: -0.35 }));
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        cab.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 5), toon(0xffffff), { x: Math.cos(a) * 1.15, y: -0.9, z: Math.sin(a) * 1.15 }));
      }
      cab.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6), toon(0xffffff), { y: 0.45 }));
      // 의자 두 개 (마주보기)
      for (const s of [-1, 1]) cab.add(mesh(new THREE.BoxGeometry(1.1, 0.15, 0.5), toon(0xfff3e6), { y: -1.95, z: 0.55 * s }));
      cab.add(mesh(new THREE.SphereGeometry(0.15, 8, 6), glow(0xfff1c4, 0.3), { y: 0.95 }));
      mergeStatic(cab);
      g.add(cab);
      this.cabins.push(cab);
    }
  }

  angle(t) {
    return (t / PERIOD) * Math.PI * 2;
  }

  cabinAngle(i, t) {
    return -Math.PI / 2 + (i / CABINS) * Math.PI * 2 + this.angle(t);
  }

  // 지금 가장 아래 있는 칸
  bottomCabin(t) {
    let best = 0;
    let bd = 99;
    for (let i = 0; i < CABINS; i++) {
      const a = this.cabinAngle(i, t);
      const d = Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2)));
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  pickSeat(role, partnerSeat) {
    if (partnerSeat !== null && partnerSeat !== undefined) {
      const mate = partnerSeat ^ 1;
      if (!this.riders.has(mate)) return mate;
    }
    const t = this.ctx.now();
    let cab = this.bottomCabin(t);
    for (let k = 0; k < CABINS; k++) {
      const c = (cab + k) % CABINS;
      const s0 = c * 2 + (role === 'host' ? 0 : 1);
      if (!this.riders.has(s0)) return s0;
      if (!this.riders.has(s0 ^ 1)) return s0 ^ 1;
    }
    return -1;
  }

  onBoard(seat, who, t) {
    this.boardTimes.set(seat, t);
  }

  update(dt, t) {
    this.wheel.rotation.z = this.angle(t);
    for (let i = 0; i < CABINS; i++) {
      const a = this.cabinAngle(i, t);
      const cab = this.cabins[i];
      cab.position.set(Math.cos(a) * R, HUB + Math.sin(a) * R, 0);
      cab.rotation.z = Math.sin(t * 0.9 + i) * 0.03;
    }
  }

  seatTransform(seat, t, outPos, outQuat) {
    const i = Math.floor(seat / 2);
    const side = seat % 2 ? 1 : -1;
    const cab = this.cabins[i];
    const local = new THREE.Vector3(0, -1.88, 0.55 * side);
    cab.updateMatrixWorld();
    outPos.copy(local).applyMatrix4(cab.matrixWorld);
    // 서로 마주보게
    const yaw = this.group.rotation.y + (side > 0 ? Math.PI : 0);
    outQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    return outPos;
  }

  riderInfo(seat, t) {
    return { pose: 'sit', wind: 0.08 };
  }

  shouldExit(seat, t, boardTime) {
    return t - boardTime > PERIOD + 1.5;
  }

  statusText(t, seat) {
    const i = Math.floor((seat ?? 0) / 2);
    const a = this.cabinAngle(i, t);
    const h = HUB + Math.sin(a) * R;
    const top = Math.sin(a) > 0.97;
    return top ? '✨ 꼭대기! ✨' : `높이 ${Math.max(0, Math.round(h * 1.25))}m`;
  }

  // 꼭대기에서 같은 칸이면 하트
  checkEvents(t, cb) {
    for (const [seat, who] of this.riders) {
      if (who !== 'me') continue;
      const i = Math.floor(seat / 2);
      const a = this.cabinAngle(i, t);
      const atTop = Math.sin(a) > 0.985;
      if (atTop && !this._topFired) {
        this._topFired = true;
        const together = this.riders.get(seat ^ 1) === 'partner';
        cb({ type: 'top', say: together ? '💖' : '🤩', sound: 'chime', photo: together, hearts: together });
        if (together) this.ctx.hearts?.(this.cabins[i]);
      }
      if (!atTop && Math.sin(a) < 0.9) this._topFired = false;
    }
  }

  thirdPersonCam(seat, t, outPos, outTarget) {
    const i = Math.floor(seat / 2);
    const cab = this.cabins[i];
    cab.updateMatrixWorld();
    const c = new THREE.Vector3().setFromMatrixPosition(cab.matrixWorld);
    const ctrl = this.ctx.controls();
    const yaw = Math.PI + ctrl.lookYaw * 0.8;
    outPos.set(c.x + Math.cos(yaw) * 9, c.y + 1.5 + ctrl.lookPitch * 6, c.z + Math.sin(yaw) * 9);
    outTarget.set(c.x, c.y - 1.2, c.z);
    return true;
  }

  photoCam(t) {
    const seat = [...this.riders.keys()][0] ?? 0;
    const cab = this.cabins[Math.floor(seat / 2)];
    cab.updateMatrixWorld();
    const c = new THREE.Vector3().setFromMatrixPosition(cab.matrixWorld);
    return { pos: new THREE.Vector3(c.x - 3.6, c.y - 1.0, c.z + 0.2), target: new THREE.Vector3(c.x, c.y - 1.6, c.z) };
  }
}
