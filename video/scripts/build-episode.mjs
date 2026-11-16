import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadDefaultJapaneseParser } from "budoux";

// フル尺のビデオポッドキャスト（横1920×1080）用データを生成する
//
//   bun scripts/build-episode.mjs 278 [--transcript transcripts/ep-278.json] [--audio ep.mp3] [--keep-silence]
//                                     [--speakers 0=michiru,1=upamune] [--model deepseek-v4.1-flash:cloud]
//
// 1. transcripts/ep-N.json（transcribe-cloud.mjs 形式）を読む
// 2. Ollama（既定: deepseek-v4.1-flash:cloud）で誤認識を校正し、語区切り「|」を入れてもらう
//    結果は transcripts/ep-N.proofread.json にキャッシュし、再実行時は未校正分だけ問い合わせる
// 3. 横画面向けに自動ページ化して src/data/episode.json に出力
// 4. 音声を public/episode.mp3 に置き、波形用の RMS エンベロープを埋め込む
//    既定で無音区間（-28dB・1.2秒以上）を前後0.2秒残して削除し、字幕の時刻も詰める（--keep-silence で無効）

const parser = loadDefaultJapaneseParser();
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
	process.env.OLLAMA_MODEL ?? "deepseek-v4.1-flash:cloud",
);
const speakersArg = opt("--speakers", null);
const audioArg = opt("--audio", null);
const transcriptArg = opt("--transcript", null);
const episodeMetaArg = opt("--episode-meta", null);
// ゲスト回: --guest 黄身子:guest-kimiko.png と --speakers <ID>=guest で、画面の左のアバターと字幕色をゲストにする
const [guestName, guestAvatar] = opt("--guest", "").split(":");
const noProofread = argv.includes("--no-proofread");
if (noProofread) argv.splice(argv.indexOf("--no-proofread"), 1);
const keepSilence = argv.includes("--keep-silence");
if (keepSilence) argv.splice(argv.indexOf("--keep-silence"), 1);
const SILENCE_DB = Number(opt("--silence-db", -28));
const SILENCE_MIN_SEC = Number(opt("--silence-min", 1.2));
const SILENCE_PAD_SEC = Number(opt("--silence-pad", 0.2));
if (audioArg && !fs.existsSync(audioArg))
	throw new Error(`Master audio not found: ${audioArg}`);
const number = Number(argv[0]);
if (!number) {
	console.error(
		"Usage: bun scripts/build-episode.mjs <episode-number> [--transcript path] [--audio path] [--speakers 0=michiru,1=upamune] [--model name]",
	);
	process.exit(1);
}

const FPS = 24;
const MAX_LINE_CHARS = 22;
const MAX_LINES_PER_PAGE = 2;
const HOLD_SEC = 1.5;
const BATCH = 30;
const CONTEXT = 3;
const CONCURRENCY = 4;
const OLLAMA = process.env.OLLAMA_HOST ?? "http://localhost:11434";

const episode = episodeMetaArg
	? JSON.parse(fs.readFileSync(episodeMetaArg, "utf8"))
	: JSON.parse(
			fs.readFileSync(path.join(root, "src/data/episodes.json"), "utf8"),
		).find((e) => e.number === number);
if (
	episode &&
	(episode.number !== number ||
		typeof episode.title !== "string" ||
		typeof episode.pubDate !== "string")
) {
	throw new Error(
		"Episode metadata must contain the matching number, title and pubDate",
	);
}
if (!episode) throw new Error(`episode #${number} not found in episodes.json`);

const transcriptPath =
	transcriptArg ?? path.join(videoDir, "transcripts", `ep-${number}.json`);
const proofreadPath = transcriptPath.replace(/\.json$/, ".proofread.json");
const transcript = JSON.parse(fs.readFileSync(transcriptPath, "utf8"));
const segments = transcript.segments.filter((s) => s.words?.length);

// ---------- 0. 無音区間の削除（Logic Pro の「無音部分を削除」相当） ----------
// しきい値・最短無音・前後の余白は Logic の設定（-28dB / 1.2秒 / 0.2秒）に合わせる。
// 音声を切ったぶん、字幕の時刻も詰める

const sourceAudioPath =
	audioArg ?? path.join(videoDir, "transcripts", `ep-${number}.mp3`);

const detectSilences = (file) => {
	const res = spawnSync(
		"ffmpeg",
		[
			"-hide_banner",
			"-nostats",
			"-i",
			file,
			"-af",
			`silencedetect=n=${SILENCE_DB}dB:d=${SILENCE_MIN_SEC}`,
			"-f",
			"null",
			"-",
		],
		{ encoding: "utf8", maxBuffer: 1 << 28 },
	);
	const out = [];
	let start = null;
	for (const line of res.stderr.split("\n")) {
		const a = line.match(/silence_start: (-?[\d.]+)/);
		if (a) start = Math.max(0, Number(a[1]));
		const b = line.match(/silence_end: ([\d.]+)/);
		if (b && start != null) {
			out.push([start, Number(b[1])]);
			start = null;
		}
	}
	return out;
};

