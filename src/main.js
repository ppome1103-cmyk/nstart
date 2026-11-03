import * as THREE from 'three';
import { Avatar, ITEMS } from './avatar.js';
import { Controls } from './controls.js';
import { Net } from './net.js';
import { openPanel as openNetDiag, loadCfg as loadNetCfg, setupOverlay as setupNetOverlay } from './netdiag.js';
import { ScreenFX } from './fx.js';
import { initAudio, sfx, setMuted, isMuted, setMusicLevel, setNightMusic, setWind } from './audio.js';
import { parkNow, onPong, localNow } from './core/clock.js';
import { damp } from './core/rng.js';
import { createPark } from './park/park.js';
import * as L from './park/layout.js';
import { RideManager } from './rides/manager.js';
import { Coaster } from './rides/coaster.js';
import { Ferris } from './rides/ferris.js';
import { Carousel } from './rides/carousel.js';
import { DropTower } from './rides/drop.js';
import { PirateShip } from './rides/pirate.js';
import { SwingRide } from './rides/swing.js';
import { Cups } from './rides/cups.js';
import { BumperCars } from './rides/bumper.js';
import { Flume } from './rides/flume.js';
import { Haunted } from './rides/haunted.js';
import { Train } from './rides/train.js';
import { createBooths } from './games/booths.js';
import { HUD, h } from './ui/hud.js';

const $ = (id) => document.getElementById(id);

// ---------------- 렌더러 & 씬 ----------------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // 그림자는 두 프레임에 한 번만 갱신

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);
let baseFov = 60;
const fx = new ScreenFX($('fx'));

