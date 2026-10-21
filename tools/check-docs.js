import fs from 'node:fs';
import path from 'node:path';

const errors = [], files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'logs'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith('.md')) files.push(file);
  }
}
walk('.');
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  if ((text.match(/^```/gm) ?? []).length % 2) errors.push(`${file}: unbalanced code fences`);
  for (const [, link] of text.matchAll(/\]\(([^)]+)\)/g)) {
    if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(link)) continue;
    const target = decodeURIComponent(link.split('#')[0]);
    if (target && !fs.existsSync(path.resolve(path.dirname(file), target))) errors.push(`${file}: missing ${target}`);
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Checked local links and code fences in ${files.length} Markdown files.`);