let cuts = [];
if (!keepSilence && fs.existsSync(sourceAudioPath)) {
	cuts = detectSilences(sourceAudioPath)
		.map(([a, b]) => [a + SILENCE_PAD_SEC, b - SILENCE_PAD_SEC])
		.filter(([a, b]) => b - a > 0.05);
	const removed = cuts.reduce((sum, [a, b]) => sum + (b - a), 0);
	console.error(
		`silence: ${cuts.length} cuts, -${removed.toFixed(1)}s (${SILENCE_DB}dB / ${SILENCE_MIN_SEC}s / pad ${SILENCE_PAD_SEC}s)`,
	);
}

const shiftTime = (t) => {
	let removed = 0;
	for (const [a, b] of cuts) {
		if (t >= b) removed += b - a;
		else if (t > a) return a - removed;
		else break;
	}
	return t - removed;
};
if (cuts.length) {
	for (const seg of segments) {
		seg.start = shiftTime(seg.start);
		seg.end = shiftTime(seg.end);
		for (const w of seg.words) {
			w.start = shiftTime(w.start);
			w.end = shiftTime(w.end);
		}
	}
}

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
	["みちるだと、関西人。", "みちるだと、関西人"],
	["過去、ハテナ。", "(?)の"],
	["関西人格好。", "関西人(?)の"],
	["関西人格好", "関西人(?)"],
	["関西人。カッコ。ハテナ。", "関西人(?)の"],
	["カッコ。", ""],
	["ハテナ。", ""],
	["ハテナの", ""],
	["チーカワ", "ちいかわ"],
	["チイカワ", "ちいかわ"],
	["ちいかわリングの島の秘密", "ちいかわ リング島の秘密"],
	["デカツヨ", "でかつよ"],
	["デカ強", "でかつよ"],
	["ウサギ", "うさぎ"],
	["イラストレーター中野", "イラストレーターナガノ"],
	["長野先生", "ナガノ先生"],
	["長野さん", "ナガノさん"],
	["ウパミン", "うぱみゅん"],
	["うぱみん", "うぱみゅん"],
	["うぱむね", "うぱみゅん"],
	["うぱむん", "うぱみゅん"],
	["ぱむゆん", "うぱみゅん"],
	["upamune", "うぱみゅん"],
	["michiru_da", "みちるだ"],
	["括弧ハテナの", "(?)の"],
	["括弧はてなの", "(?)の"],
	["ウパさん", "うぱさん"],
	["おばさん", "うぱさん"],
	["お父さん", "うぱさん"],
	["水さん", "みちるさん"],
	["道尾さん", "みちるさん"],
	["道場さん", "みちるさん"],
	["道枝", "みちる"],
	["ミチャさん", "みちるさん"],
	["三浦さん", "みちるさん"],
	["パさん", "うぱさん"],
	["チカワ", "ちいかわ"],
	["リセンさん", "リスナーさん"],
	["君子", "黄身子"],
	["みずさん", "みちるさん"],
	["2026様", "2026 Summer"],
	["習い事2026月", "習い事2026夏"],
	["分振り", "文フリ"],
	["ミチルダ", "みちるだ"],
	["みちおさん", "みちるさん"],
	["みちよさん", "みちるさん"],
	["散在させる", "散財させる"],
	["納款", "納得"],
	["批判されてる楽譜", "市販されてる楽譜"],
	["マウントが二個増えた", "バンドが二個増えた"],
	["クロード", "Claude"],
	["ブルートゥース", "Bluetooth"],
	["概要欄のテレフォン", "概要欄のおたよりフォーム"],
	["カシオトーン、CTS二百", "カシオトーン CT-S200"],
	["CTS二百", "CT-S200"],
	["CK八十八", "CK88"],
	["CK六十一", "CK61"],
	["六十一鍵", "61鍵"],
	["八十八", "88"],
	["六十一", "61"],
	["ミューズスコア", "MuseScore"],
	["コーディファイバー", "Chordify"],
	["コーディファイ", "Chordify"],
	["コードファイ", "Chordify"],
	["クラングドットアイオー", "Klang.io"],
	["クラングドットIO", "Klang.io"],
	["モゼモイジーズ", "Moises"],
	["モイモイジーズ", "Moises"],
	["モイジーズ", "Moises"],
	["モイセス", "Moises"],
	["モーゼズ", "Moises"],
	["モーゼス", "Moises"],
	["モーセス", "Moises"],
	["モーテス", "Moises"],
	["モゼズ", "Moises"],
	["もうゼズが", "もうMoisesが"],
	["そこ満体をボティファイト怒られちゃう", "その曲全体をSpotifyに怒られちゃう"],
	["ボティファイ", "Spotify"],
	["スコードに入って", "Discordに入って"],
	["マジでユースだな", "マジで憂鬱だな"],
	["音楽パッシボンの人", "音楽が本職の人"],
	["え、エロちゃんと", "え、ちゃんと"],
	["ライブで使うウェルキーボード", "ライブで使うキーボード"],
	["石原君のオリジナルソングの", "一緒に組んどる"],
	["文振り", "文フリ"],
	["ゲズ書店", "技術書典"],
	["はちわれ", "ハチワレ"],
	["アセンブリAI", "AssemblyAI"],
	["この村上さんは", "この村山さんは"],
	["Listen", "LISTEN"],
	["AppleMusic", "Apple Music"],
	["ApplePodcast", "Apple Podcast"],
	["YouTubeMusic", "YouTube Music"],
	["若い彼氏の頃の思いね", "若かりし頃の思い出ね"],
	["#マヂカルFM、全部小文字", "#magicalfm"],
	["#マヂカル.fm、全部小文字", "#magicalfm"],
	["ハッシュタグマヂカル.fm全部小文字", "ハッシュタグ #magicalfm"],
	["ハッシュタグマヂカル.fm全小文字", "#magicalfm"],
	["概要欄のというフォーム", "概要欄のおたよりフォーム"],
	["みちるさんにせいせいされた", "みちるさんに制止された"],
	["茗荷谷スマ区", "名谷、須磨区"],
	["スマなんだ", "須磨なんだ"],
	["茗荷谷", "名谷"],
	["並んだ時は組ぐらい", "並んだ時は6組ぐらい"],
	["時回転で時分ぐらい", "10時開店で10時10分ぐらい"],
	["一人当たり分ぐらい", "一人当たり4分ぐらい"],
	["組並んでたら分ぐらい", "10組並んでたら40分ぐらい"],
	["私も分弱ぐらい", "私も30分弱ぐらい"],
	["三宮つあるやん", "三宮3つあるやん"],
	[
		"三宮ってつのカタカナのノみたいなやつと、あとミヤですね",
		"三宮って3つ、カタカナのノみたいなやつと、あと三宮ですね",
	],
	["1ヶ月に回しかない", "1ヶ月に3回しかない"],
	["切り麺", "霧麺"],
	["丸信飯店", "マルシン飯店"],
	["紅型警部", "銭形警部"],
	["ウーバー", "Uber"],
	["テーブルチェック", "TableCheck"],
	["お母さんとBEO2は", "お母さんとビデオ通話は"],
	["道屋さんの時まで", "みちるさんとの時間まで"],
	["だだこなった", "駄々こねた"],
	["松本市によってなんで有名なの", "松本市ってなんで有名なの"],
	["チャットGPTがやってた", "ChatGPTが言ってた"],
	["ラベルフォレ", "ラ・ベルフォーレ"],
	["名人池", "明神池"],
	["1粒のレイヤー", "一つ上のレイヤー"],
	["日帰り上高地結構行かれてる", "日帰り上高地結構イカれてる"],
	["即探せない", "サクッと探せない"],
	["ハッシュタグマヂカルFM全部小文字", "ハッシュタグmagicalfm（全部小文字）"],
	["オタレフォーム", "おたよりフォーム"],
	["関西人（はてな）", "関西人(?)"],
	["関西人(はてな)", "関西人(?)"],
	["関西人（?）", "関西人(?)"],
	["関西人カッコはてな", "関西人(?)"],
	["関西人カッコハテナ", "関西人(?)"],
	["二千年版", "2009年版"],
	["二千九年版", "2009年版"],
	["二千六年", "2006年"],
	["二千二年", "2002年"],
	["掃除の話するわけねーだろ", "相似の話するわけねーだろ"],
	["掃除、掃除と合同", "相似、相似と合同"],
	["掃除はなんか縮尺", "相似はなんか縮尺"],
	["グロックボット", "Grok Bot"],
	["GlockBot", "Grok Bot"],
	["Glockbot", "Grok Bot"],
	["GrokBot", "Grok Bot"],
	["ドッツ", "Dots"],
	["ビッシュ", "BiSH"],
	["ジェブ状態", "Jev状態"],
	["オブツポケ", "Osmo Pocket"],
	["時価のやつか", "実家のやつか"],
	["おこたんベコン", "オコタンペ湖"],
	[
		"ハッシュタグマヂカル.fm、全部小文字",
		"ハッシュタグmagicalfm（全部小文字）",
	],
	["だって春日とか", "だってハルヒとか"],
	["結構春日は", "結構ハルヒは"],
	["悲し--", "悲し…"],
	["九月すよね", "9月っすよね"],
	["九月ですね", "9月ですね"],
	["パルコヤ上の？", "PARCO_ya上野？"],
	["パルコヤ上の、", "PARCO_ya上野の、"],
	["六千、七千円、六千円", "6000、7000円、6000円"],
	["上野名前は", "上野の前は"],
	["池袋に去年の四月で", "池袋で去年の4月に"],
	["全千百三十五公演", "全1135公演"],
	["UZUProduction", "UZU Production"],
	["十二月十二日", "12月12日"],
	["合格率十パー", "合格率10パー"],
	["ぶつかりFM", "マヂカル.fm"],
	["マーラータン", "麻辣湯"],
	["きみかさん", "黄身子さん"],
	["羊谷福", "楊國福"],
	["ワンラオジ", "王老吉"],
	["作飯", "サク飯"],
	["前のお室が", "前の家が"],
	["千五百円", "1500円"],
	["プラス千円", "プラス1000円"],
	["十五分", "15分"],
	["一億円", "1億円"],
	["五辛", "5辛"],
	["十辛", "10辛"],
	["の、なん-なにが？", "(?)の、なん…なにが？"],
	["入ら-入らない", "入…入らない"],
	["magicalfm、全部小文字", "magicalfm（全部小文字）"],
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

