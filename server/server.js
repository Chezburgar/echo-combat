// ECHO COMBAT — multiplayer server
// Static file host + WebSocket rooms, matchmaking, parties, battle-royale
// health/elimination authority, and WebRTC voice signaling relay.
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm'
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}

// ---------------------------------------------------------------- state

const clients = new Map();     // id -> client
const parties = new Map();     // code -> { code, host, members:Set, bots }
const matches = new Map();     // room -> match
let queue = [];                // ids waiting for matchmaking
let queueTimer = null;
let queueCountdown = 0;
let nextId = 1;
let nextMatch = 1;

const MAX_MATCH = 8;
const QUEUE_WAIT = 10;         // seconds after 2+ players queue
const START_HP = 100;
const ARENA_SPAWNS = 12;       // must match client arena spawn count

const BOT_NAMES = ['VOLT', 'HALO', 'ONYX', 'RIFT', 'NOVA', 'FLUX', 'IONIC', 'QUARK', 'DELTA', 'CIPHER'];

function send(c, msg) {
  if (c && c.ws.readyState === 1) c.ws.send(JSON.stringify(msg));
}

function roomClients(room, except) {
  const out = [];
  for (const c of clients.values()) if (c.room === room && c !== except) out.push(c);
  return out;
}

function broadcastRoom(room, msg, except) {
  for (const c of roomClients(room, except)) send(c, msg);
}

function snapshot(c) {
  return { id: c.id, name: c.name, hp: c.hp, alive: c.alive, state: c.lastState || null };
}

function lobbySnapshot(except) {
  return roomClients('lobby', except).map(snapshot);
}

// ---------------------------------------------------------------- rooms

function moveToRoom(c, room, msg) {
  const old = c.room;
  if (old === room) return;
  c.room = room;
  c.lastState = null;
  broadcastRoom(old, { t: 'leave', id: c.id });
  broadcastRoom(room, { t: 'join', p: snapshot(c) });
  if (msg) send(c, msg);
}

function sendToLobby(c) {
  if (!clients.has(c.id)) return;
  c.hp = START_HP;
  c.alive = true;
  moveToRoom(c, 'lobby', { t: 'toLobby', players: lobbySnapshot(c) });
  sendPartyState(c.party);
}

// ---------------------------------------------------------------- matchmaking

function queueBroadcast() {
  for (const id of queue) {
    send(clients.get(id), { t: 'queue', n: queue.length, s: queueCountdown });
  }
}

function leaveQueue(c) {
  const i = queue.indexOf(c.id);
  if (i >= 0) queue.splice(i, 1);
  send(c, { t: 'queue', n: 0, s: 0, left: true });
  if (queue.length < 2 && queueTimer) { clearInterval(queueTimer); queueTimer = null; queueCountdown = 0; }
  queueBroadcast();
}

function joinQueue(c) {
  if (queue.includes(c.id) || c.room !== 'lobby') return;
  if (c.party) leaveParty(c);
  queue.push(c.id);
  if (queue.length >= MAX_MATCH) { launchQueue(); return; }
  if (queue.length >= 2 && !queueTimer) {
    queueCountdown = QUEUE_WAIT;
    queueTimer = setInterval(() => {
      queueCountdown--;
      if (queueCountdown <= 0) launchQueue();
      else queueBroadcast();
    }, 1000);
  }
  queueBroadcast();
}

function launchQueue() {
  if (queueTimer) { clearInterval(queueTimer); queueTimer = null; }
  queueCountdown = 0;
  const ids = queue.splice(0, MAX_MATCH).filter(id => clients.has(id));
  if (ids.length >= 2) startMatch(ids, 0);
  else for (const id of ids) queue.push(id); // someone vanished, requeue
  queueBroadcast();
}

// ---------------------------------------------------------------- parties

function partyState(p) {
  return {
    t: 'party',
    code: p ? p.code : null,
    host: p ? p.host : null,
    bots: p ? p.bots : 0,
    members: p ? [...p.members].map(id => {
      const m = clients.get(id);
      return { id, name: m ? m.name : '?' };
    }) : []
  };
}

function sendPartyState(p) {
  if (!p) return;
  for (const id of p.members) send(clients.get(id), partyState(p));
}

function createParty(c) {
  if (c.party) leaveParty(c);
  leaveQueue(c);
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (parties.has(code));
  const p = { code, host: c.id, members: new Set([c.id]), bots: 2 };
  parties.set(code, p);
  c.party = p;
  sendPartyState(p);
}

