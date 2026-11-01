import * as THREE from 'three';
import { toon, glow, stripeMat, makeSign, PASTEL } from '../core/materials.js';
import { mergeStatic, mesh } from '../core/merge.js';
import { SPOTS } from '../park/layout.js';
import { sfx, vibrate } from '../audio.js';

const ROUND = 20;

function booth(ctx, { x, z, ry, color, title }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  g.add(mesh(new THREE.BoxGeometry(6, 0.3, 4), toon(0xfff3e6), { y: 0.15 }));
  g.add(mesh(new THREE.BoxGeometry(6, 1.1, 0.5), toon(color), { y: 0.55, z: 1.8 }));
  g.add(mesh(new THREE.BoxGeometry(6.2, 0.15, 0.7), toon(0xffffff), { y: 1.15, z: 1.8 }));
  g.add(mesh(new THREE.BoxGeometry(6, 4.2, 0.3), toon(0xfff3e6), { y: 2.1, z: -1.9 }));
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(0.3, 4.2, 4), toon(0xfff3e6), { x: 3 * s, y: 2.1 }));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.4, 8), toon(PASTEL.gold), { x: 3 * s, y: 2.2, z: 2.0 }));
  }
  // 줄무늬 차양
  const awn = mesh(new THREE.BoxGeometry(6.6, 0.15, 2.4), stripeMat(`#${new THREE.Color(color).getHexString()}`, '#ffffff', 8), { y: 4.5, z: 1.6, rx: 0.35 });
  g.add(awn);
  g.add(mesh(new THREE.BoxGeometry(6.4, 0.4, 4.4), toon(color), { y: 4.4, z: -0.1 }));
  for (let i = 0; i < 9; i++) g.add(mesh(new THREE.SphereGeometry(0.12, 6, 5), glow([0xffe066, 0xff8fb4, 0x8fd0ff][i % 3], 0.4), { x: -3 + i * 0.75, y: 4.0, z: 2.75, cast: false }));
  mergeStatic(g);
  const sign = makeSign(title, 0.75, { bg: `#${new THREE.Color(color).getHexString()}`, font: 64 });
  sign.position.set(0, 5.0, 2.3);
  g.add(sign);
  ctx.scene.add(g);
  ctx.world.boxes.push({ x, z, hw: 3.2, hd: 2.1, rot: ry });
  return g;
}

class BoothGame {
  constructor(ctx, opts) {
    this.ctx = ctx;
    Object.assign(this, opts);
    this.active = false;
    this.score = 0;
    this.timeLeft = 0;
    this.group = booth(ctx, opts);
    const front = new THREE.Vector3(0, 0, 4.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), opts.ry);
    this.standPos = new THREE.Vector3(opts.x + front.x, 0, opts.z + front.z);
    ctx.world.interactables.push({
      x: this.standPos.x,
      z: this.standPos.z,
      r: 3,
      kind: 'game',
      label: () => (this.active || ctx.busy() ? null : { text: `${this.icon} ${this.name} (20초)` }),
      onUse: () => this.start(),
    });
    this.raycaster = new THREE.Raycaster();
  }

  // 게임할 때 카메라: 부스 정면
  camPose() {
    const g = this.group;
    g.updateMatrixWorld();
    const pos = new THREE.Vector3(0, 2.5, 7.4).applyMatrix4(g.matrixWorld);
    const target = new THREE.Vector3(0, 2.2, -1).applyMatrix4(g.matrixWorld);
    return { pos, target };
  }

  start() {
    if (this.ctx.busy()) return;
    this.active = true;
    this.score = 0;
    this.timeLeft = ROUND;
    this.reset();
    const me = this.ctx.me();
    // 화면을 가리지 않게 옆에 서기
    const side = new THREE.Vector3(2.6, 0, 0.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.ry);
    me.pos.copy(this.standPos).add(side);
    me.yaw = this.ry + Math.PI;
    this.ctx.hud.showGame(true, this);
    this.ctx.setActivity(this);
    sfx.chime();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.ctx.hud.showGame(false);
    this.ctx.setActivity(null);
    const tickets = Math.max(1, Math.round(this.score * this.ticketRate));
    this.ctx.addTickets(tickets);
    const key = `dulisum-best-${this.id}`;
    const best = Number(localStorage.getItem(key) || 0);
    const isBest = this.score > best;
    if (isBest) localStorage.setItem(key, String(this.score));
    this.ctx.hud.toast(`${this.icon} ${this.score}점! 🎟️ ${tickets}장 받았어요${isBest ? ' · 최고 기록!' : ''}`, 3500);
    sfx.fanfare();
    this.ctx.me().avatar.say(isBest ? '🏆' : '🎉', 2);
    this.ctx.net()?.send({ t: 'score', game: this.name, score: this.score });
  }

  update(dt, t) {
    this.animate?.(dt, t);
    if (!this.active) return;
    this.timeLeft -= dt;
    this.ctx.hud.updateGame(`${this.icon} ${this.score}점`, Math.max(0, Math.ceil(this.timeLeft)));
    if (this.timeLeft <= 0) this.stop();
  }

  tap(ndc, camera) {
    if (!this.active) return;
    this.raycaster.setFromCamera(ndc, camera);
    this.onTap?.(this.raycaster);
  }
}

