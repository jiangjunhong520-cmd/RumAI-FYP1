import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { openViewer } from './viewer.js';

const panel = document.querySelector('#ar-panel');
const status = document.querySelector('#ar-status');
const start = document.querySelector('#ar-start');
let selected, session, hitSource, renderer, scene;
let generation = 0;

function disposeModel(model) {
  model?.traverse(node => {
    node.geometry?.dispose();
    const materials = node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : [];
    materials.forEach(material => {
      Object.values(material).forEach(value => { if (value?.isTexture) value.dispose(); });
      material.dispose();
    });
  });
}
function release() {
  hitSource?.cancel(); hitSource = null;
  renderer?.setAnimationLoop(null);
  disposeModel(scene);
  renderer?.dispose(); renderer?.domElement.remove();
  renderer = null; scene = null;
}
async function stop() {
  if (session) await session.end();
  else release();
}
document.querySelector('#ar-close').onclick = async () => { await stop(); generation++; panel.hidden = true; };
document.querySelector('#ar-fallback').onclick = async () => {
  await stop(); generation++; panel.hidden = true; openViewer(selected);
};
// Prevent overlay button taps from also placing the sofa.
panel.addEventListener('beforexrselect', event => event.preventDefault());

export async function openAR(item) {
  await stop();
  const token = ++generation;
  selected = item; panel.hidden = false; start.disabled = true;
  document.querySelector('#ar-title').textContent = `${item.name} in AR`;
  document.querySelector('#ar-asset').textContent = item.gltfURL
    ? 'Catalogue model. Scale accuracy and room fit are not verified.'
    : 'Shared sample sofa, not this product. Native scale only; physical size and room fit are not verified. Sample: Eric Chadwick / DGG, CC BY 4.0; original Fran Calvente, CC0.';
  status.textContent = 'Checking WebXR AR support…';
  try {
    if (!isSecureContext || !navigator.xr) {
      status.textContent = 'AR is unavailable here. Use a supported browser over HTTPS, or use View in 3D.';
      return;
    }
    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    if (token !== generation) return;
    start.disabled = !supported;
    status.textContent = supported ? 'AR available. Tap Start AR, then move your device slowly toward a floor. Tap when the ring appears to place or reposition the sofa.'
      : 'This device/browser does not support immersive AR. View in 3D is available.';
  } catch {
    if (token === generation) status.textContent = 'Could not check AR support. You can still use View in 3D.';
  }
}

// A separate button keeps requestSession directly inside a user gesture.
start.onclick = async () => {
  start.disabled = true;
  const token = generation;
  let phase = 'session';
  status.textContent = 'Starting AR session…';
  try {
    const active = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: panel }
    });
    if (token !== generation) { await active.end(); return; }
    session = active;
    let ended = false;
    active.addEventListener('end', () => {
      ended = true; session = null; release();
      start.disabled = false;
      status.textContent = 'AR session ended. Start again or use View in 3D.';
    }, { once: true });
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local');
    document.body.append(renderer.domElement);
    scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(2,4,3); scene.add(light);
    await renderer.xr.setSession(active);
    if (ended) return;
    const viewerSpace = await active.requestReferenceSpace('viewer');
    if (ended) return;
    hitSource = await active.requestHitTestSource({ space: viewerSpace });
    if (ended) { hitSource?.cancel(); hitSource = null; return; }
    const reticle = new THREE.Mesh(new THREE.RingGeometry(0.12,0.15,32).rotateX(-Math.PI/2), new THREE.MeshBasicMaterial({color:0xb9c58a}));
    reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);
    const placed = new THREE.Group(); placed.visible = false; scene.add(placed);
    let ready = false;
    active.addEventListener('select', () => {
      if (!ready || !reticle.visible) return;
      placed.position.setFromMatrixPosition(reticle.matrix);
      placed.quaternion.setFromRotationMatrix(reticle.matrix);
      placed.visible = true;
      status.textContent = 'Sofa placed. Aim at another surface and tap to reposition. Scale and fit are not verified.';
    });
    renderer.setAnimationLoop((time, frame) => {
      if (!frame) return;
      const hits = frame.getHitTestResults(hitSource);
      const pose = hits[0]?.getPose(renderer.xr.getReferenceSpace());
      reticle.visible = ready && !!pose;
      if (pose) reticle.matrix.fromArray(pose.transform.matrix);
      renderer.render(scene, camera);
    });
    phase = 'model'; status.textContent = 'Loading sofa model…';
    const gltf = await new GLTFLoader().loadAsync(selected.gltfURL || 'assets/sample-sofa.glb');
    if (ended) {
      // Dispose a model that completed loading after the user left AR.
      disposeModel(gltf.scene); return;
    }
    const box = new THREE.Box3().setFromObject(gltf.scene, true);
    const centre = box.getCenter(new THREE.Vector3());
    gltf.scene.position.sub(new THREE.Vector3(centre.x, box.min.y, centre.z));
    placed.add(gltf.scene); ready = true;
    status.textContent = 'Model ready. Move slowly until the ring appears, then tap to place. Use the browser’s exit AR control if overlay controls are unavailable.';
  } catch (error) {
    if (session) { try { await session.end(); } catch {} }
    release();
    if (token !== generation) return;
    start.disabled = false;
    status.textContent = phase === 'model' ? 'The sofa model could not load. Check its URL or try View in 3D.'
      : 'AR could not start or Hit Test is unavailable. Permission may have been declined. Try again or use View in 3D.';
  }
};
