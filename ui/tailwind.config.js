/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0f172a",
          card:    "#1e293b",
          border:  "#334155",
        },
        brand: {
          DEFAULT: "#3b82f6",
          light:   "#60a5fa",
        },
      },
      keyframes: {
        spin: { to: { transform: "rotate(360deg)" } },
        fadeIn: {
          from: { opacity: 0, transform: "translateY(6px)" },
          to:   { opacity: 1, transform: "translateY(0)" },
        },
      },
      animation: {
        spin:    "spin 1s linear infinite",
        fadeIn:  "fadeIn .25s ease both",
      },
    },
  },
  plugins: [],
};