/* ==========
   Admin (datasets + talen) — drop-in vervanger
   Werkt met admin.html / admin.css zoals bijgevoegd.
   ========== */

/* ==========
   Data Model
   ========== */
const DB = {
  // datasetKey -> langKey -> { lang, sentiments: string[], messages: Message[] }
  data: new Map(),          // Map<string, Map<string, LangData>>
  activeDataset: 'messages',// default
  activeLang: null
};

const $  = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

const els = {
  fileInput:   $('#fileInput'),
  exportBtn:   $('#exportBtn'),
  themeBtn:    $('#themeBtn'),
  tabs:        $('#langTabs'),
  addMsgBtn:   $('#addMsgBtn'),
  delMsgBtn:   $('#delMsgBtn'),
  checkAll:    $('#checkAll'),
  searchBox:   $('#searchBox'),
  msgTableBody:$('#msgTable tbody'),
  status:      $('#status'),
};

/* ==========
   Helpers
   ========== */
function setStatus(msg){ if (els.status) els.status.textContent = msg; }

function parseNumericId(id){
  if (typeof id !== 'string') return null;
  const m = id.match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}
function nextIdFor(langKey, messages){
  const prefix = (langKey || 'id').toLowerCase() + '_';
  let max = 0;
  for (const m of (messages || [])) {
    const n = parseNumericId(m.id);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const next = String(max + 1).padStart(3, '0');
  return `${prefix}${next}`;
}

function currentLangData(){
  const map = DB.data.get(DB.activeDataset);
  return map ? map.get(DB.activeLang) : null;
}
function ensureDatasetMap(key){
  if (!DB.data.has(key)) DB.data.set(key, new Map());
  return DB.data.get(key);
}
function getSelectedIds(){
  return [...els.msgTableBody.querySelectorAll('input[type="checkbox"]:checked')]
    .map(cb => cb.dataset.id);
}

/* ==========
   Persistence
   ========== */
const STORAGE_KEY = 'msg_admin_v3';

function saveLocal(){
  // serialize Map → plain obj
  const out = { activeDataset: DB.activeDataset, activeLang: DB.activeLang, data: {} };
  for (const [ds, langMap] of DB.data) {
    out.data[ds] = {};
    for (const [lang, v] of langMap) out.data[ds][lang] = v;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
}

function loadLocal(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try{
    const obj = JSON.parse(raw);
    DB.activeDataset = obj.activeDataset || 'messages';
    DB.activeLang    = obj.activeLang || null;
    if (obj.data && typeof obj.data === 'object') {
      for (const ds of Object.keys(obj.data)) {
        const langMap = ensureDatasetMap(ds);
        for (const lang of Object.keys(obj.data[ds])) {
          langMap.set(lang, obj.data[ds][lang]);
        }
      }
    }
    // fallback activeLang
    if (!DB.activeLang) {
      const firstDs = [...DB.data.keys()][0];
      if (firstDs) {
        DB.activeDataset = firstDs;
        const firstLang = [...DB.data.get(firstDs).keys()][0];
        if (firstLang) DB.activeLang = firstLang;
      }
    }
  }catch(e){ console.error(e); }
}

/* ==========
   Import / Export
   ========== */
function guessDatasetFromName(name, jsonObj){
  // 1) filename prefix
  const lower = String(name || '').toLowerCase();
  if (lower.startsWith('messages.'))  return 'messages';
  if (lower.startsWith('birthdays.')) return 'birthdays';
  // 2) json shape hints (desnoods uitbreiden)
  if (Array.isArray(jsonObj?.messages))  return 'messages';
  if (Array.isArray(jsonObj?.birthdays)) return 'birthdays';
  // default
  return 'messages';
}

function normalizeImported(jsonObj, fallbackLangFromFileName){
  const lang = String(jsonObj?.lang || fallbackLangFromFileName || '').toLowerCase() || 'xx';
  const sentiments = Array.isArray(jsonObj?.sentiments) ? jsonObj.sentiments.filter(Boolean) : [];
  // We hanteren voor ál onze datasets hetzelfde veld "messages"
  const src = Array.isArray(jsonObj?.messages)
    ? jsonObj.messages
    : (Array.isArray(jsonObj?.birthdays) ? jsonObj.birthdays : []);
  const messages = src.map(m => ({
    id: String(m.id || '').trim(),
    icon: String(m.icon || ''),
    text: String(m.text || ''),
    sentiments: Array.isArray(m.sentiments) ? m.sentiments.filter(Boolean) : [],
    special_day: (m.special_day === null || typeof m.special_day === 'string') ? (m.special_day || null) : null,
    weight: Number.isFinite(m.weight) ? m.weight : 1
  }));
  return { lang, sentiments, messages };
}

async function importFiles(fileList){
  for (const file of fileList) {
    const text = await file.text();
    let json; try{ json = JSON.parse(text); }
    catch{ setStatus(`❌ ${file.name}: geen geldige JSON`); continue; }

    const dataset = guessDatasetFromName(file.name, json);
    const langGuess = (json.lang || file.name.replace(/\.[^.]+$/, '')).toLowerCase();
    const data = normalizeImported(json, langGuess);

    // lege of dubbele id's fixen
    const used = new Set();
    for (const m of data.messages) {
      if (!m.id || used.has(m.id)) m.id = nextIdFor(data.lang, data.messages);
      used.add(m.id);
    }

    const langMap = ensureDatasetMap(dataset);
    langMap.set(data.lang, { lang: data.lang, sentiments: data.sentiments, messages: data.messages });

    // active cursors
    DB.activeDataset = dataset;
    DB.activeLang    = DB.activeLang || data.lang;

    setStatus(`✅ Geïmporteerd: ${file.name} → ${dataset}.${data.lang} (${data.messages.length} messages)`);
  }
  saveLocal();
  renderAll();
}

function exportActive(){
  const data = currentLangData();
  if (!data) { setStatus('Geen actieve dataset/taal.'); return; }

  const out = {
    lang: data.lang,
    sentiments: (data.sentiments || []).slice(),
    messages: (data.messages || []).map(m => ({
      id: m.id,
      icon: m.icon,
      text: m.text,
      sentiments: Array.isArray(m.sentiments) ? m.sentiments.slice() : [],
      special_day: (m.special_day ?? null),
      weight: Number.isFinite(m.weight) ? m.weight : 1
    }))
  };

  const fname = `${DB.activeDataset}.${data.lang}.json`;
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setStatus(`⬇️ Geëxporteerd: ${fname}`);
}

/* ==========
   Rendering
   ========== */
function renderTabs(){
  // Eén nav (#langTabs) met 2 rijen: datasets + langs
  const wrap = els.tabs;
  if (!wrap) return;

  const datasets = [...DB.data.keys()];
  const langs    = DB.data.get(DB.activeDataset) ? [...DB.data.get(DB.activeDataset).keys()] : [];

  wrap.innerHTML = '';

  // — Dataset knoppen
  const dsBar = document.createElement('div');
  dsBar.className = 'tabs';
  datasets.length ? null : dsBar.classList.add('muted');
  (datasets.length ? datasets : ['messages']).forEach(ds => {
    const btn = document.createElement('button');
    btn.textContent = ds;
    btn.className = (DB.activeDataset === ds) ? 'active' : '';
    btn.addEventListener('click', () => {
      DB.activeDataset = ds;
      // corrigeer activeLang als deze niet voorkomt in nieuw ds
      const map = DB.data.get(ds);
      if (map && !map.has(DB.activeLang)) {
        DB.activeLang = [...map.keys()][0] || null;
      }
      saveLocal();
      renderAll();
    });
    dsBar.appendChild(btn);
  });
  wrap.appendChild(dsBar);

  // — Lang knoppen
  const langBar = document.createElement('div');
  langBar.className = 'tabs';
  (langs.length ? langs : []).forEach(lang => {
    const btn = document.createElement('button');
    btn.textContent = `${DB.activeDataset}.${lang}`;
    btn.className = (DB.activeLang === lang) ? 'active' : '';
    btn.addEventListener('click', () => { DB.activeLang = lang; saveLocal(); renderAll(); });
    langBar.appendChild(btn);
  });
  wrap.appendChild(langBar);
}

function renderMessages(){
  const data = currentLangData();
  els.msgTableBody.innerHTML = '';
  if (!data) return;

  const q = (els.searchBox.value || '').trim().toLowerCase();

  (data.messages || []).forEach(msg => {
    if (q) {
      const hay = [(msg.id||''), (msg.icon||''), (msg.text||'')].join(' ').toLowerCase();
      if (!hay.includes(q)) return;
    }

    const tr = document.createElement('tr');

    // select
    const tdSel = document.createElement('td');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.id = msg.id;
    cb.addEventListener('change', () => renderSentimentEditor()); // herteken rechterpaneel
    tdSel.appendChild(cb); tr.appendChild(tdSel);

    // id (readonly)
    const tdId = document.createElement('td');
    tdId.textContent = msg.id || ''; tr.appendChild(tdId);

    // icon
    const tdIcon = document.createElement('td');
    const inIcon = document.createElement('input'); inIcon.type = 'text'; inIcon.value = msg.icon || '';
    inIcon.addEventListener('input', () => { msg.icon = inIcon.value; saveLocal(); });
    tdIcon.appendChild(inIcon); tr.appendChild(tdIcon);

    // text
    const tdText = document.createElement('td');
    const ta = document.createElement('textarea'); ta.value = msg.text || '';
    ta.addEventListener('input', () => { msg.text = ta.value; saveLocal(); });
    tdText.appendChild(ta); tr.appendChild(tdText);

    // special_day
    const tdDay = document.createElement('td');
    const selDay = document.createElement('select');
    SPECIAL_DAYS.forEach(opt => {
      const o = document.createElement('option');
      o.value = String(opt.val);
      o.textContent = opt.label;
      selDay.appendChild(o);
    });
    selDay.value = String(msg.special_day ?? null);
    selDay.addEventListener('change', () => {
      const v = selDay.value;
      msg.special_day = (v === 'null') ? null : (v || null);
      saveLocal();
    });
    tdDay.appendChild(selDay); tr.appendChild(tdDay);

    // weight
    const tdW = document.createElement('td');
    const inW = document.createElement('input'); inW.type = 'number'; inW.min = '0'; inW.step = '1';
    inW.value = Number.isFinite(msg.weight) ? msg.weight : 1;
    inW.addEventListener('input', () => { msg.weight = parseInt(inW.value || '1', 10) || 1; saveLocal(); });
    tdW.appendChild(inW); tr.appendChild(tdW);

    // hele rij → single-select gemak
    tr.addEventListener('click', (e) => {
      if (e.target.closest('input,textarea,select,button,label')) return;
      cb.checked = !cb.checked;
      if (cb.checked) {
        els.msgTableBody.querySelectorAll('input[type="checkbox"]').forEach(other => {
          if (other !== cb) other.checked = false;
        });
      }
      renderSentimentEditor();
    });

    els.msgTableBody.appendChild(tr);
  });

  renderSentimentEditor();
}

const SPECIAL_DAYS = [
  { val: null, label: '—' },
  { val: 'valentine', label: 'valentine' },
  { val: 'newyear',   label: 'newyear' },
  { val: 'easter',    label: 'easter' }
];

function renderSentimentEditor(){
  const data = currentLangData();
  const wrap = document.getElementById('sentEditor');
  const status = document.getElementById('sentStatus');
  if (!data || !wrap || !status) return;

  const ids = getSelectedIds();
  wrap.innerHTML = '';

  if (ids.length !== 1) {
    status.textContent = (ids.length === 0) ? 'Selecteer precies 1 message' : 'Meerdere geselecteerd — kies er 1';
    return;
  }

  status.textContent = `${DB.activeDataset}.${data.lang} → ${ids[0]}`;
  const msg = (data.messages || []).find(m => m.id === ids[0]);
  if (!msg) return;

  const all = data.sentiments || [];
  const selected = new Set(msg.sentiments || []);

  const box = document.createElement('div');
  box.className = 'chipset';

  all.forEach(id => {
    const pill = document.createElement('label');
    pill.className = 'pill';
    pill.innerHTML = `
      <input type="checkbox" value="${id}" ${selected.has(id) ? 'checked' : ''}/>
      <span>${id}</span>
    `;
    pill.querySelector('input').addEventListener('change', (e) => {
      const val = e.target.value;
      if (e.target.checked) selected.add(val); else selected.delete(val);
      msg.sentiments = Array.from(selected);
      saveLocal();
    });
    box.appendChild(pill);
  });

  wrap.appendChild(box);
}

function renderAll(){
  renderTabs();
  renderMessages();
}

/* ==========
   Actions
   ========== */
function addMessage(){
  const data = currentLangData(); if (!data) return;
  const id = nextIdFor(data.lang, data.messages);
  const row = { id, icon: '', text: '', sentiments: [], special_day: null, weight: 1 };
  data.messages.unshift(row);
  saveLocal();
  renderMessages();
}
function deleteSelectedMessages(){
  const data = currentLangData(); if (!data) return;
  const ids = [...els.msgTableBody.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.dataset.id);
  if (!ids.length) return;
  if (!confirm(`Verwijder ${ids.length} message(s)?`)) return;
  data.messages = data.messages.filter(m => !ids.includes(m.id));
  saveLocal();
  renderMessages();
  els.checkAll.checked = false;
}

/* ==========
   Events
   ========== */
function bindEvents(){
  els.fileInput.addEventListener('change', e => {
    const files = e.target.files;
    if (files && files.length) importFiles(files);
    els.fileInput.value = '';
  });
  els.exportBtn.addEventListener('click', exportActive);

  els.addMsgBtn.addEventListener('click', addMessage);
  els.delMsgBtn.addEventListener('click', deleteSelectedMessages);

  els.checkAll.addEventListener('change', () => {
    els.msgTableBody.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = els.checkAll.checked);
    renderSentimentEditor();
  });

  els.searchBox.addEventListener('input', renderMessages);

  // Dag/Nacht
  els.themeBtn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = (cur === 'dark') ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('adminTheme', next);
  });
}

/* ==========
   Init
   ========== */
(function init(){
  // Theme herstellen
  const theme = localStorage.getItem('adminTheme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);

  loadLocal();
  bindEvents();
  renderAll();
  setStatus('Klaar. Importeer één of meer JSON-bestanden om te beginnen.');
})();