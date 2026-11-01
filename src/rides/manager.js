import * as THREE from 'three';
import { SEAT_OFFSET } from '../avatar.js';
import { sfx, setWind, vibrate } from '../audio.js';
import { damp } from '../core/rng.js';

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _look = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

// 놀이기구 관리: 타기/내리기, 같이 타기, 두 폰 동기화, 탑승 카메라, 효과
export class RideManager {
  constructor(ctx) {
    this.ctx = ctx; // { scene, world, fx, me(), partner(), net(), role(), hud, controls() }
    this.rides = [];
    this.byId = {};
    this.mine = null; // { ride, seat, boardTime }
    this.partnerRide = null; // { ride, seat, boardTime }
    this.handsUp = false;
    this.camMode = 'first';
    this.camPos = new THREE.Vector3();
    this.camQuat = new THREE.Quaternion();
    this.camUp = new THREE.Vector3(0, 1, 0);
    this.fovBoost = 0;
    this.lastInfo = null;
  }

  add(ride) {
    this.rides.push(ride);
    this.byId[ride.id] = ride;
    if (ride.board) {
      this.ctx.world.interactables.push({
        x: ride.board.x,
        z: ride.board.z,
        r: ride.board.r || 3,
        kind: 'ride',
        ride,
        label: () => this.promptFor(ride),
        onUse: () => this.board(ride),
      });
    }
    return ride;
  }

  promptFor(ride) {
    if (this.mine) return null;
    const t = this.ctx.now();
    const pr = this.partnerRide;
    const together = pr && pr.ride === ride;
    const can = ride.canBoard(t);
    if (!can.ok) return { text: `${ride.icon} ${ride.name} · ${can.reason}`, disabled: true };
    if (together) return { text: `💕 같이 ${ride.name} 타기`, hot: true };
    return { text: `${ride.icon} ${ride.name} 타기` };
  }

  // ---------------- 타기 / 내리기 ----------------
  board(ride, { silent = false } = {}) {
    const t = this.ctx.now();
    if (this.mine) return;
    const can = ride.canBoard(t);
    if (!can.ok) {
      this.ctx.hud.toast(can.reason);
      return;
    }
    const pr = this.partnerRide && this.partnerRide.ride === ride ? this.partnerRide.seat : null;
    const seat = ride.pickSeat(this.ctx.role(), pr);
    if (seat < 0) {
      this.ctx.hud.toast('자리가 없어요');
      return;
    }
    ride.riders.set(seat, 'me');
    const start = ride.requestStart(t);
    this.mine = { ride, seat, boardTime: t };
    this.handsUp = false;
    this.camMode = ride.cam;
    this.camInit = false;
    const ctrl = this.ctx.controls();
    ctrl.lookYaw = 0;
    ctrl.lookPitch = 0;
    this.ctx.me().avatar.setFirstPerson(this.camMode === 'first');
    ride.onBoard?.(seat, 'me', t);
    if (!silent) {
      this.ctx.net()?.send({ t: 'board', id: ride.id, seat, start, bt: t });
      sfx.chime();
    }
    this.ctx.hud.showRide(true, ride);
  }

  exit({ send = true } = {}) {
    if (!this.mine) return;
    const { ride, seat } = this.mine;
    ride.riders.delete(seat);
    ride.onExit?.(seat, 'me');
    this.mine = null;
    const me = this.ctx.me();
    me.avatar.setFirstPerson(false);
    me.avatar.root.quaternion.identity();
    const ex = ride.exit || ride.board;
    const off = this.ctx.role() === 'host' ? -0.8 : 0.8;
    const ang = ex.ry ?? Math.atan2(ex.x - ride.group.position.x, ex.z - ride.group.position.z);
    me.pos.set(ex.x + Math.cos(ang) * off, 0, ex.z - Math.sin(ang) * off);
    me.yaw = ang;
    me.velY = 0;
    this.ctx.controls().camYaw = ang + Math.PI;
    setWind(0);
    this.ctx.fx.lines = 0;
    this.ctx.fx.dark = 0;
    if (send) this.ctx.net()?.send({ t: 'exit', id: ride.id });
    this.ctx.hud.showRide(false);
    this.ctx.onExitRide?.(ride);
  }

  toggleCam() {
    if (!this.mine) return;
    this.camMode = this.camMode === 'first' ? 'third' : 'first';
    this.ctx.me().avatar.setFirstPerson(this.camMode === 'first');
    this.camInit = false;
  }

