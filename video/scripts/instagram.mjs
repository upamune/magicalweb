import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

// Instagram Graph API で Reels を投稿する最小クライアント（外部依存なし）。
// 動画はローカルファイルではなく「公開URL」を渡す方式なので、
// R2 にアップロード済みの clips.magical.fm の URL をそのまま使える。
//
// 必要な環境変数:
//   IG_ACCESS_TOKEN  … Instagram プロアカウントの長期アクセストークン（60日）
//   IG_USER_ID       … Instagram プロフェッショナルアカウントID（省略時は "me"）
//   IG_API_HOST      … 省略時 graph.instagram.com（Instagram Login）。
//                      Facebook Login 経由のトークンなら graph.facebook.com を指定する

const API_VERSION = process.env.IG_API_VERSION ?? "v23.0";
const API_HOST = process.env.IG_API_HOST ?? "graph.instagram.com";

// 動画の変換待ち。Reels は数十秒かかることがある
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export const hasInstagramCredentials = () =>
	Boolean(process.env.IG_ACCESS_TOKEN);

const userId = () => process.env.IG_USER_ID ?? "me";

const call = async (method, pathname, params) => {
	const url = new URL(`https://${API_HOST}/${API_VERSION}/${pathname}`);
	const body = new URLSearchParams({
		...params,
		access_token: process.env.IG_ACCESS_TOKEN,
	});
	const res = await fetch(
		method === "GET" ? `${url}?${body}` : url,
		method === "GET" ? {} : { method, body },
	);
	const json = await res.json();
	if (!res.ok || json.error) {
		throw new Error(
			`Instagram ${method} ${pathname} failed: ${res.status} ${JSON.stringify(json.error ?? json)}`,
		);
	}
	return json;
};

// 公開URLの動画から Reels のメディアコンテナを作る（この時点ではまだ公開されない）
export const createReelContainer = async ({
	videoUrl,
	caption,
	shareToFeed = true,
}) => {
	const { id } = await call("POST", `${userId()}/media`, {
		media_type: "REELS",
		video_url: videoUrl,
		share_to_feed: String(shareToFeed),
		...(caption ? { caption } : {}),
	});
	return id;
};

// Instagram 側の動画処理が終わる（FINISHED）まで待つ
export const waitForContainer = async (containerId, { onProgress } = {}) => {
	const deadline = Date.now() + POLL_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const { status_code: code, status } = await call("GET", containerId, {
			fields: "status_code,status",
		});
		onProgress?.(code);
		if (code === "FINISHED") return;
		if (code === "ERROR" || code === "EXPIRED") {
			throw new Error(`Instagram container ${code}: ${status ?? ""}`);
		}
		await sleep(POLL_INTERVAL_MS);
	}
	throw new Error(
		`Instagram container did not finish within ${POLL_TIMEOUT_MS / 1000}s`,
	);
};

export const publishContainer = async (containerId) => {
	const { id } = await call("POST", `${userId()}/media_publish`, {
		creation_id: containerId,
	});
	return id;
};

export const getPermalink = async (mediaId) => {
	const { permalink } = await call("GET", mediaId, { fields: "permalink" });
	return permalink;
};

// コンテナ作成 → 処理待ち → 公開 までの一連
export const publishReel = async ({ videoUrl, caption, onProgress }) => {
	const containerId = await createReelContainer({ videoUrl, caption });
	onProgress?.(`container ${containerId} created`);
	await waitForContainer(containerId, {
		onProgress: (code) => onProgress?.(`status ${code}`),
	});
	const mediaId = await publishContainer(containerId);
	onProgress?.(`published ${mediaId}`);
	return { id: mediaId, url: await getPermalink(mediaId) };
};

const ENV_PATH = path.join(import.meta.dirname, "..", ".env");

// 新しいトークンを video/.env に書き戻す
const persistToken = (token) => {
	if (!fs.existsSync(ENV_PATH)) return false;
	const src = fs.readFileSync(ENV_PATH, "utf8");
	const line = `IG_ACCESS_TOKEN=${token}`;
	fs.writeFileSync(
		ENV_PATH,
		/^IG_ACCESS_TOKEN=.*$/m.test(src)
			? src.replace(/^IG_ACCESS_TOKEN=.*$/m, line)
			: `${src.endsWith("\n") ? src : `${src}\n`}${line}\n`,
	);
	return true;
};

// 長期トークン（60日）の延長。有効期限内に1回叩けば60日伸びる
export const refreshAccessToken = async () => {
	const url = new URL(`https://${API_HOST}/refresh_access_token`);
	url.searchParams.set("grant_type", "ig_refresh_token");
	url.searchParams.set("access_token", process.env.IG_ACCESS_TOKEN);
	const res = await fetch(url);
	const json = await res.json();
	if (!res.ok || json.error) {
		throw new Error(
			`Instagram token refresh failed: ${res.status} ${JSON.stringify(json.error ?? json)}`,
		);
	}
	return json;
};

// 延長して .env に書き戻すところまで。発行から24時間以内のトークンは延長できない
export const refreshAndPersist = async () => {
	const json = await refreshAccessToken();
	process.env.IG_ACCESS_TOKEN = json.access_token;
	return {
		days: Math.round(json.expires_in / 86400),
		saved: persistToken(json.access_token),
	};
};
