// The social hub: a zero-g hangar with a star window, floating props to
// climb on, and three matchmaking terminals.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { materials } from './materials.js';
import { CollisionWorld } from './colliders.js';
import { Panel } from '../core/ui3d.js';
import {
  railGeometry, instanced, girder, crate, barrierPod, pipeRun,
  lightBar, terminalConsole, sign, holoRings
} from './props.js';

// hangar interior: x[-14,14] y[0,11] z[-18,18]
const W = 14, H = 11, D = 18;

function wallMesh(w, h, mat, repX, repY) {
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repX, uv.getY(i) * repY);
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}

export function buildLobby(engine) {
  const M = materials();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02030a);
  scene.fog = new THREE.FogExp2(0x070b12, 0.011);

  const world = new CollisionWorld();
  world.addBox(new THREE.Vector3(-W, 0, -D), new THREE.Vector3(W, H, D));

  // ---------------- shell ----------------
  const floor = wallMesh(W * 2, D * 2, M.deck, 7, 9);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const ceil = wallMesh(W * 2, D * 2, M.hullDark, 5, 6);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = H;
  scene.add(ceil);

  const wallL = wallMesh(D * 2, H, M.hullLight, 7, 2.2);
  wallL.rotation.y = Math.PI / 2;
  wallL.position.set(-W, H / 2, 0);
  scene.add(wallL);

  const wallR = wallMesh(D * 2, H, M.hullLight, 7, 2.2);
  wallR.rotation.y = -Math.PI / 2;
  wallR.position.set(W, H / 2, 0);
  scene.add(wallR);

  // back wall (+z): hangar door
  const wallB = wallMesh(W * 2, H, M.hullDark, 5, 2);
  wallB.rotation.y = Math.PI;
  wallB.position.set(0, H / 2, D);
  scene.add(wallB);

  // door slabs + hazard frame
  const door = new THREE.Mesh(new RoundedBoxGeometry(8, 7, 0.5, 3, 0.1), M.hullLight);
  door.position.set(0, 3.8, D - 0.2);
  door.receiveShadow = true;
  scene.add(door);
  const doorSeam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 6.6, 0.1), M.glowOrange.clone());
  doorSeam.position.set(0, 3.8, D - 0.5);
  scene.add(doorSeam);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.6, 0.6), M.hazard);
  frame.position.set(0, 7.6, D - 0.35);
  scene.add(frame);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7.4, 0.6), M.hazard);
    post.position.set(sx * 4.4, 3.9, D - 0.35);
    scene.add(post);
  }

  // big glowing sign above door
  const logo = sign('ECHO COMBAT', { w: 10, sub: 'STATION 07 // HANGAR BAY' });
  logo.position.set(0, 9.4, D - 0.45);
  logo.rotation.y = Math.PI;
  scene.add(logo);

  // front wall (-z): observation window
  const winFrame = wallMesh(W * 2, H, M.hullDark, 5, 2);
  winFrame.position.set(0, H / 2, -D);
  scene.add(winFrame);
  // window cutout look: mullion grid + glass slightly proud of the wall
  const glassW = 22, glassH = 7;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(glassW, glassH), M.glass);
  glass.position.set(0, 5.2, -D + 0.25);
  scene.add(glass);
  const mull = [];
  for (let i = 0; i <= 4; i++) mull.push({ x: -glassW / 2 + (glassW / 4) * i, w: 0.22, h: glassH });
  for (const m of mull) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(m.w, m.h, 0.3), M.metalDark);
    bar.position.set(m.x, 5.2, -D + 0.3);
    bar.castShadow = true;
    scene.add(bar);
  }
  for (const y of [1.7, 8.7]) {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(glassW + 1, 0.5, 0.5), M.hullLight);
    sill.position.set(0, y, -D + 0.3);
    scene.add(sill);
  }
  // starfield outside
  const stars = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 20), M.starfield);
  scene.add(stars);

  // ---------------- structural ribs / pipes / rails ----------------
  for (let i = -2; i <= 2; i++) {
    const rib = girder(H, 0.45);
    rib.rotation.z = Math.PI / 2;
    rib.position.set(-W + 0.35, H / 2, i * 7);
    scene.add(rib);
    const rib2 = rib.clone();
    rib2.position.x = W - 0.35;
    scene.add(rib2);
  }
  scene.add(pipeRun([
    new THREE.Vector3(-W + 0.5, H - 0.6, -D + 2),
    new THREE.Vector3(-W + 0.7, H - 0.9, 0),
    new THREE.Vector3(-W + 0.5, H - 0.6, D - 2)
  ], 0.14));
  scene.add(pipeRun([
    new THREE.Vector3(W - 0.5, H - 0.6, -D + 2),
    new THREE.Vector3(W - 0.7, H - 1.1, 0),
    new THREE.Vector3(W - 0.5, H - 0.6, D - 2)
  ], 0.14, M.pipeOrange));

  // ceiling light bars (the main illumination)
  const lightRows = [-9, 0, 9];
  for (const z of lightRows) {
    const bar = lightBar(16, 'white', z === 0 ? 26 : 18);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(0, H - 0.12, z);
    scene.add(bar);
  }
  for (const z of [-14, 14]) {
    const bar = lightBar(10, 'cyan', 0);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(0, H - 0.12, z);
    scene.add(bar);
  }

  // grab rails everywhere
  const railGeo = railGeometry(0.95);
  const railT = [];
  const q = new THREE.Quaternion();
  const walls = [
    // [pos, quat] along side walls at 3 heights
    ...[-2.5, 2.5, 5.5, 8.5].flatMap(y =>
      [-15, -10, -5, 0, 5, 10, 15].flatMap(z => {
        if (y < 0) return [];
        return [
          { p: new THREE.Vector3(-W + 0.08, y, z), q: q.clone().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)) },
          { p: new THREE.Vector3(W - 0.08, y, z), q: q.clone().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)) }
        ];
      })
    ),
    // floor + ceiling grids
    ...[-12, -6, 0, 6, 12].flatMap(z =>
      [-9, -3, 3, 9].flatMap(x => [
        { p: new THREE.Vector3(x, 0.08, z), q: q.clone().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)) },
        { p: new THREE.Vector3(x, H - 0.08, z), q: q.clone().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)) }
      ])
    ),
    // window sills
    ...[-8, -4, 0, 4, 8].map(x => ({ p: new THREE.Vector3(x, 1.9, -D + 0.55), q: new THREE.Quaternion() }))
  ];
  for (const t of walls) railT.push(t);
  scene.add(instanced(railGeo, M.grabRail, railT));

  // ---------------- floating structures (things to push off / climb) ----------------
  const solids = [];
  function solidBoxAt(x, y, z, w, h, d) {
    world.addSolidBox(
      new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
      new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2)
    );
  }

  const island = new THREE.Group();
  const g1 = girder(9, 0.5);
  g1.position.set(0, 5.6, -6);
  island.add(g1);
  solidBoxAt(0, 5.6, -6, 9, 0.6, 0.6);
  const c1 = crate(1.2, 1.2, 1.2, 'cyan');
  c1.position.set(-3.4, 5.0, -6);
  c1.rotation.set(0.3, 0.5, 0.1);
  island.add(c1);
  solidBoxAt(-3.4, 5.0, -6, 1.5, 1.5, 1.5);
  const c2 = crate(0.9, 0.9, 1.4, 'orange');
  c2.position.set(3.8, 6.1, -5.6);
  c2.rotation.set(-0.2, 0.9, 0.3);
  island.add(c2);
  solidBoxAt(3.8, 6.1, -5.6, 1.2, 1.2, 1.7);
  const pod1 = barrierPod(2.6, 1.7, 0.7);
  pod1.position.set(-7.5, 4.2, 3);
  pod1.rotation.y = 0.7;
  island.add(pod1);
  world.addSolidSphere(new THREE.Vector3(-7.5, 4.2, 3), 1.35);
  const pod2 = barrierPod(2.2, 1.5, 0.7);
  pod2.position.set(7.6, 6.8, 4.5);
  pod2.rotation.set(0.4, -0.6, 0.2);
  island.add(pod2);
  world.addSolidSphere(new THREE.Vector3(7.6, 6.8, 4.5), 1.2);
  scene.add(island);

  // holo sculpture
  const holo = holoRings(2.1);
  holo.position.set(0, 6.2, 2.5);
  scene.add(holo);
  world.addSolidSphere(holo.position.clone(), 0.6);

  // ---------------- terminals ----------------
  const panels = {};
  const termDefs = [
    { key: 'match', x: -4.5, title: 'MATCHMAKING', label: 'MATCHMAKING' },
    { key: 'private', x: 0, title: 'PRIVATE LOBBY', label: 'PRIVATE' },
    { key: 'bots', x: 4.5, title: 'VS BOTS', label: 'VS BOTS' }
  ];
  for (const def of termDefs) {
    const con = terminalConsole();
    con.position.set(def.x, 0, 13.5);
    con.rotation.y = Math.PI;                 // face the room
    scene.add(con);
    solidBoxAt(def.x, 0.8, 13.5, 1.2, 1.7, 0.9);

    const panel = new Panel({ w: 1.0, h: 0.78, title: def.title });
    con.userData.screenAnchor.add(panel.group);
    panels[def.key] = panel;

    const s = sign(def.label, { w: 2.4, color: def.key === 'private' ? '#ff8a3c' : '#4de8ff' });
    s.position.set(def.x, 3.1, 14.2);
    s.rotation.y = Math.PI;
    scene.add(s);

    const spot = new THREE.PointLight(0x6adcff, 6, 7, 1.8);
    spot.position.set(def.x, 2.6, 12.5);
    scene.add(spot);
  }

  // hazard ring on the floor under terminals
  const pad = new THREE.Mesh(new THREE.RingGeometry(0, 7.5, 40, 1), M.deck);
  // (decorative ring replaced by hazard strip line)
  pad.visible = false;
  const stripLine = new THREE.Mesh(new THREE.BoxGeometry(16, 0.02, 0.5), M.hazard);
  stripLine.position.set(0, 0.012, 11.4);
  scene.add(stripLine);

  // ---------------- lights ----------------
  scene.add(new THREE.HemisphereLight(0x8fb5d8, 0x232830, 0.5));
  const sun = new THREE.DirectionalLight(0xbdd8ff, 1.6);
  sun.position.set(-6, 9, -22);
  sun.target.position.set(2, 2, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -22;
  sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -12;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);
  const doorGlow = new THREE.PointLight(0xff8a3c, 10, 14, 1.9);
  doorGlow.position.set(0, 5, D - 2);
  scene.add(doorGlow);

  // ---------------- spawns ----------------
  const spawns = [
    new THREE.Vector3(0, 1.2, 6), new THREE.Vector3(-3, 1.2, 7), new THREE.Vector3(3, 1.2, 7),
    new THREE.Vector3(-5, 1.2, 4), new THREE.Vector3(5, 1.2, 4), new THREE.Vector3(0, 1.2, 9),
    new THREE.Vector3(-2, 1.2, 3), new THREE.Vector3(2, 1.2, 3)
  ];

  function animate(t) {
    holo.userData.animate(t);
    doorSeam.material.emissiveIntensity = 1.8 + Math.sin(t * 2.2) * 0.5;
  }

  return { scene, world, panels, spawns, animate, stars };
}
