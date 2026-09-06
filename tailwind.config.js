/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        darkbg: '#0f172a',
        darkcard: '#1e293b',
        darkborder: '#334155',
      },
    },
  },
  plugins: [],
}
