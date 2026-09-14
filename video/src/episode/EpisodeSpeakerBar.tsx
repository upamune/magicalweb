import { Img, staticFile } from "remotion";
import { BODY, HOSTS } from "../Clip";
import { C } from "../tokens";
import type { Speaker } from "../types";

export function EpisodeSpeakerBar({
	activeSpeaker,
}: { activeSpeaker: Speaker | null }) {
	return (
		<div
			style={{
				display: "flex",
				justifyContent: "center",
				gap: 48,
				fontFamily: BODY,
			}}
		>
			{(["michiru", "upamune"] as const).map((speaker) => {
				const active = activeSpeaker === speaker;
				const host = HOSTS[speaker];
				return (
					<div
						key={speaker}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 16,
							opacity: active ? 1 : 0.65,
						}}
					>
						<Img
							src={staticFile(host.avatar)}
							style={{
								width: 64,
								height: 64,
								borderRadius: "50%",
								objectFit: "cover",
								border: `4px solid ${active ? C.sun : "white"}`,
								transform: `scale(${active ? 1.08 : 1})`,
							}}
						/>
						<span
							style={{
								color: active ? C.sun : "white",
								fontSize: 28,
								fontWeight: 700,
							}}
						>
							{host.name}
						</span>
					</div>
				);
			})}
		</div>
	);
}
