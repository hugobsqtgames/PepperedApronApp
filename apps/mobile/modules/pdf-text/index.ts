import { requireOptionalNativeModule } from 'expo';

/**
 * Text of a PDF read on the iPhone (PDFKit), nothing is sent anywhere. A scanned PDF has no text:
 * `pages` then holds pictures of its first pages, to read with text recognition.
 *
 * Errors (`code`): ERR_UNSUPPORTED (module missing), ERR_PDF (unreadable), ERR_LOCKED (password).
 */
export interface PdfContent {
  text: string;
  pages: string[];
  pageCount: number;
}

interface PdfTextNative {
  read(pdfUri: string, maxPages: number): Promise<PdfContent>;
}

const native = requireOptionalNativeModule<PdfTextNative>('PdfText');

export const pdfTextAvailable = native !== null;

export function readPdf(pdfUri: string, maxPages = 10): Promise<PdfContent> {
  if (!native)
    return Promise.reject(Object.assign(new Error('unsupported'), { code: 'ERR_UNSUPPORTED' }));
  return native.read(pdfUri, maxPages);
}
