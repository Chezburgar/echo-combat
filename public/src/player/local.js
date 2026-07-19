// Local player: zero-g flight. Booster thrust (deliberately moderate),
// grab-anything climbing with momentum flings, snap turn in VR,
// mouse-look + WASD on desktop.
import * as THREE from 'three';

const MAXV = 5.5;        // m/s under thrust — deliberate, Echo-style pace
const MAXV_BOOST = 8;
const MAXV_HARD = 9.5;   // absolute cap (grab flings)
const ACCEL = 6.5;
const DAMP = 0.12;       // gentle drift decay per second
const BRAKE = 4.2;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _e1 = new THREE.Euler();

export class LocalPlayer {
  constructor(engine, input, audio) {
    this.engine = engine;
    this.input = input;
    this.audio = audio;
    this.world = null;

    this.pos = new THREE.Vector3(0, 1.4, 6);   // rig origin (world)
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.throttle = 0;
    this.boost = 1;
    this.canShoot = false;
    this.alive = true;

    this.grab = null;   // { hand:'left'|'right'|'pc', anchor:Vector3 }
    this.smoothVel = new THREE.Vector3();
    this.lastPos = this.pos.clone();
    this.cooldown = { left: 0, right: 0, pc: 0 };
    this.radius = 0.38;
  }

  headWorld(out) {
    // rig pos + rigQuat * hmdLocal
    out.copy(this.engine.camera.position).applyQuaternion(this.engine.rig.quaternion).add(this.pos);
    return out;
  }

  handWorld(hand, outP, outQ) {
    const h = this.engine.hands[hand];
    if (!h) return null;
    outP.copy(h.grip.position).applyQuaternion(this.engine.rig.quaternion).add(this.pos);
    if (outQ) outQ.copy(this.engine.rig.quaternion).multiply(h.grip.quaternion);
    return outP;
  }

  aimRay(hand, outP, outD) {
    const h = this.engine.hands[hand];
    if (!h) return null;
    outP.copy(h.ray.position).applyQuaternion(this.engine.rig.quaternion).add(this.pos);
    outD.set(0, 0, -1).applyQuaternion(_q1.copy(this.engine.rig.quaternion).multiply(h.ray.quaternion));
    return outP;
  }

  spawnAt(p, lookAt) {
    // place so the HEAD lands at p
    const head = _v1.copy(this.engine.camera.position).applyQuaternion(this.engine.rig.quaternion);
    this.pos.copy(p).sub(head);
    this.vel.set(0, 0, 0);
    this.grab = null;
    if (lookAt) {
      const d = _v2.copy(lookAt).sub(p);
      this.yaw = Math.atan2(-d.x, -d.z);
      this.pitch = 0;
      if (!this.engine.inVR) {
        this.engine.rig.quaternion.setFromEuler(_e1.set(0, this.yaw, 0));
      } else {
        // rotate rig around head so the view faces the target
        this.rotateRigAroundHead(this.yaw - this.rigYaw());
      }
    }
    this.applyTransform();
  }

  rigYaw() {
    _e1.setFromQuaternion(this.engine.rig.quaternion, 'YXZ');
    return _e1.y;
  }

  rotateRigAroundHead(deltaYaw) {
    const headBefore = this.headWorld(_v1.clone());
    this.engine.rig.quaternion.premultiply(_q1.setFromAxisAngle(_v2.set(0, 1, 0), deltaYaw));
    const headAfter = this.headWorld(_v2.clone());
    this.pos.add(headBefore.sub(headAfter));
  }

