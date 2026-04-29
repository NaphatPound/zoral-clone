import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0b1020",
        panel: "#111827",
        accent: "#38bdf8",
      },
    },
  },
  plugins: [],
};

export default config;
