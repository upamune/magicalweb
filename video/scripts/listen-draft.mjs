import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// 完成動画を LISTEN に上げて、次の配信枠（月・木 4:00 JST）の下書きエピソードを作る。
// VTT を渡すと字幕を取り込み、その字幕から要約を作り直す。
//
//   bun scripts/listen-draft.mjs out/magicalfm-295-episode.mp4 \
//     --thumbnail out/magicalfm-295-thumbnail.png --vtt out/ep-295.vtt
//
//   --number N        話数（既定: LISTEN 上の最大話数 + 1）
//   --date YYYY-MM-DD 配信日（既定: 既存回の最終配信日より後の最初の月曜か木曜）
//   --dry-run         話数・配信日を表示するだけで、何も送らない
//
// 進捗は out/listen-draft-<動画名>.json に残す。途中で落ちても同じコマンドで続きから再開し、
// アップロード済みのファイルやエピソードを二重に作らない。
// LISTEN_API_TOKEN（read / create / update 権限）が必要。

const API = "https://listen.style/api/v1";
const SINGLE_PUT_LIMIT = 5 * 1024 ** 3;
const UPLOAD_TTL_MS = 47 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const RELEASE_HOUR_JST = 4;
const RELEASE_WEEKDAYS = [1, 4];

const videoDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const { values: opts, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		thumbnail: { type: "string" },
		vtt: { type: "string" },
		number: { type: "string" },
		date: { type: "string" },
		"dry-run": { type: "boolean", default: false },
	},
});

const [videoPath] = positionals;
if (!videoPath) {
	console.error(
		"Usage: bun scripts/listen-draft.mjs <episode.mp4> [--thumbnail png] [--vtt file] [--number N] [--date YYYY-MM-DD] [--dry-run]",
	);
	process.exit(1);
}
for (const file of [videoPath, opts.thumbnail, opts.vtt].filter(Boolean)) {
	if (!fs.existsSync(file)) {
		console.error(`File not found: ${file}`);
		process.exit(1);
	}
}

const token = process.env.LISTEN_API_TOKEN;
if (!token) {
	console.error("LISTEN_API_TOKEN is not set (video/.env)");
	process.exit(1);
}

const statePath = path.join(
	videoDir,
	"out",
	`listen-draft-${path.basename(videoPath, path.extname(videoPath))}.json`,
);
const state = fs.existsSync(statePath)
	? JSON.parse(fs.readFileSync(statePath, "utf8"))
	: {};