  update(dt, xrSession) {
    const events = { shots: [], grabbed: false, released: false, braking: false };
    const inp = this.input;
    const inVR = this.engine.inVR;

    // ---------------- orientation ----------------
    if (!inVR) {
      const [dx, dy] = inp.consumeMouse();
      this.yaw -= dx * 0.0022;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * 0.0022));
      this.engine.rig.quaternion.setFromEuler(_e1.set(0, this.yaw, 0));
      this.engine.camera.quaternion.setFromEuler(_e1.set(this.pitch, 0, 0));
      this.engine.camera.position.set(0, 0, 0);
    } else {
      // snap turn on right stick X
      const rx = inp.xr.right.stick[0];
      if (!this.snapArmed && Math.abs(rx) > 0.65) {
        this.rotateRigAroundHead(rx > 0 ? -Math.PI / 4 : Math.PI / 4);
        this.snapArmed = true;
        this.audio.beep(520, 0.04, 0.05);
      } else if (Math.abs(rx) < 0.35) this.snapArmed = false;
    }

    // ---------------- grab ----------------
    if (inVR) this.updateGrabVR(events);
    else this.updateGrabPC(events);

    // ---------------- thrust ----------------
    let thrustDir = _v1.set(0, 0, 0);
    let boosting = false;
    if (!this.grab) {
      if (!inVR) {
        const camQ = _q1.copy(this.engine.rig.quaternion).multiply(this.engine.camera.quaternion);
        if (inp.key('KeyW')) thrustDir.add(_v2.set(0, 0, -1).applyQuaternion(camQ));
        if (inp.key('KeyS')) thrustDir.add(_v2.set(0, 0, 1).applyQuaternion(camQ));
        if (inp.key('KeyA')) thrustDir.add(_v2.set(-1, 0, 0).applyQuaternion(camQ));
        if (inp.key('KeyD')) thrustDir.add(_v2.set(1, 0, 0).applyQuaternion(camQ));
        if (inp.key('Space')) thrustDir.add(_v2.set(0, 1, 0));
        if (inp.key('ControlLeft') || inp.key('KeyC')) thrustDir.add(_v2.set(0, -1, 0));
        boosting = inp.key('ShiftLeft') && this.boost > 0.05;
        if (inp.key('KeyX')) events.braking = true;
      } else {
        const ls = inp.xr.left.stick;
        const ry = inp.xr.right.stick[1];
        const headQ = _q1.copy(this.engine.rig.quaternion).multiply(this.engine.camera.quaternion);
        if (Math.abs(ls[0]) > 0.12 || Math.abs(ls[1]) > 0.12) {
          thrustDir.add(_v2.set(0, 0, -1).applyQuaternion(headQ).multiplyScalar(-ls[1]));
          thrustDir.add(_v2.set(1, 0, 0).applyQuaternion(headQ).multiplyScalar(ls[0]));
        }
        if (Math.abs(ry) > 0.25) thrustDir.add(_v2.set(0, -ry, 0));   // stick up = fly up
        boosting = inp.xr.left.a || inp.xr.right.a;
        if (inp.xr.left.squeezeDown && inp.xr.right.squeezeDown && !this.grab) events.braking = true;
      }
    }

    const thrustMag = Math.min(1, thrustDir.length());
    if (thrustMag > 0.01) thrustDir.normalize();

    // boost meter
    if (boosting && thrustMag > 0.01) {
      this.boost = Math.max(0, this.boost - dt * 0.45);
      if (this.boost <= 0.01) boosting = false;
    } else {
      this.boost = Math.min(1, this.boost + dt * 0.22);
    }

    if (!this.grab) {
      const cap = boosting ? MAXV_BOOST : MAXV;
      const accel = ACCEL * (boosting ? 1.8 : 1) * thrustMag;
      const prevSpeed = this.vel.length();
      this.vel.addScaledVector(thrustDir, accel * dt);
      // thrust can't push past cap (but doesn't kill an existing fling)
      const sp = this.vel.length();
      const limit = Math.max(prevSpeed, cap);
      if (sp > limit) this.vel.multiplyScalar(limit / sp);
      // drag
      this.vel.multiplyScalar(Math.exp(-(events.braking ? BRAKE : DAMP) * dt));
      if (this.vel.length() > MAXV_HARD) this.vel.multiplyScalar(MAXV_HARD / this.vel.length());

      this.pos.addScaledVector(this.vel, dt);
      this.collide();
    }

    // throttle for audio/jets
    const targetThrottle = this.grab ? 0 : thrustMag * (boosting ? 1 : 0.65);
    this.throttle += (targetThrottle - this.throttle) * Math.min(1, dt * 8);
    this.audio.setThruster(this.throttle);

    // smoothed body velocity (for grab flings)
    _v2.copy(this.pos).sub(this.lastPos).divideScalar(Math.max(dt, 0.001));
    this.smoothVel.lerp(_v2, Math.min(1, dt * 14));
    this.lastPos.copy(this.pos);

    // ---------------- shooting ----------------
    for (const k of Object.keys(this.cooldown)) this.cooldown[k] = Math.max(0, this.cooldown[k] - dt);
    if (this.canShoot && this.alive) {
      if (!inVR) {
        if (inp.mouseDown && inp.pointerLocked && this.cooldown.pc <= 0) {
          this.cooldown.pc = 0.26;
          const camQ = _q1.copy(this.engine.rig.quaternion).multiply(this.engine.camera.quaternion);
          const o = this.headWorld(_v2.clone());
          const d = _v3.set(0, 0, -1).applyQuaternion(camQ).clone();
          o.addScaledVector(d, 0.35).addScaledVector(_v3.set(0.12, -0.12, 0).applyQuaternion(camQ), 1);
          events.shots.push({ o, d, hand: 'pc' });
        }
      } else {
        for (const hand of ['left', 'right']) {
          if (inp.xr[hand].triggerDown && this.cooldown[hand] <= 0 && this.engine.hands[hand]) {
            this.cooldown[hand] = 0.28;
            const o = new THREE.Vector3(), d = new THREE.Vector3();
            this.aimRay(hand, o, d);
            o.addScaledVector(d, 0.12);
            events.shots.push({ o, d, hand });
          }
        }
      }
    }

    this.applyTransform();
    return events;
  }

  updateGrabVR(events) {
    const inp = this.input;
    const hp = _v2, hq = _q1;
    if (this.grab && this.grab.hand !== 'pc') {
      const hand = this.grab.hand;
      if (inp.xr[hand].squeezeReleased || !this.engine.hands[hand]) {
        // fling with body momentum
        this.vel.copy(this.smoothVel);
        if (this.vel.length() > MAXV_HARD) this.vel.multiplyScalar(MAXV_HARD / this.vel.length());
        this.grab = null;
        events.released = true;
        this.audio.clank(null);
      } else {
        // keep hand welded to the anchor: rig follows the hand's local motion
        const h = this.engine.hands[hand];
        _v3.copy(h.grip.position).applyQuaternion(this.engine.rig.quaternion); // hand offset from rig origin
        this.pos.copy(this.grab.anchor).sub(_v3);
        this.vel.set(0, 0, 0);
      }
      return;
    }
    for (const hand of ['left', 'right']) {
      if (inp.xr[hand].squeezePressed && this.engine.hands[hand] && this.world) {
        this.handWorld(hand, hp, hq);
        const g = this.world.grab(hp, 0.26);
        if (g) {
          this.grab = { hand, anchor: g.point.clone().addScaledVector(g.normal, 0.05) };
          events.grabbed = true;
          this.audio.clank(null);
          break;
        }
      }
    }
  }

  updateGrabPC(events) {
    const inp = this.input;
    if (this.grab) {
      if (inp.keyPressed('KeyE')) {
        this.grab = null;
        events.released = true;
      } else if (inp.keyPressed('Space')) {
        // push off along view direction
        const camQ = _q1.copy(this.engine.rig.quaternion).multiply(this.engine.camera.quaternion);
        this.vel.set(0, 0, -1).applyQuaternion(camQ).multiplyScalar(4.5);
        this.grab = null;
        events.released = true;
        this.audio.clank(null);
      } else {
        this.vel.set(0, 0, 0);
      }
      return;
    }
    if (inp.keyPressed('KeyE') && this.world) {
      const head = this.headWorld(_v2.clone());
      const g = this.world.grab(head, 2.4);
      if (g) {
        this.grab = { hand: 'pc', anchor: head.clone() };
        this.vel.set(0, 0, 0);
        events.grabbed = true;
        this.audio.clank(null);
      }
    }
  }

  collide() {
    if (!this.world) return;
    const head = this.headWorld(_v2.clone());
    const before = _v3.copy(head);
    let n = this.world.resolveSolids(head, this.radius);
    if (n) this.killVelInto(n);
    n = this.world.resolveContainment(head, this.radius);
    if (n) this.killVelInto(n);
    this.pos.add(head.sub(before));
  }

  killVelInto(n) {
    const d = this.vel.dot(n);
    if (d < 0) this.vel.addScaledVector(n, -d * 1.05);
  }

  applyTransform() {
    this.engine.rig.position.copy(this.pos);
  }
}
