/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Warm, editorial palette — sage green / soft cream / warm charcoal
        cream: {
          DEFAULT: '#f7f4ec',
          50: '#fdfcf9',
          100: '#f7f4ec',
          200: '#f0ebdd',
          300: '#e6ddc6',
        },
        sage: {
          50: '#f2f5f0',
          100: '#e3ead0',
          200: '#cddbc4',
          300: '#aec49f',
          400: '#8ba87a',
          500: '#6c8c5c',
          600: '#556f48',
          700: '#44583a',
          800: '#38472f',
          900: '#2e3b27',
        },
        charcoal: {
          DEFAULT: '#2b2924',
          50: '#faf9f7',
          100: '#e9e6df',
          200: '#c9c3b6',
          300: '#a39a87',
          400: '#766d5c',
          500: '#524b3f',
          600: '#3d3830',
          700: '#2b2924',
          800: '#201e1a',
          900: '#151310',
        },
        clay: {
          DEFAULT: '#b9694a',
          50: '#fbf1ec',
          100: '#f4dccf',
          200: '#e6b49b',
          300: '#d38f6c',
          400: '#c17c56',
          500: '#b9694a',
          600: '#96543a',
        },
        gold: {
          DEFAULT: '#c8a15a',
          100: '#f3e8d1',
          300: '#dfc38a',
          500: '#c8a15a',
          700: '#9c7a3f',
        },
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(43,41,36,0.04), 0 2px 8px rgba(43,41,36,0.05)',
        softer: '0 1px 3px rgba(43,41,36,0.06)',
        lift: '0 4px 16px rgba(43,41,36,0.08)',
      },
      gridTemplateColumns: {
        editorial: '1.1fr 1.6fr',
        'editorial-wide': '0.9fr 1.4fr 0.9fr',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.5s ease-out both',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
