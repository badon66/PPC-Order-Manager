import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

/**
 * File storage for artwork.
 *
 * Today: writes to `public/uploads/` on disk, so uploads actually work while
 * running locally. Swapping to Supabase Storage means replacing `putFile` —
 * nothing else calls the filesystem.
 *
 * NOTE for the hosted version: artwork is customer IP. In Supabase it must live
 * in a private bucket served through short-lived signed URLs, not at a public
 * guessable path the way `public/uploads/` works here.
 */

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

const ALLOWED = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
  'application/pdf',
  'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
  'application/octet-stream', // some browsers send this for .ttf/.otf
]);

const MAX_BYTES = 25 * 1024 * 1024;

export interface StoredFile {
  fileUrl: string;
  fileName: string;
  bytes: number;
}

export async function putFile(file: File): Promise<StoredFile> {
  if (file.size > MAX_BYTES) {
    throw new Error(`"${file.name}" is ${(file.size / 1_048_576).toFixed(1)} MB — the limit is 25 MB.`);
  }
  if (file.type && !ALLOWED.has(file.type)) {
    throw new Error(`"${file.name}" is a ${file.type} file. Upload an image, PDF, or font file.`);
  }

  const ext = path.extname(file.name).toLowerCase().slice(0, 10) || '';
  const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : '';
  const key = `${randomUUID()}${safeExt}`;

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(UPLOAD_DIR, key), buf);

  return { fileUrl: `/uploads/${key}`, fileName: file.name, bytes: buf.length };
}
