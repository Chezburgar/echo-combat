// The player robot: floating exo-frame with helmet, visor, armored torso,
// thruster backpack, articulated IK arms and wrist blasters.
// Head + hands are driven by tracking (VR) or synthesized (desktop);
// everything else follows.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeParts } from '../world/props.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _e1 = new THREE.Euler();

let GEO = null;
function geos() {
  if (GEO) return GEO;
  GEO = {
    // --- head: helmet shell + brow + chin + ear pods + fin ---
    helmet: mergeParts([
      { geo: new RoundedBoxGeometry(0.24, 0.26, 0.27, 4, 0.09) },
      { geo: new RoundedBoxGeometry(0.26, 0.1, 0.2, 3, 0.04), y: 0.07, z: -0.05 },   // brow
      { geo: new RoundedBoxGeometry(0.16, 0.08, 0.12, 3, 0.03), y: -0.12, z: -0.06 }, // chin
      { geo: new THREE.CylinderGeometry(0.055, 0.055, 0.05, 12), rz: Math.PI / 2, x: -0.13 },
      { geo: new THREE.CylinderGeometry(0.055, 0.055, 0.05, 12), rz: Math.PI / 2, x: 0.13 },
      { geo: new RoundedBoxGeometry(0.03, 0.09, 0.2, 2, 0.012), y: 0.15, z: 0.02 }    // fin
    ]),
    visor: new RoundedBoxGeometry(0.17, 0.055, 0.03, 2, 0.012),
    earGlowL: new THREE.CylinderGeometry(0.03, 0.03, 0.012, 10),
    antenna: new THREE.CylinderGeometry(0.006, 0.004, 0.16, 6),
    antennaTip: new THREE.SphereGeometry(0.014, 8, 6),

    // --- torso: chest + plates + collar + backpack ---
    chest: mergeParts([
      { geo: new RoundedBoxGeometry(0.4, 0.46, 0.26, 4, 0.09) },
      { geo: new RoundedBoxGeometry(0.3, 0.16, 0.06, 2, 0.02), y: 0.1, z: 0.13 },     // chest plate
      { geo: new RoundedBoxGeometry(0.34, 0.07, 0.3, 2, 0.03), y: 0.24 },             // collar
      { geo: new RoundedBoxGeometry(0.26, 0.12, 0.2, 2, 0.04), y: -0.3 }              // pelvis
    ]),
    core: new THREE.CylinderGeometry(0.05, 0.05, 0.02, 6),
    pauldron: new THREE.SphereGeometry(0.09, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6),
    backpack: mergeParts([
      { geo: new RoundedBoxGeometry(0.3, 0.34, 0.14, 3, 0.04) },
      { geo: new THREE.CylinderGeometry(0.05, 0.065, 0.1, 10), x: -0.09, y: -0.2, rx: 0.15 },
      { geo: new THREE.CylinderGeometry(0.05, 0.065, 0.1, 10), x: 0.09, y: -0.2, rx: 0.15 }
    ]),
    skirt: new THREE.CylinderGeometry(0.14, 0.07, 0.18, 10),
    skirtRing: new THREE.TorusGeometry(0.1, 0.014, 6, 16),

    // --- arms ---
    upperArm: new THREE.CylinderGeometry(0.045, 0.055, 1, 10),      // scaled to length
    shoulderJoint: new THREE.SphereGeometry(0.075, 10, 8),
    elbow: new THREE.SphereGeometry(0.055, 10, 8),
    forearm: mergeParts([
      { geo: new RoundedBoxGeometry(0.09, 1, 0.09, 2, 0.03) },
      { geo: new THREE.CylinderGeometry(0.052, 0.052, 0.03, 12), y: -0.4 }            // wrist ring
    ]),
    hand: mergeParts([
      { geo: new RoundedBoxGeometry(0.075, 0.1, 0.11, 2, 0.02) },                     // palm
      { geo: new RoundedBoxGeometry(0.065, 0.03, 0.08, 2, 0.01), y: -0.06, z: -0.03, rx: 0.5 },  // fingers 1
      { geo: new RoundedBoxGeometry(0.06, 0.028, 0.06, 2, 0.01), y: -0.085, z: 0.015, rx: 1.2 }, // fingers 2
      { geo: new RoundedBoxGeometry(0.025, 0.05, 0.03, 2, 0.008), x: 0.045, y: -0.01, z: 0.03 }  // thumb
    ]),
    blaster: mergeParts([
      { geo: new THREE.CylinderGeometry(0.026, 0.03, 0.16, 10), rx: Math.PI / 2, z: -0.06 },
      { geo: new THREE.CylinderGeometry(0.02, 0.02, 0.08, 8), rx: Math.PI / 2, z: -0.15 },
      { geo: new RoundedBoxGeometry(0.05, 0.04, 0.1, 2, 0.012), y: 0.03 }
    ]),
    muzzleGlow: new THREE.CylinderGeometry(0.016, 0.016, 0.015, 8),
    jet: new THREE.ConeGeometry(0.05, 0.3, 8, 1, true)
  };
  return GEO;
}

