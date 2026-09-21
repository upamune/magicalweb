import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { correlate, rational, verifyDelivery } from "./verify_delivery.mjs";

test("exact rational FPS and correlation distinguish a delayed waveform", () => {
	assert.equal(rational("24000/1001"), 24000 / 1001);
	assert.throws(() => rational("0/1"));
	assert.throws(() => rational("24/0"));
	assert.throws(() => rational("23.976"));
	const reference = new Float32Array(16000);
	const delayed = new Float32Array(16000);
	let seed = 31;
	for (let i = 0; i < reference.length; i++) {
		seed = (1664525 * seed + 1013904223) >>> 0;
		reference[i] = seed / 2 ** 32 - 0.5;
	}
	for (let i = 800; i < reference.length; i++) delayed[i] = reference[i - 800];
	assert.equal(correlate(reference, reference).lagMs, 0);
	assert.equal(correlate(reference, delayed).lagMs, 100);
	assert.throws(
		() => correlate(new Float32Array(8000), new Float32Array(8000)),
		/No useful shared audio/,
	);
});

test("local-only episode build keeps 29.97fps envelope and provisional metadata consistent", (t) => {
	const here = path.dirname(fileURLToPath(import.meta.url));
	const repo = process.env.MAGICALWEB_ROOT ?? path.resolve(here, "../../../..");
	const source = path.join(repo, "video/scripts/build-episode.mjs");
	if (!fs.existsSync(source))
		return t.skip("Optional magicalweb checkout is unavailable");
	const folder = fs.mkdtempSync(
		path.join(os.tmpdir(), "local-episode-skill-test-"),
	);
	try {
		for (const part of ["scripts", "src/data", "public", "transcripts"])
			fs.mkdirSync(path.join(folder, "video", part), { recursive: true });
		const script = path.join(folder, "video/scripts/build-episode.mjs");
		const original = fs.readFileSync(source, "utf8");
		const pendingQueue =
			"const pending = segments.filter((s) => !proofread[s.id]);";
		assert(
			original.includes("const FPS = 24;") &&
				original.includes("durationSec: round(durationSec)") &&
				original.includes(pendingQueue),
			"Inspect updated upstream implementation before adapting this fixture",
		);
		fs.writeFileSync(
			script,
			original
				.replace("const FPS = 24;", "const FPS = 30000 / 1001;")
				.replace("durationSec: round(durationSec)", "durationSec")
				.replace(
					pendingQueue,
					"const pending = noProofread ? [] : segments.filter((s) => !proofread[s.id]);",
				),
		);
		const audio = path.join(folder, "master.mp3");
		const transcript = path.join(folder, "transcript.json");
		const metadata = path.join(folder, "metadata.json");
		execFileSync("ffmpeg", [
			"-v",
			"error",
			"-n",
			"-f",
			"lavfi",
			"-i",
			"sine=frequency=440:duration=2",
			"-c:a",
			"libmp3lame",
			audio,
		]);
		fs.writeFileSync(
			transcript,
			JSON.stringify({
				segments: [
					{
						id: 0,
						speaker: "A",
						start: 0,
						end: 0.8,
						text: "こんにちは",
						words: [{ word: "こんにちは", start: 0, end: 0.8 }],
					},
					{
						id: 2,
						speaker: "A",
						start: 0.8,
						end: 0.9,
						text: "ローカルに留める不明瞭な認識",
						words: [{ word: "", start: 0.8, end: 0.9 }],
					},
					{
						id: 1,
						speaker: "B",
						start: 1,
						end: 1.8,
						text: "はい",
						words: [{ word: "はい", start: 1, end: 1.8 }],
					},
				],
			}),
		);
		fs.writeFileSync(
			metadata,
			JSON.stringify({
				number: 290,
				title: "第290回（タイトル未定）",
				pubDate: "",
			}),
		);
		// Fail on any fetch, even if the service would be reached through localhost.
		const entry =
			"let calls=0; globalThis.fetch = async () => { calls++; throw Error('Network forbidden in local-only build'); }; await import((await import('node:url')).pathToFileURL(process.argv[1]).href); if(calls!==0) throw Error('Offline build attempted network calls: '+calls);";
		execFileSync(
			process.execPath,
			[
				"--input-type=module",
				"--eval",
				entry,
				script,
				"290",
				"--transcript",
				transcript,
				"--audio",
				audio,
				"--episode-meta",
				metadata,
				"--no-proofread",
				"--speakers",
				"A=michiru,B=upamune",
			],
			{ stdio: "pipe" },
		);
		const { data } = JSON.parse(
			fs.readFileSync(path.join(folder, "video/src/data/episode.json"), "utf8"),
		);
		assert.equal(data.fps, 30000 / 1001);
		assert.equal(data.envelope.length, Math.ceil(data.durationSec * data.fps));
		assert.equal(data.episode.date, "");
		assert.match(data.episode.title, /タイトル未定/);
		assert(data.pages.length > 0);
	} finally {
		fs.rmSync(folder, { recursive: true });
	}
});

