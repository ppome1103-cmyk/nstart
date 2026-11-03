// 연결 진단: 어떤 중계 서버를 쓰는지, 어느 단계에서 막히는지 기록하고 보여줘요.
/* global __PEERJS_VERSION__ */

export const PEERJS_VERSION = typeof __PEERJS_VERSION__ !== 'undefined' ? __PEERJS_VERSION__ : '?';

// PeerJS 1.5.5 기본 설정과 같은 값 (공용 STUN + 공용 TURN)
export const PEERJS_DEFAULT_ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
];

const KEY = 'dulisum-netcfg';
const DEFAULTS = { policy: 'all', turn: 'peerjs', urls: '', username: '', credential: '', showLog: false };

function safeGet() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveCfg(cfg) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* 저장 안 되는 브라우저 */
  }
}

// 설정 읽기: 저장된 값 → 링크로 받은 값(#netcfg=) → 주소 옵션(?relay=1, ?debug=1) 순서로 덮어써요.
export function loadCfg() {
  const cfg = { ...DEFAULTS, ...safeGet() };
  const m = location.hash.match(/netcfg=([^&]+)/);
  if (m) {
    try {
      Object.assign(cfg, JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))));
      saveCfg(cfg);
      history.replaceState(null, '', location.pathname + location.search);
    } catch {
      /* 잘못된 링크 */
    }
  }
  const q = new URLSearchParams(location.search);
  if (q.get('relay') === '1') cfg.policy = 'relay';
  if (q.get('debug') === '1') cfg.showLog = true;
  return cfg;
}

export function shareLink(cfg) {
  const json = JSON.stringify({ policy: cfg.policy, turn: cfg.turn, urls: cfg.urls, username: cfg.username, credential: cfg.credential, showLog: true });
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return `${location.origin}${location.pathname}#netcfg=${encodeURIComponent(b64)}`;
}

function parseUrls(text) {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^(stun|turn|turns):/.test(s));
}

export function iceServers(cfg) {
  if (cfg.turn === 'custom') {
    const urls = parseUrls(cfg.urls);
    if (urls.length) return [{ urls: 'stun:stun.l.google.com:19302' }, { urls, username: cfg.username, credential: cfg.credential }];
  }
  return PEERJS_DEFAULT_ICE;
}

export function rtcConfig(cfg) {
  return {
    iceServers: iceServers(cfg),
    iceTransportPolicy: cfg.policy === 'relay' ? 'relay' : 'all',
    sdpSemantics: 'unified-plan',
  };
}

export function describeCfg(cfg) {
  const lines = [`PeerJS ${PEERJS_VERSION}`, `연결 방식: ${cfg.policy === 'relay' ? '중계 서버만 (relay)' : '자동 (직접 연결 우선, 안 되면 중계)'}`];
  for (const s of iceServers(cfg)) {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    for (const u of urls) lines.push(`  ${u}${s.username ? ` (아이디 ${s.username.slice(0, 3)}…)` : ''}`);
  }
  const has443 = iceServers(cfg).some((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => /^turns:.*:443/.test(u) || /:443\?transport=tcp/.test(u)));
  lines.push(has443 ? 'TLS 443 경로: 있음' : 'TLS 443 경로: 없음');
  return lines.join('\n');
}

// ---------------- 로그 ----------------
const t0 = performance.now();
export const diag = {
  lines: [],
  listeners: new Set(),
  sent: 0,
  recv: 0,
  rtt: null,
  route: '',
  log(msg) {
    const s = ((performance.now() - t0) / 1000).toFixed(1).padStart(6);
    const line = `${s}s  ${msg}`;
    this.lines.push(line);
    if (this.lines.length > 300) this.lines.shift();
    console.log('[diag]', msg);
    for (const fn of this.listeners) fn(line);
  },
  text() {
    return [describeCfg(loadCfg()), `브라우저: ${navigator.userAgent}`, '', ...this.lines].join('\n');
  },
};

// 후보 문자열에서 종류만 뽑기 (IP 주소는 기록하지 않아요)
function candInfo(c) {
  const parts = (c.candidate || '').split(' ');
  const typ = parts[parts.indexOf('typ') + 1] || '?';
  const proto = (parts[2] || '').toLowerCase();
  return { typ, proto, url: c.url || '' };
}

