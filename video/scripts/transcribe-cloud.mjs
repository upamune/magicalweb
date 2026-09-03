import { execFileSync } from "node:child_process";
import fs from "node:fs";

// クラウドの文字起こしAPI（ElevenLabs Scribe v2 / AssemblyAI Universal-3.5 Pro / Soniox stt-async-v5）で
// 単語タイムスタンプ + 話者分離付きの文字起こしを行い、2つのファイルを書く:
//   <out.json>          mlx-whisper 互換（segments[].words[]）。find-highlights / プラン作成に使う
//   <out>.speakers.json fetch-listen-transcript.mjs 互換 [{start,end,speaker,text}]。話者割り当てに使う
//
//   bun scripts/transcribe-cloud.mjs elevenlabs|assemblyai|soniox <audio-url> <out.json> [--keyterms "a,b,c"] [--from-raw <raw.json>]
//
// --from-raw を渡すと API を呼ばず、保存済みの <out>.raw.json から segments を再生成する
// 要 ELEVENLABS_API_KEY / ASSEMBLYAI_API_KEY / SONIOX_API_KEY（video/.env でも可）
//
// 出力の audioDuration は文字起こし時点の音声の長さ（ffprobe）。LISTEN の CDN は公開後に
// 音声を差し替えることがあり（#279 は 2557.0s → 2559.5s に伸びた）、古い文字起こしと
// 新しい音声を組み合わせると字幕が終盤で数秒ずれる。build-clip / build-episode はこの値と
// 手元の音声の長さを突き合わせて食い違いを検出する

const argv = process.argv.slice(2);
const takeOption = (flag) => {
	const i = argv.indexOf(flag);
	return i === -1 ? null : argv.splice(i, 2)[1];
};
const extraKeyterms = takeOption("--keyterms")?.split(/[,/]/) ?? [];
const rawPath = takeOption("--from-raw");
const [vendor, audioUrl, outPath] = argv;
const VENDORS = ["elevenlabs", "assemblyai", "soniox"];
if (!VENDORS.includes(vendor) || !audioUrl || !outPath) {
	console.error(
		`Usage: bun scripts/transcribe-cloud.mjs ${VENDORS.join("|")} <audio-url> <out.json> [--keyterms "a,b,c"] [--from-raw <raw.json>]`,
	);
	process.exit(1);
}

// 番組固有の用語。エピソード固有の用語は --keyterms で足す（説明文の「/」区切りトピック等）
// ホスト名は字幕の表記（うぱみゅん / みちるだ）で渡す。ID（upamune / michiru_da）を渡すと
// ElevenLabs はそのまま英字で書き起こしてしまう
const KEYTERMS = [
	...new Set(
		[
			"マヂカル.fm",
			"うぱみゅん",
			"うぱさん",
			"みちるだ",
			"みちるさん",
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

// URL でもローカルファイルでも ffprobe でヘッダから長さを読む（取れなければ null）
const probeDuration = (source) => {
	try {
		const out = execFileSync(
			"ffprobe",
			[
				"-v",
				"error",
				"-show_entries",
				"format=duration",
				"-of",
				"csv=p=0",
				source,
			],
			{ encoding: "utf8", timeout: 60_000 },
		);
		const sec = Number.parseFloat(out);
		return Number.isFinite(sec) ? round(sec) : null;
	} catch {
		return null;
	}
};

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
	return res.json();
};

const parseElevenLabs = (json) => {
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
	return { words, events };
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
	return json;
};

const parseAssemblyAI = (json) => {
	const words = (json.words ?? []).map((w) => ({
		word: w.text,
		start: round(w.start / 1000),
		end: round(w.end / 1000),
		speaker: w.speaker ?? null,
	}));
	return { words, events: [] };
};

// Soniox はトークン単位（サブワードに割れることがある）。話者は整数ラベルで返る
const fromSoniox = async () => {
	const key = process.env.SONIOX_API_KEY;
	if (!key) throw new Error("SONIOX_API_KEY is not set");
	const headers = {
		authorization: `Bearer ${key}`,
		"content-type": "application/json",
	};
	const submit = await fetch("https://api.soniox.com/v1/transcriptions", {
		method: "POST",
		headers,
		body: JSON.stringify({
			model: "stt-async-v5",
			audio_url: audioUrl,
			language_hints: ["ja"],
			enable_speaker_diarization: true,
			context: {
				text: "関西人二人のソフトウェアエンジニアとプロダクトマネージャーによる雑談ポッドキャスト「マヂカル.fm」",
				terms: KEYTERMS,
			},
		}),
	});
	if (!submit.ok)
		throw new Error(`Soniox ${submit.status}: ${await submit.text()}`);
	const { id } = await submit.json();

	for (;;) {
		await sleep(5000);
		const res = await fetch(`https://api.soniox.com/v1/transcriptions/${id}`, {
			headers,
		});
		const status = await res.json();
		if (status.status === "completed") break;
		if (status.status === "error")
			throw new Error(`Soniox error: ${status.error_message}`);
		console.error(`  ${status.status} ...`);
	}
	// 結果の配信が数KB/sまで落ちて途中で切れることがあるので、取得だけ数回やり直す
	let lastError;
	for (let attempt = 1; attempt <= 5; attempt++) {
		try {
			const res = await fetch(
				`https://api.soniox.com/v1/transcriptions/${id}/transcript`,
				{ headers, signal: AbortSignal.timeout(15 * 60 * 1000) },
			);
			if (!res.ok) throw new Error(`Soniox ${res.status}: ${await res.text()}`);
			return await res.json();
		} catch (err) {
			lastError = err;
			console.error(`  transcript fetch failed (${attempt}/5): ${err.message}`);
			await sleep(5000);
		}
	}
	throw lastError;
};

const parseSoniox = (json) => {
	const words = (json.tokens ?? [])
		.filter((t) => t.text?.trim())
		.map((t) => ({
			word: t.text,
			start: round(t.start_ms / 1000),
			end: round(t.end_ms / 1000),
			speaker: t.speaker == null ? null : String(t.speaker),
		}));
	return { words, events: [] };
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
// --from-raw のときは <audio-url> に元の URL かローカルの音声ファイルを渡せば長さを記録できる
const audioDuration =
	audioUrl.startsWith("http") || fs.existsSync(audioUrl)
		? probeDuration(audioUrl)
		: null;
const raw = rawPath
	? JSON.parse(fs.readFileSync(rawPath, "utf8"))
	: await {
			elevenlabs: fromElevenLabs,
			assemblyai: fromAssemblyAI,
			soniox: fromSoniox,
		}[vendor]();
const { words, events } = {
	elevenlabs: parseElevenLabs,
	assemblyai: parseAssemblyAI,
	soniox: parseSoniox,
}[vendor](raw);
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
			audioUrl: audioUrl.startsWith("http") ? audioUrl : null,
			audioDuration,
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
