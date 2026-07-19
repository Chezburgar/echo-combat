// Bot AI — simulated by the match's "bot host" client, replicated to
// everyone else as regular network states.
import * as THREE from 'three';
import { encodeState } from '../player/remote.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m1 = new THREE.Matrix4();
const ORIGIN = new THREE.Vector3();

const BOT_MAX = 4.5;
const BOT_ACCEL = 5;

export class BotSim {
  constructor(world, waypoints) {
    this.world = world;
    this.wp = waypoints;
    this.bots = new Map();
    // adjacency
    this.adj = waypoints.nodes.map(() => []);
    for (const [a, b] of waypoints.edges) {
      this.adj[a].push(b);
      this.adj[b].push(a);
    }
  }

  addBot(id, spawnPos) {
    this.bots.set(id, {
      id,
      pos: spawnPos.clone(),
      vel: new THREE.Vector3(),
      headQ: new THREE.Quaternion(),
      path: [],
      fireCd: 2 + Math.random() * 2,
      strafe: Math.random() * 10,
      repath: 0,
      thr: 0
    });
  }

  removeBot(id) { this.bots.delete(id); }

  nearestNode(p) {
    let best = 0, bd = Infinity;
    this.wp.nodes.forEach((n, i) => {
      const d = n.distanceToSquared(p);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  bfsPath(from, to) {
    if (from === to) return [to];
    const prev = new Array(this.wp.nodes.length).fill(-1);
    const q = [from];
    prev[from] = from;
    while (q.length) {
      const n = q.shift();
      for (const m of this.adj[n]) {
        if (prev[m] === -1) {
          prev[m] = n;
          if (m === to) {
            const path = [to];
            let cur = to;
            while (cur !== from) { cur = prev[cur]; path.unshift(cur); }
            return path;
          }
          q.push(m);
        }
      }
    }
    return [from];
  }

  // targets: [{id, head, alive}] — includes players AND bots
  // fire(bot, origin, dir) callback
  update(dt, targets, fire) {
    for (const bot of this.bots.values()) {
      bot.strafe += dt;
      bot.repath -= dt;
      bot.fireCd -= dt;

      // pick nearest living target that isn't me
      let target = null, td = Infinity;
      for (const t of targets) {
        if (!t.alive || t.id === bot.id) continue;
        const d = t.head.distanceToSquared(bot.pos);
        if (d < td) { td = d; target = t; }
      }
      td = Math.sqrt(td);

      const steer = _v1.set(0, 0, 0);
      let combat = false;
      if (target && td < 34 && this.world.los(bot.pos, target.head)) {
        combat = true;
        // orbit at close-quarters range (tunnel fighting)
        const away = _v2.copy(bot.pos).sub(target.head).normalize();
        const desired = away.multiplyScalar(7).add(target.head);
        desired.x += Math.sin(bot.strafe * 0.9) * 2.5;
        desired.y += Math.cos(bot.strafe * 0.7) * 1.8;
        desired.z += Math.cos(bot.strafe * 1.1) * 2.5;
        steer.copy(desired).sub(bot.pos);

        // face + shoot
        _m1.lookAt(bot.pos, target.head, _v2.set(0, 1, 0));
        bot.headQ.slerp(_v2q.setFromRotationMatrix(_m1), Math.min(1, dt * 5));
        if (bot.fireCd <= 0 && td < 26) {
          bot.fireCd = 0.8 + Math.random() * 1.1;
          const dir = _v2.copy(target.head).sub(bot.pos).normalize();
          dir.x += (Math.random() - 0.5) * 0.09;
          dir.y += (Math.random() - 0.5) * 0.09;
          dir.z += (Math.random() - 0.5) * 0.09;
          dir.normalize();
          const origin = bot.pos.clone().addScaledVector(dir, 0.5);
          origin.y -= 0.2;
          fire(bot, origin, dir.clone());
        }
      } else {
        // navigate via waypoints toward the target (or roam)
        if (bot.repath <= 0 || bot.path.length === 0) {
          bot.repath = 2.5;
          const from = this.nearestNode(bot.pos);
          let to;
          if (target) to = this.nearestNode(target.head);
          else to = Math.floor(Math.random() * this.wp.nodes.length);
          bot.path = this.bfsPath(from, to);
        }
        if (bot.path.length) {
          const node = this.wp.nodes[bot.path[0]];
          if (node.distanceTo(bot.pos) < 5) bot.path.shift();
          if (bot.path.length) {
            steer.copy(this.wp.nodes[bot.path[0]]).sub(bot.pos);
            // face travel direction
            if (bot.vel.lengthSq() > 0.5) {
              _m1.lookAt(ORIGIN, _v2.copy(bot.vel), _v1n.set(0, 1, 0));
              bot.headQ.slerp(_v2q.setFromRotationMatrix(_m1), Math.min(1, dt * 3));
            }
          }
        }
      }

      // separation from other bots
      for (const other of this.bots.values()) {
        if (other === bot) continue;
        const d = bot.pos.distanceTo(other.pos);
        if (d < 2.5 && d > 0.01) {
          steer.addScaledVector(_v2.copy(bot.pos).sub(other.pos).divideScalar(d), (2.5 - d) * 2);
        }
      }

      // integrate
      const sl = steer.length();
      if (sl > 0.1) {
        steer.divideScalar(sl);
        bot.vel.addScaledVector(steer, BOT_ACCEL * dt);
        bot.thr = Math.min(1, bot.thr + dt * 3);
      } else {
        bot.thr = Math.max(0, bot.thr - dt * 3);
      }
      bot.vel.multiplyScalar(Math.exp(-0.35 * dt));
      if (bot.vel.length() > BOT_MAX) bot.vel.multiplyScalar(BOT_MAX / bot.vel.length());
      bot.pos.addScaledVector(bot.vel, dt);

      this.world.resolveSolids(bot.pos, 0.42);
      this.world.resolveContainment(bot.pos, 0.42);
    }
  }

  // encode all bots as wire states { id: stateArray }
  states() {
    const out = {};
    for (const bot of this.bots.values()) {
      const hq = bot.headQ;
      // synthesized hands below/forward of the head
      _v1.set(-0.24, -0.34, -0.16).applyQuaternion(hq).add(bot.pos);
      _v2.set(0.24, -0.32, -0.2).applyQuaternion(hq).add(bot.pos);
      out[bot.id] = encodeState(bot.pos, hq, _v1, hq, _v2, hq, bot.thr * 0.6);
    }
    return out;
  }
}

const _v2q = new THREE.Quaternion();
const _v1n = new THREE.Vector3();
