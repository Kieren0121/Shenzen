// Bundles the TypeScript sources into ONE classic (non-module) script and
// inlines it, with the CSS, into a single self-contained HTML file that opens
// from file:// with no server, no network and no external assets.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist/EBN_Geography_China_Week3_3D.html');
const minify = !process.argv.includes('--dev');

const result = await build({
  entryPoints: [resolve(root, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome100', 'edge100'],
  minify,
  sourcemap: false,
  write: false,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
let js = result.outputFiles[0].text;
// Guard against premature </script> termination inside the inline script.
js = js.replace(/<\/script/gi, '<\\/script');
if (/\bimport\s*\(/.test(js)) throw new Error('Bundle contains a dynamic import() - not allowed for file:// delivery');
if (/fetch\s*\(/.test(js)) console.warn('Note: bundle contains the identifier fetch( (from library code paths not used at runtime).');
const css = readFileSync(resolve(root, 'src/styles.css'), 'utf8');
const banner = `/* EBN Geography | China Week 3 | 3D teaching application. Built ${new Date().toISOString().slice(0, 10)}.
   Includes three.js r170 (MIT License, Copyright 2010-2024 three.js authors). */\n`;
const html = readFileSync(resolve(root, 'build/template.html'), 'utf8')
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => banner + js);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`Built ${out} (${(statSync(out).size / 1024 / 1024).toFixed(2)} MB)`);
