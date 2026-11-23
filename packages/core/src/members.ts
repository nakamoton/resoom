import type { LocalizedText } from './i18n';

/** 楽団員のロール。設計書 8.1 のうち、いま使うもの。 */
export const MEMBER_ROLES = ['admin', 'editor', 'member'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_ROLE_LABELS: Record<MemberRole, LocalizedText> = {
  admin: { en: 'Admin', ja: '管理者' },
  editor: { en: 'Editor', ja: '施設編集' },
  member: { en: 'Member', ja: '団員' },
};

export const MEMBER_ROLE_DESCRIPTIONS: Record<MemberRole, LocalizedText> = {
  admin: { en: 'Can do everything, including inviting members.', ja: 'すべての操作と、楽団員の招待ができます。' },
  editor: { en: 'Can view and edit the Facility Catalog.', ja: '施設台帳の閲覧と編集ができます。' },
  member: { en: 'Can view the Facility Catalog.', ja: '施設台帳を閲覧できます。' },
};

/** 操作ごとに許すロール。判定は必ずサーバー側で行う。 */
const PERMISSIONS = {
  viewCatalog: ['admin', 'editor', 'member'],
  editCatalog: ['admin', 'editor'],
  manageMembers: ['admin'],
} as const satisfies Record<string, readonly MemberRole[]>;

export type Permission = keyof typeof PERMISSIONS;

/** そのロールで操作が許されるか。ロールがない（ログインしていない、名簿にない）なら false。 */
export function can(role: MemberRole | null | undefined, permission: Permission): boolean {
  return role !== null && role !== undefined && (PERMISSIONS[permission] as readonly MemberRole[]).includes(role);
}

/** メールアドレスを比べやすい形にそろえる（前後の空白を除き、小文字にする）。 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 招待のメールアドレスとして使えるか（ゆるい形式チェック）。 */
export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
