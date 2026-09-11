const state = { image: null, pixels: null, sourceCanvas: null, encodedCanvas: null, file: null, comparison: [], originalPixels: null, encodedPixels: null, metadata: null };
const $ = (id) => document.getElementById(id);

const imageInput = $('image-input');
const dropZone = $('drop-zone');
const status = $('server-status');
const fileReadout = $('file-readout');
const matrixBody = $('pixel-matrix').querySelector('tbody');
const channelSelect = $('channel-select');
const affectedMatrixBody = $('affected-matrix').querySelector('tbody');
const matrixSizeSelect = $('matrix-size');

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function luma(r, g, b) { return Math.round(.2126 * r + .7152 * g + .0722 * b); }
function escapeHtml(text) { return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }

async function checkTools() {
  try {
    const response = await fetch('/api/tools');
    const tools = await response.json();
    status.textContent = 'LOCAL WORKBENCH / READY';
    document.querySelector('.pulse').style.background = '#67ae6d';
    $('tool-status').innerHTML = `<span class="${tools.pillow.available ? 'available' : 'missing'}">Pillow: ${tools.pillow.available ? 'ready' : 'not found'}</span> &nbsp; <span class="${tools.stegano.available ? 'available' : 'missing'}">stegano: ${tools.stegano.available ? 'ready' : 'not found'}</span>`;
  } catch (error) {
    status.textContent = 'OPEN FILE / SERVER OFFLINE';
    $('tool-status').innerHTML = '<span class="missing">Python libraries unavailable. Install requirements.txt and restart server.py.</span>';
  }
}

function updateStats(file, image, data) {
  $('stat-pixels').textContent = (image.width * image.height).toLocaleString();
  $('stat-dimensions').textContent = `${image.width} × ${image.height}`;
  $('stat-format').textContent = file.type.split('/')[1].toUpperCase();
  $('stat-size').textContent = formatBytes(file.size);
  const channels = [
    ['red', data.reduce((sum, _, i) => i % 4 === 0 ? sum + data[i] : sum, 0) / (image.width * image.height)],
    ['green', data.reduce((sum, _, i) => i % 4 === 1 ? sum + data[i] : sum, 0) / (image.width * image.height)],
    ['blue', data.reduce((sum, _, i) => i % 4 === 2 ? sum + data[i] : sum, 0) / (image.width * image.height)],
  ];
  $('channel-list').innerHTML = channels.map(([name, average]) => `<span class="channel ${name}"><i></i>${name.toUpperCase()} AVG ${average.toFixed(1)}</span>`).join('');
  $('capacity-readout').textContent = `Capacity: ${Math.floor((image.width * image.height * 3 - 32) / 8)} bytes`;
}

function drawMatrix() {
  if (!state.pixels || !state.image) return;
  const size = Number(matrixSizeSelect.value);
  const channel = channelSelect.value;
  const offset = { red: 0, green: 1, blue: 2 }[channel];
  let html = '<tr><td></td>' + Array.from({ length: size }, (_, i) => `<td>${i}</td>`).join('') + '</tr>';
  for (let y = 0; y < Math.min(size, state.image.height); y += 1) {
    html += `<tr><td>${y}</td>`;
    for (let x = 0; x < Math.min(size, state.image.width); x += 1) {
      const index = (y * state.image.width + x) * 4;
      const value = channel === 'luma' ? luma(state.pixels[index], state.pixels[index + 1], state.pixels[index + 2]) : state.pixels[index + offset];
      html += `<td>${value}</td>`;
    }
    html += '</tr>';
  }
  matrixBody.innerHTML = html;
  $('matrix-meta').textContent = `Showing ${Math.min(size, state.image.width)} × ${Math.min(size, state.image.height)} sample from the top-left · ${channel.toUpperCase()} channel`;
}

async function loadImage(file) {
  if (!file || !file.type.startsWith('image/')) return;
  state.file = file;
  const image = new Image();
  image.onload = async () => {
    state.image = image;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    state.sourceCanvas = canvas;
    state.pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    fileReadout.textContent = `${file.name} · ${image.width} × ${image.height} · ${formatBytes(file.size)}`;
    updateStats(file, image, state.pixels);
    drawMatrix();
    $('refresh-metadata').disabled = false;
    $('encode-button').disabled = false;
    await fetchMetadata(file);
  };
  image.src = URL.createObjectURL(file);
}

