import { describe, expect, it } from 'vitest';
import { MEMBER_ROLES, MEMBER_ROLE_DESCRIPTIONS, MEMBER_ROLE_LABELS, can, isValidEmail, normalizeEmail } from '../src/members';

describe('can', () => {
  it.each([
    ['admin', 'viewCatalog', true],
    ['admin', 'editCatalog', true],
    ['admin', 'manageMembers', true],
    ['editor', 'viewCatalog', true],
    ['editor', 'editCatalog', true],
    ['editor', 'manageMembers', false],
    ['member', 'viewCatalog', true],
    ['member', 'editCatalog', false],
    ['member', 'manageMembers', false],
  ] as const)('%s は %s が %s', (role, permission, expected) => {
    expect(can(role, permission)).toBe(expected);
  });

  it('ロールがなければ（ログインしていない・名簿にない）何もできない', () => {
    expect(can(null, 'viewCatalog')).toBe(false);
    expect(can(undefined, 'viewCatalog')).toBe(false);
  });
});

describe('メールアドレス', () => {
  it('前後の空白を除き、小文字にそろえる', () => {
    expect(normalizeEmail('  Taro.Yamada@Example.COM ')).toBe('taro.yamada@example.com');
  });

  it.each([
    ['taro@example.com', true],
    ['taro@example', false],
    ['taro example.com', false],
    ['', false],
  ])('%s は %s', (email, expected) => {
    expect(isValidEmail(email)).toBe(expected);
  });
});

describe('ロールの表示', () => {
  it('すべてのロールに英語と日本語の名前と説明がある', () => {
    for (const role of MEMBER_ROLES) {
      expect(MEMBER_ROLE_LABELS[role].en).toMatch(/[A-Za-z]/);
      expect(MEMBER_ROLE_DESCRIPTIONS[role].ja.length).toBeGreaterThan(0);
    }
  });
});
