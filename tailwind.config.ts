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
      keyframes: {
        marquee: { to: { transform: "translateX(-50%)" } },
      },
      animation: {
        // Real theme: right-to-left CSS transform loop over duplicated content, see
        // components/home/marquee.tsx. Fixed duration -- the real site computes this
        // dynamically per viewport, which doesn't port cleanly to a static component.
        marquee: "marquee 20s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
