// ECHO COMBAT — main orchestrator.
// Lobby ⇄ match flow, networking, terminals, bots, voice, HUD.
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { AudioSys } from './core/audioSys.js';
import { UISystem } from './core/ui3d.js';
import { buildLobby } from './world/lobby.js';
import { buildArena } from './world/arena.js';
import { LocalPlayer } from './player/local.js';
import { RemotePlayer, colorForId, encodeState } from './player/remote.js';
import { RobotAvatar, makeViewmodel } from './player/robot.js';
import { Effects } from './game/effects.js';
import { Net } from './game/net.js';
import { Voice } from './game/voice.js';
import { BotSim } from './game/bots.js';
import { Hud } from './game/hud.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

const DMG = 20;

class App {
  constructor() {
    this.engine = new Engine(document.getElementById('app'));
    this.input = new Input(this.engine.renderer.domElement);
    this.audio = new AudioSys();
    this.hud = new Hud(this.engine);
    this.net = new Net();
    this.voice = new Voice(this.net, this.audio);
    this.effects = new Effects(this.audio);
    this.local = new LocalPlayer(this.engine, this.input, this.audio);
    this.ui = new UISystem();

    this.lobby = buildLobby(this.engine);
    this.arena = null;              // built on first match
    this.mode = 'lobby';
    this.remotes = new Map();       // id -> RemotePlayer (players AND bots)
    this.selfAvatar = null;
    this.viewmodel = null;

    this.myName = '';
    this.hp = 100;
    this.shieldT = 0;
    this.stateTimer = 0;
    this.botTimer = 0;
    this.time = 0;

    this.match = null;              // { room, botHost, spawns }
    this.botSim = null;
    this.queueState = { queued: false, n: 0, s: 0 };
    this.partyState = null;
    this.privMode = 'main';
    this.codeEntry = '';
    this.botCount = 3;
    this.lasers = { left: null, right: null };

    this.wireNet();
    this.wireDom();

    this.engine.setScene(this.lobby.scene);
    this.local.world = this.lobby.world;
    this.effects.setScene(this.lobby.scene);
    for (const p of Object.values(this.lobby.panels)) this.ui.add(p);

    this.engine.onSessionChange = (inVR) => this.refreshSelfVisibility();
    this.engine.start((dt, frame) => this.loop(dt, frame));

    // background tabs pause requestAnimationFrame — keep simulating at a low
    // rate so hidden players still take hits, send states and obey the server
    this.lastHiddenTick = performance.now();
    setInterval(() => {
      const now = performance.now();
      if (document.hidden) {
        const dt = Math.min((now - this.lastHiddenTick) / 1000, 0.5);
        try { this.loop(dt, null); } catch (e) { /* keep ticking */ }
      }
      this.lastHiddenTick = now;
    }, 250);
  }

  // ================================================================ DOM

  wireDom() {
    const start = document.getElementById('start');
    const nameInput = document.getElementById('callsign');
    nameInput.value = localStorage.getItem('callsign') || '';
    const launch = async () => {
      const name = (nameInput.value.trim() || 'UNIT-' + Math.floor(Math.random() * 900 + 100)).toUpperCase();
      localStorage.setItem('callsign', nameInput.value.trim());
      this.myName = name;
      this.audio.init();
      document.getElementById('launch').textContent = 'CONNECTING...';
      let welcome;
      try {
        welcome = await this.net.connect(name);
      } catch (e) {
        // no server (static hosting / cold start): solo mode, bots still work
        welcome = this.net.goOffline(name);
      }
      this.onWelcome(welcome);
      start.classList.add('hidden');
      this.hud.show();
      this.input.wantPointerLock = true;
      this.hud.hint('CLICK TO FLY  ·  WASD + SPACE/CTRL  ·  E GRAB  ·  TERMINALS BY THE BIG DOOR');
      if (this.net.offline) {
        this.hud.message('OFFLINE MODE', 'VS BOTS ONLY — SERVER UNREACHABLE', 5000);
      }
    };
    document.getElementById('launch').addEventListener('click', launch);
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') launch(); });

    document.getElementById('micbtn').addEventListener('click', () => this.voice.enableMic());
    this.voice.onStatus = (on, err) => this.hud.setMic(on, err);

    const vrbtn = document.getElementById('vrbtn');
    this.engine.vrSupported().then(ok => { if (ok) vrbtn.classList.remove('hidden'); });
    vrbtn.addEventListener('click', async () => {
      try { await this.engine.enterVR(); } catch (e) { this.hud.feed('VR: ' + e.message); }
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyV' && this.net.connected) this.voice.enableMic();
    });
  }

