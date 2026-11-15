// Bundles tests/model.test.ts for Node and runs it with the built-in test runner.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(resolve(root, 'tests/output'), { recursive: true });
const out = resolve(root, 'tests/output/model.test.mjs');
await build({ entryPoints: [resolve(root, 'tests/model.test.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning' });
const r = spawnSync(process.execPath, ['--test', out], { stdio: 'inherit' });
process.exit(r.status ?? 1);
