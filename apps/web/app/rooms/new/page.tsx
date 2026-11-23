import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb, listMunicipalities } from '@resoom/db';
import { RoomForm } from '../_components/RoomForm';

export const metadata: Metadata = { title: '部屋を追加' };
export const dynamic = 'force-dynamic';

export default async function NewRoomPage() {
  const municipalities = await listMunicipalities(await getDb());

  return (
    <>
      <Link href="/rooms" className="back">
        ← 施設台帳へ戻る
      </Link>
      <h1>部屋を追加</h1>
      <p className="lead">まだ使ったことのない部屋でも、問い合わせた結果を残すために登録できます。</p>
      <div className="card">
        <RoomForm municipalities={municipalities} />
      </div>
    </>
  );
}
