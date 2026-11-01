import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { createWorld, ISLAND_RADIUS } from './world.js';
import { Controls } from './controls.js';
import { Net } from './net.js';

const $ = (id) => document.getElementById(id);

// ---------------- 렌더러 & 씬 ----------------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
const world = createWorld(scene);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // 세로 화면에서는 시야를 살짝 넓혀서 옆이 덜 답답하게
  camera.fov = w < h ? 68 : 55;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// iOS 핀치 줌 방지
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------------- 로비 ----------------
const COLORS = [0xff8fb4, 0x8fd0ff, 0x8fe3c0, 0xc4a8ff, 0xffd86b, 0xffab8f];
const saved = JSON.parse(localStorage.getItem('dulisum-profile') || '{}');
let myColor = saved.color ?? COLORS[Math.floor(Math.random() * COLORS.length)];
$('name').value = saved.name || '';

const colorsEl = $('colors');
for (const c of COLORS) {
  const b = document.createElement('button');
  b.style.background = '#' + c.toString(16).padStart(6, '0');
  b.className = c === myColor ? 'on' : '';
  b.onclick = () => {
    myColor = c;
    for (const el of colorsEl.children) el.className = '';
    b.className = 'on';
  };
  colorsEl.appendChild(b);
}

const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) $('code').value = roomParam.toUpperCase();

function lobbyBusy(busy, msg = '') {
  for (const id of ['btn-host', 'btn-join', 'btn-solo']) $(id).disabled = busy;
  $('lobby-msg').textContent = msg;
}

function profile() {
  const name = $('name').value.trim() || '나';
  localStorage.setItem('dulisum-profile', JSON.stringify({ name, color: myColor }));
  return { name, color: myColor };
}

// ---------------- 게임 상태 ----------------
let me = null; // { avatar, pos, velY, grounded, yaw }
let partner = null; // { avatar, target, targetYaw, lastPos, grounded }
let net = null;
let controls = null;

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2500);
}

function setStatus(text) {
  $('status').textContent = text;
}

function startGame({ name, color }, spawnX) {
  $('lobby').classList.add('hidden');
  $('hud').classList.remove('hidden');

  const avatar = new Avatar({ name, color });
  scene.add(avatar.root);
  me = {
    avatar,
    pos: new THREE.Vector3(spawnX, 0, 7),
    velY: 0,
    grounded: true,
    yaw: Math.PI,
  };
  avatar.root.position.copy(me.pos);

  controls = new Controls({
    joystick: $('joystick'),
    stick: $('stick'),
    canvas,
    jumpButton: $('btn-jump'),
  });
}

function ensurePartner(info) {
  if (!partner) {
    const avatar = new Avatar(info);
    scene.add(avatar.root);
    partner = {
      avatar,
      target: new THREE.Vector3(0, 0, 7),
      targetYaw: Math.PI,
      lastPos: new THREE.Vector3(0, 0, 7),
      grounded: true,
      speed: 0,
      fresh: true,
      lastSeen: performance.now(),
    };
  } else if (info.name) {
    partner.avatar.setName(info.name);
  }
  partner.info = info;
}

function removePartner() {
  if (!partner) return;
  scene.remove(partner.avatar.root);
  partner = null;
}

let askedWho = 0;
function setupNet(p) {
  net = new Net({
    onConnect() {
      net.send({ t: 'hi', name: p.name, color: p.color });
      setStatus('💕 둘이 함께');
    },
    onDisconnect() {
      if (net.closed) return; // 방이 꽉 찬 경우 등
      if (partner) toast(`${partner.info?.name ?? '상대'} 님이 나갔어요`);
      removePartner();
      setStatus(net.isHost ? '상대를 기다리는 중...' : '연결이 끊겼어요');
    },
    onStatus: setStatus,
    onMessage(msg) {
      if (partner) partner.lastSeen = performance.now();
      switch (msg.t) {
        case 'hi':
          if (!partner) toast(`💕 ${msg.name} 님이 들어왔어요!`);
          ensurePartner({ name: msg.name, color: msg.color });
          setStatus('💕 둘이 함께');
          break;
        case 'who':
          net.send({ t: 'hi', name: p.name, color: p.color });
          break;
        case 'bye':
          if (partner) toast(`${partner.info?.name ?? '상대'} 님이 나갔어요`);
          removePartner();
          setStatus(net.isHost ? '상대를 기다리는 중...' : '상대가 나갔어요');
          break;
        case 's':
          if (!partner) {
            // 상대는 있는데 정보가 없으면 (다시 돌아온 경우) 다시 물어보기
            const now = performance.now();
            if (!askedWho || now - askedWho > 1000) {
              askedWho = now;
              net.send({ t: 'who' });
            }
            return;
          }
          partner.target.set(msg.x, msg.y, msg.z);
          partner.targetYaw = msg.r;
          partner.grounded = !!msg.g;
          partner.speed = msg.m;
          if (partner.fresh) {
            partner.avatar.root.position.copy(partner.target);
            partner.fresh = false;
          }
          break;
        case 'emote':
          partner?.avatar.emote(msg.e);
          break;
        case 'chat':
          partner?.avatar.say(String(msg.text).slice(0, 40), 4);
          break;
      }
    },
  });
  return net;
}

