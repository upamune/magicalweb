import fs from "node:fs";
import path from "node:path";

// クリップ未作成の最新エピソードを JSON で出力する。終了コード 3: 最新話は既にクリップ済み
// transcriptPath はコミット済み文字起こし（transcripts/ep-N.json）があればそのパス、無ければ null。
// keyterms は説明文の「/」区切りトピック行（transcribe-cloud.mjs の --keyterms に渡す）。
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

const listenMatch = (latest.description ?? "").match(
	/https:\/\/listen\.style\/p\/magicalfm\/[a-z0-9]+/,
);
const plain = (latest.description ?? "").replace(/<[^>]+>/g, "\n");
const topicLine = plain
	.split("\n")
	.map((l) => l.trim())
	.find((l) => l.split("/").length >= 4);

console.log(
	JSON.stringify(
		{
			number: latest.number,
			title: latest.title,
			pubDate: latest.pubDate,
			audioUrl: latest.audioUrl,
			listenUrl: listenMatch?.[0] ?? null,
			transcriptPath: fs.existsSync(transcriptPath) ? transcriptPath : null,
			keyterms: topicLine ?? "",
		},
		null,
		2,
	),
);
