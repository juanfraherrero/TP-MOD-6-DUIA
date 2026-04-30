import type { Config } from "tailwindcss";

// Helper para tokens basados en CSS var con tripleta rgb (soporta /alpha modifier).
const rgbVar = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Constantes — no flipean por tema.
        brand: {
          primary: "#5E6AD2",
          accent: "#828FFF",
        },

        // Theme-aware (rgb tripletas en CSS vars; soportan modificador /X).
        surface: {
          primary: rgbVar("--surface-primary"),
          secondary: rgbVar("--surface-secondary"),
          tertiary: rgbVar("--surface-tertiary"),
          overlay: rgbVar("--surface-overlay"),
        },
        text: {
          primary: rgbVar("--text-primary"),
          secondary: rgbVar("--text-secondary"),
          tertiary: rgbVar("--text-tertiary"),
          muted: rgbVar("--text-muted"),
          "on-cta": rgbVar("--text-on-cta"),
        },
        cta: {
          bg: rgbVar("--cta-bg"),
          "bg-hover": rgbVar("--cta-bg-hover"),
        },
        warning: {
          DEFAULT: rgbVar("--warning"),
          bg: rgbVar("--warning-bg"),
          border: rgbVar("--warning-border"),
        },
        danger: {
          DEFAULT: rgbVar("--danger"),
          hover: rgbVar("--danger-hover"),
          bg: "var(--danger-bg)",        // ya es rgba — sin /alpha modifier
        },
        info: {
          bg: "var(--info-bg)",
          border: "var(--info-border)",
        },
      },

      // Bordes / backgrounds transparentes (rgba directo). Usar como
      // border-soft, bg-surface-soft, etc. Sin modificador /X.
      borderColor: {
        soft: "var(--border-soft)",
        medium: "var(--border-medium)",
        strong: "var(--border-strong)",
      },
      backgroundColor: {
        input: "var(--bg-input)",
        "surface-soft": "var(--bg-surface-soft)",
        "modal-backdrop": "var(--bg-modal-backdrop)",
      },
      boxShadow: {
        l1: "var(--shadow-l1)",
        l2: "var(--shadow-l2)",
        input: "var(--shadow-input)",
      },

      fontFamily: {
        sans: [
          "Inter Variable",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
        mono: [
          '"Berkeley Mono"',
          '"SF Mono"',
          "Monaco",
          '"Cascadia Code"',
          "monospace",
        ],
      },
      fontSize: {
        "display-1": ["64px", { lineHeight: "64px", fontWeight: "510" }],
        "display-2": ["48px", { lineHeight: "48px", fontWeight: "510" }],
        h3: ["20px", { lineHeight: "26.6px", fontWeight: "590" }],
        h4: ["16px", { lineHeight: "24px", fontWeight: "590" }],
        body: ["15px", { lineHeight: "24px", fontWeight: "400" }],
        "body-span": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        link: ["14px", { lineHeight: "21px", fontWeight: "510" }],
        btn: ["13px", { lineHeight: "19.5px", fontWeight: "400" }],
        code: ["14px", { lineHeight: "24px", fontWeight: "400" }],
        "code-sm": ["12.25px", { lineHeight: "15.925px", fontWeight: "400" }],
      },
      fontWeight: {
        normal: "400",
        medium: "510",
        semibold: "590",
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        full: "9999px",
      },
      spacing: {
        "4.5": "18px",
        "13": "52px",
        "18": "72px",
      },
      maxWidth: {
        container: "1440px",
        card: "328px",
      },
      keyframes: {
        blink: {
          "0%, 50%": { opacity: "1" },
          "51%, 100%": { opacity: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        blink: "blink 1.1s steps(1) infinite",
        "fade-in": "fade-in 200ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
