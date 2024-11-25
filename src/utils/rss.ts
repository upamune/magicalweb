import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import DOMPurify from 'isomorphic-dompurify';
import episodesData from '../data/episodes.json';

export interface Episode {
  title: string;
  description: string;
  pubDate: string;
  number: number;
  audioUrl: string;
}

// HTMLをサニタイズする関数
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'blockquote', 'code', 'pre'
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  });
}

// 日付を日本語フォーマットに変換
export function formatJapaneseDate(dateStr: string): string {
  try {
    const date = parseISO(dateStr);
    return format(date, 'yyyy年M月d日', { locale: ja });
  } catch {
    return dateStr;
  }
}

export async function getLatestEpisodes(count: number): Promise<Episode[]> {
  return episodesData.slice(0, count).map(episode => ({
    ...episode,
    description: sanitizeHtml(episode.description),
    pubDate: formatJapaneseDate(episode.pubDate),
  }));
}

export async function getAllEpisodeNumbers(): Promise<number[]> {
  return episodesData.map(episode => episode.number);
}

export async function getEpisodeByNumber(number: number): Promise<Episode | null> {
  const episode = episodesData.find(ep => ep.number === number);
  if (!episode) return null;
  
  return {
    ...episode,
    description: sanitizeHtml(episode.description),
    pubDate: formatJapaneseDate(episode.pubDate),
  };
}