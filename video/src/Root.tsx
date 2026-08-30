import { Composition } from "remotion";
import { Clip, FPS } from "./Clip";
import { Episode } from "./Episode";
import clipData from "./data/clip.json";
import type { ClipData, EpisodeData } from "./types";

const data = clipData as ClipData;

// フル尺は `--props=src/data/episode.json` で渡す（build-episode.mjs が生成。git 管理外）
const episodePlaceholder: EpisodeData = {
	episode: data.episode,
	audioFile: "episode.mp3",
	durationSec: 10,
	fps: 15,
	bg: data.bg,
	envelope: [],
	pages: [],
};

export const RemotionRoot: React.FC = () => {
	return (
		<>
			<Composition
				id="Clip"
				component={Clip}
				durationInFrames={Math.ceil(data.durationSec * FPS)}
				fps={FPS}
				width={1080}
				height={1920}
				defaultProps={{ data }}
			/>
			<Composition
				id="Episode"
				component={Episode}
				durationInFrames={Math.ceil(episodePlaceholder.durationSec * 15)}
				fps={15}
				width={1920}
				height={1080}
				defaultProps={{ data: episodePlaceholder }}
				calculateMetadata={({ props }) => ({
					durationInFrames: Math.ceil(props.data.durationSec * props.data.fps),
					fps: props.data.fps,
				})}
			/>
		</>
	);
};
