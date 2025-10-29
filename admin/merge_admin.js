#!/usr/bin/env node
/**
 * merge_songs_nl.js
 * Gebruik: node merge_songs_nl.js ./data/messages.nl.json ./data/messages.nl.v2.songs.json
 * Leest base JSON, prepent 5 nieuwe teksten per sentiment met unieke nl_ ids, schrijft gemerged bestand.
 */

const fs = require('fs');
const path = require('path');

// --- CLI args ---
const inPath  = process.argv[2] || './messages.nl.json';
const outPath = process.argv[3] || './messages.nl.v2.songs.json';

// --- helpers ---
const now  = () => Date.now();
const pick = (obj, key, fallback) => (obj && key in obj ? obj[key] : fallback);
const randId = (taken) => {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  while (true) {
    let s = 'nl_';
    for (let i = 0; i < 7; i++) s += abc[Math.floor(Math.random() * abc.length)];
    if (!taken.has(s)) { taken.add(s); return s; }
  }
};

// --- additions: 5 per sentiment ---
const additions = {
  bemoedigend: [
    "Je hoeft niet alles vandaag te kunnen — één stap is ook muziek.",
    "Als het even stil is, groeit er kracht in je pauze.",
    "Je vindt de weg al lopend — refrein: jij kunt dit.",
    "Kleine moed vandaag, groot verschil straks.",
    "Laat twijfel fluisteren en zelfvertrouwen zingen."
  ],
  troost: [
    "Ik zet een lichtje voor je aan — ik ben bij je.",
    "Onder dezelfde maan: je bent niet alleen vannacht.",
    "Laat maar leunen — ik draag een stukje mee.",
    "Als het regent in je hoofd, schuil ik met je mee.",
    "Tranen mogen vallen; wij blijven staan."
  ],
  dankbaar: [
    "Dank je dat je van gewone uren, gouden minuten maakt.",
    "Voor je kleine grote daden — dank je wel.",
    "Je aandacht tilt mijn dag — merci.",
    "Jij bent de zachte noot in mijn dag. Dankjewel.",
    "Ik zie je — en ik waardeer je."
  ],
  trots: [
    "Kijk eens wat je al hebt gehaald — trots op jou.",
    "Sta even stil en hoor je eigen applaus.",
    "Je glans is verdiend — helemaal van jou.",
    "Niet alleen de top, ook de klim is knap. Trots!",
    "Je moed is mijn lievelingsmedaille."
  ],
  liefde: [
    "Mijn hart spreekt vloeiend jouw naam.",
    "Met jou voelt gewoon bijzonder.",
    "Jij bent mijn lievelingsrust en lievelingsrumoer.",
    "Je vonk raakt me, elke keer opnieuw.",
    "Waar jij bent, klopt ‘thuis’."
  ],
  humor: [
    "Ik stuur je een glimlach op volle sterkte.",
    "Vandaag is ‘alles komt goed’-smaak.",
    "Geen reden nodig — alleen benen: dans!",
    "Probleem? We snijden ‘m in stukjes. Taart helpt.",
    "Ik heb je ingepland voor plezier o’clock."
  ],
  succes: [
    "Kleine launch, grote leerwinst — ga!",
    "Vandaag telt elke ‘kleine klaar’.",
    "Finish is fijn, maar je focus is goud.",
    "Je lijn hoeft niet recht — als ie maar stijgt.",
    "Nieuwe dag, nieuw momentum — pak ‘m."
  ],
  doorzetten: [
    "Als je niet loslaat, klim je nergens — durf.",
    "Opnieuw proberen is ook vooruitgang.",
    "Anker in jezelf — en verder.",
    "Trede voor trede — dat is hoe hoogtes werken.",
    "Zet je eigen beat op en ga door."
  ],
  kalmte: [
    "Adem mee met de dag — rustig in, rustig uit.",
    "Zacht is ook sterk — kies vrede.",
    "Laat los wat ritselt — hou vast wat rust geeft.",
    "Stilte is geen leegte; het is ruimte voor jou.",
    "Ochtendlucht. Nieuwe kans. Zachte start."
  ],
  vriendschap: [
    "Ik sta naast je — vandaag en morgen.",
    "Bel me voor onzin. Bel me voor alles.",
    "Zelfs als we verdwalen, lachen we de juiste kant op.",
    "Ik deel mijn laatste punt met jou — dat zegt genoeg.",
    "In mijn rugzak: sleutels, hoop en jij."
  ]
};

function main() {
  // 1) Read base
  const raw = fs.readFileSync(inPath, 'utf-8');
  const base = JSON.parse(raw);

  const baseLang = pick(base, 'lang', 'nl');
  const baseSent = Array.isArray(base.sentiments) ? base.sentiments : [];
  const baseMsgs = Array.isArray(base.messages) ? base.messages : [];

  // 2) collect existing ids
  const taken = new Set(baseMsgs.map(m => m && m.id).filter(Boolean));

  // 3) build new messages
  const newMsgs = [];
  Object.entries(additions).forEach(([sentiment, texts]) => {
    texts.forEach(text => {
      newMsgs.push({
        id:          randId(taken),
        icon:        "✨",
        text,
        sentiments:  [sentiment],
        special_day: null,
        weight:      1
      });
    });
  });

  // 4) prepend additions
  const merged = {
    lang: baseLang,
    sentiments: baseSent,
    messages: [...newMsgs, ...baseMsgs]
  };

  // 5) write out
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`OK → ${path.resolve(outPath)} (${merged.messages.length} messages)`);
}

main();
