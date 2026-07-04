import { execFileSync } from "node:child_process";
import fs from "node:fs";

// エピソード音声と文字起こしから「盛り上がり候補」の時間窓をランキングする
//
//   bun scripts/find-highlights.mjs <episode-audio> <whisper.json> [--window 30] [--top 5]
//
// 音声のRMSエネルギー（笑い声・声量が大きい区間で高くなる）で窓をスコアリングし、
// 各候補の文字起こしテキストを添えて出力する。最終的な選定は人間/AIが行う。

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const [audioPath, transcriptPath] = positional;

if (!audioPath || !transcriptPath) {
	console.error(
		"Usage: bun scripts/find-highlights.mjs <episode-audio> <whisper.json> [--window 30] [--top 5]",
	);
	process.exit(1);
}

const getFlag = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i !== -1 ? Number(args[i + 1]) : fallback;
};

const windowSec = getFlag("window", 30);
const topN = getFlag("top", 5);

// 16kHz mono PCM に変換して1秒ごとのRMSを計算
const SAMPLE_RATE = 16000;
const pcm = execFileSync(
	"ffmpeg",
	[
		"-v",
		"error",
		"-i",
		audioPath,
		"-ac",
		"1",
		"-ar",
		String(SAMPLE_RATE),
		"-f",
		"s16le",
		"-",
	],
	{ maxBuffer: 1024 * 1024 * 1024 },
);

const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
const totalSec = Math.floor(samples.length / SAMPLE_RATE);

const rms = new Float64Array(totalSec);
for (let s = 0; s < totalSec; s++) {
	let sum = 0;
	const base = s * SAMPLE_RATE;
	for (let i = 0; i < SAMPLE_RATE; i++) {
		const v = samples[base + i] / 32768;
		sum += v * v;
	}
	rms[s] = Math.sqrt(sum / SAMPLE_RATE);
}

// 窓ごとの平均エネルギー
const scores = [];
for (let s = 0; s + windowSec <= totalSec; s++) {
	let sum = 0;
	for (let i = 0; i < windowSec; i++) sum += rms[s + i];
	scores.push({ start: s, score: sum / windowSec });
}

// 重複しない上位窓を選ぶ
scores.sort((a, b) => b.score - a.score);
const picked = [];
for (const w of scores) {
	if (picked.every((p) => Math.abs(p.start - w.start) > windowSec * 1.5)) {
		picked.push(w);
	}
	if (picked.length >= topN) break;
}
picked.sort((a, b) => a.start - b.start);

// 各候補窓の文字起こしを添える（mlx-whisperはNaNを出力することがあるので潰す）
const transcript = JSON.parse(
	fs.readFileSync(transcriptPath, "utf8").replace(/\bNaN\b/g, "null"),
);
const segments = transcript.segments ?? [];

const fmt = (sec) =>
	`${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

console.log(
	`エネルギー上位 ${picked.length} 窓（${windowSec}秒窓 / 全${fmt(totalSec)}）\n`,
);
for (const [rank, w] of picked.entries()) {
	console.log(
		`── 候補${rank + 1}: ${fmt(w.start)}〜${fmt(w.start + windowSec)} (${w.start}s〜) score=${w.score.toFixed(4)}`,
	);
	for (const seg of segments) {
		if (seg.end >= w.start && seg.start <= w.start + windowSec) {
			console.log(`  ${seg.start.toFixed(1).padStart(7)} ${seg.text}`);
		}
	}
	console.log("");
}
