/**
 * Integration test: form scan + fill pipeline against a real PDF
 * (pdf-lib works in Node, so the full logic path runs here — only the
 * DOM-dependent rendering is browser-only).
 */

import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { fillForm, placeSignatures, scanForm } from './logic';

async function makeDocWithForm(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText('Contract form', { x: 50, y: 780, size: 20, font });

  const form = doc.getForm();
  const text = form.createTextField('name');
  text.setText('');
  text.addToPage(page, { x: 50, y: 700, width: 200, height: 24 });
  const check = form.createCheckBox('agree');
  check.addToPage(page, { x: 50, y: 660, width: 20, height: 20 });
  const dropdown = form.createDropdown('country');
  dropdown.addOptions(['AT', 'DE', 'FR']);
  dropdown.addToPage(page, { x: 50, y: 620, width: 120, height: 24 });
  return new Uint8Array(await doc.save()).buffer;
}

/** 16×16 transparent PNG with a red square (hand-built, no deps). */
async function tinyPng(): Promise<Uint8Array> {
  // Reuse the same technique as the OG image script: raw RGBA + zlib.
  const { zlibSync } = await import('fflate');
  const W = 16;
  const H = 16;
  const raw = new Uint8Array(H * (1 + W * 4));
  for (let y = 0; y < H; y += 1) {
    raw[y * (1 + W * 4)] = 0;
    for (let x = 0; x < W; x += 1) {
      const i = y * (1 + W * 4) + 1 + x * 4;
      raw[i] = 220;
      raw[i + 1] = 30;
      raw[i + 2] = 20;
      raw[i + 3] = 255;
    }
  }
  const deflate = zlibSync(raw, { level: 9 });
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf: Uint8Array) => {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) crc = crcTable[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const head = new Uint8Array(4 + 4 + data.length + 4);
    head[0] = (data.length >>> 24) & 0xff;
    head[1] = (data.length >>> 16) & 0xff;
    head[2] = (data.length >>> 8) & 0xff;
    head[3] = data.length & 0xff;
    head.set([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)], 4);
    head.set(data, 8);
    const c = new Uint32Array(1);
    c[0] = crc32(new Uint8Array([...head.slice(4, 8), ...data]));
    const crcBytes = new Uint8Array(4);
    new DataView(crcBytes.buffer).setUint32(0, c[0]!);
    head.set(crcBytes, 8 + data.length);
    return head;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, W);
  new DataView(ihdr.buffer).setUint32(4, H);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const all = [
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflate),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = all.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of all) {
    out.set(b, off);
    off += b.length;
  }
  return out;
}

describe('form scan + fill', () => {
  it('discovers text/checkbox/dropdown fields and fills them', async () => {
    const data = await makeDocWithForm();
    const scan = await scanForm(data);
    expect(scan.xfa).toBe(false);
    const names = scan.fields.map((f) => f.name).sort();
    expect(names).toEqual(['agree', 'country', 'name']);
    const types = Object.fromEntries(scan.fields.map((f) => [f.name, f.type]));
    expect(types).toEqual({ name: 'text', agree: 'checkbox', country: 'dropdown' });
    expect(scan.fields.find((f) => f.name === 'country')?.choices).toEqual(['AT', 'DE', 'FR']);

    const filled = await fillForm(data, [
      { name: 'name', type: 'text', value: 'Ada Lovelace' },
      { name: 'agree', type: 'checkbox', value: true },
      { name: 'country', type: 'dropdown', value: 'AT' },
    ]);

    // Verify by re-parsing with pdf-lib.
    const check = await PDFDocument.load(filled.buffer as ArrayBuffer);
    const form = check.getForm();
    expect(form.getTextField('name').getText()).toBe('Ada Lovelace');
    expect(form.getCheckBox('agree').isChecked()).toBe(true);
    expect(form.getDropdown('country').getSelected()).toEqual(['AT']);
  });
});

describe('placeSignatures', () => {
  it('flattens a PNG stamp onto a page without breaking the file', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Sign here', { x: 50, y: 200, size: 14, font });
    const data = new Uint8Array(await doc.save()).buffer;

    const png = await tinyPng();
    const out = await placeSignatures(data, [
      { page: 1, x: 100, y: 100, width: 80, height: 80, png },
    ]);

    const check = await PDFDocument.load(out.buffer as ArrayBuffer);
    expect(check.getPageCount()).toBe(1);
    expect(out.byteLength).toBeGreaterThan(data.byteLength);
  });

  it('rejects empty stamp lists and bad page numbers', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const data = new Uint8Array(await doc.save()).buffer;
    await expect(placeSignatures(data, [])).rejects.toThrow(/No signatures/);
    await expect(
      placeSignatures(data, [
        { page: 9, x: 0, y: 0, width: 10, height: 10, png: new Uint8Array(8) },
      ]),
    ).rejects.toThrow(/No page with number 9 exists|must be at least 0/);
  });
});
