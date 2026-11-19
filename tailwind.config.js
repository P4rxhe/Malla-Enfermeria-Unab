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
        unab: {
          navy: '#0b192c',
          card: '#1e293b',
          blue: '#1d4ed8',
          teal: '#0d9488',
          amber: '#d97706',
          purple: '#7c3aed',
          pink: '#db2777',
        }
      }
    },
  },
  plugins: [],
}