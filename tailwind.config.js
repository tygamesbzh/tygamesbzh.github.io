/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './_layouts/**/*.html',
    './_includes/**/*.html',
    './_games/**/*.{md,html}',
    './_posts/**/*.{md,html}',
    './**/*.html',
    '!./node_modules/**',
    '!./_site/**',
    '!./vendor/**',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0d0d12',
        offwhite: '#f5f5f0',
        muted: '#c8c5ba',
        accent: {
          DEFAULT: '#EC8B0E',
          light: '#ED6B0E',
          dark: '#C85B15',
        },
      },
      fontFamily: {
        heading: ['system-ui', 'ui-sans-serif', 'sans-serif'],
      },
      maxWidth: {
        site: '1200px',
      },
    },
  },
  plugins: [],
}