  toggleHands() {
    if (!this.mine) return;
    if (this.mine.ride.actionLabel) {
      this.mine.ride.action(this.mine.seat, this.ctx.now());
      return;
    }
    this.handsUp = !this.handsUp;
    if (this.handsUp) sfx.whee();
  }

  // ---------------- 네트워크 ----------------
  onNet(msg) {
    const t = this.ctx.now();
    if (msg.t === 'board') {
      const ride = this.byId[msg.id];
      if (!ride) return;
      this._clearPartner();
      // 같은 자리에 겹치면 (동시에 탄 경우) 방장 우선
      if (ride.riders.get(msg.seat) === 'me' && this.ctx.role() === 'guest' && this.mine) {
        const s2 = ride.pickSeat('guest', msg.seat);
        if (s2 >= 0) {
          ride.riders.delete(this.mine.seat);
          this.mine.seat = s2;
          ride.riders.set(s2, 'me');
        }
      }
      ride.riders.set(msg.seat, 'partner');
      if (msg.start !== null && msg.start !== undefined) ride.requestStart(t, msg.start);
      this.partnerRide = { ride, seat: msg.seat, boardTime: msg.bt ?? t };
      ride.onBoard?.(msg.seat, 'partner', t);
      const p = this.ctx.partner();
      if (p && !this.mine) this.ctx.hud.toast(`${p.info?.name ?? '상대'} 님이 ${ride.icon} ${ride.name}에 탔어요! 같이 타러 가요`);
    } else if (msg.t === 'exit') {
      this._clearPartner();
    } else if (msg.t === 'rv') {
      this.byId[msg.id]?.onNet(msg);
    }
  }

  _clearPartner() {
    if (!this.partnerRide) return;
    const { ride, seat } = this.partnerRide;
    if (ride.riders.get(seat) === 'partner') ride.riders.delete(seat);
    ride.onExit?.(seat, 'partner');
    this.partnerRide = null;
    const p = this.ctx.partner();
    if (p) {
      p.avatar.root.quaternion.identity();
      p.fresh = true;
    }
  }

  // 상대 위치 메시지에 들어있는 탑승 정보로 보정 (메시지를 놓쳤을 때 대비)
  syncPartner(rd, st, hu) {
    this.partnerHands = !!hu;
    if (!rd) {
      if (this.partnerRide) this._clearPartner();
      return;
    }
    if (!this.partnerRide || this.partnerRide.ride.id !== rd || this.partnerRide.seat !== st) {
      const ride = this.byId[rd];
      if (!ride) return;
      this._clearPartner();
      ride.riders.set(st, 'partner');
      this.partnerRide = { ride, seat: st, boardTime: this.ctx.now() };
    }
  }

  partnerLeft() {
    this._clearPartner();
  }

  // ---------------- 매 프레임 ----------------
  update(dt, t) {
    for (const ride of this.rides) {
      ride.update(dt, t);
      ride.checkEvents(t, (ev) => this._event(ride, ev));
    }
    const me = this.ctx.me();
    // 내 탑승
    if (this.mine) {
      const { ride, seat, boardTime } = this.mine;
      if (ride.mode === 'drive') ride.drive(this.ctx.controls().getMove(), dt, t, this.ctx.controls().camYaw);
      if (ride.shouldExit(seat, t, boardTime)) {
        this.exit({ send: true });
      } else {
        this._place(me.avatar, ride, seat, t, this.handsUp, dt);
        me.pos.copy(me.avatar.root.position);
        const info = ride.riderInfo(seat, t);
        this.lastInfo = info;
        this._applyFx(info, dt);
        this.ctx.hud.updateRide(ride.statusText(t, seat), ride.canExit(seat, t), ride.actionLabel ?? (this.handsUp ? '🙌 내리기' : '🙌 만세'));
      }
    }
    // 상대 탑승
    const p = this.ctx.partner();
    if (p && this.partnerRide) {
      const { ride, seat, boardTime } = this.partnerRide;
      if (ride.mode === 'run' && ride.shouldExit(seat, t, boardTime) && t > boardTime + 1) {
        this._clearPartner();
      } else {
        this._place(p.avatar, ride, seat, t, this.partnerHands, dt);
        p.onRide = true;
      }
    } else if (p) p.onRide = false;
  }

