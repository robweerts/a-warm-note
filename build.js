// run: node build.js
const fs = require('fs');
const path = require('path');

function read(p) { return fs.readFileSync(p, 'utf8'); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function render(lang) {
  const base = read('./templates/index.base.html');
  const head = read(`./templates/head.${lang}.html`);
  return base.replace('{{HEAD}}', head).replace('{{LANG}}', lang);
}

const outputs = [
  { lang: 'nl', out: './nl/index.html' },
  { lang: 'en', out: './en/index.html' },
];

outputs.forEach(({ lang, out }) => {
  const html = render(lang);
  ensureDir(path.dirname(out));
  fs.writeFileSync(out, html, 'utf8');
  console.log(`✔ generated: ${out}`);
});
