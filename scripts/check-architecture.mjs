import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
const violations = [];
const layers = ['domain', 'application', 'infrastructure', 'presentation'];
const allowed = { domain: ['domain'], application: ['domain', 'application'], infrastructure: ['domain', 'application', 'infrastructure'], presentation: layers };
async function walk(dir) { for (const entry of await readdir(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) await walk(file); else if (/\.tsx?$/.test(file) && !file.endsWith('.test.ts')) { const layer = file.split(path.sep)[1]; const source = await readFile(file, 'utf8'); for (const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) { const specifier = match[1]; if (/(?:^@netlify\/database$|^drizzle-orm(?:\/|$)|(?:^|\/)db(?:\/|$))/.test(specifier)) violations.push(`${file}: offline persistence cannot be imported into runtime composition`); if (specifier.startsWith('.')) { const target = path.normalize(path.join(path.dirname(file), specifier)).split(path.sep)[1]; if (allowed[layer] && !allowed[layer].includes(target)) violations.push(`${file}: forbidden dependency on ${target}`); } else if (layer === 'domain') violations.push(`${file}: domain must have no external dependencies`); } } } }
await walk('src');
await walk('netlify/functions');
for (const candidate of ['drizzle.config.ts', 'drizzle.config.js', 'netlify/database/migrations']) {
  try { await access(candidate); violations.push(`${candidate}: Sprint 2 migrations must remain quarantined`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const scripts = JSON.parse(await readFile('package.json', 'utf8')).scripts;
for (const [name, command] of Object.entries(scripts)) {
  if (/drizzle|migrat|disposable|netlify\s+db/.test(command)) violations.push(`${name}: automatic persistence execution is prohibited in Sprint 2`);
}
if (violations.length) { console.error(violations.join('\n')); process.exitCode = 1; } else console.log('Architecture check passed: domain independence and inward layer boundaries.');
