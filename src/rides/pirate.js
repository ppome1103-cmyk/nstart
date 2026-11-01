import * as THREE from 'three';
import { Ride } from './Ride.js';
import { toon, glow, stripeMat, makeSign, PASTEL } from '../core/materials.js';
import { mergeStatic, mesh, beam } from '../core/merge.js';
import { SPOTS } from '../park/layout.js';
import { clamp, smooth } from '../core/rng.js';

const PIVOT = 13;
const ARM = 9.6;
const PERIOD = 6.2;
const RUN = 48;
const MAX_ANGLE = 1.35; // 약 77도
const ROWS = [-5.2, -2.6, 0, 2.6, 5.2];

// 🏴‍☠️ 해적선 (바이킹)
export class PirateShip extends Ride {
  constructor(ctx) {
    const { x, z } = SPOTS.pirate;
    super(ctx, {
      id: 'pirate',
      name: '하트 해적선',
      icon: '🏴‍☠️',
      mode: 'run',
      seats: ROWS.length * 2,
      countdown: 8,
      duration: RUN,
      cam: 'first',
      board: { x: x - 6.2, z: z + 2, r: 3.6 },
      exit: { x: x - 6.5, z: z + 5, ry: -Math.PI / 2 },
    });
    this.group.position.set(x, 0, z);
    this.events = [];
    for (let k = 0; k < 6; k++) {
      // 진폭이 큰 꼭대기마다 비명
      const tt = 20 + k * PERIOD;
      this.events.push({ time: tt, type: 'peak', say: k % 2 ? '😱' : '🙌', sound: k % 2 ? 'scream' : 'whee', vibrate: 80, hands: k === 0 });
    }
    this.events.push({ time: 22.4, type: 'photo', photo: true });
    this.build();
  }

  amp(rt) {
    if (rt < 0) return 0;
    const up = 18;
    const down = 14;
    if (rt < up) return MAX_ANGLE * smooth(rt / up);
    if (rt < RUN - down) return MAX_ANGLE;
    return MAX_ANGLE * smooth(clamp((RUN - rt) / down, 0, 1));
  }

  angle(t) {
    if (this.phase(t) !== 'running') return 0;
    const rt = this.runTime(t);
    return this.amp(rt) * Math.sin((rt / PERIOD) * Math.PI * 2);
  }

  angVel(t) {
    const h = 0.05;
    return (this.angle(t + h) - this.angle(t - h)) / (2 * h);
  }

