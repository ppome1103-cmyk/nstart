import * as THREE from 'three';
import { Ride } from './Ride.js';
import { toon, glow, stripeMat, makeSign, PASTEL } from '../core/materials.js';
import { mergeStatic, mesh } from '../core/merge.js';
import { SPOTS } from '../park/layout.js';
import { clamp, smooth } from '../core/rng.js';
import { sfx } from '../audio.js';

const RUN = 45;
const SUBS = 3;
const CUPS_PER = 2;
const CUPS = SUBS * CUPS_PER;

function buildCup(color, dot) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const f = i / 10;
    pts.push(new THREE.Vector2(0.6 + Math.sin(f * Math.PI * 0.55) * 0.75 + f * 0.1, f * 1.15));
  }
  pts.unshift(new THREE.Vector2(0, 0));
  const cup = mesh(new THREE.LatheGeometry(pts, 28), toon(color, { side: THREE.DoubleSide }));
  g.add(cup);
  g.add(mesh(new THREE.TorusGeometry(1.42, 0.08, 6, 28), toon(0xffffff), { y: 1.15, rx: Math.PI / 2 }));
  g.add(mesh(new THREE.TorusGeometry(0.42, 0.12, 8, 16, Math.PI * 1.3), toon(color), { x: 1.45, y: 0.6, rz: -Math.PI / 2 - 0.5 }));
  // 물방울 무늬
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const y = 0.45 + (i % 2) * 0.35;
    const r = 0.6 + Math.sin((y / 1.15) * Math.PI * 0.55) * 0.75 + (y / 1.15) * 0.1 + 0.01;
    g.add(mesh(new THREE.CircleGeometry(0.13, 10), toon(dot), { x: Math.cos(a) * r, y, z: Math.sin(a) * r, ry: Math.PI / 2 - a, cast: false }));
  }
  // 가운데 돌리는 핸들
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 8), toon(0xffffff), { y: 0.5 }));
  g.add(mesh(new THREE.TorusGeometry(0.35, 0.06, 6, 16), toon(PASTEL.gold), { y: 0.9, rx: Math.PI / 2 }));
  // 의자
  g.add(mesh(new THREE.TorusGeometry(0.95, 0.22, 6, 20, Math.PI * 2), toon(0xfff3e6), { y: 0.3, rx: Math.PI / 2 }));
  mergeStatic(g);
  return g;
}

// ☕ 빙글빙글 커피컵
export class Cups extends Ride {
  constructor(ctx) {
    const { x, z } = SPOTS.cups;
    super(ctx, {
      id: 'cups',
      name: '빙글빙글 커피컵',
      icon: '☕',
      mode: 'run',
      seats: CUPS * 2,
      countdown: 8,
      duration: RUN,
      cam: 'third',
      board: { x: x - 8.6, z: z - 5, r: 3.6 },
      exit: { x: x - 9.2, z: z - 2.5, ry: -Math.PI / 2 },
    });
    this.group.position.set(x, 0, z);
    this.cupSpin = new Float32Array(CUPS); // 각도
    this.cupVel = new Float32Array(CUPS); // 추가 회전 속도
    this.mySpin = 0;
    this.events = [
      { time: 3, type: 'go', say: '🤩', sound: 'whee' },
      { time: 18, type: 'photo', photo: true },
    ];
    this.build();
  }

