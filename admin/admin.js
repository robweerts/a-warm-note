/* ==========
   Data Model
   ========== */
const DB = {
  // langKey -> { lang, messages:[], sentiments:[] }
  langs: new Map(),
  active: null
};

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

const els = {
  fileInput: $('#fileInput'),
  addLangBtn: $('#addLangBtn'),
  exportBtn: $('#exportBtn'),
  tabs: $('#langTabs'),
  addMsgBtn: $('#addMsgBtn'),
  delMsgBtn: $('#delMsgBtn'),
  addSentBtn: $('#addSentBtn'),
  delSentBtn: $('#delSentBtn'),
  checkAll: $('#checkAll'),
  checkAllSent: $('#checkAllSent'),
  searchBox: $('#searchBox'),
  msgTableBody: $('#msgTable tbody'),
  sentTableBody: $('#sentTable tbody'),
  status: $('#status'),
};

function uid() {
  return 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function setStatus(msg) {
  els.status.textContent = msg;
}

/* ==========
   Persistence
   ========== */
const STORAGE_KEY = 'msg_maint_v1';

function saveLocal() {
  const obj = {};
  for (const [k, v] of DB.langs) {
    obj[k] = v;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

function loadLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    for (const k of Object.keys(obj)) {
      DB.langs.set(k, obj[k]);
    }
    if (DB.langs.size) DB.active = DB.active ?? [...DB.langs.keys()][0];
  } catch (e) {
    console.error(e);
  }
}

/* ==========
   Rendering
   ========== */
function renderTabs() {
  els.tabs.innerHTML = '';
  for (const [lang] of DB.langs) {
    const btn = document.createElement('button');
    btn.textContent = lang;
    btn.className = (DB.active === lang) ? 'active' : '';
    btn.addEventListener('click', () => { DB.active = lang; saveLocal(); renderAll(); });
    els.tabs.appendChild(btn);
  }
}

function currentLangData() {
  if (!DB.active) return null;
  return DB.langs.get(DB.active);
}

function ensureSentiments(obj) {
  obj.sentiments = Array.isArray(obj.sentiments) ? obj.sentiments : [];
}

function renderMessages() {
  const data = currentLangData();
  els.msgTableBody.innerHTML = '';
  if (!data) return;

  const q = (els.searchBox.value || '').trim().toLowerCase();

  const sentimentsSet = new Set((data.sentiments || []).map(s => s.id));

  data.messages.forEach(msg => {
    if (q) {
      const inText = (msg.text || '').toLowerCase().includes(q);
      const inTags = (Array.isArray(msg.tags) ? msg.tags.join(',') : '').toLowerCase().includes(q);
      const inSent = (msg.sentiment || '').toLowerCase().includes(q);
      if (!inText && !inTags && !inSent) return;
    }
    const tr = document.createElement('tr');

    // select
    const tdSel = document.createElement('td');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.id = msg.id;
    tdSel.appendChild(cb);
    tr.appendChild(tdSel);

    // id (readonly)
    const tdId = document.createElement('td');
    tdId.textContent = msg.id || '';
    tr.appendChild(tdId);

    // icon
    const tdIcon = document.createElement('td');
    const inIcon = document.createElement('input'); inIcon.type = 'text'; inIcon.value = msg.icon || '';
    inIcon.addEventListener('input', () => { msg.icon = inIcon.value; saveLocal(); });
    tdIcon.appendChild(inIcon);
    tr.appendChild(tdIcon);

    // text
    const tdText = document.createElement('td');
    const ta = document.createElement('textarea'); ta.value = msg.text || '';
    ta.addEventListener('input', () => { msg.text = ta.value; saveLocal(); });
    tdText.appendChild(ta);
    tr.appendChild(tdText);

    // sentiment
    const tdSent = document.createElement('td');
    const sel = document.createElement('select');
    // empty option
    const emptyOpt = document.createElement('option'); emptyOpt.value = ''; emptyOpt.textContent = '—';
    sel.appendChild(emptyOpt);
    (data.sentiments || []).forEach(s => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = `${s.emoji || ''} ${s.label || s.id}`;
      sel.appendChild(o);
    });
    sel.value = sentimentsSet.has(msg.sentiment) ? msg.sentiment : '';
    sel.addEventListener('change', () => { msg.sentiment = sel.value || ''; saveLocal(); });
    tdSent.appendChild(sel);
    tr.appendChild(tdSent);

    // tags
    const tdTags = document.createElement('td');
    const inTags = document.createElement('input'); inTags.type = 'text';
    inTags.value = Array.isArray(msg.tags) ? msg.tags.join(',') : (msg.tags || '');
    inTags.placeholder = 'comma,separated';
    inTags.addEventListener('input', () => {
      const raw = inTags.value.trim();
      if (!raw) { msg.tags = []; saveLocal(); return; }
      msg.tags = raw.split(',').map(s => s.trim()).filter(Boolean);
      saveLocal();
    });
    tdTags.appendChild(inTags);
    tr.appendChild(tdTags);

    els.msgTableBody.appendChild(tr);
  });
}

