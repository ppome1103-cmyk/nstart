import * as THREE from 'three';
import { Ride } from './Ride.js';
import { toon, glow, makeSign, glowTexture, PASTEL } from '../core/materials.js';
import { mergeStatic, mesh } from '../core/merge.js';
import { SPOTS } from '../park/layout.js';
import { clamp } from '../core/rng.js';
import { sfx, vibrate } from '../audio.js';

const HW = 9; // 경기장 반폭 (x)
const HD = 6.5; // 반깊이 (z)
const CAR_R = 1.05;
const SESSION = 75;
const AI = 4;

function buildCar(color) {
  const g = new THREE.Group();
  const body = toon(color);
  g.add(mesh(new THREE.TorusGeometry(1.0, 0.22, 8, 24), toon(0x3b3550), { y: 0.3, rx: Math.PI / 2, sz: 0.9 }));
  g.add(mesh(new THREE.CylinderGeometry(1.0, 1.05, 0.5, 24), body, { y: 0.45 }));
  g.add(mesh(new THREE.BoxGeometry(1.3, 0.6, 0.5), body, { y: 0.95, z: -0.55 }));
  g.add(mesh(new THREE.SphereGeometry(0.55, 14, 10), body, { y: 0.7, z: 0.55, sx: 1.4, sy: 0.6 }));
  // 핸들
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), toon(0x3b3550), { y: 0.95, z: 0.4, rx: 0.6 }));
  g.add(mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 14), toon(0x3b3550), { y: 1.15, z: 0.53, rx: 0.6 - Math.PI / 2 }));
  // 천장까지 막대
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.4, 6), toon(0xcccccc), { y: 2.6, z: -0.75 }));
  g.add(mesh(new THREE.SphereGeometry(0.15, 8, 6), glow(0xff6b6b, 0.5), { y: 1.0, z: 1.05 }));
  mergeStatic(g);
  return g;
}

// 🚗 범퍼카: 직접 운전해요! 서로 박으면 통~
export class BumperCars extends Ride {
  constructor(ctx) {
    const { x, z } = SPOTS.bumper;
    super(ctx, {
      id: 'bumper',
      name: '통통 범퍼카',
      icon: '🚗',
      mode: 'drive',
      seats: 2,
      cam: 'third',
      board: { x: x - HW - 2.2, z: z - 1, r: 3.6 },
      exit: { x: x - HW - 2.6, z: z + 1.5, ry: -Math.PI / 2 },
    });
    this.group.position.set(x, 0, z);
    this.cars = [];
    this.state = [
      { x: -4, z: 3, yaw: Math.PI / 2, vx: 0, vz: 0 },
      { x: -4, z: -3, yaw: Math.PI / 2, vx: 0, vz: 0 },
    ];
    this.remote = new Map(); // seat → { x, z, yaw }
    this.bumps = 0;
    this.lastBump = 0;
    this.build();
  }

