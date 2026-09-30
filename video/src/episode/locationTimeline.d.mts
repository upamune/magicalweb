import type { EpisodeLocationCue } from "../types";

export function validateLocationCues(
	cues: EpisodeLocationCue[] | undefined,
	durationSec: number,
): void;
export function findActiveLocation(
	cues: EpisodeLocationCue[],
	t: number,
): EpisodeLocationCue | null;
