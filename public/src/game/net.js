// WebSocket client. Thin wrapper: JSON messages in/out + handler table.
// Falls back to an in-page OfflineServer (solo vs bots) when no server responds.
import { OfflineServer } from './offline.js';

export class Net {
  constructor() {
    this.ws = null;
    this.id = null;
    this.name = '';
    this.handlers = {};
    this.connected = false;
    this.offline = false;
    this.sim = null;
    this.stateTimer = 0;
  }

  goOffline(name) {
    this.offline = true;
    this.connected = true;
    this.id = 'p1';
    this.name = name;
    this.sim = new OfflineServer(this);
    return { t: 'welcome', id: 'p1', name, players: [] };
  }

  on(type, fn) { this.handlers[type] = fn; }

  connect(name) {
    this.name = name;
    return new Promise((resolve, reject) => {
      // ?server=host:port lets a static build point at a remote game server
      const override = new URLSearchParams(location.search).get('server');
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = override
        ? (override.includes('://') ? override : `${proto}://${override}/ws`)
        : `${proto}://${location.host}/ws`;
      let ws;
      try { ws = new WebSocket(url); } catch (e) { reject(e); return; }
      this.ws = ws;
      const timeout = setTimeout(() => {
        if (!this.connected) { try { ws.close(); } catch {} reject(new Error('timeout')); }
      }, 6000);
      ws.onopen = () => {
        clearTimeout(timeout);
        this.connected = true;
        this.send({ t: 'hello', name });
      };
      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.t === 'welcome') {
          this.id = msg.id;
          resolve(msg);
        }
        const h = this.handlers[msg.t];
        if (h) h(msg);
      };
      ws.onclose = () => {
        this.connected = false;
        if (this.handlers.disconnect) this.handlers.disconnect();
        reject(new Error('connection closed'));
      };
      ws.onerror = () => {};
    });
  }

  send(msg) {
    if (this.offline) {
      if (this.sim) this.sim.handle(msg);
      return;
    }
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  sendState(d) { this.send({ t: 'state', d }); }
  sendShoot(o, d, botId) {
    const r = (v) => [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100];
    this.send({ t: 'shoot', o: r(o), d: [d.x, d.y, d.z].map(x => Math.round(x * 1000) / 1000), bot: botId });
  }
  sendHit(target, dmg, by) { this.send({ t: 'hit', target, dmg, by }); }
  sendBots(d) { this.send({ t: 'bots', d }); }
  queue(on) { this.send({ t: 'queue', on }); }
  party(act, extra = {}) { this.send({ t: 'party', act, ...extra }); }
  vsBots(n) { this.send({ t: 'vsbots', n }); }
  rtc(to, data) { this.send({ t: 'rtc', to, data }); }
}
