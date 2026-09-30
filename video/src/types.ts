import type { BgColor } from "./tokens";
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
	// ショート動画としての見出し。指定するとタイトルカードにエピソード名の代わりに表示する
	clipTitleLines?: string[];
	bg: BgColor;
	// ゲスト回: 指定するとホスト2人の間にゲストのアバターが並ぶ
	// avatar は public/ 配下のファイル名。無ければ絵文字プレースホルダで表示
	guest?: { name: string; avatar?: string };
	pages: CaptionPage[];
}

// フル尺ビデオポッドキャスト（横1920×1080）用。scripts/build-episode.mjs が生成する
export interface EpisodeVideoSegment {
	file: string;
	// 完成Podcast音声の時間軸。終了は含まない。
	timelineStartSec: number;
	timelineEndSec: number;
	// clean動画内で timelineStartSec に対応する時刻
	sourceStartSec: number;
}

export type LocationLabelStyle = "pill" | "sticker" | "glass" | "editorial";

// 完成音声の時間軸。地名は文字起こしと映像を確認してから記入する。
export interface EpisodeLocationCue {
	startSec: number;
	endSec: number;
	name: string;
	romanized?: string;
	style?: LocationLabelStyle;
}

export interface EpisodeData {
	episode: ClipData["episode"];
	audioFile: string;
	durationSec: number;
	fps: number;
	bg: BgColor;
	// フレームごとの RMS（0〜1）。フル尺の音声を Remotion 側でデコードせずに波形を出すため
	envelope: number[];
	pages: CaptionPage[];
	videoSegments?: EpisodeVideoSegment[];
	locationCues?: EpisodeLocationCue[];
}
