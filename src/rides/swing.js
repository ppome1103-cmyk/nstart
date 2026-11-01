import * as THREE from 'three';
import { Ride } from './Ride.js';
import { toon, glow, stripeMat, makeSign, PASTEL } from '../core/materials.js';
import { mergeStatic, mesh } from '../core/merge.js';
import { SPOTS } from '../park/layout.js';
import { clamp, smooth, damp } from '../core/rng.js';

const N = 12;
const CHAIN = 4.6;
const RING = 3.6;
const RUN = 42;
const WMAX = 1.45;

// 🪢 회전그네
export class SwingRide extends Ride {
  constructor(ctx) {
    const { x, z } = SPOTS.swing;
    super(ctx, {
      id: 'swing',
      name: '구름 회전그네',
      icon: '🪁',
      mode: 'run',
      seats: N,
      countdown: 8,
      duration: RUN,
      cam: 'first',
      board: { x: x + 9.2, z: z + 1, r: 3.6 },
      exit: { x: x + 9.6, z: z + 3.5, ry: Math.PI / 2 },
    });
    this.group.position.set(x, 0, z);
    this.events = [
      { time: 8, type: 'up', say: '🙌', sound: 'whee', hands: true },
      { time: 16, type: 'photo', photo: true },
      { time: 22, type: 'wow', say: '🤩' },
    ];
    this.tilt = 0;
    this.phi = 0;
    this.build();
  }

