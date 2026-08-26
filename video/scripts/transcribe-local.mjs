import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 手元のマシン（Linux amd64 / macOS）で最新エピソードを文字起こしし transcripts/ep-N.json に保存する。
// これをコミットしておくと、クラウドの routine がクリップを無人生成できる。
//
//   bun scripts/transcribe-local.mjs [episode-number] [--device cpu|cuda]   # 省略時は最新話 / auto
//
// 文字起こし本体は scripts/transcribe.py（faster-whisper、uv で実行）。

const videoDir = path.resolve(import.meta.dirname, "..");
const root = path.resolve(videoDir, "..");
const episodes = JSON.parse(
	fs.readFileSync(path.join(root, "src/data/episodes.json"), "utf8"),
);

const args = process.argv.slice(2);
const requested = Number(args.find((a) => /^\d+$/.test(a)));
const deviceIdx = args.indexOf("--device");
const device = deviceIdx !== -1 ? args[deviceIdx + 1] : "auto";

const episode = requested
	? episodes.find((e) => e.number === requested)
	: episodes.reduce((a, b) => (b.number > a.number ? b : a));
if (!episode) {
	console.error(`episode #${requested} not found in episodes.json`);
	process.exit(1);
}

const outPath = path.join(videoDir, "transcripts", `ep-${episode.number}.json`);
if (fs.existsSync(outPath)) {
	console.error(`already exists: ${outPath}`);
	process.exit(0);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcribe-"));
const audioPath = path.join(tmpDir, `ep-${episode.number}.mp3`);
console.error(`downloading ${episode.audioUrl}`);
const res = await fetch(episode.audioUrl);
if (!res.ok) throw new Error(`download failed: ${res.status}`);
fs.writeFileSync(audioPath, Buffer.from(await res.arrayBuffer()));

fs.mkdirSync(path.dirname(outPath), { recursive: true });
execFileSync(
	"uv",
	[
		"run",
		path.join(videoDir, "scripts/transcribe.py"),
		audioPath,
		outPath,
		"--device",
		device,
	],
	{ stdio: "inherit" },
);
fs.rmSync(tmpDir, { recursive: true, force: true });
console.error(`wrote ${outPath}`);
