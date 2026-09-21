import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export function rational(value) {
	assert.match(value, /^\d+(?:\/\d+)?$/, "Use an exact FPS such as 24000/1001");
	const [n, d = "1"] = value.split("/").map(Number);
	assert(n > 0 && Number(d) > 0, "FPS must be positive");
	return n / Number(d);
}

function number(value, name, minimum = 0) {
	const result = Number(value);
	assert(Number.isFinite(result) && result >= minimum, `Invalid ${name}`);
	return result;
}

async function hash(file) {
	const digest = createHash("sha256");
	for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
	return digest.digest("hex");
}

function probe(file) {
	return JSON.parse(
		execFileSync(
			"ffprobe",
			["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
			{ encoding: "utf8" },
		),
	);
}

function pcm(file, start, duration) {
	const bytes = execFileSync(
		"ffmpeg",
		[
			"-v",
			"error",
			"-ss",
			String(start),
			"-i",
			file,
			"-t",
			String(duration),
			"-vn",
			"-ac",
			"1",
			"-ar",
			"8000",
			"-f",
			"f32le",
			"-",
		],
		{ maxBuffer: 8 * 1024 * 1024 },
	);
	const copy = Uint8Array.from(bytes);
	return new Float32Array(copy.buffer);
}

export function correlate(reference, rendered, sampleRate = 8000) {
	const margin = Math.round(sampleRate * 0.15);
	const end = Math.min(reference.length, rendered.length) - margin;
	assert(end > margin, "Audio comparison window is too short");
	let best = { correlation: -1, lagMs: 0 };
	for (let lag = -margin; lag <= margin; lag++) {
		let dot = 0;
		let a2 = 0;
		let b2 = 0;
		for (let i = margin; i < end; i++) {
			const a = reference[i];
			const b = rendered[i + lag];
			dot += a * b;
			a2 += a * a;
			b2 += b * b;
		}
		const correlation = dot / Math.sqrt(a2 * b2);
		if (Number.isFinite(correlation) && correlation > best.correlation)
			best = { correlation, lagMs: (lag * 1000) / sampleRate };
	}
	assert(
		best.correlation >= 0,
		"No useful shared audio; choose non-silent comparison times",
	);
	return best;
}

export async function verifyDelivery(options) {
	const file = path.resolve(options.file);
	const master = path.resolve(options.master);
	const directory = path.resolve(options["report-dir"]);
	const fps = rational(options.fps);
	const frames = number(options.frames, "frames", 1);
	assert(Number.isSafeInteger(frames));
	const width = number(options.width ?? "1920", "width", 1);
	const height = number(options.height ?? "1080", "height", 1);
	const target = number(options["target-lufs"] ?? "-16", "target LUFS", -70);
	assert(target <= -5, "Target LUFS must be between -70 and -5");
	const offset = number(options["master-offset"] ?? "0", "master offset");
	const duration = frames / fps;
	assert(
		duration >= 1,
		"Use a preview at least one second long for audio checks",
	);
	const samples = [
		...new Set(
			options["sample-frames"]
				? options["sample-frames"]
						.split(",")
						.map((x) => number(x, "sample frame"))
				: [
						0,
						...[0.1, 0.5, 0.8].map((x) => Math.floor(x * frames)),
						frames - 1,
					],
		),
	];
	assert(
		samples.every((n) => Number.isSafeInteger(n) && n < frames),
		"Sample frame outside video",
	);
	samples.sort((a, b) => a - b);
	const window = Math.min(4, duration);
	const times = options["sync-times"]
		? options["sync-times"].split(",").map((x) => number(x, "sync time"))
		: [0, 0.25, 0.5, 0.75, 1].map((x) => x * Math.max(0, duration - window));
	assert(
		times.length && times.every((t) => t + window <= duration + 0.0001),
		"Sync window outside video",
	);
	fs.mkdirSync(directory); // A new directory prevents stale receipts or overwriting prior checks.
	const report = {
		state: "checking",
		file,
		master,
		privacyReview: "pending-human-review",
		manualVisualReview: "pending",
		samples: [],
	};
	const save = () =>
		fs.writeFileSync(
			path.join(directory, "report.json"),
			`${JSON.stringify(report, null, 2)}\n`,
		);
	try {
		report.inputSha256 = await hash(file);
		report.masterSha256 = await hash(master);
		const metadata = probe(file);
		const video = metadata.streams.find((s) => s.codec_type === "video");
		const audio = metadata.streams.find((s) => s.codec_type === "audio");
		assert(
			video && video.width === width && video.height === height,
			"Unexpected video dimensions",
		);
		assert(
			Math.abs(rational(video.r_frame_rate) - fps) < 1e-9 &&
				Math.abs(rational(video.avg_frame_rate) - fps) < 1e-9,
			"Unexpected frame rate",
		);
		assert(
			Number(video.nb_frames) === frames &&
				Math.abs(Number(video.duration) - duration) < 0.002,
			"Unexpected frame count or duration",
		);
		assert(
			Math.abs(Number(video.start_time)) < 0.002,
			"Video must start at zero",
		);
		assert(
			audio &&
				audio.channels === 2 &&
				audio.sample_rate === "48000" &&
				Math.abs(Number(audio.duration) - duration) < 0.15 &&
				Math.abs(Number(audio.start_time)) < 0.002,
			"Audio layout, start or duration mismatch",
		);
		if (options["require-resolve"])
			assert(
				metadata.format.tags?.encoder?.includes("DaVinci Resolve"),
				"Not a native Resolve export",
			);
		report.format = {
			width,
			height,
			fps: options.fps,
			frames,
			durationSeconds: Number(video.duration),
			encoder: metadata.format.tags?.encoder,
			sizeBytes: Number(metadata.format.size),
		};
		const measured = spawnSync(
			"ffmpeg",
			[
				"-hide_banner",
				"-nostats",
				"-xerror",
				"-i",
				file,
				"-vn",
				"-af",
				"ebur128=peak=true:framelog=verbose",
				"-f",
				"null",
				"-",
			],
			{ encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
		);
		fs.writeFileSync(
			path.join(directory, "audio-decode.log"),
			measured.stderr ?? "",
		);
		assert.equal(measured.status, 0, "AAC decode failed");
		const integrated = Number(
			measured.stderr.match(/Integrated loudness:\s*I:\s*([\d.-]+) LUFS/)?.[1],
		);
		const peak = Number(
			measured.stderr.match(/True peak:\s*Peak:\s*([\d.-]+) dBFS/)?.[1],
		);
		report.loudness = {
			integratedLUFS: integrated,
			truePeakDBTP: peak,
			targetLUFS: target,
		};
		assert(
			Number.isFinite(integrated) &&
				Math.abs(integrated - target) <= 0.5 &&
				Number.isFinite(peak) &&
				peak <= -1,
			"Loudness or true peak outside target",
		);
		report.audioSync = times.map((time) => ({
			timeSeconds: time,
			masterTimeSeconds: time + offset,
			...correlate(pcm(master, time + offset, window), pcm(file, time, window)),
		}));
		assert(
			report.audioSync.every(
				(x) => x.correlation >= 0.95 && Math.abs(x.lagMs) <= 25,
			),
			"Rendered audio mismatch or delay",
		);
		save();
		console.log(
			"Format, loudness and audio sync passed; decoding the whole video...",
		);
		const selection = samples.map((n) => `eq(n\\,${n})`).join("+");
		const decoded = spawnSync(
			"ffmpeg",
			[
				"-hide_banner",
				"-nostats",
				"-xerror",
				"-threads",
				"4",
				"-i",
				file,
				"-an",
				"-vf",
				`blackdetect=d=0.04:pic_th=0.99,select='${selection}',scale=960:-2`,
				"-fps_mode",
				"vfr",
				path.join(directory, "frame-%03d.png"),
			],
			{ encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
		);
		fs.writeFileSync(
			path.join(directory, "video-decode.log"),
			decoded.stderr ?? "",
		);
		assert.equal(decoded.status, 0, "Full video decode failed");
		report.fullDecodePassed = true;
		report.blackIntervals = [
			...decoded.stderr.matchAll(
				/black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g,
			),
		].map((x) => ({
			start: Number(x[1]),
			end: Number(x[2]),
			duration: Number(x[3]),
		}));
		report.samples = samples.map((frame, i) => ({
			frame,
			timeSeconds: frame / fps,
			image: path.join(
				directory,
				`frame-${String(i + 1).padStart(3, "0")}.png`,
			),
		}));
		assert(
			report.samples.every((x) => fs.existsSync(x.image)),
			"Missing visual inspection frame",
		);
		if (options["black-review"]) {
			const review = JSON.parse(
				fs.readFileSync(options["black-review"], "utf8"),
			);
			assert.equal(
				review.videoSha256,
				report.inputSha256,
				"Black review belongs to a different output",
			);
			assert(
				typeof review.reviewedBy === "string" && review.reviewedBy.trim(),
				"Black review requires a named reviewer",
			);
			assert(
				Array.isArray(review.intervals) &&
					review.intervals.length === report.blackIntervals.length,
				"Black review interval count mismatch",
			);
			for (const [i, interval] of report.blackIntervals.entries()) {
				const accepted = review.intervals[i];
				assert(
					Number.isFinite(accepted.start) &&
						Number.isFinite(accepted.end) &&
						Math.abs(accepted.start - interval.start) <= 1 / fps &&
						Math.abs(accepted.end - interval.end) <= 1 / fps &&
						typeof accepted.reason === "string" &&
						accepted.reason.trim(),
					"Black review interval/reason mismatch",
				);
			}
			report.blackReview = review;
		} else
			assert.equal(
				report.blackIntervals.length,
				0,
				"Black intervals require review",
			);
		if (options.drp) {
			const drp = path.resolve(options.drp);
			execFileSync("unzip", ["-t", drp], { maxBuffer: 16 * 1024 * 1024 });
			report.projectBackup = {
				file: drp,
				archiveIntegrityPassed: true,
				sha256: await hash(drp),
				containsMedia: false,
			};
		}
		assert.equal(
			await hash(file),
			report.inputSha256,
			"Video changed during verification",
		);
		assert.equal(
			await hash(master),
			report.masterSha256,
			"Master changed during verification",
		);
		report.state = "passed-automated-checks";
		report.note =
			"Open the sample images; this does not certify full human caption or privacy review.";
		save();
		console.log(path.join(directory, "report.json"));
		return report;
	} catch (error) {
		report.state = "failed";
		report.error = String(error.message);
		save();
		throw error;
	}
}

async function main() {
	const { values } = parseArgs({
		options: Object.fromEntries([
			...[
				"file",
				"master",
				"fps",
				"frames",
				"report-dir",
				"width",
				"height",
				"target-lufs",
				"master-offset",
				"sync-times",
				"sample-frames",
				"drp",
				"black-review",
			].map((key) => [key, { type: "string" }]),
			["require-resolve", { type: "boolean" }],
			["help", { type: "boolean" }],
		]),
	});
	if (values.help) {
		console.log(
			"node verify_delivery.mjs --file VIDEO --master WAV --fps N/D --frames N --report-dir NEW_DIR [--require-resolve] [--drp FILE] [--sample-frames 0,100] [--sync-times 7,22] [--master-offset 100] [--width 1920 --height 1080 --target-lufs -16] [--black-review REVIEW_JSON]",
		);
		return;
	}
	for (const key of ["file", "master", "fps", "frames", "report-dir"])
		assert(values[key], `Missing --${key}`);
	await verifyDelivery(values);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