function resize() {
  const w = window.innerWidth;
  const hgt = window.innerHeight;
  renderer.setSize(w, hgt, false);
  camera.aspect = w / hgt;
  baseFov = w < hgt ? 70 : 55;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------------- 게임 상태 ----------------
let me = null;
let partner = null;
let net = null;
let controls = null;
let hud = null;
let activity = null; // 부스 게임 중
let role = 'solo';
let pendingPhoto = null;
const photos = loadPhotos();

const ctx = {
  scene,
  camera,
  fx,
  now: () => parkNow(),
  me: () => me,
  partner: () => partner,
  net: () => net,
  role: () => role,
  controls: () => controls,
  get hud() {
    return hud;
  },
  mineOn: (ride) => rides.mine?.ride === ride,
  mySeat: (ride) => (rides.mine?.ride === ride ? rides.mine.seat : null),
  myBoardTime: () => rides.mine?.boardTime,
  busy: () => !!(rides.mine || activity || hud?.modalOpen),
  setActivity: (a) => {
    activity = a;
  },
  addTickets: (n) => addTickets(n),
  setIndoor: (f) => {
    world.indoorTarget = f;
  },
  dizzy: (sec) => makeDizzy(sec),
  hearts: () => {
    sfx.chime();
    fx.flash = 0.25;
  },
  onRidePhoto: (ride) => {
    pendingPhoto = { ride };
  },
};

const world = createPark(scene);
ctx.world = world;
const rides = new RideManager(ctx);
ctx.rides = rides;
[Coaster, Ferris, Carousel, DropTower, PirateShip, SwingRide, Cups, BumperCars, Flume, Haunted, Train].forEach((C) => rides.add(new C(ctx)));
const games = createBooths(ctx, { onShop: () => openShop() });

for (const b of world.benches) {
  world.interactables.push({
    x: b.x,
    z: b.z,
    r: 2,
    kind: 'bench',
    label: () => (me?.sit ? null : { text: '🪑 앉기' }),
    onUse: () => sitOnBench(b),
  });
}

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

// ---------------- 티켓 & 아이템 ----------------
let tickets = Number(localStorage.getItem('dulisum-tickets') ?? 15);
const owned = new Set(JSON.parse(localStorage.getItem('dulisum-owned') || '[]'));
const equipped = JSON.parse(localStorage.getItem('dulisum-equip') || '{}');

function addTickets(n) {
  tickets += n;
  localStorage.setItem('dulisum-tickets', String(tickets));
  hud?.setTickets(tickets);
  sfx.ticket();
}

function saveItems() {
  localStorage.setItem('dulisum-owned', JSON.stringify([...owned]));
  localStorage.setItem('dulisum-equip', JSON.stringify(equipped));
  me?.avatar.setItems(equipped);
  net?.send({ t: 'items', items: equipped });
}

function equip(id) {
  const it = ITEMS[id];
  if (equipped[it.slot] === id) delete equipped[it.slot];
  else equipped[it.slot] = id;
  saveItems();
}

// ---------------- 게임 시작 ----------------
function startGame(p) {
  $('lobby').classList.add('hidden');
  initAudio();
  hud = new HUD($('hud'), {
    map: openMap,
    bag: openBag,
    album: openAlbum,
    night: () => toggleNight(),
    sound: () => {
      setMuted(!isMuted());
      hud.soundBtn.textContent = isMuted() ? '🔇' : '🔊';
    },
    emote: (e) => {
      me.avatar.emote(e);
      net?.send({ t: 'emote', e });
    },
    chat: (text) => {
      me.avatar.say(text, 4);
      net?.send({ t: 'chat', text });
    },
    selfie: () => takeSelfie(),
    prompt: () => usePrompt(),
    rideCam: () => rides.toggleCam(),
    rideAction: () => rides.toggleHands(),
    rideExit: () => rides.exit(),
    gameStop: () => activity?.stop(),
  });
  $('hud').classList.remove('hidden');
  hud.soundBtn.textContent = isMuted() ? '🔇' : '🔊';
  hud.setTickets(tickets);

  const avatar = new Avatar({ name: p.name, color: p.color, items: equipped });
  scene.add(avatar.root);
  const off = role === 'guest' ? 1.4 : role === 'host' ? -1.4 : 0;
  me = {
    avatar,
    pos: new THREE.Vector3(L.SPAWN.x + off, 0, L.SPAWN.z),
    velY: 0,
    grounded: true,
    yaw: Math.PI,
    speed: 0,
    sit: null,
    dizzy: 0,
  };
  avatar.root.position.copy(me.pos);
  controls = new Controls({ joystick: hud.joystick, stick: hud.stick, canvas, jumpButton: hud.jump });
  controls.onTap = (x, y) => {
    if (activity) {
      const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
      activity.tap(ndc, camera);
    }
  };
  camTarget.set(me.pos.x, 1.2, me.pos.z);
  camPos.set(me.pos.x, 5, me.pos.z + 9);
  setTimeout(() => hud.toast('🎡 둘이랜드에 온 걸 환영해요! 🗺️ 지도로 놀이기구를 찾아봐요', 4200), 600);
}

function ensurePartner(info) {
  if (!partner) {
    const avatar = new Avatar({ name: info.name, color: info.color, items: info.items || {} });
    scene.add(avatar.root);
    partner = {
      avatar,
      target: new THREE.Vector3(L.SPAWN.x, 0, L.SPAWN.z),
      targetYaw: Math.PI,
      grounded: true,
      speed: 0,
      pose: 'stand',
      fresh: true,
      lastSeen: performance.now(),
      onRide: false,
    };
  } else {
    if (info.name && info.name !== partner.avatar.name) partner.avatar.setName(info.name);
    if (info.items) partner.avatar.setItems(info.items);
  }
  partner.info = { ...(partner.info || {}), ...info };
}

function removePartner() {
  if (!partner) return;
  rides.partnerLeft();
  scene.remove(partner.avatar.root);
  partner = null;
}

let askedWho = 0;
let pingTimer = null;
function helloMsg(p) {
  return { t: 'hi', name: p.name, color: p.color, items: equipped, night: world.nightTarget };
}

function setupNet(p) {
  net = new Net({
    onConnect() {
      net.send(helloMsg(p));
      hud?.setStatus('💕 둘이 함께');
      if (role === 'guest') {
        clearInterval(pingTimer);
        let n = 0;
        const ping = () => net?.send({ t: 'ping', c: localNow() });
        ping();
        pingTimer = setInterval(() => {
          n++;
          if (n < 6 || n % 4 === 0) ping();
        }, 2500);
      }
    },
    onDisconnect() {
      if (net.closed) return;
      if (partner) hud?.toast(`${partner.info?.name ?? '상대'} 님이 나갔어요`);
      removePartner();
      hud?.setStatus(net.isHost ? '상대를 기다리는 중...' : '연결이 끊겼어요');
    },
    onStatus: (s) => hud?.setStatus(s),
    onMessage: (msg) => handleMessage(msg, p),
  });
  return net;
}

// 상대에게서 온 메시지 처리 (데모 영상 녹화 때는 직접 넣기도 해요)
function handleMessage(msg, p) {
  if (partner) partner.lastSeen = performance.now();
  switch (msg.t) {
    case 'hi':
      if (!partner) hud?.toast(`💕 ${msg.name} 님이 들어왔어요!`);
      ensurePartner({ name: msg.name, color: msg.color, items: msg.items });
      hud?.setStatus('💕 둘이 함께');
      if (role === 'guest' && msg.night !== undefined) applyNight(msg.night > 0.5, false);
      if (rides.mine) {
        const { ride, seat, boardTime } = rides.mine;
        net?.send({ t: 'board', id: ride.id, seat, start: ride.start, bt: boardTime });
      }
      break;
    case 'who':
      net?.send(helloMsg(p));
      break;
    case 'bye':
      if (partner) hud?.toast(`${partner.info?.name ?? '상대'} 님이 나갔어요`);
      removePartner();
      hud?.setStatus(net?.isHost ? '상대를 기다리는 중...' : '상대가 나갔어요');
      break;
    case 'ping':
      net?.send({ t: 'pong', c: msg.c, h: parkNow() });
      break;
    case 'pong':
      onPong(msg.c, msg.h);
      break;
    case 's':
      if (!partner) {
        const now = performance.now();
        if (now - askedWho > 1000) {
          askedWho = now;
          net?.send({ t: 'who' });
        }
        return;
      }
      partner.target.set(msg.x, msg.y, msg.z);
      partner.targetYaw = msg.r;
      partner.grounded = !!msg.g;
      partner.speed = msg.m;
      partner.pose = msg.p || 'stand';
      rides.syncPartner(msg.rd || null, msg.st ?? 0, msg.h);
      if (msg.rd === 'bumper') rides.byId.bumper.setRemote(msg.st, msg.x, msg.z, msg.r);
      break;
    case 'emote':
      partner?.avatar.emote(msg.e);
      break;
    case 'chat':
      partner?.avatar.say(String(msg.text).slice(0, 40), 4);
      break;
    case 'items':
      partner?.avatar.setItems(msg.items || {});
      break;
    case 'night':
      applyNight(!!msg.on, false);
      hud?.toast(msg.on ? '🌙 밤이 되었어요! 불꽃놀이가 시작돼요' : '☀️ 낮이 되었어요');
      break;
    case 'score':
      hud?.toast(`${partner?.info?.name ?? '상대'} 님이 ${msg.game}에서 ${msg.score}점! 🎉`);
      break;
    case 'board':
    case 'exit':
    case 'rv':
      rides.onNet(msg);
      break;
  }
}

function showRoomBadge(code) {
  hud.badge.textContent = `방 ${code} 🔗`;
  hud.badge.style.pointerEvents = 'auto';
  hud.badge.onclick = async () => {
    const url = `${location.origin}${location.pathname}?room=${code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: '둘이랜드', text: `둘이랜드에 놀러와! 방 코드 ${code}`, url });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
    hud.toast((await copyText(url)) ? '초대 링크를 복사했어요' : `방 코드 ${code} 를 알려주세요`);
  };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
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
  initAudio();
  lobbyBusy(true, '방을 만드는 중...');
  try {
    role = 'host';
    const code = await setupNet(p).host((m) => lobbyBusy(true, m));
    startGame(p);
    showRoomBadge(code);
    hud.setStatus('상대를 기다리는 중...');
    setTimeout(() => hud.toast('방 코드(왼쪽 위)를 눌러 초대 링크를 보내요', 3500), 4800);
  } catch (err) {
    console.error(err);
    if (net) net.closed = true;
    net?.peer?.destroy();
    net = null;
    role = 'solo';
    lobbyBusy(false, `방을 만들지 못했어요. 인터넷 연결을 확인해주세요. (${err.type || err.message})`);
  }
};

$('btn-join').onclick = async () => {
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 4) return lobbyBusy(false, '4글자 방 코드를 입력해주세요');
  const p = profile();
  initAudio();
  lobbyBusy(true, '들어가는 중...');
  try {
    role = 'guest';
    await setupNet(p).join(code, (m) => lobbyBusy(true, m));
    startGame(p);
    showRoomBadge(code);
  } catch (err) {
    console.error(err);
    if (net) net.closed = true;
    net?.peer?.destroy();
    net = null;
    role = 'solo';
    lobbyBusy(false, err.message || `연결하지 못했어요 (${err.type})`);
  }
};

// 연결 진단은 주소 뒤에 ?debug=1 을 붙였을 때만 보여요 (일반 사용자에게는 숨김)
if (new URLSearchParams(location.search).get('debug') === '1') {
  $('btn-diag').classList.remove('hidden');
  $('btn-diag').onclick = () => openNetDiag();
  setupNetOverlay(loadNetCfg());
}

$('btn-solo').onclick = () => {
  role = 'solo';
  startGame(profile());
};

window.addEventListener('pagehide', () => net?.send({ t: 'bye' }));

// ---------------- 밤/낮 ----------------
function applyNight(on, send = true) {
  world.setNight(on);
  setNightMusic(on);
  if (hud) hud.nightBtn.textContent = on ? '☀️' : '🌙';
  if (send) net?.send({ t: 'night', on });
}
function toggleNight() {
  const on = world.nightTarget < 0.5;
  applyNight(on);
  hud.toast(on ? '🌙 밤이 되었어요! 하늘을 봐요, 불꽃놀이!' : '☀️ 낮이 되었어요');
}

// ---------------- 상호작용 ----------------
let currentInteract = null;
function updatePrompt() {
  if (!me || rides.mine || activity || hud.modalOpen) {
    hud.setPrompt(null);
    currentInteract = null;
    return;
  }
  let best = null;
  let bd = Infinity;
  let bestLabel = null;
  for (const it of world.interactables) {
    const d = Math.hypot(it.x - me.pos.x, it.z - me.pos.z);
    if (d > it.r || d > bd) continue;
    let label = it.label;
    if (typeof label === 'function') label = label();
    else if (typeof label === 'string') label = { text: label };
    if (!label) continue;
    best = it;
    bd = d;
    bestLabel = label;
  }
  currentInteract = best;
  hud.setPrompt(bestLabel);
}

function usePrompt() {
  const it = currentInteract;
  if (!it) return;
  sfx.click();
  if (it.kind === 'snack') {
    equipped.hand = it.item;
    saveItems();
    me.avatar.say(ITEMS[it.item].emoji, 2);
    hud.toast(`${ITEMS[it.item].emoji} ${ITEMS[it.item].name} 냠냠!`);
    return;
  }
  it.onUse?.();
}

function sitOnBench(b) {
  const seat = b.seats[role === 'guest' ? 1 : 0];
  me.sit = seat;
  me.pos.set(seat.x, 0, seat.z);
  me.yaw = seat.ry;
}

function makeDizzy(sec) {
  me.dizzy = sec;
  me.avatar.makeDizzy(sec);
  hud.toast('💫 어질어질~');
}

// ---------------- 이동 & 충돌 ----------------
const SPEED = 6;
const GRAVITY = 24;
const JUMP = 8.4;
const PR = 0.38;
const STEP = 0.55;

function insidePlatform(p, x, z) {
  if (p.r !== undefined) return Math.hypot(p.x - x, p.z - z) < p.r;
  const dx = x - p.x;
  const dz = z - p.z;
  const c = Math.cos(p.rot || 0);
  const s = Math.sin(p.rot || 0);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) < p.hw && Math.abs(lz) < p.hd;
}

function groundAt(x, z, y) {
  let g = 0;
  for (const p of world.platforms) if (y >= p.top - STEP && insidePlatform(p, x, z)) g = Math.max(g, p.top);
  return g;
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

function pushOutBox(pos, b) {
  const c = Math.cos(b.rot || 0);
  const s = Math.sin(b.rot || 0);
  const dx = pos.x - b.x;
  const dz = pos.z - b.z;
  let lx = dx * c - dz * s;
  let lz = dx * s + dz * c;
  const ex = b.hw + PR;
  const ez = b.hd + PR;
  if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) return;
  const px = ex - Math.abs(lx);
  const pz = ez - Math.abs(lz);
  if (px < pz) lx = Math.sign(lx || 1) * ex;
  else lz = Math.sign(lz || 1) * ez;
  pos.x = b.x + lx * c + lz * s;
  pos.z = b.z - lx * s + lz * c;
}

function resolveCollisions(pos) {
  for (const c of world.colliders) {
    if (Math.abs(c.x - pos.x) > c.r + 1 || Math.abs(c.z - pos.z) > c.r + 1) continue;
    pushOut(pos, c.x, c.z, c.r + PR);
  }
  for (const b of world.boxes) {
    const ext = Math.max(b.hw, b.hd) + 2;
    if (Math.abs(b.x - pos.x) > ext || Math.abs(b.z - pos.z) > ext) continue;
    pushOutBox(pos, b);
  }
  const d = Math.hypot(pos.x, pos.z);
  if (d > L.WALK_R) {
    pos.x *= L.WALK_R / d;
    pos.z *= L.WALK_R / d;
  }
}

function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function updateWalk(dt) {
  const input = controls.getMove();
  const yaw = controls.camYaw;
  const fx_ = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  let dx = fx_ * input.y + rx * input.x;
  let dz = fz * input.y + rz * input.x;
  let mag = Math.min(1, Math.hypot(dx, dz));

  if (me.sit) {
    if (mag > 0.2 || controls.jumpQueued) {
      me.sit = null;
    } else {
      me.avatar.root.position.set(me.sit.x, me.sit.y - 0.25, me.sit.z);
      me.avatar.root.rotation.set(0, me.sit.ry, 0);
      me.avatar.update(dt, 0, true, 'sit');
      me.speed = 0;
      me.pos.set(me.sit.x, me.sit.y - 0.25, me.sit.z);
      return;
    }
  }
  if (me.dizzy > 0) {
    me.dizzy -= dt;
    const w = Math.sin(performance.now() / 260) * 0.9 * Math.min(1, me.dizzy);
    const c = Math.cos(w);
    const s = Math.sin(w);
    [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
    mag *= 0.75;
  }

  me.pos.x += dx * SPEED * dt;
  me.pos.z += dz * SPEED * dt;
  if (mag > 0.05) me.yaw = angleLerp(me.yaw, Math.atan2(dx, dz), Math.min(1, dt * 14));

  if (controls.consumeJump() && me.grounded) {
    me.velY = JUMP;
    me.grounded = false;
  }
  me.velY -= GRAVITY * dt;
  me.pos.y += me.velY * dt;
  resolveCollisions(me.pos);
  const ground = groundAt(me.pos.x, me.pos.z, me.pos.y);
  if (me.pos.y <= ground) {
    if (!me.grounded && me.velY < -4) me.avatar.land();
    me.pos.y = ground;
    me.velY = 0;
    me.grounded = true;
  } else if (me.pos.y > ground + 0.05) me.grounded = false;

  me.avatar.root.position.copy(me.pos);
  me.avatar.root.rotation.set(0, me.yaw, 0);
  me.avatar.update(dt, mag, me.grounded, 'stand');
  me.speed = mag;
}

function updatePartner(dt) {
  if (!partner || partner.onRide) return;
  const root = partner.avatar.root;
  if (partner.fresh) {
    root.position.copy(partner.target);
    partner.fresh = false;
  }
  root.position.lerp(partner.target, Math.min(1, dt * 12));
  root.rotation.set(0, angleLerp(root.rotation.y, partner.targetYaw, Math.min(1, dt * 12)), 0);
  partner.avatar.update(dt, partner.speed, partner.grounded, partner.pose === 'sit' ? 'sit' : 'stand');
}

function checkPartnerAlive() {
  if (partner && performance.now() - partner.lastSeen > 6000) {
    hud.toast(`${partner.info?.name ?? '상대'} 님이 잠깐 자리를 비웠어요`);
    removePartner();
    if (net?.connected) hud.setStatus('상대 응답 기다리는 중...');
  }
}

// ---------------- 카메라 ----------------
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3(0, 30, 90);
const _v = new THREE.Vector3();
const _shake = new THREE.Vector3();

function updateCamera(dt, t) {
  if (!me) {
    const a = t * 0.05;
    camera.position.set(Math.sin(a) * 95, 42, Math.cos(a) * 95);
    camera.lookAt(0, 6, -10);
    if (camera.fov !== baseFov) {
      camera.fov = baseFov;
      camera.updateProjectionMatrix();
    }
    return;
  }
  let fov = baseFov;
  if (activity) {
    const { pos, target } = activity.camPose();
    camPos.lerp(pos, 1 - Math.exp(-6 * dt));
    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    fov = 72;
  } else if (rides.applyCamera(camera, dt, t)) {
    camPos.copy(camera.position);
    camTarget.copy(me.pos).setY(me.pos.y + 1.2);
    fov = baseFov + rides.fovBoost;
  } else {
    const dist = controls.camDist;
    const { camYaw, camPitch } = controls;
    camTarget.lerp(_v.set(me.pos.x, me.pos.y + 1.2, me.pos.z), 1 - Math.exp(-10 * dt));
    const desired = _v.set(
      camTarget.x + Math.sin(camYaw) * Math.cos(camPitch) * dist,
      camTarget.y + Math.sin(camPitch) * dist,
      camTarget.z + Math.cos(camYaw) * Math.cos(camPitch) * dist,
    );
    desired.y = Math.max(desired.y, groundAt(desired.x, desired.z, 99) + 0.5);
    camPos.lerp(desired, 1 - Math.exp(-12 * dt));
    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(camTarget);
    if (me.dizzy > 0) camera.rotateZ(Math.sin(performance.now() / 300) * 0.08 * Math.min(1, me.dizzy));
  }
  camera.position.add(fx.shakeOffset(_shake));
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

// ---------------- 네트워크 송신 ----------------
let sendAcc = 0;
const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
function sendState(dt) {
  if (!net?.connected || !me) return;
  sendAcc += dt;
  if (sendAcc < 1 / 15) return;
  sendAcc = 0;
  const r2 = (v) => Math.round(v * 100) / 100;
  let yaw = me.yaw;
  const root = me.avatar.root;
  if (rides.mine) {
    root.getWorldQuaternion(_q);
    _fwd.set(0, 0, 1).applyQuaternion(_q);
    yaw = Math.atan2(_fwd.x, _fwd.z);
  }
  net.send({
    t: 's',
    x: r2(root.position.x),
    y: r2(root.position.y),
    z: r2(root.position.z),
    r: r2(yaw),
    m: r2(me.speed),
    g: me.grounded ? 1 : 0,
    p: me.sit ? 'sit' : 'stand',
    rd: rides.mine ? rides.mine.ride.id : '',
    st: rides.mine ? rides.mine.seat : 0,
    h: rides.handsUp ? 1 : 0,
  });
}

// ---------------- 사진 ----------------
function loadPhotos() {
  try {
    return JSON.parse(localStorage.getItem('dulisum-photos') || '[]');
  } catch {
    return [];
  }
}
function savePhotos() {
  while (photos.length > 9) photos.shift();
  for (let i = 0; i < 4; i++) {
    try {
      localStorage.setItem('dulisum-photos', JSON.stringify(photos));
      return;
    } catch {
      photos.shift();
    }
  }
}

const photoCam = new THREE.PerspectiveCamera(55, 0.75, 0.1, 600);
function capture(pos, target, caption) {
  photoCam.aspect = canvas.width / canvas.height;
  photoCam.fov = 55;
  photoCam.position.copy(pos);
  photoCam.up.set(0, 1, 0);
  photoCam.lookAt(target);
  photoCam.updateProjectionMatrix();
  const fp = me.avatar.firstPerson;
  if (fp) me.avatar.setFirstPerson(false);
  renderer.render(scene, photoCam);
  const src = renderer.domElement;
  const out = document.createElement('canvas');
  out.width = 600;
  out.height = 800;
  const g = out.getContext('2d');
  const sw = src.width;
  const sh = src.height;
  let cw = sw;
  let ch = sh;
  if (sw / sh > 0.75) cw = sh * 0.75;
  else ch = sw / 0.75;
  g.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, 600, 800);
  if (fp) me.avatar.setFirstPerson(true);
  const date = new Date();
  const ds = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const photo = { src: out.toDataURL('image/jpeg', 0.82), caption: `${caption} · ${ds}` };
  photos.push(photo);
  savePhotos();
  fx.flash = 0.7;
  sfx.shutter();
  return photo;
}

function takeSelfie() {
  pendingPhoto = { selfie: true };
}

function processPhoto(t) {
  if (!pendingPhoto) return;
  const req = pendingPhoto;
  pendingPhoto = null;
  if (req.ride) {
    const cam = req.ride.photoCam?.(t);
    if (!cam) return;
    capture(cam.pos, cam.target, `${req.ride.icon} ${req.ride.name}`);
    hud.toast('📸 찰칵! 탑승 사진은 🖼️ 앨범에 있어요');
    return;
  }
  const head = me.avatar.root.position.clone().add(new THREE.Vector3(0, 1.2, 0));
  let center = head.clone();
  let dist = 3.4;
  if (partner && partner.avatar.root.position.distanceTo(me.avatar.root.position) < 7) {
    center = head.clone().add(partner.avatar.root.position.clone().add(new THREE.Vector3(0, 1.2, 0))).multiplyScalar(0.5);
    dist = 3.4 + partner.avatar.root.position.distanceTo(me.avatar.root.position) * 0.6;
  }
  const fwd = new THREE.Vector3(Math.sin(me.yaw), 0, Math.cos(me.yaw));
  if (rides.mine) fwd.set(0, 0, 1).applyQuaternion(me.avatar.root.quaternion);
  const pos = center.clone().addScaledVector(fwd, dist).add(new THREE.Vector3(0, 0.5, 0));
  me.avatar.emote('heart');
  net?.send({ t: 'emote', e: 'heart' });
  const photo = capture(pos, center, partner ? '💕 둘이서' : '📸 셀카');
  showPhoto(photo);
}

function showPhoto(photo) {
  const img = h('img', { class: 'photo', src: photo.src });
  const link = h('a', { class: 'btn primary', href: photo.src, download: `dulisum-${Date.now()}.jpg`, style: 'text-align:center;text-decoration:none' }, '저장하기');
  hud.openModal('📸 찰칵!', h('div', { class: 'polaroid' }, img, h('div', { class: 'cap' }, photo.caption)), h('div', { class: 'row' }, link), h('p', { class: 'hint' }, '아이폰은 사진을 꾹 눌러서 저장할 수 있어요'));
}

function openAlbum() {
  if (!photos.length) {
    hud.openModal('🖼️ 앨범', h('p', { class: 'hint' }, '아직 사진이 없어요. 📸 버튼을 누르거나 놀이기구를 타면 사진이 찍혀요!'));
    return;
  }
  const grid = h('div', { class: 'album' });
  [...photos].reverse().forEach((p) => grid.append(h('img', { src: p.src, onclick: () => showPhoto(p) })));
  hud.openModal('🖼️ 앨범', grid);
}

// ---------------- 지도 ----------------
function destinations() {
  const list = [];
  for (const r of rides.list()) if (r.board) list.push({ icon: r.icon, name: r.name, x: r.board.x, z: r.board.z });
  for (const st of rides.byId.train.stations) list.push({ icon: '🚉', name: st.name, x: st.board.x, z: st.board.z, small: true });
  for (const g of games) list.push({ icon: g.icon, name: g.name, x: g.standPos.x, z: g.standPos.z });
  list.push({ icon: '🎁', name: '선물 가게', x: L.SPOTS.shop.x + 4, z: L.SPOTS.shop.z });
  list.push({ icon: '⛲', name: '분수 광장', x: L.PLAZA.x, z: L.PLAZA.z + 7 });
  list.push({ icon: '🏰', name: '정문', x: L.SPAWN.x, z: L.SPAWN.z });
  return list;
}

function teleport(d) {
  if (rides.mine) return hud.toast('놀이기구에서 내린 다음에 이동할 수 있어요');
  hud.closeModal();
  hud.fade(() => {
    me.sit = null;
    me.pos.set(d.x, 0, d.z);
    resolveCollisions(me.pos);
    const toCenter = Math.atan2(-d.x, -d.z);
    me.yaw = toCenter + Math.PI;
    controls.camYaw = me.yaw + Math.PI;
    camTarget.set(me.pos.x, 1.2, me.pos.z);
    camPos.set(me.pos.x - Math.sin(me.yaw) * 7, 4, me.pos.z - Math.cos(me.yaw) * 7);
  });
}

function openMap() {
  const size = 720;
  const cv = h('canvas', { width: size, height: size });
  const g = cv.getContext('2d');
  const S = size / 2 / (L.ISLAND_R + 10);
  const X = (x) => size / 2 + x * S;
  const Y = (z) => size / 2 + z * S;
  g.fillStyle = '#bfe6ff';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#ffe7b0';
  g.beginPath();
  g.arc(size / 2, size / 2, (L.ISLAND_R + 8) * S, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#a9e59a';
  g.beginPath();
  g.arc(size / 2, size / 2, L.ISLAND_R * S, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#8f7fb8';
  g.lineWidth = 3;
  g.setLineDash([8, 6]);
  g.beginPath();
  g.arc(size / 2, size / 2, L.TRAIN_R * S, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = '#f6dfc2';
  g.lineCap = 'round';
  g.lineWidth = 4.6 * S;
  for (const p of world.paths) {
    g.beginPath();
    g.moveTo(X(p.ax), Y(p.az));
    g.lineTo(X(p.bx), Y(p.bz));
    g.stroke();
  }
  g.fillStyle = '#fbe7ef';
  g.beginPath();
  g.arc(X(L.PLAZA.x), Y(L.PLAZA.z), L.PLAZA.r * S, 0, Math.PI * 2);
  g.fill();
  const dests = destinations();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const d of dests) {
    g.font = `${d.small ? 26 : 38}px sans-serif`;
    g.fillText(d.icon, X(d.x), Y(d.z));
  }
  const dot = (p, color, label) => {
    g.fillStyle = color;
    g.strokeStyle = '#fff';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(X(p.x), Y(p.z), 12, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.font = '900 22px sans-serif';
    g.fillStyle = '#5a4a5e';
    g.fillText(label, X(p.x), Y(p.z) - 26);
  };
  if (partner) dot(partner.avatar.root.position, '#' + new THREE.Color(partner.avatar.color).getHexString(), partner.avatar.name);
  dot(me.avatar.root.position, '#' + new THREE.Color(me.avatar.color).getHexString(), '나');
  cv.addEventListener('click', (e) => {
    const rect = cv.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * size;
    const py = ((e.clientY - rect.top) / rect.height) * size;
    let best = null;
    let bd = 50;
    for (const d of dests) {
      const dd = Math.hypot(X(d.x) - px, Y(d.z) - py);
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    if (best) teleport(best);
  });
  const list = h('div', { class: 'list' });
  for (const d of dests) if (!d.small) list.append(h('button', { onclick: () => teleport(d) }, `${d.icon} ${d.name}`));
  if (partner) {
    list.prepend(
      h(
        'button',
        {
          style: 'background:#ff8fb4;color:#fff',
          onclick: () => {
            const p = partner.avatar.root.position;
            teleport({ x: p.x + 1.5, z: p.z + 1.5 });
          },
        },
        `💕 ${partner.avatar.name} 옆으로`,
      ),
    );
  }
  hud.openModal('🗺️ 둘이랜드 지도', h('div', { class: 'mapwrap' }, cv), h('p', { class: 'hint' }, '아이콘을 누르면 바로 이동해요'), list);
}

// ---------------- 가방 & 가게 ----------------
function itemCard(id, { shop }) {
  const it = ITEMS[id];
  const has = owned.has(id) || it.snack;
  const on = equipped[it.slot] === id;
  const label = shop ? (owned.has(id) ? (on ? '착용 중' : '착용하기') : `🎟️ ${it.price}`) : on ? '착용 중' : '착용하기';
  const card = h('div', { class: `item ${on ? 'on' : ''} ${shop && !has && tickets < it.price ? 'locked' : ''}` }, h('span', { class: 'emoji' }, it.emoji), it.name, h('br'), label);
  card.onclick = () => {
    if (shop && !owned.has(id)) {
      if (tickets < it.price) {
        hud.toast(`🎟️ 티켓이 ${it.price - tickets}장 부족해요. 게임 부스에서 모아봐요!`);
        return;
      }
      tickets -= it.price;
      localStorage.setItem('dulisum-tickets', String(tickets));
      hud.setTickets(tickets);
      owned.add(id);
      equipped[it.slot] = id;
      saveItems();
      sfx.fanfare();
      me.avatar.say(it.emoji, 2);
      hud.toast(`${it.emoji} ${it.name} 샀어요!`);
    } else {
      equip(id);
      sfx.click();
    }
    if (shop) openShop();
    else openBag();
  };
  return card;
}

function openShop() {
  const grid = h('div', { class: 'grid' });
  for (const id of Object.keys(ITEMS)) if (!ITEMS[id].snack) grid.append(itemCard(id, { shop: true }));
  hud.openModal(`🎁 선물 가게 · 🎟️ ${tickets}`, grid, h('p', { class: 'hint' }, '티켓은 🎈 풍선 다트, 🔨 두더지 콩콩에서 모을 수 있어요'));
}

function openBag() {
  const grid = h('div', { class: 'grid' });
  const mine = [...owned];
  if (equipped.hand && ITEMS[equipped.hand]?.snack) mine.push(equipped.hand);
  if (!mine.length) {
    hud.openModal('🎒 가방', h('p', { class: 'hint' }, '아직 아이템이 없어요. 🎁 선물 가게에서 티켓으로 사거나, 간식 수레에서 간식을 받아봐요!'));
    return;
  }
  for (const id of mine) grid.append(itemCard(id, { shop: false }));
  hud.openModal('🎒 가방', grid, h('p', { class: 'hint' }, '누르면 착용하거나 벗어요'));
}

// ---------------- 음악 ----------------
function updateMusic() {
  const car = rides.byId.carousel.group.position;
  const d = Math.hypot(car.x - me.pos.x, car.z - me.pos.z);
  let level = 0.18 + Math.max(0, 1 - d / 25) * 0.3;
  const r = rides.mine?.ride;
  if (r && ['coaster', 'drop', 'pirate', 'flume', 'swing'].includes(r.id)) level = 0.08;
  if (r?.id === 'haunted') level = 0.03;
  if (r?.id === 'carousel') level = 0.5;
  setMusicLevel(level);
  if (!r) setWind(0);
}

// ---------------- 성능: 느리면 해상도 낮추기 ----------------
let slowTime = 0;
function adaptQuality(dt) {
  if (window.__noAdapt) return;
  if (dt > 1 / 40) slowTime += dt;
  else slowTime = Math.max(0, slowTime - dt * 0.5);
  if (slowTime > 3 && pixelRatio > 1) {
    pixelRatio = Math.max(1, pixelRatio - 0.25);
    renderer.setPixelRatio(pixelRatio);
    resize();
    slowTime = 0;
  } else if (slowTime > 4 && world.sun.castShadow) {
    // 그래도 느리면 그림자 끄기
    world.sun.castShadow = false;
    slowTime = 0;
  }
}

// ---------------- 루프 ----------------
let frameNo = 0;
const timer = new THREE.Timer();
timer.connect(document);
function frame(nowMs) {
  timer.update(nowMs);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  const t = parkNow();
  world.update(dt, t, me?.pos);
  if (me) {
    if (!rides.mine && !activity) updateWalk(dt);
    else if (activity) {
      me.avatar.root.position.copy(me.pos);
      me.avatar.root.rotation.set(0, me.yaw, 0);
      me.avatar.update(dt, 0, true, 'stand');
    }
    rides.update(dt, t);
    for (const g of games) g.update(dt, t);
    updatePartner(dt);
    checkPartnerAlive();
    updatePrompt();
    sendState(dt);
    controls.relaxLook(dt);
    updateMusic();
    if (!rides.mine) {
      fx.lines = damp(fx.lines, 0, 5, dt);
      fx.dark = damp(fx.dark, 0, 5, dt);
    }
  } else {
    rides.update(dt, t);
    for (const g of games) g.update(dt, t);
  }
  updateCamera(dt, t);
  window.__game?.camOverride?.(camera, t, dt);
  fx.update(dt);
  if (me) processPhoto(t);
  frameNo++;
  if (frameNo % 2 === 0) renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  adaptQuality(dt);
  requestAnimationFrame(frame);
}
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
  rides,
  world,
  games,
  controls: () => controls,
  camera,
  renderer,
  inject: (msg) => handleMessage(msg, { name: me?.avatar.name, color: me?.avatar.color }),
  setPixelRatio: (r) => {
    pixelRatio = r;
    renderer.setPixelRatio(r);
    resize();
  },
  fx,
  get partnerObj() {
    return partner;
  },
  equipped,
  teleport: (x, z) => {
    me.pos.set(x, 0, z);
  },
};