  build() {
    const g = this.group;
    g.add(mesh(new THREE.CylinderGeometry(8.6, 8.8, 0.4, 48), toon(0xf1e6ff), { y: 0.2 }));
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI - 0.5), Math.cos(a - Math.PI - 0.5))) < 0.2) continue;
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), toon(0xffffff), { x: Math.cos(a) * 8.8, y: 0.5, z: Math.sin(a) * 8.8 }));
    }
    g.add(mesh(new THREE.TorusGeometry(8.8, 0.05, 4, 64), toon(PASTEL.mint), { y: 1, rx: Math.PI / 2 }));
    mergeStatic(g);
    const sign = makeSign('☕ 빙글빙글 커피컵', 1.0, { bg: '#8fe3c0', fg: '#4a7a66', font: 70 });
    sign.position.set(-9.4, 2.4, -3.5);
    sign.rotation.y = -Math.PI / 2 - 0.5;
    g.add(sign);

    const main = new THREE.Group();
    main.userData.dynamic = true;
    g.add(main);
    main.add(mesh(new THREE.CylinderGeometry(8, 8, 0.25, 48), stripeMat('#fff3e6', '#ffe0ea', 16), { y: 0.5 }));
    // 가운데 큰 찻주전자
    const pot = new THREE.Group();
    pot.add(mesh(new THREE.SphereGeometry(1.6, 20, 16), toon(0xff9fc0), { y: 2.1, sy: 0.85 }));
    pot.add(mesh(new THREE.CylinderGeometry(0.6, 0.9, 0.5, 16), toon(0xff9fc0), { y: 3.4 }));
    pot.add(mesh(new THREE.SphereGeometry(0.3, 10, 8), toon(PASTEL.gold), { y: 3.8 }));
    pot.add(mesh(new THREE.CylinderGeometry(0.15, 0.35, 1.6, 10), toon(0xff9fc0), { x: 1.7, y: 2.6, rz: -0.9 }));
    pot.add(mesh(new THREE.TorusGeometry(0.6, 0.15, 6, 14, Math.PI * 1.4), toon(0xff9fc0), { x: -1.6, y: 2.2, rz: Math.PI / 2 + 0.6 }));
    pot.add(mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.8, 20), toon(0xffffff), { y: 0.9 }));
    mergeStatic(pot);
    main.add(pot);
    this.main = main;
    this.subs = [];
    this.cups = [];
    const colors = [0xff9fc0, 0x8fd0ff, 0xffd86b, 0x8fe3c0, 0xc4a8ff, 0xffab8f];
    for (let s = 0; s < SUBS; s++) {
      const a = (s / SUBS) * Math.PI * 2;
      const sub = new THREE.Group();
      sub.position.set(Math.cos(a) * 4.9, 0.65, Math.sin(a) * 4.9);
      sub.add(mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.15, 32), toon(0xffffff)));
      main.add(sub);
      this.subs.push(sub);
      for (let c = 0; c < CUPS_PER; c++) {
        const ca = (c / CUPS_PER) * Math.PI * 2;
        const holder = new THREE.Group();
        holder.position.set(Math.cos(ca) * 1.55, 0.08, Math.sin(ca) * 1.55);
        const idx = s * CUPS_PER + c;
        const cup = buildCup(colors[idx], 0xffffff);
        cup.scale.setScalar(0.85);
        holder.add(cup);
        sub.add(holder);
        this.cups.push(cup);
      }
    }
    this.ctx.world.colliders.push({ x: g.position.x, z: g.position.z, r: 8.8 });
  }

  update(dt, t) {
    const running = this.phase(t) === 'running';
    const rt = this.runTime(t);
    const k = running ? smooth(clamp(rt / 4, 0, 1)) * smooth(clamp((RUN - rt) / 4, 0, 1)) : 0;
    this.main.rotation.y += 0.35 * k * dt;
    for (const sub of this.subs) sub.rotation.y -= 0.7 * k * dt;
    for (let i = 0; i < CUPS; i++) {
      this.cupVel[i] *= Math.exp(-0.45 * dt);
      if (!running) this.cupVel[i] *= Math.exp(-3 * dt);
      this.cupSpin[i] += (0.6 * k + this.cupVel[i]) * dt;
      this.cups[i].rotation.y = this.cupSpin[i];
    }
  }

  get actionLabel() {
    return '🌀 돌려!';
  }

  action(seat, t) {
    if (this.phase(t) !== 'running') {
      this.ctx.hud.toast('출발하면 돌릴 수 있어요!');
      return;
    }
    const cup = Math.floor(seat / 2);
    this.spinCup(cup);
    this.mySpin += 1;
    this.ctx.net()?.send({ t: 'rv', id: this.id, k: 'spin', cup });
  }

  spinCup(cup) {
    this.cupVel[cup] = Math.min(9, this.cupVel[cup] + 1.4);
    if (this.ctx.mineOn(this)) sfx.click();
  }

  onNet(msg) {
    if (msg.k === 'spin') this.spinCup(msg.cup);
  }

  onBoard(seat, who) {
    if (who === 'me') this.mySpin = 0;
  }

  onExit(seat, who) {
    if (who === 'me' && this.mySpin > 6) this.ctx.dizzy?.(Math.min(8, 2 + this.mySpin * 0.25));
  }

  seatTransform(seat, t, outPos, outQuat) {
    const cup = this.cups[Math.floor(seat / 2)];
    const side = seat % 2 ? 1 : -1;
    cup.updateMatrixWorld();
    outPos.set(0.82 * side, 0.45, 0).applyMatrix4(cup.matrixWorld);
    cup.getWorldQuaternion(outQuat);
    // 컵 안쪽(가운데)을 보도록
    outQuat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side > 0 ? -Math.PI / 2 : Math.PI / 2));
    return outPos;
  }

  riderInfo(seat, t) {
    const cup = Math.floor(seat / 2);
    const w = Math.abs(this.cupVel[cup]) + (this.phase(t) === 'running' ? 0.6 : 0);
    return { pose: 'hold', lines: clamp((w - 2) / 6, 0, 0.7), wind: clamp(w / 8, 0, 0.6), shake: clamp((w - 4) * 0.1, 0, 0.5), fov: clamp(w * 1.2, 0, 10) };
  }

  statusText(t, seat) {
    const ph = this.phase(t);
    if (ph === 'running') {
      const w = Math.abs(this.cupVel[Math.floor((seat ?? 0) / 2)]);
      return w > 5 ? '🌀🌀🌀 어지러워~' : w > 2 ? '🌀🌀 빙글빙글' : '🌀 버튼을 연타해요!';
    }
    return super.statusText(t);
  }

  thirdPersonCam(seat, t, outPos, outTarget) {
    const cup = this.cups[Math.floor(seat / 2)];
    cup.updateMatrixWorld();
    const c = new THREE.Vector3().setFromMatrixPosition(cup.matrixWorld);
    const ctrl = this.ctx.controls();
    const center = this.group.position;
    const out = new THREE.Vector3(c.x - center.x, 0, c.z - center.z).normalize();
    out.applyAxisAngle(new THREE.Vector3(0, 1, 0), ctrl.lookYaw * 0.7);
    outPos.set(c.x + out.x * 5.5, c.y + 4.5 + ctrl.lookPitch * 4, c.z + out.z * 5.5);
    outTarget.set(c.x, c.y + 0.6, c.z);
    return true;
  }

  photoCam(t) {
    const seat = [...this.riders.keys()][0] ?? 0;
    const cup = this.cups[Math.floor(seat / 2)];
    cup.updateMatrixWorld();
    const c = new THREE.Vector3().setFromMatrixPosition(cup.matrixWorld);
    return { pos: c.clone().add(new THREE.Vector3(0, 3.4, 0.01)), target: c.clone().add(new THREE.Vector3(0, 0.5, 0)) };
  }
}
