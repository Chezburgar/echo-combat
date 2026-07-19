// Renderer + camera rig + WebXR session management.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export class Engine {
  constructor(parent) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');
    parent.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 900);

    // rig = the player's body frame. Physics moves/rotates the rig;
    // in VR the HMD + controllers float inside it.
    this.rig = new THREE.Group();
    this.rig.add(this.camera);

    // XR controller spaces (target ray + grip), sorted by handedness on connect
    this.hands = { left: null, right: null };
    for (let i = 0; i < 2; i++) {
      const ray = this.renderer.xr.getController(i);
      const grip = this.renderer.xr.getControllerGrip(i);
      this.rig.add(ray, grip);
      ray.addEventListener('connected', (e) => {
        const h = e.data.handedness === 'left' ? 'left' : 'right';
        this.hands[h] = { ray, grip, source: e.data };
      });
      ray.addEventListener('disconnected', () => {
        for (const h of ['left', 'right']) {
          if (this.hands[h] && this.hands[h].ray === ray) this.hands[h] = null;
        }
      });
    }

    this.scene = null;

    // shared reflection environment for metals
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.06).texture;
    pmrem.dispose();

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.onSessionChange = null;
    this.renderer.xr.addEventListener('sessionstart', () => { if (this.onSessionChange) this.onSessionChange(true); });
    this.renderer.xr.addEventListener('sessionend', () => { if (this.onSessionChange) this.onSessionChange(false); });
  }

  get inVR() { return this.renderer.xr.isPresenting; }

  setScene(scene) {
    if (this.scene) this.scene.remove(this.rig);
    this.scene = scene;
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.35;
    scene.add(this.rig);
  }

  async vrSupported() {
    if (!navigator.xr) return false;
    try { return await navigator.xr.isSessionSupported('immersive-vr'); }
    catch { return false; }
  }

  async enterVR() {
    if (this.inVR) return;
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor']
    });
    await this.renderer.xr.setSession(session);
  }

  // head position in rig-local space (HMD offset in VR, zero on desktop)
  headLocal(out) {
    out.copy(this.camera.position);
    return out;
  }

  headWorld(out) {
    return this.camera.getWorldPosition(out);
  }

  start(loop) {
    const clock = new THREE.Clock();
    this.renderer.setAnimationLoop((time, frame) => {
      const dt = Math.min(clock.getDelta(), 0.05);
      loop(dt, frame);
      if (this.scene) this.renderer.render(this.scene, this.camera);
    });
  }
}
