import { refreshAndPersist } from "./instagram.mjs";

// Instagram の長期アクセストークン（60日）を扱うユーティリティ。
//
//   bun scripts/instagram-auth.mjs refresh              # 期限を60日延長する
//   bun scripts/instagram-auth.mjs exchange <短期トークン>  # 短期→長期に交換する
//
// Meta App の「Instagram API setup with Instagram login」画面で生成したトークンは
// 既に長期なので、通常は refresh だけ使う（期限切れ前に叩くこと）。

const API_HOST = process.env.IG_API_HOST ?? "graph.instagram.com";
const [command, shortToken] = process.argv.slice(2);

const days = (seconds) => Math.round(seconds / 86400);

if (command === "refresh") {
	if (!process.env.IG_ACCESS_TOKEN) {
		console.error("IG_ACCESS_TOKEN を設定してください");
		process.exit(1);
	}
	const { days: remaining, saved } = await refreshAndPersist();
	console.log(`有効期限: ${remaining}日`);
	console.log(
		saved
			? "video/.env の IG_ACCESS_TOKEN を更新しました"
			: "video/.env が見つからないので書き戻せませんでした",
	);
} else if (command === "exchange") {
	if (!shortToken || !process.env.IG_APP_SECRET) {
		console.error(
			"Usage: IG_APP_SECRET=... bun scripts/instagram-auth.mjs exchange <短期トークン>",
		);
		process.exit(1);
	}
	const url = new URL(`https://${API_HOST}/access_token`);
	url.searchParams.set("grant_type", "ig_exchange_token");
	url.searchParams.set("client_secret", process.env.IG_APP_SECRET);
	url.searchParams.set("access_token", shortToken);
	const res = await fetch(url);
	const json = await res.json();
	if (!res.ok || json.error) {
		console.error(
			`exchange failed: ${res.status} ${JSON.stringify(json.error ?? json)}`,
		);
		process.exit(1);
	}
	console.log(`有効期限: ${days(json.expires_in)}日`);
	console.log("video/.env に以下を書いてください:");
	console.log(`IG_ACCESS_TOKEN=${json.access_token}`);
} else {
	console.error(
		"Usage: bun scripts/instagram-auth.mjs refresh | exchange <短期トークン>",
	);
	process.exit(1);
}