const save = () => {
	fs.mkdirSync(path.dirname(statePath), { recursive: true });
	fs.writeFileSync(statePath, `${JSON.stringify(state, null, "\t")}\n`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, pathname, body, { allow = [] } = {}) {
	for (;;) {
		const res = await fetch(`${API}${pathname}`, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/json",
				...(body ? { "Content-Type": "application/json" } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		if (res.status === 429) {
			const wait = Number(res.headers.get("retry-after") ?? 60);
			console.log(`  rate limited, retrying in ${wait}s`);
			await sleep(wait * 1000);
			continue;
		}
		const json = await res.json().catch(() => ({}));
		if (res.ok || allow.includes(res.status)) {
			return { status: res.status, ...json };
		}
		throw new Error(
			`${method} ${pathname} -> ${res.status}: ${JSON.stringify(json)}`,
		);
	}
}

async function listAll(pathname) {
	const items = [];
	let after;
	do {
		const q = new URLSearchParams({ first: "100" });
		if (after) q.set("after", after);
		const res = await api("GET", `${pathname}?${q}`);
		items.push(...res.data);
		after = res.meta?.has_more ? res.meta.next_cursor : undefined;
	} while (after);
	return items;
}

const toJst = (date) => new Date(date.getTime() + JST_OFFSET_MS);
const jstDate = (y, m, d) =>
	new Date(Date.UTC(y, m, d, RELEASE_HOUR_JST) - JST_OFFSET_MS);
const formatJst = (date) =>
	`${toJst(date).toISOString().slice(0, 16).replace("T", " ")} JST (${"日月火水木金土"[toJst(date).getUTCDay()]})`;
const toIsoJst = (date) => `${toJst(date).toISOString().slice(0, 19)}+09:00`;

function nextReleaseSlot(after) {
	const j = toJst(after);
	for (let i = 0; i < 14; i++) {
		const slot = jstDate(
			j.getUTCFullYear(),
			j.getUTCMonth(),
			j.getUTCDate() + i,
		);
		if (slot > after && RELEASE_WEEKDAYS.includes(toJst(slot).getUTCDay())) {
			return slot;
		}
	}
	throw new Error("no release slot found");
}

function parseDateOption(value) {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!m) throw new Error(`--date must be YYYY-MM-DD: ${value}`);
	const slot = jstDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	if (!RELEASE_WEEKDAYS.includes(toJst(slot).getUTCDay())) {
		console.warn(`warning: ${value} is not a Monday or Thursday`);
	}
	return slot;
}

const episodeNumberOf = (ep) =>
	ep.episode_number ?? Number(/^#?(\d+)/.exec(ep.title ?? "")?.[1] ?? 0);

function parseVttTimes(text) {
	const toSec = (t) =>
		t
			.split(":")
			.reverse()
			.reduce((sum, part, i) => sum + Number(part) * 60 ** i, 0);
	const cues = [
		...text.matchAll(
			/^((?:\d+:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d+:)?\d{2}:\d{2}\.\d{3})/gm,
		),
	].map((m) => ({ start: toSec(m[1]), end: toSec(m[2]), line: m[0] }));
	if (cues.length === 0) throw new Error("VTT has no cues");
	cues.forEach((cue, i) => {
		if (cue.end <= cue.start)
			throw new Error(`VTT cue ends before start: ${cue.line}`);
		const next = cues[i + 1];
		if (next && next.start < cue.end) {
			throw new Error(
				`VTT cues overlap or go backwards: ${cue.line} / ${next.line}`,
			);
		}
	});
	return cues;
}

const vttText = opts.vtt ? fs.readFileSync(opts.vtt, "utf8") : undefined;
if (vttText) {
	console.log(`VTT: ${parseVttTimes(vttText).length} cues OK`);
}

async function uploadFile(file, type, contentType) {
	const fileName = path.basename(file);
	const blob = Bun.file(file);
	const size = blob.size;
	console.log(`  uploading ${fileName} (${(size / 1024 ** 2).toFixed(1)} MiB)`);

	if (size < SINGLE_PUT_LIMIT) {
		const { data } = await api("POST", "/uploads", {
			file_name: fileName,
			type,
			content_type: contentType,
		});
		const res = await fetch(data.upload_url, {
			method: "PUT",
			headers: { "Content-Type": contentType },
			body: blob,
		});
		if (!res.ok) throw new Error(`PUT ${fileName} -> ${res.status}`);
		return data.path;
	}

	const { data: started } = await api("POST", "/uploads/multipart", {
		file_name: fileName,
		type,
		content_type: contentType,
		file_size: size,
	});
	const { path: uploadPath, upload_id, part_size, part_count } = started;
	const parts = [];
	try {
		for (let first = 1; first <= part_count; first += 100) {
			const numbers = Array.from(
				{ length: Math.min(100, part_count - first + 1) },
				(_, i) => first + i,
			);
			const { data: urls } = await api("POST", "/uploads/multipart/parts", {
				path: uploadPath,
				upload_id,
				part_numbers: numbers,
			});
			for (const part of urls) {
				const start = (part.part_number - 1) * part_size;
				const res = await fetch(part.upload_url, {
					method: "PUT",
					body: blob.slice(start, start + part.content_length),
				});
				if (!res.ok) {
					throw new Error(`PUT part ${part.part_number} -> ${res.status}`);
				}
				parts.push({
					part_number: part.part_number,
					etag: res.headers.get("etag"),
				});
				console.log(`    part ${part.part_number}/${part_count}`);
			}
		}
		const { data: done } = await api("POST", "/uploads/multipart/complete", {
			path: uploadPath,
			upload_id,
			parts,
		});
		return done.path;
	} catch (err) {
		await api("DELETE", "/uploads/multipart", {
			path: uploadPath,
			upload_id,
		}).catch(() => {});
		throw err;
	}
}

async function uploadOnce(key, file, type, contentType) {
	const cached = state.uploads?.[key];
	if (cached && Date.now() - cached.at < UPLOAD_TTL_MS) return cached.path;
	const uploaded = await uploadFile(file, type, contentType);
	state.uploads = {
		...state.uploads,
		[key]: { path: uploaded, at: Date.now() },
	};
	save();
	return uploaded;
}

const podcasts = await listAll("/podcasts");
const podcast =
	podcasts.find((p) => p.id === process.env.LISTEN_PODCAST_ID) ??
	(podcasts.length === 1 ? podcasts[0] : undefined);
if (!podcast) {
	console.error(
		`Set LISTEN_PODCAST_ID to one of: ${podcasts.map((p) => `${p.id} (${p.title})`).join(", ")}`,
	);
	process.exit(1);
}

if (!state.episodeId) {
	const episodes = await listAll(`/podcasts/${podcast.id}/episodes`);
	const number =
		state.number ??
		(opts.number
			? Number(opts.number)
			: Math.max(0, ...episodes.map(episodeNumberOf)) + 1);
	const clash = episodes.find((ep) => episodeNumberOf(ep) === number);
	if (clash) {
		console.error(
			`#${number} already exists on LISTEN: ${clash.id} "${clash.title}" (${clash.status})`,
		);
		process.exit(1);
	}

	const latest = new Date(
		Math.max(
			Date.now(),
			...episodes.flatMap((ep) =>
				[ep.published_at, ep.scheduled_at]
					.filter(Boolean)
					.map((d) => Date.parse(d)),
			),
		),
	);
	const releaseAt = state.releaseAt
		? new Date(state.releaseAt)
		: opts.date
			? parseDateOption(opts.date)
			: nextReleaseSlot(latest);

	console.log(`podcast: ${podcast.title}`);
	console.log(`episode: #${number}`);
	console.log(`release: ${formatJst(releaseAt)}`);
	if (opts["dry-run"]) process.exit(0);

	state.number = number;
	state.releaseAt = releaseAt.toISOString();
	save();

	const video = await uploadOnce("video", videoPath, "VIDEO", "video/mp4");
	const thumbnail = opts.thumbnail
		? await uploadOnce("thumbnail", opts.thumbnail, "IMAGE", "image/png")
		: undefined;

	const { data: created } = await api(
		"POST",
		`/podcasts/${podcast.id}/episodes`,
		{
			title: `#${number}: 仮`,
			description: "TBD",
			visibility: "public",
			status: "draft",
			episode_number: number,
			published_at: toIsoJst(releaseAt),
			media: {
				video: {
					path: video,
					...(thumbnail ? { thumbnail_path: thumbnail } : {}),
				},
			},
		},
	);
	state.episodeId = created.id;
	save();
	console.log(`created: ${created.id} "${created.title}" (${created.status})`);
	if (Date.parse(created.published_at ?? "") !== releaseAt.getTime()) {
		console.warn(
			`warning: release date was not stored (published_at=${created.published_at}). Set it on the LISTEN dashboard.`,
		);
	}
} else {
	console.log(`resuming episode ${state.episodeId} (#${state.number})`);
}

if (vttText && !state.transcriptImportedAt) {
	console.log("uploading transcript");
	const deadline = Date.now() + 30 * 60 * 1000;
	for (;;) {
		const res = await api(
			"PUT",
			`/episodes/${state.episodeId}/transcript`,
			{ format: "vtt", content: vttText },
			{ allow: [422] },
		);
		if (res.status !== 422) {
			state.transcriptImportedAt = res.data.transcript_imported_at;
			save();
			console.log(`  imported ${res.data.segment_count} segments`);
			break;
		}
		// 422 は形式不備のほか、自動文字起こし・メディア処理中でも返る。形式は手元で検査済みなので待って再試行する
		if (Date.now() > deadline) {
			throw new Error(`transcript upload kept failing: ${JSON.stringify(res)}`);
		}
		console.log(`  not ready (${res.message}), retrying in 60s`);
		await sleep(60_000);
	}
}

if (state.transcriptImportedAt && !state.summary) {
	console.log("regenerating summary");
	if (!state.summaryRequestedAt) {
		const { data } = await api(
			"GET",
			`/episodes/${state.episodeId}/summary`,
			null,
			{
				allow: [404, 422],
			},
		);
		state.summaryBefore = data?.summary ?? null;
		await api("POST", `/episodes/${state.episodeId}/summary/regenerate`);
		state.summaryRequestedAt = new Date().toISOString();
		save();
	}
	const deadline = Date.now() + 15 * 60 * 1000;
	for (;;) {
		await sleep(30_000);
		const { data } = await api(
			"GET",
			`/episodes/${state.episodeId}/summary`,
			null,
			{
				allow: [404, 422],
			},
		);
		if (data?.summary && data.summary !== state.summaryBefore) {
			state.summary = data.summary;
			save();
			console.log(`  ${data.summary.slice(0, 80)}…`);
			break;
		}
		if (Date.now() > deadline) {
			console.warn("  summary not ready after 15 min; re-run later to check");
			break;
		}
	}
}

console.log(`done: episode ${state.episodeId} (#${state.number})`);
