export interface Word {
	text: string;
	// クリップ先頭からの秒
	start: number;
	end: number;
}

export type Speaker = "michiru" | "upamune" | "guest";

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
	// ゲスト回: 指定するとホスト2人の間にゲストのアバターが並ぶ
	// avatar は public/ 配下のファイル名。無ければ絵文字プレースホルダで表示
	guest?: { name: string; avatar?: string };
	pages: CaptionPage[];
}
