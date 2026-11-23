import { describe, expect, it } from 'vitest';
import { validateNewEvidence, validateNewRoom, validateRoomBasics } from '../src/validation';

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
    ['kind', { kind: 'rumor' }, '記録の種類を選んでください'],
    ['occurredOn', { occurredOn: '2025-02-30' }, '日付を入力してください'],
    ['occurredOn', { occurredOn: '2026-11-24' }, '未来の日付は入力できません'],
    ['result', { result: '' }, '結果を選んでください'],
    ['instruments', { instruments: ['piano'] }, '楽器の指定が正しくありません'],
    ['note', { note: '   ' }, '内容を入力してください'],
    ['note', { note: 'あ'.repeat(1001) }, '1000文字以内で入力してください'],
    ['reportedBy', { reportedBy: '' }, '記録者の名前を入力してください'],
    ['sourceUrl', { sourceUrl: 'javascript:alert(1)' }, 'http:// または https:// で始まるURLを入力してください'],
  ])('%s が不正なら、その項目のエラーを返す', (field, overrides, message) => {
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
    ['municipality', { municipality: '' }, '自治体を入力してください'],
    ['facilityName', { facilityName: ' ' }, '施設名を入力してください'],
    ['roomName', { roomName: undefined }, '部屋名を入力してください'],
    ['capacity', { capacity: '五十' }, '定員は1〜9999の数字で入力してください'],
    ['capacity', { capacity: '0' }, '定員は1〜9999の数字で入力してください'],
  ])('%s が不正なら、その項目のエラーを返す', (field, overrides, message) => {
    expect(validateNewRoom(room(overrides))).toEqual({ ok: false, errors: { [field]: message } });
  });
});

describe('validateRoomBasics', () => {
  it('定員・出典・最寄駅を受け付け、前後の空白を取り除く', () => {
    expect(validateRoomBasics({ capacity: ' 60 ', capacitySource: ' 施設に電話で確認 ', nearestStation: ' 沼部 ' })).toEqual({
      ok: true,
      value: { capacity: 60, capacitySource: '施設に電話で確認', nearestStation: '沼部' },
    });
  });

  it('すべて空でもよい', () => {
    expect(validateRoomBasics({})).toEqual({ ok: true, value: { capacity: null, capacitySource: null, nearestStation: null } });
  });

  it.each([
    ['capacity', { capacity: '十' }, '定員は1〜9999の数字で入力してください'],
    ['capacity', { capacity: '10000' }, '定員は1〜9999の数字で入力してください'],
    ['capacitySource', { capacity: '60', capacitySource: 'あ'.repeat(201) }, '200文字以内で入力してください'],
    ['capacitySource', { capacitySource: '出典だけ' }, '定員を入力するか、出典を空にしてください'],
    ['nearestStation', { nearestStation: 'あ'.repeat(41) }, '40文字以内で入力してください'],
  ])('%s が不正なら、その項目のエラーを返す', (field, raw, message) => {
    expect(validateRoomBasics(raw)).toEqual({ ok: false, errors: { [field]: message } });
  });
});
