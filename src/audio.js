// 소리는 파일 없이 Web Audio로 직접 만들어요. (가볍고 귀여운 효과음)
let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let muted = localStorage.getItem('dulisum-muted') === '1';
let noiseBuf = null;
let wind = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.22;
  musicBus.connect(master);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // 바람 소리 (속도에 따라 커짐)
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 400;
  filter.Q.value = 0.6;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(filter).connect(gain).connect(sfxBus);
  src.start();
  wind = { filter, gain };

  startMusic();
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });
}

export function isMuted() {
  return muted;
}
export function setMuted(m) {
  muted = m;
  localStorage.setItem('dulisum-muted', m ? '1' : '0');
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
}

function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone({ type = 'sine', f = 440, f2, dur = 0.2, vol = 0.3, attack = 0.005, when = 0, bus = sfxBus, detune = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.detune.value = detune;
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain();
  env(g, t, attack, vol, dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function noise({ dur = 0.3, vol = 0.3, type = 'lowpass', f = 1000, f2, q = 1, when = 0, attack = 0.005 }) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  fl.Q.value = q;
  const g = ctx.createGain();
  env(g, t, attack, vol, dur);
  s.connect(fl).connect(g).connect(sfxBus);
  s.start(t, Math.random());
  s.stop(t + attack + dur + 0.05);
}

export const sfx = {
  click() {
    tone({ type: 'triangle', f: 880, f2: 1320, dur: 0.06, vol: 0.12 });
  },
  clack() {
    noise({ dur: 0.04, vol: 0.25, type: 'highpass', f: 2500 });
    tone({ type: 'square', f: 180, dur: 0.03, vol: 0.05 });
  },
  whee() {
    const base = 520 + Math.random() * 160;
    tone({ type: 'triangle', f: base, f2: base * 2.1, dur: 0.35, vol: 0.12 });
    tone({ type: 'triangle', f: base * 2.1, f2: base * 1.3, dur: 0.6, vol: 0.1, when: 0.33 });
  },
  scream() {
    // 귀여운 "꺄아~"
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(700 + Math.random() * 200, t);
    o.frequency.linearRampToValueAtTime(1100, t + 0.15);
    o.frequency.linearRampToValueAtTime(800, t + 1.0);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lg = ctx.createGain();
    lg.gain.value = 40;
    lfo.connect(lg).connect(o.frequency);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 1400;
    f1.Q.value = 3;
    const g = ctx.createGain();
    env(g, t, 0.05, 0.08, 1.0);
    o.connect(f1).connect(g).connect(sfxBus);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.1);
    lfo.stop(t + 1.1);
  },
  splash() {
    noise({ dur: 0.9, vol: 0.5, type: 'lowpass', f: 3000, f2: 300 });
    noise({ dur: 0.4, vol: 0.25, type: 'highpass', f: 3000, when: 0.05 });
  },
  bump() {
    tone({ type: 'sine', f: 140, f2: 50, dur: 0.25, vol: 0.5 });
    noise({ dur: 0.12, vol: 0.2, type: 'lowpass', f: 800 });
  },
  spark() {
    noise({ dur: 0.08, vol: 0.12, type: 'highpass', f: 5000 });
  },
  pop() {
    noise({ dur: 0.08, vol: 0.4, type: 'bandpass', f: 1800, q: 0.8 });
    tone({ type: 'sine', f: 900, f2: 300, dur: 0.08, vol: 0.15 });
  },
  bonk() {
    tone({ type: 'square', f: 300, f2: 120, dur: 0.12, vol: 0.15 });
    noise({ dur: 0.06, vol: 0.2, type: 'lowpass', f: 1200 });
  },
  boo() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.9);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6;
    const lg = ctx.createGain();
    lg.gain.value = 18;
    lfo.connect(lg).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    env(g, t, 0.05, 0.25, 0.9);
    o.connect(f).connect(g).connect(sfxBus);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1);
    lfo.stop(t + 1);
  },
  thud() {
    tone({ type: 'sine', f: 90, f2: 40, dur: 0.5, vol: 0.6 });
    noise({ dur: 0.3, vol: 0.25, type: 'lowpass', f: 400 });
  },
  hiss() {
    noise({ dur: 1.2, vol: 0.25, type: 'highpass', f: 1500, f2: 4000 });
  },
  chime() {
    [784, 988, 1175].forEach((f, i) => tone({ type: 'sine', f, dur: 0.4, vol: 0.12, when: i * 0.08 }));
  },
  ticket() {
    [1046, 1318].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.12, vol: 0.12, when: i * 0.07 }));
  },
  fanfare() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.25, vol: 0.14, when: i * 0.11 }));
    tone({ type: 'triangle', f: 1046, dur: 0.6, vol: 0.14, when: 0.5 });
  },
  shutter() {
    noise({ dur: 0.05, vol: 0.3, type: 'highpass', f: 3000 });
    noise({ dur: 0.05, vol: 0.25, type: 'highpass', f: 2000, when: 0.08 });
  },
  firework(delay = 0, pan = 0) {
    if (!ctx) return;
    tone({ type: 'sine', f: 600, f2: 1800, dur: 0.6, vol: 0.04, when: delay });
    noise({ dur: 0.9, vol: 0.35, type: 'lowpass', f: 1600, f2: 200, when: delay + 0.6 });
    noise({ dur: 1.2, vol: 0.08, type: 'highpass', f: 4000, when: delay + 0.7 });
  },
  whistle() {
    tone({ type: 'sine', f: 1200, dur: 0.15, vol: 0.12 });
    tone({ type: 'sine', f: 1500, dur: 0.4, vol: 0.12, when: 0.18 });
  },
  choo() {
    tone({ type: 'square', f: 440, dur: 0.35, vol: 0.06 });
    tone({ type: 'square', f: 554, dur: 0.35, vol: 0.06 });
    tone({ type: 'square', f: 440, dur: 0.6, vol: 0.06, when: 0.45 });
    tone({ type: 'square', f: 554, dur: 0.6, vol: 0.06, when: 0.45 });
  },
  creak() {
    tone({ type: 'sawtooth', f: 90, f2: 70, dur: 0.5, vol: 0.05 });
  },
};

