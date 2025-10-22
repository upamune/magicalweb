import fs from "node:fs/promises";
import path from "node:path";
import { format, isValid, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import Parser from "rss-parser";

const FEED_URL = "https://listen.style/p/magicalfm/rss";
const OUTPUT_DIR = "src/data";
const OUTPUT_FILE = "episodes.json";
const CUSTOM_PATHS_FILE = "custom-paths.json";

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
		return Number.parseInt(match[1], 10);
	}
	return 0;
}

function extractListenId(content) {
	if (!content) return null;
	const match = content.match(/https:\/\/listen\.style\/p\/magicalfm\/([a-z0-9]+)/);
	return match ? match[1] : null;
}

async function fetchAndSaveEpisodes() {
	try {
		console.log("Fetching RSS feed...");
		const feed = await parser.parseURL(FEED_URL);

		// Load custom paths mapping
		let customPathsMap = {};
		try {
			const customPathsContent = await fs.readFile(
				path.join(OUTPUT_DIR, CUSTOM_PATHS_FILE),
				"utf-8"
			);
			customPathsMap = JSON.parse(customPathsContent);
		} catch (error) {
			console.log("No custom paths file found, continuing without custom paths");
		}

		const episodes = feed.items.map((item) => {
			const number = extractEpisodeNumber(item.title ?? "");
			const titleContent =
				item.title?.split(":").slice(1).join(":").trim() || item.title;
			const title = item.title?.startsWith("#")
				? item.title
				: number === 0
					? titleContent
					: `#${number}: ${titleContent}`;

			// Parse the date and validate it before formatting
			const dateObj = new Date(item.pubDate ?? new Date());
			const pubDate = isValid(dateObj)
				? format(dateObj, "yyyy年M月d日", { locale: ja })
				: format(new Date(), "yyyy年M月d日", { locale: ja });

			// Extract LISTEN ID and check for custom path
			const listenId = extractListenId(item.content ?? "");
			const customPath = listenId && customPathsMap[listenId] ? customPathsMap[listenId] : undefined;

			const episode = {
				title,
				description: item.content ?? item.contentSnippet ?? "",
				pubDate,
				number,
				audioUrl: item.enclosure?.url ?? "",
			};

			// Only add customPath if it exists
			if (customPath) {
				episode.customPath = customPath;
			}

			return episode;
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