// 🎈 풍선 다트
class Darts extends BoothGame {
  constructor(ctx) {
    const { x, z } = SPOTS.darts;
    super(ctx, { id: 'darts', name: '풍선 다트', icon: '🎈', x, z, ry: Math.PI / 2, color: 0xff8fb4, title: '🎈 풍선 다트', ticketRate: 0.5 });
    this.balloons = [];
    const colors = [0xff6fa0, 0x8fd0ff, 0xffd86b, 0x8fe3c0, 0xc4a8ff, 0xffab8f];
    const board = mesh(new THREE.BoxGeometry(5.2, 3.2, 0.1), toon(0x8fd0ff), { y: 2.3, z: -1.7 });
    this.group.add(board);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 6; c++) {
        const b = mesh(new THREE.SphereGeometry(0.32, 12, 10), toon(colors[(r + c) % colors.length]), { x: -2.1 + c * 0.84, y: 1.1 + r * 0.78, z: -1.45, sy: 1.15 });
        b.userData.respawn = 0;
        b.userData.base = b.position.clone();
        this.group.add(b);
        this.balloons.push(b);
      }
    }
    // 터지는 조각
    this.bits = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(30 * 3), 3)), new THREE.PointsMaterial({ color: 0xffffff, size: 0.12 }));
    this.bits.visible = false;
    this.bits.frustumCulled = false;
    this.group.add(this.bits);
    this.bitDirs = Array.from({ length: 30 }, () => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() * 0.6).multiplyScalar(4));
    this.bitT = 9;
    // 다트
    this.dart = new THREE.Group();
    this.dart.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), toon(0x5a5470), { rx: Math.PI / 2 }));
    this.dart.add(mesh(new THREE.ConeGeometry(0.08, 0.2, 4), toon(0xff6fa0), { z: -0.3, rx: Math.PI / 2 }));
    this.dart.visible = false;
    this.ctx.scene.add(this.dart);
  }

  reset() {
    for (const b of this.balloons) {
      b.visible = true;
      b.userData.respawn = 0;
    }
  }

  onTap(ray) {
    const hits = ray.intersectObjects(this.balloons.filter((b) => b.visible), false);
    const cam = this.ctx.camera;
    this.dart.visible = true;
    this.dart.position.copy(cam.position).add(new THREE.Vector3(0, -0.5, 0));
    const to = hits.length ? hits[0].point : ray.ray.at(8, new THREE.Vector3());
    this.dartFrom = this.dart.position.clone();
    this.dartTo = to;
    this.dartT = 0;
    this.dart.lookAt(to);
    this.dart.rotateY(Math.PI);
    if (hits.length) this.pop(hits[0].object);
  }

  pop(b) {
    b.visible = false;
    b.userData.respawn = 1.2;
    this.score++;
    sfx.pop();
    vibrate(25);
    this.bits.position.copy(b.position);
    this.bitT = 0;
    this.bits.material.color.copy(b.material.color);
  }

  animate(dt, t) {
    for (const b of this.balloons) {
      if (!b.visible) {
        b.userData.respawn -= dt;
        if (b.userData.respawn <= 0) b.visible = true;
      } else {
        b.position.y = b.userData.base.y + Math.sin(t * 2 + b.userData.base.x * 3) * 0.04;
      }
    }
    if (this.dartT !== undefined && this.dartT < 1) {
      this.dartT += dt * 6;
      this.dart.position.lerpVectors(this.dartFrom, this.dartTo, Math.min(1, this.dartT));
      if (this.dartT >= 1) setTimeout(() => (this.dart.visible = false), 120);
    }
    if (this.bitT < 0.6) {
      this.bitT += dt;
      this.bits.visible = true;
      const p = this.bits.geometry.attributes.position.array;
      this.bitDirs.forEach((d, i) => {
        p[i * 3] = d.x * this.bitT;
        p[i * 3 + 1] = d.y * this.bitT - 4 * this.bitT * this.bitT;
        p[i * 3 + 2] = d.z * this.bitT;
      });
      this.bits.geometry.attributes.position.needsUpdate = true;
    } else this.bits.visible = false;
  }
}

