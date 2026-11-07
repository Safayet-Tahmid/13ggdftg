// Downloads the published site data (GitHub release "site-data", file site_data.zip) into
// web/public/data so `npm run dev` shows the real record. Run: npm run get-data
// Works on Windows, macOS, Linux and Codespaces. The data is never committed (public/data is ignored).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const URL_ZIP = process.env.SHIFT_DATA_URL
  || 'https://github.com/squadronzero/squadron-zero/releases/download/site-data/site_data.zip';
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

console.log(`Downloading ${URL_ZIP} (about 150 MB, may take a few minutes)…`);
const res = await fetch(URL_ZIP, { redirect: 'follow' });
if (!res.ok) {
  console.error(`Download failed: HTTP ${res.status}. Check your internet connection, or download the file in a browser and unzip it into web/public/data.`);
  process.exit(1);
}
const zip = new Uint8Array(await res.arrayBuffer());
console.log(`Got ${(zip.length / 1e6).toFixed(0)} MB. Unpacking into public/data…`);
rmSync(out, { recursive: true, force: true });
const files = unzipSync(zip);
let n = 0;
for (const [name, data] of Object.entries(files)) {
  if (name.endsWith('/')) continue;
  const p = join(out, name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
  n++;
}
console.log(`Done: ${n} files. Now run: npm run dev`);
