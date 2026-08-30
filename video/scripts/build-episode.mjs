import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// フル尺のビデオポッドキャスト（横1920×1080）用データを生成する
//
//   bun scripts/build-episode.mjs 278 [--transcript transcripts/ep-278.json] [--audio ep.mp3]
//                                     [--speakers 0=michiru,1=upamune] [--model deepseek-v4-flash:cloud]
//
// 1. transcripts/ep-N.json（transcribe-cloud.mjs 形式）を読む
// 2. Ollama（既定: deepseek-v4-flash:cloud）で誤認識を校正し、語区切り「|」を入れてもらう
//    結果は transcripts/ep-N.proofread.json にキャッシュし、再実行時は未校正分だけ問い合わせる
// 3. 横画面向けに自動ページ化して src/data/episode.json に出力
// 4. 音声を public/episode.mp3 に置き、波形用の RMS エンベロープを埋め込む

const videoDir = path.resolve(import.meta.dirname, "..");
const root = path.resolve(videoDir, "..");

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
	const i = argv.indexOf(name);
	if (i === -1) return fallback;
	return argv.splice(i, 2)[1];
};
const model = opt(
	"--model",
	process.env.OLLAMA_MODEL ?? "deepseek-v4-flash:cloud",
);
const speakersArg = opt("--speakers", null);
const audioArg = opt("--audio", null);
const transcriptArg = opt("--transcript", null);
const number = Number(argv[0]);
if (!number) {
	console.error(
		"Usage: bun scripts/build-episode.mjs <episode-number> [--transcript path] [--audio path] [--speakers 0=michiru,1=upamune] [--model name]",
	);
	process.exit(1);
}

const FPS = 15;
const MAX_LINE_CHARS = 22;
const MAX_LINES_PER_PAGE = 2;
const HOLD_SEC = 1.5;
const BATCH = 30;
const CONTEXT = 3;
const CONCURRENCY = 4;
const OLLAMA = process.env.OLLAMA_HOST ?? "http://localhost:11434";

const episodes = JSON.parse(
	fs.readFileSync(path.join(root, "src/data/episodes.json"), "utf8"),
);
const episode = episodes.find((e) => e.number === number);
if (!episode) throw new Error(`episode #${number} not found in episodes.json`);

const transcriptPath =
	transcriptArg ?? path.join(videoDir, "transcripts", `ep-${number}.json`);
const proofreadPath = transcriptPath.replace(/\.json$/, ".proofread.json");
const transcript = JSON.parse(fs.readFileSync(transcriptPath, "utf8"));
const segments = transcript.segments.filter((s) => s.words?.length);

// ---------- 1. 校正（Ollama） ----------

const GLOSSARY = `番組: マヂカル.fm（関西人のPodcast。話者は michiru_da(みちるだ, PM) と upamune(うぱみゅん, エンジニア)。互いを「みちるさん」「うぱさん」と呼ぶ）
番組表記: 「マヂカル.fm」（マジカルFM は誤り）、「うぱみゅん」（ウパミン/うぱむね は誤り）、オープニングの決まり文句は「関西人のプロダクトマネージャーみちるだと、関西人(?)のソフトウェアエンジニアのうぱみゅんが週2で配信する雑談ポッドキャスト」
よくある誤認識: やっぱさん/うばさん→うぱさん、硬くなに→頑なに、本の→ほんまに、プラ1→+1、分振り/文振り→文フリ（文学フリマ）
番組固有の用語: マヂカル.fm, Slack, Podcast, LISTEN, 文フリ`;

// LLM の校正後に必ず適用する固定置換（表記ゆれを確実に潰す）。「|」区切りを跨いでもマッチする
const REPLACEMENTS = [
	["マジカルFM", "マヂカル.fm"],
	["マジカルfm", "マヂカル.fm"],
	["マジカル.fm", "マヂカル.fm"],
	["関西人格好。", "関西人(?)の"],
	["関西人格好", "関西人(?)"],
	["ハテナの", ""],
	["ウパミン", "うぱみゅん"],
	["うぱみん", "うぱみゅん"],
	["うぱむね", "うぱみゅん"],
	["2026様", "2026 Summer"],
	["分振り", "文フリ"],
	["文振り", "文フリ"],
];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const applyReplacements = (text) => {
	let out = text;
	for (const [from, to] of REPLACEMENTS) {
		const re = new RegExp([...from].map(escapeRe).join("\\|?"), "g");
		out = out.replace(re, to);
	}
	return out.replace(/\|\|+/g, "|").replace(/^\||\|$/g, "");
};

