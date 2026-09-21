import { expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CaptionPage } from "../src/types";

mock.module("../src/episode/EpisodeSpeakerBar", () => ({
	SPEAKER_COLORS: { michiru: "#ff8bd8", upamune: "#65d9ff", guest: "#ffe366" },
}));
const { EpisodeCaption, findCaptionPage } = await import(
	"../src/episode/EpisodeCaption"
);

const page: CaptionPage = {
	start: 1,
	end: 4,
	speaker: "upamune",
	lines: [
		[
			{ text: "京都の", start: 1, end: 2 },
			{ text: "街歩き", start: 2, end: 3 },
		],
	],
};

test("street telop stays identical across word timing boundaries", () => {
	const frames = [1, 1.5, 2, 2.5, 3.5].map((t) =>
		renderToStaticMarkup(createElement(EpisodeCaption, { page, ...{ t } })),
	);
	expect(new Set(frames).size).toBe(1);
	expect(frames[0]).not.toContain("transform:");
	expect(frames[0]).toContain("京都の");
	expect(frames[0]).toContain("街歩き");
	expect(frames[0]).toContain("#65d9ff");
});

test("page display still switches at its own start and end", () => {
	expect(findCaptionPage([page], 0.99)).toBeNull();
	expect(findCaptionPage([page], 1)).toBe(page);
	expect(findCaptionPage([page], 3.99)).toBe(page);
	expect(findCaptionPage([page], 4)).toBeNull();
});
