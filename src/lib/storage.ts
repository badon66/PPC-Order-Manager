import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { ARTWORK_BUCKET, isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * File storage for artwork.
 *
 * Two backends, picked the same way the data store is: Supabase Storage when
 * it's configured, `public/uploads/` on disk otherwise. A serverless host has
 * no writable disk, so the local path is a development convenience only.
 *
 * ARTWORK IS CUSTOMER IP. In Supabase it lives in a PRIVATE bucket. Nothing is
 * served from a guessable public path — pages call `resolveFileUrl()` and get
 * a link that expires. A share link forwarded around town stops working
 * instead of exposing a team's unreleased crest forever.
 *
 * Three kinds of value can appear in an asset's `fileUrl`, and everything here
 * is built to tell them apart:
 *
 *   `artwork/<uuid>.png`  a key in the private bucket        → signed on read
 *   `/uploads/<uuid>.png` a local dev file                   → used as-is
 *   `https://base44.app/…` not yet rescued from the old app  → used as-is
 */

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

const ALLOWED = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
  'application/pdf',
  'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
  'application/octet-stream', // some browsers send this for .ttf/.otf
]);

/*
 * 50 MB.
 *
 * The design reference is the single image the manufacturer works from, so it
 * arrives as a full-resolution export rather than something sized for the web.
 * 25 MB was turning those away.
 *
 * Raising this alone would not have been enough: on Vercel a request body over
 * ~4.5 MB never reaches the app at all, so anything past that failed no matter
 * what this constant said. See `createUploadUrl` below.
 *
 * Keep in step with the bucket's own file_size_limit — migration
 * 0003_bigger_artwork_files.sql — or Supabase rejects what this accepts.
 */
const MAX_BYTES = 50 * 1024 * 1024;

/** How long a signed artwork link lives. Long enough to load a page and
 *  look at it; short enough that a forwarded link goes stale. */
const SIGNED_URL_SECONDS = 60 * 60;

export interface StoredFile {
  fileUrl: string;
  fileName: string;
  bytes: number;
}

function checkAllowed(file: { size: number; type: string; name: string }): void {
  if (file.size > MAX_BYTES) {
    throw new Error(
      `"${file.name}" is ${(file.size / 1_048_576).toFixed(1)} MB — the limit is ${MAX_BYTES / 1_048_576} MB.`,
    );
  }
  if (file.type && !ALLOWED.has(file.type)) {
    throw new Error(`"${file.name}" is a ${file.type} file. Upload an image, PDF, or font file.`);
  }
}

function keyFor(name: string): string {
  const ext = path.extname(name).toLowerCase().slice(0, 10) || '';
  const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : '';
  return `${randomUUID()}${safeExt}`;
}

/**
 * A URL the browser can upload straight to, skipping this server entirely.
 *
 * WHY THIS EXISTS
 *
 * A file POSTed to a Next route handler on Vercel travels through the
 * serverless function, and Vercel caps a function's request body at about
 * 4.5 MB. That is a platform limit — no config raises it. A 12 MB crest was
 * therefore rejected before a single line of this app ran, which is why the
 * failure looked like nothing at all: no error from our code, because our code
 * never executed.
 *
 * So the bytes stop coming through here. The server mints a short-lived signed
 * upload URL for one specific key, the browser PUTs the file directly to
 * Supabase Storage, and only the key comes back. Nothing large crosses the
 * function, so the ceiling is the bucket's limit rather than Vercel's.
 *
 * The signed URL is scoped to a single path we generated and expires on its
 * own, so handing it to the browser grants nothing beyond writing that one
 * object. No storage credential reaches the client.
 *
 * Only available when Supabase is configured. On a laptop with no credentials
 * the app writes to `public/uploads` and the old POST route is still the path
 * — there is no function limit there, and no bucket to sign against.
 */
export async function createUploadUrl(
  file: { name: string; size: number; type: string },
): Promise<{ uploadUrl: string; fileUrl: string; fileName: string }> {
  if (!isSupabaseConfigured()) throw new Error('Direct upload needs Supabase storage.');
  checkAllowed(file);

  const key = keyFor(file.name);
  const { data, error } = await supabase()
    .storage
    .from(ARTWORK_BUCKET)
    .createSignedUploadUrl(key);

  if (error || !data) throw new Error(`Could not start upload: ${error?.message ?? 'unknown error'}`);

  return { uploadUrl: data.signedUrl, fileUrl: `${ARTWORK_BUCKET}/${key}`, fileName: file.name };
}

