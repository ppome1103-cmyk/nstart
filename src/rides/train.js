import * as THREE from 'three';
import { Ride } from './Ride.js';
import { toon, glow, makeSign, glowTexture, PASTEL } from '../core/materials.js';
import { mergeStatic, mesh } from '../core/merge.js';
import { TRAIN_R } from '../park/layout.js';
import { sfx } from '../audio.js';

const STATIONS = [
  { a: Math.PI / 2, name: '정문역' },
  { a: 0, name: '동쪽역' },
  { a: -Math.PI / 2, name: '코스터역' },
  { a: Math.PI, name: '서쪽역' },
];
const VMAX = 8;
const ACC = 1.2;
const DWELL = 10;
const SEG = (Math.PI / 2) * TRAIN_R;
const TRAVEL = SEG / VMAX + VMAX / ACC;
const CYCLE = DWELL + TRAVEL;
const CARS = 3;
const GAP = 4.2;

// 🚂 꼬마 기차: 공원을 한 바퀴 돌아요. 역에서 타고 내려요.
export class Train extends Ride {
  constructor(ctx) {
    super(ctx, {
      id: 'train',
      name: '꼬마 기차',
      icon: '🚂',
      mode: 'loop',
      seats: CARS * 2,
      cam: 'third',
    });
    this.build();
    this._lastStop = -1;
  }

  // 놀이공원 시간 → 선로 위 거리 (반시계 방향으로 각도가 줄어듦)
  state(t) {
    const k = Math.floor(t / CYCLE);
    const tc = t - k * CYCLE;
    const st = ((k % 4) + 4) % 4;
    let d;
    let v = 0;
    if (tc < DWELL) d = 0;
    else {
      const tm = tc - DWELL;
      const ta = VMAX / ACC;
      const da = 0.5 * ACC * ta * ta;
      if (tm < ta) {
        d = 0.5 * ACC * tm * tm;
        v = ACC * tm;
      } else if (tm < TRAVEL - ta) {
        d = da + VMAX * (tm - ta);
        v = VMAX;
      } else {
        const r = TRAVEL - tm;
        d = SEG - 0.5 * ACC * r * r;
        v = ACC * r;
      }
    }
    return { s: st * SEG + d, v, stopped: tc < DWELL, station: st, left: DWELL - tc };
  }

  angleAt(s) {
    return STATIONS[0].a - s / TRAIN_R;
  }

  posAt(s, out = new THREE.Vector3()) {
    const a = this.angleAt(s);
    return out.set(Math.cos(a) * TRAIN_R, 0.25, Math.sin(a) * TRAIN_R);
  }