async function fetchMetadata(file = state.file) {
  if (!file) return;
  $('metadata-output').textContent = 'Running Pillow EXIF extraction...';
  const response = await fetch('/api/metadata', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
  const result = await response.json();
  if (result.metadata) {
    state.metadata = result.metadata;
    renderMetadata();
  } else {
    state.metadata = null;
    $('metadata-table').querySelector('tbody').innerHTML = `<tr><td colspan="2">${escapeHtml(result.error || 'Pillow did not return metadata')}</td></tr>`;
    $('metadata-output').textContent = `${result.error || 'Pillow did not return metadata'}\n\nBrowser stats remain available above.`;
  }
}

function renderMetadata() {
  if (!state.metadata) return;
  $('metadata-output').textContent = JSON.stringify(state.metadata, null, 2);
  const rows = [];
  const addRows = (value, path) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) Object.entries(value).forEach(([key, child]) => addRows(child, path ? `${path} / ${key}` : key));
    else rows.push(`<tr><th>${escapeHtml(path)}</th><td>${escapeHtml(String(value ?? ''))}</td></tr>`);
  };
  addRows(state.metadata, '');
  $('metadata-table').querySelector('tbody').innerHTML = rows.join('');
  updateMetadataView();
}

function updateMetadataView() {
  const showJson = $('metadata-view').value === 'json';
  $('metadata-output').classList.toggle('is-hidden', !showJson);
  $('metadata-table-wrap').classList.toggle('is-hidden', showJson);
}

async function encodeMessage() {
  if (!state.sourceCanvas) return;
  const dataType = $('data-type').value;
  const message = $('secret-message').value;
  const source = state.sourceCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, state.sourceCanvas.width, state.sourceCanvas.height);
  state.originalPixels = source;
  $('capacity-readout').textContent = 'Encoding with stegano...';
  const imageData = await new Promise((resolve) => state.sourceCanvas.toBlob(async (blob) => resolve(await blob.arrayBuffer()), 'image/png'));
  let payload;
  if (dataType === 'file') {
    const file = $('payload-file').files[0];
    if (!file) { $('capacity-readout').textContent = 'Choose a payload file first'; return; }
    payload = { kind: 'file', name: file.name, mime: file.type || 'application/octet-stream', data: arrayBufferToBase64(await file.arrayBuffer()) };
  } else payload = { kind: 'text', text: message };
  const encodedRequest = { action: 'encode', image: arrayBufferToBase64(imageData), payload };
  const response = await fetch('/api/stegano', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(encodedRequest) });
  const result = await response.json();
  if (!result.image) { $('capacity-readout').textContent = result.error || 'stegano encoding failed'; return; }
  const encoded = new Image();
  encoded.onload = () => {
    const canvas = document.createElement('canvas'); canvas.width = encoded.width; canvas.height = encoded.height;
    canvas.getContext('2d').drawImage(encoded, 0, 0); state.encodedCanvas = canvas;
    const output = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
    state.encodedPixels = output;
    renderDiff(source, output); $('download-button').disabled = false; $('zoom-button').disabled = false;
    $('changed-count').textContent = `${countChanged(source.data, output.data)} pixels changed`;
  };
  encoded.src = `data:${result.mime};base64,${result.image}`;
  $('download-button').disabled = false;
  $('decode-button').disabled = false;
  $('capacity-readout').textContent = `${dataType === 'file' ? $('payload-file').files[0].name : `${new TextEncoder().encode(message).length} text bytes`} sent to stegano`;
}

function countChanged(before, after) {
  let count = 0;
  for (let i = 0; i < before.length; i += 4) if (before[i] !== after[i] || before[i + 1] !== after[i + 1] || before[i + 2] !== after[i + 2]) count += 1;
  return count;
}

function renderDiff(before, after) {
  const diff = document.createElement('canvas');
  diff.width = before.width; diff.height = before.height;
  const data = new ImageData(new Uint8ClampedArray(before.data), before.width, before.height);
  for (let i = 0; i < before.data.length; i += 4) {
    const changed = before.data[i] !== after.data[i] || before.data[i + 1] !== after.data[i + 1] || before.data[i + 2] !== after.data[i + 2];
    if (changed) { data.data[i] = 255; data.data[i + 1] = 83; data.data[i + 2] = 112; data.data[i + 3] = 255; }
    else { const gray = luma(before.data[i], before.data[i + 1], before.data[i + 2]); data.data[i] = gray; data.data[i + 1] = gray; data.data[i + 2] = gray; data.data[i + 3] = 255; }
  }
  diff.getContext('2d').putImageData(data, 0, 0);
  const stage = $('canvas-stage'); stage.innerHTML = ''; stage.appendChild(diff);
  renderAffectedMatrix(before, after);
}

