/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0f',
        card: '#12121a',
        'card-hover': '#1a1a25',
        border: '#1e1e2e',
        accent: '#7c3aed',
        'accent-light': '#a78bfa',
        text: '#e8e8f0',
        muted: '#8888a0',
        dim: '#55556a',
        green: '#00E676',
        red: '#FF5252',
        yellow: '#FCAF45',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"Space Mono"', 'monospace'],
      },
      animation: {
        'fade-up': 'fadeUp 0.3s ease both',
        'blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        blink: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0 },
        },
      },
    },
  },
  plugins: [],
}
