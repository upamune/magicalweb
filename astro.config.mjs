import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import episodeAliases from "./src/data/episode-aliases.json" with {
	type: "json",
};

// 別名URL（/ep/heisei など）は正規URLと同じ内容なのでサイトマップに載せない
const aliasPages = new Set(
	Object.keys(episodeAliases).map(
		(slug) => `https://www.magical.fm/ep/${slug}/`,
	),
);

export default defineConfig({
	site: "https://www.magical.fm",
	integrations: [
		react({
			include: ["**/react/*", "**/components/*"],
		}),
		sitemap({
			filter: (page) => !aliasPages.has(page),
		}),
	],
	output: "static",
	compressHTML: true,
});
