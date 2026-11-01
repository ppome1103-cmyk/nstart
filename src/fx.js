// 화면 효과: 속도선, 물방울, 어둠(비네트), 번쩍임, 화면 흔들림
export class ScreenFX {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.lines = 0; // 0~1 속도선
    this.dark = 0; // 0~1 가장자리 어둠
    this.flash = 0; // 0~1 흰색 번쩍
    this.tint = null;
    this.drops = [];
    this.trauma = 0; // 흔들림
    this.t = 0;
    this.streaks = [];
    for (let i = 0; i < 46; i++) this.streaks.push({ a: Math.random() * Math.PI * 2, p: Math.random(), w: 1 + Math.random() * 2 });
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.w = this.canvas.width = window.innerWidth;
    this.h = this.canvas.height = window.innerHeight;
  }

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  splash(count = 26) {
    for (let i = 0; i < count; i++) {
      this.drops.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: 6 + Math.random() * 22,
        life: 1.5 + Math.random() * 2,
        vy: 10 + Math.random() * 30,
      });
    }
  }

  // 흔들림 오프셋 (카메라에 더하기)
  shakeOffset(out) {
    const s = this.trauma * this.trauma;
    const t = this.t * 40;
    out.set(Math.sin(t * 1.1) * 0.25 * s, Math.sin(t * 1.7 + 1) * 0.25 * s, Math.sin(t * 1.3 + 2) * 0.12 * s);
    return out;
  }

  update(dt) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    const { g, w, h } = this;
    g.clearRect(0, 0, w, h);
    const active = this.lines > 0.02 || this.dark > 0.01 || this.flash > 0.01 || this.drops.length;
    this.canvas.style.display = active ? 'block' : 'none';
    if (!active) return;

    // 속도선
    if (this.lines > 0.02) {
      const cx = w / 2;
      const cy = h * 0.45;
      const R = Math.hypot(w, h) * 0.6;
      g.strokeStyle = `rgba(255,255,255,${0.55 * this.lines})`;
      g.lineCap = 'round';
      for (const s of this.streaks) {
        s.p += dt * (1.5 + this.lines * 3);
        if (s.p > 1) {
          s.p -= 1;
          s.a = Math.random() * Math.PI * 2;
        }
        const r0 = R * (0.55 + s.p * 0.5);
        const len = R * 0.18 * this.lines;
        g.lineWidth = s.w;
        g.beginPath();
        g.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0);
        g.lineTo(cx + Math.cos(s.a) * (r0 + len), cy + Math.sin(s.a) * (r0 + len));
        g.stroke();
      }
    }

    // 가장자리 어둠
    if (this.dark > 0.01) {
      const grd = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
      grd.addColorStop(0, 'rgba(10,0,20,0)');
      grd.addColorStop(1, `rgba(10,0,20,${0.85 * this.dark})`);
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    }

    // 물방울
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt;
      d.y += d.vy * dt;
      if (d.life <= 0) {
        this.drops.splice(i, 1);
        continue;
      }
      const a = Math.min(1, d.life);
      const grd = g.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, 0, d.x, d.y, d.r);
      grd.addColorStop(0, `rgba(255,255,255,${0.7 * a})`);
      grd.addColorStop(0.5, `rgba(200,235,255,${0.25 * a})`);
      grd.addColorStop(1, `rgba(150,210,255,${0.1 * a})`);
      g.fillStyle = grd;
      g.beginPath();
      g.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      g.fill();
    }

    if (this.flash > 0.01) {
      g.fillStyle = `rgba(255,255,255,${this.flash})`;
      g.fillRect(0, 0, w, h);
    }
  }
}
