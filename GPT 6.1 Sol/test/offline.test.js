import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { Script } from 'node:vm';
import { buildBundle } from '../build.js';

const file = relative => new URL(relative, import.meta.url);

test('the shipped offline bundle matches the source and parses as a classic script', async () => {
  const bundle = await readFile(file('../src/game.bundle.js'), 'utf8');
  assert.equal(bundle, await buildBundle());
  assert.doesNotThrow(() => new Script(bundle));
  assert.doesNotMatch(bundle, /^\s*(?:import|export)\s/m);
  assert.doesNotMatch(bundle, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/);
});

test('the HTML loads only local styles and classic scripts', async () => {
  const html = await readFile(file('../index.html'), 'utf8');
  assert.match(html, /<script defer src="\.\/src\/game\.bundle\.js"><\/script>/);
  assert.doesNotMatch(html, /type="module"/);
  assert.doesNotMatch(html, /(?:src|href)="https?:\/\//);
  for (const [, relative] of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) {
    await access(file(`../${relative}`));
  }
});

test('both font families and their licenses are bundled, with no remote stylesheet imports', async () => {
  const css = await readFile(file('../src/style.css'), 'utf8');
  assert.doesNotMatch(css, /@import|url\(['"]?https?:/);
  for (const family of ['dm-sans', 'space-grotesk']) {
    const font = await readFile(file(`../assets/fonts/${family}.ttf`));
    assert.ok(font.length > 10000);
    assert.equal(font.readUInt32BE(0), 0x00010000, 'valid TrueType header');
    const license = await readFile(file(`../assets/fonts/${family}-OFL.txt`), 'utf8');
    assert.match(license, /SIL OPEN FONT LICENSE/);
  }
});
