import * as THREE from 'three';

// 귀여운 2등신 치비 캐릭터. 기본 도형만 조합해서 만들어요.
const SKIN = 0xffe3d3;

function mat(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, ...opts });
}

function makeLabelTexture(text, { bg = 'rgba(255,250,245,0.95)', fg = '#5a4a5e', font = 44 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `800 ${font}px "Apple SD Gothic Neo","Noto Sans KR",sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + font * 1.2;
  const h = Math.ceil(font * 1.7);
  canvas.width = w;
  canvas.height = h;
  ctx.font = `800 ${font}px "Apple SD Gothic Neo","Noto Sans KR",sans-serif`;
  ctx.fillStyle = bg;
  const r = h / 2;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, r);
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

const EMOJI = { wave: '👋', heart: '💖', laugh: '😆' };

export class Avatar {
  constructor({ name = '나', color = 0xff8fb4 } = {}) {
    this.root = new THREE.Group();
    this.color = color;

    const body = mat(color);
    const skin = mat(SKIN);
    const dark = new THREE.MeshBasicMaterial({ color: 0x3b2f3f });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const blush = new THREE.MeshBasicMaterial({ color: 0xff9fb8, transparent: true, opacity: 0.8 });

    // 위아래로 통통 튀는 부분 (발은 제외)
    this.bouncer = new THREE.Group();
    this.root.add(this.bouncer);

    // 몸통
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.22, 6, 14), body);
    this.torso.position.y = 0.58;
    this.torso.castShadow = true;
    this.bouncer.add(this.torso);

    // 머리 (크게!)
    this.head = new THREE.Group();
    this.head.position.y = 1.18;
    this.bouncer.add(this.head);

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.48, 28, 20), skin);
    headMesh.scale.set(1.08, 0.95, 1);
    headMesh.castShadow = true;
    this.head.add(headMesh);

    // 머리카락 (뒤통수 + 앞머리)
    const hairMat = mat(new THREE.Color(color).multiplyScalar(0.75));
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.51, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.55),
      hairMat,
    );
    hair.scale.set(1.08, 0.98, 1.02);
    hair.rotation.x = -0.25;
    hair.position.set(0, 0.02, -0.03);
    hair.castShadow = true;
    this.head.add(hair);

    // 귀여운 귀 (동물 귀)
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.24, 12), hairMat);
      ear.position.set(0.3 * s, 0.42, -0.02);
      ear.rotation.z = -0.35 * s;
      this.head.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.13, 10), mat(0xffc2d4));
      inner.position.set(0, -0.03, 0.06);
      ear.add(inner);
    }

    // 눈
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

    // 입
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 12, Math.PI), dark);
    mouth.position.set(0, -0.12, 0.45);
    mouth.rotation.z = Math.PI;
    this.head.add(mouth);

    // 팔
    this.arms = [];
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
    }

    // 다리
    this.legs = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.13 * s, 0.32, 0);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.12, 4, 10), body);
      leg.position.y = -0.13;
      leg.castShadow = true;
      pivot.add(leg);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), mat(0xfff3ea));
      foot.scale.set(1, 0.6, 1.3);
      foot.position.set(0, -0.25, 0.03);
      foot.castShadow = true;
      pivot.add(foot);
      this.root.add(pivot);
      this.legs.push(pivot);
    }

    // 이름표
    this.label = null;
    this.setName(name);

    // 말풍선/이모트
    this.bubble = null;
    this.bubbleTime = 0;

    // 애니메이션 상태
    this.t = Math.random() * 10;
    this.walk = 0; // 0~1 걷기 정도
    this.grounded = true;
    this.waveTime = 0;
    this.blinkTimer = 2 + Math.random() * 3;
    this.squash = 0;
  }

  setName(name) {
    if (this.label) {
      this.root.remove(this.label);
      this.label.material.map.dispose();
    }
    this.label = makeSprite(name, 0.28);
    this.label.position.y = 2.05;
    this.root.add(this.label);
  }

  say(text, seconds = 3) {
    if (this.bubble) {
      this.root.remove(this.bubble);
      this.bubble.material.map.dispose();
    }
    const isEmoji = Object.values(EMOJI).includes(text);
    this.bubble = makeSprite(text, isEmoji ? 0.55 : 0.36, isEmoji ? { bg: 'rgba(0,0,0,0)', font: 64 } : {});
    this.bubble.position.y = 2.45;
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

  // speed: 0~1 (걷는 빠르기), grounded: 땅에 있는지
  update(dt, speed, grounded) {
    this.t += dt;
    this.walk += (speed - this.walk) * Math.min(1, dt * 10);
    this.grounded = grounded;
    const w = this.walk;
    const phase = this.t * 11;

    // 걷기: 다리/팔 흔들기, 통통 튀기
    const swing = Math.sin(phase) * 0.8 * w;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.bouncer.position.y = Math.abs(Math.sin(phase)) * 0.08 * w + Math.sin(this.t * 2.2) * 0.012;
    this.bouncer.rotation.z = Math.sin(phase) * 0.05 * w;

    if (!grounded) {
      // 점프 중: 팔 만세, 다리 모으기
      this.arms[0].rotation.set(0, 0, -2.4);
      this.arms[1].rotation.set(0, 0, 2.4);
      this.legs[0].rotation.x = 0.4;
      this.legs[1].rotation.x = -0.2;
    } else {
      this.arms[0].rotation.set(-swing, 0, -0.25);
      this.arms[1].rotation.set(swing, 0, 0.25);
    }

    // 손 흔들기
    if (this.waveTime > 0) {
      this.waveTime -= dt;
      this.arms[1].rotation.set(0, 0, 2.6 + Math.sin(this.t * 18) * 0.35);
    }

    // 찌그러짐 (착지, 감정표현)
    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt * 3);
      const s = Math.sin(this.squash * Math.PI) * 0.18;
      this.bouncer.scale.set(1 + s, 1 - s, 1 + s);
    } else {
      this.bouncer.scale.set(1, 1, 1);
    }

    // 머리 살짝 까딱
    this.head.rotation.z = Math.sin(this.t * 1.7) * 0.04;

    // 눈 깜빡
    this.blinkTimer -= dt;
    const blink = this.blinkTimer < 0.12;
    for (const e of this.eyes) e.scale.y = blink ? 0.15 : 1.15;
    if (this.blinkTimer < 0) this.blinkTimer = 2 + Math.random() * 4;

    // 말풍선
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
