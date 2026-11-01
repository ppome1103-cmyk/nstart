import * as THREE from 'three';
import { Ride } from './Ride.js';
import { Track, simulate } from '../core/track.js';
import { coasterPoints } from './coasterPath.js';
import { toon, glow, stripeMat, makeSign, PASTEL } from '../core/materials.js';
import { mergeStatic, mesh } from '../core/merge.js';
import { clamp } from '../core/rng.js';
import { sfx } from '../audio.js';

const STATION_S = 8; // 역에서 기차 앞머리 위치
const CAR_GAP = 2.4;
const CARS = 3;

// 🌠 별똥별 코스터
export class Coaster extends Ride {
  constructor(ctx) {
    super(ctx, {
      id: 'coaster',
      name: '별똥별 코스터',
      icon: '🎢',
      mode: 'run',
      seats: CARS * 2,
      countdown: 9,
      cam: 'first',
      board: { x: -1, z: -32, r: 3.6 },
      exit: { x: 6, z: -30.5, ry: Math.PI },
    });
    const track = (this.track = new Track(coasterPoints(), { closed: true, spacing: 0.5 }));
    const L = track.length;

    // 리프트 구간과 꼭대기 찾기
    let liftStart = 0;
    let top = 0;
    let maxY = 0;
    for (let i = 0; i < track.n; i++) {
      const p = track.pos[i];
      if (!liftStart && p.x > 19 && p.z < -42) liftStart = i * track.step;
      if (p.y > maxY) {
        maxY = p.y;
        top = i * track.step;
      }
    }
    this.liftStart = liftStart;
    this.liftEnd = top;
    const wrap = (s) => ((s % L) + L) % L;
    this.sim = simulate(track, {
      s0: STATION_S,
      sEnd: L + STATION_S,
      v0: 0,
      rule: (s, v, g, dt) => {
        const w = wrap(s);
        if (s < L && w < liftStart) return Math.min(4, v + 2 * dt);
        if (w >= liftStart && w < top && s < L) return Math.max(3.6, v + g * dt);
        if (s > L - 26) return Math.max(1.6, v - 9 * dt);
        return Math.max(1.2, v + (g - 0.0022 * v * v - 0.06) * dt);
      },
    });
    this.duration = this.sim.duration + 2;

    // 속도에 따른 기울기(뱅크): 커브에서 안쪽으로 기울어요
    const vAtS = new Float32Array(track.n + 1);
    for (let t = 0; t < this.sim.duration; t += 0.05) {
      const s = wrap(this.sim.sAt(t));
      vAtS[Math.round(s / track.step) % (track.n + 1)] = this.sim.vAt(t);
    }
    for (let i = 1; i <= track.n; i++) if (!vAtS[i]) vAtS[i] = vAtS[i - 1];
    const raw = new Float32Array(track.n + 1);
    for (let i = 1; i < track.n; i++) {
      const t0 = track.tan[i - 1];
      const t1 = track.tan[i + 1];
      if (Math.abs(track.tan[i].y) > 0.55) continue;
      const a0 = Math.atan2(t0.x, t0.z);
      const a1 = Math.atan2(t1.x, t1.z);
      let da = a1 - a0;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      const kappa = da / (2 * track.step);
      const v = vAtS[i];
      raw[i] = clamp(Math.atan((v * v * kappa) / 9.8), -1.1, 1.1);
    }
    const bank = new Float32Array(track.n + 1);
    const W = 10;
    for (let i = 0; i <= track.n; i++) {
      let sum = 0;
      let c = 0;
      for (let k = -W; k <= W; k++) {
        const j = (i + k + track.n) % track.n;
        sum += raw[j];
        c++;
      }
      bank[i] = sum / c;
    }
    track.applyBank(bank);

    // 이벤트 시간 찾기
    const timeAtS = (target) => {
      for (let t = 0; t < this.sim.duration; t += 0.02) if (this.sim.sAt(t) >= target) return t;
      return 0;
    };
    let valleyS = top;
    let minY = 99;
    for (let s = top; s < top + 40; s += 0.5) {
      const y = track.getPos(s).y;
      if (y < minY) {
        minY = y;
        valleyS = s;
      }
    }
    const tTop = timeAtS(top - 1);
    this.tTop = tTop;
    this.tValley = timeAtS(valleyS);
    this.events = [
      { time: tTop - 1.2, type: 'top', say: '😳' },
      { time: tTop + 0.4, type: 'drop', sound: 'scream', say: '😱', vibrate: [60, 40, 160], shake: 0.6, hands: true },
      { time: this.tValley - 0.55, type: 'photo', photo: true },
      { time: timeAtS(105), type: 'loop', sound: 'whee', say: '🤩' },
      { time: timeAtS(160), type: 'camel', say: '🙌', sound: 'whee' },
      { time: timeAtS(228), type: 'air', say: '💖', shake: 0.3 },
    ];

    this.build();
    this._p = new THREE.Vector3();
    this._lastClack = 0;
  }

