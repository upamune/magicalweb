import fs from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { loadDefaultJapaneseParser } from "budoux";
import React from "react";
import satori from "satori";
import episodesData from "../src/data/episodes.json" with { type: "json" };

// ============================================================
// マヂカル.fm OGP ジェネレーター（関西ポップ）
//
// デザイン: docs/design-system.md 参照
// 組版: BudouX での文節分割に加えて、
//   - 文字種ごとの幅テーブルによるフォントサイズの段階決定
//   - 孤立行（行末に1〜2文字だけ残る）の再調整
//   - 助詞を道連れにする「…」省略
//   - 約物（括弧・句読点）の全角アキ詰め
// を自前で行い、行の組み方を完全にコントロールする。
// ============================================================

const parser = loadDefaultJapaneseParser();

const WIDTH = 1200;
const HEIGHT = 630;
const OUT_DIR = path.join(process.cwd(), "public", "og");
const EMOJI_CACHE_DIR = path.join(
	process.cwd(),
	"node_modules",
	".cache",
	"twemoji",
);

// デザイントークン（docs/design-system.md と同期）
const C = {
	ink: "#1D1A2E",
	paper: "#FFF8EE",
	card: "#FFFEFA",
	muted: "#6E6884",
	lilac: "#CFB3F5",
	lime: "#C9E94E",
	tangerine: "#FF8A3D",
	sky: "#7FD4F5",
	candy: "#FF9EC0",
	sun: "#FFD23F",
};

// エピソード番号で背景色をローテーション（色面分割の思想）
const BG_ROTATION = [C.lilac, C.lime, C.sky, C.candy];

// ---------- CLI ----------
const args = process.argv.slice(2);
const forceOverwrite = args.includes("--force") || args.includes("-f");
const generateSite = args.includes("--site");

const latestIndex = args.findIndex((arg) => arg === "--latest" || arg === "-l");
const latestCount =
	latestIndex !== -1 ? Number.parseInt(args[latestIndex + 1], 10) : null;
if (latestIndex !== -1 && (!Number.isFinite(latestCount) || latestCount <= 0)) {
	console.error(
		"Error: --latest (-l) オプションには正の整数を指定してください",
	);
	process.exit(1);
}

// ---------- フォント ----------
const fontDisplay = fs.readFileSync(
	"./fonts/mochiy-pop-one/MochiyPopOne-Regular.ttf",
	null,
);
const fontRegular = fs.readFileSync(
	"./fonts/m-plus-rounded/MPLUSRounded1c-Regular.ttf",
	null,
);
const fontBold = fs.readFileSync(
	"./fonts/m-plus-rounded/MPLUSRounded1c-Bold.ttf",
	null,
);

// ---------- 番組アートワーク ----------
const artworkUri = `data:image/png;base64,${fs
	.readFileSync("./images/artwork-256.png")
	.toString("base64")}`;

// ============================================================
// 絵文字（Twemoji を SVG data URI として埋め込む）
// ============================================================

const EMOJI_RE = /\p{Extended_Pictographic}/u;
const segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });

function toGraphemes(text) {
	return [...segmenter.segment(text)].map((s) => s.segment);
}

function twemojiCode(grapheme) {
	const codes = [...grapheme].map((c) => c.codePointAt(0));
	// 単独の VS16 付き絵文字は VS16(fe0f) を除いたファイル名になる
	const filtered = codes.length > 1 ? codes.filter((c) => c !== 0xfe0f) : codes;
	return filtered.map((c) => c.toString(16)).join("-");
}

