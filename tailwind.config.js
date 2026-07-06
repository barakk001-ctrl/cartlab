/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#F7F3EA',
        ink: '#1F1E1A',
        leaf: '#3E6B4A',
        rust: '#B4552D',
        sand: '#E7DFCE',
      },
    },
  },
  plugins: [],
};
