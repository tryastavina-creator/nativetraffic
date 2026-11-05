import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0b0d",
        panel: "#111316",
        panel2: "#16191d",
        line: "#1f2328",
        muted: "#8b929c",
        faint: "#5c636d",
        accent: "#3ddc84",
        warn: "#f5b544",
        bad: "#f2615c",
        info: "#5b8def",
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
