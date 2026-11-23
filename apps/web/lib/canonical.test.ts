import { describe, expect, it } from 'vitest';
import { canonicalRedirect } from './canonical';

const CANONICAL = 'https://resoom-7cy6r6anma-an.a.run.app';

describe('canonicalRedirect', () => {
  it('もう一方の run.app のURLは、パスと検索条件を保ったまま正規のURLへ移す', () => {
    expect(canonicalRedirect('/search?d=6&people=45', 'resoom-557374160334.asia-northeast1.run.app', CANONICAL)).toBe(
      'https://resoom-7cy6r6anma-an.a.run.app/search?d=6&people=45',
    );
  });

  it('正規のURLで開かれたら移さない（大文字小文字は区別しない）', () => {
    expect(canonicalRedirect('/search', 'RESOOM-7cy6r6anma-an.a.run.app', CANONICAL)).toBeNull();
  });

  it('run.app 以外のホスト（ローカルなど）は移さない', () => {
    expect(canonicalRedirect('/search', 'localhost:3000', CANONICAL)).toBeNull();
    expect(canonicalRedirect('/search', '127.0.0.1:3100', 'http://127.0.0.1:3100')).toBeNull();
  });

  it('正規のURLが未設定・不正、またはホストがなければ移さない', () => {
    expect(canonicalRedirect('/search', 'resoom-1.asia-northeast1.run.app', undefined)).toBeNull();
    expect(canonicalRedirect('/search', 'resoom-1.asia-northeast1.run.app', 'not a url')).toBeNull();
    expect(canonicalRedirect('/search', null, CANONICAL)).toBeNull();
  });

  it('別のサイトへ飛ばすようなパスは、トップへの移動にする', () => {
    expect(canonicalRedirect('//evil.example/x', 'resoom-1.asia-northeast1.run.app', CANONICAL)).toBe('https://resoom-7cy6r6anma-an.a.run.app/');
  });
});
