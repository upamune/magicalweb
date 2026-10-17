import type { CSSProperties } from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { BODY, DISPLAY } from "../fonts";
import { C } from "../tokens";

export type HighlightTitleVariant =
	| "editorial-left"
	| "editorial-number"
	| "lower-third"
	| "minimal-strip"
	| "pop-chip"
	| "glass-bar"
	| "center-editorial"
	| "center-cinematic"
	| "center-pop-outline"
	| "center-sticker"
	| "center-stacked"
	| "center-band";

export type HighlightTitleProps = {
	variant: HighlightTitleVariant;
	number: string;
	title: string;
	romanized: string;
	kicker?: string;
	backdrop?: boolean;
	animate?: boolean;
	fadeOnly?: boolean;
	enterFrames?: number;
	exitFrames?: number;
	durationInFrames?: number;
	fps?: number;
};

const shadow = "0 2px 5px #000A";

const corner: CSSProperties = {
	position: "absolute",
	top: 48,
	left: 64,
	color: "white",
	textShadow: shadow,
};

function EditorialLeft({ number, title, romanized }: HighlightTitleProps) {
	return (
		<div style={{ ...corner, padding: "10px 0" }}>
			<div
				style={{
					width: 114,
					height: 3,
					marginBottom: 9,
					backgroundColor: C.sun,
				}}
			/>
			<div
				style={{
					fontFamily: BODY,
					fontSize: 39,
					fontWeight: 700,
					lineHeight: 1.15,
					whiteSpace: "nowrap",
				}}
			>
				{title}
			</div>
			<div
				style={{
					fontFamily: BODY,
					fontSize: 16,
					fontWeight: 700,
					letterSpacing: 4,
					lineHeight: 1.6,
				}}
			>
				{number}　{romanized}
			</div>
		</div>
	);
}

function EditorialNumber({ number, title, romanized }: HighlightTitleProps) {
	return (
		<div style={{ ...corner, display: "flex", alignItems: "center", gap: 22 }}>
			<div
				style={{
					fontFamily: DISPLAY,
					fontSize: 64,
					lineHeight: 1,
					color: C.sun,
				}}
			>
				{number}
			</div>
			<div
				style={{
					width: 3,
					alignSelf: "stretch",
					backgroundColor: "white",
					opacity: 0.85,
				}}
			/>
			<div>
				<div
					style={{
						fontFamily: BODY,
						fontSize: 34,
						fontWeight: 700,
						lineHeight: 1.2,
						whiteSpace: "nowrap",
					}}
				>
					{title}
				</div>
				<div
					style={{
						fontFamily: BODY,
						fontSize: 16,
						fontWeight: 700,
						letterSpacing: 4,
						lineHeight: 1.6,
					}}
				>
					{romanized}
				</div>
			</div>
		</div>
	);
}

function LowerThird({ number, title, romanized }: HighlightTitleProps) {
	return (
		<div
			style={{
				position: "absolute",
				left: 64,
				bottom: 72,
				color: "white",
				textShadow: shadow,
			}}
		>
			<div
				style={{
					display: "inline-block",
					fontFamily: BODY,
					fontSize: 22,
					fontWeight: 700,
					letterSpacing: 2,
					color: C.ink,
					backgroundColor: C.sun,
					borderRadius: 6,
					padding: "2px 12px",
					textShadow: "none",
					marginBottom: 10,
				}}
			>
				{number}
			</div>
			<div
				style={{
					fontFamily: BODY,
					fontSize: 46,
					fontWeight: 700,
					lineHeight: 1.15,
					whiteSpace: "nowrap",
				}}
			>
				{title}
			</div>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 14,
					marginTop: 10,
				}}
			>
				<div style={{ width: 160, height: 3, backgroundColor: C.sun }} />
				<div
					style={{
						fontFamily: BODY,
						fontSize: 16,
						fontWeight: 700,
						letterSpacing: 4,
					}}
				>
					{romanized}
				</div>
			</div>
		</div>
	);
}

function MinimalStrip({ number, title }: HighlightTitleProps) {
	const bar = <div style={{ width: 2, height: 26, backgroundColor: C.sun }} />;
	return (
		<div
			style={{
				...corner,
				display: "flex",
				alignItems: "center",
				gap: 16,
				fontFamily: BODY,
				fontSize: 26,
				fontWeight: 700,
			}}
		>
			<span style={{ fontFamily: DISPLAY, fontSize: 24 }}>マヂカル.fm</span>
			{bar}
			<span style={{ letterSpacing: 2 }}>{number}</span>
			{bar}
			<span style={{ whiteSpace: "nowrap" }}>{title}</span>
		</div>
	);
}

