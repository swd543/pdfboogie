import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { makeZip } from '~/lib/zip';

describe('makeZip', () => {
  it('produces a valid ZIP with the expected entries', () => {
    const out = makeZip([
      { path: 'a.txt', data: new TextEncoder().encode('alpha') },
      { path: 'sub/b.txt', data: new TextEncoder().encode('beta') },
    ]);
    expect(out[0]).toBe(0x50); // 'P'
    expect(out[1]).toBe(0x4b); // 'K'
    const entries = unzipSync(out);
    expect(Object.keys(entries).sort()).toEqual(['a.txt', 'sub/b.txt']);
    expect(new TextDecoder().decode(entries['a.txt']!)).toBe('alpha');
    expect(new TextDecoder().decode(entries['sub/b.txt']!)).toBe('beta');
  });
});
