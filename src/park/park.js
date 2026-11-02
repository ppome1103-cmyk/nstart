import * as THREE from 'three';
import { toon, glow, setGlowLevel, glowTexture, stripeMat, makeSign, PASTEL } from '../core/materials.js';
import { mergeStatic, mesh } from '../core/merge.js';
import { rng, damp } from '../core/rng.js';
import * as L from './layout.js';
import { Fireworks } from './fireworks.js';

// 놀이공원 전체 바탕: 하늘, 땅, 광장, 길, 입구, 나무, 가로등, 분수, 간식 수레, 벤치 ...
export function createPark(scene) {
  const rand = rng(77777);
  const world = {
    colliders: [], // { x, z, r }
    boxes: [], // { x, z, hw, hd, rot } 회전된 상자
    platforms: [], // { x, z, r, top } 또는 { x, z, hw, hd, top, rot }
    interactables: [], // { x, z, r, label, onUse, visible() }
    animated: [],
    benches: [],
    night: 0,
    nightTarget: 0,
  };
  const staticGroup = new THREE.Group();
  scene.add(staticGroup);

  // ---------------- 하늘 ----------------
  const skyUniforms = {
    top: { value: new THREE.Color(0x6ec3ff) },
    horizon: { value: new THREE.Color(0xffe1ef) },
    sunDir: { value: new THREE.Vector3(0.4, 0.5, -0.6).normalize() },
    sunColor: { value: new THREE.Color(0xfff2c4) },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(420, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
        void main(){ float h = max(vDir.y, 0.0); vec3 c = mix(horizon, top, pow(h, 0.6));
          float s = max(dot(vDir, sunDir), 0.0); c += sunColor * (pow(s, 400.0) * 1.2 + pow(s, 12.0) * 0.18);
          gl_FragColor = vec4(c, 1.0); }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);
  scene.fog = new THREE.Fog(0xe6f1ff, 90, 260);

  const DAY = {
    top: new THREE.Color(0x6ec3ff),
    horizon: new THREE.Color(0xffe1ef),
    fog: new THREE.Color(0xe6f1ff),
    sun: new THREE.Color(0xfff2c4),
    hemiSky: new THREE.Color(0xfff4fb),
    hemiGround: new THREE.Color(0xb7d7a8),
  };
  const NIGHT = {
    top: new THREE.Color(0x0a0d2e),
    horizon: new THREE.Color(0x3b2c63),
    fog: new THREE.Color(0x23204a),
    sun: new THREE.Color(0xc8d6ff),
    hemiSky: new THREE.Color(0x7b7fe0),
    hemiGround: new THREE.Color(0x3a3a6a),
  };

  // 별
  {
    const n = 700;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const y = 0.15 + rand() * 0.85;
      const r = Math.sqrt(1 - y * y);
      p.set([Math.cos(a) * r * 380, y * 380, Math.sin(a) * r * 380], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(stars);
    world.stars = stars;
  }

  // ---------------- 빛 ----------------
  const hemi = new THREE.HemisphereLight(DAY.hemiSky, DAY.hemiGround, 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -34;
  sc.right = 34;
  sc.top = 34;
  sc.bottom = -34;
  sc.near = 1;
  sc.far = 160;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);
  world.sun = sun;
  const sunOffset = new THREE.Vector3(30, 60, 20);

  // ---------------- 땅 & 바다 ----------------
  const grass = mesh(new THREE.CircleGeometry(L.ISLAND_R, 96), toon(0x9fe08f), { rx: -Math.PI / 2, cast: false });
  staticGroup.add(grass);
  const sand = mesh(new THREE.RingGeometry(L.ISLAND_R, L.ISLAND_R + 9, 96), toon(0xffe7b0), { rx: -Math.PI / 2, y: -0.03, cast: false });
  staticGroup.add(sand);
  const cliff = mesh(new THREE.CylinderGeometry(L.ISLAND_R + 9, L.ISLAND_R + 12, 4, 96, 1, true), toon(0xf3d39a), { y: -2.03, cast: false });
  staticGroup.add(cliff);

  const waterGeo = new THREE.PlaneGeometry(900, 900, 50, 50);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, new THREE.MeshToonMaterial({ color: 0x7fd3f0 }));
  water.position.y = -1.1;
  scene.add(water);
  const wbase = waterGeo.attributes.position.array.slice();
  world.animated.push((t) => {
    const p = waterGeo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      p[i + 1] = Math.sin(wbase[i] * 0.05 + t * 0.8) * 0.35 + Math.cos(wbase[i + 2] * 0.06 + t * 0.6) * 0.3;
    }
    waterGeo.attributes.position.needsUpdate = true;
  });
  world.waterMat = water.material;

  // ---------------- 광장 ----------------
  {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#fbe7ef';
    g.fillRect(0, 0, 512, 512);
    const rings = ['#f7d3e2', '#fff3e6', '#e7dcff', '#fff3e6', '#d7f0ff', '#fff3e6', '#f7d3e2'];
    for (let i = 0; i < rings.length; i++) {
      const r = 256 - i * 34;
      g.fillStyle = rings[i];
      g.beginPath();
      g.arc(256, 256, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 3;
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2 + i * 0.13;
        g.beginPath();
        g.moveTo(256 + Math.cos(a) * r, 256 + Math.sin(a) * r);
        g.lineTo(256 + Math.cos(a) * (r - 34), 256 + Math.sin(a) * (r - 34));
        g.stroke();
      }
    }
    // 가운데 별
    g.fillStyle = '#ffd86b';
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      const r = k % 2 ? 22 : 50;
      g.lineTo(256 + Math.cos(a) * r, 256 + Math.sin(a) * r);
    }
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(L.PLAZA.r, 64), new THREE.MeshToonMaterial({ map: tex }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(L.PLAZA.x, 0.03, L.PLAZA.z);
    plaza.receiveShadow = true;
    scene.add(plaza);
  }

  // ---------------- 길 ----------------
  const pathMat = toon(0xf6dfc2);
  const pathEdge = toon(0xe9c9a3);
  function path(ax, az, bx, bz, w = 4.6) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, dz);
    const m = mesh(new THREE.PlaneGeometry(w, len), pathMat, { rx: -Math.PI / 2, y: 0.02, cast: false });
    const holder = new THREE.Group();
    holder.position.set((ax + bx) / 2, 0, (az + bz) / 2);
    holder.rotation.y = ang;
    holder.add(m);
    for (const s of [-1, 1]) {
      const e = mesh(new THREE.BoxGeometry(0.35, 0.12, len), pathEdge, { x: (w / 2) * s, y: 0.04, cast: false });
      holder.add(e);
    }
    staticGroup.add(holder);
    for (const [x, z] of [
      [ax, az],
      [bx, bz],
    ]) {
      staticGroup.add(mesh(new THREE.CircleGeometry(w / 2, 20), pathMat, { x, z, y: 0.021, rx: -Math.PI / 2, cast: false }));
    }
    return { ax, az, bx, bz, len, ang };
  }
  const P = L.PLAZA;
  const spokes = [
    [P.x, P.z + 12, L.GATE.x, L.GATE.z + 4],
    [P.x, P.z - 12, 0, -30],
    [P.x + 11, P.z - 6, 32, -16],
    [P.x + 12, P.z - 2, 44, -4],
    [P.x + 12, P.z + 4, 26, 12],
    [P.x + 10, P.z + 8, 30, 28],
    [30, 28, 44, 24],
    [P.x - 10, P.z + 8, -28, 32],
    [P.x - 12, P.z + 4, -29, 12],
    [P.x - 12, P.z - 2, -42, -6],
    [P.x - 10, P.z - 8, -34, -28],
    [0, 46, 0, 80],
  ];
  world.paths = spokes.map(([a, b, c, d]) => path(a, b, c, d));

  // ---------------- 분수 ----------------
  {
    const fx = P.x;
    const fz = P.z;
    const stone = toon(0xf1e6ff);
    const stone2 = toon(0xd9c8f5);
    staticGroup.add(mesh(new THREE.CylinderGeometry(4.6, 4.8, 0.7, 40), stone, { x: fx, y: 0.35, z: fz }));
    staticGroup.add(mesh(new THREE.TorusGeometry(4.6, 0.28, 8, 40), stone2, { x: fx, y: 0.72, z: fz, rx: Math.PI / 2 }));
    const pool = new THREE.Mesh(new THREE.CircleGeometry(4.3, 40), new THREE.MeshToonMaterial({ color: 0x8fdcff, emissive: 0x3aa0d0, emissiveIntensity: 0.2 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(fx, 0.62, fz);
    scene.add(pool);
    staticGroup.add(mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.4, 16), stone, { x: fx, y: 1.6, z: fz }));
    staticGroup.add(mesh(new THREE.CylinderGeometry(2.0, 0.6, 0.6, 24), stone2, { x: fx, y: 2.8, z: fz }));
    staticGroup.add(mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.2, 12), stone, { x: fx, y: 3.6, z: fz }));
    staticGroup.add(mesh(new THREE.SphereGeometry(0.45, 16, 12), glow(0xff9fc0, 0.3), { x: fx, y: 4.35, z: fz }));
    world.colliders.push({ x: fx, z: fz, r: 4.9 });

    // 물줄기 파티클
    const n = 360;
    const pos = new Float32Array(n * 3);
    const seeds = [];
    for (let i = 0; i < n; i++) seeds.push({ a: rand() * Math.PI * 2, ph: rand(), sp: 0.9 + rand() * 0.3, tier: i % 3 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdff6ff, size: 0.22, transparent: true, opacity: 0.85, depthWrite: false }));
    pts.frustumCulled = false;
    scene.add(pts);
    world.animated.push((t) => {
      for (let i = 0; i < n; i++) {
        const s = seeds[i];
        const life = (t * 0.7 * s.sp + s.ph) % 1;
        const T = life * 1.3;
        let x, y, z;
        if (s.tier === 0) {
          const r = 1.6 * T;
          x = fx + Math.cos(s.a) * r * 0.9;
          z = fz + Math.sin(s.a) * r * 0.9;
          y = 4.6 + 4.2 * T - 4.9 * T * T;
        } else {
          const r = 1.9 + 1.8 * T;
          x = fx + Math.cos(s.a) * r;
          z = fz + Math.sin(s.a) * r;
          y = 2.9 + 1.5 * T - 4.9 * T * T;
        }
        pos[i * 3] = x;
        pos[i * 3 + 1] = Math.max(0.65, y);
        pos[i * 3 + 2] = z;
      }
      g.attributes.position.needsUpdate = true;
    });
  }

  // ---------------- 입구 게이트 ----------------
  {
    const gx = L.GATE.x;
    const gz = L.GATE.z;
    const cream = toon(PASTEL.cream);
    for (const s of [-1, 1]) {
      const x = gx + 7.5 * s;
      staticGroup.add(mesh(new THREE.CylinderGeometry(1.7, 1.9, 10, 20), cream, { x, y: 5, z: gz }));
      staticGroup.add(mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.6, 20), toon(PASTEL.pink), { x, y: 10.2, z: gz }));
      staticGroup.add(mesh(new THREE.ConeGeometry(2.3, 4.2, 20), stripeMat('#ff8fb4', '#fff3e6', 6), { x, y: 12.6, z: gz }));
      staticGroup.add(mesh(new THREE.SphereGeometry(0.35, 12, 10), toon(PASTEL.gold), { x, y: 14.9, z: gz }));
      // 깃발
      const flag = mesh(new THREE.PlaneGeometry(1.6, 0.9), toon(s < 0 ? PASTEL.sky : PASTEL.yellow, { side: THREE.DoubleSide }), { x: x + 0.8, y: 15.6, z: gz, cast: false });
      flag.userData.dynamic = true;
      scene.add(flag);
      staticGroup.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), toon(PASTEL.gold), { x, y: 15.6, z: gz }));
      world.animated.push((t) => {
        flag.rotation.y = Math.sin(t * 3 + s) * 0.3;
      });
      // 창문
      for (const h of [3.5, 6.5]) {
        staticGroup.add(mesh(new THREE.CircleGeometry(0.45, 16), glow(0xffe7a3, 0.2), { x, y: h, z: gz + 1.72 * 1.0 + 0.02, cast: false }));
        staticGroup.add(mesh(new THREE.CircleGeometry(0.45, 16), glow(0xffe7a3, 0.2), { x, y: h, z: gz - 1.74, ry: Math.PI, cast: false }));
      }
      world.colliders.push({ x, z: gz, r: 2.1 });
    }
    const arch = mesh(new THREE.TorusGeometry(7.5, 0.55, 10, 40, Math.PI), toon(PASTEL.pink), { x: gx, y: 8, z: gz });
    staticGroup.add(arch);
    // 아치 위 전구
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI;
      const colors = [0xffe066, 0xff8fb4, 0x8fd0ff, 0x8fe3c0];
      staticGroup.add(mesh(new THREE.SphereGeometry(0.18, 8, 6), glow(colors[i % 4], 0.35), { x: gx + Math.cos(a) * 7.5, y: 8 + Math.sin(a) * 7.5 + 0.55, z: gz, cast: false }));
    }
    for (const dir of [1, -1]) {
      const sign = makeSign('둘이랜드', 2.6, { bg: '#ff7aa8', font: 90 });
      sign.position.set(gx, 15.2, gz + 0.4 * dir);
      if (dir < 0) sign.rotation.y = Math.PI;
      scene.add(sign);
      const sub = makeSign('💕 둘이서만 노는 놀이공원 💕', 0.9, { bg: '#fff3e6', fg: '#ff7aa8', font: 56, border: '#ff9fc0' });
      sub.position.set(gx, 13.5, gz + 0.4 * dir);
      if (dir < 0) sub.rotation.y = Math.PI;
      scene.add(sub);
    }
    staticGroup.add(mesh(new THREE.BoxGeometry(17, 0.6, 1.2), toon(PASTEL.lavender), { x: gx, y: 14.1, z: gz }));
    // 매표소
    for (const s of [-1, 1]) {
      const bx = gx + 13 * s;
      staticGroup.add(mesh(new THREE.BoxGeometry(3.4, 3, 3), toon(PASTEL.cream), { x: bx, y: 1.5, z: gz }));
      staticGroup.add(mesh(new THREE.ConeGeometry(2.8, 1.8, 4), toon(s < 0 ? PASTEL.sky : PASTEL.mint), { x: bx, y: 3.9, z: gz, ry: Math.PI / 4 }));
      staticGroup.add(mesh(new THREE.BoxGeometry(1.8, 1, 0.1), glow(0xbfe9ff, 0.25), { x: bx, y: 1.8, z: gz - 1.52, cast: false }));
      world.boxes.push({ x: bx, z: gz, hw: 1.9, hd: 1.7, rot: 0 });
    }
  }

  // ---------------- 울타리 (덤불) ----------------
  {
    const count = Math.floor((Math.PI * 2 * L.HEDGE_R) / 2.4);
    const geo = new THREE.IcosahedronGeometry(1.6, 1);
    const im = new THREE.InstancedMesh(geo, toon(0x6fcf74), count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const r = L.HEDGE_R + (rand() - 0.5) * 0.8;
      // 남쪽 기차역 길은 비워두기
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.abs(x) < 4 && z > 0) {
        s.set(0.001, 0.001, 0.001);
      } else s.set(1 + rand() * 0.3, 0.9 + rand() * 0.4, 1 + rand() * 0.3);
      q.setFromEuler(new THREE.Euler(rand(), rand() * 3, 0));
      m.compose(new THREE.Vector3(x, 0.8, z), q, s);
      im.setMatrixAt(i, m);
      im.setColorAt(i, new THREE.Color().setHSL(0.32 + rand() * 0.06, 0.5, 0.55 + rand() * 0.1));
    }
    im.castShadow = true;
    im.receiveShadow = true;
    scene.add(im);
  }

  // ---------------- 나무 ----------------
  {
    const spots = [];
    const blocked = (x, z) => {
      for (const n of L.NO_TREE) if (Math.hypot(n.x - x, n.z - z) < n.r) return true;
      const r = Math.hypot(x, z);
      if (Math.abs(r - L.TRAIN_R) < 5) return true;
      for (const p of world.paths) {
        // 길과의 거리
        const vx = p.bx - p.ax;
        const vz = p.bz - p.az;
        const t = Math.max(0, Math.min(1, ((x - p.ax) * vx + (z - p.az) * vz) / (vx * vx + vz * vz)));
        if (Math.hypot(p.ax + vx * t - x, p.az + vz * t - z) < 5) return true;
      }
      for (const sp of spots) if (Math.hypot(sp.x - x, sp.z - z) < 4.5) return true;
      return false;
    };
    let tries = 0;
    while (spots.length < 130 && tries < 6000) {
      tries++;
      const a = rand() * Math.PI * 2;
      const r = 14 + Math.sqrt(rand()) * (L.HEDGE_R - 17);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (blocked(x, z)) continue;
      spots.push({ x, z, s: 0.9 + rand() * 0.6, kind: rand() < 0.35 ? 1 : 0, rot: rand() * 6 });
    }
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 1.8, 7);
    trunkGeo.translate(0, 0.9, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, toon(PASTEL.wood), spots.length);
    const leafGeo = new THREE.IcosahedronGeometry(1.25, 0);
    const leaves = new THREE.InstancedMesh(leafGeo, toon(0xffffff), spots.length * 3);
    const coneGeo = new THREE.ConeGeometry(1.4, 3.2, 7);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const leafColors = [0x7fd67a, 0x8ee89a, 0xffb7d0, 0xa6e8a0, 0xffc9e0, 0x96dd8a];
    let li = 0;
    const pines = spots.filter((s) => s.kind === 1);
    const pineMesh = new THREE.InstancedMesh(coneGeo, toon(0x5fbf73), pines.length * 2);
    let pi = 0;
    spots.forEach((sp, i) => {
      m.compose(v.set(sp.x, 0, sp.z), q.identity(), sc.set(sp.s, sp.s, sp.s));
      trunks.setMatrixAt(i, m);
      world.colliders.push({ x: sp.x, z: sp.z, r: 0.45 * sp.s });
      if (sp.kind === 1) {
        for (let k = 0; k < 2; k++) {
          m.compose(v.set(sp.x, (2.6 + k * 1.3) * sp.s, sp.z), q.identity(), sc.set(sp.s * (1 - k * 0.25), sp.s, sp.s * (1 - k * 0.25)));
          pineMesh.setMatrixAt(pi++, m);
        }
        for (let k = 0; k < 3; k++) {
          m.makeScale(0, 0, 0);
          leaves.setMatrixAt(li++, m);
        }
      } else {
        const color = new THREE.Color(leafColors[Math.floor(rand() * leafColors.length)]);
        for (let k = 0; k < 3; k++) {
          q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
          const ls = sp.s * (1.1 - k * 0.18);
          m.compose(v.set(sp.x + (rand() - 0.5) * 0.7 * sp.s, (2.3 + k * 0.75) * sp.s, sp.z + (rand() - 0.5) * 0.7 * sp.s), q, sc.set(ls, ls, ls));
          leaves.setMatrixAt(li, m);
          leaves.setColorAt(li++, color);
        }
      }
    });
    for (const im of [trunks, leaves, pineMesh]) {
      im.castShadow = true;
      im.receiveShadow = true;
      scene.add(im);
    }
  }

  // ---------------- 가로등 ----------------
  {
    const lampSpots = [];
    for (const p of world.paths) {
      const n = Math.floor(p.len / 11);
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        const x = p.ax + (p.bx - p.ax) * t;
        const z = p.az + (p.bz - p.az) * t;
        const side = k % 2 ? 1 : -1;
        const nx = Math.cos(p.ang) * 3.1 * side;
        const nz = -Math.sin(p.ang) * 3.1 * side;
        lampSpots.push([x + nx, z + nz]);
      }
    }
    // 광장 둘레
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.31;
      lampSpots.push([P.x + Math.cos(a) * (P.r + 1.2), P.z + Math.sin(a) * (P.r + 1.2)]);
    }
    const postGeo = new THREE.CylinderGeometry(0.1, 0.16, 4, 8);
    postGeo.translate(0, 2, 0);
    const posts = new THREE.InstancedMesh(postGeo, toon(0x8f7fb8), lampSpots.length);
    const headGeo = new THREE.SphereGeometry(0.38, 12, 10);
    const heads = new THREE.InstancedMesh(headGeo, glow(0xfff1c4, 0.25), lampSpots.length);
    const capGeo = new THREE.ConeGeometry(0.45, 0.35, 10);
    const caps = new THREE.InstancedMesh(capGeo, toon(0x8f7fb8), lampSpots.length);
    const m = new THREE.Matrix4();
    const glowPos = new Float32Array(lampSpots.length * 3);
    lampSpots.forEach(([x, z], i) => {
      m.makeTranslation(x, 0, z);
      posts.setMatrixAt(i, m);
      m.makeTranslation(x, 4.25, z);
      heads.setMatrixAt(i, m);
      m.makeTranslation(x, 4.7, z);
      caps.setMatrixAt(i, m);
      world.colliders.push({ x, z, r: 0.25 });
      glowPos.set([x, 4.25, z], i * 3);
    });
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
    const glowMat = new THREE.PointsMaterial({ map: glowTexture(), color: 0xffe6a8, size: 3.4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    world.lampGlowMat = glowMat;
    scene.add(new THREE.Points(glowGeo, glowMat));
    for (const im of [posts, heads, caps]) {
      im.castShadow = true;
      scene.add(im);
    }
    world.lampSpots = lampSpots;
  }

  // ---------------- 광장 줄전구 ----------------
  {
    const poleCount = 8;
    const R = P.r + 0.2;
    const poles = [];
    for (let i = 0; i < poleCount; i++) {
      const a = (i / poleCount) * Math.PI * 2 + 0.2;
      const x = P.x + Math.cos(a) * R;
      const z = P.z + Math.sin(a) * R;
      poles.push(new THREE.Vector3(x, 6, z));
      staticGroup.add(mesh(new THREE.CylinderGeometry(0.12, 0.15, 6, 8), toon(PASTEL.lavender), { x, y: 3, z }));
      staticGroup.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), toon(PASTEL.gold), { x, y: 6.1, z }));
      world.colliders.push({ x, z, r: 0.3 });
    }
    const top = new THREE.Vector3(P.x, 9.5, P.z);
    const bulbColors = [0xffe066, 0xff8fb4, 0x8fd0ff, 0x8fe3c0, 0xc4a8ff];
    const bulbsByColor = bulbColors.map(() => []);
    const wirePts = [];
    const addCatenary = (a, b, sag, step = 0.9) => {
      const len = a.distanceTo(b);
      const n = Math.max(2, Math.floor(len / step));
      let prev = null;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const p = new THREE.Vector3().lerpVectors(a, b, t);
        p.y -= Math.sin(t * Math.PI) * sag;
        if (prev) wirePts.push(prev, p);
        prev = p;
        if (k > 0 && k < n) bulbsByColor[k % bulbColors.length].push(p.clone().add(new THREE.Vector3(0, -0.15, 0)));
      }
    };
    for (let i = 0; i < poleCount; i++) {
      addCatenary(poles[i], poles[(i + 1) % poleCount], 0.8);
      addCatenary(poles[i], top, 1.2);
    }
    const wire = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wirePts), new THREE.LineBasicMaterial({ color: 0x6f6a80 }));
    scene.add(wire);
    const bulbGeo = new THREE.SphereGeometry(0.13, 8, 6);
    const m = new THREE.Matrix4();
    bulbColors.forEach((c, ci) => {
      const list = bulbsByColor[ci];
      const im = new THREE.InstancedMesh(bulbGeo, glow(c, 0.45), list.length);
      list.forEach((p, k) => {
        m.makeTranslation(p.x, p.y, p.z);
        im.setMatrixAt(k, m);
      });
      scene.add(im);
    });
  }

  // ---------------- 벤치 ----------------
  {
    const wood = toon(0xe0a878);
    const metal = toon(0x8f7fb8);
    const benchSpots = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      benchSpots.push({ x: P.x + Math.cos(a) * 9.3, z: P.z + Math.sin(a) * 9.3, ry: Math.atan2(-Math.cos(a), -Math.sin(a)) });
    }
    benchSpots.push({ x: -5, z: 30, ry: Math.PI / 2 }, { x: 5, z: 30, ry: -Math.PI / 2 }, { x: -5, z: -22, ry: Math.PI / 2 }, { x: 5, z: -22, ry: -Math.PI / 2 });
    for (const b of benchSpots) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(2.4, 0.12, 0.6), wood, { y: 0.5 }));
      g.add(mesh(new THREE.BoxGeometry(2.4, 0.5, 0.1), wood, { y: 0.95, z: -0.3, rx: -0.15 }));
      for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.1, 0.5, 0.55), metal, { x: 1.0 * s, y: 0.25 }));
      g.position.set(b.x, 0, b.z);
      g.rotation.y = b.ry;
      staticGroup.add(g);
      world.boxes.push({ x: b.x, z: b.z, hw: 1.25, hd: 0.4, rot: b.ry });
      // 앉는 자리 2개
      const seats = [-0.55, 0.55].map((dx) => {
        const v = new THREE.Vector3(dx, 0.56, 0.05).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.ry);
        return { x: b.x + v.x, y: 0.56, z: b.z + v.z, ry: b.ry };
      });
      const fwd = new THREE.Vector3(0, 0, 1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.ry);
      world.benches.push({ x: b.x + fwd.x, z: b.z + fwd.z, seats, ry: b.ry });
    }
  }

  // ---------------- 간식 수레 ----------------
  {
    const carts = [
      { x: -16, z: 14, item: 'icecream', name: '아이스크림', color: '#8fd0ff', icon: '🍦', ry: 0.6 },
      { x: 16, z: 15, item: 'cottoncandy', name: '솜사탕', color: '#ff9fc0', icon: '🍭', ry: -0.6 },
      { x: -15, z: -8, item: 'churro', name: '츄러스', color: '#ffd86b', icon: '🥖', ry: 2.2 },
    ];
    for (const c of carts) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(2.6, 1.3, 1.4), toon(0xfff3e6), { y: 1.0 }));
      g.add(mesh(new THREE.BoxGeometry(2.7, 0.25, 1.5), toon(new THREE.Color(c.color)), { y: 1.75 }));
      for (const s of [-1, 1]) {
        const w = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.15, 14), toon(0x8f7fb8), { x: 0.9 * s, y: 0.4, z: 0.75, rx: Math.PI / 2 });
        g.add(w);
        const w2 = w.clone();
        w2.position.z = -0.75;
        g.add(w2);
      }
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), toon(0xffffff), { y: 3.0 }));
      g.add(mesh(new THREE.ConeGeometry(2.0, 0.9, 12), stripeMat(c.color, '#ffffff', 6), { y: 4.4 }));
      const sign = makeSign(`${c.icon} ${c.name}`, 0.6, { bg: c.color, font: 56 });
      sign.position.set(0, 2.15, 0.76);
      g.add(sign);
      // 큰 간식 모형
      if (c.item === 'icecream') {
        g.add(mesh(new THREE.ConeGeometry(0.35, 0.9, 12), toon(0xe0b089), { y: 2.3, x: 0.9, rx: Math.PI }));
        g.add(mesh(new THREE.SphereGeometry(0.42, 12, 10), toon(0xffc2d4), { y: 2.95, x: 0.9 }));
      } else if (c.item === 'cottoncandy') {
        for (let i = 0; i < 5; i++) g.add(mesh(new THREE.SphereGeometry(0.35, 10, 8), toon(i % 2 ? 0xffb8d9 : 0xd9c2ff), { y: 2.6 + (i % 2) * 0.25, x: 0.8 + Math.cos(i * 1.3) * 0.25, z: Math.sin(i * 1.3) * 0.25 }));
      } else {
        g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 8), toon(0xd9984f), { y: 2.6, x: 0.9, rz: 0.3 }));
      }
      g.position.set(c.x, 0, c.z);
      g.rotation.y = c.ry;
      scene.add(g);
      mergeStatic(g);
      world.boxes.push({ x: c.x, z: c.z, hw: 1.4, hd: 0.9, rot: c.ry });
      const front = new THREE.Vector3(0, 0, 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), c.ry);
      world.interactables.push({
        x: c.x + front.x,
        z: c.z + front.z,
        r: 2.6,
        label: `${c.icon} ${c.name} 받기`,
        kind: 'snack',
        item: c.item,
      });
    }
  }

  // ---------------- 풍선 다발 장식 ----------------
  {
    const spots = [
      [-4, 52],
      [4, 52],
      [-14, 2],
      [14, -4],
    ];
    const colors = [0xff6fa0, 0x8fd0ff, 0xffd86b, 0x8fe3c0, 0xc4a8ff];
    for (const [x, z] of spots) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      staticGroup.add(mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.2, 6), toon(0x8f7fb8), { x, y: 0.6, z }));
      const balloons = [];
      for (let i = 0; i < 7; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), toon(colors[i % colors.length]));
        b.scale.y = 1.15;
        const a = (i / 7) * Math.PI * 2;
        b.userData.base = new THREE.Vector3(Math.cos(a) * 0.6, 3.2 + (i % 3) * 0.5, Math.sin(a) * 0.6);
        b.castShadow = true;
        g.add(b);
        balloons.push(b);
      }
      const linePts = [];
      for (const b of balloons) linePts.push(new THREE.Vector3(0, 1.2, 0), b.userData.base);
      const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(linePts), new THREE.LineBasicMaterial({ color: 0xffffff }));
      g.add(lines);
      scene.add(g);
      world.colliders.push({ x, z, r: 0.4 });
      const off = rand() * 10;
      world.animated.push((t) => {
        balloons.forEach((b, i) => {
          b.position.copy(b.userData.base);
          b.position.x += Math.sin(t * 1.2 + i + off) * 0.12;
          b.position.y += Math.sin(t * 1.7 + i * 2 + off) * 0.08;
        });
      });
    }
  }

  // ---------------- 꽃밭 ----------------
  {
    const n = 500;
    const geo = new THREE.IcosahedronGeometry(0.16, 0);
    const im = new THREE.InstancedMesh(geo, toon(0xffffff), n);
    const m = new THREE.Matrix4();
    const colors = [0xff8fb4, 0xffe066, 0xffffff, 0xb59cff, 0xff9f7a, 0x8fd0ff];
    let k = 0;
    // 광장 테두리 꽃밭 + 길가
    for (let i = 0; i < n; i++) {
      let x, z;
      if (i < 220) {
        const a = rand() * Math.PI * 2;
        const r = P.r + 1.6 + rand() * 2.2;
        x = P.x + Math.cos(a) * r;
        z = P.z + Math.sin(a) * r;
        // 길 입구는 비우기
        if (world.paths.some((p) => Math.hypot(p.ax - x, p.az - z) < 3.4)) continue;
      } else {
        const a = rand() * Math.PI * 2;
        const r = 15 + rand() * 66;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        if (L.NO_TREE.some((nt) => Math.hypot(nt.x - x, nt.z - z) < nt.r)) continue;
        if (world.paths.some((p) => {
          const vx = p.bx - p.ax;
          const vz = p.bz - p.az;
          const t = Math.max(0, Math.min(1, ((x - p.ax) * vx + (z - p.az) * vz) / (vx * vx + vz * vz)));
          return Math.hypot(p.ax + vx * t - x, p.az + vz * t - z) < 3;
        })) continue;
      }
      m.makeTranslation(x, 0.18, z);
      im.setMatrixAt(k, m);
      im.setColorAt(k, new THREE.Color(colors[Math.floor(rand() * colors.length)]));
      k++;
    }
    im.count = k;
    scene.add(im);
  }

  // ---------------- 구름 ----------------
  {
    const cloudMat = toon(0xffffff);
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      for (let j = 0; j < 5; j++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(2.5 + rand() * 2, 10, 8), cloudMat);
        puff.position.set(j * 3 - 6, rand() * 1.5, rand() * 2);
        g.add(puff);
      }
      const a = rand() * Math.PI * 2;
      const d = 90 + rand() * 80;
      const h = 45 + rand() * 25;
      g.position.set(Math.cos(a) * d, h, Math.sin(a) * d);
      scene.add(g);
      const speed = 0.006 + rand() * 0.006;
      world.animated.push((t) => {
        g.position.x = Math.cos(a + t * speed) * d;
        g.position.z = Math.sin(a + t * speed) * d;
        g.lookAt(0, h, 0);
      });
    }
  }

  mergeStatic(staticGroup);

  // ---------------- 불꽃놀이 ----------------
  const fireworks = new Fireworks(scene);
  world.fireworks = fireworks;

  // ---------------- 갱신 ----------------
  const tmpColor = new THREE.Color();
  world.setNight = (on) => {
    world.nightTarget = on ? 1 : 0;
  };
  world.update = (dt, t, focus) => {
    for (const fn of world.animated) fn(t);
    // 낮/밤 전환
    world.night = damp(world.night, world.nightTarget, 2.2, dt);
    const n = world.night;
    skyUniforms.top.value.lerpColors(DAY.top, NIGHT.top, n);
    skyUniforms.horizon.value.lerpColors(DAY.horizon, NIGHT.horizon, n);
    skyUniforms.sunColor.value.lerpColors(DAY.sun, NIGHT.sun, n);
    scene.fog.color.lerpColors(DAY.fog, NIGHT.fog, n);
    hemi.color.lerpColors(DAY.hemiSky, NIGHT.hemiSky, n);
    hemi.groundColor.lerpColors(DAY.hemiGround, NIGHT.hemiGround, n);
    // 유령의 집 안: 깜깜하게
    world.indoor = damp(world.indoor || 0, world.indoorTarget || 0, 3, dt);
    const dim = 1 - world.indoor * 0.93;
    hemi.intensity = THREE.MathUtils.lerp(1.5, 0.75, n) * dim;
    sun.intensity = THREE.MathUtils.lerp(1.7, 0.45, n) * dim;
    sun.color.copy(tmpColor.setHex(0xfff1dc).lerp(NIGHT.sun, n));
    world.stars.material.opacity = n;
    world.lampGlowMat.opacity = n * 0.9;
    world.waterMat.color.setHex(0x7fd3f0).lerp(tmpColor.setHex(0x2b3a7a), n);
    setGlowLevel(n);
    // 그림자 카메라가 플레이어를 따라가도록
    if (focus) {
      sun.target.position.set(Math.round(focus.x), 0, Math.round(focus.z));
      sun.position.copy(sun.target.position).add(sunOffset);
    }
    fireworks.update(dt, t, n > 0.5);
  };

  return world;
}
