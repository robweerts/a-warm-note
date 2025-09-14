/* =============================================================================
   a warm note — script.js (NL-only)
   ---------------------------------------------------------------------------
   Sectie-index (patch-handles):
   [A] CONFIG & CONSTANTEN
   [A+] THEME DETECT & KLEUREN
   [B] DOM CACHE & HELPERS
   [C] APP-STATE
   [D] INIT (lifecycle)
   [E] DATA-LADEN (messages.nl.json + fallback)
   [F] SENTIMENT-CHIPS (max 10)  ← patch hier voor chip-UX
   [G] DECK & RANDOMISATIE       ← patch hier voor random/gewichten
   [H] RENDERING (note & to/from)
   [I] COMPOSE (inputs Voor/Van)
   [J] COACH (microcopy)
   [K] SHARE-SHEET (WA/E-mail/Download/Kopieer/Native)
   [L] CONFETTI & TOASTS
   [M] UTILITIES (URL, shuffle, etc.)
   [N] ABOUT-DIALOOG
============================================================================= */

/* [A] CONFIG & CONSTANTEN --------------------------------------------------- */
const NL_ONLY_MODE       = true;
const CONFETTI_ENABLED   = true;
const IS_FILE            = (location.protocol === "file:");
const RECENT_LIMIT       = 5;
const PAPER_COLORS       = ["#FFE66D","#FFD3B6","#C5FAD5","#CDE7FF","#FFECB3","#E1F5FE"];
const MESSAGES_JSON_PATH = "messages.nl.json"; // optioneel; werkt ook zonder
const MOTION = (new URLSearchParams(location.search).get('motion') || 'subtle').toLowerCase(); // 'subtle' | 'normal'
document.documentElement.setAttribute("lang","nl");

/* [A+] THEME DETECT & KLEUREN ---------------------------------------------- */
const THEME = { NONE:'none', VALENTINE:'valentine', NEWYEAR:'newyear', EASTER:'easter' };

