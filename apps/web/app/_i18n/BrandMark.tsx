/** ロゴの印。トランペットのベル（朝顔）を正面から見た形を、真鍮色の同心円で表す。 */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="brass-bell" cx="38%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#f6e6b0" />
          <stop offset="55%" stopColor="#c9a24a" />
          <stop offset="100%" stopColor="#8f6a1c" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#brass-bell)" />
      <circle cx="12" cy="12" r="7.2" fill="#0b0a09" />
      <circle cx="12" cy="12" r="5.4" fill="none" stroke="#c9a24a" strokeWidth="0.8" opacity="0.7" />
      <circle cx="12" cy="12" r="2.2" fill="url(#brass-bell)" />
    </svg>
  );
}
