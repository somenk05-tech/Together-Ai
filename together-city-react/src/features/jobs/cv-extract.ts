import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';

// pdf.js needs its worker; bundle it with the app (Vite `?url`) so it works
// offline and doesn't depend on a CDN.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type CvKind = 'text' | 'pdf' | 'docx';
export interface CvExtractResult { text: string; kind: CvKind }

/**
 * Pull plain text out of an uploaded CV file in the browser, so the existing
 * text-based resume parser (POST /jobs/resume) can read a real PDF or Word doc
 * — not just a .txt. PDF → pdf.js, .docx → mammoth, everything else → read as
 * text. Scanned/image-only PDFs yield little text; the caller handles that.
 */
export async function extractCvText(file: File): Promise<CvExtractResult> {
  const name = (file.name || '').toLowerCase();
  const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
  const isDocx =
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx');

  if (isPdf) {
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    try {
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
      }
      return { text: text.trim(), kind: 'pdf' };
    } finally {
      void pdf.destroy();
    }
  }

  if (isDocx) {
    const arrayBuffer = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer });
    return { text: (value || '').trim(), kind: 'docx' };
  }

  // .txt / .md / .rtf / .text and anything else — read as UTF-8 text.
  const text = await file.text();
  return { text: text.trim(), kind: 'text' };
}
