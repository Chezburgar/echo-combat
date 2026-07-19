// Collision + grab model for zero-g interiors.
//
// The playable space is a UNION of "volumes" (chamber spheres, room boxes,
// tunnel tubes). The player must stay inside the union; its inner walls are
// all grabbable. "Solids" (barriers, crates, columns) are obstacles inside
// that space — also grabbable on every face.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _u = new THREE.Vector3();
const _w = new THREE.Vector3();

export class CollisionWorld {
  constructor() {
    this.volumes = [];
    this.solids = [];
  }

  addSphere(c, r) { this.volumes.push({ kind: 'sphere', c: c.clone(), r }); }
  addBox(min, max) { this.volumes.push({ kind: 'box', min: min.clone(), max: max.clone() }); }
  addTube(a, b, r) {
    const axis = b.clone().sub(a);
    const len = axis.length();
    this.volumes.push({ kind: 'tube', a: a.clone(), b: b.clone(), r, axis: axis.normalize(), len });
  }
  addSolidBox(min, max) { this.solids.push({ kind: 'box', min: min.clone(), max: max.clone() }); }
  addSolidSphere(c, r) { this.solids.push({ kind: 'sphere', c: c.clone(), r }); }
  addSolidCapsule(a, b, r) {
    const axis = b.clone().sub(a);
    const len = axis.length();
    this.solids.push({ kind: 'capsule', a: a.clone(), b: b.clone(), r, axis: axis.normalize(), len });
  }

  // -------- volume tests --------

  insideVolume(v, p, s) {
    switch (v.kind) {
      case 'sphere':
        return p.distanceToSquared(v.c) <= (v.r - s) * (v.r - s);
      case 'box':
        return p.x >= v.min.x + s && p.x <= v.max.x - s &&
               p.y >= v.min.y + s && p.y <= v.max.y - s &&
               p.z >= v.min.z + s && p.z <= v.max.z - s;
      case 'tube': {
        _v.copy(p).sub(v.a);
        const t = _v.dot(v.axis);
        if (t < 0 || t > v.len) return false;
        _u.copy(v.axis).multiplyScalar(t);
        return _v.sub(_u).lengthSq() <= (v.r - s) * (v.r - s);
      }
    }
    return false;
  }

  inside(p, s = 0) {
    for (const v of this.volumes) if (this.insideVolume(v, p, s)) return true;
    return false;
  }

  // project p to be inside volume v with margin s; writes to out, returns out
  projectInto(v, p, s, out) {
    switch (v.kind) {
      case 'sphere': {
        out.copy(p).sub(v.c);
        const d = out.length() || 0.0001;
        const R = v.r - s;
        if (d > R) out.multiplyScalar(R / d);
        return out.add(v.c);
      }
      case 'box': {
        out.set(
          Math.min(Math.max(p.x, v.min.x + s), v.max.x - s),
          Math.min(Math.max(p.y, v.min.y + s), v.max.y - s),
          Math.min(Math.max(p.z, v.min.z + s), v.max.z - s)
        );
        return out;
      }
      case 'tube': {
        _v.copy(p).sub(v.a);
        const t = Math.min(Math.max(_v.dot(v.axis), 0), v.len);
        _u.copy(v.a).addScaledVector(v.axis, t);        // axis point
        _w.copy(p).sub(_u);
        const rd = _w.length();
        const R = v.r - s;
        if (rd > R) _w.multiplyScalar(R / (rd || 0.0001));
        return out.copy(_u).add(_w);
      }
    }
    return out.copy(p);
  }

  // keep p inside the union; returns push normal (unit, pointing inward) or null
  resolveContainment(p, radius) {
    if (this.inside(p, radius)) return null;
    let best = null, bestD = Infinity;
    const cand = new THREE.Vector3();
    for (const v of this.volumes) {
      this.projectInto(v, p, radius, cand);
      const d = cand.distanceToSquared(p);
      if (d < bestD) { bestD = d; best = best || new THREE.Vector3(); best.copy(cand); }
    }
    if (!best) return null;
    const n = best.clone().sub(p);
    const len = n.length();
    p.copy(best);
    return len > 0.0001 ? n.divideScalar(len) : null;
  }

  // -------- solids --------

  closestOnSolid(s, p, out) {
    switch (s.kind) {
      case 'box':
        out.set(
          Math.min(Math.max(p.x, s.min.x), s.max.x),
          Math.min(Math.max(p.y, s.min.y), s.max.y),
          Math.min(Math.max(p.z, s.min.z), s.max.z)
        );
        return out;
      case 'sphere':
        return out.copy(s.c);
      case 'capsule': {
        _v.copy(p).sub(s.a);
        const t = Math.min(Math.max(_v.dot(s.axis), 0), s.len);
        return out.copy(s.a).addScaledVector(s.axis, t);
      }
    }
    return out.copy(p);
  }

  solidRadius(s) { return s.kind === 'box' ? 0 : s.r; }

  pointInSolid(p, pad = 0) {
    const cp = _w;
    for (const s of this.solids) {
      this.closestOnSolid(s, p, cp);
      const r = this.solidRadius(s) + pad;
      if (p.distanceToSquared(cp) <= r * r + 1e-9) {
        if (s.kind === 'box' && pad === 0) {
          // closest==p means inside the box
          if (cp.distanceToSquared(p) < 1e-9) return true;
        } else return true;
      }
    }
    return false;
  }