function PopChip({ number, title }: HighlightTitleProps) {
	return (
		<div
			style={{
				position: "absolute",
				top: 48,
				left: 64,
				display: "flex",
				alignItems: "center",
				gap: 14,
				padding: "12px 22px 12px 12px",
				borderRadius: 14,
				backgroundColor: C.card,
				border: `4px solid ${C.ink}`,
				boxShadow: `6px 7px 0 ${C.lilac}, 0 12px 22px #0004`,
				color: C.ink,
			}}
		>
			<div
				style={{
					fontFamily: DISPLAY,
					fontSize: 26,
					color: C.ink,
					backgroundColor: C.sun,
					borderRadius: 8,
					padding: "2px 12px",
				}}
			>
				{number}
			</div>
			<div style={{ fontFamily: DISPLAY, fontSize: 30, whiteSpace: "nowrap" }}>
				{title}
			</div>
		</div>
	);
}

function GlassBar({ number, title, romanized }: HighlightTitleProps) {
	return (
		<div
			style={{
				position: "absolute",
				top: 48,
				left: 64,
				display: "flex",
				borderRadius: 12,
				overflow: "hidden",
				backgroundColor: "#1D1A2EB8",
				boxShadow: "0 8px 24px #0005",
				color: "white",
			}}
		>
			<div style={{ width: 7, backgroundColor: C.sun }} />
			<div style={{ padding: "12px 24px 12px 20px" }}>
				<div
					style={{
						fontFamily: BODY,
						fontSize: 32,
						fontWeight: 700,
						lineHeight: 1.2,
						whiteSpace: "nowrap",
					}}
				>
					{title}
				</div>
				<div
					style={{
						fontFamily: BODY,
						fontSize: 15,
						fontWeight: 700,
						letterSpacing: 4,
						lineHeight: 1.6,
						color: C.sun,
					}}
				>
					{number}　{romanized}
				</div>
			</div>
		</div>
	);
}

const center: CSSProperties = {
	position: "absolute",
	inset: 0,
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	color: "white",
	textAlign: "center",
};

const deepShadow = "0 4px 18px #000C, 0 2px 4px #000A";

function CenterEditorial({ number, title, romanized }: HighlightTitleProps) {
	return (
		<div style={{ ...center, textShadow: deepShadow }}>
			<div
				style={{
					width: 180,
					height: 5,
					marginBottom: 22,
					backgroundColor: C.sun,
					boxShadow: "0 2px 8px #0008",
				}}
			/>
			<div
				style={{
					fontFamily: BODY,
					fontSize: 104,
					fontWeight: 700,
					lineHeight: 1.1,
					whiteSpace: "nowrap",
				}}
			>
				{title}
			</div>
			<div
				style={{
					fontFamily: BODY,
					fontSize: 30,
					fontWeight: 700,
					letterSpacing: 12,
					marginTop: 18,
				}}
			>
				{number}　{romanized}
			</div>
		</div>
	);
}

function CenterCinematic({ number, title, romanized }: HighlightTitleProps) {
	return (
		<div
			style={{
				...center,
				background:
					"linear-gradient(transparent 28%, #0007 42%, #0007 58%, transparent 72%)",
			}}
		>
			<div
				style={{
					fontFamily: BODY,
					fontSize: 210,
					fontWeight: 700,
					letterSpacing: 42,
					lineHeight: 1,
					marginRight: -42,
					textShadow: deepShadow,
				}}
			>
				{romanized}
			</div>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 22,
					marginTop: 26,
					textShadow: deepShadow,
				}}
			>
				<div style={{ width: 90, height: 3, backgroundColor: C.sun }} />
				<div
					style={{
						fontFamily: BODY,
						fontSize: 40,
						fontWeight: 700,
						whiteSpace: "nowrap",
					}}
				>
					{title}
				</div>
				<div
					style={{
						fontFamily: BODY,
						fontSize: 40,
						fontWeight: 700,
						color: C.sun,
					}}
				>
					{number}
				</div>
				<div style={{ width: 90, height: 3, backgroundColor: C.sun }} />
			</div>
		</div>
	);
}

function CenterPopOutline({ number, title }: HighlightTitleProps) {
	const outline: CSSProperties = {
		fontFamily: DISPLAY,
		WebkitTextStroke: `16px ${C.ink}`,
		paintOrder: "stroke fill",
		filter: "drop-shadow(0 10px 0 #0006)",
	};
	return (
		<div style={center}>
			<div style={{ ...outline, fontSize: 84, color: C.sun, marginBottom: 6 }}>
				{number}
			</div>
			<div
				style={{
					...outline,
					fontSize: 128,
					lineHeight: 1.15,
					color: "white",
					whiteSpace: "nowrap",
				}}
			>
				{title}
			</div>
		</div>
	);
}

