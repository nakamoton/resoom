import * as cheerio from 'cheerio';
import type { AvailabilitySlot, RoomInfo, SlotStatus } from '../types';

/** うぐいすネットの空き状況アイコン（ファイル名）と状態の対応。 */
const ICON_STATUS: Record<string, SlotStatus> = {
  icn_scche_ok: 'available',
  icn_scche_noset: 'reserved',
  icn_scche_out: 'not_bookable',
  icn_scche_rest: 'closed',
  icn_scche_hoshu: 'maintenance',
  icn_scche_uten: 'suspended',
  icn_scche_haifun: 'unavailable',
};

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** ページの title。想定外の画面（エラー・セッション切れ）の検知に使う。 */
export function parseTitle(html: string): string {
  return squash(cheerio.load(html)('title').first().text());
}

/** 施設選択画面から部屋の一覧を取り出す。 */
export function parseRoomList(html: string): RoomInfo[] {
  const $ = cheerio.load(html);
  const rooms: RoomInfo[] = [];
  $('#multiShisetsuTable tr').each((_, tr) => {
    const key = $(tr).find('input[name="checkMeisaiUniqKey"]').attr('value');
    if (!key) return;
    const cells = $(tr).children('td');
    const names = cells.eq(1).find('span');
    const capacity = /(\d+)\s*名/.exec(cells.eq(2).text());
    rooms.push({
      key,
      facility: squash(names.eq(0).text()),
      room: squash(names.eq(1).text()),
      capacity: capacity ? Number(capacity[1]) : null,
    });
  });
  return rooms;
}

/**
 * 空き照会画面（7日間・31日間どちらの表示でも）から空き状況を取り出す。
 * 表の見出しには月日しかないので、年は表示開始日から補う。
 */
export function parseAvailability(html: string): AvailabilitySlot[] {
  const $ = cheerio.load(html);
  const startYear = Number($('input[name="optYear"]').attr('value'));
  const startMonth = Number($('input[name="optMonth"]').attr('value'));
  if (!Number.isInteger(startYear) || !Number.isInteger(startMonth)) {
    throw new Error('空き照会画面ではありません（表示開始日が見つかりません）');
  }

  const slots: AvailabilitySlot[] = [];
  $('table.box_calendar').each((_, table) => {
    const room = squash($(table).closest('li').find('h4').first().text());
    const facility = squash($(table).closest('div.box_order').prevAll('h3').first().text());

    // 見出し行: 「11月23日」形式。月が小さくなったら年をまたいだと判断する。
    const dates: string[] = [];
    let year = startYear;
    let prevMonth = startMonth;
    $(table)
      .find('tr.date th')
      .slice(1)
      .each((_, th) => {
        const m = /(\d+)\s*月\s*(\d+)\s*日/.exec($(th).find('p.day').text());
        if (!m) throw new Error(`日付の見出しを解析できません: ${squash($(th).text())}`);
        const month = Number(m[1]);
        if (month < prevMonth) year += 1;
        prevMonth = month;
        dates.push(`${year}-${pad2(month)}-${pad2(Number(m[2]))}`);
      });

    $(table)
      .find('tr')
      .not('.date')
      .each((_, tr) => {
        const time = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec($(tr).children('th').first().text());
        if (!time) return;
        const start = `${pad2(Number(time[1]))}:${time[2]}`;
        const end = `${pad2(Number(time[3]))}:${time[4]}`;
        $(tr)
          .children('td')
          .each((i, td) => {
            const date = dates[i];
            if (!date) throw new Error(`${room} ${start}: 日付の列数とコマの列数が合いません`);
            const img = $(td).find('img').first();
            const icon = /([a-z_]+)\.png/.exec(img.attr('src') ?? '')?.[1] ?? '';
            slots.push({
              facility,
              room,
              date,
              start,
              end,
              status: ICON_STATUS[icon] ?? 'unknown',
              rawLabel: squash(img.attr('alt') ?? $(td).text()),
            });
          });
      });
  });
  return slots;
}
