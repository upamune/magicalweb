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
import {
	BODY,
	CaptionWord,
	DISPLAY,
	HOSTS,
	SpeakerAvatar,
	Sticker,
} from "./Clip";
import { C } from "./tokens";
import type { CaptionPage, EpisodeData } from "./types";

const SIDE = 72;

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
	const page: CaptionPage | null =
		pageIndex >= 0 ? data.pages[pageIndex] : null;

	const activeSpeaker = page?.speaker ?? null;
	let speakerSince = page ? Math.round(page.start * fps) : 0;
	if (activeSpeaker && pageIndex > 0) {
		for (let i = pageIndex - 1; i >= 0; i--) {
			if (data.pages[i].speaker !== activeSpeaker) break;
			speakerSince = Math.round(data.pages[i].start * fps);
		}
	}

	const firstSpeechFrame = Math.round((data.pages[0]?.start ?? 0) * fps);
	// 上段の号数・タイトルは読み上げが始まった瞬間にブワーンとポップイン
	const stickerIn = spring({
		frame: frame - firstSpeechFrame,
		fps,
		config: { damping: 12, stiffness: 180 },
		durationInFrames: 12,
	});
	const titleIn = spring({
		frame: frame - firstSpeechFrame - 4,
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
	const charCount = page
		? page.lines.flat().reduce((n, w) => n + w.text.length, 0)
		: 0;
	const isShort = page !== null && page.lines.length === 1 && charCount <= 8;
	const beforeFirstSpeech = t < (data.pages[0]?.start ?? 0);

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

			{/* タイトル行: 話数 → タイトル → 日付 */}
			<div
				style={{
					position: "absolute",
					top: 80,
					left: SIDE,
					right: SIDE,
					display: "flex",
					alignItems: "center",
					gap: 28,
				}}
			>
				<Sticker entrance={stickerIn}>#{data.episode.number}</Sticker>
				<div
					style={{
						backgroundColor: C.card,
						border: `7px solid ${C.ink}`,
						borderRadius: 40,
						boxShadow: `12px 12px 0 ${C.ink}`,
						padding: "18px 40px",
						fontFamily: DISPLAY,
						fontSize: 44,
						color: C.ink,
						whiteSpace: "nowrap",
						minWidth: 0,
						overflow: "hidden",
						textOverflow: "ellipsis",
						transform: `scale(${0.9 + titleIn * 0.1})`,
						opacity: titleIn,
					}}
				>
					{data.episode.titleLines.join("")}
				</div>
				<div
					style={{
						fontWeight: 700,
						fontSize: 30,
						color: C.ink,
						opacity: 0.72 * stickerIn,
						whiteSpace: "nowrap",
						flexShrink: 0,
					}}
				>
					{data.episode.date}
				</div>
			</div>

			{/* セリフ枠: 常時表示。中身だけ切り替える */}
			<div
				style={{
					position: "absolute",
					top: 290,
					left: SIDE,
					right: SIDE,
					height: 460,
					display: "flex",
					alignItems: "center",
				}}
			>
				<div
					style={{
						width: "100%",
						boxSizing: "border-box",
						minHeight: 380,
						backgroundColor: C.card,
						border: `8px solid ${C.ink}`,
						borderRadius: 48,
						boxShadow: `16px 16px 0 ${C.ink}`,
						padding: "64px 72px",
						fontFamily: DISPLAY,
						fontSize: isShort ? 108 : 72,
						lineHeight: 1.5,
						color: C.ink,
						display: "flex",
						flexDirection: "column",
						justifyContent: "center",
						gap: 10,
					}}
				>
					{beforeFirstSpeech ? (
						<div
							style={{
								width: "100%",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								gap: 32,
							}}
						>
							<Sticker entrance={1}>#{data.episode.number}</Sticker>
							<div style={{ fontSize: 88 }}>
								{data.episode.titleLines.join("")}
							</div>
						</div>
					) : (
						page?.lines.map((line, li) => (
							<div
								key={String(li)}
								style={{
									display: "flex",
									flexWrap: "nowrap",
									justifyContent: isShort ? "center" : "flex-start",
								}}
							>
								{line.map((word, wi) => (
									<CaptionWord key={String(wi)} word={word} t={t} />
								))}
							</div>
						))
					)}
				</div>
			</div>

			{/* 下段: ブランド + 経過時間 / 話者 + 波形 */}
			<div
				style={{
					position: "absolute",
					bottom: 60,
					left: SIDE,
					right: SIDE,
					display: "flex",
					alignItems: "center",
					gap: 40,
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
						fontWeight: 700,
						fontSize: 28,
						color: C.ink,
						opacity: 0.65,
						fontVariantNumeric: "tabular-nums",
						whiteSpace: "nowrap",
						flexShrink: 0,
					}}
				>
					{formatTime(t)} / {formatTime(data.durationSec)}
				</div>
				<div style={{ flexGrow: 1 }} />
				<SpeakerAvatar
					{...HOSTS.michiru}
					active={activeSpeaker === "michiru"}
					activeSinceFrame={speakerSince}
					frame={frame}
					fps={fps}
				/>
				<div style={{ width: 300 }}>
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
		</AbsoluteFill>
	);
};
