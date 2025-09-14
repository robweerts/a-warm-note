/**
 * download.js — Exporteer de huidige note als PNG
 * ------------------------------------------------------------
 * Verbetering: de boodschap (tekst + optioneel icoon) wordt
 * eerst gemeten (wrap/hoogte) en daarna VERTICAAL gecentreerd
 * in het papier getekend. To/from blijven op vaste posities.
 *
 * Publieke API (wordt aangeroepen vanuit script.js):
 *   window.downloadNoteAsImage(
 *     noteEl, msgEl, iconLineEl, lang,
 *     toLabelFn, fromLabelFn, getTo, getFrom
 *   )
 */

window.downloadNoteAsImage = function(noteEl, msgEl, iconLineEl, lang, toLabel, fromLabel, getTo, getFrom){
  const rect  = noteEl.getBoundingClientRect();
  const scale = window.devicePixelRatio || 2;
  const pad   = 32;

  // Canvas opzetten
  const canvas = document.createElement("canvas");
  canvas.width  = Math.round((rect.width  + pad*2) * scale);
  canvas.height = Math.round((rect.height + pad*2) * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  // Coords binnen het canvas (in CSS px)
  const x = pad, y = pad, w = rect.width, h = rect.height;

  // === Achtergrond (pagina)
  const bodyBg = getComputedStyle(document.body).backgroundColor || "#fff8e7";
  ctx.fillStyle = bodyBg;
  ctx.fillRect(0,0,canvas.width/scale,canvas.height/scale);

  // === Papier (note)
  const paperColor = getComputedStyle(noteEl).backgroundColor || "#FFE66D";
  ctx.fillStyle = paperColor;
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 18; ctx.shadowOffsetY = 14;
  roundRect(ctx,x,y,w,h,8); ctx.fill();

  // === Tape
  ctx.shadowColor = "rgba(0,0,0,0.18)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.save(); ctx.translate(x+22,y-12); ctx.rotate(-12*Math.PI/180); roundRect(ctx,0,0,86,28,3); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(x+w-108,y-12); ctx.rotate( 8*Math.PI/180); roundRect(ctx,0,0,86,28,3); ctx.fill(); ctx.restore();

  // === Tekststijl (handgeschreven)
  ctx.shadowColor = "transparent";
  const ink = getComputedStyle(document.body).getPropertyValue("--ink") || "#1d1b16";
  ctx.fillStyle = ink;

  const fontFamily = (getComputedStyle(msgEl).fontFamily.split(",")[0] || "Caveat").replaceAll('"','').trim();
  const baseSize   = Math.min(38, Math.max(26, w * 0.06)); // schaal met breedte note
  const lineHeight = baseSize * 1.2;
  const leftPad    = 24;
  const rightPad   = 24;
  const maxWidth   = w - (leftPad + rightPad);

  // Voorbereiden: tekst + icon uit DOM
  const msgText = String(msgEl.textContent || "");
  const iconTxt = String(iconLineEl.textContent || "");

  // 1) Meet de regels (wrap) zonder te tekenen
  ctx.font = `700 ${baseSize}px "${fontFamily}"`;
  ctx.textBaseline = "top";

  const lines = wrapLines(ctx, msgText, maxWidth);
  const textHeight = lines.length * lineHeight;

  // 2) Meet icoonblok (als aanwezig)
  let iconHeight = 0, iconSize = 0, iconMarginTop = 0;
  if (iconTxt) {
    iconSize = Math.round(baseSize * 1.1);
    iconMarginTop = Math.max(10, baseSize * 0.3);
    // Voor totale blokhoogte telt margin mee
    ctx.font = `700 ${iconSize}px "${fontFamily}"`;
    const iconH = iconSize; // bij 'top' baseline ≈ font-size
    iconHeight = iconMarginTop + iconH;
  }

  // 3) Bepaal totale hoogte van het "boodschap-blok"
  const blockHeight = textHeight + iconHeight;

  // 4) Kies een startY zodat het blok mooi VERTICAAL gecentreerd staat.
  //    - Binnen de note, met minimum-top marge zodat het niet tegen de tape zit.
  const minTop = 28;                     // minimale marge vanaf boven
  const startY = y + Math.max(minTop, (h - blockHeight) / 2);

  // 5) Teken de tekstregels
  ctx.font = `700 ${baseSize}px "${fontFamily}"`;
  let yText = startY;
  for (const line of lines) {
    ctx.fillText(line, x + leftPad, yText);
    yText += lineHeight;
  }

  // 6) Teken icoon (gecentreerd tov tekstblok)
  if (iconTxt) {
    ctx.font = `700 ${iconSize}px "${fontFamily}"`;
    const iw = ctx.measureText(iconTxt).width;
    const ix = x + leftPad + (maxWidth - iw)/2;
    const iy = yText + iconMarginTop;
    ctx.fillText(iconTxt, ix, iy);
  }

  // 7) "Voor ..." linksboven
  const toName = getTo();
  if (toName) {
    const small = Math.round(baseSize * 0.55);
    ctx.font = `700 ${small}px "${fontFamily}"`;
    ctx.fillText(toLabel(lang, toName), x + 16, y + 12);
  }

  // 8) "— van ..." rechtsonder
  const fromName = getFrom();
  if (fromName) {
    const small = Math.round(baseSize * 0.55);
    ctx.font = `700 ${small}px "${fontFamily}"`;
    const txt = fromLabel(lang, fromName);
    const tw = ctx.measureText(txt).width;
    ctx.fillText(txt, x + w - 24 - tw, y + h - 24 - small - 4);
  }

  // 9) Download
  const a = document.createElement("a");
  a.download = "warm-note.png";
  a.href = canvas.toDataURL("image/png");
  a.click();

  // ===== Helpers =====
  function roundRect(ctx, x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y, x+w,y+h, r);
    ctx.arcTo(x+w,y+h, x,y+h, r);
    ctx.arcTo(x,y+h, x,y, r);
    ctx.arcTo(x,y, x+w,y, r);
    ctx.closePath();
  }

  function wrapLines(ctx, text, maxWidth){
    const words = String(text || "").split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
      const test = line ? (line + " " + word) : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }
};