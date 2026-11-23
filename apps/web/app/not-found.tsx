import Link from 'next/link';

export default function NotFound() {
  return (
    <>
      <h1>ページが見つかりません</h1>
      <p className="lead">部屋が削除されたか、URLが間違っている可能性があります。</p>
      <Link href="/rooms" className="button">
        施設台帳へ戻る
      </Link>
    </>
  );
}
