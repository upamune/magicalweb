import { loadFont as loadMPlus } from "@remotion/google-fonts/MPLUSRounded1c";
import { loadFont as loadMochiy } from "@remotion/google-fonts/MochiyPopOne";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
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
import { C } from "./tokens";
import type { CaptionPage, ClipData, Speaker, Word } from "./types";

const HOSTS: Record<Speaker, { name: string; avatar: string }> = {
	michiru: { name: "michiru_da", avatar: "host-michiru.png" },
	upamune: { name: "upamune", avatar: "host-upamune.png" },
};

export const FPS = 30;

const mochiy = loadMochiy();
const mplus = loadMPlus("normal", { weights: ["500", "700"] });

const DISPLAY = mochiy.fontFamily;
const BODY = mplus.fontFamily;

function Sticker({
	children,
	entrance,
	rotate = -4,
}: {
	children: React.ReactNode;
	entrance: number;
	rotate?: number;
}) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				backgroundColor: C.sun,
				color: C.ink,
				border: `7px solid ${C.ink}`,
				borderRadius: 9999,
				padding: "10px 44px",
				fontFamily: DISPLAY,
				fontSize: 52,
				boxShadow: `10px 10px 0 ${C.ink}`,
				transform: `rotate(${rotate}deg) scale(${entrance})`,
			}}
		>
			{children}
		</div>
	);
}

function CaptionWord({ word, t }: { word: Word; t: number }) {
	const spoken = t >= word.end;
	const active = t >= word.start && t < word.end;

	return (
		<span
			style={{
				position: "relative",
				display: "inline-block",
				whiteSpace: "pre",
				color: C.ink,
				opacity: active || spoken ? 1 : 0.28,
				transform: active ? "scale(1.06)" : "scale(1)",
				transition: "none",
			}}
		>
			<span
				style={{
					position: "absolute",
					inset: "2px -6px",
					backgroundColor: C.sun,
					borderRadius: 18,
					opacity: active ? 1 : 0,
				}}
			/>
			<span style={{ position: "relative" }}>{word.text}</span>
		</span>
	);
}

function Captions({
	page,
	t,
	fps,
	frame,
}: { page: CaptionPage; t: number; fps: number; frame: number }) {
	const pageStartFrame = Math.round(page.start * fps);
	const pop = spring({
		frame: frame - pageStartFrame,
		fps,
		config: { damping: 14, stiffness: 160, mass: 0.7 },
		durationInFrames: 14,
	});

	// 短い一言ページ（オチ）は特大・中央寄せで見せる
	const charCount = page.lines.flat().reduce((n, w) => n + w.text.length, 0);
	const isPunchline = page.lines.length === 1 && charCount <= 8;

	return (
		<div
			style={{
				backgroundColor: C.card,
				border: `8px solid ${C.ink}`,
				borderRadius: 48,
				boxShadow: `16px 16px 0 ${C.ink}`,
				padding: isPunchline ? "88px 60px" : "64px 60px",
				fontFamily: DISPLAY,
				fontSize: isPunchline ? 104 : 66,
				lineHeight: 1.5,
				width: "100%",
				transform: `scale(${0.92 + pop * 0.08}) rotate(${(1 - pop) * -1.5}deg)`,
				display: "flex",
				flexDirection: "column",
				gap: 10,
			}}
		>
			{page.lines.map((line, li) => (
				<div
					key={String(li)}
					style={{
						display: "flex",
						flexWrap: "nowrap",
						justifyContent: isPunchline ? "center" : "flex-start",
					}}
				>
					{line.map((word, wi) => (
						<CaptionWord key={String(wi)} word={word} t={t} />
					))}
				</div>
			))}
		</div>
	);
}

