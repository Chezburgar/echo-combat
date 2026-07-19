// The battle arena: a claustrophobic tunnel NETWORK — 16 compact chambers
// (junction spheres, two hub rooms, two cargo boxes) laced together by two
// dozen tunnels with cover slabs, ribs and light strips. No big open spaces:
// every fight happens in a corridor, an intersection or a cramped room.
import * as THREE from 'three';
import { materials } from './materials.js';
import { CollisionWorld } from './colliders.js';
import {
  railGeometry, instanced, girder, crate, barrierPod, doorRing,
  lightBar, reactorColumn, pipeRun, holoRings
} from './props.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- chamber graph -------------------------------------------------------
// kind sphere: {p, r}; kind box: {p (center), size}
const CHAMBERS = {
  hubA: { p: V(0, 0, 0), r: 11, kind: 'sphere', hub: 'reactor' },
  hubB: { p: V(0, 6, -70), r: 11, kind: 'sphere', hub: 'holo' },
  boxA: { p: V(44, -6, -34), size: V(20, 12, 16), kind: 'box', accent: 'orange', win: 'right' },
  boxB: { p: V(-40, 8, -38), size: V(18, 12, 18), kind: 'box', accent: 'cyan', win: 'far' },
  j1: { p: V(24, 4, -12), r: 6.5, kind: 'sphere' },
  j2: { p: V(-22, -6, -14), r: 6.5, kind: 'sphere' },
  j3: { p: V(40, 10, -58), r: 6, kind: 'sphere' },
  j4: { p: V(-34, -2, -62), r: 6.5, kind: 'sphere' },
  j5: { p: V(0, -14, -36), r: 7, kind: 'sphere' },
  j6: { p: V(0, 18, -36), r: 6, kind: 'sphere' },
  j7: { p: V(58, 2, -10), r: 6, kind: 'sphere' },
  j8: { p: V(-52, 2, 2), r: 6, kind: 'sphere' },
  j9: { p: V(20, -10, -52), r: 5.5, kind: 'sphere' },
  j10: { p: V(-16, 14, -58), r: 5.5, kind: 'sphere' },
  j11: { p: V(14, 2, 28), r: 6, kind: 'sphere' },
  j12: { p: V(-14, -4, 30), r: 6, kind: 'sphere' }
};

// [from, to, radius]
const EDGES = [
  ['hubA', 'j1', 3.2], ['hubA', 'j2', 3.2], ['hubA', 'j6', 2.8], ['hubA', 'j5', 3.2],
  ['hubA', 'j11', 3.2], ['hubA', 'j12', 2.8], ['j11', 'j12', 2.6],
  ['j1', 'j7', 3.2], ['j7', 'boxA', 3.2], ['boxA', 'j3', 3.2], ['j3', 'hubB', 3.2],
  ['boxA', 'j9', 2.8], ['j9', 'j5', 2.8], ['j5', 'hubB', 3.6],
  ['j6', 'j10', 2.8], ['j10', 'hubB', 2.8],
  ['j2', 'j8', 3.2], ['j8', 'boxB', 3.2], ['boxB', 'j4', 3.2], ['j4', 'hubB', 3.2],
  ['j2', 'j5', 2.6], ['j1', 'j6', 2.6], ['boxB', 'j10', 2.6]
];

function chamberInnerRadius(c) {
  return c.kind === 'sphere' ? c.r : Math.min(c.size.x, c.size.y, c.size.z) / 2;
}

function scaleUV(geo, ru, rv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
  return geo;
}

function wallMesh(w, h, mat, repX, repY) {
  return new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(w, h), repX, repY), mat);
}

