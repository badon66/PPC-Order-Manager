/**
 * Turning a photo a quarter turn, in the browser (Keenan, 2026-11-03: a
 * phone shot of a finished jersey often lands sideways).
 *
 * The picture itself is rotated — new pixels, uploaded as a new file in place
 * of the old one — not a CSS turn on the page. A CSS turn would leave the
 * file sideways everywhere else it goes: the "jerseys are done" email
 * attaches the file, the factory downloads it, the customer's sheet shows it.
 *
 * createImageBitmap applies the photo's EXIF orientation first, so what's
 * turned is what was on screen, and the new file carries no orientation tag
 * to fight with. JPEG goes back out as JPEG at high quality; PNG and WebP
 * keep their type (and their transparency).
 */

const ROTATABLE = /\.(jpe?g|png|webp)$/i;

/** Can this file be turned here? Photos the browser can draw; never a vector or a PDF. */
export function canRotate(fileName: string): boolean {
  return ROTATABLE.test((fileName ?? '').trim());
}

/** A clockwise (90) or counter-clockwise (-90) quarter turn of the image at `url`, as a new File. */
export async function rotatedCopy(url: string, fileName: string, turn: 90 | -90): Promise<File> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Couldn't load the photo (${res.status}).`);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.height;
  canvas.height = bitmap.width;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("This browser can't turn photos.");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((turn * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();

  const type = /\.png$/i.test(fileName) ? 'image/png' : /\.webp$/i.test(fileName) ? 'image/webp' : 'image/jpeg';
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.95));
  if (!out) throw new Error("Couldn't save the turned photo.");
  return new File([out], fileName, { type });
}
