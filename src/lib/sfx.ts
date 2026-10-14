// @ts-nocheck


/* ---------- صوتيات الاحتفال (WebAudio — بدون ملفات صوت) ---------- */
let _ac: any = null;
const sfxState = { on: true };
const getAC = () => {
  if (!sfxState.on || typeof window === "undefined") return null;
  try {
    if (!_ac) _ac = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    if (_ac.state === "suspended") _ac.resume();
    return _ac;
  } catch (e) { return null; }
};
const _noiseBuf = (c, sec) => {
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * sec), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
};
const _tone = (c, f, t, dur, type = "sine", vol = 0.2, f2 = 0) => {
  const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 3200;
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(lp).connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.05);
};
const _noise = (c, t, dur, vol, type = "highpass", freq = 1000, attack = 0.005) => {
  const s = c.createBufferSource(); s.buffer = _noiseBuf(c, dur + 0.1);
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(c.destination);
  s.start(t); s.stop(t + dur + 0.1);
};
const SFX = {
  // نقرة خفيفة تعلى نغمتها مع كل مركز
  tick(i = 0) { const c = getAC(); if (!c) return; const t = c.currentTime; _tone(c, 480 + i * 45, t, 0.14, "triangle", 0.16); },
  // ارتطام المنصة + رنة
  thud(level = 0) {
    const c = getAC(); if (!c) return; const t = c.currentTime;
    _tone(c, 150, t, 0.4, "sine", 0.5, 45);
    _noise(c, t, 0.09, 0.18, "lowpass", 1600);
    _tone(c, 660 + level * 165, t + 0.07, 0.35, "triangle", 0.13);
  },
  // طبول تتصاعد
  roll(sec = 2.2) {
    const c = getAC(); if (!c) return; const t0 = c.currentTime; const n = Math.floor(sec * 24);
    for (let i = 0; i < n; i++) { const k = i / n; _noise(c, t0 + i / 24, 0.05, 0.03 + 0.25 * k * k, "bandpass", 700 + 500 * k); }
  },
  // صنج + فانفير + جمهور + فرقعات
  fanfare() {
    const c = getAC(); if (!c) return; const t = c.currentTime;
    _noise(c, t, 1.8, 0.28, "highpass", 4500, 0.002);
    const n = [523.25, 659.25, 783.99, 1046.5];
    n.forEach((f, i) => { _tone(c, f, t + i * 0.12, 0.24, "sawtooth", 0.1); _tone(c, f / 2, t + i * 0.12, 0.24, "square", 0.035); });
    n.forEach((f) => _tone(c, f, t + 0.52, 1.7, "sawtooth", 0.05));
    _tone(c, 261.63, t + 0.52, 1.8, "triangle", 0.14);
    _noise(c, t + 0.35, 2.8, 0.1, "bandpass", 1300, 0.6);
    [0.3, 0.5, 0.75, 1.05, 1.4].forEach((d) => _noise(c, t + d, 0.06, 0.22, "highpass", 2600));
  },
  whoosh() { const c = getAC(); if (!c) return; const t = c.currentTime; _noise(c, t, 0.35, 0.12, "bandpass", 1800, 0.12); _tone(c, 880, t + 0.05, 0.18, "triangle", 0.08, 1320); },
};


export { _ac, sfxState, getAC, _noiseBuf, _tone, _noise, SFX };