  build() {
    const g = this.group;
    g.add(mesh(new THREE.CylinderGeometry(9.6, 9.8, 0.3, 40), toon(0xf1e6ff), { y: 0.15 }));
    g.add(mesh(new THREE.CylinderGeometry(1.4, 1.8, 2, 20), toon(PASTEL.pink), { y: 1 }));
    g.add(mesh(new THREE.CylinderGeometry(0.6, 0.7, 12, 16), stripeMat('#ffffff', '#c4a8ff', 12, true), { y: 6 }));
    // 바깥 울타리
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.18) continue;
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), toon(0xffffff), { x: Math.cos(a) * 9.7, y: 0.5, z: Math.sin(a) * 9.7 }));
    }
    g.add(mesh(new THREE.TorusGeometry(9.7, 0.05, 4, 64), toon(PASTEL.lavender), { y: 1.0, rx: Math.PI / 2 }));
    mergeStatic(g);
    const sign = makeSign('🪁 구름 회전그네', 1.0, { bg: '#c4a8ff', font: 70 });
    sign.position.set(10, 2.4, 0);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);

    // 위아래로 움직이고 도는 머리 부분
    const head = new THREE.Group();
    head.userData.dynamic = true;
    head.position.y = 8;
    g.add(head);
    const spin = new THREE.Group();
    head.add(spin);
    spin.add(mesh(new THREE.CylinderGeometry(RING + 0.6, RING + 0.9, 0.7, 32), toon(PASTEL.sky), { y: 0 }));
    spin.add(mesh(new THREE.ConeGeometry(RING + 1.2, 2.6, 32), stripeMat('#8fd0ff', '#ffffff', 12), { y: 1.65 }));
    spin.add(mesh(new THREE.SphereGeometry(0.5, 12, 10), toon(PASTEL.gold), { y: 3.1 }));
    // 구름 장식
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      spin.add(mesh(new THREE.SphereGeometry(0.75, 10, 8), toon(0xffffff), { x: Math.cos(a) * (RING + 0.9), y: 0.3, z: Math.sin(a) * (RING + 0.9) }));
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      spin.add(mesh(new THREE.SphereGeometry(0.12, 6, 5), glow([0xffe066, 0xff8fb4][i % 2], 0.35), { x: Math.cos(a) * (RING + 0.95), y: -0.3, z: Math.sin(a) * (RING + 0.95), cast: false }));
    }
    mergeStatic(spin);
    this.head = head;
    this.spinGroup = spin;
    this.chairs = [];
    const colors = [0xff9fc0, 0xffd86b, 0x8fe3c0, 0x8fd0ff];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(a) * RING, -0.3, Math.sin(a) * RING);
      pivot.rotation.y = -a; // 로컬 +x가 바깥쪽
      const arm = new THREE.Group(); // z축 기준으로 바깥으로 들림
      pivot.add(arm);
      for (const s of [-0.3, 0.3]) arm.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, CHAIN, 4), toon(0xdddddd), { z: s, y: -CHAIN / 2 }));
      const chair = new THREE.Group();
      chair.position.y = -CHAIN;
      chair.add(mesh(new THREE.BoxGeometry(0.6, 0.12, 0.7), toon(colors[i % 4]), { y: 0 }));
      chair.add(mesh(new THREE.BoxGeometry(0.7, 0.7, 0.1), toon(colors[i % 4]), { z: 0.32, y: 0.35 }));
      chair.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), toon(PASTEL.gold), { z: -0.32, y: 0.35, rz: Math.PI / 2 }));
      mergeStatic(chair);
      chair.userData.dynamic = true;
      arm.add(chair);
      mergeStatic(arm);
      spin.add(pivot);
      this.chairs.push({ pivot, arm, chair });
    }
    this.ctx.world.colliders.push({ x: g.position.x, z: g.position.z, r: 9.8 });
  }

  // 각속도와 회전각
  omega(rt) {
    if (rt < 0) return 0;
    const up = 10;
    const down = 10;
    if (rt < up) return WMAX * smooth(rt / up);
    if (rt < RUN - down) return WMAX;
    return WMAX * smooth(clamp((RUN - rt) / down, 0, 1));
  }

  spinAngle(rt) {
    // 수치 적분 (작은 단계)
    let a = 0;
    const h = 0.1;
    for (let x = 0; x < rt; x += h) a += this.omega(x) * Math.min(h, rt - x);
    return a;
  }

  update(dt, t) {
    const running = this.phase(t) === 'running';
    const rt = running ? this.runTime(t) : 0;
    const w = running ? this.omega(rt) : 0;
    if (running) {
      this._ang = (this._angBase || 0) + this.spinAngle(rt);
      this._wasRunning = true;
    } else if (this._wasRunning) {
      this._angBase = this._ang;
      this._wasRunning = false;
    }
    this.spinGroup.rotation.y = this._ang || 0;
    // 머리 높이/기울기
    const lift = running ? smooth(clamp(rt / 6, 0, 1)) * smooth(clamp((RUN - rt) / 6, 0, 1)) : 0;
    this.head.position.y = 8 + lift * 2.8;
    this.head.rotation.z = lift * 0.12 * Math.sin((this._ang || 0) * 0.3);
    // 원심력으로 의자가 바깥으로
    const r = RING + CHAIN * Math.sin(this.phi);
    const target = Math.atan((w * w * r) / 9.8);
    this.phi = damp(this.phi, target, 2.2, dt);
    for (const c of this.chairs) {
      c.arm.rotation.z = this.phi;
      c.chair.rotation.z = 0;
    }
  }

  seatTransform(seat, t, outPos, outQuat) {
    const c = this.chairs[seat];
    c.chair.updateMatrixWorld();
    outPos.set(0, 0.2, 0).applyMatrix4(c.chair.matrixWorld);
    c.chair.getWorldQuaternion(outQuat);
    // 진행 방향 보기: 로컬 -z가 도는 방향
    outQuat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    return outPos;
  }

  riderInfo(seat, t) {
    if (this.phase(t) !== 'running') return { pose: 'sit' };
    const w = this.omega(this.runTime(t));
    const v = w * (RING + CHAIN * Math.sin(this.phi));
    return { pose: 'sit', lines: clamp((v - 5) / 8, 0, 0.6), wind: clamp(v / 12, 0, 1), fov: clamp(v, 0, 10), shake: 0.03 };
  }

  thirdPersonCam(seat, t, outPos, outTarget) {
    const p = new THREE.Vector3();
    this.seatTransform(seat, t, p, new THREE.Quaternion());
    const c = this.group.position;
    const ctrl = this.ctx.controls();
    const out = new THREE.Vector3(p.x - c.x, 0, p.z - c.z).normalize();
    out.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.35 + ctrl.lookYaw * 0.5);
    outPos.set(p.x + out.x * 6.5, p.y + 1.6 + ctrl.lookPitch * 4, p.z + out.z * 6.5);
    outTarget.set(p.x, p.y + 0.6, p.z);
    return true;
  }

  photoCam(t) {
    const seat = [...this.riders.keys()][0] ?? 0;
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    this.seatTransform(seat, t, p, q);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    return { pos: p.clone().addScaledVector(fwd, 2.4).add(new THREE.Vector3(0, 0.9, 0)), target: p.clone().add(new THREE.Vector3(0, 0.6, 0)) };
  }
}
