// Inline vector padlock — the "sealed / encrypted" icon (replaces the 🔒 emoji).
// Uses currentColor so it tints to whatever text or pill color it sits inside.
export function LockIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ verticalAlign: '-0.15em', marginRight: 3 }}
    >
      <rect x="4" y="10.5" width="16" height="9.5" rx="2" fill="currentColor" opacity="0.9" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
}
