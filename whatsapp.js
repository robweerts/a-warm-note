// whatsapp.js — delen via WhatsApp voor "a warm note"
// ---------------------------------------------------
// Publieke API (zoals mail.js):
//   window.shareByWhatsApp({ lang: 'nl'|'en'|'pap', toName: '', permalink: '' })
//
// - Bouwt één warme, naam-gevoelige regel + de permalink
// - Opent WhatsApp (app/web) via wa.me
// - Geen afhankelijkheden, alleen window + encodeURIComponent

(function () {
  const enc = (s) => encodeURIComponent(String(s ?? ""));
  const normLang = (l) => (l === "nl" || l === "pap") ? l : "en";

  function messageFor(lang, toName = "", link = "") {
    const l = normLang(lang);
    const hasName = !!(toName && String(toName).trim());
    if (l === "nl") {
      return (hasName
        ? `Voor ${toName} — omdat jij belangrijk voor me bent. 💛 `
        : `Omdat jij belangrijk voor me bent. 💛 `
      ) + (link || "");
    }
    if (l === "pap") {
      return (hasName
        ? `Pa ${toName} — pasobra bo ta importante pa mi. 💛 `
        : `Pasobra bo ta importante pa mi. 💛 `
      ) + (link || "");
    }
    // en
    return (hasName
      ? `For ${toName} — because you matter to me. 💛 `
      : `Because you matter to me. 💛 `
    ) + (link || "");
  }

  /**
   * Open WhatsApp met een warm bericht + link
   * @param {Object} opts
   * @param {'nl'|'en'|'pap'} opts.lang
   * @param {string} [opts.toName]
   * @param {string} [opts.permalink]  // volledige URL naar de boodschap
   */
  window.shareByWhatsApp = function shareByWhatsApp({ lang = "en", toName = "", permalink = "" } = {}) {
    const text = messageFor(lang, toName, permalink || location.href);
    const url  = `https://wa.me/?text=${enc(text)}`;
    // Nieuw tabblad (sheet kan netjes sluiten)
    window.open(url, "_blank", "noopener");
  };
})();