const armorMat = () => new THREE.MeshStandardMaterial({ color: 0xd7dde4, roughness: 0.35, metalness: 0.75 });
const darkMat = () => new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 0.5, metalness: 0.85 });

export class RobotAvatar {
  constructor(colorHex, name = '') {
    const G = geos();
    this.color = new THREE.Color(colorHex);
    this.group = new THREE.Group();

    const armor = armorMat();
    const dark = darkMat();
    const paint = new THREE.MeshStandardMaterial({
      color: this.color.clone().multiplyScalar(0.55), roughness: 0.4, metalness: 0.6
    });
    this.accent = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: this.color, emissiveIntensity: 2.4, roughness: 0.3, metalness: 0
    });
    this.visorMat = new THREE.MeshStandardMaterial({
      color: 0x111418, emissive: this.color, emissiveIntensity: 2.0, roughness: 0.15, metalness: 0.4
    });

    // ---- head ----
    this.headG = new THREE.Group();
    const helmet = new THREE.Mesh(G.helmet, armor);
    helmet.castShadow = true;
    this.headG.add(helmet);
    const visor = new THREE.Mesh(G.visor, this.visorMat);
    visor.position.set(0, 0.02, -0.135);
    this.headG.add(visor);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(G.earGlowL, this.accent);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(sx * 0.155, 0, 0);
      this.headG.add(ear);
    }
    const ant = new THREE.Mesh(G.antenna, dark);
    ant.position.set(-0.09, 0.2, 0.05);
    ant.rotation.z = 0.15;
    this.headG.add(ant);
    const tip = new THREE.Mesh(G.antennaTip, this.accent);
    tip.position.set(-0.1, 0.28, 0.05);
    this.headG.add(tip);
    this.group.add(this.headG);

    // ---- torso ----
    this.torsoG = new THREE.Group();
    const chest = new THREE.Mesh(G.chest, armor);
    chest.castShadow = true;
    this.torsoG.add(chest);
    const chestPaint = new THREE.Mesh(new RoundedBoxGeometry(0.41, 0.14, 0.24, 2, 0.05), paint);
    chestPaint.position.y = -0.06;
    this.torsoG.add(chestPaint);
    const core = new THREE.Mesh(G.core, this.accent);
    core.rotation.x = Math.PI / 2;
    core.position.set(0, 0.08, 0.145);
    this.torsoG.add(core);
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(G.pauldron, paint);
      p.position.set(sx * 0.26, 0.18, 0);
      p.rotation.z = sx * -0.5;
      p.castShadow = true;
      this.torsoG.add(p);
    }
    const pack = new THREE.Mesh(G.backpack, dark);
    pack.position.set(0, 0.02, 0.2);
    pack.castShadow = true;
    this.torsoG.add(pack);
    const skirt = new THREE.Mesh(G.skirt, dark);
    skirt.position.y = -0.45;
    this.torsoG.add(skirt);
    const skirtRing = new THREE.Mesh(G.skirtRing, this.accent);
    skirtRing.rotation.x = Math.PI / 2;
    skirtRing.position.y = -0.48;
    this.torsoG.add(skirtRing);

    // thruster jets (back x2 + skirt x1)
    this.jets = [];
    const jetMat = new THREE.MeshBasicMaterial({
      color: this.color.clone().lerp(new THREE.Color(0xffffff), 0.5),
      transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false
    });
    for (const [x, y, z, rx] of [[-0.09, -0.25, 0.22, 0.15], [0.09, -0.25, 0.22, 0.15]]) {
      const jet = new THREE.Mesh(G.jet, jetMat);
      jet.position.set(x, y, z);
      jet.rotation.x = rx + Math.PI;
      this.torsoG.add(jet);
      this.jets.push(jet);
    }
    const jet3 = new THREE.Mesh(G.jet, jetMat);
    jet3.position.y = -0.62;
    jet3.rotation.x = Math.PI;
    this.torsoG.add(jet3);
    this.jets.push(jet3);
    this.group.add(this.torsoG);

    // ---- arms ----
    this.arms = {};
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;
      const upper = new THREE.Mesh(G.upperArm, paint);
      upper.castShadow = true;
      const shoulder = new THREE.Mesh(G.shoulderJoint, dark);
      const elbow = new THREE.Mesh(G.elbow, dark);
      const fore = new THREE.Mesh(G.forearm, armor);
      fore.castShadow = true;
      const handG = new THREE.Group();
      const hand = new THREE.Mesh(G.hand, dark);
      handG.add(hand);
      const blaster = new THREE.Mesh(G.blaster, darkMat());
      blaster.position.set(0, 0.05, -0.02);
      handG.add(blaster);
      const mglow = new THREE.Mesh(G.muzzleGlow, this.accent);
      mglow.rotation.x = Math.PI / 2;
      mglow.position.set(0, 0.05, -0.21);
      handG.add(mglow);
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0.05, -0.24);
      handG.add(muzzle);
      this.group.add(upper, shoulder, elbow, fore, handG);
      this.arms[side] = { upper, shoulder, elbow, fore, handG, muzzle, sign: s };
    }

    // ---- name tag ----
    this.nameSprite = null;
    if (name) this.setName(name);

    this.throttle = 0;
    this.time = Math.random() * 10;
  }

  setName(name) {
    if (this.nameSprite) this.group.remove(this.nameSprite);
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const g = c.getContext('2d');
    g.font = 'bold 52px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#' + this.color.getHexString();
    g.shadowBlur = 16;
    g.fillStyle = '#ffffff';
    g.fillText(name.split('').join(' '), 256, 48);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
    this.nameSprite = new THREE.Sprite(mat);
    this.nameSprite.scale.set(1.15, 0.22, 1);
    this.group.add(this.nameSprite);
  }

  // 'full' | 'handsOnly' | 'none'
  setVisibility(mode) {
    const hands = mode !== 'none';
    const body = mode === 'full';
    this.headG.visible = body;
    this.torsoG.visible = body;
    if (this.nameSprite) this.nameSprite.visible = body;
    for (const side of ['L', 'R']) {
      const a = this.arms[side];
      a.handG.visible = hands;
      a.fore.visible = hands;
      a.upper.visible = body;
      a.shoulder.visible = body;
      a.elbow.visible = body;
    }
  }

  setHealth(frac) {
    // visor shifts to red as hull damage accumulates
    const c = this.color.clone().lerp(new THREE.Color(0xff2010), 1 - Math.max(0, Math.min(1, frac)));
    this.visorMat.emissive.copy(c);
  }

  setThrottle(t) { this.throttle = t; }

  // world-space pose: head {p,q}, hands {p,q} (may be null → synthesized)
  setPose(head, lh, rh, dt = 0.016) {
    this.time += dt;
    const hp = head.p, hq = head.q;

    this.headG.position.copy(hp);
    this.headG.quaternion.copy(hq);

    // torso: yaw from head, slight pitch follow, hangs below
    _e1.setFromQuaternion(hq, 'YXZ');
    const yawQ = _q1.setFromEuler(new THREE.Euler(_e1.x * 0.25, _e1.y, _e1.z * 0.3, 'YXZ'));
    this.torsoG.quaternion.slerp(yawQ, 0.35);
    const bob = Math.sin(this.time * 1.7) * 0.008;
    _v1.set(0.02 * Math.sin(this.time * 1.3), -0.46 + bob, 0.06).applyQuaternion(this.torsoG.quaternion);
    this.torsoG.position.copy(hp).add(_v1);

    // jets flicker with throttle
    const jl = 0.15 + this.throttle * (0.9 + Math.sin(this.time * 31) * 0.25);
    for (const jet of this.jets) {
      jet.scale.set(1, jl, 1);
      jet.material.opacity = 0.15 + this.throttle * 0.75;
    }

    for (const side of ['L', 'R']) {
      const hand = side === 'L' ? lh : rh;
      this.solveArm(side, hand, hp, hq);
    }
  }

  solveArm(side, hand, headP, headQ) {
    const a = this.arms[side];
    const s = a.sign;
    // shoulder anchor on torso (stored directly on the joint mesh)
    const shoulderP = a.shoulder.position;
    shoulderP.set(s * 0.27, 0.16, 0.02).applyQuaternion(this.torsoG.quaternion).add(this.torsoG.position);

    const handP = a.handG.position;
    let handQ;
    if (hand && hand.p) {
      handP.copy(hand.p);
      handQ = hand.q;
    } else {
      // synthesized relaxed pose
      handP.set(s * 0.24, -0.32, -0.18).applyQuaternion(this.torsoG.quaternion).add(this.torsoG.position);
      handQ = this.torsoG.quaternion;
    }
    a.handG.quaternion.copy(handQ);

    // two-bone IK with a pole hint (elbows out and down)
    const L1 = 0.30, L2 = 0.28;
    _v3.copy(handP).sub(shoulderP);
    let d = _v3.length();
    d = Math.max(0.05, Math.min(d, L1 + L2 - 0.01));
    _v3.normalize();
    const cosA = Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
    const angle = Math.acos(cosA);
    const pole = _v4.set(s * 0.9, -0.7, -0.2).applyQuaternion(this.torsoG.quaternion);
    pole.addScaledVector(_v3, -pole.dot(_v3));
    if (pole.lengthSq() < 1e-6) pole.set(0, -1, 0).addScaledVector(_v3, -_v3.y);
    pole.normalize();
    a.elbow.position.copy(shoulderP)
      .addScaledVector(_v3, Math.cos(angle) * L1)
      .addScaledVector(pole, Math.sin(angle) * L1);

    this.alignBone(a.upper, shoulderP, a.elbow.position);
    this.alignBone(a.fore, a.elbow.position, handP);
  }

  alignBone(mesh, from, to) {
    _v3.copy(to).sub(from);
    const d = _v3.length() || 0.001;
    mesh.position.copy(from).lerp(to, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, _v3.divideScalar(d));
    mesh.scale.set(1, d, 1);
  }

  updateNameTag(camPos) {
    if (!this.nameSprite) return;
    this.nameSprite.position.copy(this.headG.position);
    this.nameSprite.position.y += 0.42;
  }

  muzzleWorld(side, outP, outD) {
    const a = this.arms[side];
    a.muzzle.getWorldPosition(outP);
    outD.set(0, 0, -1).applyQuaternion(a.handG.getWorldQuaternion(_q1));
    return outP;
  }

  dispose() {
    this.group.removeFromParent();
  }
}

