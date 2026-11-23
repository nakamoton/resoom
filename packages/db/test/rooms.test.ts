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
  removeCandidateRooms,
  updateRoomBasics,
  type Db,
  type SeedRoom,
  disposeDb,
} from '../src/index';

const room = (overrides: Partial<NewRoomInput> = {}): NewRoomInput => ({
  municipality: '大田区',
  facilityName: '嶺町文化センター',
  roomName: '第一集会室',
  facilityNameEn: null,
  roomNameEn: null,
  capacity: null,
  capacitySource: null,
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
  await disposeDb(db);
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

describe('基本情報の更新', () => {
  it('定員・定員の出典・最寄駅を更新する', async () => {
    const id = await createRoom(db, room());

    expect(await updateRoomBasics(db, id, { facilityNameEn: null, roomNameEn: null, capacity: 60, capacitySource: '施設に電話で確認', nearestStation: '沼部' })).toBe(true);

    expect(await getRoom(db, id)).toMatchObject({ facilityNameEn: null, roomNameEn: null, capacity: 60, capacitySource: '施設に電話で確認', nearestStation: '沼部' });
  });

  it('英語名を保存できる', async () => {
    const id = await createRoom(db, room());

    await updateRoomBasics(db, id, {
      facilityNameEn: 'Minemachi Culture Center',
      roomNameEn: 'Assembly Room 1',
      capacity: 60,
      capacitySource: null,
      nearestStation: null,
    });

    expect(await getRoom(db, id)).toMatchObject({ facilityNameEn: 'Minemachi Culture Center', roomNameEn: 'Assembly Room 1' });
  });

  it('空にもできる', async () => {
    const id = await createRoom(db, room({ facilityNameEn: null, roomNameEn: null, capacity: 60, capacitySource: '出典', nearestStation: '沼部' }));

    await updateRoomBasics(db, id, { facilityNameEn: null, roomNameEn: null, capacity: null, capacitySource: null, nearestStation: null });

    expect(await getRoom(db, id)).toMatchObject({ facilityNameEn: null, roomNameEn: null, capacity: null, capacitySource: null, nearestStation: null });
  });

  it('存在しない部屋や id の形でない文字列には false を返す', async () => {
    const input = { facilityNameEn: null, roomNameEn: null, capacity: 1, capacitySource: null, nearestStation: null };
    expect(await updateRoomBasics(db, '00000000-0000-4000-8000-000000000000', input)).toBe(false);
    expect(await updateRoomBasics(db, 'x', input)).toBe(false);
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

  it('自治体サイトでの部屋名を保存し、省略時は null にする', async () => {
    await importSeed(db, [
      { ...room({ municipality: '川崎市', facilityName: 'プラザ大師', roomName: '第１・第２学習室合併' }), adapter: { id: 'kawasaki', facilityCode: 'X1', rooms: ['第1学習室', '第2学習室'] }, evidences: [] },
      ...seed,
    ]);

    const all = await listRooms(db);
    expect(all.find((r) => r.facilityName === 'プラザ大師')?.adapterRoomNames).toEqual(['第1学習室', '第2学習室']);
    expect(all.find((r) => r.facilityName === '大田区民プラザ')?.adapterRoomNames).toBeNull();
  });

  it('繰り返し実行しても、部屋も記録も増えない', async () => {
    await importSeed(db, seed);

    expect(await importSeed(db, seed)).toEqual({ rooms: 2, evidences: 0 });
    const all = await listRooms(db);
    expect(all).toHaveLength(2);
    expect(all.map((r) => r.evidences.length)).toEqual([1, 1]);
  });

  it('画面で直した定員と最寄駅は、取り込み直しても上書きしない', async () => {
    await importSeed(db, seed);
    const [plaza] = await listRooms(db, { adapterId: 'ota' });
    await updateRoomBasics(db, plaza!.id, { facilityNameEn: null, roomNameEn: null, capacity: 45, capacitySource: '実際に合奏して確認', nearestStation: '下丸子' });

    await importSeed(db, seed);

    expect(await getRoom(db, plaza!.id)).toMatchObject({ facilityNameEn: null, roomNameEn: null, capacity: 45, capacitySource: '実際に合奏して確認', nearestStation: '下丸子' });
  });

  it('英語名は、空のときだけ取り込みで埋める', async () => {
    await importSeed(db, [{ ...seed[1]!, facilityNameEn: 'Minemachi Culture Center', roomNameEn: null }]);
    const [minemachi] = await listRooms(db);
    await updateRoomBasics(db, minemachi!.id, {
      facilityNameEn: 'Minemachi Bunka Center',
      roomNameEn: null,
      capacity: null,
      capacitySource: null,
      nearestStation: null,
    });

    await importSeed(db, [{ ...seed[1]!, facilityNameEn: 'Minemachi Culture Center', roomNameEn: 'Assembly Room 1' }]);

    expect(await getRoom(db, minemachi!.id)).toMatchObject({ facilityNameEn: 'Minemachi Bunka Center', roomNameEn: 'Assembly Room 1' });
  });

  it('定員が空の部屋は、取り込みで定員と出典を埋める', async () => {
    await importSeed(db, [{ ...seed[1]!, capacity: null, capacitySource: null }]);
    expect((await listRooms(db))[0]?.capacity).toBeNull();

    await importSeed(db, [{ ...seed[1]!, capacity: 60, capacitySource: 'うぐいすネットの部屋一覧' }]);

    expect((await listRooms(db))[0]).toMatchObject({ capacity: 60, capacitySource: 'うぐいすネットの部屋一覧' });
  });

  it('画面から追加された記録を消さず、照会の設定は取り込みの内容で更新する', async () => {
    await importSeed(db, seed);
    const [plaza] = await listRooms(db, { adapterId: 'ota' });
    await addEvidence(db, plaza!.id, evidence({ note: '画面から追加' }));

    await importSeed(db, [{ ...seed[0]!, capacity: 54, adapter: { id: 'ota', facilityCode: '131113_001_99' } }]);

    const after = await getRoom(db, plaza!.id);
    expect(after?.adapterFacilityCode).toBe('131113_001_99');
    expect(after?.capacity).toBe(50);
    expect(after?.evidences.map((e) => e.note)).toContain('画面から追加');
    expect(after?.evidences).toHaveLength(2);
  });
});

describe('料金・候補・閉館の取り込み', () => {
  const base = { ...room({ municipality: '渋谷区', facilityName: '幡ケ谷社会教育館', roomName: '大学習室' }), evidences: [] };

  it('料金・候補・閉館を取り込み、取り込み直すと初期データの内容にそろえる', async () => {
    await importSeed(db, [
      {
        ...base,
        candidate: true,
        fees: { unit: 'slot', slots: [{ label: '午前', start: '09:00', end: '12:00', yen: 3700 }], sources: ['https://example.jp/fee'], checkedOn: '2026-11-23' },
        closure: { status: 'closed', note: { en: 'Closed in June 2026.', ja: '2026年6月で閉館。' }, sources: ['https://example.jp/closed'], checkedOn: '2026-11-23' },
      },
    ]);
    const [saved] = await listRooms(db);
    expect(saved).toMatchObject({ candidate: true, fees: { slots: [{ yen: 3700 }] }, closure: { status: 'closed' } });

    await importSeed(db, [base]);

    expect((await listRooms(db))[0]).toMatchObject({ candidate: false, fees: null, closure: null });
  });
});

describe('候補から外した部屋', () => {
  const candidate = { ...room({ municipality: '渋谷区', facilityName: '美竹の丘', roomName: '多目的ホール' }), candidate: true, evidences: [] };
  const removed = [{ municipality: '渋谷区', facilityName: '美竹の丘', roomName: '多目的ホール', reason: '区内の団体だけが使える', removedOn: '2026-11-23' }];

  it('一覧にある候補の部屋を消し、何度実行しても同じ結果になる', async () => {
    await importSeed(db, [candidate, { ...room(), evidences: [] }]);

    expect(await removeCandidateRooms(db, removed)).toEqual({ removed: ['渋谷区 美竹の丘 多目的ホール'], kept: [] });
    expect((await listRooms(db)).map((r) => r.roomName)).toEqual(['第一集会室']);
    expect(await removeCandidateRooms(db, removed)).toEqual({ removed: [], kept: [] });
  });

  it('使ったことのある部屋（候補でない部屋）は消さない', async () => {
    await importSeed(db, [{ ...candidate, candidate: false }]);

    expect(await removeCandidateRooms(db, removed)).toEqual({ removed: [], kept: ['渋谷区 美竹の丘 多目的ホール'] });
    expect(await listRooms(db)).toHaveLength(1);
  });

  it('画面から記録が追加された部屋は消さない', async () => {
    await importSeed(db, [candidate]);
    const [saved] = await listRooms(db);
    await addEvidence(db, saved!.id, evidence({ note: '画面から追加' }));

    expect(await removeCandidateRooms(db, removed)).toEqual({ removed: [], kept: ['渋谷区 美竹の丘 多目的ホール'] });
    expect(await listRooms(db)).toHaveLength(1);
  });
});
