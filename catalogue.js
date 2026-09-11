// Load the single JSON catalogue. File selection also supports double-clicked HTML.
let catalogue = [];
async function loadCatalogue(file) {
  const note = document.querySelector('#catalogue-status');
  try {
    let data;
    if (file) data = JSON.parse(await file.text());
    else {
      const response = await fetch('catalogue.json');
      if (!response.ok) throw new Error('Catalogue unavailable');
      data = await response.json();
    }
    const styles = ['Industrial', 'Minimalist', 'Modern', 'Scandinavian'];
    if (!Array.isArray(data) || data.some(item =>
      !styles.includes(item.style) || item.category !== 'Sofa' ||
      typeof item.name !== 'string' || typeof item.primaryColour !== 'string' ||
      typeof item.itemId !== 'string' ||
      ![item.primaryHSV, item.secondaryHSV].every(hsv => Array.isArray(hsv) && hsv.length === 3 &&
        hsv.every(Number.isFinite) && hsv[0] >= 0 && hsv[0] <= 360 &&
        hsv[1] >= 0 && hsv[1] <= 100 && hsv[2] >= 0 && hsv[2] <= 100) ||
      ![item.width, item.height, item.depth].every(n => Number.isFinite(n) && n > 0) ||
      !/^assets\/sofas\/(industrial|minimalist|modern|scandinavian)\/sofa-(ind|min|mod|sca)-\d+\.svg$/.test(item.image))) throw new Error('Invalid catalogue');
    catalogue = data;
    note.textContent = `${data.length} sample sofas available. Dimensions in centimetres; images are prototype illustrations.`;
    showCollection();
  } catch (error) {
    note.textContent = 'Choose the supplied catalogue.json below to load the sample sofas, or open this page through a local static server.';
    document.querySelector('#catalogue-file-label').hidden = false;
  }
}
document.querySelector('#catalogue-file').addEventListener('change', event => {
  if (event.target.files[0]) loadCatalogue(event.target.files[0]);
});
loadCatalogue();
