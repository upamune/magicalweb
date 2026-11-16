import fs from "node:fs";

// src/data/episode.json（build-episode.mjs の出力）から LISTEN 用の VTT を作る
//
//   bun scripts/build-vtt.mjs out/ep-302.vtt
//
// 字幕の行ごとに 1 キューにして、話者を <v 名前> で付ける。時刻は完成動画（LISTEN の音声）と同じ時計
// ゲスト回（build-episode.mjs --guest）はゲストの発話をゲスト名にする

const out = process.argv[2];
if (!out) {
	console.error("Usage: bun scripts/build-vtt.mjs <out.vtt>");
	process.exit(1);
}

const { data } = JSON.parse(
	fs.readFileSync(new URL("../src/data/episode.json", import.meta.url), "utf8"),
);
const NAMES = {
	michiru: "みちるだ",
	upamune: "うぱみゅん",
	guest: data.guest?.name,
};

const stamp = (t) => {
	const ms = Math.round(t * 1000);
	const p = (n, w = 2) => String(n).padStart(w, "0");
	return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`;
};

const cues = [];
for (const page of data.pages) {
	for (const line of page.lines) {
		let text = line
			.map((w) => w.text)
			.join("")
			.trim();
		if (!text) continue;
		// うぱは「みちるださん」と表記する。ゲストが本当に「みちるさん」と呼ぶ発話はそのまま
		if (page.speaker === "upamune") {
			text = text.replaceAll("みちるさん", "みちるださん");
		}
		cues.push({
			start: line[0].start,
			end: line.at(-1).end,
			speaker: page.speaker,
			text,
		});
	}
}
cues.sort((a, b) => a.start - b.start);
let prevEnd = 0;
for (let i = 0; i < cues.length; i++) {
	const next = cues[i + 1];
	cues[i].start = Math.max(cues[i].start, prevEnd);
	if (next && cues[i].end > next.start) cues[i].end = next.start;
	if (cues[i].end <= cues[i].start) cues[i].end = cues[i].start + 0.2;
	prevEnd = cues[i].end;
}

const body = cues.map((c) => {
	const name = NAMES[c.speaker];
	const text = name ? `<v ${name}>${c.text}` : c.text;
	return `${stamp(c.start)} --> ${stamp(c.end)}\n${text}`;
});
fs.writeFileSync(out, `WEBVTT\n\n${body.join("\n\n")}\n`);
console.error(`wrote ${out} (${cues.length} cues)`);
