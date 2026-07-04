import fs from "node:fs";

// LISTEN (listen.style) のエピソードページから話者分離付き文字起こしを取得する
//
//   bun scripts/fetch-listen-transcript.mjs <listen-episode-url> <out.json>
//
// LISTEN は発話セグメントごとに開始/終了秒と話者ラベル(0/1)を持っている。
// 出力: [{ start, end, speaker, text }] の配列
// 注意: 話者ラベルの 0/1 が誰かはエピソードごとに任意なので、
//       呼び出し側で F0 や文脈からマッピングする必要がある。

// URL または保存済みHTMLファイルのどちらでも受け取れる。
// 予約投稿（未公開）はログインが必要なので、ブラウザでダッシュボードの
// エピソードページを開いてHTML保存し、そのファイルパスを渡す。
const [source, outPath] = process.argv.slice(2);
if (!source || !outPath) {
	console.error(
		"Usage: bun scripts/fetch-listen-transcript.mjs <listen-episode-url | saved.html> <out.json>",
	);
	process.exit(1);
}

let html;
if (source.startsWith("http")) {
	const res = await fetch(source, {
		headers: { "user-agent": "magicalfm-clips/1.0" },
	});
	if (!res.ok) {
		console.error(`Fetch failed: ${res.status} ${res.statusText}`);
		process.exit(1);
	}
	html = await res.text();
} else {
	html = fs.readFileSync(source, "utf8");
}

const segmentRe =
	/x-data="\{ start: ([\d.]+), end: ([\d.]+) \}"\s*data-speaker="(-?\d+)"[^>]*data-segment-index="(\d+)"[\s\S]*?>([\s\S]*?)<\/div>/g;

const segments = [];
for (const m of html.matchAll(segmentRe)) {
	const [, start, end, speaker, index, body] = m;
	const text = body
		.replace(/<[^>]*>/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#039;/g, "'")
		.replace(/\s+/g, " ")
		.trim();
	if (!text) continue;
	segments.push({
		index: Number(index),
		start: Number(start),
		end: Number(end),
		speaker: Number(speaker),
		text,
	});
}

segments.sort((a, b) => a.index - b.index);

if (segments.length === 0) {
	console.error("No transcript segments found (ページ構造が変わった可能性)");
	process.exit(1);
}

fs.writeFileSync(outPath, `${JSON.stringify(segments, null, "\t")}\n`);

const speakers = new Map();
for (const s of segments) {
	speakers.set(s.speaker, (speakers.get(s.speaker) ?? 0) + 1);
}
console.log(`Wrote ${outPath} (${segments.length} segments)`);
console.log(
	"speakers:",
	[...speakers.entries()].map(([k, v]) => `${k}: ${v}件`).join(" / "),
);