  onWelcome(msg) {
    this.selfAvatar = new RobotAvatar(colorForId(msg.id), this.myName);
    this.currentScene().add(this.selfAvatar.group);
    this.viewmodel = makeViewmodel(colorForId(msg.id));
    this.viewmodel.visible = false;
    this.engine.camera.add(this.viewmodel);
    this.refreshSelfVisibility();
    for (const p of msg.players) this.addRemote(p.id, p.name, p.state);
    this.local.spawnAt(this.pickLobbySpawn(), new THREE.Vector3(0, 4, 13));
    this.syncVoice();
    this.hud.setRoom('LOBBY');
  }

  currentScene() {
    return this.mode === 'match' ? this.arena.scene : this.lobby.scene;
  }

  currentWorld() {
    return this.mode === 'match' ? this.arena.world : this.lobby.world;
  }

  pickLobbySpawn() {
    return this.lobby.spawns[Math.floor(Math.random() * this.lobby.spawns.length)].clone();
  }

  refreshSelfVisibility() {
    if (!this.selfAvatar) return;
    const inVR = this.engine.inVR;
    this.selfAvatar.setVisibility(inVR ? 'handsOnly' : 'none');
    if (this.viewmodel) this.viewmodel.visible = !inVR && this.mode === 'match';
  }

  // ================================================================ remotes

  addRemote(id, name, state) {
    if (id === this.net.id || this.remotes.has(id)) return;
    const rp = new RemotePlayer(this.currentScene(), id, name);
    if (state) rp.push(state);
    this.remotes.set(id, rp);
    return rp;
  }

  removeRemote(id) {
    const rp = this.remotes.get(id);
    if (rp) {
      rp.dispose();
      this.remotes.delete(id);
    }
  }

  clearRemotes() {
    for (const rp of this.remotes.values()) rp.dispose();
    this.remotes.clear();
  }

  syncVoice() {
    const ids = [...this.remotes.keys()].filter(id => !id.startsWith('b'));
    this.voice.syncPeers(ids);
  }

  // ================================================================ panels

