/**
 * Merge logic: combine multiple PDFs — and images (JPG, PNG, …) — into a
 * single PDF, in the order the user arranged them.
 *
 *  - PDF inputs are copied page-for-page with pdf-lib (vector content is
 *    preserved exactly; no re-encoding).
 *  - Image inputs reuse the image-to-pdf embedding pipeline (JPEG fast
 *    path, bitmap re-encode for exotic formats, page size + margins).
 *
 * pdf-lib is imported lazily so the merge page's chunk stays lean.
 */
import type { PDFDocument as PdfDoc } from 'pdf-lib';
import { pdflib } from '~/lib/pdflib';
import { type ProgressFn, yieldToBrowser } from '~/lib/types';
import { addImagePage, type PageSize, prepareImage } from '../image-to-pdf/logic';

export type MergeInput =
  | { kind: 'pdf'; name: string; bytes: Uint8Array }
  | { kind: 'image'; name: string; file: File };

export interface MergeOptions {
  /** Page size for *image* inputs (PDF pages keep their own size). */
  pageSize: PageSize;
  /** Margins in points, applied to image pages. */
  marginPt: number;
}

/** Merge the given inputs (in order) into one PDF. */
export async function mergeFiles(
  inputs: MergeInput[],
  options: MergeOptions,
  onProgress: ProgressFn,
): Promise<Uint8Array> {
  if (inputs.length === 0) throw new Error('Nothing to merge — add at least two files.');

  const { PDFDocument } = await pdflib();
  const doc = await PDFDocument.create();
  doc.setTitle('Merged document');
  doc.setProducer('PDFBoogie (in-browser, no upload)');

  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i]!;
    onProgress(i, inputs.length, `Reading ${input.name}…`);
    await yieldToBrowser();

    if (input.kind === 'pdf') {
      let src: PdfDoc;
      try {
        src = await PDFDocument.load(input.bytes, { throwOnInvalidObject: false });
      } catch {
        throw new Error(
          `Couldn't read “${input.name}” — is it a valid PDF? Password-protected PDFs can't be merged.`,
        );
      }
      if (src.getPageCount() === 0) {
        throw new Error(`“${input.name}” has no pages.`);
      }
      const copied = await doc.copyPages(src, src.getPageIndices());
      for (const page of copied) doc.addPage(page);
    } else {
      const prep = await prepareImage(input.file);
      await addImagePage(doc, prep, options);
    }

    onProgress(i + 1, inputs.length, `Added ${input.name}`);
    await yieldToBrowser();
  }

  onProgress(inputs.length, inputs.length, 'Assembling PDF');
  return doc.save();
}
