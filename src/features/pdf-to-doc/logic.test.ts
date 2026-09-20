/**
 * Unit tests for the PDF → DOCX/ODT text-flow reconstruction and writers.
 *
 * Everything here is pure (no DOM, no pdfjs): we feed synthetic raw text
 * items and validate the reconstructed document and the emitted archives.
 */
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { type DocParagraph, itemsToBlocks, type RawTextItem, writeDocx, writeOdt } from './logic';

/** Build a raw text item with sensible defaults. */
function item(str: string, x: number, y: number, opts: Partial<RawTextItem> = {}): RawTextItem {
  const size = opts.size ?? 11;
  // Rough glyph width: ~0.5em per char.
  const w = str.length * size * 0.5;
  return {
    str,
    x,
    y,
    w,
    h: size * 1.2,
    size,
    fontName: opts.fontName ?? 'F1+Helvetica',
    hasEOL: opts.hasEOL ?? false,
    ...(opts.w !== undefined ? { w: opts.w } : {}),
  };
}

/** Walk a ZIP's local file headers in order. */
function zipEntries(data: Uint8Array): { name: string; method: number }[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out: { name: string; method: number }[] = [];
  let off = 0;
  while (off + 30 <= data.length) {
    if (view.getUint32(off, true) !== 0x04034b50) break;
    const method = view.getUint16(off + 8, true);
    const nameLen = view.getUint16(off + 26, true);
    const extraLen = view.getUint16(off + 28, true);
    const compSize = view.getUint32(off + 18, true);
    const name = new TextDecoder().decode(data.subarray(off + 30, off + 30 + nameLen));
    out.push({ name, method });
    off += 30 + nameLen + extraLen + compSize;
  }
  return out;
}

describe('itemsToBlocks', () => {
  it('groups wrapped lines into one paragraph', () => {
    // Two lines at ~14pt baseline gap (one line-height) — same paragraph.
    const page = [
      item('Hello world this', 72, 700),
      item('is the first', 72 + 16 * 11 * 0.5 + 6, 700),
      item('paragraph of text', 72, 686),
    ];
    const doc = itemsToBlocks([page]);
    const paras = doc.blocks.filter((b): b is DocParagraph => b.type !== 'pagebreak');
    expect(paras).toHaveLength(1);
    const text = paras[0]!.runs.map((r) => r.text).join('');
    expect(text).toContain('Hello world this is the first paragraph');
  });

  it('starts a new paragraph on a large vertical gap', () => {
    const page = [
      item('First paragraph here', 72, 700),
      item('Second paragraph below', 72, 650), // 50pt gap >> 1.4 * 11
    ];
    const doc = itemsToBlocks([page]);
    const paras = doc.blocks.filter((b): b is DocParagraph => b.type !== 'pagebreak');
    expect(paras).toHaveLength(2);
    expect(paras[0]!.runs.some((r) => r.text.includes('First'))).toBe(true);
    expect(paras[1]!.runs.some((r) => r.text.includes('Second'))).toBe(true);
  });

  it('detects headings by font size and bold', () => {
    const page1 = [
      item('Big Title', 72, 720, { size: 24, fontName: 'B1+Helvetica-Bold' }),
      item('Body text under the title.', 72, 700),
      item('More body text continues.', 72, 686),
    ];
    const doc = itemsToBlocks([page1]);
    const paras = doc.blocks.filter((b): b is DocParagraph => b.type !== 'pagebreak');

    expect(paras).toHaveLength(2);
    expect(paras[0]!.heading).toBe(1); // 24pt vs 11pt body → h1
    expect(paras[0]!.runs[0]!.bold).toBe(true);
    expect(paras[1]!.heading).toBe(0);
  });

  it('inserts a page break between pages that both have content', () => {
    const doc = itemsToBlocks([[item('Page one', 72, 700)], [item('Page two', 72, 700)]]);
    const paras = doc.blocks.filter((b): b is DocParagraph => b.type !== 'pagebreak');
    const breaks = doc.blocks.filter((b) => b.type === 'pagebreak');
    expect(paras).toHaveLength(2);
    expect(breaks).toHaveLength(1);
    // The break sits between the two paragraphs.
    expect(doc.blocks[1]!.type).toBe('pagebreak');
  });

  it('produces nothing for empty pages', () => {
    const doc = itemsToBlocks([[], []]);
    expect(doc.blocks).toHaveLength(0);
  });

  it('keeps bold/italic styling from font names', () => {
    const page = [
      item('normal', 72, 700),
      item('bold part', 200, 700, { fontName: 'F2+Helvetica-Bold' }),
    ];
    const doc = itemsToBlocks([page]);
    const p = doc.blocks.find((b): b is DocParagraph => b.type !== 'pagebreak');
    expect(p).toBeDefined();
    const texts = p!.runs.map((r) => `${r.text}:${r.bold ? 'b' : ''}${r.italic ? 'i' : ''}`);
    expect(texts).toContain(' bold part:b'); // space prefix from the x-gap
  });
});