  setupPanels() {
    const { match, private: priv, bots } = this.lobby.panels;

    // ---- matchmaking ----
    match.drawBody = (g, W, H) => {
      g.font = '20px Arial';
      g.textAlign = 'left';
      g.fillStyle = '#9db8c8';
      const q = this.queueState;
      if (!q.queued) {
        g.fillText('Ranked free-for-all. Up to 8 pilots.', 24, 92);
        g.fillText('Last one flying wins.', 24, 120);
        g.fillStyle = '#4de8ff';
        g.fillText('STATUS:  STANDBY', 24, 168);
      } else {
        g.fillStyle = '#4de8ff';
        g.fillText('STATUS:  IN QUEUE', 24, 92);
        g.fillStyle = '#ffffff';
        g.font = 'bold 26px Arial';
        g.fillText(q.n + ' PILOT' + (q.n === 1 ? '' : 'S') + ' READY', 24, 132);
        if (q.s > 0) {
          g.fillStyle = '#ff8a3c';
          g.fillText('LAUNCH IN ' + q.s, 24, 172);
        } else if (q.n < 2) {
          g.font = '18px Arial';
          g.fillStyle = '#9db8c8';
          g.fillText('Waiting for a second pilot...', 24, 172);
        }
      }
    };
    const refreshMatchButtons = () => {
      match.setButtons(this.queueState.queued
        ? [{ id: 'cancel', x: 140, y: 300, w: 230, h: 62, label: 'CANCEL', color: 'orange' }]
        : [{ id: 'join', x: 140, y: 300, w: 230, h: 62, label: 'JOIN QUEUE', color: 'green' }]);
      match.redraw();
    };
    this.refreshMatchButtons = refreshMatchButtons;
    match.onButton = (id) => {
      this.audio.beep(id === 'join' ? 980 : 500);
      this.net.queue(id === 'join');
    };
    refreshMatchButtons();

    // ---- private ----
    priv.drawBody = (g, W, H) => {
      g.textAlign = 'left';
      const p = this.partyState;
      if (this.privMode === 'code') {
        g.font = '20px Arial';
        g.fillStyle = '#9db8c8';
        g.fillText('ENTER PARTY CODE', 24, 90);
        g.font = 'bold 44px Arial';
        g.fillStyle = '#ffffff';
        const code = (this.codeEntry + '____').slice(0, 4);
        g.fillText(code.split('').join('  '), 24, 135);
      } else if (p && p.code) {
        g.font = '18px Arial';
        g.fillStyle = '#9db8c8';
        g.fillText('PARTY CODE', 24, 84);
        g.font = 'bold 40px Arial';
        g.fillStyle = '#ff8a3c';
        g.fillText(p.code.split('').join(' '), 150, 84);
        g.font = '18px Arial';
        let y = 118;
        for (const m of p.members.slice(0, 6)) {
          g.fillStyle = m.id === p.host ? '#4dff9e' : '#dff4ff';
          g.fillText((m.id === p.host ? '★ ' : '· ') + m.name, 24, y);
          y += 24;
        }
        g.fillStyle = '#9db8c8';
        g.fillText('BOTS:', 300, 118);
        g.font = 'bold 30px Arial';
        g.fillStyle = '#ffffff';
        g.fillText(String(p.bots), 372, 120);
      } else {
        g.font = '20px Arial';
        g.fillStyle = '#9db8c8';
        g.fillText('Create a party and share the code,', 24, 92);
        g.fillText('or join a friend. Host can add bots.', 24, 120);
      }
    };
    const refreshPrivButtons = () => {
      const p = this.partyState;
      let btns = [];
      if (this.privMode === 'code') {
        const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
        digits.forEach((d, i) => {
          btns.push({ id: 'd' + d, x: 24 + (i % 5) * 78, y: 160 + Math.floor(i / 5) * 62, w: 66, h: 52, label: d, small: true });
        });
        btns.push({ id: 'clr', x: 424, y: 160, w: 66, h: 52, label: 'CLR', small: true, color: 'orange' });
        btns.push({ id: 'go', x: 424, y: 222, w: 66, h: 52, label: 'OK', small: true, color: 'green' });
        btns.push({ id: 'back', x: 24, y: 300, w: 120, h: 52, label: 'BACK', small: true });
      } else if (p && p.code) {
        const host = p.host === this.net.id;
        if (host) {
          btns.push({ id: 'bot-', x: 300, y: 150, w: 56, h: 48, label: '−', small: true });
          btns.push({ id: 'bot+', x: 366, y: 150, w: 56, h: 48, label: '+', small: true });
          btns.push({ id: 'start', x: 24, y: 300, w: 220, h: 62, label: 'LAUNCH', color: 'green' });
        }
        btns.push({ id: 'leave', x: 280, y: 300, w: 200, h: 62, label: 'LEAVE', color: 'orange' });
      } else {
        btns.push({ id: 'create', x: 24, y: 220, w: 220, h: 62, label: 'CREATE', color: 'green' });
        btns.push({ id: 'joincode', x: 270, y: 220, w: 220, h: 62, label: 'JOIN', color: 'cyan' });
      }
      priv.setButtons(btns);
      priv.redraw();
    };
    this.refreshPrivButtons = refreshPrivButtons;
    priv.onButton = (id) => {
      this.audio.beep(760);
      if (id === 'create') this.net.party('create');
      else if (id === 'joincode') { this.privMode = 'code'; this.codeEntry = ''; refreshPrivButtons(); }
      else if (id === 'back') { this.privMode = 'main'; refreshPrivButtons(); }
      else if (id === 'clr') { this.codeEntry = ''; refreshPrivButtons(); }
      else if (id.startsWith('d')) {
        if (this.codeEntry.length < 4) this.codeEntry += id.slice(1);
        refreshPrivButtons();
      } else if (id === 'go') {
        if (this.codeEntry.length === 4) {
          this.net.party('join', { code: this.codeEntry });
          this.privMode = 'main';
          refreshPrivButtons();
        }
      } else if (id === 'bot+') this.net.party('bots', { n: (this.partyState?.bots ?? 0) + 1 });
      else if (id === 'bot-') this.net.party('bots', { n: (this.partyState?.bots ?? 0) - 1 });
      else if (id === 'start') this.net.party('start');
      else if (id === 'leave') this.net.party('leave');
    };
    refreshPrivButtons();

    // ---- vs bots ----
    bots.drawBody = (g, W, H) => {
      g.font = '20px Arial';
      g.textAlign = 'left';
      g.fillStyle = '#9db8c8';
      g.fillText('Solo battle royale against AI pilots.', 24, 92);
      g.fillText('OPPONENTS:', 24, 168);
      g.font = 'bold 56px Arial';
      g.fillStyle = '#ffffff';
      g.fillText(String(this.botCount), 220, 178);
    };
    const refreshBotButtons = () => {
      bots.setButtons([
        { id: 'b-', x: 290, y: 138, w: 64, h: 54, label: '−', small: true },
        { id: 'b+', x: 364, y: 138, w: 64, h: 54, label: '+', small: true },
        { id: 'launch', x: 140, y: 300, w: 230, h: 62, label: 'LAUNCH', color: 'green' }
      ]);
      bots.redraw();
    };
    bots.onButton = (id) => {
      this.audio.beep(760);
      if (id === 'b-') { this.botCount = Math.max(1, this.botCount - 1); refreshBotButtons(); }
      else if (id === 'b+') { this.botCount = Math.min(7, this.botCount + 1); refreshBotButtons(); }
      else if (id === 'launch') this.net.vsBots(this.botCount);
    };
    refreshBotButtons();
  }

