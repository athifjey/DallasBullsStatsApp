import { mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const browserHtmlPath = resolve(repoRoot, 'browser.html');
const browserBundlePath = resolve(repoRoot, 'out', 'browser', 'browser.js');
const distDir = resolve(repoRoot, 'dist');
const distIndexPath = resolve(distDir, 'index.html');
const distBundlePath = resolve(distDir, 'browser.js');
const noJekyllPath = resolve(distDir, '.nojekyll');

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

const html = await readFile(browserHtmlPath, 'utf8');
const pageHtml = html.replace('./out/browser/browser.js', './browser.js');

await writeFile(distIndexPath, pageHtml, 'utf8');
await copyFile(browserBundlePath, distBundlePath);
await writeFile(noJekyllPath, '', 'utf8');

console.log('Prepared GitHub Pages artifact in dist/');
