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

// Codex Cloud の中間プロキシは大きな fetch PUT から Content-Length を落とす。
// クラウド環境では Go の HTTP プロキシ対応が安定している rclone を使い、
// ローカルでは従来の S3 互換 API、API トークンだけの環境では Wrangler を使う。
const useRclone = process.env.R2_UPLOAD_DRIVER === "rclone";
const useWrangler = !useRclone && Boolean(process.env.CLOUDFLARE_API_TOKEN);
const useS3 = !useRclone && !useWrangler && hasR2Credentials();

const rcloneEnv = () => {
	if (!hasR2Credentials() || !process.env.CLOUDFLARE_ACCOUNT_ID) {
		throw new Error(
			"rclone requires R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and CLOUDFLARE_ACCOUNT_ID",
		);
	}
	return {
		...process.env,
		RCLONE_CONFIG_R2_TYPE: "s3",
		RCLONE_CONFIG_R2_PROVIDER: "Cloudflare",
		RCLONE_CONFIG_R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
		RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
		RCLONE_CONFIG_R2_ENDPOINT: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
	};
};

const r2Put = async (objectKey, file) => {
	if (useRclone) {
		execFileSync(
			"rclone",
			[
				"copyto",
				file,
				`r2:${R2_BUCKET}/${objectKey}`,
				"--s3-no-check-bucket",
				"--quiet",
			],
			{ cwd: videoDir, env: rcloneEnv(), stdio: "inherit" },
		);
		return;
	}
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
	if (useRclone) {
		execFileSync(
			"rclone",
			[
				"deletefile",
				`r2:${R2_BUCKET}/${objectKey}`,
				"--s3-no-check-bucket",
				"--quiet",
			],
			{ cwd: videoDir, env: rcloneEnv(), stdio: "inherit" },
		);
		return;
	}
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
