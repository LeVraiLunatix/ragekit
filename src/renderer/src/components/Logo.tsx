import type { ReactNode } from 'react'

/** Ragekit mark — a bold R monogram on a dark badge. Scales cleanly. */
export function Logo({ size = 20, className }: { size?: number; className?: string }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
    >
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
        strokeOpacity="0.3"
        strokeWidth="1.5"
      />
      <g fill="url(#rk-grad)">
        <path
          fillRule="evenodd"
          d="M18 14 h10 v36 h-10 Z M27 14 h8.5 a13.25 13.25 0 0 1 0 26.5 h-8.5 v-8.5 h8.5 a4.75 4.75 0 0 0 0 -9.5 h-8.5 Z"
        />
        <path d="M28.5 33 L48 50 H37.2 L24 36.5 Z" />
      </g>
    </svg>
  )
}
