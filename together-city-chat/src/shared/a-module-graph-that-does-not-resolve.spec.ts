/**
 * A green suite is not a build.
 *
 * `social.module.ts` imported `AdminModule` from a file that exports
 * `AdminConsoleModule`. Every test in the repository passed — ts-jest
 * transpiles each file on its own and never resolves the module graph — while
 * `nest build` failed and the API would not have booted. That is the third
 * time in a week a guard was green and dead, and the first two were caught by
 * somebody reading rather than by anything running.
 *
 * So: one text-level check over the wiring that jest is structurally unable to
 * see. It is not a typechecker and does not pretend to be. It answers exactly
 * one question — does every name a module imports from another module file
 * actually exist there — because that is the question whose wrong answer costs
 * a deploy.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..');

function moduleFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) moduleFiles(full, out);
    else if (e.name.endsWith('.module.ts')) out.push(full);
  }
  return out;
}

/** `import { A, B } from '../x/y.module';` → [{ names: ['A','B'], from: '../x/y.module' }] */
function moduleImports(src: string): Array<{ names: string[]; from: string }> {
  const out: Array<{ names: string[]; from: string }> = [];
  const re = /import\s*\{([^}]+)\}\s*from\s*'([^']*\.module)'/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    out.push({
      names: m[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean),
      from: m[2],
    });
  }
  return out;
}

describe('every module imports a name its target actually exports', () => {
  const files = moduleFiles(SRC);

  it('finds the module files at all — a check over nothing passes vacuously', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [path.relative(SRC, f), f]))('%s', (_rel, file) => {
    const src = fs.readFileSync(file, 'utf8');
    for (const imp of moduleImports(src)) {
      const target = path.resolve(path.dirname(file), `${imp.from}.ts`);
      expect({ file: _rel, imports: imp.from, exists: fs.existsSync(target) })
        .toEqual({ file: _rel, imports: imp.from, exists: true });
      const targetSrc = fs.readFileSync(target, 'utf8');
      for (const name of imp.names) {
        // `export class X` or `export { X }` — the two shapes this repo uses.
        const exported = new RegExp(`export\\s+(?:abstract\\s+)?class\\s+${name}\\b`).test(targetSrc)
          || new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(targetSrc);
        expect({ file: _rel, from: imp.from, name, exported })
          .toEqual({ file: _rel, from: imp.from, name, exported: true });
      }
    }
  });
});
