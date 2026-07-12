import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// クリッププラン(plans/ep-N.json)から Remotion 用のデータと音声を生成する
//
//   bun scripts/build-clip.mjs plans/ep-263.json /path/to/episode.mp3
//
// - 字幕ページの時刻をクリップ先頭基準へシフトして src/data/clip.json に出力
// - ffmpeg でクリップ区間を切り出し、フェードを付けて public/clip.mp3 に出力

const videoDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const [planPath, audioPath] = process.argv.slice(2);
if (!planPath || !audioPath) {
	console.error(
		"Usage: bun scripts/build-clip.mjs <plan.json> <episode-audio>",
	);
	process.exit(1);
}

const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const { clipStart, clipEnd } = plan;
const durationSec = clipEnd - clipStart;

const shift = (t) => Math.max(0, Number((t - clipStart).toFixed(3)));

const data = {
	episode: plan.episode,
	audioFile: "clip.mp3",
	durationSec: Number(durationSec.toFixed(3)),
	bg: plan.bg,
	...(plan.clipTitleLines && { clipTitleLines: plan.clipTitleLines }),
	...(plan.guest && { guest: plan.guest }),
	pages: plan.pages.map((page) => ({
		start: shift(page.start),
		end: shift(page.end),
		...(page.speaker && { speaker: page.speaker }),
		lines: page.lines.map((line) =>
			line.map((word) => ({
				text: word.text,
				start: shift(word.start),
				end: shift(word.end),
			})),
		),
	})),
};

const dataPath = path.join(videoDir, "src", "data", "clip.json");
fs.mkdirSync(path.dirname(dataPath), { recursive: true });
fs.writeFileSync(dataPath, `${JSON.stringify(data, null, "\t")}\n`);
console.log(`Wrote ${dataPath}`);

// 音声の切り出し（フェードイン0.15s / フェードアウト0.8s）
// audioMuteAt を指定すると、その時刻(絶対時刻)から短いフェードで無音にする
// （オチの直後に次の話題の声が被って残ってしまう場合の対策）
const outAudio = path.join(videoDir, "public", "clip.mp3");
const fadeOutStart = plan.audioMuteAt
	? shift(plan.audioMuteAt)
	: Math.max(0, durationSec - 0.8);
const fadeOutDur = plan.audioMuteAt ? 0.3 : 0.8;
execFileSync("ffmpeg", [
	"-v",
	"error",
	"-y",
	"-ss",
	String(clipStart),
	"-to",
	String(clipEnd),
	"-i",
	audioPath,
	"-af",
	`afade=t=in:d=0.15,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOutDur}`,
	"-b:a",
	"192k",
	outAudio,
]);
console.log(`Wrote ${outAudio}`);
