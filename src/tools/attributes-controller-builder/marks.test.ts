import { describe, expect, it } from 'vitest';
import { NO_MARKS, click, type Modifiers } from './marks';

const SHOWN = ['a', 'b', 'c', 'd', 'e'];
const plain: Modifiers = { shiftKey: false, ctrlKey: false, metaKey: false };
const ctrl = { ...plain, ctrlKey: true };
const meta = { ...plain, metaKey: true };
const shift = { ...plain, shiftKey: true };

const marked = (...names: string[]) => ({ marked: new Set(names), anchor: names.at(-1) ?? null });

describe('click', () => {
  it('moves just the clicked attribute when it is not marked', () => {
    expect(click(marked('b'), 'd', SHOWN, plain)).toEqual({ move: ['d'] });
  });

  it('moves everything marked, in list order, when a marked one is clicked', () => {
    expect(click(marked('d', 'b'), 'b', SHOWN, plain)).toEqual({ move: ['b', 'd'] });
  });

  it('does not move marked attributes the list no longer shows', () => {
    expect(click(marked('a', 'b'), 'b', ['b', 'c'], plain)).toEqual({ move: ['b'] });
  });

  it('toggles a mark with ctrl or cmd and moves the anchor', () => {
    expect(click(NO_MARKS, 'b', SHOWN, ctrl)).toEqual({ marks: { marked: new Set(['b']), anchor: 'b' } });
    expect(click(marked('b', 'c'), 'b', SHOWN, meta)).toEqual({ marks: { marked: new Set(['c']), anchor: 'b' } });
  });

  it('marks a range from the anchor with shift, in either direction', () => {
    expect(click(marked('b'), 'd', SHOWN, shift)).toEqual({
      marks: { marked: new Set(['b', 'c', 'd']), anchor: 'b' },
    });
    expect(click(marked('d'), 'a', SHOWN, shift)).toEqual({
      marks: { marked: new Set(['a', 'b', 'c', 'd']), anchor: 'd' },
    });
  });

  it('treats shift like ctrl without a visible anchor', () => {
    expect(click(NO_MARKS, 'c', SHOWN, shift)).toEqual({ marks: { marked: new Set(['c']), anchor: 'c' } });
    expect(click(marked('x'), 'c', SHOWN, shift)).toEqual({
      marks: { marked: new Set(['x', 'c']), anchor: 'c' },
    });
  });
});
