import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAudioStore } from "../store/audioStore";

interface EpisodeEntry {
	number: number;
	slug: string;
	title: string;
	pubDate: string;
	audioUrl: string;
}

interface NavEntry {
	label: string;
	href: string;
	external?: boolean;
	icon: string;
	keywords: string[];
}

const NAV_ENTRIES: NavEntry[] = [
	{ label: "トップ", href: "/", icon: "🏠", keywords: ["top", "home"] },
	{
		label: "エピソード一覧",
		href: "/episodes",
		icon: "🎧",
		keywords: ["episodes", "list"],
	},
	{
		label: "お便りを送る",
		href: "https://go.magical.fm/hello",
		external: true,
		icon: "📮",
		keywords: ["hello", "otayori", "contact", "letter"],
	},
	{
		label: "グッズストア",
		href: "https://suzuri.jp/magicalfm",
		external: true,
		icon: "🛍️",
		keywords: ["goods", "merch", "store", "suzuri"],
	},
	{
		label: "サポート",
		href: "/support",
		icon: "💜",
		keywords: ["support", "donate"],
	},
];

const MAX_EPISODE_RESULTS = 8;

export default function CommandPalette() {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState(0);
	const [episodes, setEpisodes] = useState<EpisodeEntry[] | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	// 初回オープン時にエピソード一覧を取得
	useEffect(() => {
		if (!open || episodes !== null) return;
		fetch("/api/episodes.json")
			.then((res) => res.json())
			.then((data: EpisodeEntry[]) => setEpisodes(data))
			.catch(() => setEpisodes([]));
	}, [open, episodes]);

	const close = useCallback(() => {
		setOpen(false);
		setQuery("");
		setSelected(0);
	}, []);

	// ⌘K / Ctrl+K で開閉、開いている間の Esc はパレットだけを閉じる
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				(e.metaKey || e.ctrlKey) &&
				(e.key.toLowerCase() === "k" || e.code === "KeyK")
			) {
				e.preventDefault();
				e.stopPropagation();
				setOpen((prev) => !prev);
				return;
			}
			if (e.key === "Escape" && open) {
				e.preventDefault();
				e.stopPropagation();
				close();
			}
		};
		// AudioPlayerのグローバルショートカットより先に奪うため capture で登録
		window.addEventListener("keydown", handleKeyDown, { capture: true });
		return () =>
			window.removeEventListener("keydown", handleKeyDown, { capture: true });
	}, [open, close]);

	// ヘッダーの検索ボタンから開く
	useEffect(() => {
		const handleOpen = () => setOpen(true);
		window.addEventListener("open-command-palette", handleOpen);
		return () => window.removeEventListener("open-command-palette", handleOpen);
	}, []);

	// 開いたら入力へフォーカス + 背景スクロールを止める
	useEffect(() => {
		if (open) {
			inputRef.current?.focus();
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}
		return () => {
			document.body.style.overflow = "";
		};
	}, [open]);

	const q = query.trim().toLowerCase();

	const navResults = useMemo(
		() =>
			q === ""
				? NAV_ENTRIES
				: NAV_ENTRIES.filter(
						(entry) =>
							entry.label.toLowerCase().includes(q) ||
							entry.keywords.some((keyword) => keyword.startsWith(q)),
					),
		[q],
	);

	const episodeResults = useMemo(() => {
		if (!episodes) return [];
		if (q === "") return episodes.slice(0, MAX_EPISODE_RESULTS);
		return episodes
			.filter(
				(ep) =>
					ep.title.toLowerCase().includes(q) ||
					`#${ep.number}`.includes(q) ||
					String(ep.number).includes(q),
			)
			.slice(0, MAX_EPISODE_RESULTS);
	}, [episodes, q]);

	const totalCount = navResults.length + episodeResults.length;

	// 検索のたびに選択をリセット
	// biome-ignore lint/correctness/useExhaustiveDependencies: クエリ変更時のリセットが目的
	useEffect(() => {
		setSelected(0);
	}, [q]);

	const playEpisode = useCallback(
		(ep: EpisodeEntry) => {
			const store = useAudioStore.getState();
			if (store.episodeNumber === ep.number) {
				store.setPlaying(!store.isPlaying);
			} else {
				store.setEpisode(ep.number, ep.slug, ep.title, ep.audioUrl);
			}
			close();
		},
		[close],
	);

	const activate = useCallback(
		(index: number, withMeta: boolean) => {
			if (index < navResults.length) {
				const entry = navResults[index];
				if (entry.external) {
					window.open(entry.href, "_blank", "noopener,noreferrer");
					close();
				} else {
					window.location.href = entry.href;
				}
				return;
			}
			const ep = episodeResults[index - navResults.length];
			if (!ep) return;
			if (withMeta) {
				playEpisode(ep);
			} else {
				window.location.href = `/ep/${ep.slug}`;
			}
		},
		[navResults, episodeResults, playEpisode, close],
	);

	const handleInputKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setSelected((prev) => (prev + 1) % Math.max(totalCount, 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setSelected(
				(prev) =>
					(prev - 1 + Math.max(totalCount, 1)) % Math.max(totalCount, 1),
			);
		} else if (e.key === "Enter") {
			e.preventDefault();
			activate(selected, e.metaKey || e.ctrlKey);
		}
	};

	// 選択項目を追従スクロール
	useEffect(() => {
		listRef.current
			?.querySelector(`[data-index="${selected}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [selected]);

	if (!open) return null;

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escキーで閉じられる
		<div
			className="fixed inset-0 z-[60] flex items-start justify-center bg-[rgb(29,26,46)]/50 px-4 pt-[12vh]"
			onClick={close}
			role="presentation"
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: 内側クリックの伝播止めのみ */}
			{/* biome-ignore lint/a11y/useSemanticElements: <dialog>はopen属性やtop-layerの挙動が絡むためdiv+roleで実装 */}
			<div
				className="palette-in w-full max-w-xl overflow-hidden rounded-2xl border-3 border-edge bg-surface shadow-pop"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-label="コマンドパレット"
			>
				<div className="flex items-center gap-3 border-b-3 border-edge px-5 py-3.5">
					<svg
						viewBox="0 0 24 24"
						className="h-5 w-5 shrink-0 text-muted"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
						aria-hidden="true"
					>
						<circle cx="11" cy="11" r="7" />
						<path d="m20 20-3.5-3.5" />
					</svg>
					<input
						ref={inputRef}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={handleInputKeyDown}
						placeholder="エピソードを検索 / ページへ移動"
						className="w-full bg-transparent font-bold outline-none placeholder:font-medium placeholder:text-muted/60"
						aria-label="検索"
					/>
					<kbd className="shrink-0 rounded-md border-2 border-edge bg-paper px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted">
						esc
					</kbd>
				</div>

				<div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
					{navResults.length > 0 && (
						<p className="px-3 pb-1 pt-2 font-display text-[10px] tracking-[0.2em] text-muted">
							ページ
						</p>
					)}
					{navResults.map((entry, i) => (
						<button
							key={entry.href}
							type="button"
							data-index={i}
							onClick={() => activate(i, false)}
							onMouseMove={() => setSelected(i)}
							className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-bold transition-colors duration-100 ${
								selected === i ? "bg-sun text-[rgb(29,26,46)]" : ""
							}`}
						>
							<span aria-hidden="true">{entry.icon}</span>
							{entry.label}
							{entry.external && (
								<span className="ml-auto text-xs text-muted">↗</span>
							)}
						</button>
					))}

					{episodeResults.length > 0 && (
						<p className="px-3 pb-1 pt-3 font-display text-[10px] tracking-[0.2em] text-muted">
							エピソード
						</p>
					)}
					{episodes === null && open && (
						<p className="px-3 py-4 text-sm text-muted">読み込み中…</p>
					)}
					{episodeResults.map((ep, i) => {
						const index = navResults.length + i;
						return (
							<button
								key={ep.number}
								type="button"
								data-index={index}
								onClick={() => activate(index, false)}
								onMouseMove={() => setSelected(index)}
								className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-100 ${
									selected === index ? "bg-sun text-[rgb(29,26,46)]" : ""
								}`}
							>
								<span className="grid h-8 w-12 shrink-0 place-items-center rounded-lg border-2 border-edge bg-lilac font-display text-[10px] text-[rgb(29,26,46)]">
									#{ep.number}
								</span>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-sm font-bold">
										{ep.title}
									</span>
									<span
										className={`block text-xs ${selected === index ? "text-[rgb(29,26,46)]/60" : "text-muted"}`}
									>
										{ep.pubDate}
									</span>
								</span>
								<span
									className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-edge bg-lime text-[rgb(29,26,46)]"
									onClick={(e) => {
										e.stopPropagation();
										playEpisode(ep);
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.stopPropagation();
											playEpisode(ep);
										}
									}}
									role="button"
									tabIndex={-1}
									aria-label={`${ep.title} を再生`}
								>
									<svg
										viewBox="0 0 24 24"
										className="ml-0.5 h-3 w-3"
										fill="currentColor"
										aria-hidden="true"
									>
										<path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l11.05-6.86a1.04 1.04 0 0 0 0-1.76L9.56 4.26A1.04 1.04 0 0 0 8 5.14z" />
									</svg>
								</span>
							</button>
						);
					})}

					{totalCount === 0 && episodes !== null && (
						<p className="px-3 py-8 text-center font-bold">
							「{query}」は見つかりませんでした 🥲
						</p>
					)}
				</div>

				<div className="flex items-center gap-4 border-t-3 border-edge bg-paper px-5 py-2.5 font-mono text-[10px] text-muted">
					<span>↑↓ 移動</span>
					<span>⏎ 開く</span>
					<span>⌘⏎ 再生</span>
					<span className="ml-auto font-display tracking-widest">
						マヂカル.fm
					</span>
				</div>
			</div>
		</div>
	);
}
