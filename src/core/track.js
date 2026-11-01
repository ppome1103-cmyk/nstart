import * as THREE from 'three';

// 레일 곡선. 일정 간격으로 샘플링하고 각 지점의 앞(tangent)/위(up) 방향을 계산해요.
// up은 회전 최소화 프레임(RMF)이라 루프에서도 자연스럽게 뒤집혀요.
export class Track {
  constructor(points, { closed = true, spacing = 0.5, curveType = 'centripetal', tension = 0.5 } = {}) {
    this.closed = closed;
    this.curve = new THREE.CatmullRomCurve3(points, closed, curveType, tension);
    this.length = this.curve.getLength();
    const n = Math.max(8, Math.ceil(this.length / spacing));
    this.n = n;
    this.step = this.length / n;
    this.pos = [];
    this.tan = [];
    this.up = [];
    this.bank = new Float32Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      this.pos.push(this.curve.getPointAt(u));
      this.tan.push(this.curve.getTangentAt(u).normalize());
    }
    this._computeFrames();
  }

  _computeFrames(initialUp = new THREE.Vector3(0, 1, 0)) {
    const { pos, tan, n } = this;
    const up = [];
    const r0 = initialUp.clone().addScaledVector(tan[0], -initialUp.dot(tan[0])).normalize();
    up.push(r0);
    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();
    const rL = new THREE.Vector3();
    const tL = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v1.subVectors(pos[i + 1], pos[i]);
      const c1 = v1.dot(v1);
      if (c1 < 1e-10) {
        up.push(up[i].clone());
        continue;
      }
      rL.copy(up[i]).addScaledVector(v1, (-2 / c1) * v1.dot(up[i]));
      tL.copy(tan[i]).addScaledVector(v1, (-2 / c1) * v1.dot(tan[i]));
      v2.subVectors(tan[i + 1], tL);
      const c2 = v2.dot(v2);
      const r = rL.clone();
      if (c2 > 1e-10) r.addScaledVector(v2, (-2 / c2) * v2.dot(rL));
      up.push(r.normalize());
    }
    if (this.closed) {
      // 한 바퀴 돌았을 때 비틀림 차이를 고르게 나눠서 이어지게
      const a = up[n];
      const b = up[0];
      const t = tan[0];
      let ang = Math.atan2(new THREE.Vector3().crossVectors(a, b).dot(t), a.dot(b));
      for (let i = 0; i <= n; i++) {
        up[i].applyAxisAngle(tan[i], (ang * i) / n).normalize();
      }
    }
    this.baseUp = up.map((u) => u.clone());
    this.up = up;
  }

  // 기울기(뱅크) 적용: 각 샘플별 라디안
  applyBank(bankArr) {
    for (let i = 0; i <= this.n; i++) {
      this.bank[i] = bankArr[i] || 0;
      this.up[i].copy(this.baseUp[i]).applyAxisAngle(this.tan[i], this.bank[i]).normalize();
    }
  }

  _idx(s) {
    let L = this.length;
    if (this.closed) s = ((s % L) + L) % L;
    else s = Math.max(0, Math.min(L, s));
    const f = s / this.step;
    const i = Math.min(this.n - 1, Math.floor(f));
    return [i, f - i];
  }

  getPos(s, out = new THREE.Vector3()) {
    const [i, f] = this._idx(s);
    return out.lerpVectors(this.pos[i], this.pos[i + 1], f);
  }
  getTan(s, out = new THREE.Vector3()) {
    const [i, f] = this._idx(s);
    return out.lerpVectors(this.tan[i], this.tan[i + 1], f).normalize();
  }
  getUp(s, out = new THREE.Vector3()) {
    const [i, f] = this._idx(s);
    return out.lerpVectors(this.up[i], this.up[i + 1], f).normalize();
  }

  // 레일 위 물체의 회전 (앞 = +z, 위 = +y)
  getQuat(s, out = new THREE.Quaternion()) {
    const t = this.getTan(s, _t);
    const u = this.getUp(s, _u);
    const side = _b.crossVectors(u, t).normalize();
    const u2 = _u2.crossVectors(t, side).normalize();
    _m.makeBasis(side, u2, t);
    return out.setFromRotationMatrix(_m);
  }

  // 레일에서 옆으로/위로 떨어진 점들 (레일 튜브용)
  offsetPoints(side, upOff, every = 1) {
    const pts = [];
    const b = new THREE.Vector3();
    for (let i = 0; i < (this.closed ? this.n : this.n + 1); i += every) {
      b.crossVectors(this.up[i], this.tan[i]).normalize();
      pts.push(this.pos[i].clone().addScaledVector(b, side).addScaledVector(this.up[i], upOff));
    }
    return pts;
  }

  tube(side, upOff, radius, mat, radial = 6) {
    const pts = this.offsetPoints(side, upOff);
    const c = new THREE.CatmullRomCurve3(pts, this.closed, 'catmullrom', 0);
    const geo = new THREE.TubeGeometry(c, pts.length * 1, radius, radial, this.closed);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // 일정 간격으로 침목 등 반복 배치 (InstancedMesh)
  instanceAlong(geo, mat, every, { side = 0, upOff = 0, from = 0, to = this.length, scale } = {}) {
    const count = Math.floor((to - from) / every);
    const im = new THREE.InstancedMesh(geo, mat, count);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sc = scale || new THREE.Vector3(1, 1, 1);
    const m = new THREE.Matrix4();
    const b = new THREE.Vector3();
    const u = new THREE.Vector3();
    for (let k = 0; k < count; k++) {
      const s = from + k * every;
      this.getPos(s, p);
      this.getUp(s, u);
      this.getQuat(s, q);
      b.crossVectors(u, this.getTan(s, _t)).normalize();
      p.addScaledVector(b, side).addScaledVector(u, upOff);
      m.compose(p, q, sc);
      im.setMatrixAt(k, m);
    }
    im.castShadow = true;
    im.receiveShadow = true;
    return im;
  }

  // 레일을 받치는 기둥 (아래에 다른 레일이 있으면 생략)
  supports(mat, { every = 5, minHeight = 1.2, radius = 0.18, groundY = 0, under = 0.5, from = 0, to = this.length } = {}) {
    const items = [];
    const p = new THREE.Vector3();
    const u = new THREE.Vector3();
    for (let s = from; s < to; s += every) {
      this.getPos(s, p);
      this.getUp(s, u);
      if (u.y < 0.3) continue; // 뒤집힌 구간(루프) 제외
      const top = p.y - under;
      if (top - groundY < minHeight) continue;
      let blocked = false;
      for (let i = 0; i <= this.n; i += 2) {
        const q = this.pos[i];
        if (q.y < top - 1 && Math.hypot(q.x - p.x, q.z - p.z) < 1.0) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      items.push({ x: p.x, z: p.z, h: top - groundY });
    }
    const geo = new THREE.CylinderGeometry(radius, radius * 1.3, 1, 8);
    geo.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    const m = new THREE.Matrix4();
    items.forEach((it, k) => {
      m.makeScale(1, it.h, 1).setPosition(it.x, groundY, it.z);
      im.setMatrixAt(k, m);
    });
    im.castShadow = true;
    return im;
  }
}

const _t = new THREE.Vector3();
const _u = new THREE.Vector3();
const _u2 = new THREE.Vector3();
const _b = new THREE.Vector3();
const _m = new THREE.Matrix4();

// 레일 위 주행을 미리 시뮬레이션해서 시간 → 위치 표를 만들어요. (두 폰이 똑같이 움직이도록)
// rule(s, v, gravityAccel, dt) → 새 속도 v
export function simulate(track, { s0 = 0, sEnd = track.length, v0 = 0, rule, dt = 1 / 120, maxTime = 300, rate = 30 }) {
  const sArr = [];
  const vArr = [];
  let s = s0;
  let v = v0;
  let t = 0;
  let next = 0;
  const tan = new THREE.Vector3();
  while (s < sEnd && t < maxTime) {
    if (t >= next) {
      sArr.push(s);
      vArr.push(v);
      next += 1 / rate;
    }
    track.getTan(s, tan);
    const g = -9.8 * tan.y;
    v = rule(s, v, g, dt);
    s += v * dt;
    t += dt;
  }
  sArr.push(sEnd);
  vArr.push(v);
  const duration = (sArr.length - 1) / rate;
  return {
    duration,
    sAt(time) {
      if (time <= 0) return s0;
      const f = time * rate;
      const i = Math.floor(f);
      if (i >= sArr.length - 1) return sEnd;
      return sArr[i] + (sArr[i + 1] - sArr[i]) * (f - i);
    },
    vAt(time) {
      const i = Math.max(0, Math.min(vArr.length - 1, Math.floor(time * rate)));
      return vArr[i];
    },
  };
}
