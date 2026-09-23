import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://www.magical.fm",
	integrations: [
		react({
			include: ["**/react/*", "**/components/*"],
		}),
		sitemap(),
	],
	output: "static",
	compressHTML: true,
});