export async function putFile(file: File): Promise<StoredFile> {
  checkAllowed(file);
  const key = keyFor(file.name);
  const bytes = Buffer.from(await file.arrayBuffer());

  if (isSupabaseConfigured()) {
    const { error } = await supabase()
      .storage
      .from(ARTWORK_BUCKET)
      .upload(key, bytes, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return { fileUrl: `${ARTWORK_BUCKET}/${key}`, fileName: file.name, bytes: bytes.length };
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, key), bytes);
  return { fileUrl: `/uploads/${key}`, fileName: file.name, bytes: bytes.length };
}

/** True for a value that is a key in the private bucket. */
export function isBucketKey(fileUrl: string): boolean {
  return fileUrl.startsWith(`${ARTWORK_BUCKET}/`);
}

/**
 * Turn a stored `fileUrl` into something a browser can actually load.
 *
 * Anything that isn't a bucket key — a local dev path, a not-yet-rescued
 * Base44 URL — passes through untouched.
 */
export async function resolveFileUrl(fileUrl: string): Promise<string> {
  if (!fileUrl || !isBucketKey(fileUrl)) return fileUrl;

  const key = fileUrl.slice(ARTWORK_BUCKET.length + 1);
  const { data, error } = await supabase()
    .storage
    .from(ARTWORK_BUCKET)
    .createSignedUrl(key, SIGNED_URL_SECONDS);

  // A missing file must not take the page down with it. Empty string renders
  // as a broken thumbnail, which tells Keenan something's wrong with that one
  // asset rather than hiding it behind a 500.
  if (error || !data) return '';
  return data.signedUrl;
}

/**
 * Sign a whole page's worth at once.
 *
 * One round trip per file would mean twenty on an order with lots of artwork,
 * so this batches them. Order is preserved; anything unsignable comes back
 * with an empty url.
 */
/**
 * Sign a batch of stored files in one round trip.
 *
 * Signs `placementFileUrl` alongside `fileUrl` when an item has one, in the
 * same request rather than a second pass — a logo now carries two files (the
 * print-ready artwork and a close-up of where it sits), and signing them
 * separately would double the calls on a page showing a dozen logos.
 */
export async function resolveAll<T extends { fileUrl: string; placementFileUrl?: string }>(
  items: T[],
): Promise<Array<T & { resolvedUrl: string; placementResolvedUrl: string }>> {
  const toKey = (v: string | undefined) =>
    v && isBucketKey(v) ? v.slice(ARTWORK_BUCKET.length + 1) : null;

  const keys = [
    ...items.map((i) => toKey(i.fileUrl)),
    ...items.map((i) => toKey(i.placementFileUrl)),
  ].filter((k): k is string => k !== null);

  const signed = new Map<string, string>();
  if (keys.length) {
    const { data } = await supabase()
      .storage
      .from(ARTWORK_BUCKET)
      // Duplicates are harmless — the same path signs to the same entry.
      .createSignedUrls([...new Set(keys)], SIGNED_URL_SECONDS);
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
    }
  }

  // A value that isn't a bucket key passes through untouched: local dev paths
  // and not-yet-rescued Base44 URLs are already loadable as they stand.
  const resolve = (v: string | undefined): string => {
    if (!v) return '';
    const key = toKey(v);
    return key ? signed.get(key) ?? '' : v;
  };

  return items.map((i) => ({
    ...i,
    resolvedUrl: resolve(i.fileUrl),
    placementResolvedUrl: resolve(i.placementFileUrl),
  }));
}

/**
 * Store bytes we already hold — used by the Base44 rescue pass, where the
 * browser hands over a file it fetched from the old app.
 */
export async function putBytes(
  bytes: Buffer,
  fileName: string,
  contentType: string,
): Promise<StoredFile> {
  checkAllowed({ size: bytes.length, type: '', name: fileName });
  const key = keyFor(fileName);

  if (isSupabaseConfigured()) {
    const { error } = await supabase()
      .storage
      .from(ARTWORK_BUCKET)
      .upload(key, bytes, { contentType: contentType || 'application/octet-stream', upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return { fileUrl: `${ARTWORK_BUCKET}/${key}`, fileName, bytes: bytes.length };
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, key), bytes);
  return { fileUrl: `/uploads/${key}`, fileName, bytes: bytes.length };
}