function getActiveTheme(now = new Date()){
  const qp = new URLSearchParams(location.search);
  const t = (qp.get('theme')||'').toLowerCase();
  if (t === 'valentine') return THEME.VALENTINE;
  if (t === 'newyear')   return THEME.NEWYEAR;
  if (t === 'easter')    return THEME.EASTER;
  if (t === 'none')      return THEME.NONE;

  const m = now.getMonth()+1, d = now.getDate();
  if (m===2 && d===14) return THEME.VALENTINE;            // 14 feb
  if ((m===12 && d===31) || (m===1 && d===1)) return THEME.NEWYEAR; // 31 dec / 1 jan
  const easter = computeEaster(now.getFullYear());
  if (sameYMD(now, easter)) return THEME.EASTER;
  return THEME.NONE;
}
function computeEaster(y){
  const f=Math.floor,a=y%19,b=f(y/100),c=y%100,d=f(b/4),e=b%4,g=f((8*b+13)/25),
        h=(19*a+b-d-g+15)%30,i=f(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=f((a+11*h+22*l)/451),
        month=f((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(y,month-1,day);
}
function sameYMD(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function themeColors(theme){
  switch(theme){
    case THEME.VALENTINE: return ['#F06292','#EC407A','#FF8A80','#F48FB1','#FFCDD2'];
    case THEME.NEWYEAR:   return ['#FFD700','#FFA000','#FFC400','#FFEA00','#FDD835'];
    case THEME.EASTER:    return ['#FFECB3','#C5E1A5','#B2DFDB','#F8BBD0','#D1C4E9'];
    default:              return ['#FFD166','#06D6A0','#118AB2','#EF476F','#F78C6B'];
  }
}

/* [B] DOM CACHE & HELPERS --------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const els = {
  note: $("note"),
  msg: $("message"),
  icon: $("iconline"),
  toLine: $("toline"),
  fromLine: $("fromline"),
  chipRow: $("chip-row"),
  btnNew: $("btn-new"),
  btnShare: $("btn-share"),
  btnAbout: $("btn-about"),
  coach: $("coach-tip"),
  toast: $("toast"),
  sheet: $("sheet-backdrop"),
  about: $("about-backdrop"),
  aboutClose: $("about-close"),
  toInput: $("to-inline"),
  fromInput: $("from-inline"),
  fromSymbol: $("from-symbol"),
  sheetClose: $("sheet-backdrop")?.querySelector(".sheet-close"),
  coachClose: $("coach-tip")?.querySelector(".coach-close"),
  pairToVal: $("pair-to-val"),
  pairFromVal: $("pair-from-val"),
  shareCopy: $("share-copy"),
  shareWA: $("share-whatsapp"),
  shareMail: $("share-email"),
  shareDL: $("share-download"),
  shareConfirm: $("share-confirm"),
};

/* [C] APP-STATE ------------------------------------------------------------- */
const STATE = {
  lang: "nl",
  allMessages: [],       // volledige lijst (uit JSON of fallback)
  sentiments: [],        // unieke sentiments (max 10)
  activeSentiment: null, // huidig filter; null = alles
  filterSpecialDay: null,
  deck: [],              // indices in random volgorde
  recent: [],            // laatste N indices om herhaling te voorkomen
  currentIdx: null       // huidig absolute index in allMessages
};

/* [D] INIT (lifecycle) ------------------------------------------------------ */

console.log("script is geladen");

function init() {
  console.log("init wordt aangeroepen");
  wireGlobalUI(); 
  loadMessages()
    .then(() => {
      console.log("messages loaded");
      buildSentimentChips();
      console.log("sentiment chips built");
      rebuildDeck(true);
      console.log("deck rebuilt");

      // Vul 'to' en 'from' vanuit URL (indien aanwezig)
      const qp = new URLSearchParams(location.search);
      const toVal = qp.get('to');
      const fromVal = qp.get('from');
      console.log("URL params:", { toVal, fromVal });
      if (toVal && els.toInput) els.toInput.value = toVal;
      if (fromVal && els.fromInput) els.fromInput.value = fromVal;

      if (!showWelcomeNoteOnce()) {
        const sharedMid = qp.get('mid');
        console.log("mid param:", sharedMid);
        if (sharedMid) {
          const idx = STATE.allMessages.findIndex(m => m.id === sharedMid);
          console.log("mid idx:", idx);
          if (idx !== -1) {
            renderMessage({ requestedIdx: idx, wiggle: false });
          } else {
            renderMessage({ newRandom: true, wiggle: false });
          }
        } else {
          renderMessage({ newRandom: true, wiggle: false });
        }
      }
      updateCoach(currentCoachState());
      console.log("init finished");
    })
    .catch((e) => {
      console.error("FOUT in init():", e);
    });
}
init();

// Eénmalige sentiment-hint nudge (alleen bij eerste load)
if (!localStorage.getItem("awarm_sentiment_hint")) {
  const strip = document.querySelector(".sentiment-strip");
  if (strip) {
    strip.classList.add("hint-active");
    setTimeout(()=> strip.classList.remove("hint-active"), 3000);
  }
  try { localStorage.setItem("awarm_sentiment_hint","1"); } catch {}
}

/* [E] DATA-LADEN (messages.nl.json + fallback) ------------------------------ */
async function loadMessages(){
  if (IS_FILE) {
    STATE.allMessages = fallbackMessages();
    STATE.sentiments  = deriveSentiments(STATE.allMessages);
    return;
  }
  try{
    const res = await fetch(MESSAGES_JSON_PATH, { cache:"no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const list = Array.isArray(data?.messages) ? data.messages : [];
STATE.allMessages = list.map(m => ({
  id: m.id || null, // <-- Add this line to store the id!
  icon: m.icon || "",
  text: String(m.text || ""),
  sentiments: Array.isArray(m.sentiments) ? m.sentiments : [],
  special_day: m.special_day || null,
  weight: Number.isFinite(m.weight) ? m.weight : 1
}));
    const s = Array.isArray(data?.sentiments) ? data.sentiments : deriveSentiments(STATE.allMessages);
    STATE.sentiments = (s || []).slice(0,10);
    if (!STATE.allMessages.length) {
      STATE.allMessages = fallbackMessages();
      STATE.sentiments  = deriveSentiments(STATE.allMessages);
    }
  }catch(e){
    STATE.allMessages = fallbackMessages();
    STATE.sentiments  = deriveSentiments(STATE.allMessages);
  }
}

function fallbackMessages(){
  return [
    { id: "fallback_001", icon:"✨", text:"Je bent genoeg, precies zoals je nu bent.",            sentiments:["bemoedigend","kalmte"],  weight:1 },
    { id: "fallback_002",icon:"🌿", text:"Een kleine stap vooruit is óók vooruitgang.",          sentiments:["doorzetten","bemoedigend"], weight:1 },
    { id: "fallback_003",icon:"💛", text:"Iets kleins kan vandaag veel betekenen.",              sentiments:["liefde","kalmte"],        weight:1 },
    { id: "fallback_004",icon:"🌊", text:"Adem in. Adem uit. Je bent hier.",                     sentiments:["kalmte"],                 weight:1 },
    { id: "fallback_005",icon:"🌻", text:"Je doet ertoe, meer dan je denkt.",                    sentiments:["bemoedigend","trots"],    weight:1 },
    { id: "fallback_006",icon:"🎈", text:"Licht en zacht: één vriendelijk gebaar.",              sentiments:["vriendschap","liefde"],   weight:1 },
    { id: "fallback_007",icon:"🧩", text:"Niet alles hoeft nu te passen.",                       sentiments:["troost","kalmte"],        weight:1 },
    { id: "fallback_008",icon:"📯", text:"Trots op wat je (al) doet.",                           sentiments:["trots","bemoedigend"],    weight:1 },
    { id: "fallback_009",icon:"🎉", text:"Je mag dit vieren — hoe klein ook.",                   sentiments:["succes","liefde"],        weight:1 },
    { id: "fallback_010",icon:"☕", text:"Neem je tijd. Je mag traag beginnen.",                 sentiments:["kalmte"],                 weight:1 }
  ];
}


/* [F] SENTIMENT-CHIPS (max 10) --------------------------------------------- */
function buildSentimentChips(){
  const row = els.chipRow;
  if (!row) return;
  row.innerHTML = "";

  // ⟵ VERVANG label door klikbare thema-chip (indien actief thema)
  const activeTheme = getActiveTheme();
  if (activeTheme === THEME.VALENTINE) {
    row.appendChild(makeThemeChip('valentine', 'Valentijn ❤️'));
  } else if (activeTheme === THEME.NEWYEAR) {
    row.appendChild(makeThemeChip('newyear', 'Nieuwjaar ✨'));
  } else if (activeTheme === THEME.EASTER) {
    row.appendChild(makeThemeChip('easter', 'Pasen 🐣'));
  }

  // “Alles” chip
  row.appendChild(makeChip(null, "Alles"));

  // Data-gedreven chips (max 10)
  (STATE.sentiments || []).slice(0,10).forEach(tag => {
    row.appendChild(makeChip(tag, capitalize(tag)));
  });

  // Standaard: alles actief
  setActiveFilter({ sentiment: null, special: null });

  // Affordance
  setupChipsAffordance();
  showChipsHintOnce();
}

function makeThemeChip(specialKey, label){
  const b = document.createElement("button");
  b.className = "chip chip--theme";
  b.type = "button";
  b.setAttribute("role","tab");
  b.dataset.type = "special";
  b.dataset.value = specialKey;
  b.textContent = label;
  b.onclick = () => {
    setActiveFilter({ sentiment: null, special: specialKey });
    scrollChipIntoCenter(b);
  };
  return b;
}

function setActiveFilter({ sentiment=null, special=null }){
  STATE.activeSentiment = sentiment;
  STATE.filterSpecialDay = special;

  // visueel actief
  const row = els.chipRow; if (row){
    [...row.querySelectorAll(".chip")].forEach(c=>{
      const isActive = (c.dataset.type==="special" && c.dataset.value===special) ||
                       ((c.dataset.type||"sentiment")==="sentiment" && (c.dataset.value||"") === (sentiment||""));
      c.classList.toggle("active", !!isActive);
    });
  }

  rebuildDeck(true);                         // [G]
  renderMessage({ newRandom:true, wiggle:true }); // [H]
}


function makeChip(value, label){
  const b = document.createElement("button");
  b.className = "chip";
  b.type = "button";
  b.setAttribute("role","tab");
  b.dataset.value = value || "";
  b.textContent = label;
  b.onclick = () => {
    STATE.activeSentiment = value;
    activateChip(value);
    rebuildDeck(true);                         // [G]
    renderMessage({ newRandom:true, wiggle:true }); // [H]
    // Auto-center de gekozen chip
    scrollChipIntoCenter(b);
  };
  return b;
}

function activateChip(value){
  const row = els.chipRow; if (!row) return;
  [...row.querySelectorAll(".chip")].forEach(c=>{
    const v = c.dataset.value || null;
    c.classList.toggle("active", v === (value||""));
  });
}

/* -------- Affordance helpers (chevrons, hint, autocenter) -------- */
function setupChipsAffordance(){
  const wrap = document.querySelector(".chips-wrap");
  const row  = els.chipRow;
  if (!wrap || !row) return;

  let left = wrap.querySelector("#chips-left");
  let right = wrap.querySelector("#chips-right");
  if (!left) {
    left = document.createElement("button");
    left.id = "chips-left";
    left.className = "chip-chevron chip-chevron--left";
    left.setAttribute("aria-label","Meer opties naar links");
    left.innerHTML = "‹";
    wrap.appendChild(left);
  }
  if (!right) {
    right = document.createElement("button");
    right.id = "chips-right";
    right.className = "chip-chevron chip-chevron--right";
    right.setAttribute("aria-label","Meer opties naar rechts");
    right.innerHTML = "›";
    wrap.appendChild(right);
  }

  left.onclick = ()=> row.scrollBy({ left: -Math.max(120, row.clientWidth*0.6), behavior: "smooth" });
  right.onclick= ()=> row.scrollBy({ left:  Math.max(120, row.clientWidth*0.6), behavior: "smooth" });

  const updateChevrons = ()=>{
    const hasOverflow = row.scrollWidth > row.clientWidth + 4;
    // toggle container class → CSS geeft extra ruimte rechts vrij
    wrap.classList.toggle("has-chevrons", hasOverflow);

    if (!hasOverflow){
      left.style.display = "none";
      right.style.display = "none";
      return;
    }
    left.style.display  = row.scrollLeft > 6 ? "grid" : "none";
    right.style.display = (row.scrollLeft + row.clientWidth) < (row.scrollWidth - 6) ? "grid" : "none";
  };

  row.addEventListener("scroll", throttle(updateChevrons, 80));
  window.addEventListener("resize", throttle(updateChevrons, 120));
  setTimeout(updateChevrons, 0);
}

function scrollChipIntoCenter(chipEl){
  const row = els.chipRow; if (!row || !chipEl) return;
  const rowRect = row.getBoundingClientRect();
  const chipRect = chipEl.getBoundingClientRect();
  const delta = (chipRect.left + chipRect.width/2) - (rowRect.left + rowRect.width/2);
  row.scrollBy({ left: delta, behavior: "smooth" });
}

function showChipsHintOnce(){
  try{
    if (sessionStorage.getItem("chipsHintShown")==="1") return;
    const row = els.chipRow; if (!row) return;
    // Mini “nudge”: heel klein auto-scrolltje en coach-tekst update
    const orig = row.scrollLeft;
    row.scrollTo({ left: Math.min(orig + 36, row.scrollWidth), behavior: "smooth" });
    setTimeout(()=> row.scrollTo({ left: orig, behavior: "smooth" }), 380);
    // Coach aanvullen
    if (els.coach){
      const txt = els.coach.querySelector(".coach-text");
      if (txt && !getTo()) txt.textContent = "Swipe door de gevoelens en kies wat past.";
      els.coach.classList.remove("hidden");
    }
    sessionStorage.setItem("chipsHintShown","1");
  }catch(_e){}
}

function deriveSentiments(items){
  const set = new Set();
  (items||[]).forEach(m => (m.sentiments||[]).forEach(s => set.add(s)));
  return Array.from(set).slice(0,10);
}


/* [G] DECK & RANDOMISATIE --------------------------------------------------- */
function rebuildDeck(resetRecent=false){
  const activeTheme = getActiveTheme();

  const pool = (STATE.allMessages||[]).map((m,idx)=>({m,idx})).filter(({m})=>{
    // 1) filter op special day (als gekozen)
    if (STATE.filterSpecialDay && m.special_day !== STATE.filterSpecialDay) return false;
    // 2) filter op sentiment (als gekozen)
    if (STATE.activeSentiment && !(Array.isArray(m.sentiments) && m.sentiments.includes(STATE.activeSentiment))) return false;
    return true;
  });

  const source = pool.length ? pool : (STATE.allMessages||[]).map((m,idx)=>({m,idx}));

  // Gewichten + theme-boost (x3) bij special_day match
  const weighted = source.flatMap(({m,idx})=>{
    const base = Math.max(1, Number(m.weight)||1);
    const themed =
      (activeTheme===THEME.VALENTINE && m.special_day==='valentine') ||
      (activeTheme===THEME.NEWYEAR   && m.special_day==='newyear')   ||
      (activeTheme===THEME.EASTER    && m.special_day==='easter');
    const w = base * (themed ? 3 : 1);
    return Array.from({length:w}, ()=>idx);
  });

  STATE.deck = shuffle(weighted);
  if (resetRecent) STATE.recent.length = 0;
}
function nextIndex(){
  if (!STATE.deck.length) rebuildDeck();
  let tries = STATE.deck.length;
  while (tries--){
    const candidate = STATE.deck.pop();
    if (!STATE.recent.includes(candidate)) return candidate;
  }
  STATE.recent.length = 0;
  return STATE.deck.pop();
}
function bumpRecent(idx){
  STATE.recent.push(idx);
  if (STATE.recent.length > RECENT_LIMIT) STATE.recent.shift();
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]; } return a; }

/* [H] RENDERING (note & to/from) ------------------------------------------- */
const PAPER_PALETTES = {
  default: ["#FFE66D","#FFD3B6","#C5FAD5","#CDE7FF","#FFECB3","#E1F5FE"],
  valentine: ["#FFF0F4","#FFE0E8","#FFD6E2","#FFEAF0","#FFF5F8"]
};

// [H] vervang setPaperLook() door:
function setPaperLook(){
  const theme = getActiveTheme();
  const palette = (theme===THEME.VALENTINE) ? PAPER_PALETTES.valentine : PAPER_PALETTES.default;
  els.note.style.background = palette[Math.floor(Math.random()*palette.length)];
  els.note.style.transform  = `rotate(${(Math.random()*4-2).toFixed(2)}deg)`;
}

function renderMessage({ newRandom=false, requestedIdx=null, wiggle=false } = {}){
  let idx = STATE.currentIdx;

  if (requestedIdx != null) {
    idx = requestedIdx;
  } else if (newRandom || idx == null) {
    idx = nextIndex();
  }
  if (idx == null || idx < 0 || idx >= STATE.allMessages.length) {
    els.msg.textContent  = "Stuur een warme boodschap naar iemand.";
    els.icon.textContent = "💌";
    setPaperLook();
    return;
  }

  STATE.currentIdx = idx;
  bumpRecent(idx);

  const { icon, text, sentiments } = STATE.allMessages[idx]; // ← voeg 'sentiments' toe

  els.msg.style.opacity = 0; els.icon.style.opacity = 0;
  setTimeout(()=>{
    els.msg.textContent  = personalize(text);
    els.icon.textContent = icon || "";
    els.msg.style.opacity = 1; els.icon.style.opacity = 1;
  }, 90);

  setPaperLook();
  renderToFrom();
  renderFromSymbol((sentiments && sentiments[0]) || STATE.activeSentiment || null);

  if (wiggle && !prefersReducedMotion()){
    els.note.animate(
      [
        { transform: 'rotate(-2deg)' },
        { transform: 'rotate(2deg)'  },
        { transform: 'rotate(-1.2deg)'}
      ],
      { duration: 350, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
  }
}
function renderToFrom(){
  const t = toLabel(getTo());
  const f = fromLabel(getFrom());
  els.toLine.textContent   = t; els.toLine.style.display   = t ? "block":"none";
  els.fromLine.textContent = f; els.fromLine.style.display = f ? "block":"none";
}

/* Swipe op de note voor volgende boodschap (mobile friendly) */
(function enableNoteSwipe(){
  const el = els.note; if (!el) return;
  let startX=0, startY=0, dx=0, dy=0, active=false;

  el.addEventListener("touchstart", (e)=>{
    if (!e.touches || e.touches.length!==1) return;
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY; dx=dy=0; active = true;
  }, {passive:true});

  el.addEventListener("touchmove", (e)=>{
    if (!active || !e.touches || e.touches.length!==1) return;
    const t = e.touches[0];
    dx = t.clientX - startX;
    dy = t.clientY - startY;
    // annuleer als verticaal dominant is
    if (Math.abs(dy) > Math.abs(dx) + 10) active = false;
  }, {passive:true});

  el.addEventListener("touchend", ()=>{
    if (!active) return;
    active = false;
    // alleen next bij duidelijke horizontale swipe
    if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
      renderMessage({ newRandom:true, wiggle:false });
    }
  }, {passive:true});
})();

// === Welkomstnote (éénmalig per sessie; ?welcome forceert) ================
function showWelcomeNoteOnce(){
  try{
    const qp = new URLSearchParams(location.search);
    const force = qp.has('welcome');          // test: ?welcome
    const seen  = sessionStorage.getItem('awn_welcome_shown') === '1';
    if (seen && !force) return false;

    // Note invullen met instructie
    if (els.msg)  els.msg.textContent  = "Welkom! Kies een gevoel hierboven, vul ‘Voor wie?’ in en klik op ‘Verstuur’.";
    if (els.icon) els.icon.textContent = "💛";

    // Subtiele paper-look + to/from labels updaten
    if (typeof setPaperLook === 'function') setPaperLook();
    if (typeof renderToFrom === 'function') renderToFrom();

    // Optioneel: visuele tag
    if (els.note) els.note.classList.add("note--welcome");

    // Coach terug naar init (korte guidance)
    if (typeof updateCoach === 'function') updateCoach('init');

    sessionStorage.setItem('awn_welcome_shown','1');
    return true;
  }catch(_e){
    return false;
  }
}

/* [I] COMPOSE (inputs Voor/Van) -------------------------------------------- */
function onComposeEdit(){
  renderToFrom();
  updateCoach(currentCoachState());
  renderShareSheetPairsInline();
}

/* [J] COACH (microcopy) ----------------------------------------------------- */
function currentCoachState(){ return getTo() ? "toFilled" : "init"; }
function updateCoach(state){
  if (!els.coach) return;
  const theme = getActiveTheme();
  const themedInit = (theme===THEME.VALENTINE) ? "Fijne Valentijn 💛 Kies een gevoel en verstuur je note." :
                     (theme===THEME.NEWYEAR)   ? "Nieuw begin ✨ Kies een gevoel en verstuur je note." :
                     (theme===THEME.EASTER)    ? "Zacht begin 🐣 Kies een gevoel en verstuur je note." : null;

  const copy = {
    init: themedInit || "Kies een gevoel en verstuur je note.",
    toFilled: "Mooi! Klik ‘Verstuur’ om je boodschap te delen.",
    shared: "Je boodschap is verstuurd 💛 Nog eentje maken?"
  };

  const txt = copy[state] || copy.init;
  els.coach.querySelector(".coach-text").textContent = txt;
  els.coach.classList.remove("hidden");
}

/* [K] SHARE-SHEET (WA/E-mail/Download/Kopieer/Native) ---------------------- */
function openShareSheet(){
  renderShareSheetPairsInline();
  if (!els.sheet) return;
  els.sheet.classList.remove("hidden");
  els.sheet.setAttribute("aria-hidden","false");
}
function closeShareSheet(){
  if (!els.sheet) return;
  els.sheet.classList.add("hidden");
  els.sheet.setAttribute("aria-hidden","true");
}
function renderShareSheetPairsInline(){
  els.pairToVal  && (els.pairToVal.textContent   = toLabel(getTo())     || "—");
  els.pairFromVal&& (els.pairFromVal.textContent = fromLabel(getFrom()) || "—");
}
async function onCopyLink(){
  const url = buildSharedURL().toString();
  try { await navigator.clipboard.writeText(url); }
  catch { prompt("Kopieer link", url); }
  showToast("Link gekopieerd 📋");
  closeShareSheet();
}
function onShareWhatsApp(){
  const url = buildSharedURL().toString();
  if (typeof window.shareByWhatsApp === "function") {
    window.shareByWhatsApp({ lang:"nl", toName:getTo(), permalink:url });
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(`Voor ${getTo()||"jou"} — omdat jij belangrijk voor me bent. 💛 ${url}`)}`,"_blank","noopener");
  }
  showToast("WhatsApp geopend 📲");
  celebrate();
  closeShareSheet();
  afterShareSuccess();
}
function onShareEmail(){
  const url = buildSharedURL().toString();
  const noteText = els.msg.textContent || "";
  if (typeof window.shareByEmail === "function") {
    window.shareByEmail({ lang:"nl", toName:getTo(), fromName:getFrom(), noteText, permalink:url });
  } else {
    const subject = encodeURIComponent(getTo() ? `Een warme note voor ${getTo()}` : `Een warme note voor jou`);
    const body = encodeURIComponent(`${getTo()?`Voor ${getTo()},\n\n`:""}${noteText}\n\n${getFrom()?`— van ${getFrom()}`:""}\n\nBekijk de note: ${url}`);
    location.href = `mailto:?subject=${subject}&body=${body}`;
  }
  showToast("E-mail geopend ✉️");
  celebrate();
  closeShareSheet();
  afterShareSuccess();
}
function onDownload(){
  if (typeof window.downloadNoteAsImage === "function") {
    window.downloadNoteAsImage(
      els.note, els.msg, els.icon, "nl",
      (_l,n)=> n?`voor ${n}`:"",
      (_l,n)=> n?`— van ${n}`:"",
      getTo, getFrom
    );
    showToast("Afbeelding wordt opgeslagen ⬇️");
    celebrate();
  } else {
    showToast("Download niet beschikbaar");
  }
  closeShareSheet();
  afterShareSuccess();
}
async function onNativeShare(){
  const shareURL = buildSharedURL().toString();
  if (navigator.share) {
    try {
      await navigator.share({ title:"a warm note", text:"Een warm bericht voor jou 💛", url:shareURL });
      showToast("Gedeeld 💛");
      celebrate();
    } catch {
      showToast("Delen geannuleerd");
    }
  } else {
    await onCopyLink();
  }
  closeShareSheet();
}
function onShareMessenger(){
  const pageUser = "awarmnote"; // <--- vervang door jouw Facebook Page username
  const url = buildSharedURL().toString();
  const ref = encodeURIComponent(url);
  window.open(`https://m.me/${pageUser}?ref=${ref}`, "_blank", "noopener");
  showToast("Messenger geopend 💬");
  celebrate();
  closeShareSheet();
  afterShareSuccess();
}

// NIEUW: na succesvolle share → viering + coach-tekst "shared"
function afterShareSuccess(){
  celebrate();
  updateCoach('shared'); // "Je boodschap is verstuurd 💛 Nog eentje maken?"
}


/* [L] CONFETTI & TOASTS ----------------------------------------------------- */

function celebrate(){
  const qp = new URLSearchParams(location.search);
  const debugForce = qp.get('debug_confetti') === '1';  // ?debug_confetti=1
  if (!CONFETTI_ENABLED) return;
  if (!debugForce && prefersReducedMotion()) return;    // respecteer user setting, tenzij debug

  const colors = themeColors(getActiveTheme());
  const layer = document.body;
  const n = 12 + Math.floor(Math.random()*6);
  for (let i=0;i<n;i++){
    const piece = document.createElement("div");
    piece.className = "confetti";
    piece.style.left = Math.random()*100 + "vw";
    piece.style.background = colors[i%colors.length];
    piece.style.transform = `rotate(${Math.random()*360}deg)`;
    piece.style.animationDuration = (0.9 + Math.random()*0.6) + "s";
    piece.style.animationDelay = (Math.random()*0.1) + "s";
    layer.appendChild(piece);
    setTimeout(()=> piece.remove(), 3600);
  }
  const live = $("confetti-layer");
  if (live) live.textContent = "Viering: note verstuurd.";
}
function showToast(msg){
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast.__t);
  showToast.__t = setTimeout(()=> els.toast.classList.add("hidden"), 3600);
}

/* [M] UTILITIES (URL, shuffle, etc.) --------------------------------------- */
function getTo(){   return (els.toInput?.value || "").trim(); }
function getFrom(){ return (els.fromInput?.value || "").trim(); }

function toLabel(name){   return name ? `voor ${name}` : ""; }
function fromLabel(name){ return name ? `— van ${name}` : ""; }

function personalize(text){
  const to = getTo();
  const hasToken = typeof text === "string" && text.includes("{{name}}");

  if (hasToken) {
    // Met naam → vervang token
    if (to) return text.replaceAll("{{name}}", to);
    // Zonder naam → beleefde fallback i.p.v. rauw token
    return text.replaceAll("{{name}}", "jou");
  }

  // Geen token in de tekst
  if (!to) return text;

  // Subtiele personalisatie zonder token (kleine kans)
  return Math.random() < 0.34
    ? `Voor ${to}, ` + lowerFirst(text)
    : text;
}

function lowerFirst(s){ return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
function prefersReducedMotion(){
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function buildSharedURL(){
  const u = new URL(location.href);
  const to = getTo(), from = getFrom();
  to ? u.searchParams.set("to", to) : u.searchParams.delete("to");
  from ? u.searchParams.set("from", from) : u.searchParams.delete("from");
  u.searchParams.set("lang","nl");

  // Add this block:
  const idx = STATE.currentIdx;
  if (
    idx != null &&
    STATE.allMessages[idx] &&
    STATE.allMessages[idx].id
  ) {
    u.searchParams.set("mid", STATE.allMessages[idx].id);
  }

  return u;
}
function capitalize(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function throttle(fn, wait){
  let t=0, lastArgs=null;
  return function throttled(...args){
    lastArgs = args;
    if (t) return;
    t = setTimeout(()=>{ t=0; fn.apply(null, lastArgs); lastArgs=null; }, wait);
  };
}

/* Handgetekend symbool naast '— van …' op basis van sentiment */
function renderFromSymbol(sent){
  const host = els.fromSymbol;
  if (!host) return;

  // Alleen tonen als er een 'van' is ingevuld
  if (!getFrom()){
    host.innerHTML = "";
    return;
  }

  // Map sentiment → eenvoudige, handgetekende SVG
  const svg = (key)=>{
    switch(key){
      case "liefde":       // hartje
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20s-7-4.5-9-8.2C1.7 9.5 3.3 6.8 6.2 6.5c1.6-.1 3 .6 3.8 1.8.8-1.2 2.2-1.9 3.8-1.8 2.9.3 4.5 3.1 3.2 5.3C19 15.5 12 20 12 20z"/>
        </svg>`;
      case "humor":       // knipogende emoticon ; )
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12c0 3.9 3.1 7 7 7s7-3.1 7-7"/>
          <path d="M9 10h.01M15 10c.6-.4 1.2-.8 2-1"/>
          <path d="M8 15c1 .8 2.2 1.2 4 1.2s3-.4 4-1.2"/>
        </svg>`;
      case "vriendschap": // twee simpele overlappende boogjes (verbondenheid)
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 14c0-2.5 2-4.5 4.5-4.5S15 11.5 15 14"/>
          <path d="M9 14c0-2.5 2-4.5 4.5-4.5S18 11.5 18 14"/>
        </svg>`;
      case "succes":      // sterretje
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l2.2 4.6 5.1.7-3.7 3.6.9 5.1-4.5-2.4-4.5 2.4.9-5.1L4.7 8.3l5.1-.7L12 3z"/>
        </svg>`;
      case "doorzetten":  // pijl vooruit
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12h12"/><path d="M12 6l6 6-6 6"/>
        </svg>`;
      case "kalmte":      // bladje
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 15c6 2 10-2 14-10-2 8-6 12-14 10z"/>
          <path d="M8 13c1.2-.2 2.4-.8 3.6-1.9"/>
        </svg>`;
      case "troost":      // druppel
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4c2 3 5 6 5 9a5 5 0 1 1-10 0c0-3 3-6 5-9z"/>
        </svg>`;
      case "trots":       // medaille
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="10" r="4"/>
          <path d="M9 14l-2 6 5-3 5 3-2-6"/>
        </svg>`;
      case "dankbaar":    // klein sprankeltje
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v4M12 16v4M4 12h4M16 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>
        </svg>`;
      case "bemoedigend": // duim (geabstraheerd)
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 11v7H4v-7h3z"/>
          <path d="M7 11l5-6c.9-1.1 2.5-.2 2.2 1l-.8 5.1H20c1.1 0 2 .9 2 2 0 .3-.1.7-.3 1l-2.2 3.5c-.4.7-1.1 1.1-1.9 1.1H7"/>
        </svg>`;
      default:
        return ""; // geen symbool
    }
  };

  // Kies symbool: voorkeur current sentiment; anders niets
  const g = String(sent || "").toLowerCase();
  const markup = svg(g);
  host.innerHTML = markup || "";
}

/* [N] ABOUT-DIALOOG --------------------------------------------------------- */
function openAbout(){
  if (!els.about) return;
  els.about.classList.remove("hidden");
  els.about.setAttribute("aria-hidden","false");
  els.about.onclick = (e)=>{ if (e.target === els.about) closeAbout(); };
}
function closeAbout(){
  if (!els.about) return;
  els.about.classList.add("hidden");
  els.about.setAttribute("aria-hidden","true");
}


/* — Event-wiring (null-safe) ----------------------------------------------- */

function guardShareOrNudge(){
  const to = getTo();
  if (!to) {
    // Warme, duidelijke hint
    showToast("Vul eerst in voor wie dit is 💛");
    try {
      els.toInput.classList.add("field-nudge");
      els.toInput.focus();
      // korte nudge
      setTimeout(()=> els.toInput.classList.remove("field-nudge"), 600);
    } catch {}
    return; // STOP: sheet niet openen
  }
  // OK: mag delen
  openShareSheet();
}

function wireGlobalUI(){
  // Topbar
  els.btnNew   && els.btnNew.addEventListener("click", ()=>{ renderMessage({ newRandom:true, wiggle:true }); showToast("Nieuwe boodschap geladen ✨"); });
  els.btnShare && els.btnShare.addEventListener("click", guardShareOrNudge);
  els.btnAbout && els.btnAbout.addEventListener("click", openAbout);

  // Compose
  els.toInput   && els.toInput.addEventListener("input", onComposeEdit);
  els.fromInput && els.fromInput.addEventListener("input", onComposeEdit);

  // Share-sheet
  els.sheetClose   && els.sheetClose.addEventListener("click", closeShareSheet);
  els.shareCopy    && els.shareCopy.addEventListener("click", onCopyLink);
  els.shareWA      && els.shareWA.addEventListener("click", onShareWhatsApp);
  els.shareMail    && els.shareMail.addEventListener("click", onShareEmail);
  els.shareDL      && els.shareDL.addEventListener("click", onDownload);
  els.shareConfirm && els.shareConfirm.addEventListener("click", onNativeShare);
  els.shareMS = $("share-messenger");
  els.shareMS && els.shareMS.addEventListener("click", onShareMessenger);
  els.sheet && (els.sheet.onclick = (e)=>{ if (e.target === els.sheet) closeShareSheet(); });

  // About
  els.about?.querySelector(".sheet-close")?.addEventListener("click", closeAbout);
  els.aboutClose && els.aboutClose.addEventListener("click", closeAbout);

  // Coach close
  els.coachClose && els.coachClose.addEventListener("click", ()=> els.coach.classList.add("hidden"));
}

/* ========================================================================
   DEBUG HARNESS — NIET PRODUCTIE, HELPT ZIEN WAT ER WEL/NIET TRIGGERT
   - activeer via ?debug=1
   - forceert een lichte pop-in animatie op .note bij elke renderMessage
   - logt theme + motion
   ===================================================================== */
(function awnDebugHarness(){
  const qp = new URLSearchParams(location.search);
  const DEBUG = qp.has('debug');
  const log = (...args)=>{ if (DEBUG) console.log("[awn]", ...args); };

  // Thema + motion check
  try {
    const theme = (typeof getActiveTheme === 'function') ? getActiveTheme() : "unknown";
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    log("theme:", theme, "reducedMotion:", reduce);
  } catch(_) {}

  // Note pop-in bij elke renderMessage()
  try {
    const _render = window.renderMessage;
    if (typeof _render === "function") {
      window.renderMessage = function patchedRenderMessage(opts){
        log("renderMessage()", opts);
        const res = _render.apply(this, arguments);
        // Pop-in op .note
        const note = document.getElementById("note") || document.querySelector(".note");
        if (note) { note.classList.remove("anim-pop"); void note.offsetWidth; note.classList.add("anim-pop"); }
        return res;
      };
      log("hooked: renderMessage");
    } else {
      log("renderMessage NIET gevonden — dan weten we waar we moeten kijken.");
    }
  } catch(e) { log("hook error:", e); }

  // Optionele sparkle fallback na “verstuur” als confetti/motion uit staat
  window.__awnSparkle = function(){
    try{
      const el = document.createElement("div");
      el.className = "awn-sparkle";
      el.textContent = "✨ Verstuurd";
      document.body.appendChild(el);
      setTimeout(()=> el.remove(), 900);
    }catch(_){}
  };
})();