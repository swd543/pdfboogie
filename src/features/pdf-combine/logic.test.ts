import { describe, expect, it } from 'vitest';
import { cellLayout, GRIDS, perSheetCounts, sheetCount } from './logic';

describe('sheetCount', () => {
  it('computes m = ceil(n / cells)', () => {
    expect(sheetCount(0, 4)).toBe(0);
    expect(sheetCount(4, 4)).toBe(1);
    expect(sheetCount(8, 4)).toBe(2);
    expect(sheetCount(9, 4)).toBe(3);
    expect(sheetCount(13, 4)).toBe(4);
    expect(sheetCount(2, 2)).toBe(1);
  });
});

describe('perSheetCounts', () => {
  it('fills sheets front-to-back with the remainder last', () => {
    expect(perSheetCounts(0, 4)).toEqual([]);
    expect(perSheetCounts(4, 4)).toEqual([4]);
    expect(perSheetCounts(13, 4)).toEqual([4, 4, 4, 1]);
    expect(perSheetCounts(5, 2)).toEqual([2, 2, 1]);
  });
});

describe('cellLayout', () => {
  it('fits a page into a cell, centered', () => {
    // Page smaller than the cell (different aspect): centered with room.
    const l = cellLayout(100, 100, 200, 100);
    expect(l.scale).toBeCloseTo(1);
    expect(l.w).toBeCloseTo(100);
    expect(l.h).toBeCloseTo(100);
    expect(l.x).toBeCloseTo(50);
    expect(l.y).toBeCloseTo(0);
  });

  it('scales down oversized pages to fit', () => {
    const l = cellLayout(200, 100, 100, 50);
    expect(l.scale).toBeCloseTo(0.5);
    expect(l.w).toBeCloseTo(100);
    expect(l.h).toBeCloseTo(50);
    expect(l.x).toBeCloseTo(0);
    expect(l.y).toBeCloseTo(0);
  });

  it('never exceeds the cell bounds', () => {
    const l = cellLayout(595.28, 841.89, 297.64, 420.945); // A4 into half-A4
    expect(l.w).toBeLessThanOrEqual(297.64);
    expect(l.h).toBeLessThanOrEqual(420.945);
    expect(l.x + l.w).toBeLessThanOrEqual(297.64 + 1e-9);
    expect(l.y + l.h).toBeLessThanOrEqual(420.945 + 1e-9);
  });
});

describe('GRIDS', () => {
  it('offers sane per-sheet grids', () => {
    const sizes = GRIDS.map((g) => g.cols * g.rows);
    expect(sizes).toEqual([2, 4, 6, 9, 16]);
    for (const g of GRIDS) {
      expect(g.cols).toBeGreaterThanOrEqual(1);
      expect(g.rows).toBeGreaterThanOrEqual(1);
    }
  });
});
