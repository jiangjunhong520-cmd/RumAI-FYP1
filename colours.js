// Plain JavaScript, with no library or network requests.
const RoomColours = (() => {
  function rgbToHsv([red, green, blue]) {
    const [r, g, b] = [red, green, blue].map(value => value / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const difference = max - min;
    let hue = 0; // Hue is undefined for grey; display it as 0 degrees.
    if (difference !== 0) {
      if (max === r) hue = ((g - b) / difference) % 6;
      else if (max === g) hue = (b - r) / difference + 2;
      else hue = (r - g) / difference + 4;
      hue = (hue * 60 + 360) % 360;
    }
    return [hue, max === 0 ? 0 : difference / max * 100, max * 100];
  }

  const distance = (a, b) => a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0);
  function cluster(pixels) {
    if (!pixels.length) return [];
    // Deterministic, spread-out starting centres make repeated uploads consistent.
    const centres = [pixels[0].slice()];
    while (centres.length < 3) {
      let farthest = pixels[0], bestDistance = -1;
      for (const pixel of pixels) {
        const nearest = Math.min(...centres.map(centre => distance(pixel, centre)));
        if (nearest > bestDistance) { bestDistance = nearest; farthest = pixel; }
      }
      centres.push(farthest.slice());
    }
    const assignments = new Int8Array(pixels.length).fill(-1);
    let counts;
    for (let iteration = 0; iteration < 30; iteration++) {
      counts = [0, 0, 0];
      const sums = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      let changed = false;
      pixels.forEach((pixel, index) => {
        let closest = 0;
        for (let k = 1; k < 3; k++) {
          if (distance(pixel, centres[k]) < distance(pixel, centres[closest])) closest = k;
        }
        if (assignments[index] !== closest) changed = true;
        assignments[index] = closest;
        counts[closest]++;
        pixel.forEach((value, channel) => { sums[closest][channel] += value; });
      });
      centres.forEach((centre, k) => {
        // Empty clusters retain their centre; do not invent a colour or weight.
        if (counts[k]) centres[k] = sums[k].map(value => value / counts[k]);
      });
      if (!changed) break;
    }
    return centres.map((centre, k) => {
      const rgb = centre.map(Math.round);
      return { rgb, hsv: rgbToHsv(rgb), weight: counts[k] / pixels.length * 100 };
    }).sort((a, b) => b.weight - a.weight);
  }

  function extract(image) {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 120 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixels = [];
    for (let i = 0; i < data.length; i += 4) {
      // Ignore transparent pixels so invisible RGB does not distort the palette.
      if (data[i + 3] >= 128) pixels.push([data[i], data[i + 1], data[i + 2]]);
    }
    return cluster(pixels);
  }
  return { extract, cluster, rgbToHsv };
})();
