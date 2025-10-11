// /ai.js
// === [AI] Compose adapter — Cloudflare Worker koppeling (Stap 2) ============
// Modulepatroon houden we aan; init blijft licht.

(function(){
  const NS = {};
  NS.els   = { btn:null, status:null, textarea:null };
  NS.state = { busy:false, inFlight:null };

  // ---- i18n helpers ---------------------------------------------------------
  function tAi(key, fb){
    try { return (typeof t === 'function') ? t(key) : fb; } catch { return fb; }
  }
  function setBusy(on){
    NS.state.busy = !!on;
    if (NS.els.btn) NS.els.btn.disabled = !!on;
    if (NS.els.status){
      NS.els.status.textContent = on
        ? tAi('ai.status.generating', (window.STATE?.lang)==='en' ? 'Composing…' : 'Bezig met bedenken…')
        : tAi('ai.status.ready',      (window.STATE?.lang)==='en' ? 'Ready'      : 'Klaar');
    }
  }

  // ---- Config ---------------------------------------------------------------
  function aiBase(){
    // 1) Flag
    if (window.AWN_FLAGS?.ai?.base) return window.AWN_FLAGS.ai.base.replace(/\/+$/,'');
    // 2) Meta
    const m = document.querySelector('meta[name="awn:ai-base"]');
    if (m?.content) return m.content.replace(/\/+$/,'');
    // 3) Fallback (relative)
    return '/ai';
  }
  function aiTimeoutMs(){
    return window.AWN_FLAGS?.ai?.timeout ?? 20000;
  }

  // ---- Context uit je app ---------------------------------------------------
  function ctx(){
    const lang = (window.STATE?.lang) || (typeof resolveLang==='function' ? resolveLang() : 'nl');
    const to   = (typeof window.getTo   === 'function') ? window.getTo()   : '';
    const from = (typeof window.getFrom === 'function') ? window.getFrom() : '';
    // Toon: koppel aan actief sentiment (fallback "warm")
    const tone = window.STATE?.activeSentiment || 'warm';
    return { language: lang, to, from, tone };
  }

  // ---- Resultaat plaatsen via jouw bestaande pad ---------------------------
  function applyResult(text){
    // Maak synthetische message en gebruik je bestaande pick-flow
    const msg = {
      id: `ai_${Date.now()}`,
      icon: '✨',
      text: String(text || '').trim(),
      sentiments: [window.STATE?.activeSentiment].filter(Boolean)
    };
    if (!msg.text) return false;
    // Als er een helper bestaat die user-pick simuleert, gebruik die
    if (typeof window.onUserPickedMessage === 'function') {
      window.onUserPickedMessage(msg);
    } else if (typeof window.renderMessage === 'function') {
      // Val terug op directe render: voeg aan allMessages toe en render
      window.STATE = window.STATE || {};
      window.STATE.allMessages = Array.isArray(window.STATE.allMessages) ? window.STATE.allMessages : [];
      window.STATE.allMessages.unshift(msg);
      window.renderMessage({ requestedIdx: 0, msg });
    }
    // Eventuele textarea (debug/admin) bijwerken als aanwezig
    const ta = NS.els.textarea || document.querySelector('#message-textarea');
    if (ta) ta.value = msg.text;
    // Toast (i18n)
    if (typeof window.showToastI18n === 'function') {
      window.showToastI18n('ai.toast.applied', (window.STATE?.lang)==='en' ? 'AI message added ✨' : 'AI-bericht geplaatst ✨');
    } else if (typeof window.showToast === 'function') {
      window.showToast((window.STATE?.lang)==='en' ? 'AI message added ✨' : 'AI-bericht geplaatst ✨');
    }
    return true;
  }

  // ---- Fetch met timeout/abort ---------------------------------------------
  async function compose(){
    if (NS.state.busy) return;
    if (navigator.onLine === false){
      // Offline melding
      if (window.showToastI18n) window.showToastI18n('ai.error.offline', (window.STATE?.lang)==='en' ? 'You are offline' : 'Je bent offline');
      return;
    }

    const payload = ctx();
    const base    = aiBase();
    const url     = `${base}/compose`;

    const ctl = new AbortController();
    const timer = setTimeout(()=>ctl.abort(), aiTimeoutMs());
    NS.state.inFlight = ctl;

    setBusy(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify(payload),
        signal: ctl.signal
      });
      if (!res.ok){
        const msg = (window.STATE?.lang)==='en' ? 'Something went wrong. Please try again.' : 'Er ging iets mis. Probeer het nog eens.';
        window.showToastI18n?.('ai.error.generic', msg);
        return;
      }
      const data = await res.json().catch(()=> ({}));
      if (!data || !data.message){
        const msg = (window.STATE?.lang)==='en' ? 'No message received.' : 'Geen bericht ontvangen.';
        window.showToast?.(msg);
        return;
      }
      applyResult(data.message);
    } catch(err){
      const aborted = (err && (err.name==='AbortError' || String(err).includes('abort')));
      const msg = aborted
        ? ((window.STATE?.lang)==='en' ? 'AI took too long.' : 'AI deed er te lang over.')
        : ((window.STATE?.lang)==='en' ? 'Network error.' : 'Netwerkfout.');
      window.showToastI18n?.('ai.error.generic', msg);
    } finally {
      clearTimeout(timer);
      NS.state.inFlight = null;
      setBusy(false);
    }
  }

  // ---- Public init (alleen wiring; init blijft clean in script.js) ----------
  function init(opts){
    NS.els.btn      = document.querySelector((opts && opts.button)   || '#smart-compose');
    NS.els.status   = document.querySelector((opts && opts.status)   || '#smart-compose-status');
    NS.els.textarea = document.querySelector((opts && opts.textarea) || '#message-textarea');

    if (!NS.els.btn) return; // opt-in

    // Init labels/status (fallback naast refreshUIStrings)
    if (!NS.els.btn.textContent) {
      NS.els.btn.textContent = tAi('ai.button', (window.STATE?.lang)==='en' ? 'AI compose' : 'AI-bericht');
    }
    if (NS.els.status && !NS.els.status.textContent) {
      NS.els.status.textContent = tAi('ai.status.ready', (window.STATE?.lang)==='en' ? 'Ready' : 'Klaar');
    }

    NS.els.btn.addEventListener('click', () => {
      if (NS.state.busy) return;
      compose(); // echte call
    });
  }

  window.AWN_AI = { init, compose };
})();