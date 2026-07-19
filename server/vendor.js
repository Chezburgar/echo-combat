// Copies the three.js runtime + the few addons we use into public/vendor
// so the client never depends on node_modules at runtime.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'public', 'vendor');

const files = [
  ['node_modules/three/build/three.module.js', 'three.module.js'],
  ['node_modules/three/build/three.core.js', 'three.core.js'],
  ['node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js', 'addons/geometries/RoundedBoxGeometry.js'],
  ['node_modules/three/examples/jsm/utils/BufferGeometryUtils.js', 'addons/utils/BufferGeometryUtils.js'],
  ['node_modules/three/examples/jsm/environments/RoomEnvironment.js', 'addons/environments/RoomEnvironment.js']
];

for (const [src, dst] of files) {
  const from = path.join(root, src);
  const to = path.join(out, dst);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log('vendored', dst);
}
