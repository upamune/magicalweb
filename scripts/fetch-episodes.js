import Parser from "rss-parser";
import fs from "fs/promises";
import path from "path";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";

const FEED_URL = "https://listen.style/p/magicalfm/rss";
const OUTPUT_DIR = "src/data";
const OUTPUT_FILE = "episodes.json";

const parser = new Parser({
	customFields: {
		item: [
			["itunes:episode", "episode"],
			["enclosure", "enclosure"],
			["content:encoded", "content"],
		],
	},
});

function extractEpisodeNumber(title) {
	const match = title.match(/(\d+):/);
	if (match) {
		return parseInt(match[1], 10);
	}
	return 0;
}

async function fetchAndSaveEpisodes() {
	try {
		console.log("Fetching RSS feed...");
		const feed = await parser.parseURL(FEED_URL);

		const episodes = feed.items.map((item) => {
			const number = extractEpisodeNumber(item.title ?? "");
			const title = item.title?.startsWith("#")
				? item.title
				: `#${number}: ${item.title?.split(":").slice(1).join(":").trim()}`;
			const pubDate = format(
				new Date(item.pubDate ?? new Date()),
				"yyyy年M月d日",
				{ locale: ja },
			);

			return {
				title,
				description: item["content"] ?? item.contentSnippet ?? "",
				pubDate,
				number,
				audioUrl: item["enclosure"]?.url ?? "",
			};
		});

		await fs.mkdir(OUTPUT_DIR, { recursive: true });
		await fs.writeFile(
			path.join(OUTPUT_DIR, OUTPUT_FILE),
			JSON.stringify(episodes, null, 2),
		);

		console.log(
			`Successfully saved ${episodes.length} episodes to ${OUTPUT_FILE}`,
		);
	} catch (error) {
		console.error("Error fetching RSS feed:", error);
		process.exit(1);
	}
}

fetchAndSaveEpisodes();
