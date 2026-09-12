// Real MobileNetV3Small inference. All scripts and weights are served locally.
const RoomAI = (() => {
  const classes = ['Industrial', 'Minimalist', 'Modern', 'Scandinavian'];
  let loading;
  let busy = false;
  const setup = {};
  function prepare() {
    if (!loading) loading = (async () => {
      if (!window.tf) throw new Error('TensorFlow.js could not load');
      let t = performance.now();
      await tf.ready();
      setup.backendInitMs = performance.now() - t;
      setup.backend = tf.getBackend();
      t = performance.now();
      const model = await tf.loadGraphModel('models/mobilenetv3small/model.json');
      setup.modelLoadMs = performance.now() - t;
      const input = tf.zeros([1,224,224,3]);
      let output;
      try {
        t = performance.now();
        output = model.predict(input);
        await output.data();
        setup.firstInferenceWarmupMs = performance.now() - t;
      } catch (error) { model.dispose(); throw error; }
      finally { input.dispose(); tf.dispose(output); }
      return model;
    })().catch(error => { loading = null; throw error; });
    return loading;
  }
  async function predict(image, onStatus) {
    // Never overlap GPU predictions from rapid uploads. A stalled job cannot spawn more.
    if (busy) throw new Error('Another prediction is still finishing. Please try this image again shortly.');
    busy = true;
    try {
    onStatus('Preparing MobileNetV3Small…');
    const waitStart = performance.now();
    const model = await prepare();
    const timings = {setupWaitMs:performance.now()-waitStart, ...setup};
    onStatus('Predicting room style…');
    // Match tf.image.resize: bilinear, half-pixel centres. No crop/normalisation here.
    // The exported model already rescales RGB [0,255] to [-1,1].
    const preprocessStart = performance.now();
    const input = tf.tidy(() => tf.image.resizeBilinear(tf.browser.fromPixels(image,3).toFloat(), [224,224], false, true).expandDims(0));
    let output;
    try {
      // Synchronise preprocessing so its time is not silently counted as inference.
      await input.data();
      timings.preprocessingMs = performance.now()-preprocessStart;
      const inferenceStart = performance.now();
      output = model.predict(input);
      const probabilities = Array.from(await output.data());
      if (probabilities.length !== 4 || !probabilities.every(Number.isFinite)) throw new Error('Invalid model output');
      timings.inferenceMs = performance.now()-inferenceStart;
      const index = probabilities.indexOf(Math.max(...probabilities));
      return {style:classes[index], confidence:probabilities[index], probabilities, timings};
    } finally { input.dispose(); tf.dispose(output); }
    } finally { busy = false; }
  }
  return { predict, classes, prepare };
})();

// Start once while the user chooses a photo. Failure is handled again on upload.
RoomAI.prepare().catch(error => console.warn('RumAI preload failed; upload can retry', error));
