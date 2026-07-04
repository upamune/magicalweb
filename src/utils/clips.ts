import clipsData from "../data/clips.json";

export type EpisodeClip = {
	url: string;
	label?: string;
};

// エピソード番号に紐づく切り抜きクリップ動画（1エピソードに複数ありうる）
export function getEpisodeClips(episodeNumber: number): EpisodeClip[] {
	return (
		(clipsData as Record<string, EpisodeClip[]>)[String(episodeNumber)] ?? []
	);
}
