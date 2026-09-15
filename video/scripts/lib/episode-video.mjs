import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
	segmentFrames,
	validateCleanFileName,
	validateVideoSegments,
} from "../../src/episode/videoTimeline.mjs";

export function hashFile(file) {
	const hash = createHash("sha256");
	const fd = fs.openSync(file, "r");
	try {
		const buffer = Buffer.alloc(1024 * 1024);
		for (;;) {
			const size = fs.readSync(fd, buffer, 0, buffer.length, null);
			if (size === 0) break;
			hash.update(buffer.subarray(0, size));
		}
	} finally {
		fs.closeSync(fd);
	}
	return hash.digest("hex");
}

export function probeVideo(file) {
	const info = JSON.parse(
		execFileSync(
			"ffprobe",
			[
				"-v",
				"error",
				"-select_streams",
				"v:0",
				"-show_entries",
				"stream=duration,codec_name,width,height,pix_fmt",
				"-of",
				"json",
				file,
			],
			{ encoding: "utf8" },
		),
	);
	const stream = info.streams?.[0];
	const duration = Number(stream?.duration);
	// Container duration may include longer audio. Require the actual video stream duration.
	if (!stream || !Number.isFinite(duration) || duration <= 0)
		throw new Error(
			`Cannot establish video stream duration: ${file}. Export H.264 MP4 from Resolve.`,
		);
	return {
		duration,
		codec: stream.codec_name,
		pixelFormat: stream.pix_fmt,
		width: stream.width,
		height: stream.height,
	};
}

export function cleanAsset(directory, name) {
	validateCleanFileName(name);
	const file = path.join(directory, name);
	const real = fs.realpathSync(file);
	validateCleanFileName(path.basename(real));
	if (!fs.statSync(real).isFile()) throw new Error(`Not a video file: ${file}`);
	return file;
}

export function validateSourceRange(segment, duration, fps) {
	const length = segment.timelineEndSec - segment.timelineStartSec;
	if (
		segment.sourceStartSec >= duration ||
		segment.sourceStartSec + length > duration
	)
		throw new Error(`Source range exceeds video duration: ${segment.file}`);
	const frames = segmentFrames(segment, fps);
	if ((frames.startFrom + frames.durationInFrames - 1) / fps >= duration)
		throw new Error(
			`Last rendered source frame exceeds video duration: ${segment.file}`,
		);
}

export function validatePreparedVideo(data, publicDir) {
	validateVideoSegments(data.videoSegments, data.durationSec, data.fps);
	if (!data.videoSegments?.length) return;
	const receipt = JSON.parse(
		fs.readFileSync(path.join(publicDir, "episode-video-review.json"), "utf8"),
	);
	if (
		receipt.version !== 1 ||
		receipt.episodeNumber !== data.episode.number ||
		JSON.stringify(receipt.videoSegments) !== JSON.stringify(data.videoSegments)
	)
		throw new Error(
			"Video review receipt does not match this episode; run prepare-episode-video.mjs again",
		);
	if (receipt.audioSha256 !== hashFile(path.join(publicDir, data.audioFile)))
		throw new Error(
			"Master audio changed since video preparation; verify synchronization and prepare again",
		);
	const checked = new Map();
	for (const segment of data.videoSegments) {
		let info = checked.get(segment.file);
		if (!info) {
			const file = cleanAsset(publicDir, segment.file);
			if (receipt.files?.[segment.file] !== hashFile(file))
				throw new Error(
					`Clean video changed or is not reviewed: ${segment.file}`,
				);
			info = probeVideo(file);
			checked.set(segment.file, info);
		}
		validateSourceRange(segment, info.duration, data.fps);
	}
}

// Include every local public asset: avatars/artwork affect frames just like video.
// Sorting gives stable keys; hashes follow symlinks so replacing targets invalidates cache.
export function renderFingerprint(videoDir, propsPath, options) {
	const hash = createHash("sha256");
	hash.update(JSON.stringify({ version: 1, ...options }));
	function include(file, label) {
		hash.update(JSON.stringify([label, hashFile(file)]));
	}
	function walk(directory, prefix) {
		for (const entry of fs
			.readdirSync(directory, { withFileTypes: true })
			.sort((a, b) => a.name.localeCompare(b.name))) {
			const file = path.join(directory, entry.name);
			const label = `${prefix}/${entry.name}`;
			if (entry.isDirectory()) walk(file, label);
			else if (fs.statSync(file).isFile()) include(file, label);
		}
	}
	include(propsPath, "props");
	for (const dir of ["src", "public"]) walk(path.join(videoDir, dir), dir);
	for (const name of [
		"package.json",
		"bun.lock",
		"remotion.config.ts",
		"scripts/render-episode.mjs",
		"scripts/lib/episode-video.mjs",
	])
		include(path.join(videoDir, name), name);
	return hash.digest("hex");
}
