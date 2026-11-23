import { describe, expect, it } from 'vitest';
import { ERROR_MESSAGES, validateNewEvidence, validateNewRoom, validateRoomBasics } from '../src/validation';

const TODAY = '2026-11-23';
const evidence = (overrides: Record<string, unknown> = {}) => ({
  kind: 'usage',
  occurredOn: '2025-02-15',
  result: 'prohibited',
  instruments: ['drum_set'],
  note: 'ドラムセットを使ったところ、不可と案内された',
  sourceUrl: '',
  reportedBy: '担当者',
  ...overrides,
});

describe('validateNewEvidence', () => {
  it('正しい入力を受け付け、前後の空白を取り除く', () => {
    const result = validateNewEvidence(evidence({ note: '  不可と案内された  ', reportedBy: ' 担当者 ' }), TODAY);

    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'usage',
        occurredOn: '2025-02-15',
        result: 'prohibited',
        instruments: ['drum_set'],
        note: '不可と案内された',
        sourceUrl: null,
        reportedBy: '担当者',
      },
    });
  });

  it('楽器の指定がなくても受け付ける（楽器を限定しない記録）', () => {
    const result = validateNewEvidence(evidence({ instruments: undefined }), TODAY);

    expect(result.ok && result.value.instruments).toEqual([]);
  });

  it('楽器は決まった順に並べ、重複を除く', () => {
    const result = validateNewEvidence(evidence({ instruments: ['taiko', 'wind', 'taiko'] }), TODAY);

    expect(result.ok && result.value.instruments).toEqual(['wind', 'taiko']);
  });

  it.each([
    ['kind', { kind: 'rumor' }, 'kindRequired'],
    ['occurredOn', { occurredOn: '2025-02-30' }, 'dateRequired'],
    ['occurredOn', { occurredOn: '2026-11-24' }, 'dateInFuture'],
    ['result', { result: '' }, 'resultRequired'],
    ['instruments', { instruments: ['piano'] }, 'instrumentsInvalid'],
    ['note', { note: '   ' }, 'noteRequired'],
    ['note', { note: 'あ'.repeat(1001) }, 'maxLength1000'],
    ['reportedBy', { reportedBy: '' }, 'reportedByRequired'],
    ['sourceUrl', { sourceUrl: 'javascript:alert(1)' }, 'urlInvalid'],
  ])('%s が不正なら、その項目のエラーコードを返す', (field, overrides, message) => {
    const result = validateNewEvidence(evidence(overrides), TODAY);

    expect(result).toEqual({ ok: false, errors: { [field]: message } });
  });

  it('今日の日付は受け付ける', () => {
    expect(validateNewEvidence(evidence({ occurredOn: TODAY }), TODAY).ok).toBe(true);
  });

  it('URLがあれば保持する', () => {
    const result = validateNewEvidence(evidence({ sourceUrl: 'https://example.jp/guide.pdf' }), TODAY);

    expect(result.ok && result.value.sourceUrl).toBe('https://example.jp/guide.pdf');
  });
});

describe('validateNewRoom', () => {
  const room = (overrides: Record<string, unknown> = {}) => ({
    municipality: '大田区',
    facilityName: '大田区民プラザ',
    roomName: '第一音楽スタジオ',
    capacity: '50',
    nearestStation: '下丸子',
    ...overrides,
  });

  it('正しい入力を受け付ける', () => {
    expect(validateNewRoom(room())).toEqual({
      ok: true,
      value: {
        municipality: '大田区',
        facilityName: '大田区民プラザ',
        roomName: '第一音楽スタジオ',
        facilityNameEn: null,
        roomNameEn: null,
        capacity: 50,
        capacitySource: null,
        nearestStation: '下丸子',
      },
    });
  });

  it('定員と最寄駅は空でもよい', () => {
    const result = validateNewRoom(room({ capacity: '', nearestStation: '' }));

    expect(result.ok && [result.value.capacity, result.value.nearestStation]).toEqual([null, null]);
  });

  it.each([
    ['municipality', { municipality: '' }, 'municipalityRequired'],
    ['facilityName', { facilityName: ' ' }, 'facilityNameRequired'],
    ['roomName', { roomName: undefined }, 'roomNameRequired'],
    ['capacity', { capacity: '五十' }, 'capacityInvalid'],
    ['capacity', { capacity: '0' }, 'capacityInvalid'],
  ])('%s が不正なら、その項目のエラーコードを返す', (field, overrides, message) => {
    expect(validateNewRoom(room(overrides))).toEqual({ ok: false, errors: { [field]: message } });
  });
});

describe('validateRoomBasics', () => {
  it('定員・出典・最寄駅を受け付け、前後の空白を取り除く', () => {
    expect(validateRoomBasics({ capacity: ' 60 ', capacitySource: ' 施設に電話で確認 ', nearestStation: ' 沼部 ' })).toEqual({
      ok: true,
      value: { facilityNameEn: null, roomNameEn: null, capacity: 60, capacitySource: '施設に電話で確認', nearestStation: '沼部' },
    });
  });

  it('すべて空でもよい', () => {
    expect(validateRoomBasics({})).toEqual({
      ok: true,
      value: { facilityNameEn: null, roomNameEn: null, capacity: null, capacitySource: null, nearestStation: null },
    });
  });

  it.each([
    ['capacity', { capacity: '十' }, 'capacityInvalid'],
    ['capacity', { capacity: '10000' }, 'capacityInvalid'],
    ['capacitySource', { capacity: '60', capacitySource: 'あ'.repeat(201) }, 'maxLength200'],
    ['capacitySource', { capacitySource: '出典だけ' }, 'capacitySourceWithoutCapacity'],
    ['nearestStation', { nearestStation: 'あ'.repeat(41) }, 'maxLength40'],
    ['roomNameEn', { roomNameEn: 'a'.repeat(121) }, 'maxLength120'],
  ])('%s が不正なら、その項目のエラーコードを返す', (field, raw, message) => {
    expect(validateRoomBasics(raw)).toEqual({ ok: false, errors: { [field]: message } });
  });
});

describe('英語名', () => {
  it('英語名を受け付け、空なら null にする', () => {
    const result = validateRoomBasics({ facilityNameEn: ' Ota Civic Plaza ', roomNameEn: '' });

    expect(result.ok && [result.value.facilityNameEn, result.value.roomNameEn]).toEqual(['Ota Civic Plaza', null]);
  });
});

describe('ERROR_MESSAGES', () => {
  it('すべてのエラーコードに英語と日本語の文がある', () => {
    for (const message of Object.values(ERROR_MESSAGES)) {
      expect(message.en.length).toBeGreaterThan(0);
      expect(message.ja.length).toBeGreaterThan(0);
    }
  });
});