  build() {
    const g = this.group;
    // 선로
    const rail = toon(0x8f7fb8);
    for (const off of [-0.6, 0.6]) g.add(mesh(new THREE.TorusGeometry(TRAIN_R + off, 0.07, 4, 320), rail, { y: 0.2, rx: Math.PI / 2, cast: false }));
    const n = Math.floor((Math.PI * 2 * TRAIN_R) / 1.1);
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.12, 0.35), toon(0xc9926b), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      m.makeRotationY(-a).setPosition(Math.cos(a) * TRAIN_R, 0.08, Math.sin(a) * TRAIN_R);
      sleepers.setMatrixAt(i, m);
    }
    sleepers.receiveShadow = true;
    this.ctx.scene.add(sleepers);
    // 역
    for (const st of STATIONS) {
      const sg = new THREE.Group();
      const r = TRAIN_R - 3.2;
      sg.position.set(Math.cos(st.a) * r, 0, Math.sin(st.a) * r);
      sg.rotation.y = -st.a + Math.PI / 2;
      sg.add(mesh(new THREE.BoxGeometry(11, 0.5, 3), toon(0xfff3e6), { y: 0.25 }));
      for (const x of [-4.5, 4.5]) sg.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.6, 8), toon(PASTEL.mint), { x, y: 2.3, z: 0.8 }));
      sg.add(mesh(new THREE.BoxGeometry(11.5, 0.3, 3.4), toon(PASTEL.mint), { y: 4.2 }));
      sg.add(mesh(new THREE.ConeGeometry(1.0, 1.2, 4), toon(PASTEL.pink), { y: 5, ry: Math.PI / 4 }));
      sg.add(mesh(new THREE.BoxGeometry(2.4, 0.9, 0.5), toon(0xffffff), { y: 1, z: 1.2 }));
      mergeStatic(sg);
      const sign = makeSign(`🚂 ${st.name}`, 0.75, { bg: '#8fe3c0', fg: '#3f6f5c', font: 64 });
      sign.position.set(0, 3.6, -0.9);
      sign.rotation.y = Math.PI;
      sg.add(sign);
      const sign2 = sign.clone();
      sign2.rotation.y = 0;
      sign2.position.z = 0.9;
      sg.add(sign2);
      this.ctx.scene.add(sg);
      const br = TRAIN_R - 5.6;
      st.board = { x: Math.cos(st.a) * br, z: Math.sin(st.a) * br };
      this.ctx.world.interactables.push({
        x: st.board.x,
        z: st.board.z,
        r: 4,
        kind: 'ride',
        ride: this,
        label: () => this.ctx.rides.promptFor(this),
        onUse: () => this.ctx.rides.board(this),
      });
      this.ctx.world.platforms.push({ x: sg.position.x, z: sg.position.z, hw: 5.5, hd: 1.5, top: 0.5, rot: sg.rotation.y });
    }

    // 기차
    this.cars = [];
    const loco = new THREE.Group();
    loco.add(mesh(new THREE.BoxGeometry(1.9, 0.5, 3.6), toon(0x5a5470), { y: 0.55 }));
    loco.add(mesh(new THREE.CylinderGeometry(0.85, 0.85, 2.2, 16), toon(PASTEL.red), { y: 1.55, z: 0.6, rx: Math.PI / 2 }));
    loco.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.2, 16), toon(PASTEL.gold), { y: 1.55, z: 1.75, rx: Math.PI / 2 }));
    loco.add(mesh(new THREE.BoxGeometry(1.9, 1.9, 1.3), toon(PASTEL.red), { y: 1.75, z: -1.1 }));
    loco.add(mesh(new THREE.BoxGeometry(2.2, 0.2, 1.7), toon(0x5a5470), { y: 2.8, z: -1.1 }));
    loco.add(mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.9, 10), toon(0x5a5470), { y: 2.7, z: 1.2 }));
    loco.add(mesh(new THREE.CylinderGeometry(0.45, 0.3, 0.25, 10), toon(0x5a5470), { y: 3.2, z: 1.2 }));
    loco.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), glow(0xffe066, 0.6), { y: 1.55, z: 1.88 }));
    // 하트 문양
    const hs = new THREE.Shape();
    hs.moveTo(0, -0.25);
    hs.bezierCurveTo(-0.4, 0, -0.28, 0.32, 0, 0.12);
    hs.bezierCurveTo(0.28, 0.32, 0.4, 0, 0, -0.25);
    for (const s of [-1, 1]) loco.add(mesh(new THREE.ShapeGeometry(hs), toon(0xffffff, { side: THREE.DoubleSide }), { x: 0.96 * s, y: 1.8, z: -1.1, ry: (Math.PI / 2) * s }));
    for (const z of [-1.2, 0, 1.2]) for (const x of [-0.95, 0.95]) loco.add(mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.15, 14), toon(PASTEL.gold), { x, y: 0.4, z, rz: Math.PI / 2 }));
    mergeStatic(loco);
    this.ctx.scene.add(loco);
    this.loco = loco;
    const colors = [0xffd86b, 0x8fd0ff, 0xff9fc0];
    for (let c = 0; c < CARS; c++) {
      const car = new THREE.Group();
      car.add(mesh(new THREE.BoxGeometry(1.9, 0.6, 3.2), toon(colors[c]), { y: 0.75 }));
      car.add(mesh(new THREE.BoxGeometry(1.5, 0.15, 2.8), toon(0xfff3e6), { y: 1.1 }));
      for (const z of [-0.7, 0.8]) car.add(mesh(new THREE.BoxGeometry(1.6, 0.6, 0.15), toon(colors[c]), { y: 1.35, z: z - 0.45 }));
      for (const z of [-1.0, 1.0]) for (const x of [-0.95, 0.95]) car.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12), toon(0x5a5470), { x, y: 0.35, z, rz: Math.PI / 2 }));
      // 지붕
      for (const x of [-0.85, 0.85]) for (const z of [-1.4, 1.4]) car.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), toon(0xffffff), { x, y: 1.9, z }));
      car.add(mesh(new THREE.BoxGeometry(2.1, 0.15, 3.4), toon(colors[c]), { y: 2.75 }));
      mergeStatic(car);
      this.ctx.scene.add(car);
      this.cars.push(car);
    }
    // 연기
    this.smoke = [];
    const smokeMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(smokeMat.clone());
      s.userData.age = i * 0.42;
      this.ctx.scene.add(s);
      this.smoke.push(s);
    }
  }

  placeCar(obj, s) {
    const a = this.angleAt(s);
    obj.position.set(Math.cos(a) * TRAIN_R, 0.15, Math.sin(a) * TRAIN_R);
    // 진행 방향: 각도 감소 → 접선 (sin a, -cos a)
    obj.rotation.y = Math.atan2(Math.sin(a), -Math.cos(a));
  }

  update(dt, t) {
    const st = this.state(t);
    this.placeCar(this.loco, st.s);
    for (let c = 0; c < CARS; c++) this.placeCar(this.cars[c], st.s - GAP * (c + 1) - 0.4);
    // 연기
    const chimney = new THREE.Vector3(0, 3.3, 1.2).applyMatrix4(this.loco.matrixWorld);
    this.loco.updateMatrixWorld();
    for (const s of this.smoke) {
      s.userData.age += dt * (st.v > 0.5 ? 1 : 0.4);
      if (s.userData.age > 2.5) {
        s.userData.age = 0;
        s.position.copy(chimney);
      }
      const a = s.userData.age;
      s.position.y += dt * 1.5;
      s.scale.setScalar(0.6 + a * 0.9);
      s.material.opacity = Math.max(0, 0.55 - a * 0.22);
    }
    // 출발 기적 소리
    if (!st.stopped && this._lastStop !== st.station) {
      this._lastStop = st.station;
      const me = this.ctx.me?.();
      const near = me && me.pos.distanceTo(this.loco.position) < 30;
      if (this.ctx.mineOn(this) || near) sfx.choo();
    }
  }

  canBoard(t) {
    const st = this.state(t);
    const me = this.ctx.me();
    const station = STATIONS[st.station];
    const near = Math.hypot(me.pos.x - station.board.x, me.pos.z - station.board.z) < 7;
    if (!st.stopped || !near) {
      // 다음 도착 시간
      const myIdx = STATIONS.findIndex((s) => Math.hypot(me.pos.x - s.board.x, me.pos.z - s.board.z) < 7);
      if (myIdx < 0) return { ok: false, reason: '역에서 탈 수 있어요' };
      let wait = 0;
      let k = Math.floor(t / CYCLE);
      for (let i = 0; i < 8; i++) {
        const cand = (k + i) * CYCLE;
        if ((((k + i) % 4) + 4) % 4 === myIdx && cand + DWELL > t) {
          wait = Math.max(0, cand - t);
          break;
        }
      }
      return { ok: false, reason: wait > 0 ? `${Math.ceil(wait)}초 뒤 도착` : '곧 출발해요' };
    }
    return super.canBoard(t);
  }

  canExit(seat, t) {
    return this.state(t).stopped;
  }

  onExit(seat, who) {
    if (who !== 'me') return;
    const st = STATIONS[this.state(this.ctx.now()).station];
    this.exit = { x: st.board.x, z: st.board.z, ry: st.a + Math.PI };
  }

  seatTransform(seat, t, outPos, outQuat) {
    const c = Math.floor(seat / 2);
    const car = this.cars[c];
    car.updateMatrixWorld();
    outPos.set(seat % 2 ? -0.42 : 0.42, 1.2, 0.2).applyMatrix4(car.matrixWorld);
    outQuat.setFromEuler(car.rotation);
    return outPos;
  }

  riderInfo(seat, t) {
    const st = this.state(t);
    return { pose: 'sit', wind: st.v / 16, shake: st.v > 1 ? 0.02 : 0 };
  }

  statusText(t) {
    const st = this.state(t);
    if (st.stopped) return `🚉 ${STATIONS[st.station].name} · ${Math.ceil(st.left)}초 뒤 출발`;
    const next = STATIONS[(st.station + 1) % 4].name;
    return `다음 역: ${next}`;
  }

  thirdPersonCam(seat, t, outPos, outTarget) {
    const p = new THREE.Vector3();
    this.seatTransform(seat, t, p, new THREE.Quaternion());
    const ctrl = this.ctx.controls();
    const out = new THREE.Vector3(p.x, 0, p.z).normalize();
    out.applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.5 + ctrl.lookYaw * 0.6);
    outPos.set(p.x + out.x * 9, p.y + 3.5 + ctrl.lookPitch * 5, p.z + out.z * 9);
    outTarget.set(p.x, p.y + 0.8, p.z);
    return true;
  }

  // 미니맵용
  get stations() {
    return STATIONS;
  }
}
