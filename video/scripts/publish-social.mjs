import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ig from "./instagram.mjs";
import { hasInstagramCredentials } from "./instagram.mjs";
import * as postsStore from "./social-posts.mjs";
import * as yt from "./youtube.mjs";
import { hasYouTubeCredentials } from "./youtube.mjs";

// R2 にアップロード済みのクリップを YouTube Shorts と Instagram Reels に投稿する。
//
//   bun scripts/publish-social.mjs out/magicalfm-278-clip.mp4 278
//   bun scripts/publish-social.mjs --pending 1            # 未投稿の古い順から1本（動画は自動DL）
//   bun scripts/publish-social.mjs --pending 1 --dry-run
//
// 短時間に連投すると Shorts の初動テストの表示枠を自分の動画同士で奪い合うので、
// --pending は 1日1〜2本で回す。

const SITE_URL = "https://magical.fm";
const PUBLIC_BASE_URL = "https://clips.magical.fm";
const YOUTUBE_TITLE_LIMIT = 100;
const YOUTUBE_TITLE_SUFFIX = " #ポッドキャスト #shorts";
const YOUTUBE_TAGS = [
	"マヂカル.fm",
	"マヂカルfm",
	"ポッドキャスト",
	"切り抜き",
	"雑談",
	"Shorts",
];

const videoDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(videoDir);

const argv = process.argv.slice(2);
const positional = [];
const flags = {};
for (let i = 0; i < argv.length; i++) {
	const arg = argv[i];
	if (!arg.startsWith("--")) {
		positional.push(arg);
		continue;
	}
	const name = arg.slice(2);
	if (name === "dry-run" || name === "force") {
		flags[name] = true;
	} else {
		flags[name] = argv[++i];
	}
}

const usage =
	"Usage: bun scripts/publish-social.mjs <path/to/clip.mp4> <episode> [options]\n" +
	"       bun scripts/publish-social.mjs --pending <本数> [options]\n" +
	"Options: [--to youtube,instagram] [--url <公開URL>] [--title <text>] [--caption <text>] [--privacy public|unlisted|private] [--dry-run] [--force]";

const pendingCount = flags.pending ? Number(flags.pending) : null;
const [filePathArg, episodeArg] = positional;
if (pendingCount === null && (!filePathArg || !episodeArg)) {
	console.error(usage);
	process.exit(1);
}
if (pendingCount !== null && !Number.isInteger(pendingCount)) {
	console.error("--pending には本数を整数で渡してください");
	process.exit(1);
}

const requested = (flags.to ?? "youtube,instagram")
	.split(",")
	.map((s) => s.trim())
	.filter(Boolean);
for (const target of requested) {
	if (target !== "youtube" && target !== "instagram") {
		console.error(`Unknown target: ${target}`);
		process.exit(1);
	}
}

// 監査を通していない API プロジェクトから public 指定でアップロードすると
// 動画が非公開に固定されてしまうため、既定は限定公開。公開は Studio で手動で行う
const privacyStatus = flags.privacy ?? "unlisted";

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const clipsPath = path.join(repoRoot, "src", "data", "clips.json");
const clips = readJson(clipsPath);
const episodes = readJson(path.join(repoRoot, "src", "data", "episodes.json"));
const posts = postsStore.read();

// upload-clip.mjs が付けた内容ハッシュを落として、記録用のベース名に戻す
const baseFromUrl = (url) =>
	path.basename(url, ".mp4").replace(/-[0-9a-f]{8}$/, "");

const recordFor = (episode, base) =>
	(posts[episode] ?? []).find((e) => e.clip === base) ?? null;

// 投稿の対象を決める。--pending は clips.json 全体から未投稿を古い順に拾う
const selectJobs = () => {
	if (pendingCount === null) {
		const base = path.basename(filePathArg, path.extname(filePathArg));
		const samePattern = new RegExp(
			`^${PUBLIC_BASE_URL}/${base}(-[0-9a-f]{8})?\\.mp4$`,
		);
		return [
			{
				episode: episodeArg,
				base,
				filePath: filePathArg,
				clipEntry:
					(clips[episodeArg] ?? []).find((e) => samePattern.test(e.url)) ??
					null,
			},
		];
	}
	return Object.keys(clips)
		.map(Number)
		.sort((a, b) => a - b)
		.flatMap((number) =>
			(clips[String(number)] ?? []).map((clipEntry) => ({
				episode: String(number),
				base: baseFromUrl(clipEntry.url),
				clipEntry,
				filePath: null,
			})),
		)
		.filter(({ episode, base }) => {
			const record = recordFor(episode, base);
			return !record?.youtube || !record?.instagram;
		})
		.slice(0, pendingCount);
};

