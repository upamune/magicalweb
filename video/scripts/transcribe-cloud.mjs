import fs from "node:fs";

// クラウドの文字起こしAPI（ElevenLabs Scribe v2 / AssemblyAI Universal-3.5 Pro）で
// 単語タイムスタンプ + 話者分離付きの文字起こしを行い、2つのファイルを書く:
//   <out.json>          mlx-whisper 互換（segments[].words[]）。find-highlights / プラン作成に使う
//   <out>.speakers.json fetch-listen-transcript.mjs 互換 [{start,end,speaker,text}]。話者割り当てに使う
//
//   bun scripts/transcribe-cloud.mjs elevenlabs|assemblyai <audio-url> <out.json>
//
// 要 ELEVENLABS_API_KEY / ASSEMBLYAI_API_KEY（video/.env でも可）

const argv = process.argv.slice(2);
const keytermsIdx = argv.indexOf("--keyterms");
const extraKeyterms =
	keytermsIdx !== -1 ? argv.splice(keytermsIdx, 2)[1].split(/[,/]/) : [];
const [vendor, audioUrl, outPath] = argv;
if (!["elevenlabs", "assemblyai"].includes(vendor) || !audioUrl || !outPath) {
	console.error(
		'Usage: bun scripts/transcribe-cloud.mjs elevenlabs|assemblyai <audio-url> <out.json> [--keyterms "a,b,c"]',
	);
	process.exit(1);
}

// 番組固有の用語。エピソード固有の用語は --keyterms で足す（説明文の「/」区切りトピック等）
const KEYTERMS = [
	...new Set(
		[
			"マヂカル.fm",
			"upamune",
			"うぱむね",
			"michiru_da",
			"みちるだ",
			"関西人",
			"プロダクトマネージャー",
			"ソフトウェアエンジニア",
			...extraKeyterms,
		]
			.map((s) => s.trim())
			.filter((s) => s && s.length <= 50),
	),
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (t) => Math.round(t * 1000) / 1000;

// 共通の中間形式: words = [{ word, start, end, speaker }], events = [{ label, start, end }]
const fromElevenLabs = async () => {
	const key = process.env.ELEVENLABS_API_KEY;
	if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
	const form = new FormData();
	form.append("model_id", "scribe_v2");
	form.append("source_url", audioUrl);
	form.append("language_code", "ja");
	form.append("diarize", "true");
	form.append("num_speakers", "2");
	form.append("timestamps_granularity", "word");
	form.append("tag_audio_events", "true");
	for (const k of KEYTERMS) form.append("keyterms", k);

	const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
		method: "POST",
		headers: { "xi-api-key": key },
		body: form,
	});
	if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
	const json = await res.json();

	const words = [];
	const events = [];
	for (const w of json.words ?? []) {
		if (w.type === "spacing") continue;
		if (w.type === "audio_event") {
			events.push({ label: w.text, start: round(w.start), end: round(w.end) });
			continue;
		}
		words.push({
			word: w.text,
			start: round(w.start),
			end: round(w.end),
			speaker: w.speaker_id ?? null,
		});
	}
	return { words, events, raw: json };
};

const fromAssemblyAI = async () => {
	const key = process.env.ASSEMBLYAI_API_KEY;
	if (!key) throw new Error("ASSEMBLYAI_API_KEY is not set");
	const headers = { authorization: key, "content-type": "application/json" };
	const submit = await fetch("https://api.assemblyai.com/v2/transcript", {
		method: "POST",
		headers,
		body: JSON.stringify({
			audio_url: audioUrl,
			speech_models: ["universal-3-5-pro"],
			language_code: "ja",
			speaker_labels: true,
			speakers_expected: 2,
			keyterms_prompt: KEYTERMS,
		}),
	});
	if (!submit.ok)
		throw new Error(`AssemblyAI ${submit.status}: ${await submit.text()}`);
	const { id } = await submit.json();

	let json;
	for (;;) {
		await sleep(5000);
		const res = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
			headers,
		});
		json = await res.json();
		if (json.status === "completed") break;
		if (json.status === "error")
			throw new Error(`AssemblyAI error: ${json.error}`);
		console.error(`  ${json.status} ...`);
	}

	const words = (json.words ?? []).map((w) => ({
		word: w.text,
		start: round(w.start / 1000),
		end: round(w.end / 1000),
		speaker: w.speaker ?? null,
	}));
	return { words, events: [], raw: json };
};

// 話者の切り替わり・0.7秒以上の間・文末記号でセグメントを切る
const buildSegments = (words) => {
	const segments = [];
	let cur = null;
	for (const w of words) {
		const breakHere =
			!cur ||
			w.speaker !== cur.speaker ||
			w.start - cur.end > 0.7 ||
			/[。！？!?]$/.test(cur.words.at(-1).word);
		if (breakHere) {
			cur = { start: w.start, end: w.end, speaker: w.speaker, words: [] };
			segments.push(cur);
		}
		cur.words.push({ word: w.word, start: w.start, end: w.end });
		cur.end = w.end;
	}
	return segments.map((s, id) => ({
		id,
		start: s.start,
		end: s.end,
		text: s.words.map((w) => w.word).join(""),
		speaker: s.speaker,
		words: s.words,
	}));
};

console.error(`transcribing with ${vendor} ...`);
const started = Date.now();
const { words, events, raw } = await (vendor === "elevenlabs"
	? fromElevenLabs()
	: fromAssemblyAI());
const segments = buildSegments(words);

const speakerIds = [...new Set(words.map((w) => w.speaker).filter(Boolean))];
const speakerIndex = (s) => speakerIds.indexOf(s);
const speakers = segments
	.filter((s) => s.speaker)
	.map((s, index) => ({
		index,
		start: s.start,
		end: s.end,
		speaker: speakerIndex(s.speaker),
		text: s.text,
	}));

fs.writeFileSync(
	outPath,
	JSON.stringify(
		{
			language: "ja",
			vendor,
			text: segments.map((s) => s.text).join(""),
			segments,
			events,
		},
		null,
		2,
	),
);
const speakersPath = outPath.replace(/\.json$/, ".speakers.json");
fs.writeFileSync(speakersPath, JSON.stringify(speakers, null, 2));
fs.writeFileSync(
	outPath.replace(/\.json$/, ".raw.json"),
	JSON.stringify(raw, null, 2),
);

console.error(
	`wrote ${outPath} (${segments.length} segments, ${words.length} words, ${events.length} audio events, ${speakerIds.length} speakers) in ${Math.round((Date.now() - started) / 1000)}s`,
);
