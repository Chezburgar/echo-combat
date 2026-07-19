// Detailed reusable prop builders. Everything is composed from multiple
// parts + procedural materials so nothing reads as a bare primitive.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { materials } from './materials.js';
import { signTexture } from './textures.js';

export function mergeParts(parts) {
  // parts: [{geo, x,y,z, rx,ry,rz, sx,sy,sz}] → single merged geometry
  // (normalized to non-indexed: RoundedBoxGeometry is non-indexed, primitives aren't)
  const geos = parts.map(p => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    if (p.sx || p.sy || p.sz) g.scale(p.sx || 1, p.sy || 1, p.sz || 1);
    if (p.rx) g.rotateX(p.rx);
    if (p.ry) g.rotateY(p.ry);
    if (p.rz) g.rotateZ(p.rz);
    g.translate(p.x || 0, p.y || 0, p.z || 0);
    return g;
  });
  const merged = BGU.mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  return merged;
}

export function instanced(geo, mat, transforms, shadows = true) {
  const m = new THREE.InstancedMesh(geo, mat, transforms.length);
  const o = new THREE.Object3D();
  transforms.forEach((t, i) => {
    o.position.copy(t.p);
    if (t.q) o.quaternion.copy(t.q); else o.quaternion.identity();
    o.scale.setScalar(t.s || 1);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
  });
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}

// ---------------------------------------------------------------- grab rail

// yellow handrail — THE grab affordance, scattered everywhere
export function railGeometry(len = 0.9) {
  const r = 0.028;
  return mergeParts([
    { geo: new THREE.CylinderGeometry(r, r, len, 10), rz: Math.PI / 2 },
    { geo: new THREE.CylinderGeometry(r * 1.6, r * 1.6, 0.07, 8), rz: Math.PI / 2, x: -len / 2 + 0.03 },
    { geo: new THREE.CylinderGeometry(r * 1.6, r * 1.6, 0.07, 8), rz: Math.PI / 2, x: len / 2 - 0.03 },
    { geo: new THREE.BoxGeometry(0.06, 0.05, 0.09), x: -len / 2 + 0.03, z: -0.05 },
    { geo: new THREE.BoxGeometry(0.06, 0.05, 0.09), x: len / 2 - 0.03, z: -0.05 }
  ]);
}

// ---------------------------------------------------------------- girder truss

export function girder(len, size = 0.5) {
  const M = materials();
  const bar = 0.055;
  const parts = [];
  const s = size / 2;
  // 4 chords
  for (const [y, z] of [[-s, -s], [-s, s], [s, -s], [s, s]]) {
    parts.push({ geo: new THREE.BoxGeometry(len, bar, bar), y, z });
  }
  // cross-bracing
  const n = Math.max(2, Math.round(len / size));
  const seg = len / n;
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + seg * (i + 0.5);
    const diag = Math.hypot(seg, size);
    const ang = Math.atan2(size, seg) * (i % 2 ? 1 : -1);
    parts.push({ geo: new THREE.BoxGeometry(diag, bar * 0.8, bar * 0.8), x, y: 0, z: -s, rz: ang });
    parts.push({ geo: new THREE.BoxGeometry(diag, bar * 0.8, bar * 0.8), x, y: 0, z: s, rz: -ang });
    parts.push({ geo: new THREE.BoxGeometry(diag, bar * 0.8, bar * 0.8), x, y: -s, rz: 0, ry: ang });
    parts.push({ geo: new THREE.BoxGeometry(diag, bar * 0.8, bar * 0.8), x, y: s, ry: -ang });
  }
  // end plates
  parts.push({ geo: new THREE.BoxGeometry(0.04, size * 1.2, size * 1.2), x: -len / 2 });
  parts.push({ geo: new THREE.BoxGeometry(0.04, size * 1.2, size * 1.2), x: len / 2 });
  const mesh = new THREE.Mesh(mergeParts(parts), M.metalMid);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------- crate

