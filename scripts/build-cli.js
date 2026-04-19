import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const projectRoot = path.join(scriptDir, '..');

console.log('Building Q3Gen CLI...');

// Build core package
console.log('Building @q3gen/core...');
execSync('pnpm -C packages/core build', { stdio: 'inherit' });

// Build CLI package
console.log('Building @q3gen/cli...');
execSync('pnpm -C packages/cli build', { stdio: 'inherit' });

// Make CLI executable
const cliIndexPath = path.join(projectRoot, 'packages/cli/dist/index.js');
if (fs.existsSync(cliIndexPath)) {
  const content = fs.readFileSync(cliIndexPath, 'utf-8');
  fs.writeFileSync(
    cliIndexPath,
    `#!/usr/bin/env node\n${content.replace(/^#!.*\n/, '')}`,
    'utf-8'
  );
  fs.chmodSync(cliIndexPath, '755');
  console.log('✓ CLI executable created');
}

console.log('✓ Build complete!');