// 話者アバター: 喋っている方がポップして目立つ
function HostAvatar({
	speaker,
	active,
	activeSinceFrame,
	frame,
	fps,
}: {
	speaker: Speaker;
	active: boolean;
	activeSinceFrame: number;
	frame: number;
	fps: number;
}) {
	const host = HOSTS[speaker];
	const pop = spring({
		frame: frame - activeSinceFrame,
		fps,
		config: { damping: 12, stiffness: 190 },
		durationInFrames: 12,
	});
	const scale = active ? 0.94 + pop * 0.14 : 0.9;

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: 14,
				width: 190,
			}}
		>
			<div style={{ position: "relative", transform: `scale(${scale})` }}>
				<Img
					src={staticFile(host.avatar)}
					style={{
						width: 150,
						height: 150,
						borderRadius: 9999,
						border: `7px solid ${C.ink}`,
						boxShadow: active
							? `0 0 0 10px ${C.sun}, 8px 8px 0 ${C.ink}`
							: `6px 6px 0 ${C.ink}`,
						filter: active ? "none" : "grayscale(1)",
						opacity: active ? 1 : 0.45,
						objectFit: "cover",
					}}
				/>
			</div>
			<div
				style={{
					fontFamily: DISPLAY,
					fontSize: 26,
					color: C.ink,
					backgroundColor: active ? C.sun : C.card,
					border: `4px solid ${C.ink}`,
					borderRadius: 9999,
					padding: "2px 20px",
					opacity: active ? 1 : 0.5,
					boxShadow: active ? `4px 4px 0 ${C.ink}` : "none",
					transform: `scale(${active ? 0.96 + pop * 0.04 : 0.92})`,
				}}
			>
				{host.name}
			</div>
		</div>
	);
}

