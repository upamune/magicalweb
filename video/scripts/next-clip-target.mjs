import fs from "node:fs";
import path from "node:path";

// クリップ未作成かつ文字起こし済み（transcripts/ep-N.json）の最新エピソードを JSON で出力する。
// 終了コード 3: 最新話は既にクリップ済み / 4: 文字起こしが未コミット
//
//   bun scripts/next-clip-target.mjs

const videoDir = path.resolve(import.meta.dirname, "..");
const root = path.resolve(videoDir, "..");
const episodes = JSON.parse(
	fs.readFileSync(path.join(root, "src/data/episodes.json"), "utf8"),
);
const clips = JSON.parse(
	fs.readFileSync(path.join(root, "src/data/clips.json"), "utf8"),
);

const latest = episodes.reduce((a, b) => (b.number > a.number ? b : a));
if (clips[String(latest.number)]?.length) {
	console.error(`episode #${latest.number} already has a clip`);
	process.exit(3);
}

const transcriptPath = path.join(
	videoDir,
	"transcripts",
	`ep-${latest.number}.json`,
);
if (!fs.existsSync(transcriptPath)) {
	console.error(`transcript not found: ${transcriptPath}`);
	process.exit(4);
}

const listenMatch = latest.description?.match(
	/https:\/\/listen\.style\/p\/magicalfm\/[a-z0-9]+/,
);
console.log(
	JSON.stringify(
		{
			number: latest.number,
			title: latest.title,
			pubDate: latest.pubDate,
			audioUrl: latest.audioUrl,
			listenUrl: listenMatch?.[0] ?? null,
			transcriptPath,
		},
		null,
		2,
	),
);
