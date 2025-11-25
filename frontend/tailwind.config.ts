import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'eve-blue': '#00a7e1',
        'eve-gold': '#d4af37',
        'eve-dark': '#0a0e27',
      },
    },
  },
  plugins: [],
};

export default config;
