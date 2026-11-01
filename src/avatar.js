import * as THREE from 'three';
import { toon } from './core/materials.js';

// 귀여운 2등신 치비 캐릭터. 기본 도형만 조합해서 만들어요.
const SKIN = 0xffe3d3;
export const SEAT_OFFSET = 0.25; // 엉덩이 높이 (탈것 좌석에 앉힐 때 사용)
export const EYE_HEIGHT = 1.2;

// 상점/간식으로 얻는 꾸미기 아이템
export const ITEMS = {
  party: { slot: 'head', name: '파티 모자', emoji: '🥳', price: 8 },
  bow: { slot: 'head', name: '왕리본', emoji: '🎀', price: 12 },
  flower: { slot: 'head', name: '꽃 화관', emoji: '🌸', price: 15 },
  bunny: { slot: 'head', name: '토끼 머리띠', emoji: '🐰', price: 20 },
  crown: { slot: 'head', name: '왕관', emoji: '👑', price: 30 },
  sunglasses: { slot: 'face', name: '선글라스', emoji: '🕶️', price: 12 },
  heartglasses: { slot: 'face', name: '하트 안경', emoji: '😍', price: 18 },
  balloon: { slot: 'hand', name: '하트 풍선', emoji: '🎈', price: 6 },
  teddy: { slot: 'hand', name: '곰인형', emoji: '🧸', price: 35 },
  icecream: { slot: 'hand', name: '아이스크림', emoji: '🍦', price: 0, snack: true },
  cottoncandy: { slot: 'hand', name: '솜사탕', emoji: '🍭', price: 0, snack: true },
  churro: { slot: 'hand', name: '츄러스', emoji: '🥖', price: 0, snack: true },
};

function makeLabelTexture(text, { bg = 'rgba(255,250,245,0.95)', fg = '#5a4a5e', font = 44 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const f = `800 ${font}px "Apple SD Gothic Neo","Noto Sans KR",sans-serif`;
  ctx.font = f;
  const w = Math.ceil(ctx.measureText(text).width) + font * 1.2;
  const h = Math.ceil(font * 1.7);
  canvas.width = w;
  canvas.height = h;
  ctx.font = f;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: w / h };
}

function makeSprite(text, height, opts) {
  const { tex, aspect } = makeLabelTexture(text, opts);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(height * aspect, height, 1);
  sprite.renderOrder = 10;
  return sprite;
}

const EMOJI = { wave: '👋', heart: '💖', laugh: '😆', scream: '😱', wow: '🤩', dizzy: '💫' };

