// Prepend a Node shebang to the built entry so it works as an installed `bin`.
// tsc doesn't emit shebangs; run after `tsc` (see package.json "build").
import { readFileSync, writeFileSync } from 'node:fs';

const entry = new URL('../dist/index.js', import.meta.url);
const shebang = '#!/usr/bin/env node\n';
const src = readFileSync(entry, 'utf8');

if (!src.startsWith(shebang)) {
  writeFileSync(entry, shebang + src);
  console.error('[build] prepended shebang to dist/index.js');
} else {
  console.error('[build] shebang already present');
}
