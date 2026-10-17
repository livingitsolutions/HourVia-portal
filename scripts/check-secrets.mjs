import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const ignored = new Set(['.git', '.netlify', 'node_modules', 'dist']);
const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /gh[pousr]_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{30,}/, /AKIA[A-Z0-9]{16}/, /sk-(?:proj-)?[A-Za-z0-9_-]{24,}/, /https?:\/\/[^\s/@:]+:[^\s/@]+@/, /(?:password|api[_-]?key|secret|access[_-]?token)\s*[:=]\s*["'][^"'\s]{8,}["']/i];
const findings = [];
async function walk(dir) { for (const entry of await readdir(dir, { withFileTypes: true })) { if (ignored.has(entry.name)) continue; const file = path.join(dir, entry.name); if (entry.isDirectory()) await walk(file); else { if (/^\.env(?:\.|$)/.test(entry.name) && entry.name !== '.env.example') findings.push(file); const data = await readFile(file); if (data.includes(0)) continue; const source = data.toString('utf8'); if (patterns.some(pattern => pattern.test(source))) findings.push(file); } } }
await walk('.');
if (findings.length) { console.error('Potential credentials detected; values suppressed. Review: ' + [...new Set(findings)].join(', ')); process.exitCode = 1; } else console.log('Secret scan passed: no supported credential patterns or environment files found.');
