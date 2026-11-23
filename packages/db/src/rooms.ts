import { asc, desc, eq, sql } from 'drizzle-orm';
import type { NewEvidenceInput, NewRoomInput } from '@resoom/core';
import type { Db } from './client';
import { policyEvidences, rooms, type PolicyEvidence, type Room } from './schema';

export interface RoomWithEvidences extends Room {
  /** 新しい順 */
  evidences: PolicyEvidence[];
}

export class DuplicateRoomError extends Error {
  constructor() {
    super('同じ自治体・施設・部屋名の部屋がすでに登録されています');
    this.name = 'DuplicateRoomError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const newestFirst = [desc(policyEvidences.occurredOn), desc(policyEvidences.createdAt)];

/** 部屋の一覧を、記録つきで返す。自治体・施設・部屋名の順。 */
export async function listRooms(db: Db, filter: { municipality?: string; adapterId?: string } = {}): Promise<RoomWithEvidences[]> {
  const allRooms = await db.select().from(rooms).orderBy(asc(rooms.municipality), asc(rooms.facilityName), asc(rooms.roomName));
  const selected = allRooms.filter(
    (r) => (!filter.municipality || r.municipality === filter.municipality) && (!filter.adapterId || r.adapterId === filter.adapterId),
  );
  const evidences = await db.select().from(policyEvidences).orderBy(...newestFirst);
  const byRoom = new Map<string, PolicyEvidence[]>();
  for (const e of evidences) byRoom.set(e.roomId, [...(byRoom.get(e.roomId) ?? []), e]);
  return selected.map((r) => ({ ...r, evidences: byRoom.get(r.id) ?? [] }));
}

/** 登録されている自治体の一覧。 */
export async function listMunicipalities(db: Db): Promise<string[]> {
  const rows = await db.selectDistinct({ municipality: rooms.municipality }).from(rooms).orderBy(asc(rooms.municipality));
  return rows.map((r) => r.municipality);
}

/** 部屋を1件、記録つきで返す。なければ null。 */
export async function getRoom(db: Db, id: string): Promise<RoomWithEvidences | null> {
  if (!UUID.test(id)) return null;
  const [room] = await db.select().from(rooms).where(eq(rooms.id, id));
  if (!room) return null;
  const evidences = await db.select().from(policyEvidences).where(eq(policyEvidences.roomId, id)).orderBy(...newestFirst);
  return { ...room, evidences };
}

/** 部屋を追加し、その id を返す。同じ部屋があれば DuplicateRoomError。 */
export async function createRoom(db: Db, input: NewRoomInput): Promise<string> {
  const [created] = await db.insert(rooms).values(input).onConflictDoNothing().returning({ id: rooms.id });
  if (!created) throw new DuplicateRoomError();
  return created.id;
}

/** 部屋に記録を追加する。 */
export async function addEvidence(db: Db, roomId: string, input: NewEvidenceInput): Promise<PolicyEvidence> {
  const [created] = await db.insert(policyEvidences).values({ roomId, ...input }).returning();
  if (!created) throw new Error('記録を保存できませんでした');
  return created;
}

export interface SeedRoom extends NewRoomInput {
  adapter?: { id: string; facilityCode: string };
  evidences: Array<NewEvidenceInput & { key: string }>;
}

/**
 * 初期データを取り込む。何度実行しても同じ結果になる。
 * すでにある部屋は基本情報だけ更新し、画面から追加された記録には触れない。
 */
export async function importSeed(db: Db, seed: SeedRoom[]): Promise<{ rooms: number; evidences: number }> {
  let evidenceCount = 0;
  for (const { adapter, evidences, ...room } of seed) {
    const values = { ...room, adapterId: adapter?.id ?? null, adapterFacilityCode: adapter?.facilityCode ?? null };
    const [saved] = await db
      .insert(rooms)
      .values(values)
      .onConflictDoUpdate({
        target: [rooms.municipality, rooms.facilityName, rooms.roomName],
        set: {
          capacity: sql`excluded.capacity`,
          nearestStation: sql`excluded.nearest_station`,
          adapterId: sql`excluded.adapter_id`,
          adapterFacilityCode: sql`excluded.adapter_facility_code`,
        },
      })
      .returning({ id: rooms.id });
    if (!saved) throw new Error(`部屋を保存できませんでした: ${room.facilityName} ${room.roomName}`);
    for (const { key, ...evidence } of evidences) {
      const seedKey = `${room.municipality}/${room.facilityName}/${room.roomName}#${key}`;
      const inserted = await db
        .insert(policyEvidences)
        .values({ roomId: saved.id, seedKey, ...evidence })
        .onConflictDoNothing({ target: policyEvidences.seedKey })
        .returning({ id: policyEvidences.id });
      evidenceCount += inserted.length;
    }
  }
  return { rooms: seed.length, evidences: evidenceCount };
}
