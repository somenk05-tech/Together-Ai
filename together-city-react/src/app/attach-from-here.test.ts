import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * AN ATTACHMENT PICKER THAT CANNOT ATTACH FROM THE DEVICE.
 *
 * DrivePicker browsed the citizen's Drive and nothing else, and its empty state
 * read "This folder is empty. Upload files in Drive first." — a dialog opened
 * from Compose telling somebody to leave, go elsewhere, do a thing and come
 * back, for the single most common reason anyone opens an attachment picker.
 */
describe('the attachment picker can put a file in Drive itself', () => {
  const src = strip(read('src/features/mail/DrivePicker.tsx'));

  it('has a real file input and an upload path', () => {
    expect(src).toMatch(/type="file"/);
    expect(src).toMatch(/useUploadFile\(\)/);
    expect(src).toMatch(/upload\.mutateAsync\(/);
  });

  it('uploads into the folder being browsed, not the root', () => {
    // Browsing to a folder and having the file land somewhere else is the kind
    // of quiet wrong that makes people stop trusting a file picker.
    expect(src).toMatch(/mutateAsync\(\{\s*file:[^}]*folderId\s*\}\)/);
  });

  it('selects what was just uploaded, so the next click is Attach', () => {
    expect(src).toMatch(/setSelected\(\(cur\) => \(\{ \.\.\.cur, \[saved\.id\]: saved \}\)\)/);
  });

  it('stops on the first failure and says which file, rather than pressing on', () => {
    const loop = src.slice(src.indexOf('const onFiles'), src.indexOf('if (fileInput.current)'));
    expect(loop).toMatch(/setError\(/);
    expect(loop).toMatch(/\bbreak;/);
  });

  it('clears the input so the same file can be chosen twice', () => {
    // Without this, picking a file, removing it, and picking it again fires no
    // change event at all and the dialog looks broken.
    expect(src).toMatch(/fileInput\.current\.value = ''/);
  });

  it('no longer sends anybody to Drive to do it', () => {
    expect(src).not.toMatch(/Upload files in <strong>Drive<\/strong> first/);
  });

  it('cannot attach or re-upload while an upload is running', () => {
    // Attaching mid-upload would send the message with only the files that
    // happened to have finished.
    expect(src).toMatch(/disabled=\{!chosen\.length \|\| Boolean\(busyMsg\)\}/);
  });
});
