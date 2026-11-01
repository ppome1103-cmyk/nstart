import Peer from 'peerjs';

// PeerJS(WebRTC)로 폰끼리 직접 연결해요.
// 한 명이 방을 만들면 4글자 코드가 나오고, 다른 한 명이 그 코드로 들어와요.
const PREFIX = 'dulisum-nstart-v1-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 O/0, I/1 제외

function randomCode() {
  let c = '';
  for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
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
    this.retryTimer = null;
    this.closed = false;
  }

  get connected() {
    return !!(this.conn && this.conn.open);
  }

  // 방 만들기: 코드가 겹치면 새 코드로 다시 시도
  host(tries = 5) {
    this.isHost = true;
    return new Promise((resolve, reject) => {
      const attempt = (left) => {
        const code = randomCode();
        const peer = new Peer(PREFIX + code, peerOptions());
        peer.on('open', () => {
          this.peer = peer;
          this.code = code;
          this._watchPeer();
          peer.on('connection', (conn) => this._acceptIncoming(conn));
          resolve(code);
        });
        peer.on('error', (err) => {
          if (this.peer === peer) return this._peerError(err);
          peer.destroy();
          if (err.type === 'unavailable-id' && left > 1) attempt(left - 1);
          else reject(err);
        });
      };
      attempt(tries);
    });
  }

  // 참가하기
  join(code) {
    this.isHost = false;
    this.code = code.toUpperCase();
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerOptions());
      let settled = false;
      peer.on('open', () => {
        this.peer = peer;
        this._watchPeer();
        this._connectToHost(
          () => {
            settled = true;
            resolve();
          },
          (err) => {
            if (settled) return;
            settled = true;
            reject(err);
          },
        );
      });
      peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') {
          // 접속 중 방이 없다는 에러
          if (!settled) {
            settled = true;
            reject(new Error('방을 찾을 수 없어요. 코드를 확인해주세요.'));
          } else {
            this._scheduleRetry();
          }
          return;
        }
        if (!settled) {
          settled = true;
          reject(err);
        } else {
          this._peerError(err);
        }
      });
    });
  }

  send(msg) {
    if (this.connected) this.conn.send(msg);
  }

  // ---- 내부 ----
  _watchPeer() {
    this.peer.on('disconnected', () => {
      // 시그널링 서버와의 연결만 끊긴 것. 게임 연결은 유지될 수 있어요.
      if (!this.closed && !this.peer.destroyed) {
        setTimeout(() => !this.peer.destroyed && this.peer.reconnect(), 1000);
      }
    });
  }

  _peerError(err) {
    console.warn('[net]', err.type, err);
    if (err.type === 'network' || err.type === 'server-error') {
      this.onStatus?.('연결이 불안정해요...');
    }
  }

  _acceptIncoming(conn) {
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

  _connectToHost(onOpen, onFail) {
    const conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
    const timeout = setTimeout(() => {
      if (!conn.open) {
        conn.close();
        onFail?.(new Error('연결 시간이 초과됐어요. 다시 시도해주세요.'));
        this._scheduleRetry();
      }
    }, 12000);
    conn.on('open', () => {
      clearTimeout(timeout);
      onOpen?.();
    });
    this._setupConn(conn);
  }

  _setupConn(conn) {
    conn.on('open', () => {
      this.conn = conn;
      this.onConnect?.();
    });
    conn.on('data', (msg) => {
      if (msg && msg.t === 'full') {
        this.onStatus?.('이미 두 명이 들어가 있는 방이에요');
        this.closed = true;
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

  // 게스트는 끊기면 자동으로 다시 접속 시도
  _scheduleRetry() {
    if (this.isHost || this.closed || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.connected || this.closed || !this.peer || this.peer.destroyed) return;
      this.onStatus?.('다시 연결하는 중...');
      this._connectToHost();
    }, 3000);
  }
}