// --pending では手元に動画が無いので R2 から取ってくる
const ensureLocalFile = async (url, base) => {
	const dest = path.join(videoDir, "out", `${base}.mp4`);
	if (fs.existsSync(dest)) return dest;
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	const res = await fetch(url);
	if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
	fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
	console.log(`downloaded ${path.relative(videoDir, dest)}`);
	return dest;
};

const truncate = (text, limit) =>
	text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;

const buildMetadata = ({ episode, clipEntry }) => {
	const ep = episodes.find((e) => e.number === Number(episode));
	if (!ep) throw new Error(`Episode #${episode} not found in episodes.json`);

	// 表示用タイトルは先頭の「#279: 」を落とす（サイトの getEpisodeDisplayTitle と同じ規則）
	const episodeTitle = ep.title.replace(/^#\d+:\s*/, "");
	const episodeUrl = `${SITE_URL}/ep/${ep.customPath || ep.number}`;

	const planPath = path.join(videoDir, "plans", `ep-${episode}.json`);
	const plan = fs.existsSync(planPath) ? readJson(planPath) : null;
	const clipTitle =
		plan?.clipTitleLines?.join("") ?? clipEntry?.label ?? episodeTitle;

	// タイトルは「【#278】見出し #ポッドキャスト #shorts」。
	// magicalshorts と同じく【】始まり・ハッシュタグは末尾に置く
	const youtubeTitle =
		flags.title ??
		truncate(
			`【#${episode}】${clipTitle}`,
			YOUTUBE_TITLE_LIMIT - YOUTUBE_TITLE_SUFFIX.length,
		) + YOUTUBE_TITLE_SUFFIX;

	const youtubeDescription = [
		`「${episodeTitle}」より`,
		`▼ フル本編を聴く\n${episodeUrl}`,
		"関西人のプロダクトマネージャーの@michiru_daと関西人(?)のソフトウェアエンジニアの@upamuneが週2で配信する雑談Podcast。",
		"#マヂカルfm",
	].join("\n\n");

	const instagramCaption =
		flags.caption ??
		`${clipTitle}

「${episodeTitle}」より

フル本編は ${SITE_URL} から🎧
Apple Podcasts / Spotify でも配信中。

#マヂカルfm #ポッドキャスト #podcast #雑談 #ラジオ #関西`;

	return {
		clipTitle,
		episodeTitle,
		episodeUrl,
		youtubeTitle,
		youtubeDescription,
		instagramCaption,
	};
};

const publishClip = async (job) => {
	const { episode, base, clipEntry } = job;
	const publicUrl = flags.url ?? clipEntry?.url ?? null;
	const meta = buildMetadata(job);
	const record = recordFor(episode, base);
	const already = (target) => Boolean(record?.[target]) && !flags.force;

	console.log(`clip:     ${base}`);
	console.log(`episode:  #${episode} ${meta.episodeTitle}`);
	console.log(`url:      ${publicUrl ?? "(未アップロード)"}`);
	console.log("");
	console.log(`[YouTube] title: ${meta.youtubeTitle}`);
	console.log(`[YouTube] privacy: ${privacyStatus}`);
	console.log(
		meta.youtubeDescription
			.split("\n")
			.map((l) => `[YouTube] ${l}`)
			.join("\n"),
	);
	console.log("");
	console.log(
		meta.instagramCaption
			.split("\n")
			.map((l) => `[Instagram] ${l}`)
			.join("\n"),
	);
	console.log("");

	if (flags["dry-run"]) {
		console.log("--dry-run: 投稿はしていません");
		return false;
	}

	const results = {};

	if (requested.includes("youtube")) {
		if (!hasYouTubeCredentials()) {
			console.warn(
				"[YouTube] skip: YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN が未設定",
			);
		} else if (already("youtube")) {
			console.warn(
				`[YouTube] skip: 投稿済み ${record.youtube.url}（再投稿するなら --force）`,
			);
		} else if (!job.filePath && !publicUrl) {
			console.warn("[YouTube] skip: 動画ファイルも公開URLも見つかりません");
		} else {
			const filePath = job.filePath ?? (await ensureLocalFile(publicUrl, base));
			console.log("[YouTube] uploading...");
			const video = await yt.uploadVideo({
				filePath,
				title: meta.youtubeTitle,
				description: meta.youtubeDescription,
				tags: YOUTUBE_TAGS,
				privacyStatus,
			});
			results.youtube = {
				id: video.id,
				url: video.url,
				privacyStatus: video.privacyStatus,
				publishedAt: new Date().toISOString(),
			};
			console.log(`[YouTube] ${video.url}`);
			console.log(`[YouTube] channelId: ${video.channelId}`);
			if (video.privacyStatus !== privacyStatus) {
				console.warn(
					`[YouTube] 警告: 公開設定が ${video.privacyStatus} になっています。`,
				);
				console.warn(
					"[YouTube] 未監査の API プロジェクトからのアップロードは非公開に固定され、YouTube Studio でも公開に変更できません。",
				);
				console.warn(
					"[YouTube] support.google.com/youtube/contact/yt_api_form で監査を申請してください。",
				);
			}
			if (video.rejectionReason) {
				console.warn(`[YouTube] rejectionReason: ${video.rejectionReason}`);
			}
		}
	}

	if (requested.includes("instagram")) {
		if (!hasInstagramCredentials()) {
			console.warn("[Instagram] skip: IG_ACCESS_TOKEN が未設定");
		} else if (already("instagram")) {
			console.warn(
				`[Instagram] skip: 投稿済み ${record.instagram.url}（再投稿するなら --force）`,
			);
		} else if (!publicUrl) {
			console.warn(
				"[Instagram] skip: 公開URLが見つかりません。先に upload-clip.mjs を実行するか --url を指定してください",
			);
		} else {
			console.log("[Instagram] publishing...");
			const media = await ig.publishReel({
				videoUrl: publicUrl,
				caption: meta.instagramCaption,
				onProgress: (msg) => console.log(`[Instagram] ${msg}`),
			});
			results.instagram = {
				id: media.id,
				url: media.url,
				publishedAt: new Date().toISOString(),
			};
			console.log(`[Instagram] ${media.url}`);
		}
	}

	if (Object.keys(results).length === 0) return false;

	// 動画・本編・各SNSのURLを1エントリに揃えておく
	const entry = record ?? { clip: base };
	Object.assign(entry, {
		title: meta.clipTitle,
		label: clipEntry?.label ?? entry.label ?? null,
		url: publicUrl,
		episodeUrl: meta.episodeUrl,
		...results,
	});
	if (!record) {
		posts[episode] ??= [];
		posts[episode].push(entry);
	}
	const { jsonPath, markdownPath } = postsStore.save(posts);
	console.log(
		`Recorded in ${path.basename(jsonPath)} / ${path.basename(markdownPath)}`,
	);
	return true;
};

const jobs = selectJobs();
if (jobs.length === 0) {
	console.log("投稿対象がありません（未投稿のクリップは残っていません）");
	process.exit(0);
}
if (jobs.length > 2) {
	console.warn(
		`[警告] 一度に ${jobs.length} 本投稿すると Shorts の初動テストの表示枠を自分の動画同士で奪い合います。1日1〜2本を推奨します。`,
	);
	console.warn("");
}
if (pendingCount !== null) {
	console.log(
		`未投稿から ${jobs.length} 本: ${jobs.map((j) => `#${j.episode}`).join(", ")}`,
	);
	console.log("");
}

// Instagram の長期トークンは60日で切れるが、期限内に延長すればまた60日伸びる。
// 投稿のたびに叩いておけば手で管理しなくて済む（24時間以内の発行だと延長できない）
let published = false;
for (const job of jobs) {
	published = (await publishClip(job)) || published;
	console.log("");
}
if (published && requested.includes("instagram") && hasInstagramCredentials()) {
	try {
		const { days, saved } = await ig.refreshAndPersist();
		console.log(
			`[Instagram] アクセストークンを延長しました（あと${days}日）${saved ? "" : " ※.env に書き戻せませんでした"}`,
		);
	} catch (e) {
		console.warn(`[Instagram] トークンの延長をスキップ: ${e.message}`);
	}
}