// PeerJS 연결 안의 RTCPeerConnection에 귀를 대고 단계별로 기록
export function watchPeerConnection(conn, label) {
  const started = performance.now();
  let tries = 0;
  const attach = () => {
    const pc = conn.peerConnection;
    if (!pc) {
      if (tries++ < 40) setTimeout(attach, 50);
      else diag.log(`③ ${label}: WebRTC 연결 객체를 못 찾음`);
      return;
    }
    const counts = {};
    diag.log(`③ ${label}: WebRTC 시작 (방식 ${pc.getConfiguration?.().iceTransportPolicy || '?'})`);
    pc.addEventListener('icecandidate', (e) => {
      if (!e.candidate) {
        const summary = Object.entries(counts)
          .map(([k, v]) => `${k} ${v}`)
          .join(', ');
        diag.log(`③ 내 쪽 후보 수집 끝: ${summary || '없음 (중계 서버에 못 닿음)'}`);
        return;
      }
      const { typ, proto, url } = candInfo(e.candidate);
      const key = `${typ}/${proto}`;
      counts[key] = (counts[key] || 0) + 1;
      if (typ === 'relay') diag.log(`③ 중계 후보 받음: ${proto}${url ? ` via ${url}` : ''}`);
    });
    pc.addEventListener('icecandidateerror', (e) => {
      if (e.errorCode === 701 && /^stun:/.test(e.url || '')) return; // STUN 조회 실패는 잡음이라 생략
      diag.log(`③ 중계/STUN 서버 오류: ${e.url || '?'} → ${e.errorCode} ${e.errorText || ''}`);
    });
    pc.addEventListener('iceconnectionstatechange', () => {
      diag.log(`④ ICE 상태: ${pc.iceConnectionState} (${((performance.now() - started) / 1000).toFixed(1)}초)`);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') reportRoute(pc);
      if (pc.iceConnectionState === 'failed') diag.log('④ WebRTC 연결 실패: 서로 닿는 경로를 못 찾았어요');
    });
    pc.addEventListener('connectionstatechange', () => diag.log(`④ 연결 상태: ${pc.connectionState}`));
  };
  attach();
}

async function reportRoute(pc) {
  try {
    const stats = await pc.getStats();
    let pair = null;
    stats.forEach((r) => {
      if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId);
    });
    if (!pair) {
      stats.forEach((r) => {
        if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) pair = r;
      });
    }
    if (!pair) return diag.log('④ 연결 경로: 확인 못 함');
    const l = stats.get(pair.localCandidateId) || {};
    const r = stats.get(pair.remoteCandidateId) || {};
    const lt = `${l.candidateType || '?'}/${l.protocol || '?'}${l.relayProtocol ? ` (중계 ${l.relayProtocol})` : ''}${l.url ? ` ${l.url}` : ''}`;
    const rt = `${r.candidateType || '?'}/${r.protocol || '?'}`;
    const ms = pair.currentRoundTripTime != null ? `, 왕복 ${Math.round(pair.currentRoundTripTime * 1000)}ms` : '';
    const relay = l.candidateType === 'relay' || r.candidateType === 'relay';
    diag.route = relay ? '중계 서버 경유' : '직접 연결';
    diag.log(`④ 연결 경로: ${diag.route} · 내 쪽 ${lt} ↔ 상대 쪽 ${rt}${ms}`);
  } catch (e) {
    diag.log(`④ 연결 경로 확인 실패: ${e.message}`);
  }
}

// ---------------- 화면 ----------------
const css = `
#diag-panel { position: fixed; inset: 0; z-index: 40; background: rgba(60,40,70,.4); display: flex; align-items: center; justify-content: center; padding: 12px; }
#diag-panel .box { width: 100%; max-width: 440px; max-height: 92vh; overflow: auto; background: #fffaf5; border-radius: 22px; padding: 16px; font-size: 13px; color: #5a4a5e; box-shadow: 0 8px 30px rgba(0,0,0,.25); }
#diag-panel h3 { margin: 0 0 8px; color: #ff6f9f; font-size: 18px; }
#diag-panel fieldset { border: 2px solid #ffe0ea; border-radius: 14px; margin: 8px 0; padding: 8px 10px; }
#diag-panel legend { font-weight: 800; padding: 0 4px; }
#diag-panel label { display: block; margin: 4px 0; }
#diag-panel input[type=text], #diag-panel input[type=password], #diag-panel textarea { width: 100%; font: inherit; font-size: 13px; padding: 7px 9px; border-radius: 10px; border: 2px solid #ffe0ea; box-sizing: border-box; }
#diag-panel textarea { min-height: 58px; }
#diag-panel pre { white-space: pre-wrap; word-break: break-all; background: #2b2433; color: #e8f6ff; border-radius: 12px; padding: 8px; font-size: 11px; max-height: 34vh; overflow: auto; margin: 6px 0 0; }
#diag-panel .row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
#diag-panel .row button { flex: 1; font: inherit; font-weight: 800; border: none; border-radius: 12px; padding: 10px 8px; background: #fff; box-shadow: 0 3px 0 #f3c6d6; color: #ff6f9f; }
#diag-panel .row button.primary { background: #ff8fb4; color: #fff; box-shadow: 0 3px 0 #e06a93; }
#diag-overlay { position: fixed; left: 8px; right: 8px; top: calc(env(safe-area-inset-top) + 96px); max-height: 30vh; overflow: hidden; z-index: 30; pointer-events: none; font: 10px/1.35 ui-monospace, Menlo, monospace; color: #fff; background: rgba(30,20,40,.62); border-radius: 10px; padding: 6px 8px; white-space: pre-wrap; word-break: break-all; }
`;

