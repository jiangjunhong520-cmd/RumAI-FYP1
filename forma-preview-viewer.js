import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js';
import { correctScale } from './scale-validation.mjs';

const dialog = document.querySelector('#sofa-viewer');
const area = document.querySelector('#viewer-canvas');
const status = document.querySelector('#viewer-status');
let cleanup = () => {};
let request = 0;
document.querySelector('#viewer-close').onclick = () => dialog.close();
dialog.addEventListener('close', () => { request++; cleanup(); });

// Release GPU resources when closing or replacing a model.
function dispose(object) {
  object.traverse(node => {
    node.geometry?.dispose();
    const materials = node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : [];
    materials.forEach(material => {
      Object.values(material).forEach(value => { if (value?.isTexture) value.dispose(); });
      material.dispose();
    });
  });
}

export async function openViewer(item) {
  cleanup();
  const token = ++request;
  if (!dialog.open) dialog.showModal();
  document.querySelector('#viewer-title').textContent = item.name;
  const fallback = !item.gltfURL;
  document.querySelector('#viewer-source').textContent = fallback
    ? 'Shared sample sofa — not the selected product. Sheen Wood Leather Sofa: Eric Chadwick / Darmstadt Graphics Group (CC BY 4.0), based on Fran Calvente’s CC0 asset. Shape, materials and dimensions are illustrative.'
    : 'Model from this item’s catalogue gltfURL.';
  document.querySelector('#viewer-dimensions').textContent = `Catalogue W × H × D: ${item.width} × ${item.height} × ${item.depth} cm. Measuring model…`;
  status.textContent = 'Loading 3D model…';
  const reset = document.querySelector('#viewer-reset');
  reset.disabled = true;
  let renderer;
  let unattachedModel;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0xf1f0e9);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    area.replaceChildren(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Interactive sofa: drag to rotate, scroll or pinch to zoom');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x777368, 3));
    const light = new THREE.DirectionalLight(0xffffff, 4);
    light.position.set(3, 5, 4);
    scene.add(light);
    const observer = new ResizeObserver(() => {
      const width = area.clientWidth, height = area.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    observer.observe(area);
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    cleanup = () => {
      observer.disconnect(); controls.dispose(); dispose(scene);
      renderer.setAnimationLoop(null); renderer.dispose(); area.replaceChildren();
      reset.onclick = null;
    };
    const gltf = await new GLTFLoader().loadAsync(item.gltfURL || 'assets/sample-sofa.glb', event => {
      if (token === request) status.textContent = event.total
        ? `Loading 3D model… ${Math.round(event.loaded / event.total * 100)}%` : 'Loading 3D model…';
    });
    if (token !== request) { dispose(gltf.scene); return; }
    unattachedModel = gltf.scene;
    const { model, box, report } = correctScale(gltf.scene, item);
    const size = box.getSize(new THREE.Vector3());
    if (!Number.isFinite(size.length()) || size.length() === 0) throw new Error('Empty model geometry');
    const centre = box.getCenter(new THREE.Vector3());
    model.position.sub(new THREE.Vector3(centre.x, box.min.y, centre.z));
    scene.add(model);
    unattachedModel = null; // Scene cleanup now owns these resources.
    const span = Math.max(size.x, size.y, size.z);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 4, span * 4), new THREE.MeshStandardMaterial({ color: 0xe3e1d8, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    scene.add(ground);
    const target = new THREE.Vector3(0, size.y / 2, 0);
    function resetView() {
      const aspect = area.clientWidth / area.clientHeight;
      const distance = span / Math.tan(THREE.MathUtils.degToRad(22.5)) / Math.min(1, aspect);
      camera.position.copy(target).add(new THREE.Vector3(0.8, 0.45, 1).normalize().multiplyScalar(distance));
      camera.near = span / 1000; camera.far = distance * 30;
      camera.updateProjectionMatrix();
      controls.target.copy(target); controls.minDistance = span * 0.05; controls.maxDistance = distance * 4;
      controls.update();
    }
    reset.onclick = resetView;
    reset.disabled = false;
    resetView();
    const format = values => values.map(value => value.toFixed(6)).join(' × ');
    document.querySelector('#viewer-dimensions').textContent = `W/X × H/Y × D/Z. Original (m): ${format(report.originalDimensions)}. Target (m): ${format(report.targetDimensions)}. Scale: ${format(report.scaleFactors)}. Corrected (m): ${format(report.correctedDimensions)}. Error (%): ${format(report.relativeErrorPercent)}. ${report.limitation}`;
    status.textContent = 'Model ready. Drag to rotate; scroll or pinch to zoom.';
  } catch (error) {
    if (token !== request) return;
    if (unattachedModel) dispose(unattachedModel);
    cleanup();
    renderer?.dispose();
    status.textContent = 'Could not load the 3D model. Check the model URL and use http://localhost rather than opening the HTML file directly. WebGL must be available.';
    document.querySelector('#viewer-dimensions').textContent = `Catalogue: ${item.width} × ${item.height} × ${item.depth} cm. Model dimensions unavailable.`;
    reset.disabled = true;
  }
}