function renderAffectedMatrix(before, after) {
  const size = Number(matrixSizeSelect.value);
  let html = '<tr><td></td>' + Array.from({ length: size }, (_, index) => `<td>${index}</td>`).join('') + '</tr>';
  for (let y = 0; y < Math.min(size, before.height); y += 1) {
    html += `<tr><td>${y}</td>`;
    for (let x = 0; x < Math.min(size, before.width); x += 1) {
      const index = (y * before.width + x) * 4;
      const changed = before.data[index] !== after.data[index] || before.data[index + 1] !== after.data[index + 1] || before.data[index + 2] !== after.data[index + 2];
      const value = `${before.data[index]},${before.data[index + 1]},${before.data[index + 2]}`;
      html += `<td class="${changed ? 'affected-cell' : ''}" title="${changed ? 'Changed after encoding' : 'Unchanged'}">${value}</td>`;
    }
    html += '</tr>';
  }
  affectedMatrixBody.innerHTML = html;
  $('affected-matrix-meta').textContent = `Showing ${Math.min(size, before.width)} × ${Math.min(size, before.height)} RGB sample · yellow cells changed after encoding`;
}

function arrayBufferToBase64(buffer) {
  let binary = ''; const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.byteLength; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function loadComparisonImage(file, slot) {
  if (!file || !file.type.startsWith('image/')) return;
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    state.comparison[slot] = { file, image, canvas };
    updateDecodeTargets();
    renderComparison();
  };
  image.src = URL.createObjectURL(file);
}

function renderComparison() {
  const images = [{ file: state.file, image: state.image, canvas: state.sourceCanvas }, ...state.comparison].filter(Boolean);
  if (images.length < 2) return;
  $('compare-status').textContent = `${images.length} images loaded · image 1 is the baseline`;
  $('clear-comparison').disabled = false;
  $('compare-label-2').classList.toggle('is-disabled', Boolean(state.comparison[0]));
  const previews = $('compare-canvases'); previews.innerHTML = '';
  images.forEach((entry, index) => {
    const figure = document.createElement('figure'); const preview = document.createElement('canvas');
    preview.width = entry.canvas.width; preview.height = entry.canvas.height; preview.getContext('2d').drawImage(entry.canvas, 0, 0);
    figure.appendChild(preview); figure.insertAdjacentHTML('beforeend', `<figcaption>IMAGE ${index + 1}<br>${escapeHtml(entry.file?.name || 'baseline')}</figcaption>`); previews.appendChild(figure);
  });
  renderComparisonDiff(images);
}

function renderComparisonDiff(images) {
  const base = images[0].canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, images[0].canvas.width, images[0].canvas.height);
  const candidate2 = images[1].canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, images[1].canvas.width, images[1].canvas.height);
  const changed2 = renderPairDiff(base, candidate2, $('compare-diff-2'));
  $('pair-count-2').textContent = `${changed2.toLocaleString()} pixels affected`;
  renderComparisonMatrices(base, candidate2, images[2] ? images[2].canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, images[2].canvas.width, images[2].canvas.height) : null);
  let statusText = `${images.length} images loaded · Image 1 ↔ Image 2: ${changed2.toLocaleString()} different pixels`;
  $('compare-diff-3-card').classList.toggle('is-hidden', !images[2]);
  if (images[2]) {
    const candidate3 = images[2].canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, images[2].canvas.width, images[2].canvas.height);
    const changed3 = renderPairDiff(base, candidate3, $('compare-diff-3'));
    $('pair-count-3').textContent = `${changed3.toLocaleString()} pixels affected`;
    statusText += ` · Image 1 ↔ Image 3: ${changed3.toLocaleString()} different pixels`;
  }
  $('compare-status').textContent = statusText;
}

function renderPairDiff(base, candidate, canvas) {
  const width = Math.max(base.width, candidate.width); const height = Math.max(base.height, candidate.height);
  canvas.width = width; canvas.height = height;
  const output = new ImageData(width, height); let changed = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const baseIndex = (y * base.width + x) * 4; const candidateIndex = (y * candidate.width + x) * 4;
    const differs = x >= base.width || y >= base.height || x >= candidate.width || y >= candidate.height || base.data[baseIndex] !== candidate.data[candidateIndex] || base.data[baseIndex + 1] !== candidate.data[candidateIndex + 1] || base.data[baseIndex + 2] !== candidate.data[candidateIndex + 2];
    const pixel = (y * width + x) * 4;
    if (differs) { output.data[pixel] = 255; output.data[pixel + 1] = 83; output.data[pixel + 2] = 112; changed += 1; }
    else { const gray = luma(base.data[baseIndex], base.data[baseIndex + 1], base.data[baseIndex + 2]); output.data[pixel] = gray; output.data[pixel + 1] = gray; output.data[pixel + 2] = gray; }
    output.data[pixel + 3] = 255;
  }
  canvas.getContext('2d').putImageData(output, 0, 0);
  return changed;
}

