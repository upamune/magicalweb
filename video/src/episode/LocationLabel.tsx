import { BODY, DISPLAY } from "../fonts";
import { C } from "../tokens";
import type { EpisodeLocationCue } from "../types";

const pin = (
	<svg width="32" height="38" viewBox="0 0 32 38" aria-hidden="true">
		<path
			d="M16 1C7.7 1 1 7.7 1 16c0 10.8 15 21 15 21s15-10.2 15-21C31 7.7 24.3 1 16 1Z"
			fill="#F14575"
		/>
		<circle cx="16" cy="15" r="5.5" fill="white" />
	</svg>
);

export function LocationLabel({ cue }: { cue: EpisodeLocationCue }) {
	const style = cue.style ?? "editorial";
	const isEditorial = style === "editorial";
	return (
		<div
			style={{
				position: "absolute",
				top: 48,
				right: 64,
				zIndex: 2,
				maxWidth: 680,
				boxSizing: "border-box",
				display: "flex",
				alignItems: "center",
				gap: 18,
				padding: isEditorial ? "10px 0" : "17px 26px",
				borderRadius: style === "pill" ? 999 : style === "sticker" ? 22 : 12,
				border: style === "sticker" ? "5px solid #2868D9" : undefined,
				backgroundColor:
					style === "pill"
						? C.card
						: style === "sticker"
							? "#FFF5B8"
							: style === "glass"
								? "#1D1A2EDB"
								: undefined,
				boxShadow:
					style === "pill"
						? "0 7px 0 #53B9F5, 0 12px 24px #0004"
						: style === "sticker"
							? "6px 7px 0 #2868D9, 0 12px 22px #0004"
							: style === "glass"
								? "0 8px 24px #0005"
								: undefined,
				color: style === "glass" || isEditorial ? "white" : "#163B77",
				textShadow: isEditorial ? "0 2px 5px #000A" : undefined,
			}}
		>
			{!isEditorial && pin}
			<div style={{ minWidth: 0, textAlign: isEditorial ? "right" : "center" }}>
				{isEditorial && (
					<div
						aria-hidden="true"
						style={{
							width: 114,
							height: 3,
							marginLeft: "auto",
							marginBottom: 9,
							backgroundColor: C.sun,
						}}
					/>
				)}
				<div
					style={{
						fontFamily: style === "sticker" ? DISPLAY : BODY,
						fontSize: 39,
						fontWeight: 700,
						lineHeight: 1.15,
						whiteSpace: "nowrap",
					}}
				>
					{cue.name}
				</div>
				{cue.romanized && (
					<div
						style={{
							fontFamily: BODY,
							fontSize: 16,
							fontWeight: 700,
							letterSpacing: 4,
							lineHeight: 1.3,
						}}
					>
						{cue.romanized}
					</div>
				)}
			</div>
		</div>
	);
}
