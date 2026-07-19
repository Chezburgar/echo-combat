// In-world interactive panels: canvas-textured screens with buttons,
// clickable via controller ray (VR) or camera crosshair ray (desktop).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const CYAN = '#4de8ff';
const ORANGE = '#ff8a3c';
const GREEN = '#4dff9e';

export class Panel {
  constructor(opts = {}) {
    this.w = opts.w || 0.92;
    this.h = opts.h || 0.68;
    this.pw = 512;
    this.ph = Math.round(this.pw * this.h / this.w);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.pw;
    this.canvas.height = this.ph;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    this.group = new THREE.Group();
    // backing frame
    const frame = new THREE.Mesh(
      new RoundedBoxGeometry(this.w + 0.09, this.h + 0.09, 0.05, 3, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x1a222e, roughness: 0.45, metalness: 0.85 })
    );
    frame.position.z = -0.032;
    this.group.add(frame);
    // glow trim
    const trim = new THREE.Mesh(
      new THREE.PlaneGeometry(this.w + 0.05, this.h + 0.05),
      new THREE.MeshBasicMaterial({ color: 0x14424e })
    );
    trim.position.z = -0.004;
    this.group.add(trim);

    this.screen = new THREE.Mesh(
      new THREE.PlaneGeometry(this.w, this.h),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false })
    );
    this.screen.userData.panel = this;
    this.group.add(this.screen);

    this.title = opts.title || '';
    this.buttons = [];
    this.hovered = null;
    this.onButton = null;
    this.drawBody = null;
  }

  setButtons(list) { this.buttons = list; }

  hitButton(u, v) {
    const x = u * this.pw, y = (1 - v) * this.ph;
    for (const b of this.buttons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  redraw() {
    const g = this.g, W = this.pw, H = this.ph;
    // base
    g.fillStyle = '#070d16';
    g.fillRect(0, 0, W, H);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(40,90,120,0.25)');
    grad.addColorStop(1, 'rgba(10,20,35,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // header
    g.fillStyle = 'rgba(77,232,255,0.12)';
    g.fillRect(0, 0, W, 54);
    g.fillStyle = CYAN;
    g.fillRect(0, 54, W, 2);
    g.font = 'bold 26px Arial';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = '#eaf7ff';
    g.save();
    g.translate(20, 28);
    g.fillText(this.spaced(this.title), 0, 2);
    g.restore();
    // corner deco
    g.fillStyle = ORANGE;
    g.fillRect(W - 30, 20, 14, 4);
    g.fillRect(W - 30, 28, 14, 4);

    if (this.drawBody) this.drawBody(g, W, H);

    for (const b of this.buttons) this.drawButton(g, b);

    // scanlines
    g.fillStyle = 'rgba(0,0,0,0.14)';
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);

    this.texture.needsUpdate = true;
  }

  drawButton(g, b) {
    const hov = this.hovered === b.id;
    const col = b.color === 'orange' ? ORANGE : b.color === 'green' ? GREEN : CYAN;
    g.fillStyle = hov ? this.rgba(col, 0.45) : this.rgba(col, 0.10);
    g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = hov ? '#ffffff' : col;
    g.lineWidth = hov ? 3 : 2;
    g.strokeRect(b.x, b.y, b.w, b.h);
    g.font = (b.small ? 'bold 18px' : 'bold 22px') + ' Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = hov ? '#ffffff' : '#dff4ff';
    g.fillText(this.spaced(b.label), b.x + b.w / 2, b.y + b.h / 2 + 1);
  }

  spaced(s) { return String(s).split('').join('  '); }

  rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
}

export class UISystem {
  constructor() {
    this.panels = [];
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 5;
    this.hits = {};          // rayId -> {panel, button, point, dist} | null
  }

  add(panel) { this.panels.push(panel); }
  clear() { this.panels = []; this.hits = {}; }

  // rays: [{id, origin:Vector3, dir:Vector3}]
  update(rays) {
    const screens = this.panels.map(p => p.screen);
    const newHover = new Map();  // panel -> buttonId
    for (const p of this.panels) newHover.set(p, null);
    for (const ray of rays) {
      this.raycaster.set(ray.origin, ray.dir);
      const hits = this.raycaster.intersectObjects(screens, false);
      if (hits.length) {
        const h = hits[0];
        const panel = h.object.userData.panel;
        const btn = h.uv ? panel.hitButton(h.uv.x, h.uv.y) : null;
        this.hits[ray.id] = { panel, button: btn, point: h.point, dist: h.distance };
        if (btn) newHover.set(panel, btn.id);
      } else {
        this.hits[ray.id] = null;
      }
    }
    for (const p of this.panels) {
      const hov = newHover.get(p);
      if (hov !== p.hovered) {
        p.hovered = hov;
        p.redraw();
      }
    }
  }

  // returns the clicked button id (and fires panel.onButton) or null
  click(rayId) {
    const h = this.hits[rayId];
    if (h && h.button) {
      if (h.panel.onButton) h.panel.onButton(h.button.id);
      return h.button.id;
    }
    return null;
  }

  anyHit(rayId) { return !!this.hits[rayId]; }
}
