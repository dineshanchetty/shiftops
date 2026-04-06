import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: "var(--color-accent)",
        "accent-hover": "var(--color-accent-hover)",
        "accent-soft": "var(--color-accent-soft)",
        surface: "var(--color-surface)",
        "surface-2": "var(--color-surface-2)",
        "surface-3": "var(--color-surface-3)",
        base: {
          900: "var(--color-base-900)",
          800: "var(--color-base-800)",
          700: "var(--color-base-700)",
          600: "var(--color-base-600)",
          400: "var(--color-base-400)",
          200: "var(--color-base-200)",
          50: "var(--color-base-50)",
        },
      },
      fontFamily: {
        display: ["Sora", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
