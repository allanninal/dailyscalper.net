/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html"],
  theme: {
    extend: {
      colors: {
        'primary-dark': '#1B4D7A',
        'primary-green': '#22A65E',
        'dark-bg': '#0B1219',
        'card-bg': '#111D2A',
        'accent-green': '#1E8B4E',
        'text-secondary': '#94A3B8',
        'success': '#22C55E',
        'loss': '#EF4444',
        'border-color': '#1E3A52',
      },
      fontFamily: {
        'inter': ['Inter', 'system-ui', 'sans-serif'],
      },
    }
  },
  plugins: [],
}
