import fs from "node:fs";
import path from "node:path";

// 複数ベンダーの文字起こし（transcribe-cloud.mjs 形式）を同じエピソードで比較する
//
//   bun scripts/compare-transcripts.mjs [--ref proofread.json] [--listen listen.json] [--terms "a,b"] [--report out.md] <name=vendor.json>...
//
// 指標:
//   CER(ref)      校正済み字幕（build-episode.mjs の proofread.json）に対する文字誤り率。
//                 proofread は AssemblyAI 出力の校正なので AssemblyAI に有利な基準
//   CER(LISTEN)   LISTEN の文字起こしに対する文字誤り率。フィラー（なんか/その/うん…）を両側から除いて計算
//   drift         LISTEN と同一テキストのセグメント開始時刻の差を一次回帰し、終端でのずれ秒を出す
//   speaker       LISTEN の話者ラベルとの一致率（発話時間で重み付け・ラベルは多数決で対応付け）。drift 補正後の値も出す
//   events        音声イベント（笑い等）の数
//   terms         番組固有語 + --terms の出現回数
// 句読点・空白・記号・校正済み字幕の改行ヒント「|」は比較前に取り除く。表記揺れ（カタカナ/漢字）は誤りとして数える

const argv = process.argv.slice(2);
const take = (flag) => {
	const i = argv.indexOf(flag);
	return i === -1 ? null : argv.splice(i, 2)[1];
};
const refPath = take("--ref");
const listenPath = take("--listen");
const report = take("--report");
const extraTerms = take("--terms")?.split(/[,/]/) ?? [];
const inputs = argv.map((a) => {
	const [name, file] = a.includes("=") ? a.split("=") : [path.basename(a), a];
	return { name, file };
});
if (inputs.length === 0) {
	console.error(
		'Usage: bun scripts/compare-transcripts.mjs [--ref proofread.json] [--listen listen.json] [--terms "a,b"] [--report out.md] <name=vendor.json>...',
	);
	process.exit(1);
}

const normalize = (s) =>
	s
		.normalize("NFKC")
		.replace(
			/[\s|、。，．,.!?！？「」『』（）()［］\[\]…・〜~ー－\-:：;；"'“”‘’—]/g,
			"",
		)
		.toLowerCase();
const FILLERS =
	/(なんか|その|うん|あの|えー|えっと|まあ|ええ|はい|あー|え|あ|ま|さ|ね|よ)/g;
const stripFillers = (s) => s.replace(FILLERS, "");

// 2行DPの編集距離（Levenshtein）
const editDistance = (x, y) => {
	const [a, b] = x.length < y.length ? [y, x] : [x, y];
	let prev = new Uint32Array(b.length + 1);
	let cur = new Uint32Array(b.length + 1);
	for (let j = 0; j <= b.length; j++) prev[j] = j;
	for (let i = 1; i <= a.length; i++) {
		cur[0] = i;
		const ca = a.charCodeAt(i - 1);
		for (let j = 1; j <= b.length; j++) {
			const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
		}
		[prev, cur] = [cur, prev];
	}
	return prev[b.length];
};
const cer = (hyp, ref) => editDistance(hyp, ref) / ref.length;
const pct = (x) => `${(x * 100).toFixed(2)}%`;

const TERMS = [
	...new Set([
		"マヂカル",
		"マジカル",
		"うぱ",
		"みちる",
		"関西人",
		...extraTerms.map((t) => t.trim()).filter(Boolean),
	]),
];

const vendors = inputs.map(({ name, file }) => {
	const json = JSON.parse(fs.readFileSync(file, "utf8"));
	const words = json.segments.flatMap((s) =>
		s.words.map((w) => ({ ...w, speaker: s.speaker })),
	);
	const text = json.segments.map((s) => s.text).join("");
	return { name, json, words, text, norm: normalize(text) };
});

const ref = refPath ? JSON.parse(fs.readFileSync(refPath, "utf8")) : null;
const refNorm = ref ? normalize(Object.values(ref).join("")) : null;

const listen = listenPath
	? JSON.parse(fs.readFileSync(listenPath, "utf8"))
	: null;
const listenNorm = listen
	? stripFillers(normalize(listen.map((s) => s.text).join("")))
	: null;

// LISTEN と同一テキストのセグメントで開始時刻を突き合わせ、ずれ = a + b*t を一次回帰する
const estimateDrift = (segments) => {
	if (!listen) return null;
	const index = new Map();
	for (const s of listen) {
		const k = normalize(s.text);
		if (k.length >= 6) index.set(k, [...(index.get(k) ?? []), s.start]);
	}
	const pts = [];
	for (const s of segments) {
		const cands = index.get(normalize(s.text));
		if (!cands) continue;
		const best = cands.reduce((p, c) =>
			Math.abs(c - s.start) < Math.abs(p - s.start) ? c : p,
		);
		if (Math.abs(best - s.start) < 20) pts.push([s.start, best - s.start]);
	}
	if (pts.length < 10) return { n: pts.length, a: 0, b: 0, atEnd: 0 };
	const n = pts.length;
	const mx = pts.reduce((acc, [x]) => acc + x, 0) / n;
	const my = pts.reduce((acc, [, y]) => acc + y, 0) / n;
	let sxy = 0;
	let sxx = 0;
	for (const [x, y] of pts) {
		sxy += (x - mx) * (y - my);
		sxx += (x - mx) ** 2;
	}
	const b = sxx ? sxy / sxx : 0;
	const a = my - b * mx;
	const end = Math.max(...segments.map((s) => s.end));
	return { n, a, b, atEnd: a + b * end };
};

// LISTEN の話者ラベル(0/1)との一致率。ベンダーの各ラベルを最も重なる LISTEN ラベルに対応付ける
const speakerAgreement = (words, correct) => {
	if (!listen) return null;
	const spans = listen.filter((s) => s.speaker >= 0);
	const starts = spans.map((s) => s.start);
	const find = (t) => {
		let lo = 0;
		let hi = starts.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (starts[mid] <= t) lo = mid + 1;
			else hi = mid;
		}
		const s = spans[lo - 1];
		return s && s.end >= t ? s : null;
	};
	const cooc = new Map();
	let total = 0;
	const hits = [];
	for (const w of words) {
		if (w.speaker == null) continue;
		const mid = correct((w.start + w.end) / 2);
		const seg = find(mid);
		if (!seg) continue;
		const dur = Math.max(0.01, w.end - w.start);
		total += dur;
		const key = `${w.speaker} ${seg.speaker}`;
		cooc.set(key, (cooc.get(key) ?? 0) + dur);
		hits.push({ v: w.speaker, l: seg.speaker, dur });
	}
	const mapping = new Map();
	for (const [key, dur] of cooc) {
		const [v, l] = key.split(" ");
		if ((mapping.get(v)?.dur ?? -1) < dur) mapping.set(v, { l, dur });
	}
	const agreed = hits.reduce(
		(acc, h) => acc + (mapping.get(h.v)?.l === String(h.l) ? h.dur : 0),
		0,
	);
	return { rate: total ? agreed / total : 0, labels: mapping.size };
};