  // push a sphere of given radius out of all solids; returns last push normal
  resolveSolids(p, radius) {
    let normal = null;
    const cp = new THREE.Vector3();
    for (const s of this.solids) {
      this.closestOnSolid(s, p, cp);
      const rs = this.solidRadius(s);
      const d = p.distanceTo(cp);
      if (d < rs + radius) {
        let n;
        if (d > 0.0001) n = _v.copy(p).sub(cp).divideScalar(d);
        else if (s.kind === 'box') {
          // deep inside a box: exit through nearest face
          n = boxExitNormal(s, p, _v);
        } else n = _v.set(0, 1, 0);
        p.copy(cp).addScaledVector(n, rs + radius + 0.001);
        normal = n.clone();
      }
    }
    return normal;
  }

  // environment hit test for projectiles
  blocked(p) {
    return !this.inside(p, 0.02) || this.pointInSolid(p, 0.02);
  }

  // -------- grabbing --------

  // nearest grabbable surface within reach of p. Returns {point, normal, dist}
  grab(p, reach) {
    let best = null;

    // union walls: only walls of volumes we're inside (or almost inside)
    for (const v of this.volumes) {
      if (!this.insideVolume(v, p, -0.6)) continue;
      const sp = new THREE.Vector3();
      this.projectOntoWall(v, p, sp);
      const d = sp.distanceTo(p);
      if (d <= reach && (!best || d < best.dist)) {
        // skip wall points that open into a neighboring volume (doorways)
        if (!this.insideOther(v, sp)) {
          const n = _v.copy(p).sub(sp);
          best = { point: sp, normal: n.lengthSq() > 1e-8 ? n.clone().normalize() : new THREE.Vector3(0, 1, 0), dist: d };
        }
      }
    }

    // solids: every face grabbable
    for (const s of this.solids) {
      const cp = new THREE.Vector3();
      this.closestOnSolid(s, p, cp);
      const rs = this.solidRadius(s);
      let sp, d;
      if (rs > 0) {
        const dir = _v.copy(p).sub(cp);
        const dl = dir.length() || 0.0001;
        sp = cp.clone().addScaledVector(dir.divideScalar(dl), rs);
        d = Math.max(0, dl - rs);
      } else {
        sp = cp;
        d = p.distanceTo(cp);
      }
      if (d <= reach && (!best || d < best.dist)) {
        const n = _v.copy(p).sub(sp);
        best = { point: sp.clone(), normal: n.lengthSq() > 1e-8 ? n.clone().normalize() : new THREE.Vector3(0, 1, 0), dist: d };
      }
    }
    return best;
  }

  insideOther(v, p) {
    for (const o of this.volumes) {
      if (o !== v && this.insideVolume(o, p, 0.12)) return true;
    }
    return false;
  }

  projectOntoWall(v, p, out) {
    switch (v.kind) {
      case 'sphere': {
        out.copy(p).sub(v.c);
        const d = out.length() || 0.0001;
        return out.multiplyScalar(v.r / d).add(v.c);
      }
      case 'box': {
        // nearest face
        const dists = [
          [p.x - v.min.x, 0, -1], [v.max.x - p.x, 0, 1],
          [p.y - v.min.y, 1, -1], [v.max.y - p.y, 1, 1],
          [p.z - v.min.z, 2, -1], [v.max.z - p.z, 2, 1]
        ];
        dists.sort((a, b) => a[0] - b[0]);
        const [, axis, sign] = dists[0];
        out.copy(p);
        const arr = ['x', 'y', 'z'];
        out[arr[axis]] = sign === -1 ? v.min[arr[axis]] : v.max[arr[axis]];
        return out;
      }
      case 'tube': {
        _u.copy(p).sub(v.a);
        const t = Math.min(Math.max(_u.dot(v.axis), 0), v.len);
        const ax = _u.copy(v.a).addScaledVector(v.axis, t);
        out.copy(p).sub(ax);
        const rd = out.length() || 0.0001;
        return out.multiplyScalar(v.r / rd).add(ax);
      }
    }
    return out.copy(p);
  }

  // line of sight through the environment (samples every ~1.2m)
  los(a, b) {
    const d = _v.copy(b).sub(a);
    const len = d.length();
    const steps = Math.ceil(len / 1.2);
    for (let i = 1; i < steps; i++) {
      _u.copy(a).lerp(b, i / steps);
      if (this.blocked(_u)) return false;
    }
    return true;
  }
}

function boxExitNormal(s, p, out) {
  const dists = [
    [p.x - s.min.x, -1, 0, 0], [s.max.x - p.x, 1, 0, 0],
    [p.y - s.min.y, 0, -1, 0], [s.max.y - p.y, 0, 1, 0],
    [p.z - s.min.z, 0, 0, -1], [s.max.z - p.z, 0, 0, 1]
  ];
  dists.sort((a, b) => a[0] - b[0]);
  return out.set(dists[0][1], dists[0][2], dists[0][3]);
}
