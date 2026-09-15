import {
	AbsoluteFill,
	Audio,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import { ClassicEpisodeView } from "./episode/ClassicEpisodeView";
import { StreetVideoView } from "./episode/StreetVideoView";
import {
	findActiveVideoSegment,
	validateVideoSegments,
} from "./episode/videoTimeline.mjs";
import type { EpisodeData } from "./types";

export const Episode: React.FC<{ data: EpisodeData }> = ({ data }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = frame / fps;
	validateVideoSegments(data.videoSegments, data.durationSec, fps);
	const segment = findActiveVideoSegment(data.videoSegments ?? [], t);
	return (
		<AbsoluteFill>
			<Audio src={staticFile(data.audioFile)} />
			{segment ? (
				<StreetVideoView data={data} segment={segment} t={t} />
			) : (
				<ClassicEpisodeView data={data} t={t} />
			)}
		</AbsoluteFill>
	);
};
