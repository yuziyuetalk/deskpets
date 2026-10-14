const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

if (process.platform !== 'darwin') throw new Error('macOS helper can only be built on macOS');

const root = path.join(__dirname, '..');
const outputDir = path.join(root, 'build', 'mac');
fs.mkdirSync(outputDir, { recursive: true });
for (const name of ['set-wallpaper', 'fullscreen-monitor']) {
  const result = spawnSync('clang', [
    '-arch', 'arm64', '-arch', 'x86_64', '-mmacosx-version-min=11.0',
    '-framework', 'AppKit', '-framework', 'CoreGraphics',
    '-o', path.join(outputDir, name),
    path.join(root, 'scripts', 'mac', `${name}.m`)
  ], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
