import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: "class",
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
  			mono: ["var(--font-jetbrains-mono)", "monospace"],
  		},
  		colors: {
  			background: 'var(--background)',
  			foreground: 'var(--foreground)',
  			card: {
  				DEFAULT: 'var(--card)',
  				foreground: 'var(--card-foreground)'
  			},
  			popover: {
  				DEFAULT: 'var(--popover)',
  				foreground: 'var(--popover-foreground)'
  			},
  			primary: {
  				DEFAULT: 'var(--accent)',
  				foreground: 'white'
  			},
  			secondary: {
  				DEFAULT: 'var(--hover)',
  				foreground: 'var(--foreground)'
  			},
  			muted: {
  				DEFAULT: 'var(--hover)',
  				foreground: 'var(--text-secondary)'
  			},
  			accent: {
  				DEFAULT: 'var(--accent)',
  				foreground: 'white'
  			},
  			destructive: {
  				DEFAULT: 'var(--cta)',
  				foreground: 'white'
  			},
  			border: 'var(--card-border)',
  			input: 'var(--card-border)',
  			ring: 'var(--accent)',
  			chart: {
  				'1': '#8B1A4A',
  				'2': '#8b5cf6',
  				'3': '#f59e0b',
  				'4': '#22c55e',
  				'5': '#ef4444'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
