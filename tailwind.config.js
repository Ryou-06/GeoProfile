/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      fontFamily: {
        nunito: ['Nunito', 'sans-serif'],
        inter:  ['Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        }
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(28px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        drift: {
          '0%':   { transform: 'translate(0,0) scale(1)' },
          '100%': { transform: 'translate(24px,18px) scale(1.08)' },
        },
        popIn: {
          '0%':   { opacity: '0', transform: 'scale(0.82)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        }
      },
      animation: {
        'fade-up':   'fadeUp 0.65s cubic-bezier(.22,1,.36,1) both',
        'fade-up-d': 'fadeUp 0.65s 0.13s cubic-bezier(.22,1,.36,1) both',
        'drift-1':   'drift 10s ease-in-out infinite alternate',
        'drift-2':   'drift 13s 3s ease-in-out infinite alternate',
        'drift-3':   'drift 9s 6s ease-in-out infinite alternate',
        'pop-in':    'popIn 0.4s cubic-bezier(.22,1,.36,1) both',
      }
    }
  },
  plugins: []
}