function renderSentiments() {
  const data = currentLangData();
  els.sentTableBody.innerHTML = '';
  if (!data) return;
  ensureSentiments(data);

  data.sentiments.forEach(s => {
    const tr = document.createElement('tr');

    const tdSel = document.createElement('td');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.id = s.id;
    tdSel.appendChild(cb);
    tr.appendChild(tdSel);

    const tdId = document.createElement('td');
    const inId = document.createElement('input'); inId.type = 'text'; inId.value = s.id || '';
    inId.addEventListener('input', () => { s.id = inId.value.trim(); saveLocal(); });
    tdId.appendChild(inId);
    tr.appendChild(tdId);

    const tdLabel = document.createElement('td');
    const inLabel = document.createElement('input'); inLabel.type = 'text'; inLabel.value = s.label || '';
    inLabel.addEventListener('input', () => { s.label = inLabel.value; saveLocal(); });
    tdLabel.appendChild(inLabel);
    tr.appendChild(tdLabel);

    const tdEmoji = document.createElement('td');
    const inEmoji = document.createElement('input'); inEmoji.type = 'text'; inEmoji.value = s.emoji || '';
    inEmoji.addEventListener('input', () => { s.emoji = inEmoji.value; saveLocal(); });
    tdEmoji.appendChild(inEmoji);
    tr.appendChild(tdEmoji);

    els.sentTableBody.appendChild(tr);
  });
}

function renderAll() {
  renderTabs();
  renderMessages();
  renderSentiments();
}

/* ==========
   Import / Export
   ========== */
function normalizeImported(jsonObj) {
  const obj = {};
  obj.messages = Array.isArray(jsonObj?.messages) ? jsonObj.messages.map(m => ({
    id: m.id || uid(),
    icon: m.icon || '',
    text: m.text || '',
    sentiment: m.sentiment || '',
    tags: Array.isArray(m.tags) ? m.tags : (typeof m.tags === 'string' ? m.tags.split(',').map(s => s.trim()).filter(Boolean) : [])
  })) : [];
  obj.sentiments = Array.isArray(jsonObj?.sentiments) ? jsonObj.sentiments.map(s => ({
    id: s.id || '',
    label: s.label || (s.id || ''),
    emoji: s.emoji || ''
  })) : [];
  return obj;
}

async function importFiles(fileList) {
  for (const file of fileList) {
    const text = await file.text();
    let json;
    try { json = JSON.parse(text); }
    catch (e) { setStatus(`❌ ${file.name}: geen geldige JSON`); continue; }

    const langGuess =
      (json.lang || '') ||
      file.name.replace(/\.[^.]+$/, '').toLowerCase(); // filename as lang key

    const data = normalizeImported(json);
    DB.langs.set(langGuess, { lang: langGuess, ...data });
    DB.active = DB.active || langGuess;
    setStatus(`✅ Geïmporteerd: ${file.name} → taal "${langGuess}" (${data.messages.length} messages)`);
  }
  saveLocal();
  renderAll();
}