function joinParty(c, code) {
  const p = parties.get(String(code));
  if (!p) { send(c, { t: 'err', msg: 'No party with code ' + code }); return; }
  if (p.members.size >= MAX_MATCH) { send(c, { t: 'err', msg: 'Party is full' }); return; }
  if (c.party) leaveParty(c);
  leaveQueue(c);
  p.members.add(c.id);
  c.party = p;
  sendPartyState(p);
}

function leaveParty(c) {
  const p = c.party;
  if (!p) return;
  p.members.delete(c.id);
  c.party = null;
  send(c, partyState(null));
  if (p.members.size === 0) { parties.delete(p.code); return; }
  if (p.host === c.id) p.host = [...p.members][0];
  sendPartyState(p);
}

// ---------------------------------------------------------------- matches

function startMatch(playerIds, botCount) {
  const ids = playerIds.filter(id => {
    const c = clients.get(id);
    return c && c.room === 'lobby';
  });
  if (ids.length === 0) return;
  const room = 'm' + (nextMatch++);
  const bots = new Map();
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < botCount; i++) {
    const bid = 'b' + (i + 1);
    bots.set(bid, { id: bid, name: names[i % names.length] + '-' + (i + 1), hp: START_HP, alive: true });
  }
  // unique spawn indices for everyone
  const idx = [...Array(ARENA_SPAWNS).keys()].sort(() => Math.random() - 0.5);
  const spawns = {};
  let s = 0;
  for (const id of ids) spawns[id] = idx[s++ % ARENA_SPAWNS];
  for (const bid of bots.keys()) spawns[bid] = idx[s++ % ARENA_SPAWNS];

  const match = { room, players: new Set(ids), bots, botHost: ids[0], over: false };
  matches.set(room, match);

  const info = {
    t: 'matchStart',
    room,
    players: ids.map(id => ({ id, name: clients.get(id).name })),
    bots: [...bots.values()].map(b => ({ id: b.id, name: b.name })),
    botHost: match.botHost,
    spawns
  };
  for (const id of ids) {
    const c = clients.get(id);
    c.hp = START_HP;
    c.alive = true;
    leaveQueue(c);
    moveToRoom(c, room, null);
    send(c, info);
  }
  log(`match ${room}: ${ids.length} players, ${botCount} bots`);
}

function aliveCount(match) {
  let n = 0;
  for (const id of match.players) {
    const c = clients.get(id);
    if (c && c.alive) n++;
  }
  for (const b of match.bots.values()) if (b.alive) n++;
  return n;
}

function checkWin(match) {
  if (match.over) return;
  const humans = [...match.players].map(id => clients.get(id)).filter(c => c && c.alive);
  const bots = [...match.bots.values()].filter(b => b.alive);
  const total = humans.length + bots.length;
  if (total > 1 && humans.length > 0) return;
  match.over = true;
  let winner = null;
  if (humans.length === 1 && bots.length === 0) winner = { id: humans[0].id, name: humans[0].name };
  else if (humans.length === 0 && bots.length >= 1) winner = { id: bots[0].id, name: bots[0].name };
  else if (humans.length === 1) winner = { id: humans[0].id, name: humans[0].name }; // last human + bots edge
  broadcastRoom(match.room, { t: 'matchEnd', winner });
  log(`match ${match.room} over, winner: ${winner ? winner.name : 'none'}`);
  setTimeout(() => dissolveMatch(match), 6000);
}

function dissolveMatch(match) {
  for (const id of [...match.players]) {
    const c = clients.get(id);
    if (c && c.room === match.room) sendToLobby(c);
  }
  matches.delete(match.room);
}

function applyHit(match, reporter, targetId, dmg, by) {
  if (match.over) return;
  dmg = Math.max(2, Math.min(40, Number(dmg) || 0));
  if (targetId.startsWith('b')) {
    if (reporter.id !== match.botHost) return;         // only bot host reports bot damage
    const b = match.bots.get(targetId);
    if (!b || !b.alive) return;
    b.hp -= dmg;
    broadcastRoom(match.room, { t: 'health', id: targetId, hp: b.hp, by });
    if (b.hp <= 0) {
      b.alive = false;
      broadcastRoom(match.room, { t: 'elim', id: targetId, by, alive: aliveCount(match) });
      checkWin(match);
    }
  } else {
    if (reporter.id !== targetId) return;              // victims report their own damage
    const c = clients.get(targetId);
    if (!c || !c.alive || c.room !== match.room) return;
    c.hp -= dmg;
    broadcastRoom(match.room, { t: 'health', id: targetId, hp: c.hp, by });
    if (c.hp <= 0) {
      c.alive = false;
      broadcastRoom(match.room, { t: 'elim', id: targetId, by, alive: aliveCount(match) });
      setTimeout(() => { if (clients.has(c.id) && c.room === match.room && !matchOverFor(c)) sendToLobby(c); }, 3500);
      checkWin(match);
    }
  }
}

