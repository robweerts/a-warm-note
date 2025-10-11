;(() => {
  "use strict";

  // ========= Config =========
  const G = (typeof window !== "undefined") ? window : globalThis;
  const FLAGS = G.AWN_FLAGS || {};
  const AI_ENDPOINT = FLAGS.aiEndpoint || "https://ai.awarmnote.com/ai/compose";

  // Klein debugvlaggetje (zet in HTML: window.AWN_FLAGS = { debugAI: true })
  const DEBUG = !!FLAGS.debugAI;

  // ========= State =========
  let busy = false;      // UI-flag
  let inflight = null;   // Promise van de lopende call (re-use in plaats van weigeren)

  // ========= Kleine util =========
  const log = {
    d: (...a) => { if (DEBUG) try { console.debug(...a); } catch(_) {} },
    w: (...a) => { try { console.warn(...a); } catch(_) {} },
    e: (...a) => { try { console.error(...a); } catch(_) {} },
  };

  function lang() {
    try { return (G.STATE && G.STATE.lang) ? G.STATE.lang : (typeof G.resolveLang === "function" ? G.resolveLang() : "nl"); }
    catch { return "nl"; }
  }
  function getToSafe()   { try { return (typeof G.getTo   === "function") ? (G.getTo()   || "") : ""; } catch { return ""; } }
  function getFromSafe() { try { return (typeof G.getFrom === "function") ? (G.getFrom() || "") : ""; } catch { return ""; } }
  function getActiveSentiment() {
    try { return (G.STATE && G.STATE.activeSentiment) || null; } catch { return null; }
  }

  function setBusy(on) {
    const next = !!on;
    if (busy === next) return;
    busy = next;
    try { document.getElementById("smart-compose")?.toggleAttribute("disabled", busy); } catch {}
    try { document.dispatchEvent(new CustomEvent("ai:busy", { detail: { busy } })); } catch {}
    log.d("[AI] setBusy →", busy);
  }

  // ========= Dubbelcheckers =========

  // A) vóór verzenden: garandeer payload-vorm en waarschuw voor ontbrekende velden
  function payloadDoubleCheck(p) {
    const required = ["lang"];
    const missing = required.filter(k => !p || p[k] == null || p[k] === "");

    // Zorg voor vaste keys
    const sane = {
      lang:       String(p?.lang ?? lang() ?? "nl").slice(0,2).toLowerCase(),
      to:         typeof p?.to === "string" ? p.to : getToSafe(),
      from:       typeof p?.from === "string" ? p.from : getFromSafe(),
      tone:       p?.tone ?? null,
      occasion:   p?.occasion ?? null,
      context:    p?.context ?? null,
      length:     p?.length || "short",
      sentiments: Array.isArray(p?.sentiments) ? p.sentiments.slice(0,3) : (getActiveSentiment() ? [getActiveSentiment()] : [])
    };

    if (missing.length) log.w("[AI] payload missing required:", missing, "→ filled defaults:", sane);
    // Extra waarschuwingen (niet fataal)
    if (!sane.to)   log.w("[AI] payload: 'to' is empty (mag, maar resultaat kan generiek zijn)");
    if (!sane.tone) log.d("[AI] payload: 'tone' not set (sheet/opts) → overlaat aan agent");

    return sane;
  }

  // B) na ontvangst: accepteer meerdere vormen en valideer
  function normalizeAIResponse(data) {
    if (!data) return null;
    // Server stuurt soms { message: "..." } (string)
    if (typeof data.message === "string") {
      return {
        ok: (data.ok !== false),
        message: {
          text: data.message,
          icon: data.icon || "✨",
          sentiments: Array.isArray(data.sentiments) ? data.sentiments : [],
          special_day: data.special_day || null
        }
      };
    }
    return data;
  }

  function responseDoubleCheck(data) {
    const d = normalizeAIResponse(data);
    if (!d) return { ok:false, reason:"no_data", data: null };
    if (d.ok === false) return { ok:false, reason:"ok_false", data:d };
    if (!d.message) return { ok:false, reason:"no_message", data:d };
    if (!d.message.text) return { ok:false, reason:"no_text", data:d };
    // Garandeer defaults
    d.message.icon = d.message.icon || "✨";
    if (!Array.isArray(d.message.sentiments)) d.message.sentiments = [];
    d.message.special_day = d.message.special_day || null;
    return { ok:true, data:d };
  }

  // ========= Form-lezer =========
  function readForm() {
    try {
      if (typeof G.AWN_AI_FORM === "function") {
        const f = G.AWN_AI_FORM() || {};
        return {
          tone:     (f.tone ?? null),
          occasion: (f.occasion ?? null),
          context:  (f.context ?? null),
          length:   (f.length || "short")
        };
      }
    } catch {}
    return { tone:null, occasion:null, context:null, length:"short" };
  }

  // ========= Request =========
async function composeRequest(payload) {
  log.d("[AI] POST", AI_ENDPOINT, payload);
  let res;
  try {
    res = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      mode: "cors",
      credentials: "omit"
    });
  } catch (e) {
    log.e("[AI] Network error", e);
    const err = new Error("AI_NET");
    err.cause = e;
    throw err;
  }

  const raw = await res.text().catch(()=> "");
  log.d("[AI] HTTP", res.status, raw);

  let json = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }

  if (!res.ok) {
    const err = new Error("AI_HTTP_" + res.status);
    err.body = raw;
    err.json = json;
    throw err;
  }

  // --- NORMALIZE: support both {text} and {message:{text}} (and {message:"..."}) ---
  const text =
    (json && (json.text || json.message?.text || json.message)) ? (json.text || json.message?.text || json.message) : "";

  if (!text || typeof text !== "string") {
    log.e("[AI] invalid response: no_text", json);
    const err = new Error("AI_NO_TEXT");
    err.json = json;
    throw err;
  }

  return { ok: !!json?.ok || true, text, meta: json?.meta || null, _raw: json };
}