export function buildArena(engine) {
  const M = materials();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010208);
  scene.fog = new THREE.FogExp2(0x04060c, 0.007);

  const world = new CollisionWorld();
  const railT = [];
  const railGeo = railGeometry(0.95);

  // starfield (seen through box-room windows)
  const stars = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 20), M.starfield);
  scene.add(stars);

  // ---------------- chambers ----------------
  for (const [name, c] of Object.entries(CHAMBERS)) {
    if (c.kind === 'sphere') {
      world.addSphere(c.p, c.r);
      buildSphereChamber(scene, M, world, railT, c);
    } else {
      const min = c.p.clone().sub(c.size.clone().multiplyScalar(0.5));
      const max = c.p.clone().add(c.size.clone().multiplyScalar(0.5));
      world.addBox(min, max);
      buildBoxChamber(scene, M, world, railT, { min, max, windowWall: c.win, accent: c.accent });
    }
  }

  // ---------------- tunnels ----------------
  for (const [na, nb, r] of EDGES) {
    const A = CHAMBERS[na], B = CHAMBERS[nb];
    const dir = B.p.clone().sub(A.p).normalize();
    const a = A.p.clone().addScaledVector(dir, Math.max(2, chamberInnerRadius(A) - 2.5));
    const b = B.p.clone().addScaledVector(dir, -Math.max(2, chamberInnerRadius(B) - 2.5));
    world.addTube(a, b, r);
    buildTunnelVisual(scene, M, world, a, b, r, railT);

    // door rings at both mouths
    for (const [p, sgn] of [[a, 1], [b, -1]]) {
      const ring = doorRing(r);
      ring.position.copy(p).addScaledVector(dir, sgn * 0.3);
      ring.quaternion.setFromUnitVectors(V(0, 0, 1), dir);
      scene.add(ring);
    }
  }

  scene.add(instanced(railGeo, M.grabRail, railT, false));
  scene.add(new THREE.HemisphereLight(0x7fa8cc, 0x232833, 0.65));

  // ---------------- spawns & waypoints ----------------
  const spawns = [
    V(2, 0, 3), V(-2, 4, -68), V(44, -6, -30), V(-40, 8, -42),
    V(0, -13, -33), V(0, 17, -33), V(57, 2, -7), V(-51, 2, 5),
    V(39, 9, -55), V(-33, -2, -59), V(13, 2, 25), V(-13, -4, 27)
  ];

  const names = Object.keys(CHAMBERS);
  const waypoints = {
    nodes: names.map(n => CHAMBERS[n].p.clone()),
    edges: EDGES.map(([a, b]) => [names.indexOf(a), names.indexOf(b)])
  };

  function animate(t) {
    stars.rotation.y = t * 0.002;
    if (scene.userData.holo) scene.userData.holo.userData.animate(t);
  }

  return { scene, world, spawns, waypoints, animate, stars };
}

// ------------------------------------------------------------------ helpers

function railAt(p, mountDir, along) {
  const z = mountDir.clone().negate().normalize();
  const x = along.clone().normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return { p: p.clone(), q: new THREE.Quaternion().setFromRotationMatrix(m) };
}

