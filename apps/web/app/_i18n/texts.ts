import type { LocalizedText } from '@resoom/core';

const t = (en: string, ja: string): LocalizedText => ({ en, ja });
const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** 画面の文言。英語を主に、日本語は補助として小さく添える。 */
export const T = {
  appName: t('Facility Catalog', '施設台帳'),
  backToCatalog: t('← Back to Facility Catalog', '施設台帳へ戻る'),
  optional: t('Optional', '任意'),
  unknown: t('Unknown', '未登録'),

  // 一覧
  catalogLead: t(
    'Which instruments each room allows, and how we know. Open a room to add a record.',
    '部屋ごとに、楽器の可否とその根拠を記録します。部屋を選ぶと記録を追加できます。',
  ),
  addRoom: t('Add room', '部屋を追加'),
  filterByMunicipality: t('Filter by municipality', '自治体で絞り込む'),
  all: t('All', 'すべて'),
  people: t('People', '人数'),
  peopleOrMore: t('or more can fit', '人以上が入れる部屋'),
  filter: t('Filter', '絞り込む'),
  clearPeople: t('Clear', '人数の指定をやめる'),
  peopleHint: t(
    "Filters by the facility's official capacity. Rooms with unknown capacity are listed separately.",
    '施設の公式の定員で絞り込みます。定員が分からない部屋は、別にまとめて表示します。',
  ),
  peopleInvalid: t('Enter a number from 1 to 9999.', '人数は1〜9999の数字で入力してください。'),
  peopleResult: (people: number, fits: number, tooSmall: number): LocalizedText =>
    t(
      `Capacity ${people} or more: ${fits} ${plural(fits, 'room', 'rooms')}` +
        (tooSmall > 0 ? ` (${tooSmall} ${plural(tooSmall, 'room', 'rooms')} too small left out)` : ''),
      `定員 ${people}人以上: ${fits}部屋` + (tooSmall > 0 ? `（定員が足りない ${tooSmall}部屋を除きました）` : ''),
    ),
  noRooms: t('No rooms yet. Use “Add room” to register one.', 'まだ部屋がありません。「部屋を追加」から登録してください。'),
  noMatch: t('No rooms match.', '条件に合う部屋はありません。'),
  unknownCapacityHeading: (n: number): LocalizedText => t(`Rooms with unknown capacity (${n})`, `定員が未登録の部屋（${n}部屋）`),
  unknownCapacityHint: t(
    "We can't tell whether these rooms fit. You can add the capacity on the room page.",
    '入れるかどうか判断できない部屋です。部屋のページで定員を登録できます。',
  ),
  instrumentsAria: t('Instruments allowed', '楽器ごとの可否'),
  recordCount: (n: number, latest: string): LocalizedText =>
    t(`${n} ${plural(n, 'record', 'records')} (latest ${latest})`, `記録 ${n}件（最新 ${latest}）`),
  noRecordsShort: t('No records', '記録なし'),
  records: t('Records', '記録'),
  candidatesTitle: t("Rooms we haven't used yet", 'まだ使ったことのない部屋（候補）'),
  candidatesNote: t(
    'Music rooms for 40+ people that we can check automatically. Checked once a day, weekends and holidays only. Instrument rules are not confirmed: ask the facility before booking.',
    '自動で空きを確認できる、40人以上の音楽向けの部屋です。空き状況は1日1回、土日祝の分だけ集めています。楽器の可否は未確認なので、予約の前に施設に確認してください。',
  ),
  candidatesNone: t('No open slots match these conditions.', '条件に合う空きはありません。'),
  candidateOpenSlots: t('Open slots', '空きコマ'),
  candidateMore: (n: number): LocalizedText => t(`+${n} more`, `ほか${n}コマ`),
  candidateBadge: t('Not used yet', '未使用'),
  candidateRoomNote: t(
    "We haven't used this room yet. It was picked from the booking system's music rooms. Instrument rules are not confirmed.",
    'まだ使ったことのない部屋です。予約システムの音楽向けの部屋から候補として選びました。楽器の可否は未確認です。',
  ),
  fee: t('Fee', '料金'),
  unknownShort: t('Unknown', '不明'),
  fees: t('Fees', '利用料金'),
  feeUnknown: t('Fee unknown', '料金 不明'),
  feeWeekday: t('Weekdays', '平日'),
  feeHoliday: t('Sat, Sun & holidays', '土日祝'),
  feeAllDays: t('All days', '全日'),
  feeSlot: t('Slot', '区分'),
  feeTime: t('Time', '時間'),
  feeGeneral: t(
    'General rate without discounts, copied from the official fee table. Always check the official site before booking.',
    '割引のない一般の料金です（公式の料金表から）。予約の前に公式のサイトで確認してください。',
  ),
  feeChecked: (date: string): LocalizedText => t(`Checked on ${date}`, `${date} に確認`),
  feeSources: t('Sources', '出典'),
  feePerHour: t('per hour', '1時間あたり'),

  // 部屋のページ
  basicInfo: t('Basic information', '基本情報'),
  capacity: t('Capacity', '定員'),
  capacityPeople: (n: number): LocalizedText => t(`${n} people`, `${n}人`),
  source: t('Source', '出典'),
  nearestStation: t('Nearest station', '最寄駅'),
  editBasics: t('Edit basic information', '基本情報を直す'),
  capacityCaution: t(
    "A facility's official capacity is not always how many people fit with instruments and music stands. Check the source to see where the number came from.",
    '施設の公式の定員は、楽器や譜面台を置いたときに実際に入れる人数とは限りません。どこで確かめた人数かは出典で確認してください。',
  ),
  currentStatus: t('Current status', '現在の状態'),
  noRecordsYet: t('No records yet.', 'まだ記録がありません。'),
  statusRule: t(
    'If a record names the instrument, the newest such record is shown. Otherwise, the newest record for the whole ensemble is shown.',
    'その楽器を名指しした記録があれば、その中で最も新しいものを表示します。なければ、楽器を限定しない最も新しい記録を表示します。',
  ),
  addRecord: t('Add a record', '記録を追加'),
  history: (n: number): LocalizedText => t(`History (${n})`, `記録の履歴（${n}件）`),
  wholeEnsemble: t('Whole ensemble', '合奏全体'),
  recordedBy: t('Recorded by', '記録者'),
  referenceUrl: t('Reference URL', '参考URL'),
  englishNameNote: t(
    'English names are our own translations. The Japanese name is the official one used on booking sites.',
    '英語名は楽団での訳です。予約サイトで使う正式名は日本語の名前です。',
  ),

  // 記録のフォーム
  recordKind: t('What kind of record?', '何の記録ですか'),
  date: t('Date', '日付'),
  result: t('Result', '結果'),
  instruments: t('Instruments', '対象の楽器'),
  instrumentsHint: t(
    'Choose instruments if the result is about specific ones. Leave all unchecked for the whole ensemble.',
    '特定の楽器についての結果なら選んでください。選ばなければ、合奏全体についての記録になります。',
  ),
  details: t('Details', '内容'),
  detailsPlaceholder: t(
    'e.g. Phoned the facility: no drum kit, timpani OK until 5 pm.',
    '例: 電話で確認。ドラムセットは不可、ティンパニは17時まで可とのこと。',
  ),
  yourName: t('Your name', '記録者'),
  saveRecord: t('Save record', '記録する'),
  savingRecord: t('Saving…', '記録しています…'),
  checkFields: t('Please check the fields below.', '入力内容を確認してください。'),
  recordSaved: t('Record saved.', '記録しました。'),
  roomNotFound: t('This room was not found.', 'この部屋は見つかりませんでした。'),

  // 部屋のフォーム
  addRoomHeading: t('Add a room', '部屋を追加'),
  addRoomLead: t(
    'You can add a room you have not used yet, to keep the results of your inquiries.',
    'まだ使ったことのない部屋でも、問い合わせた結果を残すために登録できます。',
  ),
  municipality: t('Municipality', '自治体'),
  municipalityHint: t('Use the Japanese name, e.g. 大田区 or 川崎市.', '日本語の名前で入力してください（例: 大田区、川崎市）。'),
  facilityNameJa: t('Facility name (Japanese)', '施設名（日本語）'),
  facilityNameEn: t('Facility name (English)', '施設名（英語）'),
  roomNameJa: t('Room name (Japanese)', '部屋名（日本語）'),
  roomNameEn: t('Room name (English)', '部屋名（英語）'),
  namesHint: t(
    'Japanese names must match the booking site. English names help members who do not read Japanese.',
    '日本語の名前は予約サイトの表記に合わせてください。英語名は、日本語が苦手なメンバーのためのものです。',
  ),
  capacitySource: t('Source of the capacity', '定員の出典'),
  capacitySourceHint: t(
    'Note where the number came from, so it can be checked later.',
    'どこで確かめた人数かを残しておくと、あとで見直すときに役立ちます。',
  ),
  capacitySourcePlaceholder: t('e.g. Booking site room list, phoned the facility', '例: 予約システムの部屋一覧、施設に電話で確認'),
  addRoomSubmit: t('Add room', '部屋を追加する'),
  addingRoom: t('Adding…', '追加しています…'),
  cancel: t('Cancel', 'やめる'),
  save: t('Save', '保存する'),
  saving: t('Saving…', '保存しています…'),
  basicsSaved: t('Basic information saved.', '基本情報を保存しました。'),
  roomDuplicateMessage: t(
    'A room with the same municipality, facility and room name already exists.',
    '同じ自治体・施設・部屋名の部屋がすでに登録されています',
  ),

  // ナビゲーション
  navSearch: t('Availability', '空き状況'),
  navCatalog: t('Catalog', '施設台帳'),

  // 空き状況の検索（ログインなしで使えるページ）
  searchTitle: t('Search availability', '空き状況を検索'),
  searchLead: t(
    'Open rooms across cities, collected from the official booking sites several times a day. No sign-in needed.',
    '公式の予約サイトから1日に数回集めた空き状況を、自治体をまたいで探せます。ログイン不要。',
  ),
  dates: t('Dates', '期間'),
  searchPeopleHint: t('Rooms with unknown capacity are still shown.', '定員が分からない部屋も表示します。'),
  roomCount: (n: number): LocalizedText => t(`${n} ${plural(n, 'room', 'rooms')}`, `${n}部屋`),
  jumpToDay: t('Jump to a day', '日付へ移動'),
  holidays: t('Holidays', '祝日'),
  updating: t('Updating results…', '検索結果を更新しています…'),
  lastFetched: t('Last updated', '情報の最終取得'),
  refreshNow: t('Get latest now', '今すぐ最新を取得'),
  refreshStarting: t('Starting…', '開始しています…'),
  refreshNote: t('Takes a few minutes.', '数分かかります。'),
  refreshRunningManual: (since: string, by: string): LocalizedText =>
    t(`Updating now (requested by ${by} at ${since}). Takes a few minutes.`, `取得中です（${since}に${by}さんが申し込み）。数分かかります。`),
  refreshRunningScheduled: (since: string): LocalizedText =>
    t(`Scheduled update in progress (started ${since}).`, `定期の取得中です（${since}開始）。`),
  refreshAvailableAt: (at: string): LocalizedText => t(`You can get the latest again from ${at}.`, `${at}から再取得できます。`),
  refreshOutsideHours: t('Manual update is available 7:00–22:00.', '手動の取得は7〜22時に使えます。'),
  refreshDailyLimit: t("Today's manual update limit (10) has been reached.", '今日の手動の取得は上限（10回）に達しました。'),
  refreshForbidden: t('Sign in to get the latest.', 'ログインすると最新を取得できます。'),
  refreshAlreadyRunning: t('An update is already in progress.', 'すでに取得中です。'),
  refreshTooSoon: t('Please wait 20 minutes after the last update.', '前回の取得から20分たってから使えます。'),
  refreshFailed: t('Could not start the update. Please try again later.', '取得を始められませんでした。時間をおいて試してください。'),
  fromDate: t('From', '開始日'),
  toDate: t('To', '終了日'),
  daysOfWeek: t('Days', '曜日'),
  timeOfDay: t('Time of day', '時間帯'),
  needInstruments: t('Instruments', '使いたい楽器'),
  includeUnknown: t('Include rooms not yet confirmed', '可否が未確認の部屋も含める'),
  municipalities: t('Cities', '自治体'),
  anyHint: t('None checked = all', '未選択ならすべて'),
  search: t('Search', '検索'),
  searchInvalidDates: t(
    'Check the dates. The end date must be on or after the start date, within 400 days.',
    '日付を確認してください。終了日は開始日以降、400日以内にしてください。',
  ),
  noData: t(
    'No availability data yet. It is collected automatically several times a day.',
    'まだ空き状況のデータがありません。1日に数回、自動で集めています。',
  ),
  daysFound: (n: number): LocalizedText => t(`${n} ${plural(n, 'day', 'days')} with open rooms`, `空きのある日: ${n}日`),
  noOpenSlots: t('No open rooms match these conditions.', '条件に合う空きはありません。'),
  book: t('Booking site', '予約サイト'),
  roomDetails: t('Room details', '部屋の詳細'),
  notSearchedTitle: t('Not searched automatically', '自動で検索していない自治体'),
  notSearchedLead: t(
    'Rooms in these cities are not in the results. Check their booking sites.',
    'これらの自治体の部屋は結果に出ません。予約サイトで確認してください。',
  ),
  manualPanelTitle: t('Matching rooms in cities we do not search', '自動で検索していない自治体の、条件に合う部屋'),
  manualPanelNote: t(
    'Not search results: we do not know if they are free. Check the booking site.',
    '検索結果ではありません。空いているかは分からないので、予約サイトで確認してください。',
  ),
  coverage: t('Data coverage', '照会できた範囲'),
  room: t('Room', '部屋'),
  dataUntil: t('Data until', 'データの範囲'),
  updatedAt: t('Updated', '取得日時'),
  lastError: t('Last update failed', '前回の取得に失敗'),
  notOpenYet: t('Not open for booking yet', 'まだ照会できません'),
  searchDisclaimer: t(
    'Availability may have changed since it was collected. Always confirm and book on the official booking site.',
    '空き状況は集めた後に変わっていることがあります。必ず公式の予約サイトで確認して予約してください。',
  ),
  coverageHint: t(
    'Each city opens bookings on its own schedule, so dates after “Data until” cannot be searched yet.',
    '自治体ごとに受付の開始時期が違うため、「データの範囲」より後の日はまだ検索できません。',
  ),

  // ログイン
  signIn: t('Sign in', 'ログイン'),
  signOut: t('Sign out', 'ログアウト'),
  signInTitle: t('Sign in', 'ログイン'),
  signInLead: t(
    'Members sign in with their Google account. Only invited accounts can sign in. Searching availability does not need sign-in.',
    '楽団員は Google アカウントでログインします。招待されたアカウントだけがログインできます。空き状況の検索はログインなしで使えます。',
  ),
  signInWithGoogle: t('Sign in with Google', 'Google でログイン'),
  notInvited: t(
    'Sign-in failed. Only invited members can sign in. Ask an admin to invite the email address of your Google account.',
    'ログインできませんでした。招待された楽団員だけがログインできます。管理者に、Google アカウントのメールアドレスを招待してもらってください。',
  ),
  forbidden: t('You do not have permission to open that page.', 'そのページを開く権限がありません。'),
  googleNotConfigured: t('Google sign-in is not set up yet.', 'Google でのログインはまだ設定されていません。'),
  devLoginTitle: t('Local development sign-in', 'ローカル開発用のログイン'),
  devLoginHint: t('Only available on a local machine. Never available in production.', 'ローカルの環境でだけ使えます。本番では使えません。'),
  email: t('Email', 'メールアドレス'),
  password: t('Password', 'パスワード'),
  signingIn: t('Signing in…', 'ログインしています…'),
  navMembers: t('Members', '楽団員'),
  notAllowedAction: t('You do not have permission to do this.', 'この操作をする権限がありません。'),
  readOnlyNote: t(
    'You can view this page. To make changes, ask an admin for the Editor role.',
    '閲覧のみできます。編集するには、管理者に「施設編集」のロールを付けてもらってください。',
  ),

  // 楽団員の名簿
  membersTitle: t('Members', '楽団員'),
  membersLead: t(
    'Only people on this list can sign in with their Google account.',
    'この名簿に載っている人だけが、Google アカウントでログインできます。',
  ),
  inviteTitle: t('Invite a member', '楽団員を招待'),
  inviteHint: t(
    'Enter the email address of their Google account. No email is sent, so tell them the site address yourself.',
    'Google アカウントのメールアドレスを入力してください。招待してもメールは送られないので、サイトのアドレスを本人に伝えてください。',
  ),
  role: t('Role', 'ロール'),
  invite: t('Invite', '招待する'),
  invited: t('Invited.', '招待しました。'),
  change: t('Change', '変更'),
  roleChanged: t('Role changed.', 'ロールを変更しました。'),
  remove: t('Remove', '外す'),
  removed: t('Removed from the list.', '名簿から外しました。'),
  invitedBy: t('Invited by', '招待した人'),
  you: t('you', 'あなた'),
  initialAdmin: t('Initial admin', '最初の管理者'),

  // その他
  notFoundTitle: t('Page not found', 'ページが見つかりません'),
  notFoundLead: t('The room may have been removed, or the URL may be wrong.', '部屋が削除されたか、URLが間違っている可能性があります。'),
  backToCatalogButton: t('Back to Facility Catalog', '施設台帳へ戻る'),
};
