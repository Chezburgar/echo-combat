// Remote players & bots: interpolated avatars driven by network states.
import * as THREE from 'three';
import { RobotAvatar } from './robot.js';

const INTERP_DELAY = 130; // ms behind realtime

export function colorForId(id) {
  const n = parseInt(String(id).replace(/\D/g, ''), 10) || 1;
  const bot = String(id).startsWith('b');
  const hue = ((n * 0.61803) + (bot ? 0.35 : 0.05)) % 1;
  const c = new THREE.Color();
  c.setHSL(hue, bot ? 0.55 : 0.8, 0.55);
  return c.getHex();
}

// wire format: [px,py,pz, qx,qy,qz,qw, lpx..lpz, lqx..lqw, rpx..rpz, rqx..rqw, thr]
export function encodeState(headP, headQ, lhP, lhQ, rhP, rhQ, thr) {
  const r = (x) => Math.round(x * 1000) / 1000;
  return [
    r(headP.x), r(headP.y), r(headP.z),
    r(headQ.x), r(headQ.y), r(headQ.z), r(headQ.w),
    r(lhP.x), r(lhP.y), r(lhP.z),
    r(lhQ.x), r(lhQ.y), r(lhQ.z), r(lhQ.w),
    r(rhP.x), r(rhP.y), r(rhP.z),
    r(rhQ.x), r(rhQ.y), r(rhQ.z), r(rhQ.w),
    Math.round(thr * 100) / 100
  ];
}

export class RemotePlayer {
  constructor(scene, id, name) {
    this.id = id;
    this.name = name;
    this.avatar = new RobotAvatar(colorForId(id), name);
    this.avatar.group.visible = false;      // until the first state arrives
    scene.add(this.avatar.group);
    this.buf = [];
    this.headPos = new THREE.Vector3(0, -999, 0);
    this.hp = 100;
    this.alive = true;
    this.hasState = false;
    this._a = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    this._l = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    this._r = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  }

  push(d) {
    if (!Array.isArray(d) || d.length < 21) return;
    this.buf.push({ t: performance.now(), d });
    if (this.buf.length > 20) this.buf.shift();
    this.hasState = true;
    if (this.alive) this.avatar.group.visible = true;
  }

  update(dt) {
    if (!this.buf.length) return;
    const rt = performance.now() - INTERP_DELAY;
    let a = this.buf[0], b = this.buf[this.buf.length - 1];
    for (let i = 0; i < this.buf.length - 1; i++) {
      if (this.buf[i].t <= rt && this.buf[i + 1].t >= rt) {
        a = this.buf[i];
        b = this.buf[i + 1];
        break;
      }
    }
    const span = Math.max(1, b.t - a.t);
    const f = Math.max(0, Math.min(1, (rt - a.t) / span));
    this.decodeInto(a.d, b.d, f);
    // trim old
    while (this.buf.length > 2 && this.buf[1].t < rt - 400) this.buf.shift();

    this.avatar.setPose(this._a, this._l, this._r, dt);
    this.avatar.setThrottle(this.thr || 0);
    this.avatar.updateNameTag();
    this.headPos.copy(this._a.p);
  }

  decodeInto(d0, d1, f) {
    const L = (i) => d0[i] + (d1[i] - d0[i]) * f;
    this._a.p.set(L(0), L(1), L(2));
    this._a.q.set(d0[3], d0[4], d0[5], d0[6]).slerp(_q.set(d1[3], d1[4], d1[5], d1[6]), f);
    this._l.p.set(L(7), L(8), L(9));
    this._l.q.set(d0[10], d0[11], d0[12], d0[13]).slerp(_q.set(d1[10], d1[11], d1[12], d1[13]), f);
    this._r.p.set(L(14), L(15), L(16));
    this._r.q.set(d0[17], d0[18], d0[19], d0[20]).slerp(_q.set(d1[17], d1[18], d1[19], d1[20]), f);
    this.thr = d0[21] !== undefined ? d0[21] : 0;
  }

  setHealth(hp) {
    this.hp = hp;
    this.avatar.setHealth(hp / 100);
  }

  dispose() {
    this.avatar.dispose();
  }
}

const _q = new THREE.Quaternion();