let overlay = null;
export function setupOverlay(cfg) {
  if (!cfg.showLog || overlay) return;
  overlay = document.createElement('div');
  overlay.id = 'diag-overlay';
  document.body.appendChild(overlay);
  const render = () => {
    const head = `${diag.route || '연결 전'} · 보냄 ${diag.sent} / 받음 ${diag.recv}${diag.rtt != null ? ` · 왕복 ${diag.rtt}ms` : ''}`;
    overlay.textContent = [head, ...diag.lines.slice(-9)].join('\n');
  };
  diag.listeners.add(render);
  setInterval(render, 1000);
  render();
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'checked') e.checked = v;
    else e.setAttribute(k, v);
  }
  for (const k of kids) e.append(k);
  return e;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
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

export function openPanel() {
  if (!document.getElementById('diag-style')) {
    const st = document.createElement('style');
    st.id = 'diag-style';
    st.textContent = css;
    document.head.appendChild(st);
  }
  document.getElementById('diag-panel')?.remove();
  const cfg = loadCfg();
  const radio = (name, value, text) => el('label', {}, el('input', { type: 'radio', name, value, checked: cfg[name] === value }), ` ${text}`);
  const urls = el('textarea', { placeholder: 'turns:서버주소:443?transport=tcp\nturn:서버주소:3478' });
  urls.value = cfg.urls;
  const user = el('input', { type: 'text', placeholder: '아이디 (username)', autocomplete: 'off' });
  user.value = cfg.username;
  const pass = el('input', { type: 'password', placeholder: '비밀번호 (credential)', autocomplete: 'off' });
  pass.value = cfg.credential;
  const show = el('input', { type: 'checkbox', checked: cfg.showLog });
  const info = el('pre', {}, describeCfg(cfg));
  const log = el('pre', {}, diag.lines.join('\n') || '(아직 기록 없음)');
  const msg = el('div', { style: 'margin-top:6px;font-weight:800;color:#e0668f;min-height:1.2em' });
  const read = () => {
    const box = panel.querySelector('.box');
    return {
      policy: box.querySelector('input[name=policy]:checked').value,
      turn: box.querySelector('input[name=turn]:checked').value,
      urls: urls.value.trim(),
      username: user.value.trim(),
      credential: pass.value,
      showLog: show.checked,
    };
  };
  const panel = el(
    'div',
    { id: 'diag-panel', onclick: (e) => e.target.id === 'diag-panel' && panel.remove() },
    el(
      'div',
      { class: 'box' },
      el('h3', {}, '🔧 연결 진단'),
      el('div', {}, '설정을 바꾸면 저장 후 방을 새로 만들거나 다시 참가해야 적용돼요. 두 폰 모두 같은 설정으로 맞춰주세요.'),
      el('fieldset', {}, el('legend', {}, '연결 방식'), radio('policy', 'all', '자동 (직접 연결 먼저, 안 되면 중계)'), radio('policy', 'relay', '중계 서버만 (relay) — 중계 서버 시험용')),
      el('fieldset', {}, el('legend', {}, '중계 서버 (TURN)'), radio('turn', 'peerjs', 'PeerJS 공용 (기본값)'), radio('turn', 'custom', '직접 입력'), urls, user, pass),
      el('label', {}, show, ' 게임 화면에 로그 표시'),
      el(
        'div',
        { class: 'row' },
        el('button', {
          class: 'primary',
          onclick: () => {
            const c = read();
            saveCfg(c);
            info.textContent = describeCfg(c);
            msg.textContent = '저장했어요. 새로고침하면 적용돼요.';
          },
        }, '저장'),
        el('button', {
          onclick: async () => {
            const c = read();
            saveCfg(c);
            msg.textContent = (await copy(shareLink(c))) ? '설정 링크를 복사했어요. 상대 폰에서 열면 같은 설정이 돼요 (비밀번호 포함, 둘만 보세요).' : '복사 못 했어요';
          },
        }, '설정 링크 복사'),
      ),
      el(
        'div',
        { class: 'row' },
        el('button', { onclick: async () => (msg.textContent = (await copy(diag.text())) ? '로그를 복사했어요. 그대로 붙여넣어 보내주세요.' : '복사 못 했어요') }, '로그 복사'),
        el('button', { onclick: () => location.reload() }, '새로고침'),
        el('button', { onclick: () => panel.remove() }, '닫기'),
      ),
      msg,
      el('div', { style: 'margin-top:8px;font-weight:800' }, '현재 설정'),
      info,
      el('div', { style: 'margin-top:8px;font-weight:800' }, '연결 기록'),
      log,
    ),
  );
  const update = () => {
    log.textContent = diag.lines.join('\n');
    log.scrollTop = log.scrollHeight;
  };
  diag.listeners.add(update);
  document.body.appendChild(panel);
  update();
}
