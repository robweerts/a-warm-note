// mail.js — compose mailto: links for "a warm note"
//
// Wijzigingen:
// - NL/EN/PAP subject is nu naam-gevoelig: als er een ontvangersnaam is,
//   gebruiken we "speciaal voor {naam}" / "just for {name}" / "spesial pa {name}".
// - NL body is exact volgens jouw tekst (incl. "Bekijk mijn boodschap aan jou").
// - EN & PAP body in dezelfde warme stijl.
// - encodeURIComponent voor nette mailto encoding.
//
// Publieke API (aangeroepen vanuit script.js):
//   window.shareByEmail({
//     lang: 'nl'|'en'|'pap',
//     toName: 'Ria',        // optioneel, toont begroeting en personaliseert subject
//     fromName: 'Rob',      // optioneel, toont afsluiter-naam
//     noteText: '',         // behouden voor compat; niet gebruikt in deze body-stijl
//     permalink: 'https://...' // URL naar de boodschap
//   })

(function () {
  // ===== Subjects (naam-gevoelig per taal) =====
  const SUBJECT = {
    nl: (to) => to
      ? `Een warm bericht, speciaal voor ${to}`
      : `Een warm bericht, speciaal voor jou`,
    en: (to) => to
      ? `A warm message, just for ${to}`
      : `A warm message, just for you`,
    pap: (to) => to
      ? `Un mensahe di cariño, spesial pa ${to}`
      : `Un mensahe di cariño, spesial pa bo`
  };

  // ===== Per-taal body builders =====
  function bodyNL(toName = "", fromName = "", permalink = "") {
    const lines = [];
    if (toName) lines.push(`Voor ${toName},`);
    lines.push(""); // lege regel
    lines.push("Omdat jij belangrijk voor me bent.");
    lines.push(""); // lege regel
    lines.push(`Bekijk mijn boodschap aan jou: ${permalink || ""}`);
    lines.push(""); // lege regel
    lines.push("Liefs,");
    if (fromName) lines.push(fromName);
    return lines.join("\n");
  }

  function bodyEN(toName = "", fromName = "", permalink = "") {
    const lines = [];
    if (toName) lines.push(`For ${toName},`);
    lines.push("");
    lines.push("Because you matter to me.");
    lines.push("");
    lines.push(`Read my message for you: ${permalink || ""}`);
    lines.push("");
    lines.push("Warmly,");
    if (fromName) lines.push(fromName);
    return lines.join("\n");
  }

  function bodyPAP(toName = "", fromName = "", permalink = "") {
    const lines = [];
    if (toName) lines.push(`Pa ${toName},`);
    lines.push("");
    lines.push("Pasobra bo ta importante pa mi.");
    lines.push("");
    lines.push(`Mira mi mensahe pa bo: ${permalink || ""}`);
    lines.push("");
    lines.push("Ku cariño,"); // met genegenheid
    if (fromName) lines.push(fromName);
    return lines.join("\n");
  }

  /**
   * Publieke API — genereer en open mailto:
   * @param {Object} opts
   * @param {'en'|'nl'|'pap'} opts.lang
   * @param {string} [opts.toName]
   * @param {string} [opts.fromName]
   * @param {string} [opts.noteText]   // niet gebruikt; bewaard voor compatibiliteit
   * @param {string} [opts.permalink]  // volledige URL naar de boodschap
   */
  window.shareByEmail = function shareByEmail({
    lang = "en",
    toName = "",
    fromName = "",
    noteText = "",   // API-compat
    permalink = ""
  } = {}) {
    // Normaliseer taal
    const l = (lang === "nl" || lang === "pap") ? lang : "en";

    // Subject (naam-gevoelig)
    const subject = SUBJECT[l](toName);

    // Body per taal
    let bodyText = "";
    if (l === "nl")      bodyText = bodyNL(toName, fromName, permalink);
    else if (l === "pap") bodyText = bodyPAP(toName, fromName, permalink);
    else                  bodyText = bodyEN(toName, fromName, permalink);

    // Encode en open mailto
    const subjectEncoded = encodeURIComponent(subject);
    const bodyEncoded    = encodeURIComponent(bodyText);
    location.href = `mailto:?subject=${subjectEncoded}&body=${bodyEncoded}`;
  };
})();