import { useState } from "react";

function SearchIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			className="h-4 w-4"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			aria-hidden="true"
		>
			<circle cx="11" cy="11" r="7" />
			<path d="m20 20-3.5-3.5" />
		</svg>
	);
}

const NAV_ITEMS = [
	{ href: "/episodes", label: "エピソード" },
	{ href: "/clips", label: "クリップ" },
	{ href: "/#hosts", label: "パーソナリティ" },
	{ href: "/#merch", label: "グッズ" },
	{ href: "https://go.magical.fm/hello", label: "お便り", external: true },
];

export default function Header() {
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	return (
		<header className="sticky top-0 z-40 border-b-3 border-edge bg-paper">
			<nav className="mx-auto max-w-5xl px-5">
				<div className="flex h-16 items-center justify-between">
					<a
						href="/"
						className="flex items-center gap-2.5 font-display text-lg tracking-tight transition-transform duration-150 ease-out-quart active:scale-95"
					>
						<img
							src="/artwork.png"
							alt=""
							width="36"
							height="36"
							className="h-9 w-9 rounded-full border-3 border-edge object-cover shadow-pop-xs"
						/>
						マヂカル<span className="text-tangerine">.fm</span>
					</a>

					{/* Desktop Menu */}
					<div className="hidden items-center gap-1.5 md:flex">
						{NAV_ITEMS.map((item) => (
							<a
								key={item.href}
								href={item.href}
								target={item.external ? "_blank" : undefined}
								rel={item.external ? "noopener noreferrer" : undefined}
								className="rounded-full border-3 border-transparent px-3.5 py-1.5 text-sm font-bold text-ink transition-[border-color,background-color,transform] duration-150 ease-out-quart hover:border-edge hover:bg-sun active:scale-95"
							>
								{item.label}
							</a>
						))}
						<button
							type="button"
							onClick={() =>
								window.dispatchEvent(new CustomEvent("open-command-palette"))
							}
							className="btn-pop ml-2 flex items-center gap-2 rounded-full bg-surface px-3.5 py-1.5 text-sm font-bold text-muted"
							aria-label="検索（⌘K）"
						>
							<SearchIcon />
							<kbd className="font-mono text-[10px] font-medium">⌘K</kbd>
						</button>
					</div>

					{/* Mobile Menu Button */}
					<div className="flex items-center gap-3 md:hidden">
						<button
							type="button"
							onClick={() =>
								window.dispatchEvent(new CustomEvent("open-command-palette"))
							}
							className="btn-pop grid h-10 w-10 place-items-center rounded-full bg-surface text-muted"
							aria-label="検索"
						>
							<SearchIcon />
						</button>
						<button
							type="button"
							onClick={() => setIsMenuOpen(!isMenuOpen)}
							className="btn-pop relative grid h-10 w-10 place-items-center rounded-full bg-surface"
							aria-label="メニュー"
							aria-expanded={isMenuOpen}
						>
							<span
								className={`absolute h-[2.5px] w-4 rounded-full bg-ink transition-transform duration-200 ease-out-quart ${
									isMenuOpen ? "rotate-45" : "-translate-y-[4px]"
								}`}
							/>
							<span
								className={`absolute h-[2.5px] w-4 rounded-full bg-ink transition-transform duration-200 ease-out-quart ${
									isMenuOpen ? "-rotate-45" : "translate-y-[4px]"
								}`}
							/>
						</button>
					</div>
				</div>

				{/* Mobile Menu */}
				<div
					className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out-quart md:hidden ${
						isMenuOpen
							? "grid-rows-[1fr] opacity-100"
							: "grid-rows-[0fr] opacity-0"
					}`}
				>
					<div className="overflow-hidden">
						<div className="flex flex-col gap-2 pb-4">
							{NAV_ITEMS.map((item) => (
								<a
									key={item.href}
									href={item.href}
									target={item.external ? "_blank" : undefined}
									rel={item.external ? "noopener noreferrer" : undefined}
									className="rounded-2xl border-3 border-edge bg-surface px-4 py-2.5 text-sm font-bold shadow-pop-xs transition-transform duration-150 ease-out-quart active:scale-[0.98]"
									onClick={() => setIsMenuOpen(false)}
								>
									{item.label}
								</a>
							))}
						</div>
					</div>
				</div>
			</nav>
		</header>
	);
}
