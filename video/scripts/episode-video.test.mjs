import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
	findActiveVideoSegment,
	segmentFrames,
	validateVideoSegments,
} from "../src/episode/videoTimeline.mjs";
import {
	hashFile,
	renderFingerprint,
	validatePreparedVideo,
	validateSourceRange,
} from "./lib/episode-video.mjs";

const segment = {
	file: "osmo-clean.mp4",
	timelineStartSec: 767,
	timelineEndSec: 770,
	sourceStartSec: 3.8,
};

test("master timeline: gaps, exact boundaries, adjacent segments and unsorted inputs", () => {
	const next = { ...segment, timelineStartSec: 770, timelineEndSec: 772 };
	const segments = [next, segment];
	validateVideoSegments(segments, 800, 24);
	assert.equal(findActiveVideoSegment(segments, 766.999), null);
	assert.equal(findActiveVideoSegment(segments, 767), segment);
	assert.equal(findActiveVideoSegment(segments, 770), next);
	assert.equal(findActiveVideoSegment(segments, 772), null);
	assert.doesNotThrow(() => validateVideoSegments(undefined, 800, 24));
});

test("source trim preserves physical synchronization within half an output frame", () => {
	for (const start of [767, 767.01, 767.041, 767.999]) {
		const s = { ...segment, timelineStartSec: start };
		const frames = segmentFrames(s, 24);
		for (const frame of [
			frames.from,
			frames.from + 1,
			frames.from + frames.durationInFrames - 1,
		]) {
			const actual = (frames.startFrom + frame - frames.from) / 24;
			const expected = s.sourceStartSec + frame / 24 - s.timelineStartSec;
			assert.ok(Math.abs(actual - expected) <= 0.5 / 24 + 1e-10);
		}
	}
	assert.equal(segmentFrames(segment, 24).startFrom, 91);
});

test("invalid manifests fail instead of being repaired", () => {
	for (const overrides of [
		{ timelineStartSec: -1 },
		{ timelineEndSec: 767 },
		{ timelineEndSec: 801 },
		{ sourceStartSec: -1 },
		{ sourceStartSec: Number.NaN },
		{ timelineEndSec: Number.POSITIVE_INFINITY },
		{ sourceStartSec: "1" },
		{ file: "osmo.mp4" },
		{ file: "/osmo-clean.mp4" },
		{ file: "../osmo-clean.mp4" },
		{ file: "https://host/osmo-clean.mp4" },
	])
		assert.throws(() =>
			validateVideoSegments([{ ...segment, ...overrides }], 800, 24),
		);
	assert.throws(
		() =>
			validateVideoSegments(
				[segment, { ...segment, timelineStartSec: 769 }],
				800,
				24,
			),
		/Overlapping/,
	);
	assert.throws(() => validateVideoSegments(null, 800, 24));
	assert.throws(() => validateVideoSegments([], 800, 0));
	assert.throws(() => validateSourceRange(segment, 6.7, 24), /exceeds/);
	assert.doesNotThrow(() => validateSourceRange(segment, 6.8, 24));
});

