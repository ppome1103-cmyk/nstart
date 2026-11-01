import Peer from 'peerjs';

// PeerJS(WebRTC)로 폰끼리 직접 연결해요.
// 한 명이 방을 만들면 4글자 코드가 나오고, 다른 한 명이 그 코드로 들어와요.
const PREFIX = 'dulisum-nstart-v1-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 O/0, I/1 제외

const SERVER_TIMEOUT = 12000; // 연결 서버 접속 제한 시간
const CONNECT_TIMEOUT = 15000; // 상대 폰과 직접 연결 제한 시간
const JOIN_TRIES = 4; // 방을 못 찾을 때 다시 시도하는 횟수

function randomCode(len = 4) {
  let c = '';
  for (let i = 0; i < len; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return c;
}

// 테스트용: ?peerHost=localhost&peerPort=9000 으로 직접 띄운 PeerJS 서버를 쓸 수 있어요.
function peerOptions() {
  const q = new URLSearchParams(location.search);
  const opts = { debug: 1 };
  if (q.get('peerHost')) {
    opts.host = q.get('peerHost');
    opts.port = Number(q.get('peerPort') || 9000);
    opts.path = q.get('peerPath') || '/';
    opts.secure = q.get('peerSecure') === '1';
  }
  return opts;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

class NetError extends Error {
  constructor(message, type) {
    super(message);
    this.type = type;
  }
}

// 연결 서버에 접속될 때까지 기다리기 (제한 시간 있음)
function openPeer(id) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(id, peerOptions());
    const timer = setTimeout(() => {
      peer.destroy();
      reject(new NetError('연결 서버에 접속하지 못했어요. 인터넷 연결을 확인해주세요.', 'server-timeout'));
    }, SERVER_TIMEOUT);
    const onError = (err) => {
      clearTimeout(timer);
      peer.destroy();
      reject(err);
    };
    peer.once('open', () => {
      clearTimeout(timer);
      peer.off('error', onError);
      resolve(peer);
    });
    peer.once('error', onError);
  });
}

