// Fully procedural WebAudio sound engine — no audio assets needed.
// Positional one-shots + thruster loop + ambient station hum.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.thrust = null;
  }

  // must be called from a user gesture
  init() {
    if (this.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    // shared 2s noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.startThruster();
    this.startAmbient();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // listener pose from the camera each frame
  updateListener(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = camera.getWorldPosition(_v1);
    const q = camera.getWorldQuaternion(_q1);
    const fwd = _v2.set(0, 0, -1).applyQuaternion(q);
    const up = _v3.set(0, 1, 0).applyQuaternion(q);
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02);
      l.positionY.setTargetAtTime(p.y, t, 0.02);
      l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.setTargetAtTime(up.x, t, 0.02);
      l.upY.setTargetAtTime(up.y, t, 0.02);
      l.upZ.setTargetAtTime(up.z, t, 0.02);
    } else if (l.setPosition) {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  panner(pos, refDist = 2, maxDist = 60) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDist;
    p.maxDistance = maxDist;
    p.rolloffFactor = 1.4;
    if (pos) this.setPannerPos(p, pos);
    p.connect(this.master);
    return p;
  }

  setPannerPos(p, pos) {
    const t = this.ctx.currentTime;
    if (p.positionX) {
      p.positionX.setTargetAtTime(pos.x, t, 0.03);
      p.positionY.setTargetAtTime(pos.y, t, 0.03);
      p.positionZ.setTargetAtTime(pos.z, t, 0.03);
    } else if (p.setPosition) p.setPosition(pos.x, pos.y, pos.z);
  }

  out(pos) { return pos ? this.panner(pos) : this.master; }

  env(gainNode, t0, peak, attack, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  // ---------------- one-shots ----------------

  laser(pos, own = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1400, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.16);
    const g = this.ctx.createGain();
    this.env(g, t, own ? 0.16 : 0.22, 0.004, 0.16);
    o.connect(g).connect(this.out(pos));
    o.start(t); o.stop(t + 0.2);

    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(2800, t);
    o2.frequency.exponentialRampToValueAtTime(500, t + 0.09);
    const g2 = this.ctx.createGain();
    this.env(g2, t, 0.08, 0.002, 0.09);
    o2.connect(g2).connect(this.out(pos));
    o2.start(t); o2.stop(t + 0.12);
  }

  hit(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1800;
    const g = this.ctx.createGain();
    this.env(g, t, 0.3, 0.003, 0.09);
    src.connect(f).connect(g).connect(this.out(pos));
    src.start(t); src.stop(t + 0.12);
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.08);
    const g2 = this.ctx.createGain();
    this.env(g2, t, 0.18, 0.003, 0.08);
    o.connect(g2).connect(this.out(pos));
    o.start(t); o.stop(t + 0.1);
  }

  hurt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
    const g = this.ctx.createGain();
    this.env(g, t, 0.28, 0.004, 0.18);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.22);
  }

  explosion(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 0.8);
    const g = this.ctx.createGain();
    this.env(g, t, 0.7, 0.008, 0.85);
    src.connect(f).connect(g).connect(pos ? this.panner(pos, 4, 120) : this.master);
    src.start(t); src.stop(t + 1);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.7);
    const g2 = this.ctx.createGain();
    this.env(g2, t, 0.5, 0.01, 0.7);
    o.connect(g2).connect(pos ? this.panner(pos, 4, 120) : this.master);
    o.start(t); o.stop(t + 0.8);
  }

  clank(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(1900, t);
    o.frequency.exponentialRampToValueAtTime(700, t + 0.05);
    const g = this.ctx.createGain();
    this.env(g, t, 0.12, 0.002, 0.06);
    o.connect(g).connect(this.out(pos));
    o.start(t); o.stop(t + 0.08);
  }

  beep(freq = 880, dur = 0.07, vol = 0.12) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    this.env(g, t, vol, 0.005, dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  sting(win) {
    if (!this.ctx) return;
    const notes = win ? [523, 659, 784, 1047] : [392, 311, 233];
    notes.forEach((f, i) => {
      const t = this.ctx.currentTime + i * 0.14;
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      this.env(g, t, 0.18, 0.01, 0.3);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.35);
    });
  }

  // ---------------- loops ----------------

  startThruster() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 320;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    this.thrust = { gain: g, filter: f };
  }

  setThruster(level) {
    if (!this.thrust) return;
    const t = this.ctx.currentTime;
    this.thrust.gain.gain.setTargetAtTime(level * 0.22, t, 0.06);
    this.thrust.filter.frequency.setTargetAtTime(280 + level * 500, t, 0.08);
  }

  startAmbient() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.4;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 120;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 48;
    const g2 = ctx.createGain();
    g2.gain.value = 0.018;
    o.connect(g2).connect(this.master);
    o.start();
  }
}

import * as THREE from 'three';
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