function buildTunnelVisual(scene, M, world, a, b, r, railT) {
  const dir = b.clone().sub(a).normalize();
  const len = a.distanceTo(b);
  const mid = a.clone().lerp(b, 0.5);

  const group = new THREE.Group();
  group.position.copy(mid);
  group.quaternion.setFromUnitVectors(V(0, 1, 0), dir);

  const tube = new THREE.Mesh(
    scaleUV(new THREE.CylinderGeometry(r, r, len, 20, 1, true), 5, Math.max(2, Math.round(len / 3.2))),
    M.hullDark.clone()
  );
  tube.material.side = THREE.BackSide;
  group.add(tube);

  // rib rings
  const ribGeo = new THREE.TorusGeometry(r - 0.06, 0.11, 8, 24);
  const nRibs = Math.max(2, Math.floor(len / 5.5));
  const ribT = [];
  for (let i = 1; i < nRibs; i++) {
    const t = -len / 2 + (len / nRibs) * i;
    ribT.push({ p: new THREE.Vector3(0, t, 0), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)) });
  }
  group.add(instanced(ribGeo, M.metalMid, ribT, false));

  // running light strips
  for (const [ang, mat] of [[0.7, M.stripCyan], [Math.PI - 0.7, M.stripCyan], [Math.PI + 0.7, M.stripOrange], [-0.7, M.stripOrange]]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.16, len * 0.94), mat);
    strip.position.set(Math.cos(ang) * (r - 0.07), 0, Math.sin(ang) * (r - 0.07));
    strip.rotation.y = -ang - Math.PI / 2;
    group.add(strip);
  }

  // interior grab rails
  const q = group.quaternion;
  const nSeg = Math.floor(len / 4.5);
  for (let i = 0; i < nSeg; i++) {
    const t = -len / 2 + 4.5 * (i + 0.75);
    for (const ang of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) {
      const local = new THREE.Vector3(Math.cos(ang) * (r - 0.1), t, Math.sin(ang) * (r - 0.1));
      const wp = local.clone().applyQuaternion(q).add(mid);
      const outward = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)).applyQuaternion(q);
      railT.push(railAt(wp, outward, dir));
    }
  }

  // cover slabs inside longer tunnels — fights happen around these
  if (len > 22) {
    const spots = len > 38 ? [0.32, 0.68] : [0.5];
    let flip = Math.random() < 0.5 ? 1 : -1;
    for (const t of spots) {
      const p = a.clone().lerp(b, t);
      // offset off-axis so there's always a way around
      const side = new THREE.Vector3(dir.z, dir.x, -dir.y).normalize();
      p.addScaledVector(side, flip * (r - 1.9));
      flip = -flip;
      const pod = barrierPod(2.2, 1.9, 0.55);
      pod.position.copy(p);
      pod.quaternion.setFromUnitVectors(V(0, 0, 1), dir);
      pod.rotateZ(Math.random() * 3);
      scene.add(pod);
      world.addSolidSphere(p, 1.2);
    }
  }

  if (len > 20) {
    const l = new THREE.PointLight(0x5ab8d8, 8, r * 6, 1.8);
    l.position.copy(mid);
    scene.add(l);
  }

  scene.add(group);
}

