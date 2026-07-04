export interface Word {
	text: string;
	// クリップ先頭からの秒
	start: number;
	end: number;
}

export interface CaptionPage {
	start: number;
	end: number;
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
