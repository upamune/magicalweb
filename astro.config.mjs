import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwind from "@astrojs/tailwind";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://www.magical.fm",
	integrations: [
		react({
			include: ["**/react/*", "**/components/*"],
		}),
		tailwind(),
		sitemap(),
	],
	output: "static",
});