// === PAYLOAD BUILDER (central) =============================================
// Maakt 1 payload uit UI-form (AI-sheet) + app state, met veilige defaults.
// Zet 'm boven composeOnce().
function buildPayloadFromFormOrState(opts = {}) {
  const lang =
    (typeof STATE?.lang === 'string' && (STATE.lang === 'en' ? 'en' : 'nl')) ||
    ((typeof resolveLang === 'function' && resolveLang() === 'en') ? 'en' : 'nl');

  // Form data uit AI-sheet (als aanwezig)
  const form = (typeof window.AWN_AI_FORM === 'function')
    ? (window.AWN_AI_FORM() || {})
    : {};

  // Compose-velden uit app
  const to   = (typeof getTo   === 'function' ? (getTo()   || '') : (STATE?.shared?.to   || '')).trim();
  const from = (typeof getFrom === 'function' ? (getFrom() || '') : (STATE?.shared?.from || '')).trim();

  // Actieve sentiment als hint (optioneel)
  const sentiments = [];
  if (STATE?.activeSentiment) sentiments.push(STATE.activeSentiment);

  const tone     = (opts.tone     ?? form.tone     ?? '').trim() || null;
  const occasion = (opts.occasion ?? form.occasion ?? '').trim() || null;
  const context  = (opts.context  ?? form.context  ?? '').trim() || null;
  const length   = (opts.length   ?? form.length   ?? 'short');

  return {
    lang: (lang === 'en' ? 'en' : 'nl'),
    to,
    from,
    tone,
    occasion,
    context,
    length,          // 'short' | 'medium' | 'long'
    sentiments       // bv. ['birthday'] of []
  };
}


async function composeOnce(opts = {}) {
  try {
    dispatchEvent(new CustomEvent('ai:busy', { detail: { busy: true }}));

    const payload = buildPayloadFromFormOrState(opts); // jouw bestaande helper
    const { text, meta } = await composeRequest(payload);

    // renderen in app
    if (typeof window.onAIGeneratedText === 'function') {
      window.onAIGeneratedText(text, meta || {});
    }

    dispatchEvent(new CustomEvent('ai:result', { detail: { message: text, meta }}));
  } catch (e) {
    log.e("[AI] compose failed:", e);
    dispatchEvent(new CustomEvent('ai:error', { detail: { error: String(e && e.message || e) }}));
    showToast?.((STATE?.lang)==='en' ? "Something went wrong. Try again." : "Er ging iets mis, probeer opnieuw.");
  } finally {
    dispatchEvent(new CustomEvent('ai:busy', { detail: { busy: false }}));
  }
}

  // ========= Convenience: compose met sheet =========
  async function composeWithForm() {
    const f = readForm();
    return composeOnce(f);
  }

  // ========= Init =========
  function initSmartCompose(){
    try {
      const btn = document.getElementById("smart-compose");
      const status = document.getElementById("smart-compose-status");
      if (btn && !btn.dataset.aiBound) {
        btn.dataset.aiBound = "1";
        // (binding van click gebeurt elders in jouw glue; hier niets forceren)
      }
      if (status) status.textContent = ""; // optioneel leeg
    } catch {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initSmartCompose());
  } else {
    initSmartCompose();
  }

  // ========= Exports (robuust) =========
  try {
    G.AWN_AI = G.AWN_AI || {};
    G.AWN_AI.init            = initSmartCompose;
    G.AWN_AI.composeOnce     = composeOnce;
    G.AWN_AI.composeWithForm = composeWithForm;

    // Diagnose helpers
    G.AWN_AI._isBusy    = () => busy;
    G.AWN_AI._forceIdle = () => { busy = false; log.d("[AI] forced idle"); };

    G.__AI_MODULE_LOADED__ = (new Date()).toISOString();
    log.d("[AI] module loaded, api ready:", typeof G.AWN_AI.composeOnce, G.__AI_MODULE_LOADED__);
  } catch (e) {
    log.e("[AI] export failed:", e);
  }

})(); 