test("prepare validates before mutation, removes camera audio and binds reviewed files to the master", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "episode-video-test-"));
	try {
		for (const dir of [
			"scripts/lib",
			"src/episode",
			"src/data",
			"public",
			"work/ep-1/processed",
		])
			fs.mkdirSync(path.join(root, dir), { recursive: true });
		const videoDir = path.resolve(import.meta.dirname, "..");
		for (const file of [
			"scripts/prepare-episode-video.mjs",
			"scripts/lib/episode-video.mjs",
			"src/episode/videoTimeline.mjs",
		])
			fs.copyFileSync(path.join(videoDir, file), path.join(root, file));
		const source = path.join(root, "work/ep-1/processed/test-clean.mp4");
		execFileSync("ffmpeg", [
			"-v",
			"error",
			"-y",
			"-f",
			"lavfi",
			"-i",
			"color=c=blue:s=160x90:r=24:d=2",
			"-f",
			"lavfi",
			"-i",
			"sine=frequency=880:duration=2",
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			source,
		]);
		const propsPath = path.join(root, "src/data/episode.json");
		const base = {
			data: {
				episode: { number: 1 },
				durationSec: 4,
				fps: 24,
				audioFile: "episode.mp3",
			},
		};
		fs.writeFileSync(propsPath, JSON.stringify(base));
		fs.writeFileSync(
			path.join(root, "public/episode.mp3"),
			"test master identity",
		);
		const manifestPath = path.join(root, "work/ep-1/manifest.json");
		const good = {
			file: "test-clean.mp4",
			timelineStartSec: 1,
			timelineEndSec: 2,
			sourceStartSec: 0.5,
		};
		const prepare = (...args) =>
			execFileSync(
				process.execPath,
				[
					path.join(root, "scripts/prepare-episode-video.mjs"),
					manifestPath,
					...args,
				],
				{ stdio: "pipe" },
			);
		fs.writeFileSync(manifestPath, JSON.stringify({ videoSegments: [good] }));
		assert.throws(() => prepare(), /Review the clean video/);
		assert.deepEqual(JSON.parse(fs.readFileSync(propsPath)), base);
		fs.writeFileSync(
			manifestPath,
			JSON.stringify({
				videoSegments: [
					good,
					{
						...good,
						timelineStartSec: 3,
						timelineEndSec: 4,
						sourceStartSec: 1.5,
					},
				],
			}),
		);
		assert.throws(() => prepare("--reviewed"), /Source range exceeds/);
		assert.deepEqual(JSON.parse(fs.readFileSync(propsPath)), base);
		fs.writeFileSync(manifestPath, JSON.stringify({ videoSegments: [good] }));
		prepare("--reviewed");
		const { data } = JSON.parse(fs.readFileSync(propsPath));
		const publicDir = path.join(root, "public");
		validatePreparedVideo(data, publicDir);
		const output = path.join(publicDir, data.videoSegments[0].file);
		const streams = JSON.parse(
			execFileSync("ffprobe", [
				"-v",
				"error",
				"-show_streams",
				"-of",
				"json",
				output,
			]),
		);
		assert.ok(streams.streams.every((s) => s.codec_type === "video"));
		assert.equal(data.videoSegments[0].sourceStartSec, 0.5);
		// The design's MOV input must go through the H.264 normalization branch.
		const mov = source.replace(/\.mp4$/, ".mov");
		execFileSync("ffmpeg", [
			"-v",
			"error",
			"-y",
			"-i",
			source,
			"-c",
			"copy",
			mov,
		]);
		fs.writeFileSync(
			manifestPath,
			JSON.stringify({ videoSegments: [{ ...good, file: "test-clean.mov" }] }),
		);
		prepare("--reviewed");
		validatePreparedVideo(
			JSON.parse(fs.readFileSync(propsPath)).data,
			publicDir,
		);
		fs.writeFileSync(manifestPath, JSON.stringify({ videoSegments: [good] }));
		prepare("--reviewed");
		const changed = structuredClone(data);
		changed.videoSegments[0].sourceStartSec = 0;
		assert.throws(() => validatePreparedVideo(changed, publicDir), /receipt/);
		fs.appendFileSync(path.join(publicDir, "episode.mp3"), "changed");
		assert.throws(
			() => validatePreparedVideo(data, publicDir),
			/Master audio changed/,
		);
		fs.writeFileSync(
			path.join(publicDir, "episode.mp3"),
			"test master identity",
		);
		fs.appendFileSync(output, "changed");
		assert.throws(
			() => validatePreparedVideo(data, publicDir),
			/Clean video changed/,
		);
		fs.unlinkSync(output);
		assert.throws(() => validatePreparedVideo(data, publicDir), /ENOENT/);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("render cache invalidates on content, props, source, and chunk options", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "episode-cache-test-"));
	try {
		for (const dir of ["src", "public", "scripts/lib"])
			fs.mkdirSync(path.join(root, dir), { recursive: true });
		for (const file of [
			"src/props.json",
			"src/Episode.tsx",
			"public/episode.mp3",
			"public/osmo-clean.mp4",
			"package.json",
			"bun.lock",
			"remotion.config.ts",
			"scripts/render-episode.mjs",
			"scripts/lib/episode-video.mjs",
		])
			fs.writeFileSync(path.join(root, file), "original");
		const props = path.join(root, "src/props.json");
		const key = () => renderFingerprint(root, props, { chunk: 2000 });
		const original = key();
		assert.equal(key(), original);
		for (const file of [
			"public/osmo-clean.mp4",
			"public/episode.mp3",
			"src/props.json",
			"src/Episode.tsx",
		]) {
			const full = path.join(root, file);
			fs.writeFileSync(full, "modified");
			assert.notEqual(key(), original);
			fs.writeFileSync(full, "original");
		}
		assert.notEqual(renderFingerprint(root, props, { chunk: 1000 }), original);
		assert.equal(hashFile(props).length, 64);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});
