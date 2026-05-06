/**
 * Parse a CSS color string into normalized RGBA components in 0..1.
 * Supports `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, and a
 * small set of named colors. Anything unrecognized falls back to opaque black.
 */
export function parseColor(input: string): [number, number, number, number] {
  const s = input.trim().toLowerCase();

  const named = NAMED_COLORS[s];
  if (named) return named;

  if (s.startsWith('#')) return parseHex(s.slice(1));
  if (s.startsWith('rgb')) return parseRgb(s);

  return [0, 0, 0, 1];
}

function parseHex(hex: string): [number, number, number, number] {
  const len = hex.length;

  if (len === 3 || len === 4) {
    const r = parseInt(hex[0]! + hex[0], 16) / 255;
    const g = parseInt(hex[1]! + hex[1], 16) / 255;
    const b = parseInt(hex[2]! + hex[2], 16) / 255;
    const a = len === 4 ? parseInt(hex[3]! + hex[3], 16) / 255 : 1;
    return [r, g, b, a];
  }

  if (len === 6 || len === 8) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const a = len === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return [r, g, b, a];
  }

  return [0, 0, 0, 1];
}

function parseRgb(input: string): [number, number, number, number] {
  const open = input.indexOf('(');
  const close = input.lastIndexOf(')');
  if (open < 0 || close < 0) return [0, 0, 0, 1];

  const parts = input
    .slice(open + 1, close)
    .split(/[,\s/]+/)
    .filter(Boolean);

  const [r = '0', g = '0', b = '0', a = '1'] = parts;
  return [
    clamp01(toChannel(r)),
    clamp01(toChannel(g)),
    clamp01(toChannel(b)),
    clamp01(toAlpha(a)),
  ];
}

function toChannel(v: string): number {
  if (v.endsWith('%')) return parseFloat(v) / 100;
  return parseFloat(v) / 255;
}

function toAlpha(v: string): number {
  if (v.endsWith('%')) return parseFloat(v) / 100;
  return parseFloat(v);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

const NAMED_COLORS: Record<string, [number, number, number, number]> = {
  black: [0, 0, 0, 1],
  white: [1, 1, 1, 1],
  red: [1, 0, 0, 1],
  green: [0, 1, 0, 1],
  blue: [0, 0, 1, 1],
  transparent: [0, 0, 0, 0],
};
