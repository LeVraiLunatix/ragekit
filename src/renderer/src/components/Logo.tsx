import type { ReactNode } from 'react'

/**
 * Ragekit mark — a bold, solid R monogram on a dark badge. The R body is one
 * non-self-intersecting outline (no even-odd tricks); the counter is repainted
 * with the badge gradient so it reads as a true cut-out and never shows gaps.
 */
export function Logo({ size = 20, className }: { size?: number; className?: string }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="rk-grad" x1="14" y1="10" x2="50" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffc571" />
          <stop offset="1" stopColor="#ee972b" />
        </linearGradient>
        <radialGradient id="rk-hl" cx="24" cy="18" r="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2a2f3b" />
          <stop offset="1" stopColor="#0e1117" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#rk-hl)" />
      <rect
        x="2.75"
        y="2.75"
        width="58.5"
        height="58.5"
        rx="15.25"
        fill="none"
        stroke="#f2a341"
        strokeOpacity="0.28"
        strokeWidth="1.5"
      />
      <path
        fill="url(#rk-grad)"
        d="M16 13 L33 13 C42 13 47.5 18 47.5 24.5 C47.5 30.5 43 34.5 35 35 L47 51 L35.5 51 L26 38 L26 51 L16 51 Z"
      />
      <path
        fill="url(#rk-hl)"
        d="M26 20 H34 C39 20 41.5 22 41.5 24.5 C41.5 27 39 29 34 29 H26 Z"
      />
    </svg>
  )
}
