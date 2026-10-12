// Assemble the static site for GitHub Pages: client/ at the root, shared/ next to it.
import { cpSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');

rmSync(out, { recursive: true, force: true });
cpSync(path.join(root, 'client'), out, { recursive: true });
cpSync(path.join(root, 'shared'), path.join(out, 'shared'), { recursive: true });
console.log(`Built ${path.relative(root, out)}/`);
