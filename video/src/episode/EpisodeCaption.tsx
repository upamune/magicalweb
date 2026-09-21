import { loadFont } from "@remotion/google-fonts/NotoSansJP";
import type { CaptionPage } from "../types";
import { SPEAKER_COLORS } from "./EpisodeSpeakerBar";

const telop = loadFont("normal", { weights: ["900"] });

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

export function EpisodeCaption({ page }: { page: CaptionPage | null }) {
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
				fontFamily: telop.fontFamily,
				fontWeight: 900,
				fontSize: Math.min(72, 1510 / maxChars),
				lineHeight: 1.3,
				textAlign: "left",
				color: SPEAKER_COLORS[page.speaker ?? "guest"],
				WebkitTextStroke: "8px white",
				paintOrder: "stroke fill",
				filter:
					"drop-shadow(0 2px 0 #222) drop-shadow(0 -2px 0 #222) drop-shadow(2px 0 0 #222) drop-shadow(-2px 0 0 #222) drop-shadow(0 3px 2px #0009)",
			}}
		>
			{page.lines.map((line, li) => (
				<div key={String(li)} style={{ whiteSpace: "pre" }}>
					{line.map((word, wi) => (
						<span
							key={String(wi)}
							style={{
								display: "inline-block",
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
