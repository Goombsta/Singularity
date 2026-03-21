/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        syne: ['Syne', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      colors: {
        base: '#f0f2f5',
        surface: '#e8eaed',
        subtle: '#d1d5db',
      },
      boxShadow: {
        raised: '8px 8px 20px #c8cacd, -8px -8px 20px #ffffff',
        inset: 'inset 4px 4px 10px #c8cacd, inset -4px -4px 10px #ffffff',
        'raised-sm': '4px 4px 12px #c8cacd, -4px -4px 12px #ffffff',
      },
    },
  },
  plugins: [],
}
