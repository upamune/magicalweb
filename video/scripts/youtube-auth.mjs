import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

// YouTube アップロード用の refresh token を取得する（初回のみ実行）。
// Google Cloud で「デスクトップアプリ」のOAuthクライアントを作り、
// client id / secret を環境変数か引数で渡す。
//
//   YOUTUBE_CLIENT_ID=... YOUTUBE_CLIENT_SECRET=... bun scripts/youtube-auth.mjs
//
// ブラウザで承認すると refresh token が video/.env に書き込まれる。
// 複数チャンネルを持つアカウントでは、承認画面で投稿先のチャンネルを選ぶこと。

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/youtube.upload";

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
	console.error("YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET を設定してください");
	process.exit(1);
}

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPE);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");

const code = await new Promise((resolve, reject) => {
	const server = http.createServer((req, res) => {
		const url = new URL(req.url, REDIRECT_URI);
		const received = url.searchParams.get("code");
		const error = url.searchParams.get("error");
		res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
		res.end(
			`<h1>${received ? "認証できました。ターミナルに戻ってください。" : `認証に失敗しました: ${error}`}</h1>`,
		);
		server.close();
		received ? resolve(received) : reject(new Error(error ?? "no code"));
	});
	server.listen(PORT, () => {
		console.log("ブラウザで承認してください:");
		console.log(authUrl.toString());
		try {
			execFileSync("open", [authUrl.toString()]);
		} catch {
			// ブラウザを開けない環境では上のURLを手で開いてもらう
		}
	});
});

const res = await fetch("https://oauth2.googleapis.com/token", {
	method: "POST",
	headers: { "content-type": "application/x-www-form-urlencoded" },
	body: new URLSearchParams({
		client_id: clientId,
		client_secret: clientSecret,
		code,
		grant_type: "authorization_code",
		redirect_uri: REDIRECT_URI,
	}),
});
const json = await res.json();
if (!res.ok || !json.refresh_token) {
	console.error(`token exchange failed: ${res.status} ${JSON.stringify(json)}`);
	process.exit(1);
}

const envPath = path.join(import.meta.dirname, "..", ".env");
const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const line = `YOUTUBE_REFRESH_TOKEN=${json.refresh_token}`;
fs.writeFileSync(
	envPath,
	/^YOUTUBE_REFRESH_TOKEN=.*$/m.test(current)
		? current.replace(/^YOUTUBE_REFRESH_TOKEN=.*$/m, line)
		: `${current.replace(/\n?$/, "\n")}${line}\n`,
);
console.log("");
console.log(
	`video/.env に YOUTUBE_REFRESH_TOKEN を書き込みました（末尾 ...${json.refresh_token.slice(-4)}）`,
);
