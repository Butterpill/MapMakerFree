// main.js — fully patched: Voyager default, fixed import/mapping, table header, map style, popup loading

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const SLEEP_MS = 1100;
// --- Geocode with simple fallback ---
// --- Geocode with progressive cleanup & city/postal fallback ---
async function geocodeWithFallback(address) {
  if (!address || !address.trim()) return null;

  const clean = address
    .replace(/\s{2,}/g, ' ')   // collapse multiple spaces
    .replace(/,+/g, ',')       // collapse multiple commas
    .trim();

  const queries = [
    { q: clean, approximate: false },
    { q: clean.replace(/,?\s*\b(Turkey|Türkiye|United\s+Sta.*)$/i, ''), approximate: false },
    { q: clean.split(',').slice(0,-1).join(','), approximate: false },
    { q: clean.split(',').slice(0,2).join(','), approximate: false }
  ];

  // --- city/postal fallback ---
  const parts = clean.split(',').map(p => p.trim());
  const lastPart = parts[parts.length - 1];
  const firstPart = parts[0];

  if (/\d{4,}/.test(lastPart)) {
    // likely a postal code
    queries.push({ q: lastPart, approximate: true });
  }
  if (parts.length > 1) {
    // last chunk as city
    queries.push({ q: lastPart, approximate: true });
  }
  if (firstPart && firstPart.length > 3) {
    // first chunk as possible city
    queries.push({ q: firstPart, approximate: true });
  }

  for (const { q, approximate } of queries) {
    if (!q) continue;
    try {
      const resp = await fetch(`${NOMINATIM_BASE}?format=json&limit=1&q=${encodeURIComponent(q)}`);
      const json = await resp.json();
      if (json && json.length > 0) {
        return {
          lat: parseFloat(json[0].lat),
          lon: parseFloat(json[0].lon),
          approximate
        };
      }
    } catch (e) {
      console.error('Geocode error:', e);
    }
  }

  return null; // complete failure
}

// --- Controls ---
const addressInput = document.getElementById('addressInput');
const importBtn = document.getElementById('importBtn');
const mapBtn = document.getElementById('mapBtn');
const mapStyleSelect = document.getElementById('mapStyle');
const downloadJsonBtn = document.getElementById('downloadJson');
const exportPngBtn = document.getElementById('exportPng');
const addressTableBody = document.querySelector('#addressTable tbody');
const clearBtn = document.getElementById('clearBtn');

// --- Column toggle states for map ---
let showNumber = true;
let showName = true;
let showAddress = true;

// Buttons start hidden; they will appear when table has rows
const toggleNumberBtn = document.getElementById('toggleNumber');
const toggleNameBtn = document.getElementById('toggleName');
const toggleAddressBtn = document.getElementById('toggleAddress');


function updateMarkersText() {
  markerGroup.eachLayer(marker => {
    if(marker.getPopup){
      const popup = marker.getPopup();
      if(popup){
        const content = popup.getContent();
        // parse existing content or regenerate
        // simpler: regenerate using latest table data
      }
    }
  });
}

// --- Toggle handlers ---
if(toggleNumberBtn){
  toggleNumberBtn.addEventListener('click', ()=>{
    showNumber = !showNumber;
    toggleNumberBtn.textContent = (showNumber ? 'Hide Number' : 'Show Number');
    // update markers on map
    refreshMapMarkers();
  });
}
if(toggleNameBtn){
  toggleNameBtn.addEventListener('click', ()=>{
    showName = !showName;
    toggleNameBtn.textContent = (showName ? 'Hide Name' : 'Show Name');
    refreshMapMarkers();
  });
}
if(toggleAddressBtn){
  toggleAddressBtn.addEventListener('click', ()=>{
    showAddress = !showAddress;
    toggleAddressBtn.textContent = (showAddress ? 'Hide Address' : 'Show Address');
    refreshMapMarkers();
  });
}