if (noProofread) {
	for (const segment of segments)
		proofread[segment.id] = segment.words.map((word) => word.word).join("|");
}
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

const audioPath = sourceAudioPath;
if (!fs.existsSync(audioPath)) {
	console.error(`downloading ${episode.audioUrl} -> ${audioPath}`);
	const res = await fetch(episode.audioUrl);
	fs.writeFileSync(audioPath, Buffer.from(await res.arrayBuffer()));
}
const outAudio = path.join(videoDir, "public", "episode.mp3");
if (cuts.length) {
	const drop = cuts.map(([a, b]) => `between(t,${a},${b})`).join("+");
	execFileSync("ffmpeg", [
		"-v",
		"error",
		"-y",
		"-i",
		audioPath,
		"-af",
		`aselect='not(${drop})',asetpts=N/SR/TB`,
		"-c:a",
		"libmp3lame",
		"-b:a",
		"192k",
		outAudio,
	]);
} else {
	fs.copyFileSync(audioPath, outAudio);
}
const sourceDurationSec = Number(
	execFileSync("ffprobe", [
		"-v",
		"error",
		"-show_entries",
		"format=duration",
		"-of",
		"csv=p=0",
		audioPath,
	])
		.toString()
		.trim(),
);

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
// LISTEN は公開後に音声を差し替えることがある。文字起こし時と別の音声なら字幕がずれるので止める
if (
	transcript.audioDuration &&
	Math.abs(transcript.audioDuration - sourceDurationSec) > 1.5
) {
	throw new Error(
		`音声の長さが文字起こし時（${transcript.audioDuration}s）と ${audioPath}（${sourceDurationSec}s）で食い違っています。同じ音声で文字起こしをやり直してください`,
	);
}

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
		titleLines: wrapTitle(mainTitle, 13),
		date: episode.pubDate,
	},
	audioFile: "episode.mp3",
	durationSec: round(durationSec),
	fps: FPS,
	bg: bgs[number % 4],
	envelope,
	pages,
	...(guestName && { guest: { name: guestName, avatar: guestAvatar } }),
};

// 行数を増やさない範囲で最大幅を詰め、行の長さをそろえる（「冷笑|野郎」のような泣き別れを避ける）
function wrapTitle(text, max) {
	let best = wrapGreedy(text, max);
	const longest = Math.max(...parser.parse(text).map((p) => p.length));
	for (let m = max - 1; m >= longest; m--) {
		const lines = wrapGreedy(text, m);
		if (lines.length > best.length) break;
		best = lines;
	}
	return best.slice(0, 3);
}

function wrapGreedy(text, max) {
	const lines = [];
	let line = "";
	for (const phrase of parser.parse(text)) {
		if (line && line.length + phrase.length > max) {
			lines.push(line);
			line = "";
		}
		for (const ch of phrase) {
			if (line.length >= max) {
				lines.push(line);
				line = "";
			}
			line += ch;
		}
	}
	if (line) lines.push(line);
	return lines;
}

const dataPath = path.join(videoDir, "src", "data", "episode.json");
fs.writeFileSync(dataPath, JSON.stringify({ data }));
console.error(
	`wrote ${dataPath} (${pages.length} pages, ${Math.round(durationSec / 60)} min) and ${outAudio}`,
);
console.error(`render: bun scripts/render-episode.mjs ${number}`);