const topicLine = (episode.description ?? "")
	.replace(/<[^>]+>/g, "\n")
	.split("\n")
	.map((l) => l.trim())
	.find((l) => l.split("/").length >= 4);

const SYSTEM = `あなたは日本語Podcastの文字起こしを字幕用に校正する編集者です。
${GLOSSARY}
この回のトピック: ${topicLine ?? "（不明）"}

各 segment の text を次の方針で直し、JSON で返してください:
- 音声認識の誤変換を文脈から修正する（固有名詞・同音異義語・数字表記）
- 関西弁などの話し言葉はそのまま残す。要約・言い換え・語順変更はしない
- 句読点（、。）と疑問符を補い、引用や作品名は「」で括る
- 文字数はできるだけ元と同じにする（削除・追加は最小限）
- 字幕のハイライト単位として、1〜7文字の自然な語区切りに「|」を挿入する。句読点は直前の語に付ける
- context の segment は前後関係の参考用。返すのは targets のみ

出力形式: {"segments":[{"id":<number>,"text":"<校正済みテキスト（|区切り）>"}]}`;

const chatJson = async (messages) => {
	const res = await fetch(`${OLLAMA}/api/chat`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			model,
			stream: false,
			think: false,
			format: "json",
			options: { temperature: 0.2, num_ctx: 16384 },
			messages,
		}),
	});
	if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
	const json = await res.json();
	const content = json.message?.content ?? "";
	const parsed = JSON.parse(content);
	return Array.isArray(parsed)
		? parsed
		: (parsed.segments ?? parsed.targets ?? []);
};

const proofread = fs.existsSync(proofreadPath)
	? JSON.parse(fs.readFileSync(proofreadPath, "utf8"))
	: {};
const saveProofread = () =>
	fs.writeFileSync(proofreadPath, `${JSON.stringify(proofread, null, "\t")}\n`);

const pending = segments.filter((s) => !proofread[s.id]);
console.error(
	`#${number}: ${segments.length} segments, ${pending.length} to proofread with ${model}`,
);

const batches = [];
for (let i = 0; i < pending.length; i += BATCH) {
	const targets = pending.slice(i, i + BATCH);
	const firstIdx = segments.findIndex((s) => s.id === targets[0].id);
	const lastIdx = segments.findIndex((s) => s.id === targets.at(-1).id);
	const context = [
		...segments.slice(Math.max(0, firstIdx - CONTEXT), firstIdx),
		...segments.slice(lastIdx + 1, lastIdx + 1 + CONTEXT),
	];
	batches.push({ targets, context });
}

const proofreadBatch = async ({ targets, context }, attempt = 0) => {
	const payload = {
		context: context.map((s) => ({
			id: s.id,
			speaker: s.speaker,
			text: s.text,
		})),
		targets: targets.map((s) => ({
			id: s.id,
			speaker: s.speaker,
			text: s.text,
		})),
	};
	try {
		const result = await chatJson([
			{ role: "system", content: SYSTEM },
			{ role: "user", content: JSON.stringify(payload) },
		]);
		const byId = new Map(result.map((r) => [Number(r.id), r.text]));
		for (const s of targets) {
			const text = byId.get(s.id);
			if (typeof text !== "string" || !text.replace(/\|/g, "").trim()) {
				throw new Error(`segment ${s.id} missing in response`);
			}
			proofread[s.id] = text;
		}
	} catch (err) {
		if (attempt >= 2) {
			console.error(
				`  giving up on batch starting ${targets[0].id}: ${err.message}`,
			);
			for (const s of targets) proofread[s.id] ??= s.text;
			return;
		}
		console.error(`  retry ${attempt + 1}: ${err.message}`);
		await proofreadBatch({ targets, context }, attempt + 1);
	}
};

let done = 0;
const queue = [...batches];
await Promise.all(
	Array.from({ length: CONCURRENCY }, async () => {
		for (;;) {
			const batch = queue.shift();
			if (!batch) return;
			await proofreadBatch(batch);
			done += 1;
			saveProofread();
			console.error(`  proofread ${done}/${batches.length}`);
		}
	}),
);

