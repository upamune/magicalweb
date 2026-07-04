import { useMemo, useState } from "react";
import { useAudioStore } from "../store/audioStore";

export interface EpisodeItem {
	number: number;
	slug: string;
	title: string;
	pubDate: string;
	audioUrl: string;
	snippet?: string;
}

interface EpisodeListProps {
	episodes: EpisodeItem[];
	searchable?: boolean;
	total?: number;
}

function PlayIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			className="ml-0.5 h-4 w-4"
			fill="currentColor"
			aria-hidden="true"
		>
			<path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l11.05-6.86a1.04 1.04 0 0 0 0-1.76L9.56 4.26A1.04 1.04 0 0 0 8 5.14z" />
		</svg>
	);
}

function PauseIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			className="h-4 w-4"
			fill="currentColor"
			aria-hidden="true"
		>
			<rect x="6" y="5" width="4" height="14" rx="1.2" />
			<rect x="14" y="5" width="4" height="14" rx="1.2" />
		</svg>
	);
}

export function Equalizer({ paused = false }: { paused?: boolean }) {
	return (
		<span className={`eq ${paused ? "eq-paused" : ""}`} aria-hidden="true">
			<span />
			<span />
			<span />
		</span>
	);
}

export default function EpisodeList({
	episodes,
	searchable = false,
	total = episodes.length,
}: EpisodeListProps) {
	const [query, setQuery] = useState("");
	const [allEpisodes, setAllEpisodes] = useState<EpisodeItem[] | null>(null);
	const [loadingAll, setLoadingAll] = useState(false);
	const { episodeNumber, isPlaying, setEpisode, setPlaying } = useAudioStore();

	// 初期表示は先頭のみ渡し、全件は必要になったとき（検索・すべて表示）に取得する。
	// 266話ぶんを最初からハイドレートするとTBTが悪化するため
	const hasMore = total > episodes.length && allEpisodes === null;

	const loadAll = () => {
		if (allEpisodes !== null || loadingAll) return;
		setLoadingAll(true);
		fetch("/api/episodes.json")
			.then((res) => res.json())
			.then((data: EpisodeItem[]) => setAllEpisodes(data))
			.catch(() => setAllEpisodes(episodes))
			.finally(() => setLoadingAll(false));
	};

	const source = allEpisodes ?? episodes;

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return source;
		return source.filter(
			(ep) =>
				ep.title.toLowerCase().includes(q) ||
				`#${ep.number}`.includes(q) ||
				String(ep.number).includes(q) ||
				(ep.snippet?.toLowerCase().includes(q) ?? false),
		);
	}, [source, query]);

	const handlePlay = (ep: EpisodeItem) => {
		if (episodeNumber === ep.number) {
			setPlaying(!isPlaying);
		} else {
			setEpisode(ep.number, ep.slug, ep.title, ep.audioUrl);
		}
	};

	return (
		<div>
			{searchable && (
				<div className="mb-8 flex items-center gap-4">
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onFocus={loadAll}
						placeholder="タイトル・話数で検索"
						className="w-full max-w-sm rounded-full border-3 border-edge bg-surface px-5 py-2.5 text-sm font-bold shadow-pop-xs outline-none transition-shadow duration-150 placeholder:font-medium placeholder:text-muted/70 focus:shadow-pop-sm"
						aria-label="エピソードを検索"
					/>
					<p className="shrink-0 font-display text-sm text-muted">
						{query ? filtered.length : total}
						<span className="text-muted/60"> / {total}</span>
					</p>
				</div>
			)}

			{filtered.length === 0 ? (
				<div className="rounded-3xl border-3 border-dashed border-edge/40 py-20 text-center">
					<p className="font-bold">「{query}」は見つかりませんでした 🥲</p>
					<button
						type="button"
						onClick={() => setQuery("")}
						className="btn-pop mt-5 rounded-full bg-sun px-5 py-2 text-sm font-bold text-[rgb(29,26,46)]"
					>
						検索をリセット
					</button>
				</div>
			) : (
				<ol className="flex flex-col gap-4">
					{filtered.map((ep) => {
						const isCurrent = episodeNumber === ep.number;
						return (
							<li
								key={ep.number}
								className={`flex items-center gap-3 rounded-2xl border-3 border-edge p-4 shadow-pop-sm transition-[transform,box-shadow] duration-150 ease-out-quart sm:gap-5 sm:p-5 ${
									isCurrent ? "bg-sun text-[rgb(29,26,46)]" : "bg-surface"
								}`}
							>
								<a
									href={`/ep/${ep.slug}`}
									className="group flex min-w-0 flex-1 items-center gap-3 sm:gap-5"
								>
									<span
										className={`grid h-11 w-14 shrink-0 place-items-center rounded-xl border-3 border-edge font-display text-xs ${
											isCurrent
												? "bg-tangerine text-[rgb(29,26,46)]"
												: "bg-lilac text-[rgb(29,26,46)]"
										}`}
									>
										#{ep.number}
									</span>
									<span className="min-w-0 flex-1">
										<span className="flex items-center gap-2.5">
											{isCurrent && (
												<span className="shrink-0 text-tangerine">
													<Equalizer paused={!isPlaying} />
												</span>
											)}
											<span className="truncate font-bold leading-snug underline decoration-transparent decoration-[3px] underline-offset-4 transition-[text-decoration-color] duration-150 group-hover:decoration-tangerine">
												{ep.title}
											</span>
										</span>
										<span
											className={`mt-1 block truncate text-xs ${
												isCurrent ? "text-[rgb(29,26,46)]/70" : "text-muted"
											}`}
										>
											{ep.pubDate}
											{ep.snippet && (
												<span className="hidden sm:inline">
													{" "}
													— {ep.snippet}
												</span>
											)}
										</span>
									</span>
								</a>
								<button
									type="button"
									onClick={() => handlePlay(ep)}
									className={`btn-pop grid h-11 w-11 shrink-0 place-items-center rounded-full text-[rgb(29,26,46)] ${
										isCurrent ? "bg-tangerine" : "bg-lime"
									}`}
									aria-label={
										isCurrent && isPlaying
											? `${ep.title} を一時停止`
											: `${ep.title} を再生`
									}
								>
									{isCurrent && isPlaying ? <PauseIcon /> : <PlayIcon />}
								</button>
							</li>
						);
					})}
				</ol>
			)}

			{hasMore && query === "" && (
				<div className="mt-8 text-center">
					<button
						type="button"
						onClick={loadAll}
						disabled={loadingAll}
						className="btn-pop rounded-full bg-sun px-8 py-3 font-bold text-[rgb(29,26,46)] disabled:opacity-60"
					>
						{loadingAll
							? "読み込み中…"
							: `残り${total - episodes.length}話をすべて表示`}
					</button>
				</div>
			)}
		</div>
	);
}
