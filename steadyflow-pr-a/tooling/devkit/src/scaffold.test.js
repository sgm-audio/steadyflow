import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scaffold, toSlug, toPhpClass, SCAFFOLD_KINDS } from './scaffold.js';

test('toSlug normalizes names', () => {
  assert.equal(toSlug('My Cool Theme'), 'my-cool-theme');
  assert.equal(toPhpClass('my-cool-theme'), 'My_Cool_Theme');
});

test('scaffolds every kind into a temp directory', () => {
  for (const kind of SCAFFOLD_KINDS) {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), `sf-devkit-${kind}-`));
    fs.rmSync(dest, { recursive: true, force: true });
    const result = scaffold({ kind, dest, name: `demo-${kind}` });
    assert.equal(result.kind, kind);
    assert.ok(fs.existsSync(result.dest));
    const entries = fs.readdirSync(result.dest);
    assert.ok(entries.length > 0, `${kind} should write files`);
    fs.rmSync(result.dest, { recursive: true, force: true });
  }
});
