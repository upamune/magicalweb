import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { BODY, DISPLAY } from "../fonts";
import { C } from "../tokens";

// YouTube サムネイル「ステッカー爆弾」（1280×720）。画像は --public-dir に置いた回ごとの素材から読む
export type StickerSpec = {
	src: string;
	x: number;
	y: number;
	w: number;
	r: number;
	z?: number;
};

export type ThumbnailProps = {
	number: string;
	series: string;
	bg: string;
	line1: string;
	line2: string;
	line1Size?: number;
	line2Size?: number;
	stickers: StickerSpec[];
	bubble: { text: string; x: number; y: number };
	hosts?: StickerSpec[];
};

const HOSTS: StickerSpec[] = [
	{ src: "thumbnail/st-michiru.png", x: 24, y: 500, w: 175, r: -8, z: 4 },
	{ src: "thumbnail/st-upamune.png", x: 180, y: 515, w: 165, r: 8, z: 4 },
];

function Sticker({ src, x, y, w, r, z = 1 }: StickerSpec) {
	return (
		<Img
			src={staticFile(src)}
			style={{
				position: "absolute",
				left: x,
				top: y,
				width: w,
				transform: `rotate(${r}deg)`,
				zIndex: z,
			}}
		/>
	);
}

function Outlined({
	children,
	size,
	fill,
	style,
}: { children: ReactNode; size: number; fill: string; style?: CSSProperties }) {
	return (
		<div
			style={{
				fontFamily: DISPLAY,
				fontSize: size,
				lineHeight: 1.05,
				color: fill,
				WebkitTextStroke: `20px ${C.ink}`,
				paintOrder: "stroke fill",
				filter: "drop-shadow(0 8px 0 #0005)",
				whiteSpace: "nowrap",
				...style,
			}}
		>
			{children}
		</div>
	);
}

function Chip({ children, bg }: { children: ReactNode; bg: string }) {
	return (
		<span
			style={{
				fontFamily: BODY,
				fontWeight: 700,
				fontSize: 30,
				color: C.ink,
				backgroundColor: bg,
				borderRadius: 10,
				padding: "4px 16px",
				border: `4px solid ${C.ink}`,
				boxShadow: "0 5px 0 #0005",
			}}
		>
			{children}
		</span>
	);
}

function Bubble({ text, x, y }: ThumbnailProps["bubble"]) {
	return (
		<div
			style={{
				position: "absolute",
				left: x,
				top: y,
				transform: "rotate(-4deg)",
				fontFamily: DISPLAY,
				fontSize: 34,
				color: C.ink,
				backgroundColor: "white",
				border: `5px solid ${C.ink}`,
				borderRadius: 22,
				padding: "6px 18px",
				boxShadow: "0 6px 0 #0004",
				zIndex: 5,
				whiteSpace: "nowrap",
			}}
		>
			{text}
		</div>
	);
}

export function Thumbnail({
	number,
	series,
	bg,
	line1,
	line2,
	line1Size = 150,
	line2Size = 118,
	stickers,
	bubble,
	hosts = HOSTS,
}: ThumbnailProps) {
	return (
		<AbsoluteFill>
			<Img
				src={staticFile(bg)}
				style={{
					position: "absolute",
					width: 1280,
					height: 720,
					objectFit: "cover",
					filter: "saturate(1.25) brightness(0.95)",
				}}
			/>
			<AbsoluteFill
				style={{
					background: `linear-gradient(90deg, ${C.ink}B0 0%, ${C.ink}60 45%, transparent 70%)`,
				}}
			/>
			<div
				style={{
					position: "absolute",
					left: 44,
					top: 36,
					display: "flex",
					gap: 12,
					zIndex: 4,
				}}
			>
				<Chip bg={C.sun}>{number}</Chip>
				<Chip bg="white">{series}</Chip>
			</div>
			<div style={{ position: "absolute", left: 40, top: 150, zIndex: 4 }}>
				<Outlined size={line1Size} fill="white">
					{line1}
				</Outlined>
				<Outlined size={line2Size} fill={C.sun} style={{ marginTop: 6 }}>
					{line2}
				</Outlined>
			</div>
			{[...stickers, ...hosts].map((sticker) => (
				<Sticker key={sticker.src} {...sticker} />
			))}
			<Bubble {...bubble} />
		</AbsoluteFill>
	);
}
