import { useEffect } from "react";
import { useAudioStore } from "../store/audioStore";

interface SeekFromQueryProps {
	episodeNumber: number;
	episodeSlug: string;
	episodeTitle: string;
	audioUrl: string;
}

// URLの ?t=秒 を読んで、その位置からエピソードをプレイヤーにセットする。
// 自動再生はブラウザにブロックされることがあるため、その場合は
// 指定位置で一時停止した状態のプレイヤーが表示される。
export default function SeekFromQuery({
	episodeNumber,
	episodeSlug,
	episodeTitle,
	audioUrl,
}: SeekFromQueryProps) {
	useEffect(() => {
		const t = Number(new URLSearchParams(window.location.search).get("t"));
		if (!Number.isFinite(t) || t <= 0) return;

		const store = useAudioStore.getState();
		store.setEpisode(episodeNumber, episodeSlug, episodeTitle, audioUrl);
		store.setCurrentTime(t);
	}, [episodeNumber, episodeSlug, episodeTitle, audioUrl]);

	return null;
}
