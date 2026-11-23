import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectivePolicy, type NewEvidenceInput, type NewRoomInput } from '@resoom/core';
import {
  DuplicateRoomError,
  addEvidence,
  createRoom,
  getRoom,
  importSeed,
  listMunicipalities,
  listRooms,
  openDb,
  type Db,
  type SeedRoom,
} from '../src/index';

const room = (overrides: Partial<NewRoomInput> = {}): NewRoomInput => ({
  municipality: '大田区',
  facilityName: '嶺町文化センター',
  roomName: '第一集会室',
  capacity: null,
  nearestStation: null,
  ...overrides,
});

const evidence = (overrides: Partial<NewEvidenceInput> = {}): NewEvidenceInput => ({
  kind: 'usage',
  occurredOn: '2025-02-15',
  result: 'prohibited',
  instruments: ['drum_set'],
  note: 'ドラムセットを使ったところ、不可と案内された',
  sourceUrl: null,
  reportedBy: '予約担当',
  ...overrides,
});

let db: Db;
beforeEach(async () => {
  db = await openDb();
});
afterEach(async () => {
  await db.$client.close();
});

describe('部屋の登録と取得', () => {
  it('追加した部屋を id で取得できる', async () => {
    const id = await createRoom(db, room({ capacity: 40, nearestStation: '沼部' }));

    expect(await getRoom(db, id)).toMatchObject({
      id,
      municipality: '大田区',
      facilityName: '嶺町文化センター',
      roomName: '第一集会室',
      capacity: 40,
      nearestStation: '沼部',
      evidences: [],
    });
  });

  it('同じ自治体・施設・部屋名は二重に登録できない', async () => {
    await createRoom(db, room());

    await expect(createRoom(db, room({ capacity: 99 }))).rejects.toBeInstanceOf(DuplicateRoomError);
    expect(await listRooms(db)).toHaveLength(1);
  });

  it('存在しない id や id の形でない文字列には null を返す', async () => {
    expect(await getRoom(db, '00000000-0000-4000-8000-000000000000')).toBeNull();
    expect(await getRoom(db, "1' or '1'='1")).toBeNull();
  });

  it('一覧は自治体・施設・部屋名の順に並び、自治体で絞り込める', async () => {
    await createRoom(db, room({ municipality: '川崎市', facilityName: '中原市民館', roomName: '音楽室' }));
    await createRoom(db, room({ roomName: '第二集会室' }));
    await createRoom(db, room());

    expect((await listRooms(db)).map((r) => `${r.municipality} ${r.roomName}`)).toEqual([
      '大田区 第一集会室',
      '大田区 第二集会室',
      '川崎市 音楽室',
    ]);
    expect((await listRooms(db, { municipality: '川崎市' })).map((r) => r.facilityName)).toEqual(['中原市民館']);
    expect(await listMunicipalities(db)).toEqual(['大田区', '川崎市']);
  });
});

describe('記録の追加', () => {
  it('追加した記録が部屋に付き、状態の判定に使える', async () => {
    const id = await createRoom(db, room());

    await addEvidence(db, id, evidence());

    const saved = await getRoom(db, id);
    expect(saved?.evidences).toHaveLength(1);
    expect(saved?.evidences[0]).toMatchObject({ result: 'prohibited', instruments: ['drum_set'], reportedBy: '予約担当' });
    const policy = effectivePolicy(saved?.evidences ?? []);
    expect(policy.drum_set.status).toBe('prohibited');
    expect(policy.wind.status).toBe('unknown');
  });

  it('記録は出来事の日付が新しい順に返す', async () => {
    const id = await createRoom(db, room());
    await addEvidence(db, id, evidence({ occurredOn: '2025-02-15', note: '古い' }));
    await addEvidence(db, id, evidence({ occurredOn: '2026-10-01', note: '新しい' }));
    await addEvidence(db, id, evidence({ occurredOn: '2025-12-01', note: '中間' }));

    expect((await getRoom(db, id))?.evidences.map((e) => e.note)).toEqual(['新しい', '中間', '古い']);
  });

  it('一覧でも部屋ごとに記録が付く', async () => {
    const a = await createRoom(db, room());
    await createRoom(db, room({ roomName: '第二集会室' }));
    await addEvidence(db, a, evidence());

    expect((await listRooms(db)).map((r) => r.evidences.length)).toEqual([1, 0]);
  });

  it('決められた値以外の結果は保存できない', async () => {
    const id = await createRoom(db, room());

    await expect(addEvidence(db, id, evidence({ result: 'maybe' as never }))).rejects.toThrow();
  });
});

describe('初期データの取り込み', () => {
  const seed: SeedRoom[] = [
    {
      ...room({ municipality: '大田区', facilityName: '大田区民プラザ', roomName: '第一音楽スタジオ', capacity: 50 }),
      adapter: { id: 'ota', facilityCode: '131113_001_18' },
      evidences: [{ key: 'calendar', ...evidence({ result: 'allowed', instruments: [], occurredOn: '2025-07-19' }) }],
    },
    { ...room(), evidences: [{ key: 'drum-set', ...evidence() }] },
  ];

  it('部屋・アダプタの情報・記録を取り込む', async () => {
    expect(await importSeed(db, seed)).toEqual({ rooms: 2, evidences: 2 });

    const [plaza] = await listRooms(db, { adapterId: 'ota' });
    expect(plaza).toMatchObject({ roomName: '第一音楽スタジオ', adapterFacilityCode: '131113_001_18', capacity: 50 });
    expect(plaza?.evidences).toHaveLength(1);
  });

  it('繰り返し実行しても、部屋も記録も増えない', async () => {
    await importSeed(db, seed);

    expect(await importSeed(db, seed)).toEqual({ rooms: 2, evidences: 0 });
    const all = await listRooms(db);
    expect(all).toHaveLength(2);
    expect(all.map((r) => r.evidences.length)).toEqual([1, 1]);
  });

  it('画面から追加された記録を消さず、基本情報だけ更新する', async () => {
    await importSeed(db, seed);
    const [plaza] = await listRooms(db, { adapterId: 'ota' });
    await addEvidence(db, plaza!.id, evidence({ note: '画面から追加' }));

    await importSeed(db, [{ ...seed[0]!, capacity: 54 }]);

    const after = await getRoom(db, plaza!.id);
    expect(after?.capacity).toBe(54);
    expect(after?.evidences.map((e) => e.note)).toContain('画面から追加');
    expect(after?.evidences).toHaveLength(2);
  });
});
