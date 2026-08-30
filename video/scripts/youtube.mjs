import fs from "node:fs";

// YouTube Data API v3 に動画をアップロードする最小クライアント（外部依存なし）。
// Bun / Node どちらでも動く。
// 必要な環境変数:
//   YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN
// refresh token は `bun scripts/youtube-auth.mjs` で取得する。

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";

// 24 = Entertainment
const DEFAULT_CATEGORY_ID = "24";

export const hasYouTubeCredentials = () =>
	Boolean(
		process.env.YOUTUBE_CLIENT_ID &&
			process.env.YOUTUBE_CLIENT_SECRET &&
			process.env.YOUTUBE_REFRESH_TOKEN,
	);

export const getAccessToken = async () => {
	const res = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: process.env.YOUTUBE_CLIENT_ID,
			client_secret: process.env.YOUTUBE_CLIENT_SECRET,
			refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
			grant_type: "refresh_token",
		}),
	});
	const json = await res.json();
	if (!res.ok) {
		throw new Error(
			`YouTube token refresh failed: ${res.status} ${JSON.stringify(json)}`,
		);
	}
	return json.access_token;
};

// resumable upload（初期リクエストでアップロード先URLを取得し、本体をPUTする）
export const uploadVideo = async ({
	filePath,
	title,
	description,
	tags = [],
	privacyStatus = "public",
	categoryId = DEFAULT_CATEGORY_ID,
	madeForKids = false,
}) => {
	const accessToken = await getAccessToken();
	const size = fs.statSync(filePath).size;
	const metadata = {
		snippet: { title, description, tags, categoryId, defaultLanguage: "ja" },
		status: {
			privacyStatus,
			selfDeclaredMadeForKids: madeForKids,
		},
	};

	const initRes = await fetch(
		`${UPLOAD_URL}?uploadType=resumable&part=snippet,status`,
		{
			method: "POST",
			headers: {
				authorization: `Bearer ${accessToken}`,
				"content-type": "application/json; charset=UTF-8",
				"x-upload-content-length": String(size),
				"x-upload-content-type": "video/mp4",
			},
			body: JSON.stringify(metadata),
		},
	);
	if (!initRes.ok) {
		throw new Error(
			`YouTube upload init failed: ${initRes.status} ${await initRes.text()}`,
		);
	}
	const sessionUrl = initRes.headers.get("location");
	if (!sessionUrl) {
		throw new Error("YouTube upload init did not return a session URL");
	}

	const uploadRes = await fetch(sessionUrl, {
		method: "PUT",
		headers: {
			"content-type": "video/mp4",
			"content-length": String(size),
		},
		body: fs.readFileSync(filePath),
	});
	const video = await uploadRes.json();
	if (!uploadRes.ok) {
		throw new Error(
			`YouTube upload failed: ${uploadRes.status} ${JSON.stringify(video)}`,
		);
	}

	return {
		id: video.id,
		url: `https://www.youtube.com/shorts/${video.id}`,
		channelId: video.snippet?.channelId,
		privacyStatus: video.status?.privacyStatus,
		uploadStatus: video.status?.uploadStatus,
		rejectionReason: video.status?.rejectionReason ?? null,
	};
};
