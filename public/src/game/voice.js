// Proximity voice chat: WebRTC mesh within the current room, positional
// playback through WebAudio panners (works in VR and on desktop).
export class Voice {
  constructor(net, audioSys) {
    this.net = net;
    this.audio = audioSys;
    this.peers = new Map();   // id -> { pc, panner, gain, stream, audioEl }
    this.micStream = null;
    this.micEnabled = false;
    this.onStatus = null;

    net.on('rtc', (msg) => this.handleSignal(msg.from, msg.data));
  }

  async enableMic() {
    if (this.micStream) {
      this.micEnabled = !this.micEnabled;
      for (const track of this.micStream.getAudioTracks()) track.enabled = this.micEnabled;
      if (this.onStatus) this.onStatus(this.micEnabled);
      return this.micEnabled;
    }
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      this.micEnabled = true;
      if (this.onStatus) this.onStatus(true);
      // add to existing peers
      for (const [id, peer] of this.peers) {
        for (const track of this.micStream.getTracks()) peer.pc.addTrack(track, this.micStream);
      }
      return true;
    } catch (e) {
      console.warn('mic unavailable:', e.message);
      if (this.onStatus) this.onStatus(false, true);
      return false;
    }
  }

  // call whenever room membership changes
  syncPeers(ids) {
    const want = new Set(ids.filter(id => id !== this.net.id));
    for (const [id, peer] of [...this.peers]) {
      if (!want.has(id)) this.closePeer(id);
    }
    for (const id of want) {
      if (!this.peers.has(id) && this.net.id < id) this.createPeer(id, true);
    }
  }

  createPeer(id, initiator) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    const peer = { pc, panner: null, stream: null, audioEl: null, pending: [] };
    this.peers.set(id, peer);

    if (this.micStream) {
      for (const track of this.micStream.getTracks()) pc.addTrack(track, this.micStream);
    } else {
      // still create a recv-only channel so we can hear them
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) this.net.rtc(id, { kind: 'ice', candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      peer.stream = stream;
      // Chrome quirk: WebRTC audio must be attached to a media element to flow
      const el = new Audio();
      el.srcObject = stream;
      el.muted = true;
      el.play().catch(() => {});
      peer.audioEl = el;
      if (this.audio.ctx) {
        const src = this.audio.ctx.createMediaStreamSource(stream);
        peer.panner = this.audio.panner(null, 1.5, 40);
        src.connect(peer.panner);
      }
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        // let syncPeers re-establish if they're still around
      }
    };

    if (initiator) {
      pc.onnegotiationneeded = async () => {
        try {
          await pc.setLocalDescription(await pc.createOffer());
          this.net.rtc(id, { kind: 'offer', sdp: pc.localDescription });
        } catch (e) { console.warn('offer failed', e); }
      };
    }
    return peer;
  }

  async handleSignal(from, data) {
    let peer = this.peers.get(from);
    if (!peer) peer = this.createPeer(from, false);
    const pc = peer.pc;
    try {
      if (data.kind === 'offer') {
        await pc.setRemoteDescription(data.sdp);
        await pc.setLocalDescription(await pc.createAnswer());
        this.net.rtc(from, { kind: 'answer', sdp: pc.localDescription });
        for (const c of peer.pending) await pc.addIceCandidate(c).catch(() => {});
        peer.pending = [];
      } else if (data.kind === 'answer') {
        await pc.setRemoteDescription(data.sdp);
        for (const c of peer.pending) await pc.addIceCandidate(c).catch(() => {});
        peer.pending = [];
      } else if (data.kind === 'ice') {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
        else peer.pending.push(data.candidate);
      }
    } catch (e) {
      console.warn('rtc signal error', e);
    }
  }

  closePeer(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    try { peer.pc.close(); } catch {}
    if (peer.audioEl) { peer.audioEl.srcObject = null; }
    if (peer.panner) peer.panner.disconnect();
    this.peers.delete(id);
  }

  // update 3D positions of everyone's voice
  updatePositions(getPos) {
    if (!this.audio.ctx) return;
    for (const [id, peer] of this.peers) {
      if (!peer.panner) continue;
      const pos = getPos(id);
      if (pos) this.audio.setPannerPos(peer.panner, pos);
    }
  }
}
