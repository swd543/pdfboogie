/**
 * Lazy loader for pdf-lib (PDF creation, form filling, image embedding,
 * overlay stamps). Dynamically imported so it only ships in the chunks of
 * pages that need it.
 */
type PdfLib = typeof import('pdf-lib');

let libPromise: Promise<PdfLib> | null = null;

export function pdflib(): Promise<PdfLib> {
  if (!libPromise) {
    libPromise = import('pdf-lib').catch((err) => {
      libPromise = null;
      throw err;
    });
  }
  return libPromise;
}
