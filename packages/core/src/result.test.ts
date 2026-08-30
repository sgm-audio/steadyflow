import { describe, expect, it } from 'vitest';
import { err, isErr, isOk, map, mapErr, ok, unwrap } from './result.js';

describe('Result', () => {
  it('ok constructs a success', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  it('err constructs a failure', () => {
    const r = err('boom');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('boom');
  });

  it('isOk / isErr narrow correctly', () => {
    const r = ok(1);
    if (isOk(r)) expect(r.value).toBe(1);
    const e = err('x');
    if (isErr(e)) expect(e.error).toBe('x');
  });

  it('map transforms success', () => {
    expect(map(ok(2), (n) => n * 3)).toEqual({ ok: true, value: 6 });
  });

  it('map passes through error', () => {
    expect(map(err('x') as Result<number, string>, (n: number) => n * 3)).toEqual({
      ok: false,
      error: 'x',
    });
  });

  it('mapErr transforms error', () => {
    expect(mapErr(err('x') as Result<number, string>, (s) => s.toUpperCase())).toEqual({
      ok: false,
      error: 'X',
    });
  });

  it('unwrap throws on err', () => {
    expect(() => unwrap(err('boom'))).toThrow();
  });

  it('unwrap returns value on ok', () => {
    expect(unwrap(ok(7))).toBe(7);
  });
});

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
