// [start, end): adjacent segments never render together. Gaps use Classic.
export function findActiveVideoSegment(segments, t) {
	return (
		segments.find((s) => t >= s.timelineStartSec && t < s.timelineEndSec) ??
		null
	);
}

export function segmentFrames(segment, fps) {
	const from = Math.ceil(segment.timelineStartSec * fps);
	return {
		from,
		durationInFrames: Math.ceil(segment.timelineEndSec * fps) - from,
		// Account for the fractional master-frame boundary before rounding source trim.
		startFrom: Math.round(
			(segment.sourceStartSec + from / fps - segment.timelineStartSec) * fps,
		),
	};
}

export function validateCleanFileName(file) {
	if (
		typeof file !== "string" ||
		!/^[a-zA-Z0-9][a-zA-Z0-9._-]*-clean\.(mp4|mov|webm)$/i.test(file)
	) {
		throw new Error(
			`Expected a local *-clean.mp4/.mov/.webm basename: ${file}`,
		);
	}
}

export function validateVideoSegments(segments, durationSec, fps) {
	if (
		!Number.isFinite(durationSec) ||
		durationSec <= 0 ||
		!Number.isFinite(fps) ||
		fps <= 0
	) {
		throw new Error(
			"Episode durationSec and fps must be positive finite numbers",
		);
	}
	if (segments === undefined) return;
	if (!Array.isArray(segments))
		throw new Error("videoSegments must be an array");
	for (const [i, s] of segments.entries()) {
		if (!s || typeof s !== "object")
			throw new Error(`Invalid video segment ${i}`);
		validateCleanFileName(s.file);
		for (const key of [
			"timelineStartSec",
			"timelineEndSec",
			"sourceStartSec",
		]) {
			if (!Number.isFinite(s[key]) || s[key] < 0)
				throw new Error(`segment ${i}: invalid ${key}`);
		}
		if (
			s.timelineEndSec <= s.timelineStartSec ||
			s.timelineEndSec > durationSec
		) {
			throw new Error(`segment ${i}: timeline range outside episode or empty`);
		}
		if (segmentFrames(s, fps).durationInFrames <= 0)
			throw new Error(`segment ${i}: contains no output frame`);
	}
	const sorted = [...segments].sort(
		(a, b) => a.timelineStartSec - b.timelineStartSec,
	);
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i].timelineStartSec < sorted[i - 1].timelineEndSec)
			throw new Error("Overlapping video segments");
	}
}
