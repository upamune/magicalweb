import {
	AbsoluteFill,
	Audio,
	Img,
	interpolate,
	spring,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import { BODY, Captions, DISPLAY, HOSTS, SpeakerAvatar, Sticker } from "./Clip";
import { C } from "./tokens";
import type { EpisodeData } from "./types";

const LEFT = 72;
const LEFT_WIDTH = 640;
const RIGHT = LEFT + LEFT_WIDTH + 64;

function formatTime(sec: number) {
	const m = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return `${m}:${String(s).padStart(2, "0")}`;
}

// フル尺用の波形: 事前計算した RMS エンベロープを、直近フレームをずらして並べる
function EnvelopeBars({
	envelope,
	frame,
	barCount = 12,
}: {
	envelope: number[];
	frame: number;
	barCount?: number;
}) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				gap: 10,
				height: 100,
			}}
		>
			{Array.from({ length: barCount }, (_, i) => {
				const v = envelope[Math.max(0, frame - (barCount - 1 - i))] ?? 0;
				const h = Math.max(16, Math.min(100, Math.sqrt(v) * 110));
				return (
					<div
						key={String(i)}
						style={{
							width: 14,
							height: h,
							borderRadius: 9999,
							backgroundColor: i % 2 === 0 ? C.ink : C.tangerine,
						}}
					/>
				);
			})}
		</div>
	);
}

export const Episode: React.FC<{ data: EpisodeData }> = ({ data }) => {
	const frame = useCurrentFrame();
	const { fps, durationInFrames } = useVideoConfig();
	const t = frame / fps;

	// 二分探索で現在ページを求める（フル尺は数千ページある）
	let lo = 0;
	let hi = data.pages.length - 1;
	let pageIndex = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const p = data.pages[mid];
		if (t < p.start) hi = mid - 1;
		else if (t >= p.end) lo = mid + 1;
		else {
			pageIndex = mid;
			break;
		}
	}
	const page = pageIndex >= 0 ? data.pages[pageIndex] : null;

	const activeSpeaker = page?.speaker ?? null;
	let speakerSince = page ? Math.round(page.start * fps) : 0;
	if (activeSpeaker && pageIndex > 0) {
		for (let i = pageIndex - 1; i >= 0; i--) {
			if (data.pages[i].speaker !== activeSpeaker) break;
			speakerSince = Math.round(data.pages[i].start * fps);
		}
	}

	const stickerIn = spring({
		frame,
		fps,
		config: { damping: 12, stiffness: 180 },
		durationInFrames: 12,
	});
	const titleIn = spring({
		frame: frame - 4,
		fps,
		config: { damping: 14, stiffness: 160 },
		durationInFrames: 12,
	});
	const brandIn = spring({
		frame: frame - 8,
		fps,
		config: { damping: 14, stiffness: 160 },
		durationInFrames: 12,
	});

	const progress = interpolate(frame, [0, durationInFrames], [0, 1]);

	return (
		<AbsoluteFill
			style={{
				backgroundColor: C[data.bg],
				backgroundImage: `radial-gradient(circle, ${C.ink}24 6px, transparent 6px)`,
				backgroundSize: "54px 54px",
				fontFamily: BODY,
			}}
		>
			<Audio src={staticFile(data.audioFile)} />

			<div
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					right: 0,
					height: 18,
					backgroundColor: C.card,
					borderBottom: `5px solid ${C.ink}`,
				}}
			>
				<div
					style={{
						width: `${progress * 100}%`,
						height: "100%",
						backgroundColor: C.tangerine,
					}}
				/>
			</div>

			{/* 左カラム: 話数 / タイトル / 話者 / ブランド */}
			<div
				style={{
					position: "absolute",
					top: 90,
					left: LEFT,
					width: LEFT_WIDTH,
					display: "flex",
					alignItems: "center",
					gap: 28,
				}}
			>
				<Sticker entrance={stickerIn}>#{data.episode.number}</Sticker>
				<div
					style={{
						fontWeight: 700,
						fontSize: 30,
						color: C.ink,
						opacity: 0.72 * stickerIn,
					}}
				>
					{data.episode.date}
				</div>
			</div>

			<div
				style={{
					position: "absolute",
					top: 250,
					left: LEFT,
					width: LEFT_WIDTH,
					transform: `scale(${0.9 + titleIn * 0.1})`,
					opacity: titleIn,
				}}
			>
				<div
					style={{
						backgroundColor: C.card,
						border: `7px solid ${C.ink}`,
						borderRadius: 40,
						boxShadow: `12px 12px 0 ${C.ink}`,
						padding: "36px 44px",
						fontFamily: DISPLAY,
						fontSize: 46,
						lineHeight: 1.42,
						color: C.ink,
						display: "flex",
						flexDirection: "column",
					}}
				>
					{data.episode.titleLines.map((line) => (
						<div key={line}>{line}</div>
					))}
				</div>
			</div>

			<div
				style={{
					position: "absolute",
					top: 600,
					left: LEFT,
					width: LEFT_WIDTH,
					display: "flex",
					alignItems: "center",
					gap: 8,
				}}
			>
				<SpeakerAvatar
					{...HOSTS.michiru}
					active={activeSpeaker === "michiru"}
					activeSinceFrame={speakerSince}
					frame={frame}
					fps={fps}
				/>
				<div style={{ flex: 1 }}>
					<EnvelopeBars envelope={data.envelope} frame={frame} />
				</div>
				<SpeakerAvatar
					{...HOSTS.upamune}
					active={activeSpeaker === "upamune"}
					activeSinceFrame={speakerSince}
					frame={frame}
					fps={fps}
				/>
			</div>

			<div
				style={{
					position: "absolute",
					bottom: 72,
					left: LEFT,
					width: LEFT_WIDTH,
					display: "flex",
					alignItems: "center",
					gap: 24,
					opacity: brandIn,
				}}
			>
				<Img
					src={staticFile("artwork.png")}
					style={{
						width: 96,
						height: 96,
						borderRadius: 9999,
						border: `7px solid ${C.ink}`,
						boxShadow: `8px 8px 0 ${C.ink}`,
					}}
				/>
				<div
					style={{
						fontFamily: DISPLAY,
						fontSize: 50,
						color: C.ink,
						display: "flex",
						whiteSpace: "nowrap",
					}}
				>
					マヂカル<span style={{ color: C.tangerine }}>.fm</span>
				</div>
				<div
					style={{
						marginLeft: "auto",
						fontWeight: 700,
						fontSize: 30,
						color: C.ink,
						opacity: 0.65,
						fontVariantNumeric: "tabular-nums",
						whiteSpace: "nowrap",
						flexShrink: 0,
					}}
				>
					{formatTime(t)} / {formatTime(data.durationSec)}
				</div>
			</div>

			{/* 右カラム: 字幕 */}
			<div
				style={{
					position: "absolute",
					top: 90,
					bottom: 72,
					left: RIGHT,
					right: LEFT,
					display: "flex",
					alignItems: "center",
				}}
			>
				{page && (
					<Captions page={page} t={t} fps={fps} frame={frame} fontSize={58} />
				)}
			</div>
		</AbsoluteFill>
	);
};
