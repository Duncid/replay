import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      maxWidth: {
        "6xl": "80rem", // 1280px
        "5xl": "64rem", // 1024px
      },
      gridTemplateColumns: {
        "22": "repeat(22, minmax(0, 1fr))",
        "44": "repeat(44, minmax(0, 1fr))",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        red: {
          50: "#f0f0f0",
          100: "#ede2e2",
          200: "#eecacb",
          300: "#eda6a6",
          400: "#ea7474",
          500: "#e24a4a",
          600: "#cf302f",
          700: "#ad2625",
          800: "#8d2322",
          900: "#732322",
          950: "#3b0f0e",
        },
        orange: {
          50: "#ffffff",
          100: "#f9f8f6",
          200: "#f6e4ca",
          300: "#f3ca95",
          400: "#f1a65e",
          500: "#f08a3c",
          600: "#e2712d",
          700: "#bb5a28",
          800: "#944a28",
          900: "#764128",
          950: "#3e241a",
        },
        yellow: {
          50: "#fffff7",
          100: "#ffffd9",
          200: "#ffffac",
          300: "#fff674",
          400: "#ffe256",
          500: "#f2c94c",
          600: "#d3a03f",
          700: "#aa7733",
          800: "#8e612f",
          900: "#7a522e",
          950: "#4b311e",
        },
        green: {
          50: "#fbfbfb",
          100: "#f4f4f4",
          200: "#dbeade",
          300: "#ade1b9",
          400: "#7ad08d",
          500: "#58bc6e",
          600: "#43a458",
          700: "#3d814c",
          800: "#396643",
          900: "#35533b",
          950: "#242e26",
        },
        teal: {
          50: "#e9f5f7",
          100: "#bff6fd",
          200: "#88effd",
          300: "#4de1f5",
          400: "#24c9df",
          500: "#1fa4b6",
          600: "#1a818f",
          700: "#18656f",
          800: "#164e56",
          900: "#163f45",
          950: "#092023",
        },
        blue: {
          50: "#e6e6e6",
          100: "#dadada",
          200: "#bfcbda",
          300: "#95b6da",
          400: "#6298d8",
          500: "#3a78d4",
          600: "#205bca",
          700: "#1548b7",
          800: "#183990",
          900: "#1a326c",
          950: "#131d39",
        },
        violet: {
          50: "#e1e1e1",
          100: "#d9d7e0",
          200: "#c9c4e0",
          300: "#b1a4df",
          400: "#957bdc",
          500: "#7a4dd8",
          600: "#6b2acf",
          700: "#5d15bc",
          800: "#4b0f9a",
          900: "#3c0d7a",
          950: "#20034c",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        "key-white": "hsl(var(--key-white))",
        "key-white-shadow": "hsl(var(--key-white-shadow))",
        "key-black": "hsl(var(--key-black))",
        "key-black-light": "hsl(var(--key-black-light))",
        "key-active-user": "hsl(var(--key-active-user))",
        "key-active-ai": "hsl(var(--key-active-ai))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "pulse-glow": {
          "0%, 100%": {
            transform: "scale(1)",
            opacity: "1",
            boxShadow: "0 0 0 0 hsl(var(--primary) / 0.4)",
          },
          "50%": {
            transform: "scale(1.02)",
            opacity: "1",
            boxShadow: "0 0 0 4px hsl(var(--primary) / 0.2)",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
