import { describe, expect, it } from 'vitest';
import { effectivePolicy, type EvidenceLike, type InstrumentClass, type PolicyResult } from '../src/policy';

let seq = 0;
const record = (occurredOn: string, result: PolicyResult, instruments: InstrumentClass[] = []): EvidenceLike => ({
  occurredOn,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, seq++)),
  result,
  instruments,
});

describe('effectivePolicy', () => {
  it('記録がなければ、すべて未確認', () => {
    const policy = effectivePolicy([]);

    expect(Object.values(policy).map((p) => p.status)).toEqual(['unknown', 'unknown', 'unknown', 'unknown', 'unknown']);
    expect(policy.drum_set.basis).toBeNull();
  });

  it('楽器を限定しない記録は、すべての楽器に当てはめる', () => {
    const general = record('2025-07-19', 'allowed');

    const policy = effectivePolicy([general]);

    expect(policy.wind).toEqual({ status: 'allowed', basis: general });
    expect(policy.taiko.status).toBe('allowed');
  });

  it('楽器を名指しした記録は、その楽器にだけ当てはめる', () => {
    const policy = effectivePolicy([record('2025-02-15', 'prohibited', ['drum_set'])]);

    expect(policy.drum_set.status).toBe('prohibited');
    expect(policy.small_percussion.status).toBe('unknown');
    expect(policy.wind.status).toBe('unknown');
  });

  it('名指しの記録は、それより新しい「限定なし」の記録より優先する', () => {
    const drumNg = record('2025-02-15', 'prohibited', ['drum_set']);
    const laterOk = record('2026-05-01', 'allowed');

    const policy = effectivePolicy([drumNg, laterOk]);

    expect(policy.drum_set).toEqual({ status: 'prohibited', basis: drumNg });
    expect(policy.wind).toEqual({ status: 'allowed', basis: laterOk });
  });

  it('同じ楽器を名指しした記録どうしでは、新しい日付のものに従う', () => {
    const policy = effectivePolicy([
      record('2026-03-01', 'allowed', ['drum_set']),
      record('2025-02-15', 'prohibited', ['drum_set']),
    ]);

    expect(policy.drum_set.status).toBe('allowed');
  });

  it('同じ日の記録どうしでは、後から登録したものに従う', () => {
    const first = record('2026-03-01', 'allowed');
    const second = record('2026-03-01', 'conditional');

    expect(effectivePolicy([second, first]).wind.basis).toBe(second);
  });

  it('1件の記録で複数の楽器を名指しできる', () => {
    const policy = effectivePolicy([record('2026-03-01', 'conditional', ['drum_set', 'large_percussion'])]);

    expect(policy.drum_set.status).toBe('conditional');
    expect(policy.large_percussion.status).toBe('conditional');
    expect(policy.small_percussion.status).toBe('unknown');
  });
});
