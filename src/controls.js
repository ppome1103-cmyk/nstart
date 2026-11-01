// 터치 조이스틱 + 화면 드래그 카메라 + 탭 + 키보드(PC 테스트용)
export class Controls {
  constructor({ joystick, stick, canvas, jumpButton }) {
    this.move = { x: 0, y: 0 };
    this.camYaw = 0;
    this.camPitch = 0.38;
    this.lookYaw = 0; // 탈것 탑승 중 둘러보기
    this.lookPitch = 0;
    this.camDist = 7.5;
    this.jumpQueued = false;
    this.keys = new Set();
    this.dragging = 0;
    this.onTap = null;

    const radius = 50;
    let joyId = null;
    const setStick = (dx, dy) => {
      stick.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const updateJoy = (e) => {
      const rect = joystick.getBoundingClientRect();
      let dx = e.clientX - (rect.left + rect.width / 2);
      let dy = e.clientY - (rect.top + rect.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      setStick(dx, dy);
      this.move.x = dx / radius;
      this.move.y = -dy / radius;
    };
    joystick.addEventListener('pointerdown', (e) => {
      joyId = e.pointerId;
      joystick.setPointerCapture(e.pointerId);
      updateJoy(e);
    });
    joystick.addEventListener('pointermove', (e) => {
      if (e.pointerId === joyId) updateJoy(e);
    });
    const endJoy = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null;
      setStick(0, 0);
      this.move.x = 0;
      this.move.y = 0;
    };
    joystick.addEventListener('pointerup', endJoy);
    joystick.addEventListener('pointercancel', endJoy);

    // 카메라 드래그 / 탭 / 핀치 줌
    const drags = new Map();
    let pinch = null;
    canvas.addEventListener('pointerdown', (e) => {
      drags.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
      canvas.setPointerCapture(e.pointerId);
      this.dragging = drags.size;
      if (drags.size === 2) {
        const [a, b] = [...drags.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: this.camDist };
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      const d = drags.get(e.pointerId);
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      if (drags.size === 2 && pinch) {
        const [a, b] = [...drags.values()];
        const nd = Math.hypot(a.x - b.x, a.y - b.y);
        this.camDist = Math.min(14, Math.max(4, (pinch.dist * pinch.d) / Math.max(20, nd)));
        return;
      }
      this.camYaw -= dx * 0.008;
      this.camPitch = Math.min(1.25, Math.max(-0.05, this.camPitch + dy * 0.005));
      this.lookYaw = Math.max(-2.6, Math.min(2.6, this.lookYaw - dx * 0.006));
      this.lookPitch = Math.max(-1.1, Math.min(1.1, this.lookPitch - dy * 0.005));
    });
    const endDrag = (e) => {
      const d = drags.get(e.pointerId);
      drags.delete(e.pointerId);
      this.dragging = drags.size;
      if (drags.size < 2) pinch = null;
      if (d && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 12 && performance.now() - d.t < 350) {
        this.onTap?.(e.clientX, e.clientY);
      }
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', (e) => {
      this.camDist = Math.min(14, Math.max(4, this.camDist + e.deltaY * 0.01));
    });

    jumpButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.jumpQueued = true;
    });

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.jumpQueued = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  getMove() {
    if (this.move.x || this.move.y) return this.move;
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    const len = Math.hypot(x, y);
    return len ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  consumeJump() {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  // 손을 떼고 있으면 둘러보기가 천천히 원래대로
  relaxLook(dt) {
    if (this.dragging) return;
    const k = Math.exp(-1.5 * dt);
    this.lookYaw *= k;
    this.lookPitch *= k;
  }
}
