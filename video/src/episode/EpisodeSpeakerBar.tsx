import { Img, staticFile } from "remotion";
import { HOSTS } from "../Clip";
import type { Speaker } from "../types";

export const SPEAKER_COLORS: Record<Speaker, string> = {
	michiru: "#ff8bd8",
	upamune: "#65d9ff",
	guest: "#ffe366",
};

// Street view shows only the current host, immediately left of their telop.
export function EpisodeSpeakerBar({
	activeSpeaker,
}: { activeSpeaker: Speaker | null }) {
	if (!activeSpeaker || activeSpeaker === "guest") return null;
	const host = HOSTS[activeSpeaker];
	return (
		<Img
			src={staticFile(host.avatar)}
			alt={host.name}
			style={{
				width: 116,
				height: 116,
				flexShrink: 0,
				borderRadius: "50%",
				objectFit: "cover",
				border: "6px solid white",
				boxShadow: `0 0 0 4px ${SPEAKER_COLORS[activeSpeaker]}, 0 3px 5px #0008`,
			}}
		/>
	);
}
