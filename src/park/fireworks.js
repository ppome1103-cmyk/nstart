import * as THREE from 'three';
import { rng } from '../core/rng.js';
import { sfx } from '../audio.js';

// 밤 불꽃놀이. 놀이공원 시간으로 일정하게 터져서 두 폰에서 거의 같이 보여요.
const PER = 160;
const INTERVAL = 1.6;
const POOL = 6;

export class Fireworks {
  constructor(scene) {
    this.bursts = [];
    this.lastIdx = -1;
    const tex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.4, 'rgba(255,255,255,0.6)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 32, 32);
      return new THREE.CanvasTexture(c);
    })();
    for (let i = 0; i < POOL; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PER * 3), 3));
      const mat = new THREE.PointsMaterial({
        size: 1.6,
        map: tex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      pts.visible = false;
      scene.add(pts);
      this.bursts.push({ pts, dirs: [], start: -100, origin: new THREE.Vector3(), launch: new THREE.Vector3() });
    }
    // 올라가는 꼬리
    this.trailMat = new THREE.SpriteMaterial({ map: tex, color: 0xfff2c0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.trails = this.bursts.map(() => {
      const s = new THREE.Sprite(this.trailMat);
      s.scale.set(1.2, 1.2, 1);
      s.visible = false;
      scene.add(s);
      return s;
    });
  }

  spawn(idx, t0) {
    const r = rng(idx * 7919 + 13);
    const b = this.bursts[idx % POOL];
    const colors = [0xff6fa0, 0xffd86b, 0x8fd0ff, 0x8fe3c0, 0xc4a8ff, 0xffffff, 0xff9f7a];
    b.pts.material.color.setHex(colors[Math.floor(r() * colors.length)]);
    // 공원 북쪽/동쪽 하늘에서
    const a = -Math.PI / 2 + (r() - 0.5) * 2.2;
    const d = 40 + r() * 50;
    b.launch.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    b.origin.set(b.launch.x, 38 + r() * 22, b.launch.z);
    b.start = t0;
    b.heart = r() < 0.25;
    b.dirs = [];
    for (let i = 0; i < PER; i++) {
      let v;
      if (b.heart) {
        const th = (i / PER) * Math.PI * 2;
        const hx = 16 * Math.pow(Math.sin(th), 3);
        const hy = 13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th);
        v = new THREE.Vector3(hx / 16, hy / 16, (r() - 0.5) * 0.1).multiplyScalar(14);
      } else {
        const u = r() * 2 - 1;
        const ph = r() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        v = new THREE.Vector3(Math.cos(ph) * s, u, Math.sin(ph) * s).multiplyScalar(13 + r() * 3);
      }
      b.dirs.push(v);
    }
    b.played = false;
  }

  update(dt, t, active) {
    if (active) {
      const idx = Math.floor(t / INTERVAL);
      if (idx !== this.lastIdx) {
        this.lastIdx = idx;
        this.spawn(idx, idx * INTERVAL);
      }
    }
    for (let k = 0; k < POOL; k++) {
      const b = this.bursts[k];
      const trail = this.trails[k];
      const age = t - b.start;
      const riseT = 1.0;
      if (age < 0 || age > riseT + 2.6) {
        b.pts.visible = false;
        trail.visible = false;
        continue;
      }
      if (age < riseT) {
        trail.visible = true;
        b.pts.visible = false;
        const f = age / riseT;
        trail.position.lerpVectors(b.launch, b.origin, 1 - (1 - f) * (1 - f));
        continue;
      }
      trail.visible = false;
      if (!b.played) {
        b.played = true;
        if (active) sfx.firework(0);
      }
      const e = age - riseT;
      const pos = b.pts.geometry.attributes.position.array;
      const k1 = (1 - Math.exp(-2.2 * e)) / 2.2;
      for (let i = 0; i < PER; i++) {
        const d = b.dirs[i];
        pos[i * 3] = b.origin.x + d.x * k1;
        pos[i * 3 + 1] = b.origin.y + d.y * k1 - 2.5 * e * e;
        pos[i * 3 + 2] = b.origin.z + d.z * k1;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, 1 - e / 2.6);
      b.pts.material.size = 1.8 * (1 - e / 4);
      b.pts.visible = true;
    }
  }
}
