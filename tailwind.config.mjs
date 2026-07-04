/** @type {import('tailwindcss').Config} */
export default {
	content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
	future: {
		hoverOnlyWhenSupported: true,
	},
	theme: {
		fontFamily: {
			sans: [
				'"M PLUS Rounded 1c"',
				'"Hiragino Maru Gothic ProN"',
				"system-ui",
				"sans-serif",
			],
			display: [
				'"Mochiy Pop One"',
				'"M PLUS Rounded 1c"',
				"system-ui",
				"sans-serif",
			],
			mono: [
				'"IBM Plex Mono"',
				"ui-monospace",
				"SFMono-Regular",
				"Menlo",
				"monospace",
			],
		},
		extend: {
			colors: {
				paper: "rgb(var(--paper) / <alpha-value>)",
				surface: "rgb(var(--surface) / <alpha-value>)",
				ink: "rgb(var(--ink) / <alpha-value>)",
				muted: "rgb(var(--muted) / <alpha-value>)",
				edge: "rgb(var(--edge) / <alpha-value>)",
				lilac: "rgb(var(--lilac) / <alpha-value>)",
				lime: "rgb(var(--lime) / <alpha-value>)",
				tangerine: "rgb(var(--tangerine) / <alpha-value>)",
				sky: "rgb(var(--sky) / <alpha-value>)",
				candy: "rgb(var(--candy) / <alpha-value>)",
				sun: "rgb(var(--sun) / <alpha-value>)",
			},
			borderWidth: {
				3: "3px",
			},
			boxShadow: {
				pop: "6px 6px 0 rgb(var(--edge))",
				"pop-sm": "4px 4px 0 rgb(var(--edge))",
				"pop-xs": "2px 2px 0 rgb(var(--edge))",
			},
			transitionTimingFunction: {
				"out-quart": "cubic-bezier(0.23, 1, 0.32, 1)",
				"in-out-quart": "cubic-bezier(0.77, 0, 0.175, 1)",
			},
		},
	},
	plugins: [require("@tailwindcss/typography")],
};
