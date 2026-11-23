import { describe, expect, it } from 'vitest';
import { municipalityName } from '../src/i18n';
import { EVIDENCE_KIND_LABELS, INSTRUMENT_LABELS, INSTRUMENT_SHORT_LABELS, STATUS_LABELS } from '../src/policy';

describe('municipalityName', () => {
  it('よく使う自治体には英語表記を付ける', () => {
    expect(municipalityName('大田区')).toEqual({ en: 'Ota City', ja: '大田区' });
    expect(municipalityName('川崎市')).toEqual({ en: 'Kawasaki City', ja: '川崎市' });
  });

  it('英語表記が分からない自治体は en を null にする', () => {
    expect(municipalityName('横浜市')).toEqual({ en: null, ja: '横浜市' });
  });
});

describe('ラベル', () => {
  it('すべてのラベルに英語と日本語がある', () => {
    for (const labels of [INSTRUMENT_LABELS, INSTRUMENT_SHORT_LABELS, STATUS_LABELS, EVIDENCE_KIND_LABELS]) {
      for (const label of Object.values(labels)) {
        expect(label.en).toMatch(/[A-Za-z]/);
        expect(label.ja.length).toBeGreaterThan(0);
      }
    }
  });
});