function Waveform({
	frame,
	audioFile,
	barCount = 24,
}: {
	frame: number;
	audioFile: string;
	barCount?: number;
}) {
	const { fps } = useVideoConfig();
	const audioData = useAudioData(staticFile(audioFile));
	if (!audioData) return <div style={{ height: 100 }} />;

	const freq = visualizeAudio({
		fps,
		frame,
		audioData,
		numberOfSamples: 64,
	});

	// 低〜中域のビンだけ使い、sqrtで持ち上げて動きを出す
	const bars = freq.slice(1, 1 + barCount);

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				gap: 12,
				height: 100,
			}}
		>
			{bars.map((v, i) => {
				const h = Math.max(16, Math.min(100, Math.sqrt(v) * 320));
				return (
					<div
						key={String(i)}
						style={{
							width: 16,
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

export const Clip: React.FC<{ data: ClipData }> = ({ data }) => {
	const frame = useCurrentFrame();
	const { fps, durationInFrames } = useVideoConfig();
	const t = frame / fps;

	const pageIndex = data.pages.findIndex((p) => t >= p.start && t < p.end);
	const page = pageIndex >= 0 ? data.pages[pageIndex] : null;

	// 話者表示: 現在の話者と、その話者に切り替わったフレーム（連続同一話者は遡る）
	const hasSpeakers = data.pages.some((p) => p.speaker);
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
		durationInFrames: 16,
	});
	const titleIn = spring({
		frame: frame - 5,
		fps,
		config: { damping: 14, stiffness: 160 },
		durationInFrames: 16,
	});
	const brandIn = spring({
		frame: frame - 10,
		fps,
		config: { damping: 14, stiffness: 160 },
		durationInFrames: 16,
	});

	// 終盤のCTA
	const ctaStartFrame = durationInFrames - Math.round(2.6 * fps);
	const ctaIn = spring({
		frame: frame - ctaStartFrame,
		fps,
		config: { damping: 13, stiffness: 170 },
		durationInFrames: 14,
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

			{/* プログレスバー（ストーリーズ式・画面最上部フルブリード） */}
			<div
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					right: 0,
					height: 22,
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

			{/* ヘッダー: 話数ステッカー + 日付 */}
			<div
				style={{
					position: "absolute",
					top: 140,
					left: 72,
					right: 72,
					display: "flex",
					alignItems: "center",
					gap: 36,
				}}
			>
				<Sticker entrance={stickerIn}>#{data.episode.number}</Sticker>
				<div
					style={{
						fontFamily: BODY,
						fontWeight: 700,
						fontSize: 34,
						color: C.ink,
						opacity: 0.72 * stickerIn,
					}}
				>
					{data.episode.date}
				</div>
			</div>

			{/* タイトルカード */}
			<div
				style={{
					position: "absolute",
					top: 350,
					left: 72,
					right: 72,
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
						padding: "44px 52px",
						fontFamily: DISPLAY,
						fontSize: 54,
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

			{/* 話者 + 波形 */}
			{hasSpeakers ? (
				<div
					style={{
						position: "absolute",
						top: 700,
						left: 72,
						right: 72,
						display: "flex",
						alignItems: "center",
						gap: 8,
					}}
				>
					<HostAvatar
						speaker="michiru"
						active={activeSpeaker === "michiru"}
						activeSinceFrame={speakerSince}
						frame={frame}
						fps={fps}
					/>
					<div style={{ flex: 1 }}>
						<Waveform frame={frame} audioFile={data.audioFile} barCount={14} />
					</div>
					<HostAvatar
						speaker="upamune"
						active={activeSpeaker === "upamune"}
						activeSinceFrame={speakerSince}
						frame={frame}
						fps={fps}
					/>
				</div>
			) : (
				<div style={{ position: "absolute", top: 760, left: 72, right: 72 }}>
					<Waveform frame={frame} audioFile={data.audioFile} />
				</div>
			)}

			{/* 字幕 */}
			<div
				style={{
					position: "absolute",
					top: 960,
					left: 64,
					right: 64,
					minHeight: 560,
					display: "flex",
					alignItems: "flex-start",
				}}
			>
				{page && <Captions page={page} t={t} fps={fps} frame={frame} />}
			</div>

			{/* 帯ステッカー（終盤はCTAと入れ替わる） */}
			{frame < ctaStartFrame + 6 && (
				<div
					style={{
						position: "absolute",
						bottom: 330,
						left: 0,
						right: 0,
						display: "flex",
						justifyContent: "center",
						transform: `scale(${Math.max(0, Math.min(brandIn, 1 - ctaIn))})`,
					}}
				>
					<div
						style={{
							backgroundColor: C.lime,
							color: C.ink,
							border: `7px solid ${C.ink}`,
							borderRadius: 9999,
							boxShadow: `8px 8px 0 ${C.ink}`,
							padding: "16px 52px",
							fontFamily: DISPLAY,
							fontSize: 40,
							transform: "rotate(-3deg)",
						}}
					>
						週2で配信中!
					</div>
				</div>
			)}

			{/* CTA */}
			{frame >= ctaStartFrame && (
				<div
					style={{
						position: "absolute",
						bottom: 330,
						left: 0,
						right: 0,
						display: "flex",
						justifyContent: "center",
						transform: `scale(${ctaIn}) rotate(${(1 - ctaIn) * 3}deg)`,
					}}
				>
					<div
						style={{
							backgroundColor: C.tangerine,
							color: C.ink,
							border: `7px solid ${C.ink}`,
							borderRadius: 9999,
							boxShadow: `10px 10px 0 ${C.ink}`,
							padding: "20px 56px",
							fontFamily: DISPLAY,
							fontSize: 46,
						}}
					>
						続きは マヂカル.fm で 🎧
					</div>
				</div>
			)}

			{/* ブランド行 */}
			<div
				style={{
					position: "absolute",
					bottom: 96,
					left: 72,
					right: 72,
					display: "flex",
					flexDirection: "column",
					opacity: brandIn,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 26 }}>
					<Img
						src={staticFile("artwork.png")}
						style={{
							width: 108,
							height: 108,
							borderRadius: 9999,
							border: `7px solid ${C.ink}`,
							boxShadow: `8px 8px 0 ${C.ink}`,
						}}
					/>
					<div
						style={{
							fontFamily: DISPLAY,
							fontSize: 56,
							color: C.ink,
							display: "flex",
						}}
					>
						マヂカル<span style={{ color: C.tangerine }}>.fm</span>
					</div>
					<div
						style={{
							marginLeft: "auto",
							fontFamily: BODY,
							fontWeight: 700,
							fontSize: 30,
							color: C.ink,
							opacity: 0.65,
						}}
					>
						#magicalfm
					</div>
				</div>
			</div>
		</AbsoluteFill>
	);
};