  // ================================================================ net

  wireNet() {
    const n = this.net;
    this.setupPanels();

    n.on('join', (msg) => {
      if (this.mode === 'lobby') {
        this.addRemote(msg.p.id, msg.p.name, msg.p.state);
        this.hud.feed('<b>' + msg.p.name + '</b> docked');
        this.syncVoice();
      }
    });

    n.on('leave', (msg) => {
      const rp = this.remotes.get(msg.id);
      if (rp) this.hud.feed('<b>' + rp.name + '</b> left');
      this.removeRemote(msg.id);
      this.syncVoice();
    });

    n.on('state', (msg) => {
      const rp = this.remotes.get(msg.id);
      if (rp) rp.push(msg.d);
    });

    n.on('bots', (msg) => {
      if (this.isBotHost()) return;
      for (const [id, d] of Object.entries(msg.d)) {
        const rp = this.remotes.get(id);
        if (rp) rp.push(d);
      }
    });

    n.on('shoot', (msg) => {
      const o = new THREE.Vector3(...msg.o);
      const d = new THREE.Vector3(...msg.d);
      this.effects.spawnProjectile(msg.id, o, d, colorForId(msg.id));
      this.effects.muzzleFlash(o, colorForId(msg.id));
      this.audio.laser(o);
    });

    n.on('queue', (msg) => {
      this.queueState = { queued: msg.n > 0 && !msg.left, n: msg.n, s: msg.s };
      if (msg.left) this.queueState.queued = false;
      this.refreshMatchButtons();
    });

    n.on('party', (msg) => {
      this.partyState = msg.code ? msg : null;
      this.refreshPrivButtons();
    });

    n.on('matchStart', (msg) => this.enterMatch(msg));

    n.on('health', (msg) => {
      if (msg.id === this.net.id) {
        if (msg.hp < this.hp) {
          this.audio.hurt();
          this.flashDamage();
        }
        this.hp = msg.hp;
      } else {
        const rp = this.remotes.get(msg.id);
        if (rp) rp.setHealth(msg.hp);
      }
    });

    n.on('elim', (msg) => {
      const isMe = msg.id === this.net.id;
      const victim = isMe ? { name: this.myName } : this.remotes.get(msg.id);
      const killer = msg.by === this.net.id ? { name: this.myName } : this.remotes.get(msg.by);
      const pos = isMe ? this.local.headWorld(_v1.clone()) : victim ? victim.headPos.clone() : null;
      if (pos) this.effects.explosion(pos, colorForId(msg.id));
      if (victim) {
        this.hud.feed('<b>' + (killer ? killer.name : '??') + '</b> eliminated <b>' + victim.name + '</b>');
      }
      this.hud.setAlive(msg.alive);
      if (isMe) {
        this.local.alive = false;
        this.local.canShoot = false;
        this.audio.sting(false);
        this.hud.message('ELIMINATED', 'RETURNING TO HANGAR', 3400);
      } else {
        const rp = this.remotes.get(msg.id);
        if (rp) {
          rp.alive = false;
          rp.avatar.group.visible = false;
        }
        if (msg.id.startsWith('b') && this.botSim) this.botSim.removeBot(msg.id);
        if (msg.by === this.net.id) this.audio.beep(1240, 0.12, 0.2);
      }
    });

    n.on('matchEnd', (msg) => {
      this.local.canShoot = false;
      if (msg.winner && msg.winner.id === this.net.id) {
        this.hud.message('VICTORY', 'ALL HOSTILES ELIMINATED', 5000);
        this.audio.sting(true);
      } else if (msg.winner) {
        this.hud.message(msg.winner.name + ' WINS', '', 5000);
      } else {
        this.hud.message('MATCH OVER', '', 4000);
      }
    });

    n.on('toLobby', (msg) => this.enterLobby(msg.players));

    n.on('botHost', (msg) => {
      if (msg.id === this.net.id && this.match) {
        this.match.botHost = this.net.id;
        this.adoptBots();
      }
    });

    n.on('err', (msg) => this.hud.feed('<b>!</b> ' + msg.msg));

    n.on('disconnect', () => {
      if (!this.net.offline) this.hud.message('DISCONNECTED', 'REFRESH TO RECONNECT', 0);
    });
  }

