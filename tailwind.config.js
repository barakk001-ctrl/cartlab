/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Values live in CSS variables (src/index.css) so dark mode can swap
      // the palette; the rgb()/<alpha-value> form keeps /opacity modifiers.
      colors: {
        cream: 'rgb(var(--c-cream) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        leaf: 'rgb(var(--c-leaf) / <alpha-value>)',
        rust: 'rgb(var(--c-rust) / <alpha-value>)',
        sand: 'rgb(var(--c-sand) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