function zoomComparisonPair(pair) {
  const source = $(`compare-diff-${pair}`); if (!source.width || !source.height) return;
  const modal = document.createElement('div'); modal.className = 'zoom-modal'; modal.innerHTML = `<button class="zoom-close" aria-label="Close zoom">CLOSE ×</button><div class="zoom-copy">&#128300; IMAGE 1 ↔ IMAGE ${pair} · ${$(`pair-count-${pair}`).textContent}</div><div class="zoom-frame"></div>`;
  const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height; canvas.getContext('2d').drawImage(source, 0, 0); modal.querySelector('.zoom-frame').appendChild(canvas); document.body.appendChild(modal); modal.querySelector('.zoom-close').addEventListener('click', () => modal.remove());
}

function renderComparisonMatrices(base, candidate2, candidate3) {
  renderComparisonMatrix($('compare-matrix-2'), base, candidate2, true);
  renderComparisonMatrix($('compare-matrix-3'), base, candidate3, true);
}

function renderComparisonMatrix(table, base, candidate, highlightDifferences) {
  if (!candidate) { table.querySelector('tbody').innerHTML = ''; return; }
  const size = Number(matrixSizeSelect.value);
  let html = '<tr><td></td>' + Array.from({ length: size }, (_, index) => `<td>${index}</td>`).join('') + '</tr>';
  for (let y = 0; y < Math.min(size, base.height); y += 1) {
    html += `<tr><td>${y}</td>`;
    for (let x = 0; x < Math.min(size, base.width); x += 1) {
      const baseIndex = (y * base.width + x) * 4;
      const candidateIndex = (y * candidate.width + x) * 4;
      const outsideCandidate = x >= candidate.width || y >= candidate.height;
      const differs = outsideCandidate || base.data[baseIndex] !== candidate.data[candidateIndex] || base.data[baseIndex + 1] !== candidate.data[candidateIndex + 1] || base.data[baseIndex + 2] !== candidate.data[candidateIndex + 2];
      const value = outsideCandidate ? '--' : `${candidate.data[candidateIndex]},${candidate.data[candidateIndex + 1]},${candidate.data[candidateIndex + 2]}`;
      html += `<td class="${highlightDifferences && differs ? 'affected-cell' : ''}" title="${highlightDifferences && differs ? 'Different from Image 1' : 'Matches Image 1'}">${value}</td>`;
    }
    html += '</tr>';
  }
  table.querySelector('tbody').innerHTML = html;
}

function clearComparison() {
  state.comparison = []; $('compare-canvases').innerHTML = '<div class="compare-empty">Image 1 appears here after upload · comparison previews will appear beside it</div>';
  [$('compare-diff-2'), $('compare-diff-3')].forEach((canvas) => canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height));
  [$('compare-matrix-2'), $('compare-matrix-3')].forEach((table) => { table.querySelector('tbody').innerHTML = ''; });
  $('compare-diff-3-card').classList.add('is-hidden'); $('compare-status').textContent = 'Add a second image to begin'; $('clear-comparison').disabled = true; $('compare-label-2').classList.add('is-disabled');
  updateDecodeTargets();
}

async function decodeData() {
  const target = $('decode-target').value;
  let file;
  if (target === 'encoded') {
    if (!state.encodedCanvas) return;
    file = await new Promise((resolve) => state.encodedCanvas.toBlob(resolve, 'image/png'));
  } else if (target === '1') file = state.file;
  else file = state.comparison[Number(target) - 2]?.file;
  await decodeFile(file, $('decoded-output'), $('decoded-download'));
}

async function decodeFile(file, output, download) {
  if (!file) { output.textContent = 'Choose an image file first.'; return; }
  output.textContent = 'Decoding with stegano...'; download.classList.add('is-hidden');
  try {
    const response = await fetch('/api/stegano', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'decode', image: arrayBufferToBase64(await file.arrayBuffer()) }) });
    const result = await response.json();
    if (!response.ok || !result.ok) { output.textContent = result.error || `Decode request failed (${response.status})`; return; }
    if (result.kind === 'file') {
      const link = download; link.href = `data:${result.mime};base64,${result.data}`; link.download = result.name; link.textContent = `DOWNLOAD ${result.name}`; link.classList.remove('is-hidden'); output.textContent = `Decoded file: ${result.name} (${result.mime})`;
    } else output.textContent = result.text || '(empty text payload)';
  } catch (error) {
    output.textContent = `Decode failed: ${error.message}. Is server.py running?`;
  }
}

