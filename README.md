# a warm note — README

Een ultra‑lichte webapp om kleine bemoedigingen (“notes”) te delen. Volledig client‑side: geen server nodig.

---

## TL;DR
- **Doel:** Snel een warme boodschap genereren en delen via link, native Share of e‑mail; desgewenst als PNG downloaden.
- **Talen:** Nederlands (nl), Engels (en), Papiamentu (pap) — met taalwissel via een dropdown.
- **Intro & Coach:** Bij een “schone start” (geen `?id`, `?to`, `?from`) verschijnt een **intro‑boodschap** en een **coach‑hint** hoe je kunt delen. Bij taalwissel past de intro zich live aan.
- **Privacy:** Alles draait in de browser. Alleen een paar voorkeuren in `localStorage` (naam, share‑voorkeur, achtergrondkeuze per taal).

---

## Inhoudsopgave
1. [Bestanden & structuur](#bestanden--structuur)
2. [Installatie & starten](#installatie--starten)
3. [Gedrag & features](#gedrag--features)
   - [Intro‑boodschap](#intro-boodschap)
   - [Coach‑meldingen](#coach-meldingen)
   - [Taalkeuze](#taalkeuze)
   - [Berichten laden](#berichten-laden)
   - [Personalisatie (To/From)](#personalisatie-tofrom)
   - [Delen (Share/Copy)](#delen-sharecopy)
   - [E‑mail](#e-mail)
   - [Download als PNG](#download-als-png)
   - [Achtergronden & cachebuster](#achtergronden--cachebuster)
4. [Data‑schema](#data-schema)
5. [URL‑parameters](#url-parameters)
6. [Onderhoud & tips](#onderhoud--tips)
7. [Testplan (handmatig)](#testplan-handmatig)
8. [Troubleshooting](#troubleshooting)
9. [Toegankelijkheid](#toegankelijkheid)
10. [Roadmap / uitbreiden](#roadmap--uitbreiden)
11. [Changelog](#changelog)
12. [Licentie](#licentie)

---

## Bestanden & structuur

```
/
├─ index.html           # Minimale HTML (self-healing DOM vult aan)
├─ styles.css           # UI-styling (topbar, note, sheets, toasts)
├─ script.js            # Hoofdlogica (taal, berichten, share, intro/coach)
├─ mail.js              # mailto: helper met nette encoding
├─ download.js          # PNG-export van de “note”
├─ data/
│  ├─ messages.en.json  # Nieuwe schema-vorm (per taal)
│  ├─ messages.nl.json
│  ├─ messages.pap.json
│  └─ messages.json     # (Optionele) legacy fallback met alle talen samen
└─ bg/
   ├─ nl.jpeg           # Achtergronden (per taal)
   └─ ...
```

> **Self-healing DOM:** `script.js` maakt ontbrekende UI-elementen zelf aan. Handig voor kale of alternatieve HTML-sjablonen.

---

## Installatie & starten

1. Plaats de bestanden op een statische host (Vercel, Netlify, GitHub Pages) **of** open `index.html` direct in de browser.
2. Zorg dat het **`data/`**-mapje en **`bg/`**-afbeeldingen meegekopieerd zijn.
3. Bij lokaal openen via `file://` werkt alles, maar **history/URL aanpassing** is beperkt (veiligheidsrestricties). Delen als link werkt dan wel, maar zonder prettige history‑updates.

---

## Gedrag & features

### Intro‑boodschap
- Verschijnt **alleen** bij een **schone start**: wanneer de URL **geen** `?id`, `?to` of `?from` bevat.
- Tekst en 💌‑icoon komen uit `INTRO_MESSAGES` (in `script.js`).
- De intro wordt **rechtstreeks in de DOM** gezet (zonder de deck te wijzigen), waardoor **“Nog eentje”** meteen een **écht** bericht uit de deck toont.
- Bij **taalwissel** in de intro‑state wordt de intro direct opnieuw gerenderd in de nieuwe taal.

### Coach‑meldingen
De coach‑balk onder de note geeft context:
- **init**: uitlegt hoe te versturen (Share/Copy), vermeldt dat ‘Voor/To’ optioneel is.
- **toFilled**: sturend naar ‘Deel’/‘Share’ wanneer ‘Voor/To’ is ingevuld.
- **shared**: bevestigt succes en nodigt uit om nog eentje te maken.
- **langSwitch**: bevestigt taalwissel.

### Taalkeuze
- Detectie: `?lang` in URL, anders navigator taal (`nl`/`pap` → anders `en`).
- Dropdown met 🇳🇱/🇬🇧/🇨🇼. Het menu wordt tijdelijk “geportalled” naar `<body>` om clipping/overflow te voorkomen.
- Bij wissel blijft de huidige note staan; in intro‑state wordt de intro geüpdatet.

### Berichten laden
- **Primair:** `data/messages.<lang>.json` (schema: `{ "messages": [...] }`).
- **Fallback:** `data/messages.json` (legacy) of built‑in `DEFAULT_MESSAGES`.
- `STATE._fullByLang[lang]` bewaart desgewenst de **volledige** record per item (bv. id/weight/sentiments) voor latere uitbreidingen.

### Personalisatie (To/From)
- `?to=Naam` en `?from=Naam` tonen labels op de note; `{{name}}` in een message wordt vervangen door de `to`‑waarde.
- Geen mutatie van `?to`/`?from` tijdens navigatie: de app **respecteert** handmatige URL‑instellingen.

### Delen (Share/Copy)
- **Native Share** via `navigator.share` (waar beschikbaar). Annuleer je de share, dan **kopiëren we niet** automatisch.
- **Copy link**: link naar de huidige note (of intro‑state: alleen `lang`). De link **forceert `lang=`** zodat de ontvanger dezelfde taal ziet.
- **Voorkeur onthouden** (`anon`/`named`) in `localStorage` (`SHARE_PREF_KEY`).

### E‑mail
- `mail.js` bouwt een nette `mailto:` met **subject/body encoding** via `encodeURIComponent` (voorkomt `+` voor spaties).
- Body bevat groet, boodschap, ondertekening en een permalink naar de note.

### Download als PNG
- `download.js` rendert de note naar canvas en **centreert** de tekst/icoon verticaal.
- “Voor …” en “— van …” staan op vaste posities, en tape/achtergrond worden meegetekend.
- Bestand: `warm-note.png`

### Achtergronden & cachebuster
- Per taal dezelfde of andere achtergrond(en) (`BG_BY_LANG`), met **“golden hour” overlay**.
- Gekozen achtergrond‑index per taal kan worden **bewaard** (`awarm_bg_idx`) zodat je bij refresh dezelfde krijgt.
- **Cache‑busting:** `ASSET_VERSION` in `script.js` voegt `?v=` toe aan requests voor JSON/afbeeldingen. **Verhoog** deze waarde bij nieuwe assets.

---

## Data‑schema

### Nieuw schema (per taal)
`data/messages.nl.json`
```json
{
  "messages": [
    { "icon": "✨", "text": "Je bent genoeg, precies zoals je nu bent." }
  ]
}
```

**Veldopties (toekomstbestendig):**
- `icon` *(string, optioneel)* — emoji/teken op aparte regel onder de tekst
- `text` *(string, verplicht)* — de boodschap
- `id`, `weight`, `sentiments` *(optioneel)* — niet vereist, wel ondersteund in `STATE._fullByLang`

### Legacy combi
`data/messages.json`
```json
{
  "en": [ { "icon":"✨","text":"You are enough..." } ],
  "nl": [ { "icon":"✨","text":"Je bent genoeg..." } ],
  "pap":[ { "icon":"✨","text":"Bo ta sufi..." } ]
}
```

---

## URL‑parameters

| Parameter | Voorbeeld                | Uitleg                                                |
|----------:|--------------------------|-------------------------------------------------------|
| `lang`    | `?lang=nl`               | Forceert UI‑/berichtentaal.                           |
| `id`      | `?id=7`                  | Rendert exact bericht #7 (0‑based index).             |
| `to`      | `?to=Ria`                | Toont “voor Ria” / “for Ria” / “pa Ria” en personaliseert `{{name}}`. |
| `from`    | `?from=Rob`              | Toont “— van Rob” / “— from Rob” / “— di Rob”.        |

**Intro‑trigger:** De intro verschijnt alleen wanneer **geen** van bovenstaande parameters aanwezig is.

---

## Onderhoud & tips

- **Cache‑buster:** verhoog `ASSET_VERSION` wanneer je nieuwe `data/*.json` of `bg/*` publiceert.
- **Taaluitbreiding:** voeg een extra taalcode toe in:
  - `PER_LANG_FILES`
  - `COPY` (share/about‑i18n)
  - `COACH_COPY`
  - `INTRO_MESSAGES`
  - `BG_BY_LANG` (optioneel)
- **Privacy:** enkel `localStorage` keys:
  - `awarm_name` (naam bij “met naam” delen)
  - `awarm_share_pref` (`anon`/`named`)
  - `awarm_bg_idx:<lang>` (gekozen achtergrond per taal)

---

## Testplan (handmatig)

1. **Intro/coach (schone start):** open `/` zonder querystring → intro‑tekst + coach “init”. Taal wisselen → intro past zich aan.
2. **Nog eentje:** na intro klik “Nog eentje” → een **echte** boodschap uit de deck.
3. **Specifiek id:** open `/?id=3` → exact bericht #3, géén intro.
4. **To/From:** open `/?to=Ria&from=Rob` → labels zichtbaar; coach toont `toFilled`‑hint.
5. **Share/copy:** “Deel” start native share; “Kopieer link” zet link op klembord → open in nieuwe tab en check `lang=...`.
6. **E‑mail:** “E‑mail” opent mail client met onderwerp/tekst/permalink.
7. **Download:** “Download” levert `warm-note.png` met tape, papier en correcte uitlijning.
8. **Achtergrond persist:** ververs pagina → achtergrond (per taal) blijft consistent (indien `BG_PERSIST=true`).

---

## Troubleshooting

- **Intro blijft in oude taal staan bij wissel:** zorg dat je de versie gebruikt waarin `applyLanguage()` de intro **opnieuw rendert** wanneer `STATE.currentIdx === null` en er geen URL‑parameters zijn.
- **Clipboard fout:** sommige browsers vragen permissie; gebruik dan de fallback prompt of native Share.
- **file:// beperkingen:** `history.replaceState` is uitgezet; delen werkt alsnog, maar URL‑aanpassingen zijn minder vloeiend.
- **Geen berichten gevonden:** controleer JSON‑paden en bump `ASSET_VERSION` om caching te doorbreken.

---

## Toegankelijkheid

- Sheets hebben `role="dialog"` + ARIA labels/titels.
- Toast gebruikt `role="status"` en is kort zichtbaar.
- Focus‑stijlen, `:focus-visible` en Escape om menu/sheet te sluiten.
- Taalcodes en vlaggen ondersteunen screenreaders via omliggende tekst.

---

## Roadmap / uitbreiden (optioneel)

- **Gewichten/filters:** gebruik `weight` of `sentiments` uit het full‑record (`STATE._fullByLang`) om selectie te sturen.
- **Favorieten/blacklist:** lokaal opslaan welke notes vaker of juist niet terug moeten komen.
- **PWA:** offline caching van assets en JSON via Service Worker.

---

## Changelog

- **2025‑09‑01** — Intro‑boodschap + coach‑koptekst toegevoegd; intro wisselt mee met taal; documentatie aangevuld.

---

## Licentie

© 2025 — (MIT).