addressTableBody.addEventListener('input', function(e) {
  const row = e.target.closest('tr');
  if (!row) return;
  const placeholder = e.target.getAttribute('placeholder');
  if(placeholder==='Number' || placeholder==='Name'){
    refreshMapMarkers();
  }
});

function refreshMapMarkers() {
  const rows = getTableData();
  const allMarkers = markerGroup.getLayers();

  allMarkers.forEach((marker, i) => {
    const row = rows[i];
    if (!row) return;

    // Determine text inside marker (short number)
    const insideMarker = (showNumber && row.label && row.label.length <= 3) ? row.label : '';

    // Text below marker
    const belowMarkerLines = [];
    if (showNumber && row.label && row.label.length > 3) belowMarkerLines.push(row.label);
    if (showName && row.name) belowMarkerLines.push(row.name);
    if (showAddress && row.address) belowMarkerLines.push(row.address);

    const belowHtml = belowMarkerLines.length > 0
      ? `<div class="marker-label">${belowMarkerLines.join('<br>')}</div>`
      : '';

    // Update popup content
    const popupText = `<strong>${escapeHtml(row.label)}</strong><br>${escapeHtml(row.name)}<br>${escapeHtml(row.address)}`;
    if (marker.getPopup) marker.setPopupContent(popupText);

    const hexColor = row.color === 'custom' ? row.customColor : COLOR_HEX[row.color] || row.color || '#2b7be4';

    if (row.shape === 'point') {
      // Point marker with inside label
      let labelText = insideMarker;
      if (labelText.length > 3) labelText = labelText.slice(0, 3);
      const lab = xmlEscape(labelText);

      const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="36" height="52" viewBox="0 0 36 52">
  <path d="M18 0C11.2 0 5.5 5.6 5.5 12.5 5.5 22 18 41 18 41s12.5-19 12.5-28.5C30.5 5.6 24.8 0 18 0z" fill="${hexColor}"/>
  <circle cx="18" cy="12.5" r="6.5" fill="#ffffff"/>
  <text x="18" y="15" font-size="8" font-family="Arial, Helvetica, sans-serif" text-anchor="middle" fill="#000" font-weight="700">${lab}</text>
</svg>`;

      const html = `
<div style="display:flex; flex-direction:column; align-items:center; text-align:center; max-width:200px;">
  ${svg}
  ${belowHtml}
</div>`;

      const icon = L.divIcon({
        className: 'svg-marker',
        html,
        iconSize: [36, 52 + (belowMarkerLines.length > 0 ? belowMarkerLines.length * 14 : 0)],
        iconAnchor: [18, 52]
      });

      marker.setIcon(icon);
    } else {
      // Other shapes (circle, square, oval)
      const textColor = isLight(hexColor) ? '#000' : '#fff';
      let width = 30, height = 30, borderRadius = '50%';
      if (row.shape === 'square') borderRadius = '0';
      if (row.shape === 'oval') { width = 40; height = 25; borderRadius = '50% / 50%'; }

      const html = `
<div style="
  display:flex;
  flex-direction:column;
  align-items:center;
  width:auto;
  max-width:200px;
  text-align:center;
">
  <div style="
    background:${hexColor};
    color:${textColor};
    width:${width}px;
    height:${height}px;
    border-radius:${borderRadius};
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:12px;
    font-weight:600;
    box-shadow:0 1px 2px rgba(0,0,0,0.25);">
    ${insideMarker ? escapeHtml(insideMarker) : ''}
  </div>
  ${belowHtml}
</div>`;

      const icon = L.divIcon({
        className: 'svg-marker',
        html,
        iconSize: [width, height + (belowMarkerLines.length > 0 ? belowMarkerLines.length * 14 : 0)],
        iconAnchor: [width / 2, height]
      });

      marker.setIcon(icon);
    }
  });
}

// --- Initialize map centered on NYC ---
const map = L.map('map', { preferCanvas: false }).setView([40.7128, -74.0060], 12);

// --- Base layers ---
const defaultLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors', maxZoom: 19
});
const positronLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '© OpenStreetMap & © CARTO', subdomains: 'abcd', maxZoom: 19
});
const voyagerLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '© OpenStreetMap & © CARTO', subdomains: 'abcd', maxZoom: 19
});

// --- Set default map to Voyager ---
let currentBaseLayer = voyagerLayer;
currentBaseLayer.addTo(map);

// --- Marker group ---
const markerGroup = L.layerGroup().addTo(map);

// --- Map style switch ---
if (mapStyleSelect) {
  mapStyleSelect.value = 'voyager'; // default selection
  mapStyleSelect.addEventListener('change', () => {
    if (currentBaseLayer) map.removeLayer(currentBaseLayer);

    if (mapStyleSelect.value === 'bw') currentBaseLayer = positronLayer;
    else if (mapStyleSelect.value === 'voyager') currentBaseLayer = voyagerLayer;
    else currentBaseLayer = defaultLayer;

    currentBaseLayer.addTo(map);
    markerGroup.addTo(map);
  });
}

// --- Shapes / colors ---
const SHAPES = ['circle','square','oval','point'];
const COLORS = ['blue','red','green','yellow'];
const COLOR_HEX = {blue:'#2b7be4', red:'#d93f3f', green:'#3fcf3f', yellow:'#f1c40f'};

// --- Helper functions ---
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function xmlEscape(str){
  if(!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;');
}
function isLight(hex){
  try{
    const h = (hex||'#000000').replace('#','');
    const r=parseInt(h.length===3?h[0]+h[0]:h.substring(0,2),16);
    const g=parseInt(h.length===3?h[1]+h[1]:h.substring(2,4),16);
    const b=parseInt(h.length===3?h[2]+h[2]:h.substring(4,6),16);
    return (0.2126*r + 0.7152*g + 0.0722*b) > 160;
  }catch(e){ return false; }
}

// --- Update table header visibility ---
function updateTableControlsVisibility() {
  const rowCount = addressTableBody.querySelectorAll('tr').length;

  // Show table headers if rows exist, hide if empty
  const tableHead = document.querySelector('#addressTable thead');
  if (tableHead) tableHead.style.display = rowCount > 0 ? 'table-header-group' : 'none';

  // Show Map button only if table has rows
  const mapBtnContainer = document.querySelector('.map-btn-container');
  if(mapBtnContainer) mapBtnContainer.style.display = rowCount > 0 ? 'block' : 'none';

  // Show column toggle buttons only if table has rows
  const columnToggles = document.querySelector('.column-toggles');
  if(columnToggles) columnToggles.style.display = rowCount > 0 ? 'flex' : 'none';
}


// --- Add table row ---
function addTableRow(label='', name='', address='', shape='circle', color='blue', customColor='#2b7be4'){
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="width:36px; text-align:center;"><button class="remove-row" title="Remove this address" style="cursor:pointer">×</button></td>
    <td><input value="${escapeHtml(label)}" placeholder="Number" style="min-width:70px;"></td>
    <td><input value="${escapeHtml(name)}" placeholder="Name" style="min-width:120px;"></td>
    <td><input value="${escapeHtml(address)}" placeholder="Address" class="addr-input" style="width:420px; max-width:70vw;"></td>
    <td>
      <select class="shape-select" title="Choose marker shape">
        ${SHAPES.map(s=>`<option value="${s}" ${s===shape?'selected':''}>${s}</option>`).join('')}
      </select>
    </td>
    <td>
      <select class="color-select" title="Choose marker color">
        ${COLORS.map(c=>`<option value="${c}" ${c===color?'selected':''}>${c}</option>`).join('')}
        <option value="custom" ${color==='custom'?'selected':''}>Custom</option>
      </select>
      <input type="color" class="custom-color" value="${customColor}" style="display:${color==='custom'?'inline-block':'none'}; margin-left:6px; vertical-align:middle;">
    </td>
    <td class="shape-note" style="padding-left:8px; font-size:12px; color:#666;"></td>
  `;

  tr.querySelector('.remove-row').addEventListener('click', ()=>{ 
    tr.remove();
  });

  const colorSelect = tr.querySelector('.color-select');
  const colorInput = tr.querySelector('.custom-color');
  colorSelect.addEventListener('change', ()=>{ colorInput.style.display = colorSelect.value==='custom'?'inline-block':'none'; });

tr.querySelector('.shape-select').addEventListener('change', ()=>{ 
  tr.querySelector('.shape-note').textContent='';
});

addressTableBody.appendChild(tr);
updateTableControlsVisibility();  // ← correct function
}

function importAddressesToTable() {
  if (!addressInput) return;

  const lines = addressInput.value.split('\n').map(l => l.trim()).filter(Boolean);
  const existingAddresses = new Set(
    Array.from(addressTableBody.querySelectorAll('.addr-input'))
         .map(inp => inp.value.trim().toLowerCase())
         .filter(Boolean)
  );

  lines.forEach(line => {
    const address = line;  // everything goes into Address column
    if (address) {
      const aNorm = address.toLowerCase();
      if (!existingAddresses.has(aNorm)) {
        addTableRow('', '', address); // Number and Name left blank
        existingAddresses.add(aNorm);
      }
    }
  });

  // After all rows are added, update visibility of map button and column toggles
  updateTableControlsVisibility();
}


// --- Tab key inside textarea ---
addressInput.addEventListener('keydown', function(e){
  if(e.key==='Tab'){
    e.preventDefault();
    const start=this.selectionStart;
    const end=this.selectionEnd;
    this.value=this.value.substring(0,start)+"\t"+this.value.substring(end);
    this.selectionStart=this.selectionEnd=start+1;
  }
});

// --- Get table data ---
function getTableData() {
  const rows = Array.from(addressTableBody.querySelectorAll('tr'));
  const data = [];

  rows.forEach((r) => {
    const shape = r.querySelector('.shape-select')?.value || 'circle';
    const colorSel = r.querySelector('.color-select');
    let color = colorSel?.value || 'blue';
    let customColor = '#2b7be4';
    const colorInput = r.querySelector('.custom-color');
    if (color === 'custom' && colorInput) customColor = colorInput.value || customColor;

    const label   = r.querySelector('input[placeholder="Number"]').value.trim();
    const name    = r.querySelector('input[placeholder="Name"]').value.trim() || '';
    const address = r.querySelector('input[placeholder="Address"], .addr-input').value.trim();

    if (address) {
      data.push({
        label,
        name,
        address,
        shape,
        color,
        customColor
      });
    }
  });

  return data;  // ✅ return once, after the loop
}


// --- Loading popup ---
function showLoading(){ document.getElementById('loadingPopup').style.display='flex'; }
function hideLoading(){ document.getElementById('loadingPopup').style.display='none'; }
function updateLoadingText(msg){ const el=document.getElementById('loadingText'); if(el) el.textContent=msg; }

// --- Clear button ---
if(clearBtn){
  clearBtn.addEventListener('click', ()=>{
    if(confirm("Are you sure? This will clear all addresses and map markers.")){
      markerGroup.clearLayers();
      addressTableBody.innerHTML='';
      updateTableControlsVisibility()
      status('Cleared all results');
    }
  });
}

// --- Marker functions ---
function makeSvgPin(hexColor,labelText=''){
  const color = hexColor||'#2b7be4';
  let lab = String(labelText||'').trim();
  if(lab.length>3) lab=lab.slice(0,3);
  lab = xmlEscape(lab);
  const svg=`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="36" height="52" viewBox="0 0 36 52">
  <path d="M18 0C11.2 0 5.5 5.6 5.5 12.5 5.5 22 18 41 18 41s12.5-19 12.5-28.5C30.5 5.6 24.8 0 18 0z" fill="${color}"/>
  <circle cx="18" cy="12.5" r="6.5" fill="#ffffff"/>
  <text x="18" y="15" font-size="8" font-family="Arial, Helvetica, sans-serif" text-anchor="middle" fill="#000" font-weight="700">${lab}</text>
</svg>`;
  const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  return L.icon({iconUrl:url, iconSize:[36,52], iconAnchor:[18,52], popupAnchor:[0,-52]});
}

// --- Add marker (draggable) ---
function addMarker(lat, lon, row) {
  const hexColor = row.color === 'custom'
    ? (row.customColor || '#2b7be4')
    : (COLOR_HEX[row.color] || row.color || '#2b7be4');

  // --- label inside marker ---
  const insideMarker = (showNumber && row.label && row.label.length <= 3) ? row.label : '';

  // --- stacked text under marker ---
  const belowMarker = [];
  if (showNumber && row.label && row.label.length > 3) belowMarker.push(escapeHtml(row.label));
  if (showName && row.name) belowMarker.push(escapeHtml(row.name));
  if (showAddress && row.address) belowMarker.push(escapeHtml(row.address));

  const belowText = belowMarker.join('<br>');
  const belowHtml = belowText
    ? `<div class="marker-label">${belowText}</div>`
    : '';

if (row.shape === 'point') {
  // makeSvgPin produces the SVG as a string
  let labelText = (insideMarker || '');
  if (labelText.length > 3) labelText = labelText.slice(0,3);
  const lab = xmlEscape(labelText);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="36" height="52" viewBox="0 0 36 52">
  <path d="M18 0C11.2 0 5.5 5.6 5.5 12.5 5.5 22 18 41 18 41s12.5-19 12.5-28.5C30.5 5.6 24.8 0 18 0z" fill="${hexColor}"/>
  <circle cx="18" cy="12.5" r="6.5" fill="#ffffff"/>
  <text x="18" y="15" font-size="8" font-family="Arial, Helvetica, sans-serif" text-anchor="middle" fill="#000" font-weight="700">${lab}</text>
</svg>`;

  const html = `
<div style="display:flex; flex-direction:column; align-items:center; text-align:center; max-width:200px;">
  ${svg}
  ${belowHtml}
</div>`;

  const icon = L.divIcon({
    className: 'svg-marker',
    html,
    iconSize: [36, 52 + (belowMarker.length > 0 ? belowMarker.length * 14 : 0)],
    iconAnchor: [18, 52]
  });

  L.marker([lat, lon], { icon, draggable: true })
    .addTo(markerGroup)
    .bindPopup(
      `<strong>${escapeHtml(row.label)}</strong><br>${escapeHtml(row.name)}<br>${escapeHtml(row.address)}`
    );

  return;
}

  // --- other shapes ---
  const textColor = isLight(hexColor) ? '#000' : '#fff';
  let width = 30, height = 30, borderRadius = '50%';
  if (row.shape === 'square') borderRadius = '0';
  if (row.shape === 'oval') { width = 40; height = 25; borderRadius = '50% / 50%'; }

  const html = `
<div style="
  display:flex;
  flex-direction:column;
  align-items:center;
  width:auto;
  max-width:200px;
  text-align:center;
">
      <div style="
        background:${hexColor};
        color:${textColor};
        width:${width}px;
        height:${height}px;
        border-radius:${borderRadius};
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:12px;
        font-weight:600;
        box-shadow:0 1px 2px rgba(0,0,0,0.25);">
        ${insideMarker ? escapeHtml(insideMarker) : ''}
      </div>
      ${belowHtml}
    </div>`;

  const icon = L.divIcon({
    className: 'svg-marker',
    html,
    iconSize: [width, height + (belowMarker.length > 0 ? belowMarker.length * 14 : 0)],
    iconAnchor: [width / 2, height]
  });

  L.marker([lat, lon], { icon, draggable: true })
    .addTo(markerGroup)
    .bindPopup(
      `<strong>${escapeHtml(row.label)}</strong><br>${escapeHtml(row.name)}<br>${escapeHtml(row.address)}`
    );
}

// --- Geocode & plot with alert for failures ---
if(mapBtn) mapBtn.addEventListener('click', async ()=>{
  const data = getTableData();
  if(data.length===0){ alert('No addresses to map'); return; }

  showLoading();
  const failedAddresses = [];
  try{
    markerGroup.clearLayers();
    const bounds = [];

for (let i = 0; i < data.length; i++) {
  const row = data[i];
  const text = `Geocoding ${i + 1}/${data.length}: ${row.address}`;
  status(text);
  updateLoadingText(text);

  await new Promise(r => setTimeout(r, SLEEP_MS));

  const result = await geocodeWithFallback(row.address);
  if (result) {
    addMarker(result.lat, result.lon, row);

    if (result.approximate) {
      alert(`Could not find an exact match for:\n"${row.address}"\n\nPlaced marker at closest match (city/postal).\nYou can drag it to refine the location.`);
    }

    bounds.push([result.lat, result.lon]);
  } else {
    failedAddresses.push(row.address);
  }
}

// ✅ after the loop finishes:
if (bounds.length > 0) {
  map.fitBounds(bounds, { padding: [40, 40] });
  status('Finished plotting addresses');
  updateLoadingText('Finished plotting addresses');
} else {
  status('No addresses were successfully geocoded.');
  updateLoadingText('No addresses were successfully geocoded.');
}

if (failedAddresses.length > 0) {
  alert("Failed to geocode the following addresses:\n" + failedAddresses.join('\n'));
}

  } finally { hideLoading(); }
});



// --- Status bar ---
function status(msg){ const statusEl=document.getElementById('status'); if(statusEl) statusEl.textContent='Status: '+msg; }


// --- Import button ---
if(importBtn) importBtn.addEventListener('click', importAddressesToTable);

// --- JSON export ---
if(downloadJsonBtn){
  downloadJsonBtn.addEventListener('click', ()=>{
    const data=getTableData();
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='addresses.json'; a.click();
    URL.revokeObjectURL(url);
  });
}

// --- PNG export ---
if(exportPngBtn){
  exportPngBtn.addEventListener('click', ()=>{
    domtoimage.toPng(document.getElementById('map')).then(dataUrl=>{
      const a=document.createElement('a'); a.href=dataUrl; a.download='map.png'; a.click();
    }).catch(err=>console.error('Error exporting map PNG',err));
  });
}

// --- Placeholder marker NYC ---
L.circleMarker([40.7128, -74.0060], {
  radius:6,color:'#2b7be4',fillColor:'#2b7be4',fillOpacity:0.7
}).addTo(markerGroup).bindPopup("New York City");

const feedbackBtn = document.getElementById('feedbackBtn');
const feedbackForm = document.getElementById('feedbackForm');
const feedbackText = document.getElementById('feedbackText');
const submitFeedback = document.getElementById('submitFeedback');
const cancelFeedback = document.getElementById('cancelFeedback');
const feedbackStatus = document.getElementById('feedbackStatus');

// Show the feedback form when button clicked
feedbackBtn.addEventListener('click', () => {
  feedbackForm.style.display = 'block';
  feedbackText.focus();
});

// Hide the form on cancel
cancelFeedback.addEventListener('click', () => {
  feedbackForm.style.display = 'none';
  feedbackText.value = '';
  feedbackStatus.textContent = '';
});

// Send feedback to Formspree without leaving the page
submitFeedback.addEventListener('click', async () => {
  const message = feedbackText.value.trim();
  if (!message) {
    feedbackStatus.textContent = 'Please enter feedback before sending.';
    return;
  }

  feedbackStatus.textContent = 'Sending...';

  try {
    const response = await fetch('https://formspree.io/f/xeoroqdz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ message })
    });

    if (response.ok) {
      feedbackStatus.textContent = 'Thank you for your feedback!';
      feedbackText.value = '';
      setTimeout(() => feedbackForm.style.display = 'none', 2000);
    } else {
      feedbackStatus.textContent = 'Oops, there was an error. Try again.';
    }
  } catch (e) {
    feedbackStatus.textContent = 'Error sending feedback.';
    console.error(e);
  }
});