  build() {
    const g = this.group;
    g.add(mesh(new THREE.BoxGeometry(HW * 2 + 1, 0.3, HD * 2 + 1), toon(0x9b93b8), { y: 0.15 }));
    // 바닥 무늬
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const cg = c.getContext('2d');
    cg.fillStyle = '#7d7698';
    cg.fillRect(0, 0, 256, 256);
    cg.strokeStyle = 'rgba(255,255,255,0.12)';
    cg.lineWidth = 2;
    for (let i = 0; i < 256; i += 32) {
      cg.beginPath();
      cg.moveTo(i, 0);
      cg.lineTo(i, 256);
      cg.moveTo(0, i);
      cg.lineTo(256, i);
      cg.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 3);
    tex.colorSpace = THREE.SRGBColorSpace;
    const floor = mesh(new THREE.PlaneGeometry(HW * 2, HD * 2), new THREE.MeshToonMaterial({ map: tex }), { y: 0.31, rx: -Math.PI / 2, cast: false });
    floor.userData.dynamic = true;
    g.add(floor);
    // 범퍼 벽
    const wall = toon(PASTEL.yellow);
    g.add(mesh(new THREE.BoxGeometry(HW * 2 + 1, 0.6, 0.5), wall, { y: 0.6, z: HD + 0.25 }));
    g.add(mesh(new THREE.BoxGeometry(HW * 2 + 1, 0.6, 0.5), wall, { y: 0.6, z: -HD - 0.25 }));
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.6, HD * 2), wall, { y: 0.6, x: HW + 0.25 }));
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.6, HD * 2), wall, { y: 0.6, x: -HW - 0.25 }));
    // 기둥 + 천장 그물
    const poleMat = toon(PASTEL.lavender);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 6, 10), poleMat, { x: (HW + 0.6) * sx, y: 3, z: (HD + 0.6) * sz }));
    g.add(mesh(new THREE.BoxGeometry(HW * 2 + 2, 0.5, HD * 2 + 2), toon(PASTEL.pink), { y: 6.2 }));
    g.add(mesh(new THREE.BoxGeometry(HW * 2 + 2.4, 0.3, HD * 2 + 2.4), toon(0xffffff), { y: 6.5 }));
    for (let i = 0; i < 30; i++) {
      const a = i / 30;
      const along = i < 15;
      const x = along ? -HW - 1 + a * 2 * (HW + 1) * 2 : (i % 2 ? HW + 1.2 : -HW - 1.2);
      if (along) g.add(mesh(new THREE.SphereGeometry(0.14, 6, 5), glow([0xffe066, 0xff8fb4, 0x8fd0ff][i % 3], 0.4), { x, y: 5.9, z: HD + 1.1, cast: false }));
    }
    mergeStatic(g);
    // 천장 그물망 (선)
    const lines = [];
    for (let x = -HW; x <= HW; x += 1.5) lines.push(new THREE.Vector3(x, 5.9, -HD), new THREE.Vector3(x, 5.9, HD));
    for (let z = -HD; z <= HD; z += 1.5) lines.push(new THREE.Vector3(-HW, 5.9, z), new THREE.Vector3(HW, 5.9, z));
    const net = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: 0x5a5470 }));
    g.add(net);
    const sign = makeSign('🚗 통통 범퍼카', 1.2, { bg: '#ffd86b', fg: '#7a5a1a', font: 70 });
    sign.position.set(-HW - 1.35, 6.3, 0);
    sign.rotation.y = -Math.PI / 2;
    g.add(sign);

    const colors = [0xff6fa0, 0x6fa8ff, 0x8fe3c0, 0xffab8f, 0xc4a8ff, 0xffd86b];
    for (let i = 0; i < 2 + AI; i++) {
      const car = buildCar(colors[i]);
      g.add(car);
      this.cars.push(car);
    }
    // 불꽃
    this.sparkMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xbfe9ff, blending: THREE.AdditiveBlending, depthWrite: false });
    this.sparks = this.cars.map(() => {
      const s = new THREE.Sprite(this.sparkMat);
      s.scale.set(0.8, 0.8, 1);
      s.visible = false;
      g.add(s);
      return s;
    });
    this.bumpFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff1a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.bumpFlash.scale.set(3, 3, 1);
    g.add(this.bumpFlash);
    this.ctx.world.boxes.push({ x: g.position.x, z: g.position.z, hw: HW + 0.6, hd: HD + 0.6, rot: 0 });
  }

  // AI 차: 놀이공원 시간으로 정해진 경로 (두 폰이 같게)
  aiPose(i, t) {
    const k = i + 1;
    const w1 = 0.23 + k * 0.05;
    const w2 = 0.31 + k * 0.04;
    const x = Math.sin(t * w1 + k * 1.7) * (HW - 1.6);
    const z = Math.sin(t * w2 + k * 2.3) * (HD - 1.6);
    const dx = Math.cos(t * w1 + k * 1.7) * w1 * (HW - 1.6);
    const dz = Math.cos(t * w2 + k * 2.3) * w2 * (HD - 1.6);
    return { x, z, yaw: Math.atan2(dx, dz) };
  }

  pickSeat(role) {
    const pref = role === 'host' ? 0 : 1;
    if (!this.riders.has(pref)) return pref;
    if (!this.riders.has(1 - pref)) return 1 - pref;
    return -1;
  }

  onBoard(seat, who) {
    if (who === 'me') {
      const s = this.state[seat];
      s.x = -6;
      s.z = seat === 0 ? 3 : -3;
      s.yaw = Math.PI / 2;
      s.vx = s.vz = 0;
      this.bumps = 0;
    }
  }

  setRemote(seat, x, z, yaw) {
    const c = this.group.position;
    this.remote.set(seat, { x: x - c.x, z: z - c.z, yaw });
  }

  // 조이스틱 입력으로 운전 (카메라 기준 방향)
  drive(input, dt, t, camYaw) {
    const seat = this.ctx.mySeat(this);
    if (seat === null) return;
    const s = this.state[seat];
    const mag = Math.min(1, Math.hypot(input.x, input.y));
    if (mag > 0.1) {
      const fx = -Math.sin(camYaw);
      const fz = -Math.cos(camYaw);
      const rx = Math.cos(camYaw);
      const rz = -Math.sin(camYaw);
      const dx = fx * input.y + rx * input.x;
      const dz = fz * input.y + rz * input.x;
      const want = Math.atan2(dx, dz);
      let d = want - s.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      s.yaw += clamp(d, -3.2 * dt, 3.2 * dt);
      const acc = 11 * mag * Math.max(0.2, Math.cos(d));
      s.vx += Math.sin(s.yaw) * acc * dt;
      s.vz += Math.cos(s.yaw) * acc * dt;
    }
    // 마찰
    const fr = Math.exp(-1.6 * dt);
    s.vx *= fr;
    s.vz *= fr;
    const sp = Math.hypot(s.vx, s.vz);
    if (sp > 7) {
      s.vx *= 7 / sp;
      s.vz *= 7 / sp;
    }
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    // 벽
    let hit = 0;
    if (s.x > HW - CAR_R) {
      s.x = HW - CAR_R;
      hit = Math.abs(s.vx);
      s.vx = -s.vx * 0.7;
    }
    if (s.x < -HW + CAR_R) {
      s.x = -HW + CAR_R;
      hit = Math.abs(s.vx);
      s.vx = -s.vx * 0.7;
    }
    if (s.z > HD - CAR_R) {
      s.z = HD - CAR_R;
      hit = Math.abs(s.vz);
      s.vz = -s.vz * 0.7;
    }
    if (s.z < -HD + CAR_R) {
      s.z = -HD + CAR_R;
      hit = Math.abs(s.vz);
      s.vz = -s.vz * 0.7;
    }
    // 다른 차와 충돌
    const others = [];
    for (let i = 0; i < AI; i++) {
      const p = this.aiPose(i, t);
      others.push({ x: p.x, z: p.z, vx: 0, vz: 0 });
    }
    for (const [rs, r] of this.remote) if (rs !== seat && this.riders.get(rs) === 'partner') others.push({ x: r.x, z: r.z, vx: 0, vz: 0, partner: true });
    for (const o of others) {
      const dx = s.x - o.x;
      const dz = s.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < CAR_R * 2 && d > 0.001) {
        const nx = dx / d;
        const nz = dz / d;
        s.x = o.x + nx * CAR_R * 2;
        s.z = o.z + nz * CAR_R * 2;
        const vn = s.vx * nx + s.vz * nz;
        const impact = Math.max(2.5, Math.abs(vn) + 2);
        if (vn < 0) {
          s.vx -= vn * nx * 1.7;
          s.vz -= vn * nz * 1.7;
        }
        s.vx += nx * impact * 0.6;
        s.vz += nz * impact * 0.6;
        hit = Math.max(hit, impact + (o.partner ? 3 : 0));
        if (o.partner && t - this.lastBump > 0.5) {
          this.ctx.net()?.send({ t: 'rv', id: this.id, k: 'bump', nx: -nx, nz: -nz, power: impact });
        }
      }
    }
    if (hit > 1.5 && t - this.lastBump > 0.35) {
      this.lastBump = t;
      this.bumps++;
      this.bumpAt(s.x, s.z, hit);
    }
  }

  bumpAt(x, z, power) {
    sfx.bump();
    vibrate(Math.min(120, 30 + power * 12));
    this.ctx.fx.shake(Math.min(0.7, 0.2 + power * 0.07));
    this.bumpFlash.position.set(x, 1, z);
    this.bumpFlash.material.opacity = 1;
    if (power > 5) this.ctx.me().avatar.say(['😆', '😵', '🤣'][Math.floor(Math.random() * 3)], 1.2);
  }

  get actionLabel() {
    return '📯 빵빵!';
  }

  action() {
    sfx.whistle();
    this.ctx.me().avatar.say('📯', 1);
    this.ctx.net()?.send({ t: 'rv', id: this.id, k: 'horn' });
  }

  onNet(msg) {
    if (msg.k === 'horn') {
      this.ctx.partner()?.avatar.say('📯', 1);
      if (this.ctx.mineOn(this)) sfx.whistle();
    }
    if (msg.k === 'bump') {
      const seat = this.ctx.mySeat(this);
      if (seat === null) return;
      const s = this.state[seat];
      s.vx += msg.nx * msg.power * 0.9;
      s.vz += msg.nz * msg.power * 0.9;
      this.bumps++;
      this.bumpAt(s.x, s.z, msg.power + 2);
    }
  }

  update(dt, t) {
    for (let i = 0; i < 2 + AI; i++) {
      const car = this.cars[i];
      let pose;
      if (i >= 2) pose = this.aiPose(i - 2, t);
      else if (this.riders.get(i) === 'me') pose = this.state[i];
      else if (this.riders.get(i) === 'partner' && this.remote.has(i)) pose = this.remote.get(i);
      else pose = { x: -6, z: i === 0 ? 3 : -3, yaw: Math.PI / 2 };
      car.position.set(pose.x, 0.3, pose.z);
      car.rotation.y = pose.yaw;
      const spark = this.sparks[i];
      const moving = i >= 2 || this.riders.has(i);
      spark.visible = moving && Math.random() < 0.25;
      if (spark.visible) spark.position.set(pose.x - Math.sin(pose.yaw) * 0.75, 5.85, pose.z - Math.cos(pose.yaw) * 0.75);
    }
    this.bumpFlash.material.opacity = Math.max(0, this.bumpFlash.material.opacity - dt * 4);
  }

  seatTransform(seat, t, outPos, outQuat) {
    const car = this.cars[seat];
    car.updateMatrixWorld();
    outPos.set(0, 0.55, -0.15).applyMatrix4(car.matrixWorld);
    car.getWorldQuaternion(outQuat);
    return outPos;
  }

  riderInfo(seat) {
    if (this.riders.get(seat) === 'me') {
      const s = this.state[seat];
      const sp = Math.hypot(s.vx, s.vz);
      return { pose: 'drive', wind: sp / 14, lines: clamp((sp - 4) / 6, 0, 0.3) };
    }
    return { pose: 'drive' };
  }

  shouldExit(seat, t, boardTime) {
    return t - boardTime > SESSION;
  }

  statusText(t, seat) {
    const left = Math.max(0, Math.ceil(SESSION - (t - (this.ctx.myBoardTime?.() ?? t))));
    return `💥 ${this.bumps}번 쿵! · ${left}초`;
  }

  thirdPersonCam(seat, t, outPos, outTarget) {
    const car = this.cars[seat];
    const ctrl = this.ctx.controls();
    const yaw = ctrl.camYaw;
    const p = new THREE.Vector3();
    car.getWorldPosition(p);
    outPos.set(p.x + Math.sin(yaw) * 7, p.y + 5 + ctrl.lookPitch * 3, p.z + Math.cos(yaw) * 7);
    outTarget.set(p.x, p.y + 0.8, p.z);
    return true;
  }

  photoCam(t) {
    const seat = [...this.riders.keys()][0] ?? 0;
    const car = this.cars[seat];
    const p = new THREE.Vector3();
    car.getWorldPosition(p);
    const fwd = new THREE.Vector3(Math.sin(car.rotation.y), 0, Math.cos(car.rotation.y));
    return { pos: p.clone().addScaledVector(fwd, 3).add(new THREE.Vector3(0, 1.8, 0)), target: p.clone().add(new THREE.Vector3(0, 1, 0)) };
  }
}
