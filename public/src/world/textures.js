// Procedural canvas textures — hull plating, deck grids, hazard stripes,
// starfields. Gives every surface panel seams, rivets, wear and grime
// instead of flat colors.
import * as THREE from 'three';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let seed = 7;
function rnd() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

// ---------------------------------------------------------------- hull plating

// returns { map, bumpMap, roughnessMap } — big panels with seams, rivets,
// vents, warning decals and grime.
export function hullTexture({ base = '#8d98a5', dark = '#6d7885', accent = '#ff8a3c', size = 1024, panels = 6, accentChance = 0.1 } = {}) {
  const [c, g] = makeCanvas(size, size);
  const [cb, gb] = makeCanvas(size, size);   // bump: white = raised
  const [cr, gr] = makeCanvas(size, size);   // roughness: white = rough

  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  gb.fillStyle = '#808080';
  gb.fillRect(0, 0, size, size);
  gr.fillStyle = '#9a9a9a';
  gr.fillRect(0, 0, size, size);

  const cell = size / panels;
  for (let py = 0; py < panels; py++) {
    for (let px = 0; px < panels; px++) {
      const x = px * cell, y = py * cell;
      // subdividing some panels
      const divs = rnd() < 0.4 ? 2 : 1;
      for (let sy = 0; sy < divs; sy++) {
        for (let sx = 0; sx < divs; sx++) {
          const w = cell / divs, h = cell / divs;
          const X = x + sx * w, Y = y + sy * h;
          // slight tone variation per panel
          const v = (rnd() - 0.5) * 22;
          g.fillStyle = shade(rnd() < accentChance ? accent : (rnd() < 0.28 ? dark : base), v);
          g.globalAlpha = rnd() < accentChance ? 0.5 : 1;
          g.fillRect(X + 2, Y + 2, w - 4, h - 4);
          g.globalAlpha = 1;
          // seams
          g.strokeStyle = 'rgba(15,20,28,0.85)';
          g.lineWidth = 3;
          g.strokeRect(X + 2, Y + 2, w - 4, h - 4);
          gb.strokeStyle = '#3a3a3a';
          gb.lineWidth = 4;
          gb.strokeRect(X + 2, Y + 2, w - 4, h - 4);
          // rivets in corners
          if (rnd() < 0.8) {
            const r = 3.5, inset = 12;
            for (const [ox, oy] of [[inset, inset], [w - inset, inset], [inset, h - inset], [w - inset, h - inset]]) {
              g.fillStyle = 'rgba(25,32,42,0.9)';
              g.beginPath(); g.arc(X + ox, Y + oy, r, 0, 7); g.fill();
              g.fillStyle = 'rgba(220,230,240,0.35)';
              g.beginPath(); g.arc(X + ox - 1, Y + oy - 1, r * 0.45, 0, 7); g.fill();
              gb.fillStyle = '#c8c8c8';
              gb.beginPath(); gb.arc(X + ox, Y + oy, r, 0, 7); gb.fill();
            }
          }
          // vents / greebles
          const roll = rnd();
          if (roll < 0.14) {
            const vw = w * 0.4, vh = 8, n = 3 + Math.floor(rnd() * 3);
            const vx = X + (w - vw) / 2, vy = Y + h * 0.3;
            for (let i = 0; i < n; i++) {
              g.fillStyle = 'rgba(12,16,24,0.9)';
              g.fillRect(vx, vy + i * (vh + 5), vw, vh);
              gb.fillStyle = '#4a4a4a';
              gb.fillRect(vx, vy + i * (vh + 5), vw, vh);
            }
          } else if (roll < 0.2) {
            // small status light strip
            g.fillStyle = 'rgba(20,26,34,0.95)';
            g.fillRect(X + w * 0.2, Y + h * 0.75, w * 0.28, 10);
            g.fillStyle = rnd() < 0.5 ? '#59f0b2' : '#4de8ff';
            g.fillRect(X + w * 0.22, Y + h * 0.75 + 2, 12, 6);
          } else if (roll < 0.26) {
            // stencil text
            g.fillStyle = 'rgba(30,38,48,0.8)';
            g.font = `bold ${Math.floor(h * 0.13)}px Arial`;
            g.textAlign = 'left';
            g.fillText(['SEC-0' + Math.ceil(rnd() * 9), 'BAY ' + Math.ceil(rnd() * 12), 'PWR', 'O2', 'EXO', 'AUX'][Math.floor(rnd() * 6)], X + w * 0.14, Y + h * 0.55);
          }
          // rough patches
          gr.fillStyle = rnd() < 0.5 ? '#b8b8b8' : '#787878';
          gr.globalAlpha = 0.5;
          gr.fillRect(X + 2, Y + 2, w - 4, h - 4);
          gr.globalAlpha = 1;
        }
      }
    }
  }

  // grime streaks + scratches
  for (let i = 0; i < 220; i++) {
    g.strokeStyle = `rgba(${20 + rnd() * 30},${24 + rnd() * 30},${30 + rnd() * 30},${0.05 + rnd() * 0.1})`;
    g.lineWidth = 1 + rnd() * 2;
    const x = rnd() * size, y = rnd() * size;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 90, y + (rnd() - 0.5) * 90);
    g.stroke();
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(235,240,245,${0.03 + rnd() * 0.06})`;
    g.fillRect(rnd() * size, rnd() * size, 2 + rnd() * 30, 1 + rnd() * 2);
  }

  return { map: tex(c), bumpMap: tex(cb, false), roughnessMap: tex(cr, false) };
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const gg = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${gg},${b})`;
}