// 🔨 두더지 잡기
class Moles extends BoothGame {
  constructor(ctx) {
    const { x, z } = SPOTS.moles;
    super(ctx, { id: 'moles', name: '두더지 콩콩', icon: '🔨', x, z, ry: -Math.PI / 2, color: 0x8fe3c0, title: '🔨 두더지 콩콩', ticketRate: 0.5 });
    const table = mesh(new THREE.BoxGeometry(4.6, 1.2, 3.0), toon(0xc98f5e), { y: 1.0, z: -0.3 });
    this.group.add(table);
    this.group.add(mesh(new THREE.BoxGeometry(4.8, 0.15, 3.2), toon(0x8fe3c0), { y: 1.65, z: -0.3 }));
    this.moles = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const hx = -1.4 + c * 1.4;
        const hz = -1.2 + r * 0.95;
        this.group.add(mesh(new THREE.CircleGeometry(0.36, 16), toon(0x3b2f3f), { x: hx, y: 1.74, z: hz, rx: -Math.PI / 2, cast: false }));
        const mole = new THREE.Group();
        mole.add(mesh(new THREE.CapsuleGeometry(0.28, 0.3, 4, 12), toon(0xc98f5e), { y: 0 }));
        mole.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), toon(0xff9fb8), { y: 0.1, z: 0.27 }));
        mole.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), toon(0x2b2433), { x: 0.1, y: 0.25, z: 0.24 }));
        mole.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), toon(0x2b2433), { x: -0.1, y: 0.25, z: 0.24 }));
        mole.add(mesh(new THREE.SphereGeometry(0.07, 6, 4), toon(0xffc2d4), { x: 0.2, y: 0.1, z: 0.2 }));
        mole.add(mesh(new THREE.SphereGeometry(0.07, 6, 4), toon(0xffc2d4), { x: -0.2, y: 0.1, z: 0.2 }));
        mole.position.set(hx, 1.2, hz);
        mole.userData = { up: 0, timer: 0, hit: 0, baseY: 1.2, hx, hz };
        // 맞추기 쉬운 투명 판정
        const hitbox = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
        hitbox.position.y = 0.2;
        mole.add(hitbox);
        mole.userData.hitbox = hitbox;
        hitbox.userData.mole = mole;
        this.group.add(mole);
        this.moles.push(mole);
      }
    }
    this.spawnTimer = 0;
    this.stars = makeSign('💥', 0.7, { bg: 'rgba(0,0,0,0)', border: null, font: 80 });
    this.stars.visible = false;
    this.group.add(this.stars);
    this.starT = 9;
  }

  camPose() {
    const g = this.group;
    g.updateMatrixWorld();
    return {
      pos: new THREE.Vector3(0, 3.9, 6.4).applyMatrix4(g.matrixWorld),
      target: new THREE.Vector3(0, 1.5, -0.6).applyMatrix4(g.matrixWorld),
    };
  }

  reset() {
    for (const m of this.moles) {
      m.userData.up = 0;
      m.userData.timer = 0;
    }
    this.spawnTimer = 0.4;
  }

  onTap(ray) {
    const hits = ray.intersectObjects(this.moles.filter((m) => m.userData.timer > 0 && m.userData.hit <= 0).map((m) => m.userData.hitbox), false);
    if (!hits.length) return;
    const m = hits[0].object.userData.mole;
    m.userData.hit = 0.35;
    m.userData.timer = 0.25;
    this.score++;
    sfx.bonk();
    vibrate(30);
    this.stars.position.set(m.userData.hx, 2.3, m.userData.hz);
    this.starT = 0;
  }

  animate(dt) {
    if (this.active) {
      this.spawnTimer -= dt;
      const speed = 1 + (ROUND - this.timeLeft) / ROUND;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = (0.55 + Math.random() * 0.4) / speed;
        const free = this.moles.filter((m) => m.userData.timer <= 0);
        if (free.length) {
          const m = free[Math.floor(Math.random() * free.length)];
          m.userData.timer = (0.8 + Math.random() * 0.5) / Math.sqrt(speed);
          m.userData.hit = 0;
        }
      }
    }
    for (const m of this.moles) {
      const u = m.userData;
      u.timer -= dt;
      u.hit -= dt;
      const target = u.timer > 0 && u.hit <= 0 ? 1 : 0;
      u.up += (target - u.up) * Math.min(1, dt * 14);
      m.position.y = u.baseY + u.up * 0.75;
      m.scale.set(1, u.hit > 0 ? 0.6 : 1, 1);
    }
    if (this.starT < 0.5) {
      this.starT += dt;
      this.stars.visible = true;
      this.stars.scale.setScalar(1 + this.starT);
    } else this.stars.visible = false;
  }
}

