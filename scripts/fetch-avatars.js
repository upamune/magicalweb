import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// ホストのアバターを unavatar から取得して public/hosts/ に固定する。
// 実行時依存(unavatar)を無くすため、アイコンを変えたときに手動で実行してコミットする:
//
//   bun scripts/fetch-avatars.js
//
// ImageMagick があれば 320px PNG に正規化する。

const HOSTS = [
	{ name: "michiru", twitter: "applism118" },
	{ name: "upamune", twitter: "upamune" },
];

const outDir = path.join(process.cwd(), "public", "hosts");
fs.mkdirSync(outDir, { recursive: true });

const hasMagick = (() => {
	try {
		execFileSync("magick", ["-version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
})();

for (const host of HOSTS) {
	const res = await fetch(`https://unavatar.io/twitter/${host.twitter}`);
	if (!res.ok) {
		console.error(`${host.name}: fetch failed (${res.status})`);
		process.exit(1);
	}
	const buf = Buffer.from(await res.arrayBuffer());
	const outPath = path.join(outDir, `${host.name}.png`);

	if (hasMagick) {
		const tmp = path.join(outDir, `.tmp-${host.name}`);
		fs.writeFileSync(tmp, buf);
		execFileSync("magick", [tmp, "-resize", "320x320", "-strip", outPath]);
		fs.unlinkSync(tmp);
	} else {
		fs.writeFileSync(outPath, buf);
	}
	console.log(`Wrote ${outPath}`);
}