async function loadEmojiDataUri(grapheme) {
	const code = twemojiCode(grapheme);
	const cachePath = path.join(EMOJI_CACHE_DIR, `${code}.svg`);

	let svg;
	if (fs.existsSync(cachePath)) {
		svg = fs.readFileSync(cachePath, "utf8");
	} else {
		const url = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${code}.svg`;
		const res = await fetch(url);
		if (!res.ok) return null;
		svg = await res.text();
		fs.mkdirSync(EMOJI_CACHE_DIR, { recursive: true });
		fs.writeFileSync(cachePath, svg);
	}
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// テキストに含まれる絵文字の graphemeImages マップを構築する
async function buildGraphemeImages(texts) {
	const images = {};
	for (const text of texts) {
		for (const g of toGraphemes(text ?? "")) {
			if (EMOJI_RE.test(g) && !(g in images)) {
				const uri = await loadEmojiDataUri(g);
				if (uri) images[g] = uri;
			}
		}
	}
	return images;
}

// ============================================================
// 日本語組版エンジン
// ============================================================

// 行末に残ると寂しい助詞。「…」で省略するとき、直前が漢字や英数字なら道連れにする
const PARTICLES = new Set([
	"は",
	"が",
	"を",
	"に",
	"で",
	"と",
	"の",
	"も",
	"へ",
	"や",
	"か",
	"な",
	"ね",
	"よ",
]);

// 前アキを持つ約物（開き括弧類）: 左側を詰める
const OPEN_PUNCT = new Set(["「", "『", "（", "【", "〈", "《", "“"]);
// 後アキを持つ約物（閉じ括弧・句読点類）: 右側を詰める
const CLOSE_PUNCT = new Set([
	"」",
	"』",
	"）",
	"】",
	"〉",
	"》",
	"、",
	"。",
	"”",
]);

// 約物の詰め量（em）。全角アキのうちこれだけ詰める
const PUNCT_TIGHTEN = 0.42;

// 文字種ごとの概算幅（em）。「何文字か」ではなく「幅の合計」で判定する
function charWidth(grapheme) {
	if (EMOJI_RE.test(grapheme)) return 1.15; // 絵文字（余白込み）
	const code = grapheme.codePointAt(0);
	if (OPEN_PUNCT.has(grapheme) || CLOSE_PUNCT.has(grapheme)) {
		return 1.0 - PUNCT_TIGHTEN;
	}
	if (code <= 0x7f) {
		if (grapheme === " ") return 0.32;
		if (/[iIl1jft!.,:;'"|()[\]]/.test(grapheme)) return 0.36;
		return 0.6; // 半角英数
	}
	if (code >= 0xff61 && code <= 0xff9f) return 0.5; // 半角カナ
	return 1.0; // 全角（漢字・かな・記号）
}

function textWidth(text) {
	return toGraphemes(text).reduce((sum, g) => sum + charWidth(g), 0);
}

// BudouX の文節を greedy に行へ詰める。長すぎる文節は文字単位で折る
function composeLines(segments, maxWidthEm) {
	const lines = [];
	let current = "";
	let currentWidth = 0;

	const push = () => {
		if (current) lines.push(current);
		current = "";
		currentWidth = 0;
	};

	for (const segment of segments) {
		const w = textWidth(segment);
		if (currentWidth + w <= maxWidthEm) {
			current += segment;
			currentWidth += w;
			continue;
		}
		// 文節単体で1行を超える場合は文字単位で折る
		if (w > maxWidthEm) {
			for (const g of toGraphemes(segment)) {
				const gw = charWidth(g);
				if (currentWidth + gw > maxWidthEm) push();
				current += g;
				currentWidth += gw;
			}
			continue;
		}
		push();
		current = segment;
		currentWidth = w;
	}
	push();
	return lines;
}

// 最終行が孤立（1〜2文字 or 先頭行に比べて極端に短い）していないか
function hasOrphan(lines) {
	if (lines.length < 2) return false;
	const last = lines[lines.length - 1];
	const first = lines[0];
	return (
		toGraphemes(last).length <= 2 ||
		textWidth(last) < 2.6 ||
		textWidth(last) < textWidth(first) * 0.4
	);
}

// 助詞を道連れにしながら「…」で省略する
function truncateWithEllipsis(segments, maxWidthEm, maxLines) {
	const graphemes = toGraphemes(segments.join(""));
	const budget = maxWidthEm * maxLines - 1.2; // 「…」と余白のぶんを確保

	while (graphemes.length > 0 && textWidth(graphemes.join("")) > budget) {
		graphemes.pop();
	}
	// 末尾が助詞で、その前が漢字・英数字なら助詞ごと削る
	while (graphemes.length >= 2) {
		const last = graphemes[graphemes.length - 1];
		const prev = graphemes[graphemes.length - 2];
		const prevIsDense = /[一-鿿㐀-䶿A-Za-z0-9]/.test(prev);
		if (PARTICLES.has(last) && prevIsDense) {
			graphemes.pop();
		} else {
			break;
		}
	}
	// 末尾の約物・中黒は削ってから省略する
	while (
		graphemes.length > 0 &&
		/[、。・「『（【〈《]/.test(graphemes[graphemes.length - 1])
	) {
		graphemes.pop();
	}
	return composeLines(parser.parse(`${graphemes.join("")}…`), maxWidthEm);
}

// フォントサイズを大きい方から試し、行数と孤立行が許容できた瞬間に確定する。
// どのサイズでも収まらなければ最小サイズで「…」省略する
function layoutText(text, { sizes, containerWidthPx, maxLines }) {
	const segments = parser.parse(text);

	for (const size of sizes) {
		const maxWidthEm = (containerWidthPx / size) * 0.98;
		let lines = composeLines(segments, maxWidthEm);
		if (lines.length > maxLines) continue;

		// 孤立行があれば行幅を少しずつ狭めて再配分を試みる
		if (hasOrphan(lines)) {
			for (const ratio of [0.94, 0.88, 0.82, 0.74, 0.64, 0.56]) {
				const retry = composeLines(segments, maxWidthEm * ratio);
				if (retry.length > maxLines) break;
				if (retry.length >= lines.length && !hasOrphan(retry)) {
					lines = retry;
					break;
				}
			}
		}
		if (lines.length <= maxLines) {
			return { size, lines };
		}
	}

	const size = sizes[sizes.length - 1];
	const maxWidthEm = (containerWidthPx / size) * 0.98;
	return { size, lines: truncateWithEllipsis(segments, maxWidthEm, maxLines) };
}

// 1行ぶんのテキストを、約物詰めの span 列に変換する
function renderLine(line, fontSize, key) {
	const tokens = [];
	let buffer = "";

	const flush = () => {
		if (buffer) {
			tokens.push({ type: "text", text: buffer });
			buffer = "";
		}
	};

	for (const g of toGraphemes(line)) {
		if (OPEN_PUNCT.has(g) || CLOSE_PUNCT.has(g)) {
			flush();
			tokens.push({ type: OPEN_PUNCT.has(g) ? "open" : "close", text: g });
		} else {
			buffer += g;
		}
	}
	flush();

	const tighten = -PUNCT_TIGHTEN * fontSize;
	return (
		<div
			key={key}
			style={{ display: "flex", flexWrap: "nowrap", whiteSpace: "pre" }}
		>
			{tokens.map((token, i) => (
				<span
					key={String(i)}
					style={{
						whiteSpace: "pre",
						...(token.type === "open" && { marginLeft: tighten }),
						...(token.type === "close" && { marginRight: tighten }),
					}}
				>
					{token.text}
				</span>
			))}
		</div>
	);
}

// ============================================================
// レンダリング
// ============================================================

async function renderToPng(element, graphemeImages, outPath) {
	const svg = await satori(element, {
		width: WIDTH,
		height: HEIGHT,
		fonts: [
			{ name: "MochiyPopOne", data: fontDisplay, weight: 400, style: "normal" },
			{
				name: "MPLUSRounded1c",
				data: fontRegular,
				weight: 400,
				style: "normal",
			},
			{ name: "MPLUSRounded1c", data: fontBold, weight: 700, style: "normal" },
		],
		graphemeImages,
	});

	const resvg = new Resvg(svg, {
		fitTo: { mode: "width", value: WIDTH },
		background: "white",
	});
	fs.writeFileSync(outPath, resvg.render().asPng());
	console.log(`Generated -> ${outPath}`);
}

// ステッカー風バッジ
function Sticker({ children, bg = C.sun, rotate = -3, fontSize = 30 }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				backgroundColor: bg,
				color: C.ink,
				border: `4px solid ${C.ink}`,
				borderRadius: "9999px",
				padding: "8px 26px",
				fontFamily: "MochiyPopOne",
				fontSize,
				transform: `rotate(${rotate}deg)`,
				boxShadow: `5px 5px 0 ${C.ink}`,
			}}
		>
			{children}
		</div>
	);
}

// 番組アートワークのロゴバッジ
function MicBadge({ size = 56 }) {
	return (
		<img
			src={artworkUri}
			alt=""
			width={size}
			height={size}
			style={{
				width: size,
				height: size,
				border: `4px solid ${C.ink}`,
				borderRadius: "9999px",
				boxShadow: `4px 4px 0 ${C.ink}`,
			}}
		/>
	);
}

function EpisodeOgp({
	episodeNumber,
	pubDate,
	titleLayout,
	subtitleLayout,
	bg,
}) {
	return (
		<div
			style={{
				width: WIDTH,
				height: HEIGHT,
				display: "flex",
				backgroundColor: bg,
				backgroundImage: `radial-gradient(circle, ${C.ink}24 3.5px, transparent 3.5px)`,
				backgroundSize: "30px 30px",
				padding: "38px 52px 50px 40px",
				fontFamily: "MochiyPopOne",
			}}
		>
			<div
				style={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					backgroundColor: C.card,
					border: `6px solid ${C.ink}`,
					borderRadius: "36px",
					boxShadow: `14px 14px 0 ${C.ink}`,
					padding: "40px 52px 36px",
				}}
			>
				{/* ヘッダー行: 話数ステッカー + 配信日 */}
				<div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
					<Sticker>{`#${episodeNumber}`}</Sticker>
					<div
						style={{
							display: "flex",
							fontFamily: "MPLUSRounded1c",
							fontWeight: 700,
							fontSize: "24px",
							color: C.muted,
						}}
					>
						{pubDate}
					</div>
				</div>

				{/* タイトル */}
				<div
					style={{
						flex: 1,
						display: "flex",
						flexDirection: "column",
						justifyContent: "center",
						gap: "18px",
						paddingTop: "16px",
						paddingBottom: "8px",
					}}
				>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							fontSize: titleLayout.size,
							lineHeight: 1.32,
							color: C.ink,
							fontFamily: "MochiyPopOne",
						}}
					>
						{titleLayout.lines.map((line, i) =>
							renderLine(line, titleLayout.size, `t-${i}`),
						)}
					</div>
					{subtitleLayout && (
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								fontSize: subtitleLayout.size,
								lineHeight: 1.4,
								color: C.muted,
								fontFamily: "MPLUSRounded1c",
								fontWeight: 700,
							}}
						>
							{subtitleLayout.lines.map((line, i) => {
								const prefix = i === 0 ? "〜" : "";
								const suffix =
									i === subtitleLayout.lines.length - 1 ? "〜" : "";
								return renderLine(
									`${prefix}${line}${suffix}`,
									subtitleLayout.size,
									`s-${i}`,
								);
							})}
						</div>
					)}
				</div>

				{/* フッター行: ブランド + キャッチコピー */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
						<MicBadge />
						<div style={{ display: "flex", fontSize: "34px", color: C.ink }}>
							マヂカル
							<span style={{ color: C.tangerine }}>.fm</span>
						</div>
					</div>
					<div
						style={{
							display: "flex",
							fontFamily: "MPLUSRounded1c",
							fontWeight: 700,
							fontSize: "21px",
							color: C.muted,
						}}
					>
						ほぼ週2の雑談ポッドキャスト
					</div>
				</div>
			</div>
		</div>
	);
}

