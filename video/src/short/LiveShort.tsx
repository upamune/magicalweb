import {
	AbsoluteFill,
	Audio,
	Img,
	OffthreadVideo,
	Sequence,
	interpolate,
	spring,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import { BODY, DISPLAY, TELOP } from "../fonts";
import { type BgColor, C } from "../tokens";

// 旅Vlogの実写ショート（縦1080×1920）。映像は顔ぼかし済みの切り出し、音声は完成マスターの切り出しを使う
export type LiveShortLayout = "full" | "band" | "square";
export type LiveShortSpeaker = "michiru" | "upamune";

export interface LiveShortCaption {
	startFrame: number;
	endFrame: number;
	speaker: LiveShortSpeaker;
	lines: string[];
	// オチの一言。中央に大きく出す
	big?: boolean;
}

// 切り出し映像の startFrame 以降は、元の1920×1080のうち横位置 cx を中心に切り抜く
export interface LiveShortCrop {
	startFrame: number;
	cx: number;
}

// 映像の変化が小さいカットの区間。ゆっくり寄って、画面が止まって見えないようにする
export interface LiveShortDrift {
	startFrame: number;
	endFrame: number;
}

export type LiveShortProps = {
	layout: LiveShortLayout;
	video: string;
	audio?: string;
	durationInFrames: number;
	bg: BgColor;
	number: string;
	series: string;
	hookLines: string[];
	location?: { name: string; romanized?: string };
	captions: LiveShortCaption[];
	crops?: LiveShortCrop[];
	drifts?: LiveShortDrift[];
	ctaFrames?: number;
};

const SPEAKERS = {
	michiru: { color: "#ff8bd8", avatar: "host-michiru.png" },
	upamune: { color: "#65d9ff", avatar: "host-upamune.png" },
} as const;

const SRC_W = 1920;
const SRC_H = 1080;

interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

const LAYOUT: Record<
	LiveShortLayout,
	{
		video: Box;
		hookTop: number;
		hookSize: number;
		captionTop: number;
		framed: boolean;
	}
> = {
	full: {
		video: { x: 0, y: 0, w: 1080, h: 1920 },
		hookTop: 210,
		hookSize: 92,
		captionTop: 1190,
		framed: false,
	},
	band: {
		video: { x: 40, y: 640, w: 1000, h: 562 },
		hookTop: 250,
		hookSize: 92,
		captionTop: 1250,
		framed: true,
	},
	square: {
		video: { x: 0, y: 470, w: 1080, h: 1030 },
		hookTop: 190,
		hookSize: 80,
		captionTop: 1210,
		framed: false,
	},
};

function cropAt(crops: LiveShortCrop[] | undefined, frame: number) {
	let cx = SRC_W / 2;
	for (const c of crops ?? []) {
		if (c.startFrame <= frame) cx = c.cx;
	}
	return cx;
}

// 寄りの量は最大10%。短いカットは1秒あたり1.2%までにして、寄っているのが目立たないようにする
function driftAt(drifts: LiveShortDrift[] | undefined, frame: number) {
	const d = drifts?.find((x) => x.startFrame <= frame && frame < x.endFrame);
	if (!d) return 1;
	const total = Math.min(0.1, (0.012 * (d.endFrame - d.startFrame)) / 30);
	return 1 + (total * (frame - d.startFrame)) / (d.endFrame - d.startFrame);
}

function VideoLayer({ props, box }: { props: LiveShortProps; box: Box }) {
	const frame = useCurrentFrame();
	// 枠いっぱいを覆う倍率。横長の枠（band）は全体が収まる
	const scale = Math.max(box.w / SRC_W, box.h / SRC_H);
	const w = SRC_W * scale;
	const h = SRC_H * scale;
	const cx = cropAt(props.crops, frame) * scale;
	const left = Math.min(0, Math.max(box.w - w, box.w / 2 - cx));
	const top = (box.h - h) / 2;
	const zoom = driftAt(props.drifts, frame);
	return (
		<div
			style={{
				position: "absolute",
				left: box.x,
				top: box.y,
				width: box.w,
				height: box.h,
				overflow: "hidden",
				backgroundColor: C.ink,
				...(LAYOUT[props.layout].framed
					? {
							border: `7px solid ${C.ink}`,
							borderRadius: 28,
							boxShadow: `12px 12px 0 ${C.ink}`,
						}
					: {}),
			}}
		>
			<OffthreadVideo
				src={staticFile(props.video)}
				muted={Boolean(props.audio)}
				style={{
					position: "absolute",
					left,
					top,
					width: w,
					height: h,
					transform: `scale(${zoom})`,
					transformOrigin: `${box.w / 2 - left}px ${box.h / 2 - top}px`,
				}}
			/>
		</div>
	);
}

function Hook({
	lines,
	top,
	size,
}: { lines: string[]; top: number; size: number }) {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const pop = spring({
		frame,
		fps,
		config: { damping: 14, stiffness: 220 },
		durationInFrames: 12,
	});
	return (
		<div
			style={{
				position: "absolute",
				top,
				left: 0,
				right: 0,
				display: "flex",
				justifyContent: "center",
			}}
		>
			<div
				style={{
					backgroundColor: C.sun,
					color: C.ink,
					border: `8px solid ${C.ink}`,
					borderRadius: 32,
					boxShadow: `12px 12px 0 ${C.ink}`,
					padding: "22px 40px 26px",
					fontFamily: DISPLAY,
					fontSize: size,
					lineHeight: 1.22,
					textAlign: "center",
					transform: `rotate(-2deg) scale(${0.6 + 0.4 * pop})`,
					opacity: pop,
					maxWidth: 980,
				}}
			>
				{lines.map((line) => (
					<div key={line} style={{ whiteSpace: "nowrap" }}>
						{line}
					</div>
				))}
			</div>
		</div>
	);
}

function Chip({
	number,
	series,
	top,
}: { number: string; series: string; top: number }) {
	return (
		<div
			style={{
				position: "absolute",
				top,
				left: 0,
				right: 0,
				display: "flex",
				justifyContent: "center",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 14,
					backgroundColor: C.ink,
					color: C.paper,
					borderRadius: 999,
					padding: "10px 28px",
					fontFamily: BODY,
					fontWeight: 700,
					fontSize: 34,
				}}
			>
				<span style={{ color: C.sun }}>マヂカル.fm {number}</span>
				<span>{series}</span>
			</div>
		</div>
	);
}

function TelopText({
	text,
	size,
	color,
}: { text: string; size: number; color: string }) {
	const base: React.CSSProperties = {
		fontFamily: TELOP,
		fontSize: size,
		lineHeight: 1.25,
		whiteSpace: "nowrap",
	};
	return (
		<span style={{ position: "relative", display: "inline-block" }}>
			<span
				aria-hidden="true"
				style={{
					...base,
					position: "absolute",
					inset: 0,
					color: "#222",
					WebkitTextStroke: `${Math.round(size * 0.26)}px #222`,
					filter: "drop-shadow(3px 5px 0 #0008)",
				}}
			>
				{text}
			</span>
			<span
				aria-hidden="true"
				style={{
					...base,
					position: "absolute",
					inset: 0,
					color: "white",
					WebkitTextStroke: `${Math.round(size * 0.22)}px white`,
				}}
			>
				{text}
			</span>
			<span style={{ ...base, position: "relative", color }}>{text}</span>
		</span>
	);
}

function Caption({ page, top }: { page: LiveShortCaption; top: number }) {
	const { color, avatar } = SPEAKERS[page.speaker];
	const longest = Math.max(...page.lines.map((l) => l.length));
	if (page.big) {
		const size = Math.min(170, Math.floor(900 / Math.max(longest, 1)));
		return (
			<div
				style={{
					position: "absolute",
					top: top - 20,
					left: 0,
					right: 0,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
				}}
			>
				{page.lines.map((line) => (
					<TelopText key={line} text={line} size={size} color={color} />
				))}
			</div>
		);
	}
	const size = Math.min(78, Math.floor(830 / Math.max(longest, 1)));
	return (
		<div
			style={{
				position: "absolute",
				top,
				left: 40,
				right: 60,
				display: "flex",
				alignItems: "center",
				gap: 22,
			}}
		>
			<div
				style={{
					flex: "none",
					width: 116,
					height: 116,
					borderRadius: 999,
					backgroundColor: "white",
					border: `6px solid ${color}`,
					boxShadow: "2px 5px 0 #0008",
					overflow: "hidden",
				}}
			>
				<Img
					src={staticFile(avatar)}
					style={{ width: "100%", height: "100%" }}
				/>
			</div>
			<div style={{ display: "flex", flexDirection: "column" }}>
				{page.lines.map((line) => (
					<TelopText key={line} text={line} size={size} color={color} />
				))}
			</div>
		</div>
	);
}

function Location({
	name,
	romanized,
	box,
}: { name: string; romanized?: string; box: Box }) {
	return (
		<div
			style={{
				position: "absolute",
				top: box.y + 28,
				right: 1080 - (box.x + box.w) + 32,
				textAlign: "right",
				color: "white",
				textShadow: "0 2px 6px #000C",
			}}
		>
			<div
				style={{
					width: 90,
					height: 3,
					backgroundColor: C.sun,
					marginLeft: "auto",
					marginBottom: 8,
				}}
			/>
			<div style={{ fontFamily: DISPLAY, fontSize: 38 }}>{name}</div>
			{romanized && (
				<div
					style={{
						fontFamily: BODY,
						fontWeight: 700,
						fontSize: 18,
						letterSpacing: 4,
					}}
				>
					{romanized}
				</div>
			)}
		</div>
	);
}

function Cta({ number }: { number: string }) {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const pop = spring({
		frame,
		fps,
		config: { damping: 13, stiffness: 200 },
		durationInFrames: 14,
	});
	const fade = interpolate(frame, [0, 6], [0, 1], {
		extrapolateRight: "clamp",
	});
	return (
		<AbsoluteFill
			style={{
				backgroundColor: `rgba(29,26,46,${0.55 * fade})`,
				justifyContent: "center",
				alignItems: "center",
			}}
		>
			<div
				style={{
					transform: `rotate(-3deg) scale(${0.5 + 0.5 * pop})`,
					backgroundColor: C.sun,
					border: `8px solid ${C.ink}`,
					borderRadius: 36,
					boxShadow: `14px 14px 0 ${C.ink}`,
					padding: "34px 56px",
					textAlign: "center",
					color: C.ink,
				}}
			>
				<div style={{ fontFamily: DISPLAY, fontSize: 96 }}>続きは本編で！</div>
				<div
					style={{
						fontFamily: BODY,
						fontWeight: 700,
						fontSize: 44,
						marginTop: 10,
					}}
				>
					マヂカル.fm {number}
				</div>
			</div>
		</AbsoluteFill>
	);
}

export function LiveShort(props: LiveShortProps) {
	const frame = useCurrentFrame();
	const layout = LAYOUT[props.layout];
	const ctaFrames = props.ctaFrames ?? 60;
	const ctaStart = props.durationInFrames - ctaFrames;
	const page = props.captions.find(
		(c) => c.startFrame <= frame && frame < c.endFrame,
	);
	return (
		<AbsoluteFill
			style={{
				backgroundColor: C[props.bg],
				backgroundImage: `radial-gradient(circle, ${C.ink}1f 6px, transparent 6px)`,
				backgroundSize: "44px 44px",
			}}
		>
			<VideoLayer props={props} box={layout.video} />
			{props.layout === "full" && (
				<AbsoluteFill
					style={{
						background:
							"linear-gradient(#0008 0%, #0000 22%, #0000 55%, #0009 78%, #000a 100%)",
					}}
				/>
			)}
			{props.location && props.layout !== "full" && (
				<Location
					name={props.location.name}
					romanized={props.location.romanized}
					box={layout.video}
				/>
			)}
			<Chip
				number={props.number}
				series={props.series}
				top={layout.hookTop - 74}
			/>
			<Hook
				lines={props.hookLines}
				top={layout.hookTop}
				size={layout.hookSize}
			/>
			{page && frame < ctaStart && (
				<Caption page={page} top={layout.captionTop} />
			)}
			{props.audio && <Audio src={staticFile(props.audio)} />}
			<Sequence from={ctaStart}>
				<Cta number={props.number} />
			</Sequence>
		</AbsoluteFill>
	);
}
