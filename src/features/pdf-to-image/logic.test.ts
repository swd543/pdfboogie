import { describe, expect, it } from 'vitest';
import { pageFileName, resolveRange } from '~/features/pdf-to-image/logic';

describe('resolveRange', () => {
  it('defaults to the whole document', () => {
    expect(resolveRange(undefined, undefined, 10)).toEqual({ first: 1, last: 10 });
  });
  it('clamps to valid bounds', () => {
    expect(resolveRange(0, 99, 10)).toEqual({ first: 1, last: 10 });
    expect(resolveRange(3, 7, 10)).toEqual({ first: 3, last: 7 });
  });
  it('never returns an inverted range', () => {
    expect(resolveRange(7, 3, 10)).toEqual({ first: 3, last: 7 });
  });
  it('handles single-page documents', () => {
    expect(resolveRange(2, 5, 1)).toEqual({ first: 1, last: 1 });
  });
});

describe('pageFileName', () => {
  it('strips the .pdf suffix and pads page numbers', () => {
    expect(pageFileName('doc.pdf', 3, 'png', true)).toBe('doc-page-003.png');
    expect(pageFileName('doc.pdf', 1, 'jpeg', false)).toBe('doc.jpeg');
  });
  it('falls back for empty names', () => {
    expect(pageFileName('', 1, 'png', false)).toBe('document.png');
    expect(pageFileName('noext', 2, 'webp', true)).toBe('noext-page-002.webp');
  });
});
