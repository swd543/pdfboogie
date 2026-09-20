/**
 * Signature drawing pad (pointer events, DPR-aware, undo/clear).
 *
 * Renders on a transparent background so the exported PNG composites cleanly
 * over any PDF content.
 */
import { createSignal, onCleanup, onMount } from 'solid-js';
import { canvasToPng } from '~/lib/imaging';

interface Point {
  x: number;
  y: number;
}
interface Stroke {
  points: Point[];
  size: number;
  color: string;
}

export interface SignaturePadApi {
  getPng: () => Promise<Uint8Array | null>;
  /** Current backing-store size in device pixels. */
  size: () => { width: number; height: number };
  clear: () => void;
}

export function SignaturePad(props: {
  onChange?: (empty: boolean) => void;
  onApi?: (api: SignaturePadApi) => void;
}) {
  let canvas: HTMLCanvasElement | undefined;
  const [strokes, setStrokes] = createSignal<Stroke[]>([]);
  const [, setEmpty] = createSignal(true);
  const [size, setSize] = createSignal(3.5);
  const [color, setColor] = createSignal('#111827');

  let drawing = false;
  let current: Point[] = [];

  const dpr = () => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const ctx = () => canvas?.getContext('2d') ?? null;

  /** Map a pointer event to canvas (device) pixels. */
  const toPoint = (e: PointerEvent): Point => {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / Math.max(1, rect.width)),
      y: (e.clientY - rect.top) * (canvas.height / Math.max(1, rect.height)),
    };
  };

  const traceStroke = (s: Stroke) => {
    const c = ctx();
    if (!c || s.points.length === 0) return;
    c.strokeStyle = s.color;
    c.fillStyle = s.color;
    c.lineWidth = s.size * dpr();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    // Smooth path through midpoints.
    c.beginPath();
    c.moveTo(s.points[0]!.x, s.points[0]!.y);
    for (let i = 1; i < s.points.length - 1; i += 1) {
      const midX = (s.points[i]!.x + s.points[i + 1]!.x) / 2;
      const midY = (s.points[i]!.y + s.points[i + 1]!.y) / 2;
      c.quadraticCurveTo(s.points[i]!.x, s.points[i]!.y, midX, midY);
    }
    const last = s.points[s.points.length - 1]!;
    c.lineTo(last.x, last.y);
    c.stroke();
    // Dot for single-point taps.
    if (s.points.length === 1) {
      c.beginPath();
      c.arc(last.x, last.y, (s.size * dpr()) / 2, 0, Math.PI * 2);
      c.fill();
    }
  };

  const redraw = () => {
    const c = ctx();
    if (!c || !canvas) return;
    c.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes()) traceStroke(s);
  };

  /** Resize the backing store to the CSS size × DPR, preserving strokes. */
  const resize = () => {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * dpr()));
    const height = Math.max(1, Math.round(rect.height * dpr()));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    redraw();
  };

  const markEmpty = () => {
    const is = strokes().length === 0;
    setEmpty(is);
    props.onChange?.(is);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!canvas) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    current = [toPoint(e)];
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drawing) return;
    current.push(toPoint(e));
    // Live trace: draw the last segment incrementally.
    const c = ctx();
    if (!c || current.length < 2) return;
    const a = current[current.length - 2]!;
    const b = current[current.length - 1]!;
    c.strokeStyle = color();
    c.lineWidth = size() * dpr();
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  };

  const onPointerUp = () => {
    if (!drawing) return;
    drawing = false;
    if (current.length === 0) return;
    const stroke: Stroke = { points: current, size: size(), color: color() };
    current = [];
    setStrokes([...strokes(), stroke]);
    markEmpty();
  };

  const clear = () => {
    setStrokes([]);
    redraw();
    markEmpty();
  };

  const undo = () => {
    if (strokes().length === 0) return;
    setStrokes(strokes().slice(0, -1));
    redraw();
    markEmpty();
  };

  /** Export the current pad as PNG bytes (transparent background). */
  const getPng = (): Promise<Uint8Array | null> => {
    if (!canvas || strokes().length === 0) return Promise.resolve(null);
    return canvasToPng(canvas);
  };

  onMount(() => {
    resize();
    window.addEventListener('resize', resize);
    onCleanup(() => window.removeEventListener('resize', resize));
    props.onApi?.({
      getPng,
      size: () =>
        canvas ? { width: canvas.width, height: canvas.height } : { width: 0, height: 0 },
      clear,
    });
  });

  return (
    <div class="sig-pad-wrap">
      <canvas
        ref={canvas}
        class="sig-pad"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div class="sig-side">
        <button
          type="button"
          class="btn btn-sm btn-ghost"
          onClick={undo}
          disabled={strokes().length === 0}
        >
          Undo
        </button>
        <button
          type="button"
          class="btn btn-sm btn-ghost"
          onClick={clear}
          disabled={strokes().length === 0}
        >
          Clear
        </button>
        <label class="opt-label" for="sig-size" style="font-size: 0.75rem; margin-top: 0.25rem">
          Pen size
        </label>
        <input
          id="sig-size"
          type="range"
          min={2}
          max={8}
          step={0.5}
          value={size()}
          onChange={(e) => setSize(Number(e.currentTarget.value))}
        />
        <label class="opt-label" for="sig-color" style="font-size: 0.75rem; margin-top: 0.25rem">
          Ink
        </label>
        <input
          id="sig-color"
          type="color"
          value={color()}
          onChange={(e) => setColor(e.currentTarget.value)}
          style="width: 100%; height: 30px; padding: 2px; border-radius: 6px; border: 1px solid var(--line-strong)"
        />
      </div>
    </div>
  );
}
