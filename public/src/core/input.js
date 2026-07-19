// Desktop keyboard/mouse + VR controller polling with edge detection.
export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.pressed = new Set();      // cleared each frame — key-down edges
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.clicked = false;          // cleared each frame
    this.pointerLocked = false;
    this.wantPointerLock = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.target && e.target.tagName === 'INPUT') return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    dom.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (this.wantPointerLock && !this.pointerLocked) {
        dom.requestPointerLock();
      }
      this.mouseDown = true;
      this.clicked = true;
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === dom;
    });

    // VR controller state (filled by pollXR each frame)
    this.xr = {
      left: this.emptyHand(),
      right: this.emptyHand()
    };
  }

  emptyHand() {
    return {
      connected: false,
      stick: [0, 0],
      trigger: 0, triggerDown: false, triggerPressed: false,
      squeeze: 0, squeezeDown: false, squeezePressed: false, squeezeReleased: false,
      a: false, aPressed: false,
      b: false, bPressed: false
    };
  }

  key(code) { return this.keys.has(code); }
  keyPressed(code) { return this.pressed.has(code); }

  // called once per frame with the active XR session (or null)
  pollXR(session) {
    for (const hand of ['left', 'right']) {
      const h = this.xr[hand];
      let src = null;
      if (session) {
        for (const s of session.inputSources) {
          if (s.handedness === hand && s.gamepad) { src = s; break; }
        }
      }
      if (!src) {
        if (h.connected) this.xr[hand] = this.emptyHand();
        continue;
      }
      const gp = src.gamepad;
      const prevTrigger = h.triggerDown;
      const prevSqueeze = h.squeezeDown;
      const prevA = h.a;
      const prevB = h.b;
      h.connected = true;
      h.stick = [gp.axes[2] || 0, gp.axes[3] || 0];
      h.trigger = gp.buttons[0] ? gp.buttons[0].value : 0;
      h.triggerDown = h.trigger > 0.55;
      h.triggerPressed = h.triggerDown && !prevTrigger;
      h.squeeze = gp.buttons[1] ? gp.buttons[1].value : 0;
      h.squeezeDown = h.squeeze > 0.55;
      h.squeezePressed = h.squeezeDown && !prevSqueeze;
      h.squeezeReleased = !h.squeezeDown && prevSqueeze;
      h.a = gp.buttons[4] ? gp.buttons[4].pressed : false;
      h.aPressed = h.a && !prevA;
      h.b = gp.buttons[5] ? gp.buttons[5].pressed : false;
      h.bPressed = h.b && !prevB;
    }
  }

  consumeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return [dx, dy];
  }

  endFrame() {
    this.pressed.clear();
    this.clicked = false;
  }
}
