import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { mergeFiles } from './logic';

async function pdfWithSize(w: number, h: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([w, h]);
  page.drawText(`page ${w}×${h}`, { x: 50, y: 100, size: 12, font });
  return new Uint8Array(await doc.save());
}

/** Minimal but structurally valid JPEG: SOI + APP1(EXIF o=1) + SOF0 + SOS + EOI. */
function syntheticJpeg(): Uint8Array<ArrayBuffer> {
  // SOF0: 640×480, 8-bit, RGB (3 components)
  const sof = [
    0xff,
    0xc0, // SOF0
    0x00,
    0x11, // length 17
    0x08, // 8-bit precision
    0x01,
    0xe0, // height 480
    0x02,
    0x80, // width 640
    0x03, // 3 components
    0x01,
    0x22,
    0x00, // Y
    0x02,
    0x11,
    0x00, // Cb
    0x03,
    0x11,
    0x00, // Cr
  ];
  const soi = [0xff, 0xd8];
  const sos = [0xff, 0xda, 0x00, 0x04, 0x00, 0x00];
  const eoi = [0xff, 0xd9];
  const buf = new Uint8Array([...soi, ...sof, ...sos, ...eoi] as number[]);
  return buf;
}

describe('mergeFiles', () => {
  it('merges PDFs and images in the given order', async () => {
    const a = await pdfWithSize(500, 600);
    const b = await pdfWithSize(700, 400);
    const jpeg = new File([syntheticJpeg()], 'photo.jpg', { type: 'image/jpeg' });

    const out = await mergeFiles(
      [
        { kind: 'pdf', name: 'a.pdf', bytes: a },
        { kind: 'image', name: 'photo.jpg', file: jpeg },
        { kind: 'pdf', name: 'b.pdf', bytes: b },
      ],
      { pageSize: 'a4', marginPt: 0 },
      () => {},
    );

    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);

    // Order check: distinct page sizes prove the arrangement (a, image→A4, b).
    const sizes = doc.getPages().map((p) => [p.getWidth(), p.getHeight()]);
    expect(sizes[0]).toEqual([500, 600]);
    expect(sizes[1]).toEqual([595.28, 841.89]); // A4 for the image
    expect(sizes[2]).toEqual([700, 400]);
  });

  it('requires at least one input', async () => {
    await expect(mergeFiles([], { pageSize: 'a4', marginPt: 0 }, () => {})).rejects.toThrow(
      /Nothing to merge/,
    );
  });

  it('fails with a friendly message for unreadable PDFs', async () => {
    const garbage = new TextEncoder().encode('this is not a pdf').buffer;
    await expect(
      mergeFiles(
        [{ kind: 'pdf', name: 'bad.pdf', bytes: new Uint8Array(garbage) }],
        { pageSize: 'a4', marginPt: 0 },
        () => {},
      ),
    ).rejects.toThrow(/bad\.pdf/);
  });
});
