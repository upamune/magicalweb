import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { validateVideoSegments } from "../src/episode/videoTimeline.mjs";
import {
	cleanAsset,
	hashFile,
	probeVideo,
	validateSourceRange,
} from "./lib/episode-video.mjs";

// Manifest file paths are clean basenames relative to its sibling processed/ directory.
// --reviewed certifies a HUMAN has reviewed the exact clean files and used ranges.
const videoDir = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const reviewed = args.includes("--reviewed");
const positional = args.filter((arg) => arg !== "--reviewed");
if (positional.length !== 1 || positional[0].startsWith("--"))
	throw new Error(
		"Usage: bun scripts/prepare-episode-video.mjs work/ep-N/manifest.json [--reviewed]",
	);
const manifestPath = path.resolve(positional[0]);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const propsPath = path.join(videoDir, "src/data/episode.json");
const props = JSON.parse(fs.readFileSync(propsPath, "utf8"));
const { data } = props;
if (!Array.isArray(manifest.videoSegments))
	throw new Error("Manifest must contain videoSegments");
validateVideoSegments(manifest.videoSegments, data.durationSec, data.fps);
if (manifest.videoSegments.length && !reviewed)
	throw new Error(
		"Review the clean video and all used ranges in Resolve, then pass --reviewed. Automated detection is not approval.",
	);
const publicDir = path.join(videoDir, "public");
const sourceDir = path.join(path.dirname(manifestPath), "processed");
const sources = new Map();
// Validate every source BEFORE modifying any public asset or episode props.
for (const segment of manifest.videoSegments) {
	let asset = sources.get(segment.file);
	if (!asset) {
		const file = cleanAsset(sourceDir, segment.file);
		asset = { file, sha256: hashFile(file), ...probeVideo(file) };
		sources.set(segment.file, asset);
	}
	validateSourceRange(segment, asset.duration, data.fps);
}
const staging = fs.mkdtempSync(path.join(videoDir, ".episode-video-stage-"));
try {
	const files = {};
	const names = new Map();
	for (const [sourceName, asset] of sources) {
		// Content-addressed names keep old props valid if preparation fails midway.
		const file = `episode-video-${asset.sha256}-clean.mp4`;
		const staged = path.join(staging, file);
		// Normalize container, strip camera audio. Encode MOV/ProRes for browser preview.
		const copy =
			asset.codec === "h264" &&
			asset.pixelFormat === "yuv420p" &&
			sourceName.toLowerCase().endsWith(".mp4");
		execFileSync(
			"ffmpeg",
			[
				"-v",
				"error",
				"-y",
				"-i",
				asset.file,
				"-map",
				"0:v:0",
				"-an",
				"-map_metadata",
				"-1",
				"-c:v",
				copy ? "copy" : "libx264",
				...(copy
					? []
					: ["-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p"]),
				"-movflags",
				"+faststart",
				staged,
			],
			{ stdio: "inherit" },
		);
		if (hashFile(asset.file) !== asset.sha256)
			throw new Error(`Source changed during preparation: ${sourceName}`);
		const prepared = probeVideo(staged);
		for (const segment of manifest.videoSegments.filter(
			(s) => s.file === sourceName,
		))
			validateSourceRange(segment, prepared.duration, data.fps);
		files[file] = hashFile(staged);
		names.set(sourceName, file);
	}
	const videoSegments = manifest.videoSegments.map(
		({ file, timelineStartSec, timelineEndSec, sourceStartSec }) => ({
			file: names.get(file),
			timelineStartSec,
			timelineEndSec,
			sourceStartSec,
		}),
	);
	const receipt = {
		version: 1,
		episodeNumber: data.episode.number,
		reviewedAt: new Date().toISOString(),
		audioSha256: hashFile(path.join(publicDir, data.audioFile)),
		videoSegments,
		files,
		sources: Object.fromEntries(
			[...sources].map(([name, asset]) => [name, asset.sha256]),
		),
	};
	for (const file of Object.keys(files))
		fs.renameSync(path.join(staging, file), path.join(publicDir, file));
	fs.writeFileSync(
		path.join(staging, "receipt.json"),
		`${JSON.stringify(receipt, null, "\t")}\n`,
	);
	fs.renameSync(
		path.join(staging, "receipt.json"),
		path.join(publicDir, "episode-video-review.json"),
	);
	const next = { ...props, data: { ...data, videoSegments } };
	fs.writeFileSync(path.join(staging, "episode.json"), JSON.stringify(next));
	fs.renameSync(path.join(staging, "episode.json"), propsPath);
	console.error(
		`Prepared ${videoSegments.length} video segments. Check transitions with Remotion Studio before final rendering.`,
	);
} finally {
	fs.rmSync(staging, { recursive: true, force: true });
}
