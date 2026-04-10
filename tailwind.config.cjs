/** @type {import('tailwindcss').Config} */
const defaultTheme = require("tailwindcss/defaultTheme");
module.exports = {
	content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue,mjs}"],
	darkMode: "class", // allows toggling dark mode manually
	theme: {
		extend: {
			fontFamily: {
				sans: ["Roboto", "sans-serif", ...defaultTheme.fontFamily.sans],
			},
			typography: {
				DEFAULT: {
					css: {
						"--tw-prose-body": null,
						p: {
							"margin-top": "0",
							"margin-bottom": "0",
						},
					},
				},
			},
		},
	},
	plugins: [
		require("@tailwindcss/typography")({
			className: "prose",
		}),
	],
};
