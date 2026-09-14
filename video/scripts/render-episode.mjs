import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
	renderFingerprint,
	validatePreparedVideo,
} from "./lib/episode-video.mjs";

// フル尺（Episode）を CHUNK フレームずつ分割レンダリングして ffmpeg で結合する。
// 一発レンダリングだと Chrome のタブがフレーム数に比例して肥大し数千フレームで落ちる（Target closed）ため。
// チャンクごとに headless Chrome を殺して、次のチャンクは新しいブラウザで始める。
// 途中で落ちても、出来上がったチャンクは再利用されるので同じコマンドで再開できる。
//
//   bun scripts/render-episode.mjs 278 [--concurrency 4] [--chunk 2000]

const videoDir = path.resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
	const i = argv.indexOf(name);
	return i === -1 ? fallback : argv.splice(i, 2)[1];
};
const concurrency = opt("--concurrency", "4");
const chunk = Number(opt("--chunk", "2000"));
const number = Number(argv[0]);
if (!number) {
	console.error(
		"Usage: bun scripts/render-episode.mjs <episode-number> [--concurrency 4] [--chunk 2000]",
	);
	process.exit(1);
}

const propsPath = path.join(videoDir, "src", "data", "episode.json");
const { data } = JSON.parse(fs.readFileSync(propsPath, "utf8"));
if (data.episode.number !== number) {
	throw new Error(
		`episode.json is for #${data.episode.number}; run build-episode.mjs ${number} first`,
	);
}
if (!Number.isInteger(chunk) || chunk <= 0)
	throw new Error("--chunk must be a positive integer");
if (!Number.isInteger(Number(concurrency)) || Number(concurrency) <= 0)
	throw new Error("--concurrency must be a positive integer");
validatePreparedVideo(data, path.join(videoDir, "public"));
const fingerprint = renderFingerprint(videoDir, propsPath, {
	chunk,
	concurrency,
});
const totalFrames = Math.ceil(data.durationSec * data.fps);
const chunkDir = path.join(
	videoDir,
	"out",
	`episode-${number}-chunks`,
	fingerprint,
);
fs.mkdirSync(chunkDir, { recursive: true });

const parts = [];
for (let start = 0; start < totalFrames; start += chunk) {
	const end = Math.min(totalFrames - 1, start + chunk - 1);
	const file = path.join(chunkDir, `${String(start).padStart(6, "0")}.mp4`);
	parts.push(file);
	if (fs.existsSync(file)) {
		console.error(`skip ${path.basename(file)} (exists)`);
		continue;
	}
	console.error(`render frames ${start}-${end} / ${totalFrames}`);
	const tmp = `${file}.tmp.mp4`;
	execFileSync(
		"bunx",
		[
			"remotion",
			"render",
			"src/index.ts",
			"Episode",
			tmp,
			`--props=${propsPath}`,
			`--frames=${start}-${end}`,
			`--concurrency=${concurrency}`,
			"--muted",
		],
		{ cwd: videoDir, stdio: "inherit" },
	);
	fs.renameSync(tmp, file);
	try {
		execFileSync("pkill", ["-9", "-f", "chrome-headless-shell"]);
	} catch {}
}

if (
	renderFingerprint(videoDir, propsPath, { chunk, concurrency }) !== fingerprint
) {
	fs.rmSync(chunkDir, { recursive: true, force: true });
	throw new Error(
		"Render inputs changed while rendering; discarded inconsistent chunks. Run again with fixed inputs.",
	);
}
const listPath = path.join(chunkDir, "concat.txt");
fs.writeFileSync(
	listPath,
	parts.map((p) => `file '${path.basename(p)}'\n`).join(""),
);
const out = path.join(videoDir, "out", `magicalfm-${number}-episode.mp4`);
execFileSync(
	"ffmpeg",
	[
		"-v",
		"error",
		"-y",
		"-f",
		"concat",
		"-safe",
		"0",
		"-i",
		listPath,
		"-i",
		path.join(videoDir, "public", data.audioFile),
		"-map",
		"0:v:0",
		"-map",
		"1:a:0",
		"-c:v",
		"copy",
		"-c:a",
		"aac",
		"-b:a",
		"192k",
		"-t",
		String(data.durationSec),
		"-movflags",
		"+faststart",
		out,
	],
	{
		stdio: "inherit",
	},
);
console.error(`wrote ${out}`);

// Spotify / YouTube のアップロードで要求されるサムネイル（16:9）も一緒に書き出す
const thumb = path.join(videoDir, "out", `magicalfm-${number}-thumbnail.png`);
execFileSync(
	"bun",
	["scripts/generate-og.jsx", "--thumbnail", String(number)],
	{
		cwd: path.resolve(videoDir, ".."),
		stdio: "inherit",
	},
);
console.error(`wrote ${thumb}`);
