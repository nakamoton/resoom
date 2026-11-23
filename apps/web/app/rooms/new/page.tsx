import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb, listMunicipalities } from '@resoom/db';
import { requirePermission } from '@/lib/session';
import { Bi } from '../../_i18n/Bi';
import { T } from '../../_i18n/texts';
import { RoomForm } from '../_components/RoomForm';

export const metadata: Metadata = { title: `${T.addRoomHeading.en} · ${T.addRoomHeading.ja}` };
export const dynamic = 'force-dynamic';

export default async function NewRoomPage() {
  await requirePermission('editCatalog', '/rooms/new');
  const municipalities = await listMunicipalities(await getDb());

  return (
    <>
      <Link href="/rooms" className="back">
        <Bi text={T.backToCatalog} />
      </Link>
      <h1>
        <Bi text={T.addRoomHeading} stack />
      </h1>
      <p className="lead">
        <Bi text={T.addRoomLead} />
      </p>
      <div className="card">
        <RoomForm municipalities={municipalities} />
      </div>
    </>
  );
}
