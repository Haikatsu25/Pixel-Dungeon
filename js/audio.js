'use strict';

// Efectos de sonido 8-bit sintetizados con Web Audio (sin archivos externos)
const Sfx = {
  ctx: null,
  master: null,
  muted: false,
  last: {},

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.3;
    this.master.connect(this.ctx.destination);
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.3;
  },

  tone(f0, f1, dur, type, vol, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  noise(dur, vol, freq = 2000, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.02);
  },

  seq(notes, step, type, vol, dur) {
    notes.forEach((f, i) => this.tone(f, f, dur || step * 1.2, type, vol, i * step));
  },

  play(name) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (this.last[name] && now - this.last[name] < 40) return;
    this.last[name] = now;
    switch (name) {
      case 'shoot': this.tone(880, 440, 0.08, 'square', 0.1); break;
      case 'smg': this.tone(1200, 600, 0.05, 'square', 0.06); break;
      case 'shotgun': this.noise(0.2, 0.35, 1800); this.tone(220, 70, 0.14, 'square', 0.14); break;
      case 'laser': this.tone(1800, 180, 0.24, 'sawtooth', 0.1); break;
      case 'slash': this.noise(0.1, 0.25, 5000); this.tone(600, 300, 0.08, 'triangle', 0.1); break;
      case 'deflect': this.tone(1500, 2600, 0.1, 'triangle', 0.2); break;
      case 'hit': this.tone(320, 150, 0.06, 'square', 0.08); break;
      case 'kill': this.noise(0.22, 0.3, 1200); this.tone(420, 60, 0.2, 'square', 0.1); break;
      case 'hurt': this.tone(220, 50, 0.45, 'sawtooth', 0.3); this.noise(0.35, 0.3, 800); break;
      case 'shield': this.tone(900, 260, 0.18, 'triangle', 0.25); break;
      case 'regen': this.tone(600, 950, 0.09, 'triangle', 0.12); break;
      case 'ult': this.tone(110, 880, 0.35, 'sawtooth', 0.22); this.noise(0.4, 0.35, 900); this.seq([523, 784, 1047], 0.05, 'square', 0.1); break;
      case 'ultReady': this.seq([660, 990, 1320], 0.07, 'triangle', 0.14); break;
      case 'coin': this.tone(988, 988, 0.05, 'square', 0.08); this.tone(1319, 1319, 0.12, 'square', 0.08, 0.05); break;
      case 'pickup': this.seq([523, 659, 784], 0.06, 'square', 0.1); break;
      case 'switch': this.tone(700, 900, 0.05, 'square', 0.07); break;
      case 'door': this.tone(120, 55, 0.28, 'square', 0.18); this.noise(0.25, 0.2, 600); break;
      case 'clear': this.seq([523, 659, 784, 1047], 0.08, 'square', 0.1); break;
      case 'perfect': this.seq([784, 988, 1175, 1568, 1976], 0.07, 'square', 0.11); break;
      case 'combo': this.tone(1000, 1600, 0.12, 'square', 0.08); break;
      case 'roar': this.tone(95, 40, 1.1, 'sawtooth', 0.32); this.noise(0.9, 0.28, 420); break;
      case 'land': this.noise(0.45, 0.5, 300); this.tone(80, 30, 0.4, 'square', 0.3); break;
      case 'jump': this.tone(200, 600, 0.35, 'triangle', 0.15); break;
      case 'eshoot': this.tone(520, 300, 0.07, 'triangle', 0.05); break;
      case 'spawn': this.tone(200, 800, 0.25, 'sine', 0.08); break;
      case 'teleport': this.tone(1200, 200, 0.2, 'sine', 0.1); break;
      case 'portal': this.seq([262, 330, 392, 523, 659, 784], 0.07, 'triangle', 0.14); break;
      case 'buy': this.seq([659, 880, 1319], 0.06, 'square', 0.1); break;
      case 'chest': this.seq([392, 523, 659, 784, 1047], 0.07, 'square', 0.1); break;
      case 'empty': this.tone(150, 150, 0.06, 'square', 0.1); break;
      case 'roll': this.noise(0.14, 0.15, 1500); break;
      case 'gameover': this.seq([392, 330, 262, 196], 0.26, 'square', 0.14, 0.3); break;
      case 'victory': this.seq([523, 659, 784, 1047, 784, 1047, 1319], 0.13, 'square', 0.13); break;
    }
  },
};
