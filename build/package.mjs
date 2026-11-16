// Creates dist/EBN_Geography_China_Week3_Source.zip (source for future modification).
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const zip = resolve(root, 'dist/EBN_Geography_China_Week3_Source.zip');
if (existsSync(zip)) rmSync(zip);
const files = ['src', 'tests/model.test.ts', 'tests/e2e.mjs', 'build', 'package.json', 'package-lock.json', 'tsconfig.json', 'README.md', 'QUALITY_REPORT.md', 'LICENSES.md', '.gitignore', 'tests/output/screens', 'tests/output/e2e-results.json'];
execFileSync('zip', ['-r', '-q', '-X', zip, ...files.filter((f) => existsSync(resolve(root, f)))], { cwd: root, stdio: 'inherit' });
console.log(`Packaged ${zip}`);
