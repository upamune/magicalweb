import clipsData from "../data/clips.json";
import { getLatestEpisodes, toEpisodeListItem } from "./rss";

export type EpisodeClip = {
	url: string;
	label?: string;
};

export type LatestClip = EpisodeClip & { episodeNumber: number };

export type PublishedClip = LatestClip & {
	episode: ReturnType<typeof toEpisodeListItem>;
};

// 1エピソードに載せる切り抜きクリップの上限
const MAX_CLIPS_PER_EPISODE = 3;

// エピソード番号に紐づく切り抜きクリップ動画（最大3件）
export function getEpisodeClips(episodeNumber: number): EpisodeClip[] {
	return (
		(clipsData as Record<string, EpisodeClip[]>)[String(episodeNumber)] ?? []
	).slice(0, MAX_CLIPS_PER_EPISODE);
}

// 全クリップをエピソード番号の新しい順に並べて返す
export function getLatestClips(): LatestClip[] {
	return Object.keys(clipsData)
		.map(Number)
		.sort((a, b) => b - a)
		.flatMap((number) =>
			getEpisodeClips(number).map((clip) => ({
				...clip,
				episodeNumber: number,
			})),
		);
}

// 公開済みエピソードのクリップだけを、エピソード情報付きで新しい順に返す
export async function getPublishedClips(): Promise<PublishedClip[]> {
	const episodes = await getLatestEpisodes(1000);
	const episodeByNumber = new Map(
		episodes.map((ep) => [ep.number, toEpisodeListItem(ep)]),
	);
	return getLatestClips().flatMap((clip) => {
		const episode = episodeByNumber.get(clip.episodeNumber);
		return episode ? [{ ...clip, episode }] : [];
	});
}
