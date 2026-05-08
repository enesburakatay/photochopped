/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Photoshop-like dark palette
        ps: {
          bg: '#1e1e1e',
          panel: '#2b2b2b',
          panel2: '#323232',
          panel3: '#3a3a3a',
          border: '#1a1a1a',
          divider: '#444',
          text: '#d0d0d0',
          textDim: '#999',
          accent: '#2a7fff',
          accent2: '#1968e6',
          danger: '#e54848',
          success: '#3ecf6c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': '0.625rem',
      },
    },
  },
  plugins: [],
};
