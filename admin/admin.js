/* ========= admin.js ========= */
/* AWN Admin v2 — ondersteunt datasets als messages.*.{lang}.json, bv:
   messages.nl.json, messages.en.json, messages.birthday.nl.json, ...
   Belangrijkste features:
   • CRUD met intuïtieve UI
   • Meerdere sentiments per message (chipset)
   • Overzicht: aantallen per sentiment
   • Duplicaten-finder (genormaliseerde tekst)
   • Random unieke ID-generator per taal
   • Export met oplopend versienummer op basis van originele bestandsnaam
   • Toekomstbestendig: onbekende velden in messages worden behouden bij export
*/

/* ========= Data Model ========= */
const DB = {
  // datasetBase -> Map<lang, LangData>
  data: new Map(),
  // datasetBase is bv. "messages" of "messages.birthday"
  activeDataset: 'messages',
  activeLang: null,
  // Naam van het geïmporteerde bestand zonder .json (incl. eventuele vNNN): per dataset+lang
  // bv. originalName["messages"]["nl"] = "messages.nl" of "messages.birthday.nl"
  originalName: new Map(),
  // Laatst gebruikte versienummers per baseName (zonder .vNNN), persist in localStorage
  versionCounters: {}
};

function $(sel){ return document.querySelector(sel); }
function $$(sel){ return document.querySelectorAll(sel); }

const els = {
  fileInput:   $('#fileInput'),
  exportBtn:   $('#exportBtn'),
  insightBtn:  $('#insightBtn'),
  dupeBtn:     $('#dupeBtn'),
  themeBtn:    $('#themeBtn'),
  tabs:        $('#langTabs'),
  addMsgBtn:   $('#addMsgBtn'),
  delMsgBtn:   $('#delMsgBtn'),
  checkAll:    $('#checkAll'),
  searchBox:   $('#searchBox'),
  msgTableBody:$('#msgTable tbody'),
  status:      $('#status'),
  views:       $$('[data-view]'),
  viewEditor:  $('#view-editor'),
  viewInsights:$('#view-insights'),
  viewDupes:   $('#view-dupes'),
  insightBody: $('#insightBody'),
  insightCtx:  $('#insightContext'),
  dupeBody:    $('#dupeBody'),
  dupeCtx:     $('#dupeContext')
};

/* ========= Helpers ========= */
function setStatus(msg){ if (els.status) els.status.textContent = msg; }

function parseFileName(name){
  // Match: messages(.anything)*.{lang}.json  — we only care about base (messages[.x]) and lang
  const m = String(name||'').match(/^(messages(?:\.[^.]+)*)\.(?<lang>[a-z]{2})\.json$/i);
  if (m) {
    return { base: m[1], lang: m.groups.lang.toLowerCase(), isMessages:true };
  }
  // Fallback: try messages.*.json or birthdays.* —
  const alt = String(name||'').replace(/\.json$/,'');
  const parts = alt.split('.');
  const lang = parts.pop()?.toLowerCase() || 'xx';
  const base = parts.join('.') || 'messages';
  return { base, lang, isMessages: base.startsWith('messages') };
}

function ensureMap2(map, key){ if(!map.has(key)) map.set(key, new Map()); return map.get(key); }
function ensureObj(obj, key){ if(!(key in obj)) obj[key] = {}; return obj[key]; }

function currentLangData(){
  const langMap = DB.data.get(DB.activeDataset);
  return langMap ? langMap.get(DB.activeLang) : null;
}

function makeRandomId(lang, existing){
  // Random, leesbaar en per taal uniek: nl_xxxxxx / en_xxxxxx
  const prefix = (lang||'id').toLowerCase() + '_';
  let id;
  do { id = prefix + Math.random().toString(36).slice(2,8); }
  while (existing.has(id));
  return id;
}