function updateDataType() {
  const isFile = $('data-type').value === 'file';
  $('text-input-wrap').classList.toggle('is-hidden', isFile); $('file-input-wrap').classList.toggle('is-hidden', !isFile);
}

function updateDecodeTargets() {
  $('decode-target').querySelector('option[value="2"]').disabled = !state.comparison[0];
  $('decode-target').querySelector('option[value="3"]').disabled = !state.comparison[1];
}

function switchComparePairView(button) {
  const pair = button.dataset.pair; const showImage = button.dataset.view === 'image';
  document.querySelectorAll(`.compare-view-tab[data-pair="${pair}"]`).forEach((tab) => tab.classList.toggle('is-active', tab === button));
  $(`compare-image-${pair}`).classList.toggle('is-hidden', !showImage); $(`compare-pixels-${pair}`).classList.toggle('is-hidden', showImage);
}

function zoomDiff() {
  if (!state.encodedCanvas) return;
  const modal = document.createElement('div'); modal.className = 'zoom-modal'; modal.innerHTML = '<button class="zoom-close" aria-label="Close zoom">CLOSE ×</button><div class="zoom-copy">RED PIXELS = CHANNEL VALUES ALTERED BY STEGANO</div><div class="zoom-frame"></div>';
  const zoomCanvas = document.createElement('canvas'); zoomCanvas.width = state.encodedCanvas.width; zoomCanvas.height = state.encodedCanvas.height; zoomCanvas.getContext('2d').drawImage($('canvas-stage').querySelector('canvas'), 0, 0); modal.querySelector('.zoom-frame').appendChild(zoomCanvas); document.body.appendChild(modal); modal.querySelector('.zoom-close').addEventListener('click', () => modal.remove());
}

function downloadEncoded() { state.encodedCanvas.toBlob((blob) => { const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'imgexplorer-lsb-encoded.png'; link.click(); URL.revokeObjectURL(link.href); }, 'image/png'); }

imageInput.addEventListener('change', (event) => loadImage(event.target.files[0]));
['dragenter', 'dragover'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.add('is-dragging'); }));
['dragleave', 'drop'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.remove('is-dragging'); }));
dropZone.addEventListener('drop', (event) => loadImage(event.dataTransfer.files[0]));
channelSelect.addEventListener('change', drawMatrix);
matrixSizeSelect.addEventListener('change', () => { drawMatrix(); if (state.originalPixels && state.encodedPixels) renderAffectedMatrix(state.originalPixels, state.encodedPixels); if (state.comparison.length) renderComparison(); });
$('refresh-metadata').addEventListener('click', () => fetchMetadata());
$('encode-button').addEventListener('click', encodeMessage);
$('download-button').addEventListener('click', downloadEncoded);
$('zoom-button').addEventListener('click', zoomDiff);
$('data-type').addEventListener('change', updateDataType);
$('decode-button').addEventListener('click', decodeData);
$('decode-target').addEventListener('change', decodeData);
document.querySelectorAll('.compare-view-tab').forEach((button) => button.addEventListener('click', () => switchComparePairView(button)));
document.querySelectorAll('.pair-zoom').forEach((button) => button.addEventListener('click', () => zoomComparisonPair(button.dataset.pair)));
$('metadata-view').addEventListener('change', updateMetadataView);
$('view-image-tab').addEventListener('click', () => switchAffectedView('image'));
$('view-pixels-tab').addEventListener('click', () => switchAffectedView('pixels'));
$('compare-input-1').addEventListener('change', (event) => loadComparisonImage(event.target.files[0], 0));
$('compare-input-2').addEventListener('change', (event) => loadComparisonImage(event.target.files[0], 1));
$('clear-comparison').addEventListener('click', clearComparison);
checkTools();

function switchAffectedView(view) {
  const imageView = view === 'image';
  $('affected-image-view').classList.toggle('is-hidden', !imageView);
  $('affected-pixels-view').classList.toggle('is-hidden', imageView);
  $('view-image-tab').classList.toggle('is-active', imageView);
  $('view-pixels-tab').classList.toggle('is-active', !imageView);
  $('view-image-tab').setAttribute('aria-selected', imageView);
  $('view-pixels-tab').setAttribute('aria-selected', !imageView);
}
