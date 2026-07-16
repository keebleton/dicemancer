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
const scanFiles = [
  ...readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(CONTENT_DIR, f)),
  join(root, 'src', 'engine', 'relics.ts'), // relic art lives with the rules
];
for (const path of scanFiles) {
  const src = readFileSync(path, 'utf8');
  // Any quoted .PNG is an icon reference (icon: fields, the starter icon
  // map, relic defs, whatever comes later).
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

// The deployed manifest lists the WHOLE catalog: shipped icons resolve from
// public/icons, the rest fall back to the icon repo's CDN (iconError in
// packs.ts). This is what lets the website's card builder and avatar picker
// browse all 23k icons without us hosting them.
const catalog = readdirSync(ICONS_DIR)
  .filter((f) => f.toLowerCase().endsWith('.png'))
  .sort();
writeFileSync(join(root, 'public', 'wow-icons.json'), JSON.stringify(catalog));

console.log(
  `synced ${copied} shipped icons into public/icons; manifest lists ${catalog.length}`,
);
if (missing.length) console.warn(`MISSING from the dump: ${missing.join(', ')}`);
