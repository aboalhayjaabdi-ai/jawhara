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
        "cart-pop": {
          "0%": { transform: "scale(1)" },
          "35%": { transform: "scale(1.3)" },
          "60%": { transform: "scale(0.95)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        // Real theme: right-to-left CSS transform loop over duplicated content, see
        // components/home/marquee.tsx. Fixed duration -- the real site computes this
        // dynamically per viewport, which doesn't port cleanly to a static component.
        // 160s = 20s base × the 8x content REPEAT in marquee.tsx, so px/sec speed is unchanged.
        marquee: "marquee 160s linear infinite",
        // Single-play spring-like pop for add-to-cart feedback (header icon + count badge) --
        // the overshoot easing gives a premium "bump" rather than a linear scale.
        "cart-pop": "cart-pop 500ms cubic-bezier(0.34, 1.56, 0.64, 1) 1",
      },
    },
  },
  plugins: [],
};

export default config;