  build() {
    const g = this.group;
    const frame = toon(PASTEL.lavender);
    for (const sx of [-3.2, 3.2]) {
      g.add(beam(new THREE.Vector3(sx * 1.4, 0, -7), new THREE.Vector3(sx, PIVOT, 0), 0.35, frame, 8));
      g.add(beam(new THREE.Vector3(sx * 1.4, 0, 7), new THREE.Vector3(sx, PIVOT, 0), 0.35, frame, 8));
      g.add(mesh(new THREE.SphereGeometry(0.6, 12, 10), toon(PASTEL.gold), { x: sx, y: PIVOT }));
    }
    g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 6.6, 12), toon(PASTEL.gold), { y: PIVOT, rz: Math.PI / 2 }));
    // 탑승장
    g.add(mesh(new THREE.BoxGeometry(4.4, 0.5, 15), toon(0xfff3e6), { x: -4.4, y: 0.25 }));
    mergeStatic(g);
    const sign = makeSign('🏴‍☠️ 하트 해적선', 1.1, { bg: '#6fa8ff', font: 70 });
    sign.position.set(-6.8, 2.6, 4.5);
    sign.rotation.y = -Math.PI / 2;
    g.add(sign);

    const swing = new THREE.Group();
    swing.position.y = PIVOT;
    swing.userData.dynamic = true;
    g.add(swing);
    for (const sx of [-2.3, 2.3]) {
      swing.add(beam(new THREE.Vector3(sx, 0, 0), new THREE.Vector3(sx * 0.8, -ARM + 1, -3.5), 0.2, toon(0xffffff), 6));
      swing.add(beam(new THREE.Vector3(sx, 0, 0), new THREE.Vector3(sx * 0.8, -ARM + 1, 3.5), 0.2, toon(0xffffff), 6));
    }
    // 배 몸통 (옆모습을 밀어서)
    const hull = new THREE.Shape();
    hull.moveTo(-7.8, 1.6);
    hull.quadraticCurveTo(-7, -0.2, -4.5, -1.4);
    hull.lineTo(4.5, -1.4);
    hull.quadraticCurveTo(7, -0.2, 7.8, 1.6);
    hull.lineTo(6.8, 1.2);
    hull.lineTo(-6.8, 1.2);
    hull.closePath();
    const hullGeo = new THREE.ExtrudeGeometry(hull, { depth: 3.6, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 2 });
    hullGeo.translate(0, 0, -1.8);
    hullGeo.rotateY(Math.PI / 2);
    const ship = new THREE.Group();
    ship.position.y = -ARM;
    ship.add(mesh(hullGeo, toon(0xff8f8f)));
    ship.add(mesh(new THREE.BoxGeometry(3.4, 0.25, 14), stripeMat('#ffe7b0', '#f3d39a', 14, true), { y: 0.25 }));
    // 줄무늬 띠
    ship.add(mesh(new THREE.BoxGeometry(3.95, 0.3, 13.4), toon(0xffffff), { y: 0.7 }));
    // 의자 줄
    for (const rz of ROWS) {
      ship.add(mesh(new THREE.BoxGeometry(3.2, 0.5, 0.6), toon(PASTEL.sky), { y: 0.5, z: rz }));
      ship.add(mesh(new THREE.BoxGeometry(3.2, 0.9, 0.15), toon(PASTEL.sky), { y: 0.9, z: rz - Math.sign(rz || 1) * 0.35 }));
      ship.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.0, 6), toon(PASTEL.gold), { y: 1.0, z: rz + Math.sign(rz || 1) * 0.55, rz: Math.PI / 2 }));
    }
    // 돛대와 하트 깃발
    ship.add(mesh(new THREE.CylinderGeometry(0.15, 0.18, 7, 8), toon(PASTEL.darkwood), { y: 4, z: 0, x: 0 }));
    const sail = mesh(new THREE.PlaneGeometry(3.6, 2.8, 4, 4), toon(0xfff8f0, { side: THREE.DoubleSide }), { y: 4.8, x: 0, ry: Math.PI / 2 });
    ship.add(sail);
    const hs = new THREE.Shape();
    hs.moveTo(0, -0.6);
    hs.bezierCurveTo(-1, 0, -0.7, 0.8, 0, 0.3);
    hs.bezierCurveTo(0.7, 0.8, 1, 0, 0, -0.6);
    for (const s of [-1, 1]) ship.add(mesh(new THREE.ShapeGeometry(hs), toon(0xff4f8a, { side: THREE.DoubleSide }), { y: 4.8, x: 0.03 * s, ry: Math.PI / 2 }));
    ship.add(mesh(new THREE.PlaneGeometry(1.2, 0.7), toon(0xff4f8a, { side: THREE.DoubleSide }), { y: 7.2, z: 0.6, ry: Math.PI / 2 }));
    // 앞뒤 장식
    ship.add(mesh(new THREE.SphereGeometry(0.5, 12, 10), toon(PASTEL.gold), { y: 1.8, z: 7.6 }));
    ship.add(mesh(new THREE.SphereGeometry(0.5, 12, 10), toon(PASTEL.gold), { y: 1.8, z: -7.6 }));
    for (let i = 0; i < 12; i++) ship.add(mesh(new THREE.CircleGeometry(0.28, 12), glow(0xffe7a3, 0.2), { x: 2.0, y: -0.2, z: -5.5 + i, ry: Math.PI / 2, cast: false }));
    mergeStatic(ship);
    swing.add(ship);
    this.swing = swing;
    this.ship = ship;
    this.ctx.world.colliders.push({ x: g.position.x, z: g.position.z - 7, r: 3.5 }, { x: g.position.x, z: g.position.z + 7, r: 3.5 }, { x: g.position.x, z: g.position.z, r: 3.8 });
    this.ctx.world.boxes.push({ x: g.position.x + 2.6, z: g.position.z, hw: 1.0, hd: 8, rot: 0 });
  }

  update(dt, t) {
    this.swing.rotation.x = this.angle(t);
  }

  seatTransform(seat, t, outPos, outQuat) {
    const row = Math.floor(seat / 2);
    const side = seat % 2 ? 0.75 : -0.75;
    const rz = ROWS[row];
    const facing = rz > 0 ? Math.PI : 0;
    this.ship.updateMatrixWorld();
    outPos.set(side, 0.75, rz).applyMatrix4(this.ship.matrixWorld);
    this.ship.getWorldQuaternion(outQuat);
    outQuat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing));
    return outPos;
  }

  riderInfo(seat, t) {
    if (this.phase(t) !== 'running') return { pose: 'hold' };
    const w = Math.abs(this.angVel(t));
    const a = Math.abs(this.angle(t));
    const amp = this.amp(this.runTime(t));
    const nearTop = amp > 0.9 && a > amp * 0.85;
    return {
      pose: 'hold',
      lines: clamp((w * ARM - 6) / 10, 0, 0.8),
      wind: clamp((w * ARM) / 16, 0, 1),
      fov: clamp(w * ARM * 0.8, 0, 14),
      shake: nearTop ? 0.5 : 0.05,
    };
  }

  thirdPersonCam(seat, t, outPos, outTarget) {
    const c = this.group.position;
    const ctrl = this.ctx.controls();
    const yaw = Math.PI + ctrl.lookYaw * 0.6;
    outPos.set(c.x + Math.cos(yaw) * 22, 7 + ctrl.lookPitch * 8, c.z + Math.sin(yaw) * 22);
    const p = new THREE.Vector3();
    this.seatTransform(seat, t, p, new THREE.Quaternion());
    outTarget.copy(p);
    return true;
  }

  photoCam(t) {
    const seat = [...this.riders.keys()][0] ?? 0;
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    this.seatTransform(seat, t, p, q);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    return { pos: p.clone().addScaledVector(fwd, 2.6).addScaledVector(up, 1.0), target: p.clone().addScaledVector(up, 0.9) };
  }
}