function buildBoxChamber(scene, M, world, railT, opts) {
  const { min, max } = opts;
  const size = max.clone().sub(min);
  const c = min.clone().add(max).multiplyScalar(0.5);

  const g = new THREE.Group();
  const mk = (w, h, mat) => wallMesh(w, h, mat, w / 4.5, h / 4.5);
  const floor = mk(size.x, size.z, M.deck);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(c.x, min.y, c.z);
  g.add(floor);
  const ceil = mk(size.x, size.z, M.hullDark);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(c.x, max.y, c.z);
  g.add(ceil);
  const wl = mk(size.z, size.y, M.hullLight);
  wl.rotation.y = Math.PI / 2;
  wl.position.set(min.x, c.y, c.z);
  g.add(wl);
  const wr = mk(size.z, size.y, M.hullLight);
  wr.rotation.y = -Math.PI / 2;
  wr.position.set(max.x, c.y, c.z);
  g.add(wr);
  const wn = mk(size.x, size.y, M.hullLight);
  wn.position.set(c.x, c.y, min.z);
  g.add(wn);
  const wf = mk(size.x, size.y, M.hullLight);
  wf.rotation.y = Math.PI;
  wf.position.set(c.x, c.y, max.z);
  g.add(wf);

  // window with star view
  let winPos, winRot;
  if (opts.windowWall === 'far') { winPos = new THREE.Vector3(c.x, c.y + 1, min.z + 0.15); winRot = 0; }
  else { winPos = new THREE.Vector3(max.x - 0.15, c.y + 1, c.z); winRot = -Math.PI / 2; }
  const winG = new THREE.Group();
  winG.position.copy(winPos);
  winG.rotation.y = winRot;
  const glassW = Math.min(12, (opts.windowWall === 'far' ? size.x : size.z) - 5);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(glassW, 4.5), M.glass);
  winG.add(glass);
  for (let i = 0; i <= 3; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.5, 0.25), M.metalDark);
    bar.position.x = -glassW / 2 + (glassW / 3) * i;
    winG.add(bar);
  }
  for (const y of [-2.4, 2.4]) {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(glassW + 1, 0.4, 0.4), M.hullDark);
    sill.position.y = y;
    winG.add(sill);
  }
  g.add(winG);

  // lights
  for (const dz of [-size.z / 4, size.z / 4]) {
    const bar = lightBar(size.x * 0.55, 'white', 16);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(c.x, max.y - 0.15, c.z + dz);
    g.add(bar);
  }
  const accent = new THREE.PointLight(opts.accent === 'orange' ? 0xff9050 : 0x6adcff, 14, 26, 1.8);
  accent.position.copy(c);
  g.add(accent);

  // crates + pods + girder
  const stacks = [
    [min.x + 2.5, min.y + 1, min.z + 3], [max.x - 3, min.y + 1.2, max.z - 3.5]
  ];
  for (const [x, y, z] of stacks) {
    const c1 = crate(1.5, 1.5, 1.5, 'cyan');
    c1.position.set(x, y, z);
    c1.rotation.y = Math.random() * 3;
    g.add(c1);
    world.addSolidBox(V(x - 0.85, y - 0.85, z - 0.85), V(x + 0.85, y + 0.85, z + 0.85));
    const c2 = crate(1.0, 1.0, 1.0, 'orange');
    c2.position.set(x + 0.3, y + 1.35, z - 0.2);
    c2.rotation.y = Math.random() * 3;
    g.add(c2);
    world.addSolidBox(V(x - 0.25, y + 0.85, z - 0.75), V(x + 0.85, y + 1.9, z + 0.35));
  }
  for (let i = 0; i < 2; i++) {
    const x = c.x + (i ? 1 : -1) * size.x * 0.2;
    const y = c.y + (i ? -1 : 1) * size.y * 0.15;
    const z = c.z + (i ? 1 : -1) * size.z * 0.18;
    const pod = barrierPod(2.2, 1.5, 0.6);
    pod.position.set(x, y, z);
    pod.rotation.set(i * 0.5, i * 1.3, 0);
    g.add(pod);
    world.addSolidSphere(V(x, y, z), 1.2);
  }
  const gd = girder(size.x * 0.65, 0.5);
  gd.position.set(c.x, c.y + size.y * 0.26, c.z);
  g.add(gd);
  world.addSolidCapsule(
    V(c.x - size.x * 0.32, c.y + size.y * 0.26, c.z),
    V(c.x + size.x * 0.32, c.y + size.y * 0.26, c.z), 0.4
  );

  g.add(pipeRun([
    V(min.x + 0.6, max.y - 0.7, min.z + 1.5),
    V(min.x + 0.8, max.y - 1.0, c.z),
    V(min.x + 0.6, max.y - 0.7, max.z - 1.5)
  ], 0.12, opts.accent === 'orange' ? M.pipeOrange : M.pipe));

  // wall rails
  for (const y of [c.y - size.y * 0.22, c.y + size.y * 0.22]) {
    for (let zi = 0; zi < 3; zi++) {
      const z = min.z + size.z * (0.25 + 0.25 * zi);
      railT.push(railAt(V(min.x + 0.08, y, z), V(-1, 0, 0), V(0, 0, 1)));
      railT.push(railAt(V(max.x - 0.08, y, z), V(1, 0, 0), V(0, 0, 1)));
    }
  }
  for (let xi = 0; xi < 3; xi++) {
    const x = min.x + size.x * (0.25 + 0.25 * xi);
    for (let zi = 0; zi < 2; zi++) {
      const z = min.z + size.z * (0.33 + 0.33 * zi);
      railT.push(railAt(V(x, min.y + 0.08, z), V(0, -1, 0), V(1, 0, 0)));
      railT.push(railAt(V(x, max.y - 0.08, z), V(0, 1, 0), V(1, 0, 0)));
    }
  }

  scene.add(g);
}

