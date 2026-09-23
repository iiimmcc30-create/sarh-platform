import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#0B1622',
        surface: {
          DEFAULT: '#101F2C',
          raised: '#122532',
          overlay: '#162D3A',
        },
        brand: {
          DEFAULT: '#20B66F',
          hover: '#18965B',
        },
        ink: {
          DEFAULT: '#F4F6F5',
          secondary: '#D6DDE0',
          muted: '#94A3AC',
        },
      },
      fontFamily: {
        sans: ['var(--font-sarh)', 'IBM Plex Sans Arabic', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
