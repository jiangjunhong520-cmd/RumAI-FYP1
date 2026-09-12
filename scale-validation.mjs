import * as THREE from './vendor/three/build/three.module.js';

// A fresh wrapper ensures world X/Y/Z scaling, even if the glTF root is rotated.
// Call once per freshly loaded model. X=width, Y=height, Z=depth for this sample.
export function correctScale(source, item) {
  const target = [item.width, item.height, item.depth].map(cm => cm / 100);
  if (!target.every(value => Number.isFinite(value) && value > 0)) throw new Error('Invalid catalogue dimensions');
  const model = new THREE.Group();
  model.add(source);
  model.updateMatrixWorld(true);
  const original = new THREE.Box3().setFromObject(model, true).getSize(new THREE.Vector3()).toArray();
  if (!original.every(value => Number.isFinite(value) && value > 0)) throw new Error('Invalid model bounds');
  const factors = target.map((value, i) => value / original[i]);
  model.scale.fromArray(factors);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const corrected = box.getSize(new THREE.Vector3()).toArray();
  const errors = corrected.map((value, i) => Math.abs(value - target[i]) / target[i] * 100);
  return {model, box, report: {
    itemId: item.itemId, name: item.name, asset: item.gltfURL || 'assets/sample-sofa.glb',
    axes: ['width/X', 'height/Y', 'depth/Z'], units: 'metres (catalogue cm divided by 100)',
    originalDimensions: original, targetDimensions: target, scaleFactors: factors,
    correctedDimensions: corrected, relativeErrorPercent: errors,
    limitation: 'Non-uniform bounding-box match to prototype catalogue dimensions. Shape proportions change; not physical accuracy or fit verification. WebXR scale is unchanged.'
  }};
}
