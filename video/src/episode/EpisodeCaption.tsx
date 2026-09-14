import { BODY } from "../Clip";
import { C } from "../tokens";
import type { CaptionPage } from "../types";

export function findCaptionPage(pages: CaptionPage[], t: number) {
	let lo = 0;
	let hi = pages.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const page = pages[mid];
		if (t < page.start) hi = mid - 1;
		else if (t >= page.end) lo = mid + 1;
		else return page;
	}
	return null;
}

export function EpisodeCaption({
	page,
	t,
}: { page: CaptionPage | null; t: number }) {
	if (!page) return null;
	if (page.lines.length > 2)
		throw new Error("Street captions must have at most two lines");
	const maxChars = Math.max(
		1,
		...page.lines.map((line) => line.reduce((n, w) => n + w.text.length, 0)),
	);
	return (
		<div
			style={{
				fontFamily: BODY,
				fontWeight: 700,
				fontSize: Math.min(52, 1480 / maxChars),
				lineHeight: 1.4,
				textAlign: "center",
				textShadow: "0 2px 6px #000",
			}}
		>
			{page.lines.map((line, li) => (
				<div key={String(li)} style={{ whiteSpace: "pre" }}>
					{line.map((word, wi) => (
						<span
							key={String(wi)}
							style={{
								color: t >= word.start && t < word.end ? C.sun : "white",
								opacity: t >= word.start ? 1 : 0.7,
							}}
						>
							{word.text}
						</span>
					))}
				</div>
			))}
		</div>
	);
}
