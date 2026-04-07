import { mkdir, readFile, rm, writeFile, copyFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const browserHtmlPath = resolve(repoRoot, 'browser.html');
const browserBundlePath = resolve(repoRoot, 'out', 'browser', 'browser.js');
const distDir = resolve(repoRoot, 'dist');
const distIndexPath = resolve(distDir, 'index.html');
const distVersionPath = resolve(distDir, 'version.json');
const noJekyllPath = resolve(distDir, '.nojekyll');
const assetsDir = resolve(repoRoot, 'assets');
const distAssetsDir = resolve(distDir, 'assets');
const manifestSrc = resolve(repoRoot, 'manifest.json');
const swSrc = resolve(repoRoot, 'sw.js');

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

const html = await readFile(browserHtmlPath, 'utf8');
const browserBundle = await readFile(browserBundlePath);
const bundleHash = createHash('sha256').update(browserBundle).digest('hex').slice(0, 12);
const versionedBundleName = `browser.${bundleHash}.js`;
const distBundlePath = resolve(distDir, versionedBundleName);

const pageHtml = html.replace('./out/browser/browser.js', `./${versionedBundleName}`);

const packageJson = JSON.parse(await readFile(resolve(repoRoot, 'package.json'), 'utf8'));
const deployMessage = process.env.DEPLOY_MESSAGE?.trim() || 'A new app build is available.';
const pushApiUrl = process.env.PUSH_API_URL?.trim() || '';
const pushVapidPublicKey = process.env.PUSH_VAPID_PUBLIC_KEY?.trim() || '';
const gitSha = process.env.GITHUB_SHA?.trim() || (() => {
	try {
		return execSync('git rev-parse --short HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').trim();
	} catch {
		return 'unknown';
	}
})();

const versionMetadata = {
	appVersion: packageJson.version,
	buildId: bundleHash,
	commitSha: gitSha,
	buildTimeUtc: new Date().toISOString(),
	message: deployMessage,
	...(pushApiUrl ? { pushApiUrl } : {}),
	...(pushVapidPublicKey ? { pushVapidPublicKey } : {}),
};

await writeFile(distIndexPath, pageHtml, 'utf8');
await writeFile(distBundlePath, browserBundle);
await writeFile(distVersionPath, JSON.stringify(versionMetadata, null, 2), 'utf8');
await writeFile(noJekyllPath, '', 'utf8');

// Copy PWA files
await copyFile(manifestSrc, resolve(distDir, 'manifest.json'));
const swTemplate = await readFile(swSrc, 'utf8');
const swContent = swTemplate.replace('__APP_VERSION__', bundleHash);
await writeFile(resolve(distDir, 'sw.js'), swContent, 'utf8');

// Copy assets folder (images, etc.) — files only, skip subdirectories
try {
	const entries = await readdir(assetsDir, { withFileTypes: true });
	const files = entries.filter(e => e.isFile());
	await mkdir(distAssetsDir, { recursive: true });
	for (const file of files) {
		await copyFile(resolve(assetsDir, file.name), resolve(distAssetsDir, file.name));
	}
	console.log(`Copied ${files.length} asset(s) to dist/assets/`);
} catch {
	// no assets directory, skip
}

console.log('Prepared GitHub Pages artifact in dist/');
