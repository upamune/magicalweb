import { useAudioStore } from "../store/audioStore";
import { Equalizer } from "./EpisodeList";

interface PlayButtonProps {
	episodeNumber: number;
	episodeSlug: string;
	episodeTitle: string;
	audioUrl: string;
	label?: string;
}

export default function PlayButton({
	episodeNumber,
	episodeSlug,
	episodeTitle,
	audioUrl,
	label = "このエピソードを聴く",
}: PlayButtonProps) {
	const {
		episodeNumber: currentNumber,
		isPlaying,
		setEpisode,
		setPlaying,
	} = useAudioStore();
	const isCurrent = currentNumber === episodeNumber;
	const playing = isCurrent && isPlaying;

	const handleClick = () => {
		if (isCurrent) {
			setPlaying(!isPlaying);
		} else {
			setEpisode(episodeNumber, episodeSlug, episodeTitle, audioUrl);
		}
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			className="btn-pop inline-flex items-center justify-center gap-3 rounded-full bg-tangerine px-8 py-3.5 font-bold text-[rgb(29,26,46)]"
		>
			{playing ? (
				<>
					<Equalizer />
					一時停止
				</>
			) : (
				<>
					<svg
						viewBox="0 0 24 24"
						className="-ml-0.5 h-5 w-5"
						fill="currentColor"
						aria-hidden="true"
					>
						<path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l11.05-6.86a1.04 1.04 0 0 0 0-1.76L9.56 4.26A1.04 1.04 0 0 0 8 5.14z" />
					</svg>
					{label}
				</>
			)}
		</button>
	);
}