function showRoomBadge(code) {
  const badge = $('room-badge');
  badge.textContent = `방 코드 ${code} 🔗`;
  badge.style.pointerEvents = 'auto';
  badge.onclick = async () => {
    const url = `${location.origin}${location.pathname}?room=${code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: '둘이섬', text: `둘이섬에 놀러와! 방 코드 ${code}`, url });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return; // 공유 취소
      }
    }
    toast((await copyText(url)) ? '초대 링크를 복사했어요' : `방 코드 ${code} 를 알려주세요`);
  };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 카톡 안 브라우저 등 clipboard API가 막힌 곳
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      /* 무시 */
    }
    ta.remove();
    return ok;
  }
}

$('btn-host').onclick = async () => {
  const p = profile();
  lobbyBusy(true, '방을 만드는 중...');
  try {
    const code = await setupNet(p).host((m) => lobbyBusy(true, m));
    startGame(p, -1.2);
    showRoomBadge(code);
    setStatus('상대를 기다리는 중...');
    toast('방 코드를 상대에게 알려주세요');
  } catch (err) {
    console.error(err);
    if (net) net.closed = true;
    net?.peer?.destroy();
    net = null;
    lobbyBusy(false, `방을 만들지 못했어요. 인터넷 연결을 확인해주세요. (${err.type || err.message})`);
  }
};

$('btn-join').onclick = async () => {
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 4) return lobbyBusy(false, '4글자 방 코드를 입력해주세요');
  const p = profile();
  lobbyBusy(true, '들어가는 중...');
  try {
    await setupNet(p).join(code, (m) => lobbyBusy(true, m));
    startGame(p, 1.2);
    showRoomBadge(code);
  } catch (err) {
    console.error(err);
    if (net) net.closed = true;
    net?.peer?.destroy();
    net = null;
    lobbyBusy(false, err.message || `연결하지 못했어요 (${err.type})`);
  }
};

$('btn-solo').onclick = () => {
  startGame(profile(), 0);
};

// 감정표현 & 채팅
for (const b of document.querySelectorAll('[data-emote]')) {
  b.addEventListener('click', () => {
    const e = b.dataset.emote;
    me?.avatar.emote(e);
    net?.send({ t: 'emote', e });
  });
}
$('btn-chat').onclick = () => {
  const form = $('chat-form');
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) $('chat-input').focus();
};
$('chat-form').onsubmit = (e) => {
  e.preventDefault();
  const input = $('chat-input');
  const text = input.value.trim();
  if (text) {
    me?.avatar.say(text, 4);
    net?.send({ t: 'chat', text });
  }
  input.value = '';
  input.blur();
  $('chat-form').classList.add('hidden');
};

// ---------------- 물리 ----------------
const SPEED = 4.6;
const GRAVITY = 24;
const JUMP = 8.2;
const PLAYER_R = 0.35;
const STEP = 0.35;

function groundHeightAt(x, z, y) {
  let g = 0;
  for (const p of world.platforms) {
    if (Math.hypot(p.x - x, p.z - z) < p.r + 0.15 && y >= p.top - STEP) g = Math.max(g, p.top);
  }
  return g;
}

function resolveCollisions(pos) {
  for (const c of world.colliders) {
    pushOut(pos, c.x, c.z, c.r + PLAYER_R);
  }
  for (const p of world.platforms) {
    // 발판보다 낮으면 벽처럼 막기
    if (pos.y < p.top - STEP) pushOut(pos, p.x, p.z, p.r + PLAYER_R);
  }
  const d = Math.hypot(pos.x, pos.z);
  const max = ISLAND_RADIUS - 0.6;
  if (d > max) {
    pos.x *= max / d;
    pos.z *= max / d;
  }
}

function pushOut(pos, x, z, r) {
  const dx = pos.x - x;
  const dz = pos.z - z;
  const d = Math.hypot(dx, dz);
  if (d < r && d > 1e-4) {
    pos.x = x + (dx / d) * r;
    pos.z = z + (dz / d) * r;
  }
}

function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function updateMe(dt) {
  const input = controls.getMove();
  const yaw = controls.camYaw;
  // 카메라 기준 앞/오른쪽
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const dx = fx * input.y + rx * input.x;
  const dz = fz * input.y + rz * input.x;
  const mag = Math.min(1, Math.hypot(dx, dz));

  me.pos.x += dx * SPEED * dt;
  me.pos.z += dz * SPEED * dt;
  if (mag > 0.05) me.yaw = angleLerp(me.yaw, Math.atan2(dx, dz), Math.min(1, dt * 14));

  // 점프 & 중력
  if (controls.consumeJump() && me.grounded) {
    me.velY = JUMP;
    me.grounded = false;
  }
  me.velY -= GRAVITY * dt;
  me.pos.y += me.velY * dt;

  resolveCollisions(me.pos);

  const ground = groundHeightAt(me.pos.x, me.pos.z, me.pos.y);
  if (me.pos.y <= ground) {
    if (!me.grounded && me.velY < -4) me.avatar.land();
    me.pos.y = ground;
    me.velY = 0;
    me.grounded = true;
  } else if (me.pos.y > ground + 0.05) {
    me.grounded = false;
  }

  me.avatar.root.position.copy(me.pos);
  me.avatar.root.rotation.y = me.yaw;
  me.avatar.update(dt, mag, me.grounded);
  me.speed = mag;
}

function updatePartner(dt) {
  if (!partner) return;
  const root = partner.avatar.root;
  root.position.lerp(partner.target, Math.min(1, dt * 12));
  root.rotation.y = angleLerp(root.rotation.y, partner.targetYaw, Math.min(1, dt * 12));
  partner.avatar.update(dt, partner.speed, partner.grounded);
}

// ---------------- 카메라 ----------------
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3(0, 6, 16);
function updateCamera(dt) {
  if (!me) {
    // 로비: 섬을 천천히 빙글
    const t = performance.now() / 1000;
    camera.position.set(Math.sin(t * 0.1) * 20, 11, Math.cos(t * 0.1) * 20);
    camera.lookAt(0, 0, 0);
    return;
  }
  const dist = 7.5;
  const { camYaw, camPitch } = controls;
  camTarget.lerp(new THREE.Vector3(me.pos.x, me.pos.y + 1.1, me.pos.z), Math.min(1, dt * 10));
  const desired = new THREE.Vector3(
    camTarget.x + Math.sin(camYaw) * Math.cos(camPitch) * dist,
    camTarget.y + Math.sin(camPitch) * dist,
    camTarget.z + Math.cos(camYaw) * Math.cos(camPitch) * dist,
  );
  desired.y = Math.max(desired.y, 0.6);
  camPos.lerp(desired, Math.min(1, dt * 12));
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
}

// ---------------- 네트워크 송신 ----------------
let sendAcc = 0;
function sendState(dt) {
  if (!net?.connected || !me) return;
  sendAcc += dt;
  if (sendAcc < 1 / 15) return;
  sendAcc = 0;
  const r2 = (v) => Math.round(v * 100) / 100;
  net.send({
    t: 's',
    x: r2(me.pos.x),
    y: r2(me.pos.y),
    z: r2(me.pos.z),
    r: r2(me.yaw),
    m: r2(me.speed),
    g: me.grounded ? 1 : 0,
  });
}

// 상대가 몇 초 동안 소식이 없으면 (앱을 내렸거나 끊김) 잠시 숨겨요
function checkPartnerAlive() {
  if (partner && performance.now() - partner.lastSeen > 6000) {
    toast(`${partner.info?.name ?? '상대'} 님이 잠깐 자리를 비웠어요`);
    removePartner();
    if (net?.connected) setStatus('상대 응답 기다리는 중...');
  }
}

window.addEventListener('pagehide', () => net?.send({ t: 'bye' }));

// ---------------- 루프 ----------------
const timer = new THREE.Timer();
timer.connect(document);
function frame(now) {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  const t = timer.getElapsed();
  world.update(t);
  if (me) {
    updateMe(dt);
    updatePartner(dt);
    sendState(dt);
    checkPartnerAlive();
  }
  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
camTarget.set(0, 1, 7);
requestAnimationFrame(frame);

// 디버그/테스트용
window.__game = {
  get me() {
    return me;
  },
  get partner() {
    return partner;
  },
  get net() {
    return net;
  },
  controls: () => controls,
};