describe('writeDocx', () => {
  const doc = itemsToBlocks([
    [
      item('Doc Title', 72, 720, { size: 22, fontName: 'F+Helvetica-Bold' }),
      item('Some <body> & "quoted" text', 72, 700),
    ],
  ]);

  it('produces a valid ZIP with the OOXML parts', () => {
    const bytes = writeDocx(doc);
    const zip = unzipSync(bytes);
    expect(Object.keys(zip)).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        '_rels/.rels',
        'word/document.xml',
        'word/styles.xml',
      ]),
    );
    const document = new TextDecoder().decode(zip['word/document.xml']!);
    expect(document).toContain('<w:document');
    // XML escaping applied.
    expect(document).toContain('Some &lt;body&gt; &amp; &quot;quoted&quot; text');
    // Heading style reference for the title.
    expect(document).toContain('<w:pStyle w:val="Heading1"/>');
    // Bold run for the bold title.
    expect(document).toContain('<w:b/>');
  });

  it('emits page breaks for multi-page documents', () => {
    const twoPages = itemsToBlocks([[item('Page one', 72, 700)], [item('Page two', 72, 700)]]);
    const document = new TextDecoder().decode(unzipSync(writeDocx(twoPages))['word/document.xml']!);
    expect(document).toContain('<w:br w:type="page"/>');
  });
});

describe('writeOdt', () => {
  const doc = itemsToBlocks([
    [
      item('Doc Title', 72, 720, { size: 22, fontName: 'F+Helvetica-Bold' }),
      item('Some <body> & "quoted" text', 72, 700),
    ],
  ]);

  it('produces a valid ZIP with the ODF parts', () => {
    const bytes = writeOdt(doc);
    const zip = unzipSync(bytes);
    expect(Object.keys(zip)).toEqual(
      expect.arrayContaining([
        'mimetype',
        'META-INF/manifest.xml',
        'content.xml',
        'styles.xml',
        'meta.xml',
      ]),
    );
    expect(new TextDecoder().decode(zip.mimetype!)).toBe('application/vnd.oasis.opendocument.text');
    const content = new TextDecoder().decode(zip['content.xml']!);
    expect(content).toContain('<office:document-content');
    expect(content).toContain('Some &lt;body&gt; &amp; &quot;quoted&quot; text');
    expect(content).toContain('text:style-name="H1"');
  });

  it('writes mimetype first and stored (uncompressed) per the ODF spec', () => {
    const entries = zipEntries(writeOdt(doc));
    expect(entries[0]!.name).toBe('mimetype');
    expect(entries[0]!.method).toBe(0); // 0 = stored
    // Other entries are deflated.
    const content = entries.find((e) => e.name === 'content.xml');
    expect(content!.method).toBe(8); // 8 = deflated
  });
});
