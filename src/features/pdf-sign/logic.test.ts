import { describe, expect, it } from 'vitest';
import { looksLikeXfa } from '~/features/pdf-sign/logic';

describe('looksLikeXfa', () => {
  it('detects the /XFA marker in the document head', () => {
    const data = new TextEncoder().encode(
      '%PDF-1.7\n... <</Type /Catalog /Pages 2 0 R /XFA <</XML xref>> ...',
    );
    expect(looksLikeXfa(data.buffer as ArrayBuffer)).toBe(true);
  });
  it('returns false for ordinary PDFs', () => {
    const data = new TextEncoder().encode('%PDF-1.7\n<</Type /Catalog /Pages 2 0 R>>\n%%EOF');
    expect(looksLikeXfa(data.buffer as ArrayBuffer)).toBe(false);
  });
  it('handles empty buffers', () => {
    expect(looksLikeXfa(new ArrayBuffer(0))).toBe(false);
  });
});
