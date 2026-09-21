// Apple AR Quick Look is separate from Android WebXR; it does not use Hit Test JS.
export function isAppleMobile(nav = navigator) {
  return /iPhone|iPad|iPod/i.test(nav.userAgent) ||
    (/Macintosh|MacIntel/i.test(nav.userAgent + ' ' + nav.platform) && nav.maxTouchPoints > 1);
}
export async function openQuickLook(item) {
  const dialog = document.querySelector('#quick-look-dialog');
  const link = document.querySelector('#quick-look-start');
  const status = document.querySelector('#quick-look-status');
  const token = String(Number(dialog.dataset.request || 0) + 1);
  dialog.dataset.request = token;
  document.querySelector('#quick-look-title').textContent = `${item.name} in AR`;
  link.hidden = true;
  link.removeAttribute('href');
  if (!dialog.open) dialog.showModal();
  document.querySelector('#quick-look-close').onclick = () => dialog.close();
  document.querySelector('#quick-look-fallback').onclick = async () => {
    dialog.close();
    try { const viewer = await import('./viewer.js'); await viewer.openViewer(item); }
    catch { dialog.showModal(); status.textContent = 'The 3D viewer could not load. Check your connection and open the HTTPS test URL in Safari.'; }
  };
  status.textContent = item.usdzURL ? 'Checking this sofa’s AR asset…' : 'Checking the shared sofa AR asset…';
  try {
    if (!link.relList.supports?.('ar')) {
      status.textContent = 'This browser does not report AR Quick Look support. Try Safari or View in 3D.';
      return;
    }
    const url = item.usdzURL || 'assets/sample-sofa.usdz';
    const response = await fetch(url, {method:'HEAD', cache:'no-store'});
    if (dialog.dataset.request !== token) return;
    if (!response.ok) throw new Error('USDZ missing');
    if (!response.headers.get('content-type')?.includes('model/vnd.usdz+zip')) throw new Error('USDZ content type incorrect');
    link.href = url;
    link.hidden = false;
    status.textContent = (item.usdzURL ? 'Product-specific asset available; physical scale remains unverified. ' : 'Shared prototype asset available. ') + 'Tap Start AR to open Apple Quick Look. If it cannot open, return here and use View in 3D. Availability is not proof of valid USDZ content or physical scale.';
  } catch {
    if (dialog.dataset.request === token) status.textContent = 'The sofa USDZ asset is missing or unavailable. iPhone AR is not ready yet. Use View in 3D instead.';
  }
}
