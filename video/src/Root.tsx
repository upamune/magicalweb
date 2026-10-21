import { Composition } from "remotion";
import { Clip, FPS } from "./Clip";
import { Episode } from "./Episode";
import clipData from "./data/clip.json";
import {
	HighlightTitle,
	type HighlightTitleProps,
} from "./episode/HighlightTitle";
import { LocationLabel } from "./episode/LocationLabel";
import { Thumbnail, type ThumbnailProps } from "./episode/Thumbnail";
import { LiveShort, type LiveShortProps } from "./short/LiveShort";
import type { ClipData, EpisodeData, EpisodeLocationCue } from "./types";

const data = clipData as ClipData;

// フル尺は `--props=src/data/episode.json` で渡す（build-episode.mjs が生成。git 管理外）
const episodePlaceholder: EpisodeData = {
	episode: data.episode,
	audioFile: "episode.mp3",
	durationSec: 10,
	fps: 24,
	bg: data.bg,
	envelope: [],
	pages: [],
};

// 旅Vlogの冒頭ハイライト用タイトルとサムネイル。既定値は #293 の実績で、回ごとに --props で上書きする
const highlightTitle293: HighlightTitleProps = {
	variant: "center-stacked",
	number: "#293",
	title: "スペイン・フランス旅行 前編",
	romanized: "MADRID",
	kicker: "SPAIN × FRANCE",
	backdrop: true,
};

const thumbnail293: ThumbnailProps = {
	number: "#293",
	series: "スペイン・フランス旅行 前編",
	bg: "palace.png",
	line1: "マドリード",
	line2: "駆け込み旅！",
	stickers: [
		{ src: "st-paella-pan.png", x: 830, y: 36, w: 430, r: 8 },
		{ src: "st-churros.png", x: 820, y: 420, w: 450, r: -7, z: 2 },
		{ src: "st-fanta.png", x: 650, y: 440, w: 210, r: 12, z: 3 },
		{ src: "st-squid-i1.png", x: 1010, y: 250, w: 220, r: 10 },
	],
	bubble: { text: "チュロス7本！？", x: 350, y: 610 },
};

// 旅Vlogの実写ショート。実際の映像・字幕は --props で渡し、--public-dir で素材フォルダを指す
const liveShortPlaceholder: LiveShortProps = {
	layout: "band",
	video: "short.mp4",
	durationInFrames: 90,
	bg: "candy",
	number: "#291",
	series: "モロッコ旅行 中編",
	hookLines: ["モロッコで一番人気の", "ジュースは何味？"],
	captions: [],
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
				durationInFrames={Math.ceil(episodePlaceholder.durationSec * 24)}
				fps={24}
				width={1920}
				height={1080}
				defaultProps={{ data: episodePlaceholder }}
				calculateMetadata={({ props }) => ({
					durationInFrames: Math.ceil(props.data.durationSec * props.data.fps),
					fps: props.data.fps,
				})}
			/>
			<Composition
				id="LocationLabelAsset"
				component={LocationLabel}
				durationInFrames={1}
				fps={30}
				width={1920}
				height={1080}
				defaultProps={{
					cue: {
						startSec: 0,
						endSec: 1,
						name: "エッサウィラ",
						romanized: "ESSAOUIRA",
						style: "editorial",
					} satisfies EpisodeLocationCue,
				}}
			/>
			<Composition
				id="HighlightTitleAsset"
				component={HighlightTitle}
				durationInFrames={1}
				fps={30}
				width={1920}
				height={1080}
				defaultProps={highlightTitle293}
			/>
			<Composition
				id="HighlightTitle"
				component={HighlightTitle}
				durationInFrames={415}
				fps={30}
				width={1920}
				height={1080}
				defaultProps={{
					...highlightTitle293,
					animate: true,
					fadeOnly: true,
					enterFrames: 30,
					exitFrames: 10,
					durationInFrames: 415,
				}}
				calculateMetadata={({ props }) => ({
					durationInFrames: props.durationInFrames ?? 415,
					fps: props.fps ?? 30,
				})}
			/>
			<Composition
				id="Thumbnail"
				component={Thumbnail}
				durationInFrames={1}
				fps={30}
				width={1280}
				height={720}
				defaultProps={thumbnail293}
			/>
			<Composition
				id="LiveShort"
				component={LiveShort}
				durationInFrames={liveShortPlaceholder.durationInFrames}
				fps={30}
				width={1080}
				height={1920}
				defaultProps={liveShortPlaceholder}
				calculateMetadata={({ props }) => ({
					durationInFrames: props.durationInFrames,
				})}
			/>
		</>
	);
};
