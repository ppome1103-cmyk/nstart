// 터치 조이스틱 + 화면 드래그 카메라 + 키보드(PC 테스트용)
export class Controls {
  constructor({ joystick, stick, canvas, jumpButton }) {
    this.move = { x: 0, y: 0 }; // x: 오른쪽+, y: 앞쪽+
    this.camYaw = 0;
    this.camPitch = 0.45;
    this.jumpQueued = false;
    this.keys = new Set();
    this.enabled = true;

    // ---- 조이스틱 ----
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

    // ---- 카메라 드래그 ----
    const drags = new Map();
    canvas.addEventListener('pointerdown', (e) => {
      drags.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      const d = drags.get(e.pointerId);
      if (!d) return;
      this.camYaw -= (e.clientX - d.x) * 0.008;
      this.camPitch = Math.min(1.2, Math.max(0.1, this.camPitch + (e.clientY - d.y) * 0.005));
      d.x = e.clientX;
      d.y = e.clientY;
    });
    const endDrag = (e) => drags.delete(e.pointerId);
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // ---- 점프 ----
    jumpButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.jumpQueued = true;
    });

    // ---- 키보드 ----
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.jumpQueued = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  // 현재 입력 (조이스틱 우선, 없으면 키보드)
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
}