function buildSphereChamber(scene, M, world, railT, cdef) {
  const center = cdef.p, r = cdef.r;
  const g = new THREE.Group();
  g.position.copy(center);

  const glowColor = cdef.hub === 'reactor' ? 0xffa060 : cdef.hub === 'holo' ? 0x6adcff : (r >= 6.5 ? 0x6adcff : 0x9fd8ff);

  const shell = new THREE.Mesh(
    scaleUV(new THREE.SphereGeometry(r, 36, 24), Math.max(3, Math.round(r * 0.55)), Math.max(2, Math.round(r * 0.35))),
    M.hullDark.clone()
  );
  shell.material.side = THREE.BackSide;
  g.add(shell);

  const band = new THREE.Mesh(new THREE.TorusGeometry(r - 0.35, 0.32, 8, 48), M.metalDark);
  band.rotation.x = Math.PI / 2;
  g.add(band);
  const glow = new THREE.Mesh(new THREE.TorusGeometry(r - 0.35, 0.09, 8, 48), new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: glowColor, emissiveIntensity: 2.2, roughness: 0.4
  }));
  glow.rotation.x = Math.PI / 2;
  glow.position.y = 0.4;
  g.add(glow);

  const light = new THREE.PointLight(glowColor, cdef.hub ? 55 : 30, r * 4.5, 1.7);
  g.add(light);

  if (cdef.hub === 'reactor') {
    const reactor = reactorColumn(9, 1.3);
    g.add(reactor);
    world.addSolidCapsule(
      V(center.x, center.y - 5, center.z), V(center.x, center.y + 5, center.z), 1.7
    );
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const x = Math.cos(a) * r * 0.55, y = (i - 1) * r * 0.3, z = Math.sin(a) * r * 0.55;
      const pod = barrierPod(2.2, 1.5, 0.6);
      pod.position.set(x, y, z);
      pod.rotation.set(i, i * 0.8, 0.2);
      g.add(pod);
      world.addSolidSphere(V(center.x + x, center.y + y, center.z + z), 1.2);
    }
  } else if (cdef.hub === 'holo') {
    const holo = holoRings(1.7);
    g.add(holo);
    scene.userData.holo = holo;
    world.addSolidSphere(center, 0.5);
    const gd = girder(r * 1.2, 0.45);
    gd.position.set(0, -r * 0.4, 0);
    gd.rotation.y = 0.7;
    g.add(gd);
    const ax = V(Math.cos(0.7), 0, -Math.sin(0.7)).multiplyScalar(r * 0.6);
    world.addSolidCapsule(
      V(center.x - ax.x, center.y - r * 0.4, center.z - ax.z),
      V(center.x + ax.x, center.y - r * 0.4, center.z + ax.z), 0.35
    );
    for (let i = 0; i < 2; i++) {
      const x = (i ? 1 : -1) * r * 0.5;
      const pod = barrierPod(2.0, 1.4, 0.55);
      pod.position.set(x, i ? r * 0.3 : -r * 0.25, i ? -r * 0.3 : r * 0.35);
      pod.rotation.set(i * 1.2, i * 0.6, 0);
      g.add(pod);
      world.addSolidSphere(V(center.x + x, center.y + (i ? r * 0.3 : -r * 0.25), center.z + (i ? -r * 0.3 : r * 0.35)), 1.1);
    }
  } else if (r >= 6) {
    // ordinary junction: one cover pod + a pipe crossing
    const pod = barrierPod(1.9, 1.3, 0.5);
    pod.position.set(r * 0.3, -r * 0.2, r * 0.25);
    pod.rotation.set(0.6, 1.1, 0.2);
    g.add(pod);
    world.addSolidSphere(V(center.x + r * 0.3, center.y - r * 0.2, center.z + r * 0.25), 1.05);
    g.add(pipeRun([
      V(-r * 0.8, r * 0.4, 0), V(0, r * 0.55, -r * 0.3), V(r * 0.8, r * 0.4, 0.2)
    ], 0.1));
  }

  // shell rails
  for (let lat = -40; lat <= 40; lat += 40) {
    for (let lon = 0; lon < 360; lon += 60) {
      const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
      const n = V(Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo));
      const p = n.clone().multiplyScalar(r - 0.35).add(center);
      const east = V(-Math.sin(lo), 0, Math.cos(lo));
      railT.push(railAt(p, n, east));
    }
  }

  scene.add(g);
}