  flashDamage() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;background:radial-gradient(ellipse, transparent 55%, rgba(255,40,20,0.45));pointer-events:none;z-index:15;';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 180);
  }

  isBotHost() {
    return this.match && this.match.botHost === this.net.id;
  }

  // ================================================================ match flow

  enterMatch(msg) {
    if (!this.arena) this.arena = buildArena(this.engine);
    this.mode = 'match';
    this.match = { room: msg.room, botHost: msg.botHost, spawns: msg.spawns };
    this.hp = 100;
    this.shieldT = 3;
    this.local.alive = true;
    this.local.canShoot = false;

    this.clearRemotes();
    this.engine.setScene(this.arena.scene);
    this.currentScene().add(this.selfAvatar.group);
    this.effects.setScene(this.arena.scene);
    this.local.world = this.arena.world;

    for (const p of msg.players) this.addRemote(p.id, p.name);
    for (const b of msg.bots) this.addRemote(b.id, b.name);

    // spawn everyone at their assigned pads so avatars are placed sanely
    for (const [id, idx] of Object.entries(msg.spawns)) {
      const rp = this.remotes.get(id);
      if (rp) rp.headPos.copy(this.arena.spawns[idx]);
    }

    const mySpawn = this.arena.spawns[msg.spawns[this.net.id]] || this.arena.spawns[0];
    this.local.spawnAt(mySpawn.clone(), new THREE.Vector3(0, 2, 0));

    if (this.match.botHost === this.net.id && msg.bots.length) {
      this.botSim = new BotSim(this.arena.world, this.arena.waypoints);
      for (const b of msg.bots) {
        this.botSim.addBot(b.id, this.arena.spawns[msg.spawns[b.id]] || this.arena.spawns[0]);
      }
    } else {
      this.botSim = null;
    }

    this.hud.setRoom('THE GAUNTLET');
    this.hud.setAlive(msg.players.length + msg.bots.length);
    this.hud.hint(this.engine.inVR ? '' : 'SHIFT BOOST · X BRAKE · E GRAB · LAST ONE FLYING WINS');
    this.hud.message('MATCH START', 'WEAPONS LIVE IN 3', 3000);
    this.audio.beep(660, 0.1);
    setTimeout(() => {
      if (this.mode === 'match') {
        this.local.canShoot = true;
        this.hud.message('WEAPONS LIVE', '', 1500);
        this.audio.beep(1100, 0.14, 0.2);
      }
    }, 3000);

    this.syncVoice();
    this.refreshSelfVisibility();
  }

  adoptBots() {
    // became bot host mid-match: rebuild sim from replicated positions
    this.botSim = new BotSim(this.arena.world, this.arena.waypoints);
    for (const [id, rp] of this.remotes) {
      if (id.startsWith('b') && rp.alive) this.botSim.addBot(id, rp.headPos.clone());
    }
  }

  enterLobby(players) {
    this.mode = 'lobby';
    this.match = null;
    this.botSim = null;
    this.hp = 100;
    this.local.alive = true;
    this.local.canShoot = false;

    this.clearRemotes();
    this.engine.setScene(this.lobby.scene);
    this.lobby.scene.add(this.selfAvatar.group);
    this.effects.setScene(this.lobby.scene);
    this.local.world = this.lobby.world;
    this.local.spawnAt(this.pickLobbySpawn(), new THREE.Vector3(0, 4, 13));

    for (const p of players || []) this.addRemote(p.id, p.name, p.state);

    this.hud.setRoom('LOBBY');
    this.hud.setAlive(0);
    this.hud.hint('TERMINALS BY THE BIG DOOR  ·  V TOGGLES MIC');
    this.queueState = { queued: false, n: 0, s: 0 };
    this.refreshMatchButtons();
    this.syncVoice();
    this.refreshSelfVisibility();
  }

  // ================================================================ frame loop

  loop(dt, frame) {
    this.time += dt;
    const session = this.engine.renderer.xr.getSession();
    this.input.pollXR(session);

    if (!this.net.connected) {
      // idle attract: slow orbit before joining
      this.lobby.animate(this.time);
      this.input.endFrame();
      return;
    }

    // ---------------- local player ----------------
    const events = this.local.update(dt);
    this.shieldT = Math.max(0, this.shieldT - dt);

    for (const shot of events.shots) {
      this.effects.spawnProjectile(this.net.id, shot.o, shot.d, colorForId(this.net.id));
      this.net.sendShoot(shot.o, shot.d);
      this.audio.laser(null, true);
      const mp = this.muzzlePos(shot);
      if (mp) this.effects.muzzleFlash(mp, colorForId(this.net.id));
    }

    // self avatar pose (world space)
    const headP = this.local.headWorld(_v1);
    const headQ = _q1.copy(this.engine.rig.quaternion).multiply(this.engine.camera.quaternion);
    let lh = null, rh = null;
    if (this.engine.inVR) {
      if (this.engine.hands.left) {
        lh = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
        this.local.handWorld('left', lh.p, lh.q);
      }
      if (this.engine.hands.right) {
        rh = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
        this.local.handWorld('right', rh.p, rh.q);
      }
    } else {
      lh = { p: _v2.set(-0.26, -0.35, -0.32).applyQuaternion(headQ).add(headP).clone(), q: headQ.clone() };
      rh = { p: _v2.set(0.26, -0.33, -0.38).applyQuaternion(headQ).add(headP).clone(), q: headQ.clone() };
    }
    this.selfAvatar.setPose({ p: headP, q: headQ }, lh, rh, dt);
    this.selfAvatar.setThrottle(this.local.throttle);

    // ---------------- network state send ----------------
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.stateTimer = 1 / 15;
      this.net.sendState(encodeState(
        headP, headQ,
        lh ? lh.p : headP, lh ? lh.q : headQ,
        rh ? rh.p : headP, rh ? rh.q : headQ,
        this.local.throttle
      ));
    }

    // ---------------- remotes ----------------
    for (const rp of this.remotes.values()) rp.update(dt);

    // ---------------- bots (host only) ----------------
    if (this.mode === 'match' && this.botSim) {
      const targets = this.buildTargets(true);
      this.botSim.update(dt, targets, (bot, o, d) => {
        this.effects.spawnProjectile(bot.id, o, d, colorForId(bot.id));
        this.net.sendShoot(o, d, bot.id);
        this.audio.laser(o);
      });
      const states = this.botSim.states();
      for (const [id, d] of Object.entries(states)) {
        const rp = this.remotes.get(id);
        if (rp) rp.push(d);
      }
      this.botTimer -= dt;
      if (this.botTimer <= 0) {
        this.botTimer = 0.09;
        this.net.sendBots(states);
      }
    }

    // ---------------- projectiles & hits ----------------
    const targets = this.buildTargets(false);
    this.effects.update(dt, this.currentWorld(), targets, (targetId, ownerId) => {
      if (this.mode !== 'match') return;
      if (targetId === this.net.id) {
        if (this.shieldT > 0 || !this.local.alive) return;
        this.net.sendHit(this.net.id, DMG, ownerId);
      } else if (targetId.startsWith('b') && this.isBotHost()) {
        this.net.sendHit(targetId, DMG, ownerId);
      }
    });

    // ---------------- lobby UI ----------------
    if (this.mode === 'lobby') {
      this.updateLobbyUI();
      this.lobby.animate(this.time);
    } else {
      this.arena.animate(this.time);
    }

    // ---------------- audio & voice ----------------
    this.audio.updateListener(this.engine.camera);
    this.voice.updatePositions((id) => {
      const rp = this.remotes.get(id);
      return rp ? rp.headPos : null;
    });

    // ---------------- HUD ----------------
    this.hud.setVitals(this.hp, this.local.boost);
    this.hud.update(this.engine.inVR);

    this.input.endFrame();
  }

  muzzlePos(shot) {
    if (!this.engine.inVR && this.viewmodel && this.viewmodel.visible) {
      return this.viewmodel.userData.muzzle.getWorldPosition(_v2).clone();
    }
    return shot.o;
  }

  buildTargets(forBots) {
    const out = [];
    // self
    if (this.local.alive) {
      out.push({ id: this.net.id, head: this.local.headWorld(new THREE.Vector3()), alive: true });
    }
    for (const [id, rp] of this.remotes) {
      if (!rp.hasState) continue;
      // on the bot host, bot positions come from the sim (fresher than interp)
      if (forBots || !(this.botSim && this.botSim.bots.has(id))) {
        out.push({ id, head: rp.headPos, alive: rp.alive });
      } else {
        const bot = this.botSim.bots.get(id);
        out.push({ id, head: bot.pos, alive: rp.alive });
      }
    }
    return out;
  }

  updateLobbyUI() {
    const rays = [];
    if (!this.engine.inVR) {
      const headP = this.local.headWorld(_v1);
      const camQ = _q1.copy(this.engine.rig.quaternion).multiply(this.engine.camera.quaternion);
      rays.push({ id: 'pc', origin: headP.clone(), dir: _v2.set(0, 0, -1).applyQuaternion(camQ).clone() });
    } else {
      for (const hand of ['left', 'right']) {
        if (!this.engine.hands[hand]) continue;
        const o = new THREE.Vector3(), d = new THREE.Vector3();
        if (this.local.aimRay(hand, o, d)) rays.push({ id: hand, origin: o, dir: d });
      }
    }
    this.ui.update(rays);

    // clicks
    if (!this.engine.inVR) {
      if (this.input.clicked && this.input.pointerLocked) {
        if (this.ui.click('pc')) this.audio.beep(880, 0.05, 0.08);
      }
    } else {
      for (const hand of ['left', 'right']) {
        if (this.input.xr[hand].triggerPressed) {
          if (this.ui.click(hand)) this.audio.beep(880, 0.05, 0.08);
        }
      }
      this.updateLasers();
    }
  }

  updateLasers() {
    for (const hand of ['left', 'right']) {
      const h = this.engine.hands[hand];
      if (!h) continue;
      if (!this.lasers[hand]) {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)
        ]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
          color: 0x4de8ff, transparent: true, opacity: 0.6
        }));
        h.ray.add(line);
        this.lasers[hand] = line;
      }
      const hit = this.ui.hits[hand];
      const laser = this.lasers[hand];
      laser.visible = this.mode === 'lobby' && !!hit;
      if (hit) laser.scale.set(1, 1, hit.dist);
    }
  }
}

window.APP = new App();   // exposed for debugging
