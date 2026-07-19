// Shared material library. Built once, reused by lobby, arena and props.
import * as THREE from 'three';
import { hullTexture, deckTexture, hazardTexture, stripTexture, starfieldTexture } from './textures.js';

let M = null;

export function materials() {
  if (M) return M;

  const hullA = hullTexture({ base: '#97a2b0', dark: '#78828f', accentChance: 0.08 });
  const hullB = hullTexture({ base: '#4c545f', dark: '#3a414b', accent: '#4de8ff', accentChance: 0.06, panels: 5 });
  const deck = deckTexture({});
  const hazard = hazardTexture({});

  M = {
    hullLight: new THREE.MeshStandardMaterial({
      map: hullA.map, bumpMap: hullA.bumpMap, bumpScale: 1.6,
      roughnessMap: hullA.roughnessMap, roughness: 0.85, metalness: 0.55
    }),
    hullDark: new THREE.MeshStandardMaterial({
      map: hullB.map, bumpMap: hullB.bumpMap, bumpScale: 1.6,
      roughnessMap: hullB.roughnessMap, roughness: 0.9, metalness: 0.6
    }),
    deck: new THREE.MeshStandardMaterial({
      map: deck.map, bumpMap: deck.bumpMap, bumpScale: 1.2,
      roughness: 0.8, metalness: 0.5
    }),
    hazard: new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.7, metalness: 0.3 }),
    metalDark: new THREE.MeshStandardMaterial({ color: 0x2b323c, roughness: 0.5, metalness: 0.85 }),
    socketDark: new THREE.MeshStandardMaterial({ color: 0x0d1219, roughness: 0.7, metalness: 0.6, side: THREE.DoubleSide }),
    metalMid: new THREE.MeshStandardMaterial({ color: 0x59626e, roughness: 0.55, metalness: 0.8 }),
    metalLight: new THREE.MeshStandardMaterial({ color: 0x9fb0bd, roughness: 0.35, metalness: 0.9 }),
    pipe: new THREE.MeshStandardMaterial({ color: 0x6a7480, roughness: 0.45, metalness: 0.9 }),
    pipeOrange: new THREE.MeshStandardMaterial({ color: 0xb06a34, roughness: 0.5, metalness: 0.85 }),
    grabRail: new THREE.MeshStandardMaterial({ color: 0xd8b13c, roughness: 0.5, metalness: 0.65 }),
    glowCyan: new THREE.MeshStandardMaterial({
      color: 0x9adfff, emissive: 0x36c8e8, emissiveIntensity: 2.2, roughness: 0.4, metalness: 0
    }),
    glowOrange: new THREE.MeshStandardMaterial({
      color: 0xffc79a, emissive: 0xe86a1e, emissiveIntensity: 2.2, roughness: 0.4, metalness: 0
    }),
    glowWhite: new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xcfe8ff, emissiveIntensity: 2.6, roughness: 0.4, metalness: 0
    }),
    glowRed: new THREE.MeshStandardMaterial({
      color: 0xffb0a0, emissive: 0xe83a20, emissiveIntensity: 2.4, roughness: 0.4, metalness: 0
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x0a1420, roughness: 0.05, metalness: 0.9,
      transparent: true, opacity: 0.3, side: THREE.DoubleSide
    }),
    stripCyan: new THREE.MeshBasicMaterial({ map: stripTexture('#8fe8ff'), transparent: true, toneMapped: false, side: THREE.DoubleSide }),
    stripOrange: new THREE.MeshBasicMaterial({ map: stripTexture('#ffb066'), transparent: true, toneMapped: false, side: THREE.DoubleSide })
  };

  M.starfield = new THREE.MeshBasicMaterial({
    map: starfieldTexture({}), side: THREE.BackSide, fog: false, toneMapped: false
  });

  return M;
}
