import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Single source of truth for the backend version — read from package.json at
// runtime. `../package.json` resolves the same from src/ (dev, tsx) and dist/
// (prod), since both sit directly under the package root. Falls back gracefully
// if the file isn't present next to the build.
function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const VERSION: string = readVersion();
