/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Brand + semantic colors; keep in sync with src/theme/colors.ts
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        ink: '#0f172a',
        canvas: '#f8fafc',
      },
      // Phone vs tablet breakpoints (used by ResponsiveLayout helpers)
      screens: {
        sm: '0px',
        md: '768px',
        lg: '1024px',
      },
    },
  },
  plugins: [],
};