// 🎁 선물 가게
function buildShop(ctx, onOpen) {
  const { x, z } = SPOTS.shop;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = Math.PI / 2;
  g.add(mesh(new THREE.BoxGeometry(6, 3.6, 5), toon(0xfff3e6), { y: 1.8 }));
  g.add(mesh(new THREE.ConeGeometry(4.6, 2.6, 4), toon(PASTEL.pink), { y: 4.9, ry: Math.PI / 4 }));
  g.add(mesh(new THREE.BoxGeometry(1.6, 2.4, 0.2), toon(PASTEL.wood), { y: 1.2, z: 2.5 }));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(1.4, 1.2, 0.15), glow(0xbfe9ff, 0.3), { x: 1.9 * s, y: 2.0, z: 2.52 }));
  // 지붕 위 선물 상자
  g.add(mesh(new THREE.BoxGeometry(1.6, 1.4, 1.6), toon(PASTEL.sky), { y: 6.8 }));
  g.add(mesh(new THREE.BoxGeometry(1.7, 0.25, 0.4), toon(PASTEL.red), { y: 7.55 }));
  g.add(mesh(new THREE.BoxGeometry(0.4, 1.45, 1.7), toon(PASTEL.red), { y: 6.8 }));
  g.add(mesh(new THREE.TorusGeometry(0.35, 0.1, 6, 12), toon(PASTEL.red), { x: -0.3, y: 7.85, rz: 0.6 }));
  g.add(mesh(new THREE.TorusGeometry(0.35, 0.1, 6, 12), toon(PASTEL.red), { x: 0.3, y: 7.85, rz: -0.6 }));
  // 진열된 곰인형
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.SphereGeometry(0.5, 12, 10), toon(0xc98f5e), { x: 2.2 * s, y: 0.5, z: 3.0 }));
    g.add(mesh(new THREE.SphereGeometry(0.38, 12, 10), toon(0xc98f5e), { x: 2.2 * s, y: 1.2, z: 3.0 }));
    g.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), toon(0xc98f5e), { x: 2.2 * s + 0.25, y: 1.5, z: 3.0 }));
    g.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), toon(0xc98f5e), { x: 2.2 * s - 0.25, y: 1.5, z: 3.0 }));
  }
  mergeStatic(g);
  const sign = makeSign('🎁 선물 가게', 0.8, { bg: '#ff9fc0', font: 64 });
  sign.position.set(0, 3.25, 2.62);
  g.add(sign);
  ctx.scene.add(g);
  ctx.world.boxes.push({ x, z, hw: 3.1, hd: 2.6, rot: Math.PI / 2 });
  const door = new THREE.Vector3(0, 0, 4).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  ctx.world.interactables.push({ x: x + door.x, z: z + door.z, r: 3, kind: 'shop', label: () => ({ text: '🎁 선물 가게 들어가기' }), onUse: onOpen });
}

export function createBooths(ctx, { onShop }) {
  const games = [new Darts(ctx), new Moles(ctx)];
  buildShop(ctx, onShop);
  return games;
}