// ---------------- 아이템 모델 ----------------
function buildItem(id) {
  const g = new THREE.Group();
  const m = (geo, color, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, toon(color));
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  switch (id) {
    case 'party': {
      const c = m(new THREE.ConeGeometry(0.2, 0.5, 16), 0x8fd0ff, 0, 0.62, 0.05);
      c.rotation.z = 0.15;
      m(new THREE.SphereGeometry(0.07, 10, 8), 0xffd86b, -0.04, 0.88, 0.05);
      m(new THREE.TorusGeometry(0.19, 0.03, 6, 16), 0xff9fc0, 0, 0.4, 0.05).rotation.x = Math.PI / 2;
      break;
    }
    case 'bow': {
      for (const s of [-1, 1]) {
        const w = m(new THREE.SphereGeometry(0.16, 12, 10), 0xff6fa0, 0.17 * s, 0.5, 0.05);
        w.scale.set(1.2, 0.8, 0.5);
        w.rotation.z = 0.4 * s;
      }
      m(new THREE.SphereGeometry(0.08, 10, 8), 0xff4f8a, 0, 0.5, 0.08);
      break;
    }
    case 'flower': {
      const colors = [0xff9fc0, 0xffd86b, 0xffffff, 0xc4a8ff, 0xffab8f];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        m(new THREE.SphereGeometry(0.08, 8, 6), colors[i % colors.length], Math.cos(a) * 0.42, 0.3 + Math.sin(a * 2) * 0.01, Math.sin(a) * 0.38);
      }
      break;
    }
    case 'bunny': {
      m(new THREE.TorusGeometry(0.47, 0.03, 6, 24, Math.PI), 0xffffff, 0, 0.12, 0).rotation.y = Math.PI / 2;
      for (const s of [-1, 1]) {
        const e = m(new THREE.CapsuleGeometry(0.08, 0.35, 4, 10), 0xffffff, 0.15 * s, 0.75, 0);
        e.rotation.z = -0.2 * s;
        const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.25, 4, 8), toon(0xffc2d4));
        inner.position.z = 0.05;
        e.add(inner);
      }
      break;
    }
    case 'crown': {
      m(new THREE.CylinderGeometry(0.24, 0.26, 0.16, 16, 1, true), 0xffc94a, 0, 0.48, 0).material.side = THREE.DoubleSide;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        m(new THREE.ConeGeometry(0.06, 0.16, 6), 0xffc94a, Math.cos(a) * 0.23, 0.62, Math.sin(a) * 0.23);
        m(new THREE.SphereGeometry(0.035, 8, 6), [0xff6b6b, 0x6fa8ff, 0x8fe3c0][i % 3], Math.cos(a) * 0.25, 0.49, Math.sin(a) * 0.25);
      }
      break;
    }
    case 'sunglasses': {
      for (const s of [-1, 1]) {
        const l = m(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 16), 0x2b2433, 0.17 * s, 0.02, 0.46);
        l.rotation.x = Math.PI / 2;
      }
      m(new THREE.BoxGeometry(0.12, 0.03, 0.03), 0x2b2433, 0, 0.05, 0.47);
      break;
    }
    case 'heartglasses': {
      const shape = new THREE.Shape();
      shape.moveTo(0, -0.1);
      shape.bezierCurveTo(-0.16, 0.0, -0.12, 0.12, 0, 0.05);
      shape.bezierCurveTo(0.12, 0.12, 0.16, 0.0, 0, -0.1);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
      for (const s of [-1, 1]) m(geo, 0xff4f8a, 0.17 * s, 0.02, 0.44);
      m(new THREE.BoxGeometry(0.1, 0.03, 0.03), 0xff4f8a, 0, 0.06, 0.46);
      break;
    }
    case 'teddy': {
      const b = new THREE.Group();
      const brown = 0xc98f5e;
      const add = (geo, color, x, y, z) => {
        const mm = new THREE.Mesh(geo, toon(color));
        mm.position.set(x, y, z);
        b.add(mm);
      };
      add(new THREE.SphereGeometry(0.16, 12, 10), brown, 0, 0, 0);
      add(new THREE.SphereGeometry(0.13, 12, 10), brown, 0, 0.22, 0);
      add(new THREE.SphereGeometry(0.05, 8, 6), brown, 0.09, 0.33, 0);
      add(new THREE.SphereGeometry(0.05, 8, 6), brown, -0.09, 0.33, 0);
      add(new THREE.SphereGeometry(0.05, 8, 6), 0xf3d2b0, 0, 0.2, 0.11);
      add(new THREE.SphereGeometry(0.02, 6, 4), 0x2b2433, 0.05, 0.25, 0.11);
      add(new THREE.SphereGeometry(0.02, 6, 4), 0x2b2433, -0.05, 0.25, 0.11);
      b.position.set(0, -0.05, 0.12);
      g.add(b);
      break;
    }
    case 'icecream': {
      m(new THREE.ConeGeometry(0.08, 0.25, 10), 0xe0b089, 0, -0.02, 0.05).rotation.x = Math.PI;
      m(new THREE.SphereGeometry(0.09, 10, 8), 0xffc2d4, 0, 0.13, 0.05);
      m(new THREE.SphereGeometry(0.08, 10, 8), 0xfff3e6, 0, 0.24, 0.05);
      m(new THREE.SphereGeometry(0.025, 6, 4), 0xff4f6a, 0, 0.32, 0.05);
      break;
    }
    case 'cottoncandy': {
      m(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 6), 0xffffff, 0, 0.08, 0.05);
      const puffColor = 0xffb8d9;
      for (let i = 0; i < 6; i++) {
        m(new THREE.SphereGeometry(0.1, 8, 6), i % 2 ? puffColor : 0xd9c2ff, Math.cos(i) * 0.07, 0.35 + Math.sin(i * 2) * 0.06, 0.05 + Math.sin(i) * 0.07);
      }
      break;
    }
    case 'churro': {
      const c = m(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), 0xd9984f, 0, 0.12, 0.05);
      c.rotation.z = 0.2;
      break;
    }
  }
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