function matchOverFor(c) {
  const m = matches.get(c.room);
  return m ? m.over : false;
}

function leaveMatch(c) {
  const match = matches.get(c.room);
  if (!match) return;
  match.players.delete(c.id);
  if (c.alive) {
    c.alive = false;
    broadcastRoom(match.room, { t: 'elim', id: c.id, by: null, alive: aliveCount(match) }, c);
  }
  if (match.botHost === c.id) {
    const next = [...match.players][0];
    if (next) {
      match.botHost = next;
      broadcastRoom(match.room, { t: 'botHost', id: next });
    }
  }
  if (match.players.size === 0) matches.delete(match.room);
  else checkWin(match);
}

// ---------------------------------------------------------------- socket

function handleMessage(c, msg) {
  switch (msg.t) {
    case 'hello': {
      c.name = String(msg.name || '').slice(0, 14).replace(/[^\w\- ]/g, '') || ('UNIT-' + c.id);
      send(c, { t: 'welcome', id: c.id, name: c.name, players: lobbySnapshot(c) });
      broadcastRoom('lobby', { t: 'join', p: snapshot(c) }, c);
      log(`${c.name} (#${c.id}) connected`);
      break;
    }
    case 'state':
      c.lastState = msg.d;
      broadcastRoom(c.room, { t: 'state', id: c.id, d: msg.d }, c);
      break;
    case 'bots': {
      const m = matches.get(c.room);
      if (m && m.botHost === c.id) broadcastRoom(c.room, { t: 'bots', d: msg.d }, c);
      break;
    }
    case 'shoot':
      broadcastRoom(c.room, { t: 'shoot', id: msg.bot || c.id, o: msg.o, d: msg.d }, c);
      break;
    case 'hit': {
      const m = matches.get(c.room);
      if (m) applyHit(m, c, String(msg.target), msg.dmg, msg.by);
      break;
    }
    case 'queue':
      msg.on ? joinQueue(c) : leaveQueue(c);
      break;
    case 'party':
      if (msg.act === 'create') createParty(c);
      else if (msg.act === 'join') joinParty(c, msg.code);
      else if (msg.act === 'leave') leaveParty(c);
      else if (msg.act === 'bots' && c.party && c.party.host === c.id) {
        c.party.bots = Math.max(0, Math.min(7, Number(msg.n) || 0));
        sendPartyState(c.party);
      } else if (msg.act === 'start' && c.party && c.party.host === c.id) {
        const p = c.party;
        if (p.members.size + p.bots < 2) { send(c, { t: 'err', msg: 'Add a bot or a second player first' }); return; }
        startMatch([...p.members], p.bots);
      }
      break;
    case 'vsbots':
      startMatch([c.id], Math.max(1, Math.min(7, Number(msg.n) || 3)));
      break;
    case 'rtc': {
      const to = clients.get(msg.to);
      if (to && to.room === c.room) send(to, { t: 'rtc', from: c.id, data: msg.data });
      break;
    }
  }
}

function handleClose(c) {
  clients.delete(c.id);
  leaveQueue(c);
  leaveParty(c);
  leaveMatch(c);
  broadcastRoom(c.room, { t: 'leave', id: c.id });
  log(`${c.name || '#' + c.id} disconnected`);
}

function log(s) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
}

// ---------------------------------------------------------------- boot

const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', ws => {
  const c = { id: 'p' + (nextId++), ws, name: '', room: 'lobby', hp: START_HP, alive: true, party: null, lastState: null };
  clients.set(c.id, c);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', data => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    try { handleMessage(c, msg); } catch (e) { console.error('msg error', e); }
  });
  ws.on('close', () => handleClose(c));
  ws.on('error', () => {});
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

// Optional HTTPS (needed for VR headsets on the LAN — see README)
const keyFile = path.join(__dirname, '..', 'certs', 'key.pem');
const certFile = path.join(__dirname, '..', 'certs', 'cert.pem');
if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
  const tls = https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, serveStatic);
  const wssTls = new WebSocketServer({ server: tls, path: '/ws' });
  wssTls.on('connection', ws => wss.emit('connection', ws));
  tls.listen(8443, () => log('HTTPS on https://localhost:8443'));
}

server.listen(PORT, () => {
  log(`ECHO COMBAT server on http://localhost:${PORT}`);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) log(`  LAN: http://${net.address}:${PORT}`);
    }
  }
});
