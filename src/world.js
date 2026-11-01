import * as THREE from 'three';

// 작은 섬 월드. 장애물(colliders)과 올라설 수 있는 발판(platforms) 정보도 같이 만들어요.
export const ISLAND_RADIUS = 18;

function toon(color) {
  return new THREE.MeshToonMaterial({ color });
}

// 시드 고정 랜덤: 두 사람 섬이 똑같이 생기도록
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createWorld(scene) {
  const colliders = []; // { x, z, r } : 못 지나가는 원
  const platforms = []; // { x, z, r, top } : 위에 올라설 수 있는 원기둥
  const animated = [];
  const rand = rng(20261101);

  // 하늘 & 안개
  scene.background = new THREE.Color(0xbfe6ff);
  scene.fog = new THREE.Fog(0xbfe6ff, 30, 70);

  // 조명
  scene.add(new THREE.HemisphereLight(0xfff4fb, 0xb7d7a8, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
  sun.position.set(12, 22, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -22;
  sc.right = 22;
  sc.top = 22;
  sc.bottom = -22;
  sc.near = 1;
  sc.far = 60;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);

  // 바다
  const waterGeo = new THREE.PlaneGeometry(160, 160, 40, 40);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(
    waterGeo,
    new THREE.MeshToonMaterial({ color: 0x7fd3f0, transparent: true, opacity: 0.92 }),
  );
  water.position.y = -0.6;
  scene.add(water);
  const basePos = waterGeo.attributes.position.array.slice();
  animated.push((t) => {
    const p = waterGeo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      p[i + 1] = Math.sin(basePos[i] * 0.25 + t * 1.2) * 0.12 + Math.cos(basePos[i + 2] * 0.3 + t) * 0.1;
    }
    waterGeo.attributes.position.needsUpdate = true;
  });

  // 섬: 모래 테두리 + 잔디
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_RADIUS + 2.5, ISLAND_RADIUS + 4, 1.6, 40), toon(0xffe7b0));
  sand.position.y = -0.85;
  sand.receiveShadow = true;
  scene.add(sand);

  const grass = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS + 0.8, 1, 40), toon(0x9ee08f));
  grass.position.y = -0.5;
  grass.receiveShadow = true;
  scene.add(grass);

  // 나무
  const trunkMat = toon(0xc9926b);
  const leafColors = [0x7fd67a, 0x8ee89a, 0xffb7d0, 0xa6e8a0];
  function tree(x, z, s = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.26 * s, 1.4 * s, 8), trunkMat);
    trunk.position.y = 0.7 * s;
    trunk.castShadow = true;
    g.add(trunk);
    const leafMat = toon(leafColors[Math.floor(rand() * leafColors.length)]);
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry((0.85 - i * 0.12) * s, 0), leafMat);
      leaf.position.set((rand() - 0.5) * 0.4 * s, (1.7 + i * 0.5) * s, (rand() - 0.5) * 0.4 * s);
      leaf.rotation.set(rand() * 3, rand() * 3, 0);
      leaf.castShadow = true;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    colliders.push({ x, z, r: 0.45 * s });
    const off = rand() * 10;
    animated.push((t) => {
      g.rotation.z = Math.sin(t * 1.3 + off) * 0.02;
    });
  }

  // 바위
  const rockMat = toon(0xc7c2d6);
  function rock(x, z, s = 1) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 * s, 0), rockMat);
    r.position.set(x, 0.25 * s, z);
    r.scale.y = 0.7;
    r.rotation.set(rand(), rand() * 3, rand());
    r.castShadow = true;
    r.receiveShadow = true;
    scene.add(r);
    colliders.push({ x, z, r: 0.55 * s });
  }

  // 꽃
  const flowerColors = [0xff8fb4, 0xffe066, 0xffffff, 0xb59cff, 0xff9f7a];
  const stemMat = toon(0x5fbf63);
  const centerMat = toon(0xffd54a);
  function flower(x, z) {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4), stemMat);
    stem.position.y = 0.15;
    g.add(stem);
    const petalMat = toon(flowerColors[Math.floor(rand() * flowerColors.length)]);
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), petalMat);
      const a = (i / 5) * Math.PI * 2;
      p.position.set(Math.cos(a) * 0.07, 0.32, Math.sin(a) * 0.07);
      g.add(p);
    }
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), centerMat);
    c.position.y = 0.33;
    g.add(c);
    g.position.set(x, 0, z);
    scene.add(g);
  }

  // 아기자기한 집
  function house(x, z, rotY) {
    const g = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 2.8), toon(0xfff3e6));
    wall.position.y = 1.1;
    wall.castShadow = true;
    wall.receiveShadow = true;
    g.add(wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 4), toon(0xff8fb4));
    roof.position.y = 3;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.3, 0.1), toon(0xc9926b));
    door.position.set(0, 0.65, 1.42);
    g.add(door);
    for (const s of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.1), toon(0x9fdcff));
      win.position.set(1 * s, 1.35, 1.42);
      g.add(win);
    }
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.4), toon(0xd98a8a));
    chimney.position.set(0.8, 3.2, -0.4);
    g.add(chimney);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    scene.add(g);
    // 집은 원 여러 개로 대충 막기
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    for (const [lx, lz] of [
      [-1, -0.7],
      [1, -0.7],
      [-1, 0.7],
      [1, 0.7],
      [0, 0],
    ]) {
      colliders.push({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos, r: 1.0 });
    }
  }

  // 점프해서 올라가는 그루터기 발판
  const stumpMat = toon(0xe0b089);
  const stumpTop = toon(0xffd9a8);
  function stump(x, z, top, r = 0.7) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, top, 16), [stumpMat, stumpTop, stumpTop]);
    m.position.set(x, top / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    platforms.push({ x, z, r, top });
  }

  // 하트 모양 꽃밭 (둘만의 장소 💕)
  function heartBed(cx, cz) {
    const mat = toon(0xff9fc0);
    for (let i = 0; i < 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      const hx = 16 * Math.sin(t) ** 3;
      const hz = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat);
      f.position.set(cx + hx * 0.12, 0.1, cz + hz * 0.12);
      scene.add(f);
    }
  }

  // 구름
  const cloudMat = new THREE.MeshToonMaterial({ color: 0xffffff });
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1 + rand(), 10, 8), cloudMat);
      puff.position.set(j * 1.3 - 2, rand() * 0.5, rand() * 0.8);
      g.add(puff);
    }
    const a = rand() * Math.PI * 2;
    const d = 25 + rand() * 15;
    g.position.set(Math.cos(a) * d, 12 + rand() * 6, Math.sin(a) * d);
    scene.add(g);
    const speed = 0.02 + rand() * 0.02;
    animated.push((t) => {
      g.position.x = Math.cos(a + t * speed) * d;
      g.position.z = Math.sin(a + t * speed) * d;
    });
  }

  // ---- 배치 ----
  house(-6, -7, 0.4);
  heartBed(0, 3.5);

  stump(7, -2, 0.6);
  stump(9, -4, 1.2);
  stump(11, -2.2, 1.8);
  stump(10.5, 1, 2.4, 0.9);

  const treeSpots = [
    [-12, 4], [-10, 9], [-4, 13], [5, 12], [11, 8], [14, -6], [8, -11],
    [1, -13], [-13, -3], [-15, 9], [13, 3], [-2, -10],
  ];
  for (const [x, z] of treeSpots) tree(x, z, 0.85 + rand() * 0.4);

  for (const [x, z, s] of [[-8, 1, 1], [4, 7, 0.7], [12, -9, 1.2], [-11, -10, 0.9], [15, 6, 0.8]]) rock(x, z, s);

  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const d = 2 + rand() * (ISLAND_RADIUS - 3);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 0.5)) continue;
    if (platforms.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 0.3)) continue;
    flower(x, z);
  }

  return {
    colliders,
    platforms,
    update(t) {
      for (const fn of animated) fn(t);
    },
  };
}