function exportActive() {
  const data = currentLangData();
  if (!data) { setStatus('Geen actieve taal.'); return; }

  // Clean clone
  const out = {
    sentiments: (data.sentiments || []).map(s => ({ id: s.id, label: s.label, emoji: s.emoji })),
    messages: (data.messages || []).map(m => ({
      id: m.id, icon: m.icon, text: m.text, sentiment: m.sentiment,
      ...(m.tags && m.tags.length ? { tags: m.tags } : {})
    }))
  };

  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `messages_${data.lang || 'lang'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setStatus(`⬇️ Geëxporteerd: messages_${data.lang}.json`);
}

/* ==========
   Actions
   ========== */
function addLanguage() {
  const key = prompt('Nieuwe taalcode (bijv. nl, en, pap):', '');
  if (!key) return;
  const lang = key.trim().toLowerCase();
  if (!lang) return;
  if (DB.langs.has(lang)) { alert('Taal bestaat al.'); return; }
  DB.langs.set(lang, { lang, messages: [], sentiments: [] });
  DB.active = lang;
  saveLocal();
  renderAll();
}

function addMessage() {
  const data = currentLangData(); if (!data) return;
  const row = { id: uid(), icon: '', text: '', sentiment: '', tags: [] };
  data.messages.unshift(row);
  saveLocal();
  renderMessages();
}

function deleteSelectedMessages() {
  const data = currentLangData(); if (!data) return;
  const ids = [...els.msgTableBody.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.dataset.id);
  if (!ids.length) return;
  if (!confirm(`Verwijder ${ids.length} message(s)?`)) return;
  data.messages = data.messages.filter(m => !ids.includes(m.id));
  saveLocal();
  renderMessages();
  els.checkAll.checked = false;
}

function addSentiment() {
  const data = currentLangData(); if (!data) return;
  ensureSentiments(data);
  data.sentiments.unshift({ id: 'nieuw', label: 'Nieuw', emoji: '✨' });
  saveLocal();
  renderSentiments();
}

function deleteSelectedSentiments() {
  const data = currentLangData(); if (!data) return;
  ensureSentiments(data);
  const ids = [...els.sentTableBody.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.dataset.id);
  if (!ids.length) return;
  // Waarschuwing: verwijdering kan messages "orphans" geven
  if (!confirm(`Verwijder ${ids.length} sentiment(en)? Messages die dit sentiment gebruiken krijgen een lege waarde.`)) return;
  data.sentiments = data.sentiments.filter(s => !ids.includes(s.id));
  // maak orphan sentiments leeg in messages
  const setIds = new Set(data.sentiments.map(s => s.id));
  data.messages.forEach(m => { if (m.sentiment && !setIds.has(m.sentiment)) m.sentiment = ''; });
  saveLocal();
  renderAll();
  els.checkAllSent.checked = false;
}

/* ==========
   Events
   ========== */
function bindEvents() {
  els.fileInput.addEventListener('change', e => {
    const files = e.target.files;
    if (files && files.length) importFiles(files);
    els.fileInput.value = '';
  });
  els.addLangBtn.addEventListener('click', addLanguage);
  els.exportBtn.addEventListener('click', exportActive);

  els.addMsgBtn.addEventListener('click', addMessage);
  els.delMsgBtn.addEventListener('click', deleteSelectedMessages);
  els.addSentBtn.addEventListener('click', addSentiment);
  els.delSentBtn.addEventListener('click', deleteSelectedSentiments);

  els.checkAll.addEventListener('change', () => {
    els.msgTableBody.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = els.checkAll.checked);
  });
  els.checkAllSent.addEventListener('change', () => {
    els.sentTableBody.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = els.checkAllSent.checked);
  });

  els.searchBox.addEventListener('input', () => renderMessages());
}

/* ==========
   Init
   ========== */
(function init() {
  loadLocal();
  bindEvents();
  renderAll();
  setStatus('Klaar. Importeer één of meer JSON-bestanden om te beginnen.');
})();