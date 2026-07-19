// Projectiles, muzzle flashes, sparks, explosions.
// Every client simulates every projectile; hit AUTHORITY is decided by the
// caller (victims report their own hits, the bot host reports bot hits).
import * as THREE from 'three';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

let glowTex = null;
function getGlowTex() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

const PROJ_SPEED = 26;
const PROJ_LIFE = 2.4;
const HIT_R_HEAD = 0.34;
const HIT_R_BODY = 0.46;

export class Effects {
  constructor(audio) {
    this.audio = audio;
    this.scene = null;
    this.projectiles = [];
    this.particles = [];
    this.boltGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.55, 6);
  }

  setScene(scene) {
    // drop any in-flight visuals from the old scene
    for (const p of this.projectiles) p.mesh.removeFromParent();
    for (const p of this.particles) p.mesh.removeFromParent();
    this.projectiles = [];
    this.particles = [];
    this.scene = scene;
  }

  spawnProjectile(ownerId, o, d, colorHex) {
    if (!this.scene) return;
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, toneMapped: false });
    const mesh = new THREE.Mesh(this.boltGeo, mat);
    mesh.position.copy(o);
    mesh.quaternion.setFromUnitVectors(UP, _v1.copy(d).normalize());
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlowTex(), color: colorHex, blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true, toneMapped: false
    }));
    glow.scale.setScalar(0.5);
    mesh.add(glow);
    this.scene.add(mesh);
    this.projectiles.push({
      owner: ownerId, mesh, color: colorHex,
      pos: o.clone(), dir: d.clone().normalize(), life: PROJ_LIFE
    });
  }

  muzzleFlash(pos, colorHex) {
    this.burst(pos, colorHex, 3, 0.16, 2.2, 0.08);
  }

  spark(pos, colorHex) {
    this.burst(pos, colorHex, 7, 0.3, 3.4, 0.16);
    this.audio.hit(pos);
  }

  explosion(pos, colorHex) {
    if (!this.scene) return;
    this.burst(pos, colorHex, 16, 0.75, 6, 0.5);
    this.burst(pos, 0xffffff, 8, 0.5, 3, 0.35);
    // expanding shell
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 16, 12),
      new THREE.MeshBasicMaterial({
        color: colorHex, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
      })
    );
    shell.position.copy(pos);
    this.scene.add(shell);
    this.particles.push({ mesh: shell, vel: new THREE.Vector3(), life: 0.5, ttl: 0.5, grow: 9 });
    this.audio.explosion(pos);
  }

  burst(pos, colorHex, n, life, speed, size) {
    if (!this.scene) return;
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getGlowTex(), color: colorHex, blending: THREE.AdditiveBlending,
        depthWrite: false, transparent: true, toneMapped: false
      }));
      s.position.copy(pos);
      s.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      this.scene.add(s);
      const vel = new THREE.Vector3(
        Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
      ).normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.7));
      const ttl = life * (0.6 + Math.random() * 0.6);
      this.particles.push({ mesh: s, vel, life: ttl, ttl, grow: 0 });
    }
  }

  // targets: [{id, head:Vector3, alive}] — onHit(targetId, ownerId, pos)
  update(dt, world, targets, onHit) {
    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      const step = PROJ_SPEED * dt;
      _v1.copy(p.pos);                       // segment start
      p.pos.addScaledVector(p.dir, step);
      p.mesh.position.copy(p.pos);

      let dead = p.life <= 0;

      if (!dead && world && world.blocked(p.pos)) {
        this.burst(p.pos, p.color, 5, 0.25, 2.5, 0.12);
        this.audio.hit(p.pos);
        dead = true;
      }

      if (!dead && targets) {
        for (const t of targets) {
          if (!t.alive || t.id === p.owner) continue;
          if (this.segmentHits(_v1, p.pos, t.head)) {
            this.spark(p.pos, p.color);
            if (onHit) onHit(t.id, p.owner, p.pos.clone());
            dead = true;
            break;
          }
        }
      }

      if (dead) {
        p.mesh.removeFromParent();
        p.mesh.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }

    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        pt.mesh.removeFromParent();
        if (pt.mesh.material) pt.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      pt.mesh.position.addScaledVector(pt.vel, dt);
      const f = pt.life / pt.ttl;
      if (pt.grow) {
        pt.mesh.scale.addScalar(pt.grow * dt);
        pt.mesh.material.opacity = f * 0.7;
      } else {
        pt.mesh.material.opacity = f;
        pt.vel.multiplyScalar(1 - dt * 2);
      }
    }
  }

  // capsule test: head sphere + torso sphere below it
  segmentHits(a, b, head) {
    if (this.segSphere(a, b, head, HIT_R_HEAD)) return true;
    _v2.copy(head);
    _v2.y -= 0.5;
    return this.segSphere(a, b, _v2, HIT_R_BODY);
  }

  segSphere(a, b, c, r) {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
    const lenSq = abx * abx + aby * aby + abz * abz;
    let t = lenSq > 0 ? (acx * abx + acy * aby + acz * abz) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = acx - abx * t, dy = acy - aby * t, dz = acz - abz * t;
    return dx * dx + dy * dy + dz * dz <= r * r;
  }
}
