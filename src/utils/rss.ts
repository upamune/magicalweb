import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import DOMPurify from "isomorphic-dompurify";
import episodesData from "../data/episodes.json";

export interface Episode {
	title: string;
	description: string;
	pubDate: string;
	number: number;
	audioUrl: string;
	customPath?: string;
}

//// HTMLをサニタイズし、img要素にloading="lazy"を追加する関数
//// export function sanitizeHtml
//    } (html: string): string {
//  // happy-domを使用してHTMLを解析
//  const window = new Window();
//  const document = window.document;
//  document.body.innerHTML = html;
//
//  // すべてのimg要素にloading="lazy"を追加
//  for (const img of document.querySelectorAll('img')) {
//    img.setAttribute('loading', 'lazy');
//    if (!img.hasAttribute('alt')) {
//      img.setAttribute('alt', '');
//    }
//  }
//
//  // サニタイズされたHTMLを取得
//  const sanitized = DOMPurify.sanitize(document.body.innerHTML, {
//    USE_PROFILES: { html: true },
//    ALLOWED_TAGS: [
//      'p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li',
//      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
//      'blockquote', 'code', 'pre', 'img'
//    ],
//    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'src', 'alt', 'loading']
//  });
//
//  return sanitized;
//}
//
// RSSの説明文にはスキームが抜けたhref（例: www.amazon.co.jp/dp/XXXX）や
// URLですらないhrefが紛れており、そのままだと /ep/225/www.amazon.co.jp/... のような
// 相対リンクになってしまうため、表示前に補正する
function normalizeHref(rawHref: string): string | null {
	const href = rawHref.trim();
	if (!href) return null;

	// すでに絶対URL・ページ内リンク・サイト内リンクならそのまま使う
	if (/^(https?:|mailto:|tel:|#|\/)/i.test(href)) return href;

	// プロトコル相対（//example.com/...）
	if (href.startsWith("//")) return `https:${href}`;

	// スキームだけが抜けているドメイン形式（www.amazon.co.jp/dp/XXXX など）
	if (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]|$)/.test(href)) return `https://${href}`;

	// URLとして解釈できないものはリンクにしない
	return null;
}

export function normalizeDescriptionLinks(html: string): string {
	return html.replace(
		/<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
		(anchor, attrs: string, inner: string) => {
			const hrefMatch = attrs.match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
			if (!hrefMatch) return anchor;

			const normalized = normalizeHref(hrefMatch[1] ?? hrefMatch[2] ?? "");
			// リンクにできないhrefはアンカーを外してテキストだけ残す
			if (!normalized) return inner;

			const fixedAttrs = attrs.replace(
				/\shref\s*=\s*(?:"[^"]*"|'[^']*')/i,
				` href="${normalized}"`,
			);
			return `<a${fixedAttrs}>${inner}</a>`;
		},
	);
}

// 日付を日本語フォーマットに変換
export function formatJapaneseDate(dateStr: string): string {
	try {
		const date = parseISO(dateStr);
		return format(date, "yyyy年M月d日", { locale: ja });
	} catch {
		return dateStr;
	}
}

export async function getLatestEpisodes(count: number): Promise<Episode[]> {
	return episodesData.slice(0, count).map((episode) => ({
		...episode,
		description: normalizeDescriptionLinks(episode.description),
		pubDate: formatJapaneseDate(episode.pubDate),
	}));
}

export async function getAllEpisodeNumbers(): Promise<number[]> {
	return episodesData.map((episode) => episode.number);
}

export async function getEpisodeByNumber(
	number: number,
): Promise<Episode | null> {
	const episode = episodesData.find((ep) => ep.number === number);
	if (!episode) return null;

	return {
		...episode,
		description: normalizeDescriptionLinks(episode.description),
		pubDate: formatJapaneseDate(episode.pubDate),
	};
}

export async function getEpisodeBySlug(slug: string): Promise<Episode | null> {
	// First try to find by custom path
	let episode = episodesData.find((ep) => ep.customPath === slug);

	// If not found, try to parse as number
	if (!episode) {
		const number = Number.parseInt(slug);
		if (!Number.isNaN(number)) {
			episode = episodesData.find((ep) => ep.number === number);
		}
	}

	if (!episode) return null;

	return {
		...episode,
		description: normalizeDescriptionLinks(episode.description),
		pubDate: formatJapaneseDate(episode.pubDate),
	};
}

export function getEpisodeSlug(episode: Episode): string {
	return episode.customPath || episode.number.toString();
}

// タイトル先頭の「#263: 」は話数表示と重複するため表示用には取り除く
export function getEpisodeDisplayTitle(episode: Episode): string {
	return episode.title.replace(/^#\d+[:：]\s*/, "");
}

// 説明文の本文部分（定型の案内文より前）をプレーンテキストで抜き出す
export function getEpisodeSnippet(episode: Episode, maxLength = 120): string {
	const text = episode.description
		.split("▼")[0]
		.replace(/<[^>]*>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim();

	return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

// エピソード一覧コンポーネントに渡す軽量データ
export function toEpisodeListItem(episode: Episode) {
	return {
		number: episode.number,
		slug: getEpisodeSlug(episode),
		title: getEpisodeDisplayTitle(episode),
		pubDate: episode.pubDate,
		audioUrl: episode.audioUrl,
		snippet: getEpisodeSnippet(episode),
	};
}

export async function getAllEpisodeSlugs(): Promise<string[]> {
	return episodesData.map((episode) => getEpisodeSlug(episode));
}
