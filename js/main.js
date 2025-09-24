// main.js — fully patched: Voyager default, fixed import/mapping, table header, map style, popup loading

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const SLEEP_MS = 1100;
// --- Geocode with simple fallback ---
async function geocodeWithFallback(address) {
  const queries = [
    address,                                       // original
    address.replace(/,?\s*\bUnited\s+Sta.*$/i,''), // remove “United States” if present
    address.split(',').slice(0,-1).join(',')       // remove last part of address
  ];

  for (const q of queries) {
    if (!q.trim()) continue;
    try {
      const resp = await fetch(`${NOMINATIM_BASE}?format=json&limit=1&q=${encodeURIComponent(q)}`);
      const json = await resp.json();
      if (json && json.length > 0) {
        return { lat: parseFloat(json[0].lat), lon: parseFloat(json[0].lon) };
      }
    } catch(e){ console.error('Geocode error:', e); }
  }
  return null; // could not geocode
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
function updateTableHeaderVisibility(){
  const tableHead = document.getElementById('tableHead');
  if(!tableHead) return;
  tableHead.style.display = addressTableBody.querySelectorAll('tr').length > 0 ? 'table-header-group' : 'none';
}

// --- Add table row ---
function addTableRow(label='', name='', address='', shape='circle', color='blue', customColor='#2b7be4'){
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="width:36px; text-align:center;"><button class="remove-row" title="Remove this address" style="cursor:pointer">×</button></td>
    <td><input value="${escapeHtml(label)}" placeholder="Label" style="min-width:70px;"></td>
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

  tr.querySelector('.remove-row').addEventListener('click', ()=>{ tr.remove(); updateTableHeaderVisibility(); });
  const colorSelect = tr.querySelector('.color-select');
  const colorInput = tr.querySelector('.custom-color');
  colorSelect.addEventListener('change', ()=>{ colorInput.style.display = colorSelect.value==='custom'?'inline-block':'none'; });
  tr.querySelector('.shape-select').addEventListener('change', ()=>{ tr.querySelector('.shape-note').textContent=''; });

  addressTableBody.appendChild(tr);
  updateTableHeaderVisibility();
}

// --- Import addresses ---
function importAddressesToTable(){
  if(!addressInput) return;
  const lines = addressInput.value.split('\n').map(l=>l.trim()).filter(Boolean);
  const existingAddresses = new Set(Array.from(addressTableBody.querySelectorAll('.addr-input')).map(inp=>inp.value.trim().toLowerCase()).filter(Boolean));
  let labelCounter = addressTableBody.querySelectorAll('tr').length + 1;

  lines.forEach(line=>{
    let label='', name='', address='';
    let parts = line.includes('\t') ? line.split('\t') : line.split(',');
    parts = parts.map(p=>p.trim()).filter(p=>p!=='');
    if(parts.length>=3){ label=parts[0]||labelCounter.toString(); name=parts[1]||''; address=parts.slice(2).join(', ').trim(); }
    else if(parts.length===2){ label=parts[0]||labelCounter.toString(); address=parts[1].trim(); }
    else { label=labelCounter.toString(); address=parts[0]?parts[0].trim():''; }
    if(address){
      const aNorm = address.toLowerCase();
      if(!existingAddresses.has(aNorm)){
        addTableRow(label,name,address);
        existingAddresses.add(aNorm);
        labelCounter++;
      }
    }
  });
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
function getTableData(){
  const rows = Array.from(addressTableBody.querySelectorAll('tr'));
  const data = [];
  rows.forEach((r,i)=>{
    const shape = r.querySelector('.shape-select')?.value || 'circle';
    const colorSel = r.querySelector('.color-select');
    let color = colorSel?.value || 'blue';
    let customColor = '#2b7be4';
    const colorInput = r.querySelector('.custom-color');
    if(color==='custom' && colorInput) customColor=colorInput.value||customColor;
    const label=r.querySelector('input[placeholder="Label"]').value.trim()||(i+1).toString();
    const name=r.querySelector('input[placeholder="Name"]').value.trim()||'';
    const address=r.querySelector('input[placeholder="Address"], .addr-input').value.trim();
    if(address) data.push({label,name,address,shape,color,customColor});
  });
  return data;
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
      updateTableHeaderVisibility();
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
function addMarker(lat, lon, row){
  const hexColor = row.color==='custom' ? (row.customColor||'#2b7be4') : (COLOR_HEX[row.color]||row.color||'#2b7be4');
  
  if(row.shape==='point'){
    const pinIcon = makeSvgPin(hexColor,row.label);
    L.marker([lat,lon], {icon:pinIcon, draggable:true})
      .addTo(markerGroup)
      .bindPopup(`<strong>${escapeHtml(row.label)}</strong><br>${escapeHtml(row.name)}<br>${escapeHtml(row.address)}`);
    return;
  }

  const textColor=isLight(hexColor)?'#000':'#fff';
  let width=30, height=30, borderRadius='50%';
  if(row.shape==='square') borderRadius='0';
  if(row.shape==='oval'){width=40; height=25; borderRadius='50% / 50%';}

  const html=`<div style="
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
    box-shadow:0 1px 2px rgba(0,0,0,0.25);">${escapeHtml(row.label)}</div>`;

  const icon=L.divIcon({className:'svg-marker', html, iconSize:[width,height], iconAnchor:[width/2,height]});
  L.marker([lat,lon], {icon, draggable:true})
    .addTo(markerGroup)
    .bindPopup(`<strong>${escapeHtml(row.label)}</strong><br>${escapeHtml(row.name)}<br>${escapeHtml(row.address)}`);
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

    for(let i=0;i<data.length;i++){
      const row = data[i];
      const text=`Geocoding ${i+1}/${data.length}: ${row.address}`;
      status(text); updateLoadingText(text);

      await new Promise(r=>setTimeout(r,SLEEP_MS));

      const result = await geocodeWithFallback(row.address);
      if(result){
        addMarker(result.lat, result.lon, row);
        bounds.push([result.lat, result.lon]);
      } else {
        failedAddresses.push(row.address);
      }
    }

    if(bounds.length>0){ map.fitBounds(bounds,{padding:[40,40]}); status('Finished plotting addresses'); updateLoadingText('Finished plotting addresses'); }
    else { status('No addresses were successfully geocoded.'); updateLoadingText('No addresses were successfully geocoded.'); }

    if(failedAddresses.length>0) alert("Failed to geocode the following addresses:\n" + failedAddresses.join('\n'));

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
