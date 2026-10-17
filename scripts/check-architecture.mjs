import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const violations = [];
const layers = ['domain', 'application', 'infrastructure', 'presentation'];
const allowed = { domain: ['domain'], application: ['domain', 'application'], infrastructure: ['domain', 'application', 'infrastructure'], presentation: layers };
async function walk(dir) { for (const entry of await readdir(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) await walk(file); else if (/\.tsx?$/.test(file) && !file.endsWith('.test.ts')) { const layer = file.split(path.sep)[1]; const source = await readFile(file, 'utf8'); for (const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) { const specifier = match[1]; if (specifier.startsWith('.')) { const target = path.normalize(path.join(path.dirname(file), specifier)).split(path.sep)[1]; if (allowed[layer] && !allowed[layer].includes(target)) violations.push(`${file}: forbidden dependency on ${target}`); } else if (layer === 'domain') violations.push(`${file}: domain must have no external dependencies`); } } } }
await walk('src');
if (violations.length) { console.error(violations.join('\n')); process.exitCode = 1; } else console.log('Architecture check passed: domain independence and inward layer boundaries.');
