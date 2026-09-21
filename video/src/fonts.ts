import { loadFont } from "@remotion/fonts";

export const DISPLAY = "MochiyPopOne";
export const BODY = "MPLUSRounded1c";
export const TELOP = "NotoSansJP";

if (typeof FontFace !== "undefined") {
	void loadFont({
		family: DISPLAY,
		url: new URL(
			"../../fonts/mochiy-pop-one/MochiyPopOne-Regular.ttf",
			import.meta.url,
		).href,
		weight: "400",
	});

	void loadFont({
		family: BODY,
		url: new URL(
			"../../fonts/m-plus-rounded/MPLUSRounded1c-Regular.ttf",
			import.meta.url,
		).href,
		weight: "500",
	});

	void loadFont({
		family: BODY,
		url: new URL(
			"../../fonts/m-plus-rounded/MPLUSRounded1c-Bold.ttf",
			import.meta.url,
		).href,
		weight: "700",
	});

	void loadFont({
		family: TELOP,
		url: new URL(
			"../../fonts/noto-sans-jp/NotoSansJP[wght].ttf",
			import.meta.url,
		).href,
		weight: "100 900",
	});
}
