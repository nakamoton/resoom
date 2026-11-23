import { describe, expect, it } from 'vitest';
import { ADAPTER_IDS, DEFAULT_ADAPTER_IDS, adapterNote, createAdapter } from '../src/registry';

describe('アダプタの登録', () => {
  it('登録された id から、同じ id のアダプタを作れる', () => {
    for (const id of ADAPTER_IDS) {
      expect(createAdapter(id)?.id).toBe(id);
    }
  });

  it('未対応の id には null を返す', () => {
    expect(createAdapter('edogawa')).toBeNull();
    expect(adapterNote('edogawa')).toBeNull();
  });

  it('川崎市は既定の検索対象に含めず、注意書きを付ける', () => {
    expect(ADAPTER_IDS).toContain('kawasaki');
    expect(DEFAULT_ADAPTER_IDS).not.toContain('kawasaki');
    expect(adapterNote('kawasaki')).toContain('固定のIPアドレス');
  });

  it('品川区は既定の検索対象に含めず、注意書きを付ける', () => {
    expect(DEFAULT_ADAPTER_IDS).not.toContain('shinagawa');
    expect(adapterNote('shinagawa')).toContain('robots.txt');
  });

  it('大田区と渋谷区は既定の検索対象', () => {
    expect(DEFAULT_ADAPTER_IDS).toEqual(expect.arrayContaining(['ota', 'shibuya']));
    expect(adapterNote('ota')).toBeNull();
  });
});
