import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const include = ['README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'package.json', 'package-lock.json', '.gitignore', '.github', 'docs', 'spec', 'schemas', 'examples', 'conformance', 'src', 'test', 'tools'];

function tarEntry(name, bytes, executable = false) {
  const header = Buffer.alloc(512);
  const set = (offset, length, value) => { if (Buffer.byteLength(value) > length) throw Error(`Tar field too long: ${name}`); header.write(value, offset, length, 'utf8'); };
  const octal = (offset, length, value) => set(offset, length, value.toString(8).padStart(length - 1, '0') + '\0');
  if (Buffer.byteLength(name) > 100) {
    const split = name.lastIndexOf('/');
    set(0, 100, name.slice(split + 1)); set(345, 155, name.slice(0, split));
  } else set(0, 100, name);
  octal(100, 8, executable ? 0o755 : 0o644); octal(108, 8, 0); octal(116, 8, 0);
  octal(124, 12, bytes.length); octal(136, 12, 0);
  header.fill(32, 148, 156); set(156, 1, '0'); set(257, 6, 'ustar\0'); set(263, 2, '00');
  const checksum = header.reduce((sum, value) => sum + value, 0);
  set(148, 8, checksum.toString(8).padStart(6, '0') + '\0 ');
  return Buffer.concat([header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512)]);
}

export function buildRelease(directory = path.join(root, 'dist')) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const prefix = `${pkg.name}-${pkg.version}`;
  if (!/^[a-z0-9.-]+$/.test(prefix)) throw Error('Release archive name must be a safe filename');
  const files = [];
  function collect(relative) {
    const actual = path.join(root, relative), stat = fs.lstatSync(actual);
    if (stat.isSymbolicLink()) throw Error(`Release input cannot be a symlink: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(actual).sort()) {
        if (name === '.DS_Store') continue;
        collect(`${relative}/${name}`);
      }
    } else if (stat.isFile()) files.push(relative);
    else throw Error(`Unexpected release input: ${relative}`);
  }
  for (const file of include) collect(file);
  files.sort();
  const manifest = { name: pkg.name, version: pkg.version, license: pkg.license, files: [] };
  const entries = files.map(file => {
    const bytes = fs.readFileSync(path.join(root, file));
    manifest.files.push({ path: file, byteLength: bytes.length, sha256: sha(bytes) });
    return tarEntry(`${prefix}/${file}`, bytes, file === 'src/cli.js');
  });
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  entries.push(tarEntry(`${prefix}/RELEASE_MANIFEST.json`, manifestBytes));
  const archive = gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]), { level: 9 });
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${prefix}.tar.gz`), archive);
  fs.writeFileSync(path.join(directory, 'release-manifest.json'), manifestBytes);
  fs.writeFileSync(path.join(directory, 'SHA256SUMS'), `${sha(archive)}  ${prefix}.tar.gz\n${sha(manifestBytes)}  release-manifest.json\n`);
  return { archive: path.join(directory, `${prefix}.tar.gz`), sha256: sha(archive), fileCount: files.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(buildRelease(), null, 2));
