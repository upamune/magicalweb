// デザイントークン（docs/design-system.md と同期）
export const C = {
	ink: "#1D1A2E",
	paper: "#FFF8EE",
	card: "#FFFEFA",
	muted: "#6E6884",
	lilac: "#CFB3F5",
	lime: "#C9E94E",
	tangerine: "#FF8A3D",
	sky: "#7FD4F5",
	candy: "#FF9EC0",
	sun: "#FFD23F",
} as const;

export type BgColor = "lilac" | "lime" | "sky" | "candy";
