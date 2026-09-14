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
			<div
				style={{
					position: "absolute",
					bottom: 0,
					left: 0,
					right: 0,
					height: 310,
					background: "linear-gradient(transparent, rgba(0,0,0,0.78) 35%)",
				}}
			/>
			<div style={{ position: "absolute", left: 160, right: 160, bottom: 140 }}>
				<EpisodeCaption page={page} t={t} />
			</div>
			<div style={{ position: "absolute", left: 72, right: 72, bottom: 48 }}>
				<EpisodeSpeakerBar activeSpeaker={page?.speaker ?? null} />
			</div>
		</AbsoluteFill>
	);
}