test("synthetic delivery checks reject clock, origin and black-frame failures", async () => {
	const folder = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-skill-test-"));
	const run = (args) =>
		execFileSync("ffmpeg", ["-v", "error", "-n", ...args], { stdio: "pipe" });
	const master = path.join(folder, "master.wav");
	const file = path.join(folder, "good.mp4");
	try {
		run([
			"-f",
			"lavfi",
			"-i",
			"anoisesrc=color=pink:r=48000:d=5:seed=42",
			"-af",
			"aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=9",
			"-ar",
			"48000",
			"-ac",
			"2",
			"-c:a",
			"pcm_s24le",
			master,
		]);
		run([
			"-f",
			"lavfi",
			"-i",
			"testsrc2=s=320x180:r=24:d=5",
			"-i",
			master,
			"-map",
			"0:v",
			"-map",
			"1:a",
			"-c:v",
			"libx264",
			"-preset",
			"fast",
			"-threads",
			"2",
			"-c:a",
			"aac",
			"-b:a",
			"320k",
			file,
		]);
		const base = {
			file,
			master,
			fps: "24/1",
			frames: "120",
			width: "320",
			height: "180",
			"sample-frames": "0,60,119",
		};
		const result = await verifyDelivery({
			...base,
			"report-dir": path.join(folder, "passed"),
		});
		assert.equal(result.state, "passed-automated-checks");
		assert.equal(result.privacyReview, "pending-human-review");
		assert.equal(result.manualVisualReview, "pending");
		assert.equal(result.samples.length, 3);
		assert(result.audioSync.every((x) => x.lagMs === 0));
		await assert.rejects(
			verifyDelivery({
				...base,
				frames: "121",
				"report-dir": path.join(folder, "wrong-count"),
			}),
			/frame count or duration/,
		);
		await assert.rejects(
			verifyDelivery({
				...base,
				"require-resolve": true,
				"report-dir": path.join(folder, "wrong-origin"),
			}),
			/Not a native Resolve/,
		);
		const dark = path.join(folder, "dark.mp4");
		run([
			"-f",
			"lavfi",
			"-i",
			"color=black:s=320x180:r=24:d=5",
			"-i",
			master,
			"-map",
			"0:v",
			"-map",
			"1:a",
			"-c:v",
			"libx264",
			"-threads",
			"2",
			"-c:a",
			"copy",
			dark,
		]);
		await assert.rejects(
			verifyDelivery({
				...base,
				file: dark,
				"report-dir": path.join(folder, "black"),
			}),
			/Black intervals/,
		);
		const failed = JSON.parse(
			fs.readFileSync(path.join(folder, "black/report.json"), "utf8"),
		);
		const receipt = path.join(folder, "review.json");
		fs.writeFileSync(
			receipt,
			JSON.stringify({
				videoSha256: failed.inputSha256,
				reviewedBy: "synthetic-test",
				intervals: failed.blackIntervals.map((x) => ({
					...x,
					reason: "Deliberate all-black fixture",
				})),
			}),
		);
		const reviewed = await verifyDelivery({
			...base,
			file: dark,
			"black-review": receipt,
			"report-dir": path.join(folder, "reviewed"),
		});
		assert.equal(reviewed.state, "passed-automated-checks");
		assert.equal(reviewed.privacyReview, "pending-human-review");
		fs.writeFileSync(
			receipt,
			JSON.stringify({
				videoSha256: "0".repeat(64),
				reviewedBy: "synthetic-test",
				intervals: [],
			}),
		);
		await assert.rejects(
			verifyDelivery({
				...base,
				file: dark,
				"black-review": receipt,
				"report-dir": path.join(folder, "wrong-review"),
			}),
			/different output/,
		);
	} finally {
		fs.rmSync(folder, { recursive: true }); // Only this disposable test fixture created by mkdtemp.
	}
});
