import type { ImportContext } from './build';
import type { ImportAnalysis } from './types';

/**
 * Browser side of reading a roster file: what gets sent, and how the answer
 * comes back. No server imports — both forms use it.
 */

export type ReadResponse =
  | { ok: true; analysis: ImportAnalysis; context?: ImportContext }
  | { ok: false; error: string };

/** Under Vercel's 4.5 MB request cap, with room for the form fields. */
export const READ_UPLOAD_LIMIT = 4 * 1024 * 1024;

/** The long edge a photo is shrunk to for reading. Plenty for a printed or handwritten list. */
const READ_EDGE = 2000;

const isImage = (type: string, name: string) =>
  type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(name);

/**
 * The copy of a file that gets READ — never the one that's kept. A phone
 * photo is shrunk to a sensible size (the AI reads it the same, and it fits
 * through the request limit); anything else goes as it is.
 *
 * Returns null when there's nothing worth sending: a file too big to post
 * (the caller falls back to reading the stored original, where it can), or a
 * photo the browser can't open (HEIC on a desktop — the server then explains).
 */
export async function readableCopy(file: Blob, name: string): Promise<Blob | null> {
  if (isImage(file.type, name) && file.type !== 'image/svg+xml') {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, READ_EDGE / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size <= READ_UPLOAD_LIMIT && /^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
        bmp.close();
        return file;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      const g = canvas.getContext('2d');
      if (!g) return file.size <= READ_UPLOAD_LIMIT ? file : null;
      // White under any transparency, so dark text on a clear PNG stays readable as JPEG.
      g.fillStyle = '#fff';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close();
      const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
      return out ?? (file.size <= READ_UPLOAD_LIMIT ? file : null);
    } catch {
      return file.size <= READ_UPLOAD_LIMIT ? file : null;
    }
  }
  return file.size <= READ_UPLOAD_LIMIT ? file : null;
}

/** POST to one of the read routes. A timeout or a dropped connection comes back as a sentence, not a throw. */
export async function requestRead(
  url: string,
  input: { copy: Blob | null; fileName: string; fileUrl: string },
): Promise<ReadResponse> {
  const body = new FormData();
  if (input.copy) body.append('file', input.copy, input.fileName);
  body.append('fileName', input.fileName);
  body.append('fileUrl', input.fileUrl);
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', body });
  } catch {
    return { ok: false, error: 'The connection dropped while reading the file. Try again.' };
  }
  try {
    return (await res.json()) as ReadResponse;
  } catch {
    return {
      ok: false,
      error: res.status === 504 || res.status === 502
        ? 'Reading the file took too long. Try again — or a spreadsheet reads in seconds.'
        : `Reading the file failed (${res.status}). Try again.`,
    };
  }
}

/** A file download made in the browser: the preview's rows as our CSV, before anything is saved. */
export function downloadText(text: string, fileName: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
