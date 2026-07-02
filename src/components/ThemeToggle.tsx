import { useEffect, useState } from "react";

export default function ThemeToggle() {
	const [isDark, setIsDark] = useState(false);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
		setIsDark(document.documentElement.classList.contains("dark"));
	}, []);

	const toggle = () => {
		const next = !isDark;
		setIsDark(next);
		document.documentElement.classList.toggle("dark", next);
		localStorage.setItem("theme", next ? "dark" : "light");
	};

	if (!mounted) {
		return <div className="h-10 w-10" aria-hidden="true" />;
	}

	return (
		<button
			type="button"
			onClick={toggle}
			className={`btn-pop relative grid h-10 w-10 place-items-center rounded-full ${
				isDark ? "bg-lilac text-[rgb(29,26,46)]" : "bg-sky text-[rgb(29,26,46)]"
			}`}
			aria-label={isDark ? "ライトモードに切り替え" : "ダークモードに切り替え"}
		>
			<svg
				viewBox="0 0 24 24"
				className={`absolute h-[18px] w-[18px] transition-[transform,opacity] duration-200 ease-out-quart ${
					isDark
						? "-rotate-90 scale-50 opacity-0"
						: "rotate-0 scale-100 opacity-100"
				}`}
				fill="none"
				stroke="currentColor"
				strokeWidth="2.5"
				strokeLinecap="round"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="4" />
				<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
			</svg>
			<svg
				viewBox="0 0 24 24"
				className={`absolute h-[18px] w-[18px] transition-[transform,opacity] duration-200 ease-out-quart ${
					isDark
						? "rotate-0 scale-100 opacity-100"
						: "rotate-90 scale-50 opacity-0"
				}`}
				fill="none"
				stroke="currentColor"
				strokeWidth="2.5"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
			</svg>
		</button>
	);
}
