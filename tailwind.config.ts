import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f6ff",
          100: "#e3ecff",
          500: "#3b6fef",
          600: "#2d59d6",
          700: "#2447ac",
        },
      },
    },
  },
  plugins: [],
};

export default config;