// ---------- 2. 話者の対応付け ----------

const speakerIds = [
	...new Set(segments.map((s) => s.speaker).filter((s) => s != null)),
];
let speakerMap = {};
if (speakersArg) {
	for (const pair of speakersArg.split(",")) {
		const [id, name] = pair.split("=");
		speakerMap[id] = name;
	}
} else if (speakerIds.length >= 2) {
	const sample = segments
		.filter((s) => s.speaker != null)
		.slice(0, 60)
		.map((s) => `[${s.speaker}] ${s.text}`)
		.join("\n");
	const result = await (async () => {
		const res = await fetch(`${OLLAMA}/api/chat`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model,
				stream: false,
				think: false,
				format: "json",
				options: { temperature: 0 },
				messages: [
					{
						role: "system",
						content: `${GLOSSARY}\n以下は話者ラベル付きの冒頭の文字起こし。どのラベルが michiru で、どのラベルが upamune かを判定してください。手がかり: 相手を「うぱさん」と呼ぶ側が michiru、「みちるさん」と呼ぶ側が upamune。\n出力形式: {"michiru":"<ラベル>","upamune":"<ラベル>"}`,
					},
					{ role: "user", content: sample },
				],
			}),
		});
		return JSON.parse((await res.json()).message.content);
	})();
	speakerMap = { [result.michiru]: "michiru", [result.upamune]: "upamune" };
	console.error(
		`speakers: ${JSON.stringify(speakerMap)} (auto; override with --speakers)`,
	);
}

// ---------- 3. ページ化 ----------

const round = (t) => Math.round(t * 1000) / 1000;

// 校正後テキストの文字位置を、元の単語タイムスタンプへ比例配分で写像する
const timeline = (seg) => {
	const chars = [];
	for (const w of seg.words) {
		const n = Math.max(1, w.word.length);
		for (let i = 0; i < n; i++) {
			chars.push({
				start: w.start + ((w.end - w.start) * i) / n,
				end: w.start + ((w.end - w.start) * (i + 1)) / n,
			});
		}
	}
	return chars;
};

// LLM の区切りは形態素単位に細かくなりがちなので、短い語は前の語にくっつけて 3〜7文字にならす
const MIN_CHUNK = 3;
const MAX_CHUNK = 7;
const mergeShort = (parts) => {
	const out = [];
	for (const p of parts) {
		const prev = out.at(-1);
		if (
			prev &&
			(prev.length < MIN_CHUNK || p.length < MIN_CHUNK) &&
			prev.length + p.length <= MAX_CHUNK
		) {
			out[out.length - 1] = prev + p;
		} else {
			out.push(p);
		}
	}
	return out;
};

const chunksOf = (seg) => {
	const text = applyReplacements(proofread[seg.id] ?? seg.text);
	const parts = mergeShort(
		text
			.split("|")
			.map((p) => p.trim())
			.filter(Boolean),
	);
	const plain = parts.join("");
	const tl = timeline(seg);
	const scale = tl.length / Math.max(1, plain.length);
	const chunks = [];
	let pos = 0;
	for (const part of parts) {
		const from = Math.min(tl.length - 1, Math.floor(pos * scale));
		const to = Math.min(
			tl.length - 1,
			Math.max(from, Math.ceil((pos + part.length) * scale) - 1),
		);
		chunks.push({
			text: part,
			start: round(tl[from].start),
			end: round(tl[to].end),
		});
		pos += part.length;
	}
	return chunks;
};

const splitLong = (chunk) => {
	if (chunk.text.length <= MAX_LINE_CHARS) return [chunk];
	const out = [];
	const n = Math.ceil(chunk.text.length / MAX_LINE_CHARS);
	const dur = (chunk.end - chunk.start) / n;
	for (let i = 0; i < n; i++) {
		out.push({
			text: chunk.text.slice(i * MAX_LINE_CHARS, (i + 1) * MAX_LINE_CHARS),
			start: round(chunk.start + dur * i),
			end: round(chunk.start + dur * (i + 1)),
		});
	}
	return out;
};

