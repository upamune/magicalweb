import { Composition } from "remotion";
import { Clip, FPS } from "./Clip";
import clipData from "./data/clip.json";
import type { ClipData } from "./types";

const data = clipData as ClipData;

export const RemotionRoot: React.FC = () => {
	return (
		<Composition
			id="Clip"
			component={Clip}
			durationInFrames={Math.ceil(data.durationSec * FPS)}
			fps={FPS}
			width={1080}
			height={1920}
			defaultProps={{ data }}
		/>
	);
};
