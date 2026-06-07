/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      spacing: {
        'bottom-nav': '4rem',
      },
      padding: {
        safe: 'env(safe-area-inset-bottom)',
      },
      height: {
        'bottom-nav': '4rem',
      },
    },
  },
  plugins: [],
}