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
      <g fill="url(#rk-grad)" transform="translate(1.6 0)">
        <path
          fillRule="evenodd"
          d="M16 13 L35 13 C43.6 13 49.5 18.7 49.5 25 C49.5 31.3 43.6 37 35 37 L26 37 L26 22 L35 22 C38.6 22 40.5 23.4 40.5 25 C40.5 26.6 38.6 28 35 28 L26 28 L26 51 L16 51 Z"
        />
        <path d="M30.5 34.5 L48.8 51 L36.3 51 L21.6 37.9 Z" />
      </g>
    </svg>
  )
}
