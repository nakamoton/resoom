import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { NewEvidenceInput, NewRoomInput, RoomBasicsInput, RoomClosure, RoomFees } from '@resoom/core';
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

/** 部屋の英語名・定員・定員の出典・最寄駅を更新する。部屋がなければ false。 */
export async function updateRoomBasics(db: Db, id: string, input: RoomBasicsInput): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const updated = await db.update(rooms).set(input).where(eq(rooms.id, id)).returning({ id: rooms.id });
  return updated.length > 0;
}

/** 部屋に記録を追加する。 */
export async function addEvidence(db: Db, roomId: string, input: NewEvidenceInput): Promise<PolicyEvidence> {
  const [created] = await db.insert(policyEvidences).values({ roomId, ...input }).returning();
  if (!created) throw new Error('記録を保存できませんでした');
  return created;
}

export interface SeedRoom extends NewRoomInput {
  /** rooms は自治体サイトでの部屋名。省略すると台帳の部屋名を使う */
  adapter?: { id: string; facilityCode: string; rooms?: string[] };
  /** 利用料金。公式の料金表から写したもの（画面からは編集しないので、取り込むたびに初期データの内容にする） */
  fees?: RoomFees | null;
  /** まだ使ったことのない部屋（候補）なら true */
  candidate?: boolean;
  /** 閉館・休館。開いていれば省く */
  closure?: RoomClosure | null;
  evidences: Array<NewEvidenceInput & { key: string }>;
}

/**
 * 初期データを取り込む。何度実行しても同じ結果になる。
 * すでにある部屋は照会の設定と料金を更新する。英語名・定員・最寄駅は、まだ空のときだけ埋める
 * （画面から入力・修正した値を上書きしない）。画面から追加された記録にも触れない。
 */
export async function importSeed(db: Db, seed: SeedRoom[]): Promise<{ rooms: number; evidences: number }> {
  let evidenceCount = 0;
  for (const { adapter, evidences, fees, candidate, closure, ...room } of seed) {
    const values = {
      ...room,
      fees: fees ?? null,
      candidate: candidate ?? false,
      closure: closure ?? null,
      adapterId: adapter?.id ?? null,
      adapterFacilityCode: adapter?.facilityCode ?? null,
      adapterRoomNames: adapter?.rooms ?? null,
    };
    const [saved] = await db
      .insert(rooms)
      .values(values)
      .onConflictDoUpdate({
        target: [rooms.municipality, rooms.facilityName, rooms.roomName],
        set: {
          facilityNameEn: sql`coalesce(${rooms.facilityNameEn}, excluded.facility_name_en)`,
          roomNameEn: sql`coalesce(${rooms.roomNameEn}, excluded.room_name_en)`,
          capacity: sql`coalesce(${rooms.capacity}, excluded.capacity)`,
          capacitySource: sql`case when ${rooms.capacity} is null then excluded.capacity_source else ${rooms.capacitySource} end`,
          nearestStation: sql`coalesce(${rooms.nearestStation}, excluded.nearest_station)`,
          adapterId: sql`excluded.adapter_id`,
          adapterFacilityCode: sql`excluded.adapter_facility_code`,
          adapterRoomNames: sql`excluded.adapter_room_names`,
          fees: sql`excluded.fees`,
          candidate: sql`excluded.candidate`,
          closure: sql`excluded.closure`,
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

/** 候補から外した部屋（data/seed/removed-candidates.json の1件）。 */
export interface RemovedCandidate {
  municipality: string;
  facilityName: string;
  roomName: string;
  /** 外した理由 */
  reason: string;
  /** 外した日（YYYY-MM-DD） */
  removedOn: string;
}

/**
 * 候補から外した部屋を台帳から消す（取得した空き状況も一緒に消える）。初期データの取り込みは部屋を消さないので、
 * 外した部屋はこの一覧で消す。何度実行しても同じ結果になる。
 * 使ったことのある部屋（候補でない部屋）と、画面から記録が追加された部屋は、楽団の情報を失わないよう消さずに残す。
 */
export async function removeCandidateRooms(
  db: Db,
  removed: RemovedCandidate[],
): Promise<{ removed: string[]; kept: string[] }> {
  const result = { removed: [] as string[], kept: [] as string[] };
  for (const { municipality, facilityName, roomName } of removed) {
    const label = `${municipality} ${facilityName} ${roomName}`;
    const [found] = await db
      .select({ id: rooms.id, candidate: rooms.candidate })
      .from(rooms)
      .where(and(eq(rooms.municipality, municipality), eq(rooms.facilityName, facilityName), eq(rooms.roomName, roomName)));
    if (!found) continue;
    const added = await db
      .select({ id: policyEvidences.id })
      .from(policyEvidences)
      .where(and(eq(policyEvidences.roomId, found.id), isNull(policyEvidences.seedKey)))
      .limit(1);
    if (!found.candidate || added.length > 0) {
      result.kept.push(label);
      continue;
    }
    await db.delete(rooms).where(eq(rooms.id, found.id));
    result.removed.push(label);
  }
  return result;
}
