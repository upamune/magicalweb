import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as r2 from "./r2.mjs";
import { hasR2Credentials } from "./r2.mjs";

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

// CLOUDFLARE_API_TOKEN があれば Wrangler を優先する。Codex Cloud の中間
// プロキシは大きな S3 PUT から Content-Length を落とすため、動画の公開には
// Cloudflare API 経由の Wrangler を使う。ローカルでは従来どおり、R2 の
// バケット限定アクセスキーだけでも S3 互換 API でアップロードできる。
const useWrangler = Boolean(process.env.CLOUDFLARE_API_TOKEN);
const useS3 = !useWrangler && hasR2Credentials();

const r2Put = async (objectKey, file) => {
	if (useS3) {
		await r2.r2Put(R2_BUCKET, objectKey, file);
		return;
	}
	execFileSync(
		"bunx",
		[
			"wrangler",
			"r2",
			"object",
			"put",
			`${R2_BUCKET}/${objectKey}`,
			"--file",
			file,
			"--remote",
		],
		{ cwd: videoDir, stdio: "inherit" },
	);
};

const r2Delete = async (objectKey) => {
	if (useS3) {
		await r2.r2Delete(R2_BUCKET, objectKey);
		return;
	}
	execFileSync(
		"bunx",
		[
			"wrangler",
			"r2",
			"object",
			"delete",
			`${R2_BUCKET}/${objectKey}`,
			"--remote",
		],
		{ cwd: videoDir, stdio: "inherit" },
	);
};

await r2Put(key, filePath);

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
		await r2Delete(oldKey);
	} catch {
		console.warn(`Warning: failed to delete old object ${oldKey}`);
	}
}

console.log(`Uploaded: ${url}`);
console.log(`Added to ${clipsPath} (episode ${episode})`);
