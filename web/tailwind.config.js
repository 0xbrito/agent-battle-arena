/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        arena: {
          dark: '#0a0a0f',
          darker: '#050508',
          accent: '#ff3e3e',
          gold: '#ffd700',
          neon: '#00ff88',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(255, 62, 62, 0.3)' },
          '100%': { boxShadow: '0 0 40px rgba(255, 62, 62, 0.6)' },
        },
      },
    },
  },
  plugins: [],
}