// 바람 소리 세기 (0~1)
export function setWind(level) {
  if (!wind) return;
  const t = ctx.currentTime;
  wind.gain.gain.setTargetAtTime(Math.min(1, level) * 0.35, t, 0.1);
  wind.filter.frequency.setTargetAtTime(300 + level * 1500, t, 0.1);
}

// ---------------- 배경 음악: 오르골 ----------------
// 직접 만든 짧은 멜로디 (C장조 펜타토닉 위주)
const MELODY = [
  [72, 1], [76, 1], [79, 1], [76, 1], [77, 1], [76, 1], [74, 2],
  [72, 1], [74, 1], [76, 1], [79, 1], [81, 2], [79, 2],
  [77, 1], [76, 1], [74, 1], [72, 1], [74, 1], [76, 1], [72, 2],
  [69, 1], [72, 1], [74, 1], [76, 1], [74, 2], [72, 2],
];
const BASS = [48, 55, 53, 55, 48, 52, 53, 55];
let musicTimer = null;
let musicLevel = 0.22;
let nightMusic = false;

function midi(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

function startMusic() {
  let nextTime = ctx.currentTime + 0.2;
  let idx = 0;
  let beat = 0;
  const beatLen = 0.32;
  musicTimer = setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    while (nextTime < ctx.currentTime + 0.4) {
      const [note, len] = MELODY[idx % MELODY.length];
      const n = nightMusic ? note - 3 : note;
      const when = nextTime - ctx.currentTime;
      tone({ type: 'sine', f: midi(n), dur: 0.9, vol: 0.22, attack: 0.004, when, bus: musicBus });
      tone({ type: 'sine', f: midi(n + 12), dur: 0.4, vol: 0.05, attack: 0.004, when, bus: musicBus });
      if (beat % 4 === 0) {
        const b = BASS[Math.floor(beat / 4) % BASS.length] - (nightMusic ? 3 : 0);
        tone({ type: 'triangle', f: midi(b), dur: 1.2, vol: 0.12, attack: 0.01, when, bus: musicBus });
      }
      nextTime += len * beatLen;
      beat += len;
      idx++;
    }
  }, 100);
}

export function setMusicLevel(level) {
  if (!musicBus) return;
  if (Math.abs(level - musicLevel) < 0.01) return;
  musicLevel = level;
  musicBus.gain.setTargetAtTime(level, ctx.currentTime, 0.3);
}

export function setNightMusic(n) {
  nightMusic = n;
}

export function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 지원 안 함 */
  }
}
