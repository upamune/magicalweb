import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 切り抜きクリップをどこに投稿したかの記録。
// social-posts.json が正データで、POSTS.md は人が読むための一覧（自動生成）。
// publish-social.mjs が投稿のたびに両方を更新する。
//
//   bun scripts/social-posts.mjs   # JSON から POSTS.md を作り直す

const videoDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const JSON_PATH = path.join(videoDir, "social-posts.json");
const MARKDOWN_PATH = path.join(videoDir, "POSTS.md");

export const read = () =>
	fs.existsSync(JSON_PATH)
		? JSON.parse(fs.readFileSync(JSON_PATH, "utf8"))
		: {};

const day = (iso) => iso?.slice(0, 10).replaceAll("-", "/") ?? "";

const PRIVACY_LABEL = {
	public: "公開",
	unlisted: "限定公開",
	private: "非公開",
};

const cell = (post, label) =>
	post ? `[${label}](${post.url}) ${day(post.publishedAt)}` : "—";

export const renderMarkdown = (posts) => {
	const rows = Object.keys(posts)
		.map(Number)
		.sort((a, b) => b - a)
		.flatMap((number) =>
			(posts[String(number)] ?? []).map((entry) =>
				[
					entry.episodeUrl ? `[#${number}](${entry.episodeUrl})` : `#${number}`,
					entry.title ?? entry.label ?? entry.clip,
					cell(
						entry.youtube,
						PRIVACY_LABEL[entry.youtube?.privacyStatus] ?? "投稿済み",
					),
					cell(entry.instagram, "公開"),
					entry.url ? `[mp4](${entry.url})` : "—",
				].join(" | "),
			),
		);

	return `# 切り抜きクリップの投稿記録

\`bun scripts/publish-social.mjs\` が投稿のたびに自動更新する（元データは \`social-posts.json\`）。
JSON を直接いじったあとは \`bun scripts/social-posts.mjs\` で作り直せる。

YouTube は既定で限定公開なので、内容を確認してから YouTube Studio で手動公開する。

| 話数 | クリップ | YouTube | Instagram | 動画 |
| --- | --- | --- | --- | --- |
${rows.map((row) => `| ${row} |`).join("\n")}
`;
};

export const save = (posts) => {
	fs.writeFileSync(JSON_PATH, `${JSON.stringify(posts, null, "\t")}\n`);
	fs.writeFileSync(MARKDOWN_PATH, renderMarkdown(posts));
	return { jsonPath: JSON_PATH, markdownPath: MARKDOWN_PATH };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const { markdownPath } = save(read());
	console.log(`Wrote ${markdownPath}`);
}
