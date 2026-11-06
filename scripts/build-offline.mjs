import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'vite';

await build();
const html = await readFile('dist/index.html', 'utf8');
let offline = html;
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
assert.equal(scripts.length, 1, 'The offline game must have one bundled JavaScript entry.');
for (const [tag, file] of scripts) {
  const code = await readFile(resolve('dist', file), 'utf8');
  offline = offline.replace(tag, () => `<script type="module">${code.replace(/<\/script/gi, '<\\/script')}</script>`);
}
for (const [tag, file] of html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)) {
  const css = await readFile(resolve('dist', file), 'utf8');
  offline = offline.replace(tag, () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
}
offline = offline.replace(/<link\b[^>]*\brel="modulepreload"[^>]*>/g, '');
const [threeLicense, viteLicense] = await Promise.all([
  readFile('node_modules/three/LICENSE', 'utf8'),
  readFile('node_modules/vite/LICENSE.md', 'utf8'),
]);
const notices = `CHRONOS — THIRD-PARTY NOTICES\n\nThree.js\n${threeLicense}\n\nVite module-preload polyfill\n${viteLicense.split('\n# Licenses of bundled dependencies')[0]}\n`;
assert(!notices.includes('-->'), 'License text must remain inside its HTML comment.');
offline = offline.replace('</head>', () => `<!--\n${notices}\n-->\n</head>`);
await writeFile('THIRD-PARTY-NOTICES.txt', notices, 'utf8');
assert(!/<script\b[^>]*\bsrc=|<link\b[^>]*\brel="stylesheet"/.test(offline), 'Offline output must not fetch scripts or styles.');
assert(!/\bfrom\s*["']\.?\.?\//.test(offline), 'Offline output must not import another JavaScript file.');
assert(Buffer.byteLength(offline) < 1_000_000, 'Keep the complete game under 1 MB.');
const embedded = offline.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert(embedded, 'The offline game must contain its program.');
const syntax = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: embedded, encoding: 'utf8' });
assert.equal(syntax.status, 0, `Packaged JavaScript must parse: ${syntax.stderr?.slice(0, 200)}`);
await writeFile('CHRONOS.html', offline, 'utf8');
await writeFile('dist/CHRONOS.html', offline, 'utf8');
console.log(`Offline game: CHRONOS.html (${Math.round(Buffer.byteLength(offline) / 1024)} KB; no server required)`);
