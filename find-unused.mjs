// find-unused.mjs
import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';

const ROOT = process.cwd();
const IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/.next/**',
  '**/build/**',
  '**/.cache/**'
];
// Welke bestanden wil je beoordelen als "assets" (kans op ongebruikt)?
const CANDIDATE_GLOBS = [
  '**/*.{png,jpg,jpeg,webp,avif,svg,gif,ico,woff2,woff,ttf,otf,mp3,mp4,webm}',
  '**/*.{css,js,json,html}'
];

const SOURCE_GLOBS = [
  '**/*.html',
  '**/*.js',
  '**/*.css'
];

// simpele extractor: zoekt naar src= / href= / url(...) / import ... from '...' / fetch('...') etc.
const REF_RE = [
  /(?:src|href)\s*=\s*["']([^"']+)["']/gi,
  /url\(\s*["']?([^"')]+)["']?\s*\)/gi,
  /@import\s*["']([^"']+)["']/gi,
  /import\s+[^"']*from\s*["']([^"']+)["']/gi,
  /import\(\s*["']([^"']+)["']\s*\)/gi,
  /fetch\(\s*["']([^"']+)["']/gi
];

function isHttpLike(p){ return /^https?:\/\//i.test(p) || /^data:/.test(p) || /^mailto:/.test(p); }
function cleanRef(p){
  // strip query/hash
  const noQ = p.split('#')[0].split('?')[0];
  // verwijder leading ./ en // e.d.
  return noQ.replace(/^(\.\/)+/,'').replace(/^\/+/,'/');
}
function resolveRef(fromFile, ref){
  const c = cleanRef(ref);
  if (!c || isHttpLike(c)) return null;
  // absolute vanaf root?
  if (c.startsWith('/')) return path.join(ROOT, c);
  // relatief tegenover het bronbestand
  return path.join(path.dirname(fromFile), c);
}

function extractRefs(filePath){
  const txt = fs.readFileSync(filePath, 'utf8');
  const hits = new Set();
  for (const re of REF_RE){
    let m;
    while ((m = re.exec(txt)) !== null){
      const raw = (m[1] || '').trim();
      const abs = resolveRef(filePath, raw);
      if (abs) hits.add(path.normalize(abs));
    }
  }
  return hits;
}

const allCandidates = new Set(
  await fg(CANDIDATE_GLOBS, { dot: false, ignore: IGNORE, cwd: ROOT, absolute: true })
);
const sourceFiles = await fg(SOURCE_GLOBS, { dot: false, ignore: IGNORE, cwd: ROOT, absolute: true });

const referenced = new Set();
for (const f of sourceFiles){
  for (const ref of extractRefs(f)) {
    referenced.add(path.normalize(ref));
  }
}

// filter: alleen bestanden die bestaan én niet gerefereerd worden
const existsAndUnref = [];
for (const abs of allCandidates){
  if (!fs.existsSync(abs)) continue;
  if (!referenced.has(path.normalize(abs))){
    existsAndUnref.push(abs);
  }
}

existsAndUnref.sort((a,b)=>a.localeCompare(b));
console.log('=== Unused files (best effort) ===');
for (const f of existsAndUnref){
  console.log(path.relative(ROOT, f));
}
console.log(`\nTotal: ${existsAndUnref.length}`);
