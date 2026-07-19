// Offline fallback: emulates just enough of the server protocol for
// solo play (lobby + VS BOTS) when no WebSocket server is reachable.
// Bots are already simulated client-side, so matches work fully.
const START_HP = 100;
const SPAWN_COUNT = 12;
const BOT_NAMES = ['VOLT', 'HALO', 'ONYX', 'RIFT', 'NOVA', 'FLUX', 'IONIC'];

export class OfflineServer {
  constructor(net) {
    this.net = net;
    this.match = null;
  }

  deliver(msg) {
    const h = this.net.handlers[msg.t];
    if (h) setTimeout(() => h(msg), 0);
  }

  handle(msg) {
    switch (msg.t) {
      case 'vsbots':
        this.startMatch(Math.max(1, Math.min(7, Number(msg.n) || 3)));
        break;
      case 'queue':
        if (msg.on) this.deliver({ t: 'err', msg: 'OFFLINE — matchmaking needs the multiplayer server' });
        this.deliver({ t: 'queue', n: 0, s: 0, left: true });
        break;
      case 'party':
        this.deliver({ t: 'err', msg: 'OFFLINE — private lobbies need the multiplayer server' });
        break;
      case 'hit':
        this.applyHit(String(msg.target), msg.dmg, msg.by);
        break;
      // state / shoot / bots need no relay with no other humans
    }
  }

  startMatch(botCount) {
    const idx = [...Array(SPAWN_COUNT).keys()].sort(() => Math.random() - 0.5);
    const spawns = { p1: idx[0] };
    const bots = [];
    const entities = new Map([['p1', { hp: START_HP, alive: true }]]);
    for (let i = 0; i < botCount; i++) {
      const id = 'b' + (i + 1);
      bots.push({ id, name: BOT_NAMES[i % BOT_NAMES.length] + '-' + (i + 1) });
      spawns[id] = idx[(i + 1) % SPAWN_COUNT];
      entities.set(id, { hp: START_HP, alive: true });
    }
    this.match = { entities, over: false };
    this.deliver({
      t: 'matchStart', room: 'offline',
      players: [{ id: 'p1', name: this.net.name }],
      bots, botHost: 'p1', spawns
    });
  }

  applyHit(target, dmg, by) {
    const m = this.match;
    if (!m || m.over) return;
    const e = m.entities.get(target);
    if (!e || !e.alive) return;
    e.hp -= Math.max(2, Math.min(40, Number(dmg) || 0));
    this.deliver({ t: 'health', id: target, hp: e.hp, by });
    if (e.hp <= 0) {
      e.alive = false;
      const alive = [...m.entities.values()].filter(x => x.alive).length;
      this.deliver({ t: 'elim', id: target, by, alive });
      if (target === 'p1') {
        // player out: match is over regardless of surviving bots
        m.over = true;
        const firstBot = [...m.entities.keys()].find(id => id !== 'p1' && m.entities.get(id).alive);
        this.deliver({ t: 'matchEnd', winner: firstBot ? { id: firstBot, name: firstBot.toUpperCase() } : null });
        setTimeout(() => this.toLobby(), 4000);
      } else if (alive <= 1) {
        m.over = true;
        this.deliver({ t: 'matchEnd', winner: { id: 'p1', name: this.net.name } });
        setTimeout(() => this.toLobby(), 6000);
      }
    }
  }

  toLobby() {
    this.match = null;
    this.deliver({ t: 'toLobby', players: [] });
  }
}
