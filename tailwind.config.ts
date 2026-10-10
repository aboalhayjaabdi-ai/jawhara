import type { Config } from "tailwindcss";

// Design tokens pulled directly from the live "Jawhara 3.0" theme (docs/design-spec.md):
// strict monochrome palette, zero corner radius everywhere, Newsreader/Red Hat Text pairing.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fg: "#000000",
        bg: "#ffffff",
        line: "#e4e4e4",
        muted: "#6f6f6f",
      },
      fontFamily: {
        serif: ["var(--font-newsreader)", "serif"],
        sans: ["var(--font-red-hat-text)", "sans-serif"],
      },
      borderRadius: {
        none: "0px",
        DEFAULT: "0px",
        full: "9999px", // kept only for circular icon buttons, not cards/inputs/badges
      },
    },
  },
  plugins: [],
};

export default config;
