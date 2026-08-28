/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0b0e',
          raised: '#0e1013',
          card: '#131519',
          hover: '#191c22',
        },
        line: {
          DEFAULT: '#23262e',
          soft: '#191b21',
        },
        ink: {
          DEFAULT: '#eef1f6',
          soft: '#a7adba',
          faint: '#6a7180',
        },
        brand: {
          DEFAULT: '#f5a524',
          hi: '#ffbd52',
          dim: '#6f4d1f',
        },
        good: '#3ddc84',
        warn: '#f5b544',
        bad: '#f56565',
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Text', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Consolas', 'monospace'],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.02) inset, 0 1px 2px rgba(0,0,0,0.5), 0 12px 32px -16px rgba(0,0,0,0.6)',
        pop: '0 8px 40px -8px rgba(0,0,0,0.7)',
        bar: '0 -8px 40px -12px rgba(0,0,0,0.7)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
}
