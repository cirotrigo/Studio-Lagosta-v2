import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Lumina Design System Colors
        bg: '#050505',
        sidebar: 'rgba(255, 255, 255, 0.03)',
        card: 'rgba(255, 255, 255, 0.05)',
        input: 'rgba(255, 255, 255, 0.05)',
        border: 'rgba(255, 255, 255, 0.08)',
        surface: {
          DEFAULT: 'rgba(255, 255, 255, 0.05)',
          hover: 'rgba(255, 255, 255, 0.10)',
          active: 'rgba(255, 255, 255, 0.15)',
        },
        primary: {
          DEFAULT: '#ea580c',
          hover: '#f97316',
          light: '#fb923c',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#ea580c',
          amber: '#fbbf24',
        },
        text: {
          DEFAULT: '#FAFAFA',
          muted: 'rgba(255, 255, 255, 0.60)',
          subtle: '#a3a3a3',
          disabled: 'rgba(255, 255, 255, 0.30)',
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
        fast: '150ms',
        smooth: '300ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'ease-in-out',
        smooth: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      boxShadow: {
        'glow-orange': '0 0 20px rgba(234, 88, 12, 0.3)',
        'glow-orange-lg': '0 0 30px rgba(234, 88, 12, 0.4), 0 8px 40px rgba(234, 88, 12, 0.15)',
        'glow-orange-sm': '0 0 10px rgba(234, 88, 12, 0.25)',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(to bottom, #fb923c, #ea580c)',
        'gradient-radial-orange': 'radial-gradient(65.28% 65.28% at 50% 100%, rgba(251, 191, 36, 0.8) 0%, rgba(251, 191, 36, 0) 100%)',
      },
      animation: {
        'beam-1': 'beam-fall 8s linear infinite',
        'beam-2': 'beam-fall 12s linear infinite 3s',
        'beam-3': 'beam-fall 10s linear infinite 6s',
        'pulse-accent': 'pulse-accent 2s infinite',
        'fade-slide-in': 'fadeSlideIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both',
      },
      keyframes: {
        'beam-fall': {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '10%': { opacity: '0.6' },
          '50%': { opacity: '1' },
          '90%': { opacity: '0.6' },
          '100%': { transform: 'translateY(100vh)', opacity: '0' },
        },
        'pulse-accent': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(234, 88, 12, 0.4)' },
          '50%': { boxShadow: '0 0 0 6px rgba(234, 88, 12, 0)' },
        },
        'fadeSlideIn': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
