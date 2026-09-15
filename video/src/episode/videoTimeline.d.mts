import type { EpisodeVideoSegment } from "../types";
export function findActiveVideoSegment(
	segments: EpisodeVideoSegment[],
	t: number,
): EpisodeVideoSegment | null;
export function segmentFrames(
	segment: EpisodeVideoSegment,
	fps: number,
): { from: number; durationInFrames: number; startFrom: number };
export function validateCleanFileName(file: unknown): void;
export function validateVideoSegments(
	segments: unknown,
	durationSec: number,
	fps: number,
): void;
