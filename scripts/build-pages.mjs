import { mkdir, readFile, rm, writeFile, copyFile, readdir } from 'node:fs/promises';
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
const assetsDir = resolve(repoRoot, 'assets');
const distAssetsDir = resolve(distDir, 'assets');
const manifestSrc = resolve(repoRoot, 'manifest.json');
const swSrc = resolve(repoRoot, 'sw.js');

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

const html = await readFile(browserHtmlPath, 'utf8');
const pageHtml = html.replace('./out/browser/browser.js', './browser.js');

await writeFile(distIndexPath, pageHtml, 'utf8');
await copyFile(browserBundlePath, distBundlePath);
await writeFile(noJekyllPath, '', 'utf8');

// Copy PWA files
await copyFile(manifestSrc, resolve(distDir, 'manifest.json'));
await copyFile(swSrc, resolve(distDir, 'sw.js'));

// Copy assets folder (images, etc.)
try {
	const files = await readdir(assetsDir);
	await mkdir(distAssetsDir, { recursive: true });
	for (const file of files) {
		await copyFile(resolve(assetsDir, file), resolve(distAssetsDir, file));
	}
	console.log(`Copied ${files.length} asset(s) to dist/assets/`);
} catch {
	// no assets directory, skip
}

console.log('Prepared GitHub Pages artifact in dist/');
