export function validateLocationCues(cues, durationSec) {
	if (cues === undefined) return;
	if (!Array.isArray(cues)) throw new Error("Location cues must be an array");
	if (!Number.isFinite(durationSec) || durationSec <= 0)
		throw new Error("Invalid episode duration");
	let previousEnd = 0;
	for (const cue of cues) {
		if (
			!cue ||
			!Number.isFinite(cue.startSec) ||
			!Number.isFinite(cue.endSec) ||
			cue.startSec < previousEnd ||
			cue.endSec <= cue.startSec ||
			cue.endSec > durationSec
		)
			throw new Error(
				"Location cues must be ordered, non-overlapping intervals within the episode",
			);
		if (typeof cue.name !== "string" || !cue.name.trim())
			throw new Error("Location cue needs a place name");
		if (cue.romanized !== undefined && typeof cue.romanized !== "string")
			throw new Error("Location romanization must be text");
		if (
			cue.style !== undefined &&
			!["pill", "sticker", "glass", "editorial"].includes(cue.style)
		)
			throw new Error("Unknown location label style");
		previousEnd = cue.endSec;
	}
}

export function findActiveLocation(cues, t) {
	let lo = 0;
	let hi = cues.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const cue = cues[mid];
		if (t < cue.startSec) hi = mid - 1;
		else if (t >= cue.endSec) lo = mid + 1;
		else return cue;
	}
	return null;
}