function CenterSticker({ number, title, romanized }: HighlightTitleProps) {
	return (
		<div style={center}>
			<div
				style={{
					transform: "rotate(-3deg)",
					padding: "34px 64px 30px",
					borderRadius: 28,
					backgroundColor: C.card,
					border: `7px solid ${C.ink}`,
					boxShadow: `14px 16px 0 ${C.lilac}, 0 24px 48px #0006`,
					color: C.ink,
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "center",
						gap: 16,
						marginBottom: 14,
					}}
				>
					<span
						style={{
							fontFamily: DISPLAY,
							fontSize: 40,
							backgroundColor: C.sun,
							borderRadius: 12,
							padding: "2px 18px",
						}}
					>
						{number}
					</span>
					<span
						style={{
							fontFamily: BODY,
							fontSize: 30,
							fontWeight: 700,
							letterSpacing: 10,
							alignSelf: "center",
						}}
					>
						{romanized}
					</span>
				</div>
				<div
					style={{
						fontFamily: DISPLAY,
						fontSize: 96,
						lineHeight: 1.15,
						whiteSpace: "nowrap",
					}}
				>
					{title}
				</div>
			</div>
		</div>
	);
}

function CenterStacked({
	number,
	title,
	romanized,
	kicker,
	backdrop,
}: HighlightTitleProps) {
	const [main, part] = title.split(" ");
	return (
		<div
			style={{
				...center,
				textShadow: deepShadow,
				background: backdrop
					? "radial-gradient(ellipse 46% 34% at 50% 50%, #000000A0, #00000055 55%, transparent 100%)"
					: undefined,
			}}
		>
			{kicker && (
				<div
					style={{
						fontFamily: BODY,
						fontSize: 30,
						fontWeight: 700,
						letterSpacing: 16,
						marginBottom: 6,
					}}
				>
					{kicker}
				</div>
			)}
			<div
				style={{
					fontFamily: DISPLAY,
					fontSize: 140,
					lineHeight: 1.1,
					whiteSpace: "nowrap",
				}}
			>
				{main}
			</div>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 20,
					marginTop: 18,
				}}
			>
				<span
					style={{
						fontFamily: DISPLAY,
						fontSize: 52,
						color: C.ink,
						backgroundColor: C.sun,
						borderRadius: 14,
						padding: "0 26px",
						textShadow: "none",
						boxShadow: "0 6px 16px #0007",
					}}
				>
					{part ?? ""}
				</span>
				<span
					style={{
						fontFamily: BODY,
						fontSize: 34,
						fontWeight: 700,
						letterSpacing: 10,
					}}
				>
					{number} {romanized}
				</span>
			</div>
		</div>
	);
}

function CenterBand({ number, title, romanized }: HighlightTitleProps) {
	return (
		<div style={center}>
			<div
				style={{
					width: "100%",
					padding: "34px 0 30px",
					backgroundColor: "#1D1A2EC4",
					borderTop: `6px solid ${C.sun}`,
					borderBottom: `6px solid ${C.sun}`,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
				}}
			>
				<div
					style={{
						fontFamily: BODY,
						fontSize: 28,
						fontWeight: 700,
						letterSpacing: 12,
						color: C.sun,
					}}
				>
					マヂカル.fm {number}
				</div>
				<div
					style={{
						fontFamily: BODY,
						fontSize: 110,
						fontWeight: 700,
						lineHeight: 1.15,
						whiteSpace: "nowrap",
					}}
				>
					{title}
				</div>
				<div
					style={{
						fontFamily: BODY,
						fontSize: 26,
						fontWeight: 700,
						letterSpacing: 14,
					}}
				>
					{romanized}
				</div>
			</div>
		</div>
	);
}

const VARIANTS = {
	"center-editorial": CenterEditorial,
	"center-cinematic": CenterCinematic,
	"center-pop-outline": CenterPopOutline,
	"center-sticker": CenterSticker,
	"center-stacked": CenterStacked,
	"center-band": CenterBand,
	"editorial-left": EditorialLeft,
	"editorial-number": EditorialNumber,
	"lower-third": LowerThird,
	"minimal-strip": MinimalStrip,
	"pop-chip": PopChip,
	"glass-bar": GlassBar,
} as const;

export function HighlightTitle(props: HighlightTitleProps) {
	const Variant = VARIANTS[props.variant];
	const frame = useCurrentFrame();
	const { durationInFrames } = useVideoConfig();
	if (!props.animate) return <Variant {...props} />;
	const inFrames = props.enterFrames ?? 8;
	const outFrames = props.exitFrames ?? 6;
	const enter = interpolate(frame, [0, inFrames], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: Easing.out(Easing.cubic),
	});
	const exit = interpolate(
		frame,
		[durationInFrames - outFrames, durationInFrames],
		[1, 0],
		{
			extrapolateLeft: "clamp",
			extrapolateRight: "clamp",
			easing: Easing.in(Easing.quad),
		},
	);
	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				opacity: enter * exit,
				transform: props.fadeOnly
					? undefined
					: `translateY(${(1 - enter) * 24}px) scale(${0.94 + 0.06 * enter})`,
			}}
		>
			<Variant {...props} />
		</div>
	);
}
