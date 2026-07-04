import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// レンダリング済みクリップ(out/*.mp4)をR2にアップロードし、
// src/data/clips.json にエピソード番号キーで追記する
//
//   bun scripts/upload-clip.mjs out/magicalfm-264-clip.mp4 264 "50歳でもバリベイビー"
//
// オブジェクトキーは内容のsha256先頭8桁を付けた
// magicalfm-N-clip-{hash}.mp4 形式。内容が変わればURLも変わるので
// エッジキャッシュに古い動画が残らない。再アップロード時は clips.json の
// 同じベース名のエントリを置換し、古いR2オブジェクトは削除する。

const R2_BUCKET = "magicalfm-clips";
const PUBLIC_BASE_URL = "https://clips.magical.fm";

const videoDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(videoDir);

const [filePath, episode, label] = process.argv.slice(2);
if (!filePath || !episode || !label) {
	console.error(
		'Usage: bun scripts/upload-clip.mjs <path/to/clip.mp4> <episode> "<label>"',
	);
	process.exit(1);
}

if (!fs.existsSync(filePath)) {
	console.error(`File not found: ${filePath}`);
	process.exit(1);
}

const hash = crypto
	.createHash("sha256")
	.update(fs.readFileSync(filePath))
	.digest("hex")
	.slice(0, 8);
const base = path.basename(filePath, path.extname(filePath));
const key = `${base}-${hash}.mp4`;
execFileSync(
	"bunx",
	["wrangler", "r2", "object", "put", `${R2_BUCKET}/${key}`, "--file", filePath, "--remote"],
	{ cwd: videoDir, stdio: "inherit" },
);

const url = `${PUBLIC_BASE_URL}/${key}`;

const clipsPath = path.join(repoRoot, "src", "data", "clips.json");
const clips = JSON.parse(fs.readFileSync(clipsPath, "utf8"));
clips[episode] ??= [];

// 同じベース名（ハッシュ無しの旧形式も含む）のエントリは置換する
const samePattern = new RegExp(
	`^${PUBLIC_BASE_URL}/${base}(-[0-9a-f]{8})?\\.mp4$`,
);
const idx = clips[episode].findIndex((e) => samePattern.test(e.url));
const replacedUrl = idx >= 0 ? clips[episode][idx].url : null;
if (idx >= 0) {
	clips[episode][idx] = { url, label };
} else {
	clips[episode].push({ url, label });
}
fs.writeFileSync(clipsPath, `${JSON.stringify(clips, null, "\t")}\n`);

if (replacedUrl && replacedUrl !== url) {
	const oldKey = replacedUrl.slice(`${PUBLIC_BASE_URL}/`.length);
	try {
		execFileSync(
			"bunx",
			["wrangler", "r2", "object", "delete", `${R2_BUCKET}/${oldKey}`, "--remote"],
			{ cwd: videoDir, stdio: "inherit" },
		);
	} catch {
		console.warn(`Warning: failed to delete old object ${oldKey}`);
	}
}

console.log(`Uploaded: ${url}`);
console.log(`Added to ${clipsPath} (episode ${episode})`);