export function crate(w = 1, h = 1, d = 1, glow = 'cyan') {
  const M = materials();
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, 0.05), M.hullDark);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  // edge frame
  const bar = 0.06;
  const fr = [];
  const hw = w / 2, hh = h / 2, hd = d / 2;
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) fr.push({ geo: new THREE.BoxGeometry(w + 0.04, bar, bar), y: sy * hh, z: sz * hd });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) fr.push({ geo: new THREE.BoxGeometry(bar, h + 0.04, bar), x: sx * hw, z: sz * hd });
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) fr.push({ geo: new THREE.BoxGeometry(bar, bar, d + 0.04), x: sx * hw, y: sy * hh });
  const frame = new THREE.Mesh(mergeParts(fr), M.metalDark);
  frame.castShadow = true;
  g.add(frame);
  // glowing label strip
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.5, 0.05, 0.012),
    glow === 'orange' ? M.glowOrange : M.glowCyan
  );
  strip.position.set(0, 0, hd + 0.005);
  g.add(strip);
  const strip2 = strip.clone();
  strip2.rotation.y = Math.PI;
  strip2.position.z = -hd - 0.005;
  g.add(strip2);
  // top handle
  const rail = new THREE.Mesh(railGeometry(w * 0.6), M.grabRail);
  rail.position.set(0, hh + 0.06, 0);
  rail.castShadow = true;
  g.add(rail);
  return g;
}

// ---------------------------------------------------------------- barrier pod

// floating cover block — arena staple
export function barrierPod(w = 2.4, h = 1.6, d = 0.7) {
  const M = materials();
  const g = new THREE.Group();
  const core = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, 0.08), M.hullLight);
  core.castShadow = core.receiveShadow = true;
  g.add(core);
  // angled wings top/bottom
  const wing = new THREE.Mesh(new RoundedBoxGeometry(w * 0.85, h * 0.28, d * 0.7, 2, 0.05), M.hullDark);
  wing.position.set(0, h / 2 + h * 0.08, 0);
  wing.rotation.x = 0.28;
  wing.castShadow = true;
  g.add(wing);
  const wing2 = wing.clone();
  wing2.position.y = -h / 2 - h * 0.08;
  wing2.rotation.x = -0.28;
  g.add(wing2);
  // glow edge
  const edge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.045, 0.02), M.glowCyan);
  edge.position.set(0, 0, d / 2 + 0.01);
  g.add(edge);
  const edge2 = edge.clone();
  edge2.position.z = -d / 2 - 0.01;
  g.add(edge2);
  // side rails
  const railL = new THREE.Mesh(railGeometry(h * 0.7), M.grabRail);
  railL.rotation.z = Math.PI / 2;
  railL.rotation.y = Math.PI / 2;
  railL.position.set(-w / 2 - 0.06, 0, 0);
  g.add(railL);
  const railR = railL.clone();
  railR.position.x = w / 2 + 0.06;
  railR.rotation.y = -Math.PI / 2;
  g.add(railR);
  return g;
}

// ---------------------------------------------------------------- pipes

export function pipeRun(points, r = 0.09, mat = null) {
  const M = materials();
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 6, r, 8, false), mat || M.pipe);
  tube.castShadow = tube.receiveShadow = true;
  g.add(tube);
  // flanges at intervals
  const flangeGeo = new THREE.CylinderGeometry(r * 1.45, r * 1.45, r * 1.1, 10);
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const f = new THREE.Mesh(flangeGeo, M.metalDark);
    f.position.copy(p);
    f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    f.castShadow = true;
    g.add(f);
  }
  return g;
}

// ---------------------------------------------------------------- light bar

export function lightBar(len, color = 'cyan', withLight = 0) {
  const M = materials();
  const g = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, 0.09, 0.06), M.metalDark);
  g.add(housing);
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(len, 0.05, 0.03),
    color === 'orange' ? M.glowOrange : color === 'white' ? M.glowWhite : M.glowCyan
  );
  bar.position.z = 0.025;
  g.add(bar);
  if (withLight > 0) {
    const c = color === 'orange' ? 0xff9a50 : color === 'white' ? 0xdfeeff : 0x6adcff;
    const l = new THREE.PointLight(c, withLight, len * 9, 1.8);
    l.position.z = 0.35;
    g.add(l);
  }
  return g;
}

// ---------------------------------------------------------------- terminal console