const rows = vendors.map((v) => {
	const drift = estimateDrift(v.json.segments);
	const spRaw = speakerAgreement(v.words, (t) => t);
	const spFixed = drift
		? speakerAgreement(v.words, (t) => t + drift.a + drift.b * t)
		: null;
	return {
		name: v.name,
		chars: v.norm.length,
		words: v.words.length,
		events: v.json.events?.length ?? 0,
		cerRef: refNorm ? cer(v.norm, refNorm) : null,
		cerListen: listenNorm ? cer(stripFillers(v.norm), listenNorm) : null,
		drift,
		spRaw,
		spFixed,
		terms: Object.fromEntries(
			TERMS.map((t) => [t, (v.text.match(new RegExp(t, "gi")) ?? []).length]),
		),
	};
});

const cell = (x) => (x == null ? "-" : pct(x));
const lines = [];
lines.push(
	`| vendor | chars | words | events | CER(ref) | CER(LISTEN) | drift@end | speaker | speaker(補正) | 話者数 | ${TERMS.join(" | ")} |`,
);
lines.push(`|${"---|".repeat(10 + TERMS.length)}`);
for (const r of rows) {
	lines.push(
		`| ${r.name} | ${r.chars} | ${r.words} | ${r.events} | ${cell(r.cerRef)} | ${cell(r.cerListen)} | ${r.drift ? `${r.drift.atEnd >= 0 ? "+" : ""}${r.drift.atEnd.toFixed(2)}s (n=${r.drift.n})` : "-"} | ${cell(r.spRaw?.rate)} | ${cell(r.spFixed?.rate)} | ${r.spRaw?.labels ?? "-"} | ${TERMS.map((t) => r.terms[t]).join(" | ")} |`,
	);
}
if (refNorm) lines.push(`\nref chars: ${refNorm.length}`);
if (listenNorm)
	lines.push(`LISTEN chars (fillers removed): ${listenNorm.length}`);

if (vendors.length > 1) {
	lines.push("\n### ベンダー間 CER（行を仮説・列を参照として）\n");
	lines.push(`| | ${vendors.map((v) => v.name).join(" | ")} |`);
	lines.push(`|${"---|".repeat(vendors.length + 1)}`);
	for (const a of vendors) {
		lines.push(
			`| ${a.name} | ${vendors.map((b) => (a === b ? "-" : pct(cer(a.norm, b.norm)))).join(" | ")} |`,
		);
	}
}

// 目視用: 一定間隔の時間窓で各ベンダーのテキストを並べる
const total = Math.max(...vendors.map((v) => v.json.segments.at(-1)?.end ?? 0));
const windowsAt = [60, 0.25, 0.5, 0.75, 0.95].map((x, i) =>
	i === 0 ? x : Math.floor(total * x),
);
lines.push("\n### 目視サンプル（各ベンダーの同じ30秒）\n");
for (const t0 of windowsAt) {
	lines.push(
		`#### ${Math.floor(t0 / 60)}:${String(t0 % 60).padStart(2, "0")} 〜 +30s\n`,
	);
	if (ref) {
		const base = vendors.find((v) => v.name.toLowerCase().includes("assembly"));
		if (base) {
			const refSeg = base.json.segments
				.filter((s) => s.start >= t0 && s.start < t0 + 30)
				.map((s) => (ref[String(s.id)] ?? s.text).replaceAll("|", ""))
				.join("");
			lines.push(`- **ref**: ${refSeg}`);
		}
	}
	if (listen) {
		const text = listen
			.filter((s) => s.start >= t0 && s.start < t0 + 30)
			.map((s) => `[${s.speaker}]${s.text}`)
			.join(" ");
		lines.push(`- **LISTEN**: ${text}`);
	}
	for (const v of vendors) {
		const text = v.json.segments
			.filter((s) => s.start >= t0 && s.start < t0 + 30)
			.map((s) => `[${s.speaker ?? "?"}]${s.text}`)
			.join(" ");
		lines.push(`- **${v.name}**: ${text}`);
	}
	lines.push("");
}

const out = `${lines.join("\n")}\n`;
console.log(out);
if (report) fs.writeFileSync(report, out);
