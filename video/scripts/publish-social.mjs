import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ig from "./instagram.mjs";
import { hasInstagramCredentials } from "./instagram.mjs";
import * as postsStore from "./social-posts.mjs";
import * as yt from "./youtube.mjs";
import { hasYouTubeCredentials } from "./youtube.mjs";

// R2 にアップロード済みのクリップを YouTube Shorts と Instagram Reels に投稿する。
// 先に upload-clip.mjs を実行して clips.json に載せておくこと
// （Instagram は公開URLからしか投稿できないため）。
//
//   bun scripts/publish-social.mjs out/magicalfm-278-clip.mp4 278
//   bun scripts/publish-social.mjs out/magicalfm-278-clip.mp4 278 --to youtube --privacy unlisted
//   bun scripts/publish-social.mjs out/magicalfm-278-clip.mp4 278 --dry-run
//
// 環境変数（video/.env）:
//   YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN
//   IG_ACCESS_TOKEN / IG_USER_ID

const SITE_URL = "https://magical.fm";
const PUBLIC_BASE_URL = "https://clips.magical.fm";
const YOUTUBE_TITLE_LIMIT = 100;

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

const [filePath, episode] = positional;
if (!filePath || !episode) {
	console.error(
		"Usage: bun scripts/publish-social.mjs <path/to/clip.mp4> <episode> [--to youtube,instagram] [--url <公開URL>] [--title <text>] [--caption <text>] [--privacy public|unlisted|private] [--dry-run] [--force]",
	);
	process.exit(1);
}
if (!fs.existsSync(filePath)) {
	console.error(`File not found: ${filePath}`);
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

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const base = path.basename(filePath, path.extname(filePath));
const clipsPath = path.join(repoRoot, "src", "data", "clips.json");
const clips = readJson(clipsPath);

// upload-clip.mjs が付けたハッシュ付きの公開URLを clips.json から引く
const samePattern = new RegExp(
	`^${PUBLIC_BASE_URL}/${base}(-[0-9a-f]{8})?\\.mp4$`,
);
const clipEntry = (clips[episode] ?? []).find((e) => samePattern.test(e.url));
const publicUrl = flags.url ?? clipEntry?.url;

const episodes = readJson(path.join(repoRoot, "src", "data", "episodes.json"));
const ep = episodes.find((e) => e.number === Number(episode));
if (!ep) {
	console.error(`Episode #${episode} not found in episodes.json`);
	process.exit(1);
}

// 表示用タイトルは先頭の「#279: 」を落とす（サイトの getEpisodeDisplayTitle と同じ規則）
const episodeTitle = ep.title.replace(/^#\d+:\s*/, "");
const episodeUrl = `${SITE_URL}/ep/${ep.customPath || ep.number}`;

const planPath = path.join(videoDir, "plans", `ep-${episode}.json`);
const plan = fs.existsSync(planPath) ? readJson(planPath) : null;
const clipTitle =
	plan?.clipTitleLines?.join("") ?? clipEntry?.label ?? episodeTitle;

const truncate = (text, limit) =>
	text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;

// タイトルは「【#278】見出し #ポッドキャスト #shorts」。
// magicalshorts と同じく【】始まり・ハッシュタグは末尾に置く
const YOUTUBE_TITLE_SUFFIX = " #ポッドキャスト #shorts";
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

// 監査を通していない API プロジェクトから public 指定でアップロードすると
// 動画が非公開に固定されてしまうため、既定は限定公開。公開は Studio で手動で行う
const privacyStatus = flags.privacy ?? "unlisted";

const posts = postsStore.read();
posts[episode] ??= [];
const record = posts[episode].find((e) => e.clip === base) ?? null;
const already = (target) => Boolean(record?.[target]) && !flags.force;

console.log(`clip:     ${filePath}`);
console.log(`episode:  #${episode} ${episodeTitle}`);
console.log(`url:      ${publicUrl ?? "(未アップロード)"}`);
console.log(`targets:  ${requested.join(", ")}`);
console.log("");
console.log(`[YouTube] title: ${youtubeTitle}`);
console.log(`[YouTube] privacy: ${privacyStatus}`);
console.log(
	youtubeDescription
		.split("\n")
		.map((l) => `[YouTube] ${l}`)
		.join("\n"),
);
console.log("");
console.log(
	instagramCaption
		.split("\n")
		.map((l) => `[Instagram] ${l}`)
		.join("\n"),
);
console.log("");

if (flags["dry-run"]) {
	console.log("--dry-run: 投稿はしていません");
	process.exit(0);
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
	} else {
		console.log("[YouTube] uploading...");
		const video = await yt.uploadVideo({
			filePath,
			title: youtubeTitle,
			description: youtubeDescription,
			tags: [
				"マヂカル.fm",
				"マヂカルfm",
				"ポッドキャスト",
				"切り抜き",
				"雑談",
				"Shorts",
			],
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
			caption: instagramCaption,
			onProgress: (msg) => console.log(`[Instagram] ${msg}`),
		});
		results.instagram = {
			id: media.id,
			url: media.url,
			publishedAt: new Date().toISOString(),
		};
		console.log(`[Instagram] ${media.url}`);

		// 長期トークンは60日で切れるが、期限内に延長すればまた60日伸びる。
		// 投稿のたびに叩いておけば手で管理しなくて済む（24時間以内の発行だと延長できない）
		try {
			const { days, saved } = await ig.refreshAndPersist();
			console.log(
				`[Instagram] アクセストークンを延長しました（あと${days}日）${saved ? "" : " ※.env に書き戻せませんでした"}`,
			);
		} catch (e) {
			console.warn(`[Instagram] トークンの延長をスキップ: ${e.message}`);
		}
	}
}

if (Object.keys(results).length > 0) {
	const entry = record ?? { clip: base };
	// 動画・本編・各SNSのURLを1エントリに揃えておく
	Object.assign(entry, {
		title: clipTitle,
		label: clipEntry?.label ?? null,
		url: publicUrl ?? null,
		episodeUrl,
		...results,
	});
	if (!record) posts[episode].push(entry);
	const { jsonPath, markdownPath } = postsStore.save(posts);
	console.log(
		`Recorded in ${path.basename(jsonPath)} / ${path.basename(markdownPath)}`,
	);
}
