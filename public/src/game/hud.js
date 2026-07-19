// HUD: DOM overlay on desktop + a wrist-anchored panel in VR showing the
// same vitals, plus big center messages in both.
import * as THREE from 'three';

export class Hud {
  constructor(engine) {
    this.engine = engine;
    this.el = {
      hud: document.getElementById('hud'),
      hp: document.getElementById('hpfill'),
      boost: document.getElementById('boostfill'),
      room: document.getElementById('roomlabel'),
      alive: document.getElementById('alivelabel'),
      center: document.getElementById('centermsg'),
      sub: document.getElementById('submsg'),
      feed: document.getElementById('feed'),
      hint: document.getElementById('hint'),
      mic: document.getElementById('micbtn'),
      vr: document.getElementById('vrbtn'),
      crosshair: document.getElementById('crosshair')
    };
    this.centerTimer = null;
    this.hp = 100;
    this.boost = 1;
    this.aliveN = 0;
    this.roomName = 'LOBBY';
    this.centerText = '';
    this.subText = '';

    // ---- VR wrist/board panel ----
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 176;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.vrPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.117),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, toneMapped: false })
    );
    this.vrPanel.renderOrder = 999;
    this.vrPanel.visible = false;
    // big center message plane
    this.msgCanvas = document.createElement('canvas');
    this.msgCanvas.width = 1024;
    this.msgCanvas.height = 192;
    this.msgTex = new THREE.CanvasTexture(this.msgCanvas);
    this.msgTex.colorSpace = THREE.SRGBColorSpace;
    this.vrMsg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.28),
      new THREE.MeshBasicMaterial({ map: this.msgTex, transparent: true, depthTest: false, toneMapped: false })
    );
    this.vrMsg.renderOrder = 999;
    this.vrMsg.visible = false;
    engine.camera.add(this.vrPanel, this.vrMsg);
    this.vrPanel.position.set(0, -0.22, -0.55);
    this.vrPanel.rotation.x = -0.35;
    this.vrMsg.position.set(0, 0.12, -1.4);
    this.vrDirty = true;
  }

  show() { this.el.hud.classList.remove('hidden'); }

  setVitals(hp, boost) {
    if (hp !== this.hp || Math.abs(boost - this.boost) > 0.02) this.vrDirty = true;
    this.hp = hp;
    this.boost = boost;
    this.el.hp.style.width = Math.max(0, hp) + '%';
    this.el.hp.classList.toggle('low', hp <= 35);
    this.el.boost.style.width = Math.round(boost * 100) + '%';
  }

  setRoom(name) {
    this.roomName = name;
    this.el.room.textContent = name;
    this.vrDirty = true;
  }

  setAlive(n) {
    this.aliveN = n;
    if (n > 0) {
      this.el.alive.textContent = n + ' ALIVE';
      this.el.alive.classList.remove('hidden');
    } else {
      this.el.alive.classList.add('hidden');
    }
    this.vrDirty = true;
  }

  message(text, sub = '', ms = 3000) {
    this.centerText = text;
    this.subText = sub;
    this.el.center.textContent = text;
    this.el.sub.textContent = sub;
    this.el.center.classList.toggle('hidden', !text);
    this.el.sub.classList.toggle('hidden', !sub);
    this.drawVrMsg();
    if (this.centerTimer) clearTimeout(this.centerTimer);
    if (ms > 0 && text) {
      this.centerTimer = setTimeout(() => this.message('', '', 0), ms);
    }
  }

  feed(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    this.el.feed.prepend(div);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
    setTimeout(() => div.remove(), 6000);
  }

  hint(text) { this.el.hint.textContent = text; }

  setMic(on, error) {
    this.el.mic.textContent = error ? 'MIC ERROR' : on ? 'MIC ON' : 'MIC OFF';
    this.el.mic.classList.toggle('on', !!on);
  }

  // ---- VR panel drawing ----
  drawVr() {
    const g = this.canvas.getContext('2d');
    const W = 512, H = 176;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(7,13,22,0.82)';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(77,232,255,0.5)';
    g.lineWidth = 3;
    g.strokeRect(2, 2, W - 4, H - 4);
    g.font = 'bold 26px Arial';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = '#9db8c8';
    g.fillText('HULL', 24, 44);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(110, 28, 300, 30);
    g.fillStyle = this.hp <= 35 ? '#e0472f' : '#2fe08a';
    g.fillRect(110, 28, 3 * Math.max(0, this.hp), 30);
    g.fillStyle = '#9db8c8';
    g.fillText('BOOST', 24, 92);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(110, 76, 300, 20);
    g.fillStyle = '#4de8ff';
    g.fillRect(110, 76, 300 * this.boost, 20);
    g.fillStyle = '#4de8ff';
    g.font = 'bold 24px Arial';
    g.fillText(this.roomName, 24, 140);
    if (this.aliveN > 0) {
      g.textAlign = 'right';
      g.fillStyle = '#ffffff';
      g.fillText(this.aliveN + ' ALIVE', W - 24, 140);
    }
    this.tex.needsUpdate = true;
  }

  drawVrMsg() {
    const g = this.msgCanvas.getContext('2d');
    g.clearRect(0, 0, 1024, 192);
    if (this.centerText) {
      g.font = '900 84px Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = '#4de8ff';
      g.shadowBlur = 24;
      g.fillStyle = '#ffffff';
      g.fillText(this.centerText, 512, 70);
      if (this.subText) {
        g.font = '600 40px Arial';
        g.fillStyle = '#ff8a3c';
        g.shadowBlur = 10;
        g.fillText(this.subText, 512, 150);
      }
    }
    this.msgTex.needsUpdate = true;
    this.vrMsg.visible = !!this.centerText;
  }

  update(inVR) {
    this.vrPanel.visible = inVR;
    this.el.crosshair.style.display = inVR ? 'none' : '';
    if (inVR && this.vrDirty) {
      this.drawVr();
      this.vrDirty = false;
    }
    if (!this.centerText) this.vrMsg.visible = false;
  }
}