function SiteOgp() {
	const badges = [
		{ text: "ほぼ週2!", bg: C.sun, rotate: -4 },
		{ text: "雑談100%", bg: C.lime, rotate: 2 },
	];
	return (
		<div
			style={{
				width: WIDTH,
				height: HEIGHT,
				display: "flex",
				backgroundColor: C.lilac,
				backgroundImage: `radial-gradient(circle, ${C.ink}24 3.5px, transparent 3.5px)`,
				backgroundSize: "30px 30px",
				padding: "38px 52px 50px 40px",
				fontFamily: "MochiyPopOne",
			}}
		>
			<div
				style={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					gap: "30px",
					backgroundColor: C.card,
					border: `6px solid ${C.ink}`,
					borderRadius: "36px",
					boxShadow: `14px 14px 0 ${C.ink}`,
					padding: "40px 52px",
				}}
			>
				<div style={{ display: "flex", gap: "20px" }}>
					{badges.map((badge) => (
						<Sticker
							key={badge.text}
							bg={badge.bg}
							rotate={badge.rotate}
							fontSize={24}
						>
							{badge.text}
						</Sticker>
					))}
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "28px",
					}}
				>
					<MicBadge size={92} />
					<div style={{ display: "flex", fontSize: "104px", color: C.ink }}>
						マヂカル
						<span style={{ color: C.tangerine }}>.fm</span>
					</div>
				</div>
				<div
					style={{
						display: "flex",
						fontFamily: "MPLUSRounded1c",
						fontWeight: 700,
						fontSize: "30px",
						color: C.muted,
					}}
				>
					関西人のPMとエンジニアがお届けする雑談ポッドキャスト
				</div>
			</div>
		</div>
	);
}