  _place(avatar, ride, seat, t, hands, dt) {
    ride.seatTransform(seat, t, _p, _q);
    _up.set(0, 1, 0).applyQuaternion(_q);
    avatar.root.position.copy(_p).addScaledVector(_up, -SEAT_OFFSET);
    avatar.root.quaternion.copy(_q);
    const info = ride.riderInfo(seat, t);
    let pose = info.pose || 'sit';
    if (hands && (pose === 'sit' || pose === 'hold')) pose = 'handsUp';
    avatar.update(dt, 0, true, pose);
  }

  _event(ride, ev) {
    const meOn = this.mine && this.mine.ride === ride;
    for (const [seat, who] of ride.riders) {
      const av = who === 'me' ? this.ctx.me().avatar : this.ctx.partner()?.avatar;
      if (!av) continue;
      if (ev.say) av.say(ev.say, 1.6);
    }
    if (!meOn) return;
    if (ev.sound && sfx[ev.sound]) sfx[ev.sound]();
    if (ev.shake) this.ctx.fx.shake(ev.shake);
    if (ev.vibrate) vibrate(ev.vibrate);
    if (ev.splash) this.ctx.fx.splash(ev.splash);
    if (ev.flash) this.ctx.fx.flash = ev.flash;
    if (ev.photo) this.ctx.onRidePhoto?.(ride, ev.photo);
    if (ev.hands && !this.handsUp && Math.random() < 0.7) {
      this.handsUp = true;
    }
  }

  _applyFx(info, dt) {
    const fx = this.ctx.fx;
    fx.lines = damp(fx.lines, info.lines || 0, 6, dt);
    fx.dark = damp(fx.dark, info.dark || 0, 4, dt);
    if (info.shake) fx.shake(info.shake * dt);
    setWind(info.wind || 0);
    this.fovBoost = damp(this.fovBoost, info.fov || 0, 4, dt);
  }

  // 탑승 중 카메라. 처리했으면 true
  applyCamera(camera, dt, t) {
    if (!this.mine) {
      this.fovBoost = damp(this.fovBoost, 0, 4, dt);
      return false;
    }
    const { ride, seat } = this.mine;
    const ctrl = this.ctx.controls();
    ride.seatTransform(seat, t, _p, _q);
    _up.set(0, 1, 0).applyQuaternion(_q);
    _fwd.set(0, 0, 1).applyQuaternion(_q);
    const k = 1 - Math.exp(-14 * dt);
    if (this.camMode === 'first') {
      _eye.copy(_p).addScaledVector(_up, 1.18 - SEAT_OFFSET + 0.08).addScaledVector(_fwd, 0.18);
      _e.set(-ctrl.lookPitch, ctrl.lookYaw, 0);
      _look.setFromEuler(_e);
      const target = _q.clone().multiply(_flip).multiply(_look);
      if (!this.camInit) {
        this.camQuat.copy(target);
        this.camInit = true;
      }
      this.camQuat.slerp(target, k);
      camera.position.copy(_eye);
      camera.quaternion.copy(this.camQuat);
    } else {
      const handled = ride.thirdPersonCam(seat, t, _eye, _tgt);
      if (!handled) {
        // 좌석 뒤쪽 위에서 (드래그로 둘러보기)
        const back = new THREE.Vector3(0, 2.4, -6.5);
        back.applyAxisAngle(new THREE.Vector3(1, 0, 0), -ctrl.lookPitch * 0.8);
        back.applyAxisAngle(new THREE.Vector3(0, 1, 0), ctrl.lookYaw);
        _eye.copy(back).applyQuaternion(_q).add(_p);
        _tgt.copy(_p).addScaledVector(_up, 1.2);
      }
      if (!this.camInit) {
        this.camPos.copy(_eye);
        this.camUp.copy(_up);
        this.camInit = true;
      }
      this.camPos.lerp(_eye, 1 - Math.exp(-8 * dt));
      this.camUp.lerp(handled ? new THREE.Vector3(0, 1, 0) : _up, 1 - Math.exp(-4 * dt)).normalize();
      camera.position.copy(this.camPos);
      camera.up.copy(this.camUp);
      camera.lookAt(_tgt);
      camera.up.set(0, 1, 0);
    }
    return true;
  }

  // 미니맵용
  list() {
    return this.rides;
  }
}