function buildBalloon(color = 0xff6fa0) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.28);
  shape.bezierCurveTo(-0.45, 0.05, -0.28, 0.38, 0, 0.2);
  shape.bezierCurveTo(0.28, 0.38, 0.45, 0.05, 0, -0.28);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3 });
  geo.translate(0, 0, -0.07);
  const b = new THREE.Mesh(geo, toon(color));
  b.castShadow = true;
  g.add(b);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff }));
  g.userData.line = line;
  return { balloon: g, line };
}

export class Avatar {
  constructor({ name = '나', color = 0xff8fb4, items = {} } = {}) {
    this.root = new THREE.Group();
    this.color = color;

    const body = toon(color);
    const skin = toon(SKIN);
    const dark = new THREE.MeshBasicMaterial({ color: 0x3b2f3f });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const blush = new THREE.MeshBasicMaterial({ color: 0xff9fb8, transparent: true, opacity: 0.8 });

    // 위아래로 통통 튀는 부분 (발은 제외)
    this.bouncer = new THREE.Group();
    this.root.add(this.bouncer);

    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.22, 6, 14), body);
    this.torso.position.y = 0.58;
    this.torso.castShadow = true;
    this.bouncer.add(this.torso);

    // 배 쪽 하트 무늬
    const heartShape = new THREE.Shape();
    heartShape.moveTo(0, -0.06);
    heartShape.bezierCurveTo(-0.1, 0.0, -0.07, 0.08, 0, 0.03);
    heartShape.bezierCurveTo(0.07, 0.08, 0.1, 0.0, 0, -0.06);
    const heart = new THREE.Mesh(new THREE.ShapeGeometry(heartShape), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    heart.position.set(0, 0.6, 0.285);
    this.bouncer.add(heart);

    this.head = new THREE.Group();
    this.head.position.y = 1.18;
    this.bouncer.add(this.head);

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.48, 28, 20), skin);
    headMesh.scale.set(1.08, 0.95, 1);
    headMesh.castShadow = true;
    this.head.add(headMesh);

    const hairMat = toon(new THREE.Color(color).multiplyScalar(0.75));
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.51, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hair.scale.set(1.08, 0.98, 1.02);
    hair.rotation.x = -0.25;
    hair.position.set(0, 0.02, -0.03);
    hair.castShadow = true;
    this.head.add(hair);

    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.24, 12), hairMat);
      ear.position.set(0.3 * s, 0.42, -0.02);
      ear.rotation.z = -0.35 * s;
      this.head.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.13, 10), toon(0xffc2d4));
      inner.position.set(0, -0.03, 0.06);
      ear.add(inner);
    }

    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), dark);
      eye.scale.set(0.85, 1.15, 0.5);
      eye.position.set(0.17 * s, 0.0, 0.43);
      this.head.add(eye);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), white);
      shine.position.set(0.025, 0.035, 0.06);
      eye.add(shine);
      this.eyes.push(eye);

      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16), blush);
      cheek.position.set(0.29 * s, -0.11, 0.39);
      cheek.rotation.y = 0.55 * s;
      this.head.add(cheek);
    }

    this.mouthSmile = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 12, Math.PI), dark);
    this.mouthSmile.position.set(0, -0.12, 0.45);
    this.mouthSmile.rotation.z = Math.PI;
    this.head.add(this.mouthSmile);
    this.mouthOpen = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), toon(0xd94f6a));
    this.mouthOpen.scale.set(1, 1.2, 0.4);
    this.mouthOpen.position.set(0, -0.14, 0.43);
    this.mouthOpen.visible = false;
    this.head.add(this.mouthOpen);

    this.arms = [];
    this.hands = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.3 * s, 0.74, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.22, 4, 10), body);
      arm.position.y = -0.17;
      arm.castShadow = true;
      pivot.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), skin);
      hand.position.y = -0.34;
      pivot.add(hand);
      pivot.rotation.z = 0.25 * s;
      this.bouncer.add(pivot);
      this.arms.push(pivot);
      this.hands.push(hand);
    }

    this.legs = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.13 * s, 0.32, 0);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.12, 4, 10), body);
      leg.position.y = -0.13;
      leg.castShadow = true;
      pivot.add(leg);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), toon(0xfff3ea));
      foot.scale.set(1, 0.6, 1.3);
      foot.position.set(0, -0.25, 0.03);
      foot.castShadow = true;
      pivot.add(foot);
      this.root.add(pivot);
      this.legs.push(pivot);
    }

    this.label = null;
    this.name = name;
    this.setName(name);

    this.bubble = null;
    this.bubbleTime = 0;

    // 아이템
    this.items = {};
    this.itemObjs = {};
    this.balloonObj = null;
    this.setItems(items);

    this.t = Math.random() * 10;
    this.walk = 0;
    this.grounded = true;
    this.waveTime = 0;
    this.blinkTimer = 2 + Math.random() * 3;
    this.squash = 0;
    this.pose = 'stand';
    this.dizzy = 0;
    this.firstPerson = false;
    this._hp = new THREE.Vector3();
  }

  setName(name) {
    this.name = name;
    if (this.label) {
      this.root.remove(this.label);
      this.label.material.map.dispose();
    }
    this.label = makeSprite(name, 0.28);
    this.label.position.y = 2.05;
    this.root.add(this.label);
  }

  setItems(items = {}) {
    for (const slot of ['head', 'face', 'hand']) {
      const id = items[slot] || null;
      if (this.items[slot] === id) continue;
      if (this.itemObjs[slot]) {
        this.itemObjs[slot].parent.remove(this.itemObjs[slot]);
        this.itemObjs[slot] = null;
      }
      if (slot === 'hand' && this.balloonObj) {
        this.root.remove(this.balloonObj.balloon);
        this.root.remove(this.balloonObj.line);
        this.balloonObj = null;
      }
      this.items[slot] = id;
      if (!id) continue;
      if (id === 'balloon') {
        this.balloonObj = buildBalloon(0xff6fa0);
        this.root.add(this.balloonObj.balloon);
        this.root.add(this.balloonObj.line);
        continue;
      }
      const obj = buildItem(id);
      if (slot === 'hand') {
        obj.position.set(0, -0.34, 0.05);
        this.arms[1].add(obj);
      } else {
        this.head.add(obj);
      }
      this.itemObjs[slot] = obj;
    }
  }

  setFirstPerson(on) {
    this.firstPerson = on;
    this.head.visible = !on;
    this.label.visible = !on;
    if (this.bubble) this.bubble.visible = !on;
  }

  say(text, seconds = 3) {
    if (this.bubble) {
      this.root.remove(this.bubble);
      this.bubble.material.map.dispose();
    }
    const isEmoji = Object.values(EMOJI).includes(text);
    this.bubble = makeSprite(text, isEmoji ? 0.55 : 0.36, isEmoji ? { bg: 'rgba(0,0,0,0)', font: 64 } : {});
    this.bubble.position.y = 2.45;
    this.bubble.visible = !this.firstPerson;
    this.root.add(this.bubble);
    this.bubbleTime = seconds;
  }

  emote(kind) {
    if (kind === 'wave') this.waveTime = 1.6;
    if (kind === 'laugh') this.squash = 1;
    if (kind === 'heart') this.squash = 0.6;
    if (EMOJI[kind]) this.say(EMOJI[kind], 2);
  }

  land() {
    this.squash = 0.7;
  }

  makeDizzy(seconds = 4) {
    this.dizzy = seconds;
    this.say(EMOJI.dizzy, Math.min(3, seconds));
  }

  // pose: stand | sit | hold | handsUp | scared | drive | cheer
  update(dt, speed, grounded, pose = 'stand') {
    this.t += dt;
    this.pose = pose;
    this.walk += (speed - this.walk) * Math.min(1, dt * 10);
    this.grounded = grounded;
    const w = this.walk;
    const phase = this.t * 11;
    const sitting = pose !== 'stand' && pose !== 'cheer';
    let mouthOpen = false;

    if (sitting) {
      this.bouncer.position.y = Math.sin(this.t * 2.2) * 0.008;
      this.bouncer.rotation.z = 0;
      this.legs[0].rotation.set(-1.45, 0, 0.08);
      this.legs[1].rotation.set(-1.45, 0, -0.08);
      switch (pose) {
        case 'hold':
          this.arms[0].rotation.set(-1.25, 0, -0.12);
          this.arms[1].rotation.set(-1.25, 0, 0.12);
          break;
        case 'drive':
          this.arms[0].rotation.set(-1.0, 0, 0.15);
          this.arms[1].rotation.set(-1.0, 0, -0.15);
          break;
        case 'handsUp': {
          const wig = Math.sin(this.t * 14) * 0.15;
          this.arms[0].rotation.set(-0.3, 0, -2.75 + wig);
          this.arms[1].rotation.set(-0.3, 0, 2.75 - wig);
          mouthOpen = true;
          break;
        }
        case 'scared':
          this.arms[0].rotation.set(-2.3, 0, 0.55);
          this.arms[1].rotation.set(-2.3, 0, -0.55);
          this.bouncer.position.x = Math.sin(this.t * 60) * 0.01;
          mouthOpen = true;
          break;
        default:
          this.arms[0].rotation.set(-0.5, 0, -0.2);
          this.arms[1].rotation.set(-0.5, 0, 0.2);
      }
    } else {
      this.bouncer.position.x = 0;
      const swing = Math.sin(phase) * 0.8 * w;
      this.legs[0].rotation.set(swing, 0, 0);
      this.legs[1].rotation.set(-swing, 0, 0);
      this.bouncer.position.y = Math.abs(Math.sin(phase)) * 0.08 * w + Math.sin(this.t * 2.2) * 0.012;
      this.bouncer.rotation.z = Math.sin(phase) * 0.05 * w;
      if (!grounded) {
        this.arms[0].rotation.set(0, 0, -2.4);
        this.arms[1].rotation.set(0, 0, 2.4);
        this.legs[0].rotation.x = 0.4;
        this.legs[1].rotation.x = -0.2;
      } else if (pose === 'cheer') {
        const b = Math.abs(Math.sin(this.t * 8));
        this.arms[0].rotation.set(0, 0, -2.5 - b * 0.3);
        this.arms[1].rotation.set(0, 0, 2.5 + b * 0.3);
        this.bouncer.position.y = b * 0.12;
        mouthOpen = true;
      } else {
        this.arms[0].rotation.set(-swing, 0, -0.25);
        this.arms[1].rotation.set(swing, 0, 0.25);
      }
    }

    if (this.waveTime > 0) {
      this.waveTime -= dt;
      this.arms[1].rotation.set(0, 0, 2.6 + Math.sin(this.t * 18) * 0.35);
    }

    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt * 3);
      const s = Math.sin(this.squash * Math.PI) * 0.18;
      this.bouncer.scale.set(1 + s, 1 - s, 1 + s);
    } else {
      this.bouncer.scale.set(1, 1, 1);
    }

    // 어지러움: 머리 빙글, 몸 휘청
    if (this.dizzy > 0) {
      this.dizzy -= dt;
      const k = Math.min(1, this.dizzy);
      this.head.rotation.z = Math.sin(this.t * 5) * 0.3 * k;
      this.head.rotation.x = Math.cos(this.t * 5) * 0.15 * k;
      this.bouncer.rotation.z += Math.sin(this.t * 3) * 0.12 * k;
    } else {
      this.head.rotation.z = Math.sin(this.t * 1.7) * 0.04;
      this.head.rotation.x = 0;
    }

    this.mouthOpen.visible = mouthOpen;
    this.mouthSmile.visible = !mouthOpen;

    this.blinkTimer -= dt;
    const blink = this.blinkTimer < 0.12 && !mouthOpen;
    for (const e of this.eyes) e.scale.y = blink ? 0.15 : mouthOpen ? 1.35 : 1.15;
    if (this.blinkTimer < 0) this.blinkTimer = 2 + Math.random() * 4;

    // 풍선: 손 위에서 둥실둥실
    if (this.balloonObj) {
      this.root.updateMatrixWorld(true);
      this.hands[1].getWorldPosition(this._hp);
      this.root.worldToLocal(this._hp);
      const b = this.balloonObj.balloon;
      const tx = this._hp.x + Math.sin(this.t * 1.3) * 0.15;
      const tz = this._hp.z - 0.1 + Math.cos(this.t * 1.1) * 0.1;
      b.position.set(tx, this._hp.y + 1.35, tz);
      b.rotation.z = Math.sin(this.t * 1.3) * 0.15;
      const pos = this.balloonObj.line.geometry.attributes.position;
      pos.setXYZ(0, this._hp.x, this._hp.y, this._hp.z);
      pos.setXYZ(1, tx, this._hp.y + 1.1, tz);
      pos.needsUpdate = true;
      this.balloonObj.line.geometry.computeBoundingSphere();
    }

    if (this.bubble) {
      this.bubbleTime -= dt;
      this.bubble.position.y = 2.45 + Math.sin(this.t * 4) * 0.04;
      if (this.bubbleTime <= 0) {
        this.root.remove(this.bubble);
        this.bubble.material.map.dispose();
        this.bubble = null;
      }
    }
  }
}
