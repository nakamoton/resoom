import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoom, loadAvailability, openDb, recordAvailabilityError, saveAvailability, type Db } from '../src/index';

let db: Db;
let roomId: string;
beforeEach(async () => {
  db = await openDb();
  roomId = await createRoom(db, {
    municipality: '大田区',
    facilityName: '大田区民プラザ',
    roomName: '第一音楽スタジオ',
    facilityNameEn: null,
    roomNameEn: null,
    capacity: 50,
    capacitySource: null,
    nearestStation: null,
  });
});
afterEach(async () => {
  await db.$client.close();
});

const slot = (date: string, start: string, status: 'available' | 'reserved' = 'available') => ({
  date,
  start,
  end: '17:00',
  status,
  rawLabel: status === 'available' ? '空いています' : '予約済みです',
});

describe('空き状況の保存と読み出し', () => {
  it('保存したコマと取得の記録を読み出せる', async () => {
    await saveAvailability(db, {
      roomId,
      from: '2026-12-01',
      to: '2026-12-31',
      coveredThrough: '2026-12-31',
      fetchedAt: new Date('2026-11-23T03:00:00Z'),
      slots: [slot('2026-12-19', '13:00'), slot('2026-12-20', '13:00', 'reserved')],
    });

    const { slots, snapshots } = await loadAvailability(db, { from: '2026-12-01', to: '2026-12-31' });
    expect(slots.map((s) => `${s.date} ${s.start} ${s.status}`)).toEqual(['2026-12-19 13:00 available', '2026-12-20 13:00 reserved']);
    expect(snapshots).toEqual([
      {
        roomId,
        coveredFrom: '2026-12-01',
        coveredThrough: '2026-12-31',
        fetchedAt: new Date('2026-11-23T03:00:00Z'),
        lastError: null,
        lastErrorAt: null,
      },
    ]);
  });

  it('同じ期間を取得し直すと、古いコマを置き換える（期間外のコマは残す）', async () => {
    const base = { roomId, coveredThrough: '2026-12-31', fetchedAt: new Date() };
    await saveAvailability(db, { ...base, from: '2026-11-01', to: '2026-12-31', slots: [slot('2026-11-30', '13:00'), slot('2026-12-19', '13:00')] });

    await saveAvailability(db, { ...base, from: '2026-12-01', to: '2026-12-31', slots: [slot('2026-12-19', '13:00', 'reserved')] });

    const { slots } = await loadAvailability(db, { from: '2026-11-01', to: '2026-12-31' });
    expect(slots.map((s) => `${s.date} ${s.status}`).sort()).toEqual(['2026-11-30 available', '2026-12-19 reserved']);
  });

  it('期間の外のコマは保存しない', async () => {
    await saveAvailability(db, {
      roomId,
      from: '2026-12-01',
      to: '2026-12-31',
      coveredThrough: '2026-12-31',
      fetchedAt: new Date(),
      slots: [slot('2027-01-02', '13:00')],
    });

    expect((await loadAvailability(db, { from: '2026-12-01', to: '2027-12-31' })).slots).toEqual([]);
  });

  it('失敗を記録しても、前回のコマと成功の記録は残し、次に成功したら失敗の記録を消す', async () => {
    const ok = { roomId, from: '2026-12-01', to: '2026-12-31', coveredThrough: '2026-12-31', fetchedAt: new Date('2026-11-23T03:00:00Z') };
    await saveAvailability(db, { ...ok, slots: [slot('2026-12-19', '13:00')] });

    await recordAvailabilityError(db, roomId, '想定外の画面です', new Date('2026-11-24T03:00:00Z'));
    let loaded = await loadAvailability(db, { from: '2026-12-01', to: '2026-12-31' });
    expect(loaded.slots).toHaveLength(1);
    expect(loaded.snapshots[0]).toMatchObject({ coveredThrough: '2026-12-31', lastError: '想定外の画面です' });

    await saveAvailability(db, { ...ok, slots: [] });
    loaded = await loadAvailability(db, { from: '2026-12-01', to: '2026-12-31' });
    expect(loaded.snapshots[0]).toMatchObject({ lastError: null, lastErrorAt: null });
  });

  it('一度も成功していない部屋の失敗も記録できる', async () => {
    await recordAvailabilityError(db, roomId, 'HTTP 503', new Date());

    expect((await loadAvailability(db, { from: '2026-12-01', to: '2026-12-31' })).snapshots[0]).toMatchObject({
      coveredThrough: null,
      fetchedAt: null,
      lastError: 'HTTP 503',
    });
  });
});