  build() {
    const tr = this.track;
    const g = this.group;
    const railMat = toon(0xff8fb4);
    const spineMat = toon(0xc4a8ff);
    g.add(tr.tube(0.46, 0, 0.085, railMat, 6));
    g.add(tr.tube(-0.46, 0, 0.085, railMat, 6));
    g.add(tr.tube(0, -0.32, 0.17, spineMat, 8));
    g.add(tr.instanceAlong(new THREE.BoxGeometry(1.05, 0.1, 0.16), toon(0xffffff), 0.9, { upOff: -0.12 }));
    g.add(tr.instanceAlong(new THREE.BoxGeometry(0.12, 0.3, 0.12), spineMat, 0.9, { upOff: -0.25 }));
    // 리프트 체인
    g.add(tr.instanceAlong(new THREE.BoxGeometry(0.2, 0.05, 0.35), toon(0x5a5470), 0.45, { upOff: 0.0, from: this.liftStart, to: this.liftEnd - 1 }));
    // 기둥
    g.add(tr.supports(toon(0xfff3e6), { every: 4.5, minHeight: 1.0, radius: 0.2, under: 0.45 }));

    // 역
    const st = new THREE.Group();
    st.add(mesh(new THREE.BoxGeometry(22, 0.9, 3.6), toon(0xfff3e6), { x: -1, y: 0.45, z: -33.8 }));
    st.add(mesh(new THREE.BoxGeometry(22, 0.9, 1.4), toon(0xfff3e6), { x: -1, y: 0.45, z: -38.4 }));
    for (const x of [-11, -4, 3, 9]) {
      for (const z of [-32.4, -38.9]) st.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 4.6, 8), toon(PASTEL.lavender), { x, y: 3.2, z }));
    }
    const roof = mesh(new THREE.BoxGeometry(23, 0.4, 8), stripeMat('#ff9fc0', '#ffffff', 10), { x: -1, y: 5.6, z: -35.6 });
    st.add(roof);
    st.add(mesh(new THREE.BoxGeometry(23.4, 0.3, 8.4), toon(PASTEL.pink), { x: -1, y: 5.3, z: -35.6 }));
    // 계단
    for (let i = 0; i < 3; i++) st.add(mesh(new THREE.BoxGeometry(4, 0.3, 0.7), toon(0xf1e6ff), { x: -1, y: 0.15 + i * 0.3 - 0.3, z: -31.4 - i * 0.6 }));
    g.add(st);
    const sign = makeSign('🌠 별똥별 코스터', 1.4, { bg: '#c4a8ff', font: 72 });
    sign.position.set(-1, 6.8, -31.6);
    g.add(sign);
    // 별 장식 (꼭대기)
    const star = new THREE.Shape();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
      const r = k % 2 ? 0.7 : 1.6;
      if (k === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const starMesh = mesh(new THREE.ExtrudeGeometry(star, { depth: 0.4, bevelEnabled: false }), glow(0xffd86b, 0.5), { x: 20.5, y: 27.5, z: -64 });
    starMesh.userData.dynamic = true;
    g.add(starMesh);
    this.star = starMesh;
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 6), toon(0xfff3e6), { x: 20.5, y: 25, z: -64 }));
    mergeStatic(g);

    this.ctx.world.platforms.push({ x: -1, z: -33.8, hw: 11, hd: 1.8, top: 0.9, rot: 0 });
    // 레일 아래 막기: 역 쪽 레일 (걸어서 못 들어가게)
    this.ctx.world.boxes.push({ x: -1, z: -36.6, hw: 11.5, hd: 1.1, rot: 0 });

    // 기차
    this.cars = [];
    const colors = [0xff6fa0, 0x8fd0ff, 0xffd86b];
    for (let c = 0; c < CARS; c++) {
      const car = new THREE.Group();
      const bodyMat = toon(colors[c]);
      car.add(mesh(new THREE.BoxGeometry(1.7, 0.55, 2.0), bodyMat, { y: 0.35 }));
      car.add(mesh(new THREE.CapsuleGeometry(0.3, 1.1, 4, 10), bodyMat, { y: 0.55, x: 0.85, rx: Math.PI / 2 }));
      car.add(mesh(new THREE.CapsuleGeometry(0.3, 1.1, 4, 10), bodyMat, { y: 0.55, x: -0.85, rx: Math.PI / 2 }));
      car.add(mesh(new THREE.BoxGeometry(1.5, 0.75, 0.25), bodyMat, { y: 0.75, z: -0.9 }));
      if (c === 0) {
        car.add(mesh(new THREE.SphereGeometry(0.7, 14, 10), bodyMat, { y: 0.45, z: 1.0, sx: 1.2, sy: 0.7, sz: 0.9 }));
        car.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), glow(0xffe066, 0.6), { y: 0.6, z: 1.65 }));
      } else {
        car.add(mesh(new THREE.BoxGeometry(1.5, 0.6, 0.2), bodyMat, { y: 0.6, z: 0.95 }));
      }
      // 안전바
      const bar = mesh(new THREE.TorusGeometry(0.75, 0.06, 6, 16, Math.PI), toon(PASTEL.gold), { y: 0.62, z: 0.45, rx: -0.9 });
      car.add(bar);
      // 바퀴
      for (const sx of [-0.46, 0.46]) for (const sz of [-0.7, 0.7]) car.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 10), toon(0x5a5470), { x: sx, y: 0.02, z: sz, rz: Math.PI / 2 }));
      mergeStatic(car);
      this.ctx.scene.add(car);
      this.cars.push(car);
    }
  }

  leadS(t) {
    const rt = this.runTime(t);
    if (this.phase(t) !== 'running') return STATION_S;
    return this.sim.sAt(Math.min(rt, this.sim.duration));
  }

  carS(c, t) {
    return this.leadS(t) - c * CAR_GAP;
  }

  update(dt, t) {
    const q = new THREE.Quaternion();
    for (let c = 0; c < CARS; c++) {
      const s = this.carS(c, t);
      const car = this.cars[c];
      this.track.getPos(s, car.position);
      this.track.getQuat(s, q);
      car.quaternion.copy(q);
      const up = this.track.getUp(s, this._p);
      car.position.addScaledVector(up, 0.12);
    }
    this.star.rotation.y = t * 1.5;
    // 리프트 딸깍 소리
    const mine = this.ctx.mineOn(this);
    if (mine && this.phase(t) === 'running') {
      const s = this.leadS(t);
      if (s > this.liftStart && s < this.liftEnd && t - this._lastClack > 0.28) {
        this._lastClack = t;
        sfx.clack();
      }
    }
  }

  seatTransform(seat, t, outPos, outQuat) {
    const c = Math.floor(seat / 2);
    const side = seat % 2 ? -0.42 : 0.42;
    const s = this.carS(c, t) - 0.2;
    const p = this.track.getPos(s, outPos);
    this.track.getQuat(s, outQuat);
    const off = new THREE.Vector3(side, 0.62, 0).applyQuaternion(outQuat);
    p.add(off);
    return p;
  }

  riderInfo(seat, t) {
    const ph = this.phase(t);
    if (ph !== 'running') return { pose: 'hold' };
    const rt = this.runTime(t);
    const v = this.sim.vAt(rt);
    // 가속도로 G 계산
    const h = 0.12;
    const s0 = this.sim.sAt(rt - h);
    const s1 = this.sim.sAt(rt);
    const s2 = this.sim.sAt(rt + h);
    const p0 = this.track.getPos(s0);
    const p1 = this.track.getPos(s1);
    const p2 = this.track.getPos(s2);
    const acc = p2.add(p0).addScaledVector(p1, -2).divideScalar(h * h);
    acc.y += 9.8;
    const up = this.track.getUp(s1);
    const gz = acc.dot(up) / 9.8;
    let shake = 0;
    if (gz > 2.2) shake += (gz - 2.2) * 0.8;
    if (gz < 0.35) shake += (0.35 - gz) * 1.2;
    const lift = s1 > this.liftStart && s1 < this.liftEnd;
    if (lift) shake += 0.12;
    return {
      pose: 'hold',
      lines: clamp((v - 7) / 12, 0, 1),
      wind: clamp(v / 20, 0, 1),
      fov: clamp((v - 5) * 1.3, 0, 22),
      shake: shake + v * 0.012,
    };
  }

  statusText(t) {
    const ph = this.phase(t);
    if (ph === 'running') {
      const v = this.sim.vAt(this.runTime(t));
      return `${Math.round(v * 3.6 * 1.25)} km/h`;
    }
    return super.statusText(t);
  }

  // 사진 찍는 카메라: 첫 낙하 바닥에서 기차를 정면으로
  photoCam(t) {
    const s = this.carS(0, t) + 7;
    const p = this.track.getPos(s);
    const up = this.track.getUp(s);
    const pos = p.clone().addScaledVector(up, 1.6);
    const target = this.track.getPos(this.carS(1, t)).addScaledVector(this.track.getUp(this.carS(1, t)), 1.0);
    return { pos, target };
  }
}
