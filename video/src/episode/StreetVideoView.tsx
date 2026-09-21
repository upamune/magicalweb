import {
	AbsoluteFill,
	OffthreadVideo,
	Sequence,
	staticFile,
	useVideoConfig,
} from "remotion";
import type { EpisodeData, EpisodeVideoSegment } from "../types";
import { EpisodeCaption, findCaptionPage } from "./EpisodeCaption";
import { EpisodeSpeakerBar } from "./EpisodeSpeakerBar";
import { segmentFrames } from "./videoTimeline.mjs";

export function StreetVideoView({
	data,
	segment,
	t,
}: { data: EpisodeData; segment: EpisodeVideoSegment; t: number }) {
	const { fps } = useVideoConfig();
	const { from, durationInFrames, startFrom } = segmentFrames(segment, fps);
	const page = findCaptionPage(data.pages, t);
	return (
		<AbsoluteFill style={{ backgroundColor: "black" }}>
			<Sequence
				key={`${segment.file}-${segment.timelineStartSec}`}
				from={from}
				durationInFrames={durationInFrames}
			>
				{/* Remotion 4.0.243 uses startFrom, not trimBefore. Camera audio stays muted. */}
				<OffthreadVideo
					src={staticFile(segment.file)}
					startFrom={startFrom}
					muted
					style={{ width: "100%", height: "100%", objectFit: "cover" }}
				/>
			</Sequence>
			{page && (
				<div
					style={{
						position: "absolute",
						left: 80,
						right: 80,
						bottom: 64,
						display: "flex",
						alignItems: "center",
						gap: 36,
					}}
				>
					<EpisodeSpeakerBar activeSpeaker={page.speaker ?? null} />
					<div style={{ flex: 1, minWidth: 0 }}>
						<EpisodeCaption page={page} />
					</div>
				</div>
			)}
		</AbsoluteFill>
	);
}