// ============================================================
// エントリーポイント
// ============================================================

export async function generateEpisodeOgp(episode, outPath) {
	const fullTitle = episode.title.replace(/~/g, "〜");

	// 「タイトル 〜サブタイトル〜」を分離し、話数プレフィックスはステッカーと重複するので外す
	const match = fullTitle.match(/^(.*?)〜(.+?)〜(.*)$/);
	const [rawTitle, subtitle] = match
		? [match[1] + match[3], match[2]]
		: [fullTitle, null];
	const title = rawTitle.replace(/^#\d+[:：]\s*/, "").trim();

	const contentWidth = 1000;
	const titleLayout = layoutText(title, {
		sizes: [76, 68, 60, 54, 48],
		containerWidthPx: contentWidth,
		maxLines: 3,
	});
	const subtitleLayout = subtitle
		? layoutText(subtitle, {
				sizes: [34, 30, 26],
				containerWidthPx: contentWidth - 68, // 前後の「〜」のぶん
				maxLines: 2,
			})
		: null;

	const graphemeImages = await buildGraphemeImages([title, subtitle]);
	const bg = BG_ROTATION[episode.number % BG_ROTATION.length];

	await renderToPng(
		<EpisodeOgp
			episodeNumber={episode.number}
			pubDate={episode.pubDate}
			titleLayout={titleLayout}
			subtitleLayout={subtitleLayout}
			bg={bg}
		/>,
		graphemeImages,
		outPath,
	);
}

async function main() {
	if (!fs.existsSync(OUT_DIR)) {
		fs.mkdirSync(OUT_DIR, { recursive: true });
	}

	// サイト全体のOGP
	if (generateSite) {
		await renderToPng(
			<SiteOgp />,
			{},
			path.join(process.cwd(), "public", "ogp.png"),
		);
		if (!latestCount) return;
	}

	const sortedEpisodes = [...episodesData].sort((a, b) => b.number - a.number);
	const targetEpisodes = latestCount
		? sortedEpisodes.slice(0, latestCount)
		: sortedEpisodes;

	for (const episode of targetEpisodes) {
		const epSlug = episode.customPath || episode.number.toString();
		const outPath = path.join(OUT_DIR, `ep-${epSlug}.png`);

		if (fs.existsSync(outPath) && !forceOverwrite) {
			console.log(`ep-${epSlug}.png が既に存在します。スキップします。`);
			continue;
		}

		await generateEpisodeOgp(episode, outPath);
	}
}

// 直接実行された場合のみmain関数を実行
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