export function terminalConsole() {
  const M = materials();
  const g = new THREE.Group();

  // pedestal
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.7, 1.0, 0.5, 3, 0.05), M.hullDark);
  base.position.y = 0.5;
  base.castShadow = base.receiveShadow = true;
  g.add(base);
  const foot = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.14, 0.75, 2, 0.04), M.metalDark);
  foot.position.y = 0.07;
  foot.castShadow = foot.receiveShadow = true;
  g.add(foot);

  // angled body
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.15, 0.5, 0.42, 3, 0.05), M.hullLight);
  body.position.set(0, 1.08, 0.02);
  body.rotation.x = -0.35;
  body.castShadow = true;
  g.add(body);

  // keyboard deck with individual key blocks
  const keys = [];
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 10; k++) {
      keys.push({
        geo: new THREE.BoxGeometry(0.065, 0.02, 0.065),
        x: -0.36 + k * 0.08, y: 0.015, z: -0.1 + r * 0.085
      });
    }
  }
  const deck = new THREE.Group();
  const keysMesh = new THREE.Mesh(mergeParts(keys), M.metalDark);
  deck.add(keysMesh);
  deck.position.set(0, 1.22, 0.13);
  deck.rotation.x = -0.35;
  g.add(deck);

  // screen support arm
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 10), M.metalMid);
  arm.position.set(0, 1.45, -0.12);
  g.add(arm);

  // side glow slats
  for (const sx of [-1, 1]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.7, 0.06), M.glowOrange);
    slat.position.set(sx * 0.37, 0.55, 0.22);
    g.add(slat);
  }
  // cables to floor
  const cable = pipeRun([
    new THREE.Vector3(0.2, 0.9, -0.2),
    new THREE.Vector3(0.3, 0.4, -0.35),
    new THREE.Vector3(0.25, 0.05, -0.5)
  ], 0.03);
  g.add(cable);

  // where the ui3d Panel should be mounted
  const screenAnchor = new THREE.Object3D();
  screenAnchor.position.set(0, 1.85, -0.1);
  screenAnchor.rotation.x = -0.12;
  g.add(screenAnchor);
  g.userData.screenAnchor = screenAnchor;
  return g;
}

// ---------------------------------------------------------------- door ring (tunnel mouth)

const doorRingCache = new Map();
export function doorRing(radius) {
  const M = materials();
  const key = Math.round(radius * 10);
  let geo = doorRingCache.get(key);
  if (!geo) {
    // ring + clamp blocks merged into one geometry (2 draw calls per ring total)
    const parts = [{ geo: new THREE.TorusGeometry(radius + 0.18, 0.22, 10, 28) }];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      parts.push({
        geo: new RoundedBoxGeometry(0.5, 0.32, 0.34, 2, 0.04),
        x: Math.cos(a) * (radius + 0.22), y: Math.sin(a) * (radius + 0.22), rz: a
      });
    }
    geo = mergeParts(parts);
    doorRingCache.set(key, geo);
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, M.hullDark));
  const glow = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.02, 0.05, 8, 28), M.glowCyan);
  g.add(glow);
  return g;
}

// ---------------------------------------------------------------- glowing sign

export function sign(text, opts = {}) {
  const t = signTexture(text, opts);
  const w = opts.w || 6;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, w / 4),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false })
  );
  return mesh;
}

// ---------------------------------------------------------------- reactor column (arena centerpiece)

export function reactorColumn(height = 16, radius = 1.6) {
  const M = materials();
  const g = new THREE.Group();
  const segs = 5;
  const segH = height / segs;
  for (let i = 0; i < segs; i++) {
    const y = -height / 2 + segH * (i + 0.5);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, segH - 0.5, 18), M.hullLight);
    body.position.y = y;
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.82, radius * 0.82, 0.42, 18), M.glowOrange);
    band.position.y = y + segH / 2 - 0.05;
    g.add(band);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.18, radius * 1.18, 0.22, 18), M.metalDark);
    collar.position.y = y - segH / 2 + 0.18;
    collar.castShadow = true;
    g.add(collar);
  }
  // vertical conduits
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, height * 0.92, 8), M.pipeOrange);
    pipe.position.set(Math.cos(a) * radius * 1.12, 0, Math.sin(a) * radius * 1.12);
    pipe.castShadow = true;
    g.add(pipe);
  }
  // caps
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.35, radius * 0.9, 1.1, 18), M.hullDark);
    cap.position.y = s * (height / 2 + 0.5);
    if (s === 1) cap.rotation.z = Math.PI;
    cap.castShadow = true;
    g.add(cap);
  }
  const light = new THREE.PointLight(0xff8a3c, 30, 40, 1.9);
  g.add(light);
  return g;
}

// ---------------------------------------------------------------- holo ring sculpture (lobby)

export function holoRings(radius = 2.2) {
  const M = materials();
  const g = new THREE.Group();
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.06, 8, 48), M.glowCyan);
  const r2 = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.72, 0.05, 8, 42), M.glowOrange);
  const r3 = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.45, 0.04, 8, 36), M.glowWhite);
  r2.rotation.x = Math.PI / 3;
  r3.rotation.y = Math.PI / 3;
  g.add(r1, r2, r3);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 0.18, 1), M.glowWhite);
  g.add(core);
  g.userData.animate = (t) => {
    r1.rotation.z = t * 0.21;
    r1.rotation.x = Math.sin(t * 0.3) * 0.4;
    r2.rotation.z = -t * 0.34;
    r3.rotation.x = t * 0.45;
    core.rotation.y = t * 0.8;
  };
  return g;
}
