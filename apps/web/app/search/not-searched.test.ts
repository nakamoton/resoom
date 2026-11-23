import { describe, expect, it } from 'vitest';
import { NOT_SEARCHED_REASONS, byReason, groupNotSearched, searchableMunicipalities } from './not-searched';

const room = (municipality: string, id: string) => ({ municipality, id });

describe('groupNotSearched', () => {
  it('自治体ごとにまとめ、robots.txt・停止中・未対応・データなしの順に並べる', () => {
    const groups = groupNotSearched([
      room('江東区', 'koto'),
      room('川崎市', 'k1'),
      room('渋谷区', 'shibuya'),
      room('目黒区', 'm1'),
      room('川崎市', 'k2'),
      room('江戸川区', 'e1'),
    ]);

    expect(groups.map((g) => [g.municipality, g.reason, g.rooms.map((r) => r.id)])).toEqual([
      ['江戸川区', 'robots', ['e1']],
      ['目黒区', 'robots', ['m1']],
      ['川崎市', 'paused', ['k1', 'k2']],
      ['江東区', 'unsupported', ['koto']],
      ['渋谷区', 'unavailable', ['shibuya']],
    ]);
  });

  it('部屋がなければ空', () => {
    expect(groupNotSearched([])).toEqual([]);
  });

  it('すべての理由に英語と日本語の説明がある', () => {
    for (const text of Object.values(NOT_SEARCHED_REASONS)) {
      expect(text.en.length).toBeGreaterThan(0);
      expect(text.ja.length).toBeGreaterThan(0);
    }
  });
});

describe('byReason', () => {
  it('同じ理由の自治体を1つにまとめる', () => {
    const groups = byReason(groupNotSearched([room('目黒区', 'm1'), room('江戸川区', 'e1'), room('川崎市', 'k1'), room('文京区', 'b1'), room('江東区', 'koto')]));

    expect(groups.map((g) => [g.reason, g.cities.map((c) => c.municipality)])).toEqual([
      ['robots', ['江戸川区', '文京区', '目黒区']],
      ['paused', ['川崎市']],
      ['unsupported', ['江東区']],
    ]);
  });
});

describe('searchableMunicipalities', () => {
  it('空き状況を集めている部屋がある自治体だけを、英語名の順に返す', () => {
    const rooms = [room('渋谷区', 's1'), room('江戸川区', 'e1'), room('大田区', 'o1'), room('大田区', 'o2'), room('川崎市', 'k1'), room('世田谷区', 'g1')];

    expect(searchableMunicipalities(rooms, new Set(['s1', 'o2', 'g1']))).toEqual(['大田区', '世田谷区', '渋谷区']);
  });

  it('集めた空き状況がなければ空', () => {
    expect(searchableMunicipalities([room('大田区', 'o1')], new Set())).toEqual([]);
  });
});
