import * as THREE from 'three';

// 모든 놀이기구의 공통 틀
// mode:
//  'run'   : 누가 타면 카운트다운 후 정해진 시간 동안 운행 (코스터, 바이킹 ...)
//  'loop'  : 계속 움직이고 아무 때나 타고 내림 (관람차, 기차)
//  'drive' : 직접 조종 (범퍼카)
export class Ride {
  constructor(ctx, opts) {
    this.ctx = ctx;
    this.id = opts.id;
    this.name = opts.name;
    this.icon = opts.icon;
    this.mode = opts.mode || 'run';
    this.seatCount = opts.seats || 2;
    this.countdown = opts.countdown ?? 8;
    this.duration = opts.duration || 30;
    this.cam = opts.cam || 'first'; // 기본 시점
    this.board = opts.board; // { x, z, r }
    this.exit = opts.exit; // { x, z }
    this.start = null; // 운행 시작 시각 (놀이공원 시간)
    this.riders = new Map(); // seat → 'me' | 'partner'
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
    this.events = []; // { time, type } 운행 중 이벤트 (자동 비명 등)
    this._fired = new Set();
  }

  // 'idle' | 'countdown' | 'running'
  phase(t) {
    if (this.mode !== 'run' || this.start === null) return 'idle';
    if (t < this.start) return 'countdown';
    if (t < this.start + this.duration) return 'running';
    return 'idle';
  }

  runTime(t) {
    if (this.start === null) return -1;
    return t - this.start;
  }

  // 탈 수 있는지 { ok, reason }
  canBoard(t) {
    if (this.mode === 'run') {
      const ph = this.phase(t);
      if (ph === 'running') {
        const left = Math.ceil(this.start + this.duration - t);
        return { ok: false, reason: `운행 중 · ${left}초 뒤 탑승` };
      }
    }
    if (this.riders.size >= this.seatCount) return { ok: false, reason: '자리가 없어요' };
    return { ok: true };
  }

  // 자리 고르기: 둘이 붙어 앉도록 (0,1), (2,3) ... 짝을 맞춰요
  pickSeat(role, partnerSeat) {
    const taken = (s) => this.riders.has(s);
    if (partnerSeat !== undefined && partnerSeat !== null) {
      const mate = partnerSeat ^ 1;
      if (mate < this.seatCount && !taken(mate)) return mate;
    }
    const pref = role === 'host' ? 0 : 1;
    for (let s = pref; s < this.seatCount; s += 2) if (!taken(s)) return s;
    for (let s = 0; s < this.seatCount; s++) if (!taken(s)) return s;
    return -1;
  }

  // 운행 시작 예약 (이미 카운트다운 중이면 그대로)
  requestStart(t, proposed) {
    if (this.mode !== 'run') return this.start;
    const ph = this.phase(t);
    if (ph === 'idle') this.start = proposed ?? t + this.countdown;
    else if (ph === 'countdown' && proposed !== undefined && proposed < this.start && proposed > t) this.start = proposed;
    this._fired.clear();
    return this.start;
  }

  // 좌석의 월드 위치(엉덩이)와 회전 (앞 = +z, 위 = +y)
  // eslint-disable-next-line no-unused-vars
  seatTransform(seat, t, outPos, outQuat) {
    outPos.copy(this.group.position);
    outQuat.identity();
  }

  // 탑승자 상태: { pose, lines, wind, shake, fov, dark }
  // eslint-disable-next-line no-unused-vars
  riderInfo(seat, t) {
    return { pose: 'sit', lines: 0, wind: 0, shake: 0, fov: 0 };
  }

  // 3인칭 카메라 (없으면 기본: 좌석 뒤)
  // eslint-disable-next-line no-unused-vars
  thirdPersonCam(seat, t, outPos, outTarget) {
    return false;
  }

  // 'loop' 기구에서 자동으로 내리는지
  // eslint-disable-next-line no-unused-vars
  shouldExit(seat, t, boardTime) {
    if (this.mode === 'run') return this.start !== null && t >= this.start + this.duration;
    return false;
  }

  // 내릴 수 있는지 (기차는 역에서만)
  // eslint-disable-next-line no-unused-vars
  canExit(seat, t) {
    return true;
  }

  // 운행 상태 문구
  statusText(t) {
    const ph = this.phase(t);
    if (ph === 'countdown') return `출발까지 ${Math.ceil(this.start - t)}`;
    if (ph === 'running') return '운행 중';
    return '';
  }

  // 시간 이벤트 발생 (운행마다 한 번)
  checkEvents(t, cb) {
    if (this.mode !== 'run' || this.start === null) return;
    const rt = t - this.start;
    for (const ev of this.events) {
      const key = `${this.start}|${ev.time}|${ev.type}`;
      if (rt >= ev.time && rt < ev.time + 1.5 && !this._fired.has(key)) {
        this._fired.add(key);
        cb(ev);
      }
    }
  }

  // eslint-disable-next-line no-unused-vars
  update(dt, t) {}

  // 직접 조종 기구 입력 (범퍼카)
  // eslint-disable-next-line no-unused-vars
  drive(input, dt, t) {}

  // 기구별 네트워크 메시지
  // eslint-disable-next-line no-unused-vars
  onNet(msg) {}

  // 탑승 중 액션 버튼 (컵 돌리기 등). null이면 만세 버튼
  get actionLabel() {
    return null;
  }
  // eslint-disable-next-line no-unused-vars
  action(seat, t) {}
}

// 공용: 좌석 위치 계산용 임시 객체
export const tmp = {
  v: new THREE.Vector3(),
  v2: new THREE.Vector3(),
  q: new THREE.Quaternion(),
  q2: new THREE.Quaternion(),
  m: new THREE.Matrix4(),
  e: new THREE.Euler(),
};