// Desktop first-person viewmodel: forearm + hand + wrist blaster in the
// lower-right of the view. Attach to the camera.
export function makeViewmodel(colorHex) {
  const G = geos();
  const color = new THREE.Color(colorHex);
  const group = new THREE.Group();
  const armor = armorMat();
  const dark = darkMat();
  const accent = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: color, emissiveIntensity: 2.4, roughness: 0.3, metalness: 0
  });

  // compact forearm receding toward the bottom-right corner
  const fore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.048, 0.26, 10),
    new THREE.MeshStandardMaterial({ color: 0x59626e, roughness: 0.45, metalness: 0.8 })
  );
  fore.rotation.x = -Math.PI / 2 + 0.42;
  fore.position.set(0.015, -0.045, 0.12);
  group.add(fore);
  const wristRing = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.009, 6, 14), accent);
  wristRing.position.set(0.008, -0.018, 0.055);
  wristRing.rotation.x = -Math.PI / 2 + 0.42;
  group.add(wristRing);
  const hand = new THREE.Mesh(G.hand, dark);
  hand.rotation.x = -0.35;
  group.add(hand);
  const blaster = new THREE.Mesh(G.blaster, armor);
  blaster.position.set(0, 0.055, -0.03);
  group.add(blaster);
  const mglow = new THREE.Mesh(G.muzzleGlow, accent);
  mglow.rotation.x = Math.PI / 2;
  mglow.position.set(0, 0.055, -0.22);
  group.add(mglow);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.055, -0.26);
  group.add(muzzle);

  group.position.set(0.26, -0.23, -0.48);
  group.rotation.set(0.04, -0.06, 0.05);
  group.userData.muzzle = muzzle;
  return group;
}
