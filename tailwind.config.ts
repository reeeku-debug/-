import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f6ff",
          100: "#e2ebff",
          200: "#c3d6ff",
          300: "#95b6ff",
          400: "#618cff",
          500: "#3d63f5",
          600: "#2c48d9",
          700: "#2538ad",
          800: "#22318a",
          900: "#212c6e",
        },
      },
    },
  },
  plugins: [],
};

export default config;