const pages = [];
for (const seg of segments) {
	const chunks = chunksOf(seg).flatMap(splitLong);
	const speaker = speakerMap[seg.speaker];
	const lines = [];
	let line = [];
	let len = 0;
	for (const c of chunks) {
		if (len + c.text.length > MAX_LINE_CHARS && line.length) {
			lines.push(line);
			line = [];
			len = 0;
		}
		line.push(c);
		len += c.text.length;
	}
	if (line.length) lines.push(line);
	for (let i = 0; i < lines.length; i += MAX_LINES_PER_PAGE) {
		const pageLines = lines.slice(i, i + MAX_LINES_PER_PAGE);
		pages.push({
			start: pageLines[0][0].start,
			end: pageLines.at(-1).at(-1).end,
			...(speaker && { speaker }),
			lines: pageLines,
		});
	}
}
for (let i = 0; i < pages.length; i++) {
	const next = pages[i + 1];
	const hold = round(pages[i].end + HOLD_SEC);
	pages[i].end = next ? Math.min(hold, next.start) : hold;
	if (pages[i].end <= pages[i].start)
		pages[i].end = round(pages[i].start + 0.2);
}

// ---------- 4. 音声とエンベロープ ----------

const audioPath =
	audioArg ?? path.join(videoDir, "transcripts", `ep-${number}.mp3`);
if (!fs.existsSync(audioPath)) {
	console.error(`downloading ${episode.audioUrl} -> ${audioPath}`);
	const res = await fetch(episode.audioUrl);
	fs.writeFileSync(audioPath, Buffer.from(await res.arrayBuffer()));
}
const outAudio = path.join(videoDir, "public", "episode.mp3");
fs.copyFileSync(audioPath, outAudio);

const durationSec = Number(
	execFileSync("ffprobe", [
		"-v",
		"error",
		"-show_entries",
		"format=duration",
		"-of",
		"csv=p=0",
		outAudio,
	])
		.toString()
		.trim(),
);

// 1フレームあたりの RMS（0〜1）。8kHz mono の PCM を読んで計算する
const SR = 8000;
const pcm = execFileSync(
	"ffmpeg",
	[
		"-v",
		"error",
		"-i",
		outAudio,
		"-ac",
		"1",
		"-ar",
		String(SR),
		"-f",
		"s16le",
		"-",
	],
	{ maxBuffer: 1 << 30 },
);
const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
const perFrame = SR / FPS;
const totalFrames = Math.ceil(durationSec * FPS);
const envelope = new Array(totalFrames);
let peak = 0;
for (let f = 0; f < totalFrames; f++) {
	const from = Math.floor(f * perFrame);
	const to = Math.min(samples.length, Math.floor((f + 1) * perFrame));
	let sum = 0;
	for (let i = from; i < to; i++) sum += samples[i] * samples[i];
	const rms = Math.sqrt(sum / Math.max(1, to - from)) / 32768;
	envelope[f] = rms;
	peak = Math.max(peak, rms);
}
for (let f = 0; f < totalFrames; f++) {
	envelope[f] = Math.round((envelope[f] / (peak || 1)) * 1000) / 1000;
}

// ---------- 5. 出力 ----------

const displayTitle = episode.title.replace(/^#\d+:\s*/, "");
const mainTitle = displayTitle.split(/\s*[~〜]\s*/)[0].trim();
const bgs = ["lilac", "lime", "sky", "candy"];

const data = {
	episode: {
		number,
		title: displayTitle,
		titleLines: wrapTitle(mainTitle, 11),
		date: episode.pubDate,
	},
	audioFile: "episode.mp3",
	durationSec: round(durationSec),
	fps: FPS,
	bg: bgs[number % 4],
	envelope,
	pages,
};

function wrapTitle(text, max) {
	const lines = [];
	for (let i = 0; i < text.length; i += max) lines.push(text.slice(i, i + max));
	return lines.slice(0, 3);
}

const dataPath = path.join(videoDir, "src", "data", "episode.json");
fs.writeFileSync(dataPath, JSON.stringify({ data }));
console.error(
	`wrote ${dataPath} (${pages.length} pages, ${Math.round(durationSec / 60)} min) and ${outAudio}`,
);
console.error(`render: bun scripts/render-episode.mjs ${number}`);
