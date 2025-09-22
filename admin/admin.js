/* ==========
   Data Model (per lang)
   ========== */
const DB = {
  // langKey -> { lang, sentiments: string[], messages: Message[] }
  langs: new Map(),
  active: null
};

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

const els = {
  fileInput: $('#fileInput'),
  exportBtn: $('#exportBtn'),
  themeBtn: $('#themeBtn'),
  tabs: $('#langTabs'),
  addMsgBtn: $('#addMsgBtn'),
  delMsgBtn: $('#delMsgBtn'),
  checkAll: $('#checkAll'),
  searchBox: $('#searchBox'),
  msgTableBody: $('#msgTable tbody'),
  status: $('#status'),
};

/* ==========
   Helpers
   ========== */

function setStatus(msg){ if (els.status) els.status.textContent = msg; }

// Parse hoogste nummer uit IDs als "nl_001"
function parseNumericId(id){
  if (typeof id !== 'string') return null;
  const m = id.match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

// Genereer volgende ID op basis van hoogste suffix
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

function currentLangData(){ return DB.active ? DB.langs.get(DB.active) : null; }
function getSelectedIds(){
  return [...els.msgTableBody.querySelectorAll('input[type="checkbox"]:checked')]
    .map(cb => cb.dataset.id);
}

/* ==========
   Persistence
   ========== */
const STORAGE_KEY = 'msg_admin_v2';

function saveLocal(){
  const obj = {};
  for (const [k, v] of DB.langs) obj[k] = v;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

function loadLocal(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try{
    const obj = JSON.parse(raw);
    for (const k of Object.keys(obj)) DB.langs.set(k, obj[k]);
    if (DB.langs.size) DB.active = DB.active ?? [...DB.langs.keys()][0];
  }catch(e){ console.error(e); }
}

/* ==========
   Import / Export  (messages.{lang}.json schema)
   ========== */
function normalizeImported(jsonObj, fallbackLangFromFileName){
  const lang = String(jsonObj?.lang || fallbackLangFromFileName || '').toLowerCase() || 'xx';
  const sentiments = Array.isArray(jsonObj?.sentiments) ? jsonObj.sentiments.filter(Boolean) : [];
  const messages = Array.isArray(jsonObj?.messages) ? jsonObj.messages.map(m => ({
    id: String(m.id || '').trim(),
    icon: String(m.icon || ''),
    text: String(m.text || ''),
    sentiments: Array.isArray(m.sentiments) ? m.sentiments.filter(Boolean) : [],
    special_day: (m.special_day === null || typeof m.special_day === 'string') ? (m.special_day || null) : null,
    weight: Number.isFinite(m.weight) ? m.weight : 1
  })) : [];
  return { lang, sentiments, messages };
}

async function importFiles(fileList){
  for (const file of fileList) {
    const text = await file.text();
    let json; try{ json = JSON.parse(text); }
    catch{ setStatus(`❌ ${file.name}: geen geldige JSON`); continue; }

    const langGuess = (json.lang || file.name.replace(/\.[^.]+$/, '')).toLowerCase();
    const data = normalizeImported(json, langGuess);

    // lege of dubbele id's fixen bij import
    const used = new Set();
    for (const m of data.messages) {
      if (!m.id || used.has(m.id)) m.id = nextIdFor(data.lang, data.messages);
      used.add(m.id);
    }

    DB.langs.set(data.lang, data);
    DB.active = DB.active || data.lang;
    setStatus(`✅ Geïmporteerd: ${file.name} → taal "${data.lang}" (${data.messages.length} messages)`);
  }
  saveLocal();
  renderAll();
}

function exportActive(){
  const data = currentLangData();
  if (!data) { setStatus('Geen actieve taal.'); return; }

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

  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `messages.${data.lang}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setStatus(`⬇️ Geëxporteerd: messages.${data.lang}.json`);
}

/* ==========
   Rendering
   ========== */
function renderTabs(){
  els.tabs.innerHTML = '';
  for (const [lang] of DB.langs) {
    const btn = document.createElement('button');
    btn.textContent = lang;
    btn.className = (DB.active === lang) ? 'active' : '';
    btn.addEventListener('click', () => { DB.active = lang; saveLocal(); renderAll(); });
    els.tabs.appendChild(btn);
  }
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

    // hele rij aanklikbaar voor single-select gemak
    tr.addEventListener('click', (e) => {
      if (e.target.closest('input,textarea,select,button,label')) return; // niet togglen bij editen
      cb.checked = !cb.checked;
      // enforce single-select: zet andere uit als deze aan gaat
      if (cb.checked) {
        els.msgTableBody.querySelectorAll('input[type="checkbox"]').forEach(other => {
          if (other !== cb) other.checked = false;
        });
      }
      renderSentimentEditor();
    });

    els.msgTableBody.appendChild(tr);
  });

  // na render: herteken rechterpaneel voor (nieuwe) selectie
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

  status.textContent = `Message: ${ids[0]}`;
  const msg = (data.messages || []).find(m => m.id === ids[0]);
  if (!msg) return;

  const all = data.sentiments || [];
  const selected = new Set(msg.sentiments || []);

  // bouw checkbox-pills in rechterpaneel
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

  // Theme toggle
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
  // theme restore
  const theme = localStorage.getItem('adminTheme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);

  loadLocal();
  bindEvents();
  renderAll();
  setStatus('Klaar. Importeer één of meer JSON-bestanden om te beginnen.');
})();