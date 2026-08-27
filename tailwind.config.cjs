/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0b0d12',
          raised: '#12151d',
          card: '#161a24',
          hover: '#1c212e',
        },
        line: '#252b3a',
        ink: {
          DEFAULT: '#e6eaf3',
          soft: '#aab2c5',
          faint: '#6b7488',
        },
        brand: {
          DEFAULT: '#f2a341',
          hi: '#ffb75c',
          dim: '#7a5426',
        },
        good: '#4ade80',
        warn: '#fbbf24',
        bad: '#f87171',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [],
}