export class Net {
  constructor({ onConnect, onDisconnect, onMessage, onStatus }) {
    this.onConnect = onConnect;
    this.onDisconnect = onDisconnect;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.peer = null;
    this.conn = null;
    this.code = null;
    this.isHost = false;
    this.closed = false;
    this.retrying = false;
    this.pendingConn = null;

    // 폰에서 다른 앱(카톡 등)에 갔다 오면 연결 서버 접속이 끊겨 있을 수 있어요.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this._revive();
    });
  }

  get connected() {
    return !!(this.conn && this.conn.open);
  }

  // ---------------- 방 만들기 ----------------
  async host(onProgress) {
    this.isHost = true;
    onProgress?.('연결 서버에 접속하는 중...');
    for (let i = 0; i < 5; i++) {
      const code = randomCode();
      try {
        const peer = await openPeer(PREFIX + code);
        this.code = code;
        this._attachPeer(peer);
        return code;
      } catch (err) {
        if (err.type !== 'unavailable-id') throw err;
        // 코드가 겹치면 새 코드로 다시
      }
    }
    throw new NetError('방을 만들지 못했어요. 다시 시도해주세요.', 'unavailable-id');
  }

  // ---------------- 참가하기 ----------------
  async join(code, onProgress) {
    this.isHost = false;
    this.code = code.toUpperCase();
    onProgress?.('연결 서버에 접속하는 중...');
    // 서버에서 ID를 받아오지 않고 직접 만들어서 접속 (방 만들기와 같은 방식)
    const peer = await openPeer(PREFIX + 'g-' + randomCode(10));
    this._attachPeer(peer);

    let lastErr = null;
    for (let i = 0; i < JOIN_TRIES; i++) {
      onProgress?.(i === 0 ? '방을 찾는 중...' : `방을 다시 찾는 중... (${i + 1}/${JOIN_TRIES})`);
      try {
        await this._connectToHost();
        return;
      } catch (err) {
        lastErr = err;
        console.warn('[net] join attempt failed', err.type, err.message);
        if (err.type === 'connect-timeout') break; // 직접 연결이 막힌 경우는 다시 해도 같아요
        await wait(2500);
      }
    }
    peer.destroy();
    this.peer = null;
    if (lastErr?.type === 'connect-timeout') {
      throw new NetError('상대 폰과 직접 연결이 안 돼요. 둘 다 와이파이로 바꿔서 다시 해보세요.', 'connect-timeout');
    }
    throw new NetError('방을 찾을 수 없어요. 코드가 맞는지, 방 만든 폰에서 게임 화면이 켜져 있는지 확인해주세요.', 'peer-unavailable');
  }

  send(msg) {
    if (this.connected) this.conn.send(msg);
  }

  // ---------------- 내부 ----------------
  _attachPeer(peer) {
    this.peer = peer;
    peer.on('connection', (conn) => this._acceptIncoming(conn));
    peer.on('disconnected', () => {
      // 연결 서버와의 연결만 끊긴 것. 이미 연결된 게임은 계속돼요.
      setTimeout(() => this._revive(), 1500);
    });
    peer.on('error', (err) => {
      console.warn('[net] peer error', err.type, err.message);
      if (err.type === 'peer-unavailable' && this.pendingConn) {
        this.pendingConn.fail(new NetError('방을 찾을 수 없어요', 'peer-unavailable'));
      } else if (err.type === 'unavailable-id' && this.isHost) {
        this.onStatus?.('방 코드가 만료됐어요. 새로 방을 만들어주세요.');
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        if (!this.connected) this.onStatus?.('연결이 불안정해요...');
      }
    });
  }

  _revive() {
    const peer = this.peer;
    if (!peer || this.closed || peer.destroyed) return;
    if (peer.disconnected) {
      try {
        peer.reconnect();
      } catch (e) {
        console.warn('[net] reconnect failed', e);
      }
    }
    if (!this.isHost && !this.connected) this._scheduleRetry();
  }

  _acceptIncoming(conn) {
    if (!this.isHost) return conn.close();
    if (this.connected) {
      // 이 게임은 둘이서만!
      conn.on('open', () => {
        conn.send({ t: 'full' });
        setTimeout(() => conn.close(), 300);
      });
      return;
    }
    this._setupConn(conn);
  }

  _connectToHost() {
    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
      let done = false;
      const finish = (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.pendingConn = null;
        if (err) {
          conn.close();
          reject(err);
        } else resolve();
      };
      const timer = setTimeout(
        () => finish(new NetError('직접 연결 시간 초과', 'connect-timeout')),
        CONNECT_TIMEOUT,
      );
      this.pendingConn = { fail: finish };
      conn.on('open', () => finish());
      conn.on('error', (e) => finish(new NetError(e?.message || '연결 오류', 'conn-error')));
      this._setupConn(conn);
    });
  }

  _setupConn(conn) {
    conn.on('open', () => {
      this.conn = conn;
      this.onConnect?.();
    });
    conn.on('data', (msg) => {
      if (msg && msg.t === 'full') {
        this.closed = true;
        this.onStatus?.('이미 두 명이 들어가 있는 방이에요');
        return;
      }
      this.onMessage?.(msg);
    });
    const closed = () => {
      if (this.conn !== conn) return;
      this.conn = null;
      this.onDisconnect?.();
      if (!this.isHost) this._scheduleRetry();
    };
    conn.on('close', closed);
    conn.on('error', closed);
  }

  // 게스트는 게임 중에 끊기면 자동으로 다시 접속 시도
  async _scheduleRetry() {
    if (this.isHost || this.closed || this.retrying) return;
    this.retrying = true;
    try {
      while (!this.connected && !this.closed && this.peer && !this.peer.destroyed) {
        await wait(3000);
        if (this.connected || document.visibilityState !== 'visible') continue;
        this.onStatus?.('다시 연결하는 중...');
        try {
          await this._connectToHost();
        } catch {
          /* 다음 번에 다시 */
        }
      }
    } finally {
      this.retrying = false;
    }
  }
}
