import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        sidebar: '#111111',
        card: '#161616',
        input: '#1a1a1a',
        border: '#27272A',
        primary: {
          DEFAULT: '#F59E0B',
          hover: '#D97706',
          foreground: '#FFFFFF',
        },
        text: {
          DEFAULT: '#FAFAFA',
          muted: '#A1A1AA',
          subtle: '#71717A',
        },
        success: '#22C55E',
        error: '#EF4444',
        warning: '#F59E0B',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'ease-in-out',
      },
    },
  },
  plugins: [],
}

export default config
