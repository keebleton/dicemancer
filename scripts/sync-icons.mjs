// Copies every WoW icon referenced by shipped content (src/content/*.ts) from
// the local asset dump into public/icons/ so they deploy with the site, and
// writes public/wow-icons.json (the deployed Lab picker's catalog = shipped
// icons only; the dev server overrides it with the full 23k dump).
// Run after adding or changing card icons: npm run icons:sync
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICONS_DIR = 'C:/DicemancerAssets/wow-ui-textures/ICONS';
const OUT_DIR = join(root, 'public', 'icons');
const CONTENT_DIR = join(root, 'src', 'content');

if (!existsSync(ICONS_DIR)) {
  console.error(`asset dump not found at ${ICONS_DIR}; nothing to sync`);
  process.exit(1);
}

const referenced = new Set();
for (const f of readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.ts'))) {
  const src = readFileSync(join(CONTENT_DIR, f), 'utf8');
  // Any quoted .PNG in content is an icon reference (icon: fields, the
  // starter icon map, whatever comes later).
  for (const m of src.matchAll(/'([^']+\.png)'/gi)) referenced.add(m[1]);
}

mkdirSync(OUT_DIR, { recursive: true });
let copied = 0;
const missing = [];
for (const name of referenced) {
  const from = join(ICONS_DIR, name);
  if (!existsSync(from)) {
    missing.push(name);
    continue;
  }
  copyFileSync(from, join(OUT_DIR, name));
  copied += 1;
}

const shipped = readdirSync(OUT_DIR)
  .filter((f) => f.toLowerCase().endsWith('.png'))
  .sort();
writeFileSync(join(root, 'public', 'wow-icons.json'), JSON.stringify(shipped));

console.log(`synced ${copied} icons (${shipped.length} shipped total) into public/icons`);
if (missing.length) console.warn(`MISSING from the dump: ${missing.join(', ')}`);
