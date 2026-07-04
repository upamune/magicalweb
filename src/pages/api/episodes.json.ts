import type { APIRoute } from "astro";
import { getLatestEpisodes, toEpisodeListItem } from "../../utils/rss";

// コマンドパレット用の軽量エピソード一覧（ビルド時に静的生成される）
export const GET: APIRoute = async () => {
	const episodes = await getLatestEpisodes(1000);
	const items = episodes.map(toEpisodeListItem);

	return new Response(JSON.stringify(items), {
		headers: { "Content-Type": "application/json" },
	});
};
