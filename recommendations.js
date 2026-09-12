// Deterministic baseline: HSV units are degrees, percent, percent.
const Recommendations = (() => {
  function similarity(a, b) {
    const hueGap = Math.abs(((a[0] % 360) + 360) % 360 - ((b[0] % 360) + 360) % 360);
    const hueDistance = Math.min(hueGap, 360 - hueGap) / 180;
    const saturationDistance = Math.abs(a[1] - b[1]) / 100;
    const valueDistance = Math.abs(a[2] - b[2]) / 100;
    return Math.max(0, Math.min(1, 1 - (hueDistance + saturationDistance + valueDistance) / 3));
  }
  function rank(items, confirmedStyle, palette) {
    if (!confirmedStyle || !palette.length) return [];
    const weighted = palette.every(c => Number.isFinite(c.weight) && c.weight >= 0)
      && palette.some(c => c.weight > 0);
    const total = weighted ? palette.reduce((sum, c) => sum + c.weight, 0) : palette.length;
    return items.map(item => {
      const styleMatch = item.style === confirmedStyle ? 1 : 0;
      // Both sofa colours contribute equally; room colours use their pixel shares.
      const colourMatch = palette.reduce((sum, colour) => sum +
        (weighted ? colour.weight : 1) / total *
        (similarity(colour.hsv, item.primaryHSV) + similarity(colour.hsv, item.secondaryHSV)) / 2, 0);
      return { item, styleMatch, colourMatch, finalScore: 0.5 * styleMatch + 0.5 * colourMatch };
    }).sort((a, b) => b.finalScore - a.finalScore ||
      (a.item.itemId < b.item.itemId ? -1 : a.item.itemId > b.item.itemId ? 1 : 0));
  }
  return { similarity, rank };
})();