// ---------------------------------------------------------------- deck / floor

export function deckTexture({ size = 1024 } = {}) {
  const [c, g] = makeCanvas(size, size);
  const [cb, gb] = makeCanvas(size, size);
  g.fillStyle = '#3a424c';
  g.fillRect(0, 0, size, size);
  gb.fillStyle = '#808080';
  gb.fillRect(0, 0, size, size);
  const cell = size / 8;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const X = x * cell, Y = y * cell;
      g.fillStyle = shade('#3a424c', (rnd() - 0.5) * 14);
      g.fillRect(X + 1, Y + 1, cell - 2, cell - 2);
      g.strokeStyle = 'rgba(14,18,24,0.9)';
      g.lineWidth = 2;
      g.strokeRect(X + 1, Y + 1, cell - 2, cell - 2);
      gb.strokeStyle = '#404040';
      gb.lineWidth = 3;
      gb.strokeRect(X + 1, Y + 1, cell - 2, cell - 2);
      // tread dots
      if (rnd() < 0.7) {
        for (let i = 0; i < 5; i++) {
          for (let j = 0; j < 5; j++) {
            g.fillStyle = 'rgba(90,100,112,0.5)';
            g.beginPath();
            g.arc(X + cell * 0.2 + i * cell * 0.15, Y + cell * 0.2 + j * cell * 0.15, 2.5, 0, 7);
            g.fill();
            gb.fillStyle = '#a8a8a8';
            gb.beginPath();
            gb.arc(X + cell * 0.2 + i * cell * 0.15, Y + cell * 0.2 + j * cell * 0.15, 2.5, 0, 7);
            gb.fill();
          }
        }
      }
    }
  }
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(15,18,24,${0.04 + rnd() * 0.08})`;
    g.fillRect(rnd() * size, rnd() * size, 3 + rnd() * 40, 2 + rnd() * 3);
  }
  return { map: tex(c), bumpMap: tex(cb, false) };
}

// ---------------------------------------------------------------- hazard stripes

export function hazardTexture({ size = 256, a = '#ffb83c', b = '#171b21' } = {}) {
  const [c, g] = makeCanvas(size, size);
  g.fillStyle = b;
  g.fillRect(0, 0, size, size);
  g.fillStyle = a;
  const s = size / 4;
  g.save();
  for (let i = -4; i < 8; i++) {
    g.beginPath();
    g.moveTo(i * s, size);
    g.lineTo(i * s + size, 0);
    g.lineTo(i * s + size + s * 0.55, 0);
    g.lineTo(i * s + s * 0.55, size);
    g.fill();
  }
  g.restore();
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * size, Math.random() * size, 2 + Math.random() * 18, 1 + Math.random() * 3);
  return tex(c);
}

// ---------------------------------------------------------------- starfield

export function starfieldTexture({ w = 2048, h = 1024 } = {}) {
  const [c, g] = makeCanvas(w, h);
  g.fillStyle = '#020308';
  g.fillRect(0, 0, w, h);
  // nebulae
  for (let i = 0; i < 9; i++) {
    const x = rnd() * w, y = rnd() * h, r = 120 + rnd() * 330;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const hue = [200, 215, 260, 20][Math.floor(rnd() * 4)];
    grad.addColorStop(0, `hsla(${hue}, 70%, ${18 + rnd() * 14}%, ${0.16 + rnd() * 0.12})`);
    grad.addColorStop(1, 'transparent');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // stars
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * w, y = rnd() * h;
    const mag = rnd();
    const r = mag < 0.94 ? 0.7 : mag < 0.99 ? 1.4 : 2.2;
    const a = 0.3 + rnd() * 0.7;
    g.fillStyle = rnd() < 0.12 ? `rgba(160,200,255,${a})` : rnd() < 0.08 ? `rgba(255,220,180,${a})` : `rgba(235,240,255,${a})`;
    g.beginPath();
    g.arc(x, y, r, 0, 7);
    g.fill();
    if (mag > 0.99) {
      g.fillStyle = `rgba(200,225,255,0.25)`;
      g.fillRect(x - 6, y - 0.5, 12, 1);
      g.fillRect(x - 0.5, y - 6, 1, 12);
    }
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------------------------------------------------------------- glow strip

export function stripTexture(color = '#bff4ff') {
  // bright core across u (strip width), uniform along v (strip length)
  const [c, g] = makeCanvas(64, 8);
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 8);
  return tex(c);
}

// ---------------------------------------------------------------- big glowing sign

export function signTexture(text, { color = '#4de8ff', sub = '' } = {}) {
  const [c, g] = makeCanvas(1024, 256);
  g.clearRect(0, 0, 1024, 256);
  g.font = '900 150px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 34;
  g.fillStyle = '#ffffff';
  g.fillText(text.split('').join(' '), 512, sub ? 100 : 128);
  g.shadowBlur = 18;
  g.fillStyle = color;
  g.fillText(text.split('').join(' '), 512, sub ? 100 : 128);
  if (sub) {
    g.shadowBlur = 10;
    g.font = '600 44px Arial';
    g.fillStyle = '#ffcf9e';
    g.shadowColor = '#ff8a3c';
    g.fillText(sub.split('').join(' '), 512, 205);
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