function normalizeMessage(m){
  // Bewaar onbekende velden in _extra zodat export ze terugschrijft
  const known = ['id','icon','text','sentiments','special_day','weight'];
  const out = {
    id: String(m.id||'').trim(),
    icon: m.icon ?? '',
    text: m.text ?? '',
    sentiments: Array.isArray(m.sentiments) ? m.sentiments.filter(Boolean) : [],
    special_day: (m.special_day === null || typeof m.special_day === 'string') ? (m.special_day||null) : null,
    weight: Number.isFinite(m.weight) ? m.weight : 1,
    _extra: {}
  };
  for (const k of Object.keys(m)){
    if (!known.includes(k)) out._extra[k] = m[k];
  }
  return out;
}

/* ========= Persistence ========= */
const STORAGE_KEY = 'awn_admin_v2';

function saveLocal(){
  const obj = { activeDataset: DB.activeDataset, activeLang: DB.activeLang, versionCounters: DB.versionCounters, data:{}, originalName:{} };
  for (const [ds, langMap] of DB.data){
    obj.data[ds] = {};
    for (const [lang, v] of langMap){ obj.data[ds][lang] = v; }
  }
  for (const [ds, langMap] of DB.originalName){
    obj.originalName[ds] = {};
    for (const [lang, nm] of langMap){ obj.originalName[ds][lang] = nm; }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

function loadLocal(){
  const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return;
  try{
    const obj = JSON.parse(raw);
    DB.activeDataset = obj.activeDataset || 'messages';
    DB.activeLang    = obj.activeLang || null;
    DB.versionCounters = obj.versionCounters || {};
    // data
    for (const ds of Object.keys(obj.data||{})){
      const langMap = ensureMap2(DB.data, ds);
      for (const lang of Object.keys(obj.data[ds])) langMap.set(lang, obj.data[ds][lang]);
    }
    // originalName
    for (const ds of Object.keys(obj.originalName||{})){
      const langMap = ensureMap2(DB.originalName, ds);
      for (const lang of Object.keys(obj.originalName[ds])) langMap.set(lang, obj.originalName[ds][lang]);
    }
    if (!DB.activeLang){
      const firstDs = [...DB.data.keys()][0];
      if (firstDs){
        DB.activeDataset = firstDs;
        const firstLang = [...DB.data.get(firstDs).keys()][0];
        if (firstLang) DB.activeLang = firstLang;
      }
    }
  }catch(e){ console.error(e); }
}

/* ========= Import / Export ========= */
function normalizeImported(jsonObj, fallbackLang){
  const lang = String(jsonObj?.lang || fallbackLang || '').toLowerCase() || 'xx';
  const sentiments = Array.isArray(jsonObj?.sentiments) ? jsonObj.sentiments.filter(Boolean) : [];
  // Bron kan messages[] of birthdays[] heten — we normaliseren naar messages[]
  const src = Array.isArray(jsonObj?.messages)
    ? jsonObj.messages
    : (Array.isArray(jsonObj?.birthdays) ? jsonObj.birthdays : []);
  const messages = src.map(normalizeMessage);
  // Zorg dat id's uniek en non-empty zijn
  const used = new Set(messages.map(m=>m.id).filter(Boolean));
  for (const m of messages){ if (!m.id || used.has(m.id)) { m.id = makeRandomId(lang, used); used.add(m.id);} }
  return { lang, sentiments, messages };
}

async function importFiles(fileList){
  for (const file of fileList){
    let json; try{ json = JSON.parse(await file.text()); }
    catch{ setStatus(`❌ ${file.name}: geen geldige JSON`); continue; }

    const meta = parseFileName(file.name);
    const data = normalizeImported(json, meta.lang);

    // datasetBase → bv. "messages" of "messages.birthday"
    const langMap = ensureMap2(DB.data, meta.base);
    langMap.set(data.lang, { lang: data.lang, sentiments: data.sentiments, messages: data.messages });

    // Onthoud originele baseName voor export (zonder .json en zonder versiesuffix)
    const baseName = `${meta.base}.${data.lang}`; // bv. messages.nl of messages.birthday.nl
    const origMap = ensureMap2(DB.originalName, meta.base);
    origMap.set(data.lang, baseName);

    DB.activeDataset = meta.base;
    DB.activeLang = data.lang;

    setStatus(`✅ Geïmporteerd: ${file.name} → ${meta.base}.${data.lang} (${data.messages.length} messages)`);
  }
  saveLocal();
  renderAll();
}

function nextVersionedFilename(){
  const data = currentLangData(); if (!data) return null;
  const base = (DB.originalName.get(DB.activeDataset)?.get(DB.activeLang)) || `${DB.activeDataset}.${DB.activeLang}`;
  // Versieteller per base (zonder .vNNN)
  DB.versionCounters[base] = (DB.versionCounters[base]||0) + 1;
  const v = String(DB.versionCounters[base]).padStart(3,'0');
  return { filename: `${base}.v${v}.json`, base, v };
}

function exportActive(){
  const data = currentLangData(); if (!data){ setStatus('Geen actieve dataset/taal.'); return; }

  const out = {
    lang: data.lang,
    sentiments: (data.sentiments||[]).slice(),
    messages: (data.messages||[]).map(m=>{
      // Schrijf _extra velden terug
      const core = { id:m.id, icon:m.icon, text:m.text, sentiments:Array.isArray(m.sentiments)?m.sentiments.slice():[], special_day:(m.special_day??null), weight:Number.isFinite(m.weight)?m.weight:1 };
      return Object.assign({}, core, m._extra||{});
    })
  };

  const vmeta = nextVersionedFilename();
  const blob = new Blob([JSON.stringify(out, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = vmeta.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setStatus(`⬇️ Geëxporteerd: ${vmeta.filename}`);
  saveLocal();
}

/* ========= Rendering ========= */
function renderTabs(){
  const wrap = els.tabs; if (!wrap) return;
  const datasets = [...DB.data.keys()];
  const langs = DB.data.get(DB.activeDataset) ? [...DB.data.get(DB.activeDataset).keys()] : [];
  wrap.innerHTML = '';

  const dsBar = document.createElement('div'); dsBar.className = 'tabs';
  (datasets.length ? datasets : ['messages']).forEach(ds=>{
    const btn = document.createElement('button');
    btn.textContent = ds; btn.className = (DB.activeDataset===ds)?'active':'';
    btn.addEventListener('click', ()=>{ DB.activeDataset = ds; if(DB.data.get(ds)&&!DB.data.get(ds).has(DB.activeLang)){ DB.activeLang = [...DB.data.get(ds).keys()][0]||null; } saveLocal(); renderAll(); });
    dsBar.appendChild(btn);
  });
  wrap.appendChild(dsBar);

  const langBar = document.createElement('div'); langBar.className = 'tabs';
  (langs.length?langs:[]).forEach(lang=>{
    const label = `${DB.activeDataset}.${lang}`;
    const btn = document.createElement('button');
    btn.textContent = label; btn.className = (DB.activeLang===lang)?'active':'';
    btn.addEventListener('click', ()=>{ DB.activeLang = lang; saveLocal(); renderAll(); });
    langBar.appendChild(btn);
  });
  wrap.appendChild(langBar);
}

const SPECIAL_DAYS = [ { val:null, label:'—' }, { val:'valentine',label:'valentine' }, { val:'newyear',label:'newyear' }, { val:'easter',label:'easter' } ];

function getSelectedIds(){
  return [...els.msgTableBody.querySelectorAll('input[type="checkbox"]:checked')].map(cb=>cb.dataset.id);
}

function renderMessages(){
  const data = currentLangData(); els.msgTableBody.innerHTML=''; if(!data) return;
  const q = (els.searchBox.value||'').trim().toLowerCase();
  (data.messages||[]).forEach(msg=>{
    if (q){ const hay = [(msg.id||''),(msg.icon||''),(msg.text||'')].join(' ').toLowerCase(); if(!hay.includes(q)) return; }
    const tr = document.createElement('tr');

    // select
    const tdSel = document.createElement('td');
    const cb = document.createElement('input'); cb.type='checkbox'; cb.dataset.id = msg.id; cb.addEventListener('change', ()=>renderSentimentEditor());
    tdSel.appendChild(cb); tr.appendChild(tdSel);

    // id (readonly)
    const tdId = document.createElement('td'); tdId.textContent = msg.id||''; tr.appendChild(tdId);

    // icon
    const tdIcon = document.createElement('td');
    const inIcon = document.createElement('input'); inIcon.type='text'; inIcon.value = msg.icon||'';
    inIcon.addEventListener('input', ()=>{ msg.icon = inIcon.value; saveLocal(); });
    tdIcon.appendChild(inIcon); tr.appendChild(tdIcon);

    // text
    const tdText = document.createElement('td');
    const ta = document.createElement('textarea'); ta.value = msg.text||'';
    ta.addEventListener('input', ()=>{ msg.text = ta.value; saveLocal(); });
    tdText.appendChild(ta); tr.appendChild(tdText);

    // special_day
    const tdDay = document.createElement('td');
    const selDay = document.createElement('select');
    SPECIAL_DAYS.forEach(opt=>{ const o=document.createElement('option'); o.value=String(opt.val); o.textContent=opt.label; selDay.appendChild(o); });
    selDay.value = String(msg.special_day??null);
    selDay.addEventListener('change', ()=>{ const v = selDay.value; msg.special_day = (v==='null')?null:(v||null); saveLocal(); });
    tdDay.appendChild(selDay); tr.appendChild(tdDay);

    // weight
    const tdW = document.createElement('td');
    const inW = document.createElement('input'); inW.type='number'; inW.min='0'; inW.step='1'; inW.value = Number.isFinite(msg.weight)?msg.weight:1;
    inW.addEventListener('input', ()=>{ msg.weight = parseInt(inW.value||'1',10)||1; saveLocal(); });
    tdW.appendChild(inW); tr.appendChild(tdW);

    // Row click convenience
    tr.addEventListener('click', (e)=>{
      if (e.target.closest('input,textarea,select,button,label')) return;
      cb.checked = !cb.checked;
      if (cb.checked){ els.msgTableBody.querySelectorAll('input[type="checkbox"]').forEach(o=>{ if(o!==cb) o.checked=false; }); }
      renderSentimentEditor();
    });

    els.msgTableBody.appendChild(tr);
  });
  renderSentimentEditor();
}

function renderSentimentEditor(){
  const data = currentLangData(); const wrap = document.getElementById('sentEditor'); const status = document.getElementById('sentStatus');
  if (!data||!wrap||!status) return; const ids = getSelectedIds(); wrap.innerHTML='';
  if (ids.length!==1){ status.textContent = (ids.length===0)?'Selecteer precies 1 message':'Meerdere geselecteerd — kies er 1'; return; }

  status.textContent = `${DB.activeDataset}.${data.lang} → ${ids[0]}`;
  const msg = (data.messages||[]).find(m=>m.id===ids[0]); if(!msg) return;

  const all = data.sentiments||[]; const selected = new Set(msg.sentiments||[]);
  const box = document.createElement('div'); box.className='chipset';
  all.forEach(id=>{
    const pill = document.createElement('label'); pill.className='pill';
    pill.innerHTML = `<input type="checkbox" value="${id}" ${selected.has(id)?'checked':''}/><span>${id}</span>`;
    pill.querySelector('input').addEventListener('change', (e)=>{ const val=e.target.value; if(e.target.checked) selected.add(val); else selected.delete(val); msg.sentiments = Array.from(selected); saveLocal(); });
    box.appendChild(pill);
  });
  wrap.appendChild(box);
}

function switchView(which){
  for (const v of els.views) v.classList.add('hidden');
  which.classList.remove('hidden');
}

function renderInsights(){
  const data = currentLangData(); els.insightBody.innerHTML=''; if(!data) return;
  const counts = new Map();
  for (const m of (data.messages||[])){
    for (const s of (m.sentiments||[])) counts.set(s, (counts.get(s)||0)+1);
  }
  const rows = [...(data.sentiments||[])].map(s=>({ s, n: counts.get(s)||0 }));
  rows.sort((a,b)=> b.n - a.n || a.s.localeCompare(b.s));
  for (const r of rows){
    const tr = document.createElement('tr');
    const tdS = document.createElement('td'); tdS.textContent = r.s; tr.appendChild(tdS);
    const tdN = document.createElement('td'); tdN.textContent = String(r.n); tr.appendChild(tdN);
    els.insightBody.appendChild(tr);
  }
  els.insightCtx.textContent = `${DB.activeDataset}.${data.lang}`;
}

function normalizeTextForDupe(s){
  return String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
}

function renderDupes(){
  const data = currentLangData(); els.dupeBody.innerHTML=''; if(!data) return;
  const map = new Map(); // normText -> [ids]
  for (const m of (data.messages||[])){
    const key = normalizeTextForDupe(m.text);
    if (!key) continue; if (!map.has(key)) map.set(key, []);
    map.get(key).push(m.id);
  }
  // Only duplicates (len>=2)
  const dupeRows = [...map.entries()].filter(([k,ids])=>ids.length>=2).map(([k,ids])=>({k,ids}));
  dupeRows.sort((a,b)=> b.ids.length - a.ids.length || a.k.localeCompare(b.k));
  for (const row of dupeRows){
    const tr = document.createElement('tr');
    const tdT = document.createElement('td'); tdT.textContent = row.k.slice(0,120) + (row.k.length>120?'…':''); tr.appendChild(tdT);
    const tdI = document.createElement('td'); tdI.textContent = row.ids.join(', '); tr.appendChild(tdI);
    const tdN = document.createElement('td'); tdN.textContent = String(row.ids.length); tr.appendChild(tdN);
    els.dupeBody.appendChild(tr);
  }
  els.dupeCtx.textContent = `${DB.activeDataset}.${data.lang}` + (dupeRows.length?` — ${dupeRows.length} sets`:' — geen duplicaten gevonden');
}

function renderAll(){
  renderTabs();
  renderMessages();
}

/* ========= Actions ========= */
function addMessage(){
  const data = currentLangData(); if(!data) return;
  const existing = new Set((data.messages||[]).map(m=>m.id));
  const id = makeRandomId(data.lang, existing);
  const row = normalizeMessage({ id, icon:'', text:'', sentiments:[], special_day:null, weight:1 });
  data.messages.unshift(row); saveLocal(); renderMessages();
}

function deleteSelectedMessages(){
  const data = currentLangData(); if(!data) return;
  const ids = [...els.msgTableBody.querySelectorAll('input[type="checkbox"]:checked')].map(cb=>cb.dataset.id);
  if (!ids.length) return; if (!confirm(`Verwijder ${ids.length} message(s)?`)) return;
  data.messages = data.messages.filter(m=>!ids.includes(m.id)); saveLocal(); renderMessages(); els.checkAll.checked=false;
}

/* ========= Events ========= */
function bindEvents(){
  els.fileInput.addEventListener('change', e=>{ const files=e.target.files; if(files&&files.length) importFiles(files); els.fileInput.value=''; });
  els.exportBtn.addEventListener('click', exportActive);
  els.addMsgBtn.addEventListener('click', addMessage);
  els.delMsgBtn.addEventListener('click', deleteSelectedMessages);
  els.checkAll.addEventListener('change', ()=>{ els.msgTableBody.querySelectorAll('input[type="checkbox"]').forEach(cb=>cb.checked=els.checkAll.checked); renderSentimentEditor(); });
  els.searchBox.addEventListener('input', renderMessages);
  els.themeBtn.addEventListener('click', ()=>{ const cur=document.documentElement.getAttribute('data-theme')||'dark'; const next=(cur==='dark')?'light':'dark'; document.documentElement.setAttribute('data-theme', next); localStorage.setItem('adminTheme', next); });

  // View switchers
  els.insightBtn.addEventListener('click', ()=>{ renderInsights(); switchView(els.viewInsights); });
  els.dupeBtn.addEventListener('click', ()=>{ renderDupes(); switchView(els.viewDupes); });
  // Default editor view on tab change / search clears others
  $('#langTabs').addEventListener('click', ()=>{ switchView(els.viewEditor); });
}

/* ========= Init ========= */
(function init(){
  const theme = localStorage.getItem('adminTheme')||'dark'; document.documentElement.setAttribute('data-theme', theme);
  loadLocal();
  bindEvents();
  renderAll();
  setStatus('Klaar. Importeer één of meer JSON-bestanden om te beginnen.');
})();
