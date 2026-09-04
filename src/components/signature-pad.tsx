'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Draw-your-signature box.
 *
 * A typed name is a claim; a drawn one is a mark somebody actually made. It
 * won't stop a determined person, but it does stop the thing that actually
 * happens — a team manager typing the captain's name because it was quicker
 * than asking him.
 *
 * WHY POINTER EVENTS
 *
 * One set of handlers covers mouse, finger and stylus. Mouse plus touch
 * listeners fire twice on a phone, giving doubled strokes, and neither hears a
 * stylus. `touch-none` stops the browser scrolling the page instead of drawing
 * when a finger moves inside the box — the mistake that makes a signature pad
 * feel broken on the device most people will use.
 *
 * WHY THE CANVAS IS SIZED IN AN EFFECT
 *
 * A canvas's drawing buffer is separate from its CSS size. Left alone, a box
 * displayed at 600px with a 300px buffer draws a blurry line at half the
 * pointer's position. It's measured after mount and multiplied by the device
 * pixel ratio, so the stroke lands where the finger is and stays sharp on a
 * retina screen.
 */
/** Pixels of travel before a scribble counts as a signature. */
const MIN_INK = 60;

/**
 * Widest PNG we hand back.
 *
 * The signature is stored inline on the order record, and that record is read
 * whole every time the orders list loads. A retina desktop canvas is around
 * 940px of buffer; downscaling to this before export keeps a signature in the
 * tens of kilobytes without any visible loss on a line drawing.
 */
const MAX_EXPORT_WIDTH = 800;

function exportPng(canvas: HTMLCanvasElement): string {
  if (canvas.width <= MAX_EXPORT_WIDTH) return canvas.toDataURL('image/png');
  const out = document.createElement('canvas');
  const scale = MAX_EXPORT_WIDTH / canvas.width;
  out.width = MAX_EXPORT_WIDTH;
  out.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = out.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/png');
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

export function SignaturePad({
  onChange,
  height = 160,
}: {
  /** PNG data URL while there's a mark, empty string when cleared. */
  onChange: (dataUrl: string) => void;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  /*
   * How far the pointer has travelled while drawing.
   *
   * A single tap produces a valid PNG that looks blank, which would sail past
   * any "is there a signature" check that only asks whether the canvas was
   * touched. Requiring a bit of travel means the mark has to actually be a
   * mark. It's deliberately forgiving — an initial is fine, a stray dot isn't.
   */
  const ink = useRef(0);
  const [hasMark, setHasMark] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const { width } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Dark ink on the light box below, so it reads like a signed line.
    ctx.strokeStyle = '#111827';
  }, [height]);

  function pointOf(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    // Capture keeps the stroke alive when the pointer leaves the box mid-flick,
    // instead of ending the line at the edge.
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pointOf(e);
    last.current = { x, y };
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pointOf(e);
    if (last.current) {
      ink.current += Math.hypot(x - last.current.x, y - last.current.y);
    }
    last.current = { x, y };
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasMark) setHasMark(true);
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Below the threshold it stays "unsigned" rather than half-signed, so the
    // Approve button can't be reached by tapping the box once.
    onChange(ink.current >= MIN_INK ? exportPng(canvas) : '');
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ink.current = 0;
    last.current = null;
    setHasMark(false);
    onChange('');
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border border-line bg-white">
        <canvas
          ref={canvasRef}
          style={{ height, width: '100%', touchAction: 'none' }}
          className="block cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
        {!hasMark && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral-400">
            Sign here
          </span>
        )}
        {/* A signing line, so the box reads as somewhere to write. */}
        <span className="pointer-events-none absolute bottom-6 left-6 right-6 border-b border-neutral-300" />
      </div>

      <div className="mt-1 flex items-center justify-between">
        <p className="text-xs text-muted">Use your finger, a stylus, or the mouse.</p>
        <button
          type="button"
          onClick={clear}
          className="text-xs font-semibold text-muted hover:text-ppc-gold"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
