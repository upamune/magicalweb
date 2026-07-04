export interface Word {
	text: string;
	// クリップ先頭からの秒
	start: number;
	end: number;
}

export type Speaker = "michiru" | "upamune";

export interface CaptionPage {
	start: number;
	end: number;
	speaker?: Speaker;
	lines: Word[][];
}

export interface ClipData {
	episode: {
		number: number;
		title: string;
		titleLines: string[];
		date: string;
	};
	audioFile: string;
	durationSec: number;
	bg: "lilac" | "lime" | "sky" | "candy";
	pages: CaptionPage[];
}
