import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useAudioStore } from "../store/audioStore";

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SKIP_SECONDS = 10;

function formatTime(time: number) {
	if (!Number.isFinite(time)) return "0:00";
	const minutes = Math.floor(time / 60);
	const seconds = Math.floor(time % 60);
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function AudioPlayer() {
	const audioRef = useRef<HTMLAudioElement>(null);
	const progressRef = useRef<HTMLDivElement>(null);
	const speedMenuRef = useRef<HTMLDivElement>(null);
	const [showSpeedMenu, setShowSpeedMenu] = useState(false);
	const [hoverTime, setHoverTime] = useState<number | null>(null);
	const [hoverPosition, setHoverPosition] = useState<number | null>(null);
	const [entered, setEntered] = useState(false);
	const [copied, setCopied] = useState(false);
	const {
		isPlaying,
		currentTime,
		duration,
		volume,
		playbackRate,
		episodeNumber,
		episodeSlug,
		episodeTitle,
		audioUrl,
		setPlaying,
		setCurrentTime,
		setDuration,
		setVolume,
		setPlaybackRate,
		close,
	} = useAudioStore();

	useEffect(() => {
		document.body.classList.toggle("has-player", episodeNumber !== null);
	}, [episodeNumber]);

	// 出現時にスライドイン（transitionを発火させるため2フレーム待つ）
	useEffect(() => {
		if (episodeNumber === null) {
			setEntered(false);
			return;
		}
		let raf2 = 0;
		const raf1 = requestAnimationFrame(() => {
			raf2 = requestAnimationFrame(() => setEntered(true));
		});
		return () => {
			cancelAnimationFrame(raf1);
			cancelAnimationFrame(raf2);
		};
	}, [episodeNumber]);

	// エピソード切り替え時のみ再生位置を復元したいので audioUrl だけを監視する
	// biome-ignore lint/correctness/useExhaustiveDependencies: 上記の意図的な依存配列
	useEffect(() => {
		if (audioRef.current && currentTime > 0) {
			audioRef.current.currentTime = currentTime;
		}
	}, [audioUrl]);

	useEffect(() => {
		if (audioRef.current) {
			if (isPlaying) {
				audioRef.current.play().catch(() => {
					setPlaying(false);
				});
			} else {
				audioRef.current.pause();
			}
		}
	}, [isPlaying, setPlaying]);

	useEffect(() => {
		if (audioRef.current) {
			audioRef.current.volume = volume;
		}
	}, [volume]);

	useEffect(() => {
		if (audioRef.current) {
			audioRef.current.playbackRate = playbackRate;
		}
	}, [playbackRate]);

	// スピードメニューの外側クリックで閉じる
	useEffect(() => {
		if (!showSpeedMenu) return;
		const handlePointerDown = (e: PointerEvent) => {
			if (
				speedMenuRef.current &&
				!speedMenuRef.current.contains(e.target as Node)
			) {
				setShowSpeedMenu(false);
			}
		};
		document.addEventListener("pointerdown", handlePointerDown);
		return () => document.removeEventListener("pointerdown", handlePointerDown);
	}, [showSpeedMenu]);

	// キーボードショートカットの処理
	useEffect(() => {
		const handleKeyPress = (e: KeyboardEvent) => {
			// テキスト入力中は無視
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			) {
				return;
			}

			switch (e.code) {
				case "Space":
					e.preventDefault();
					setPlaying(!isPlaying);
					break;
				case "ArrowLeft":
					e.preventDefault();
					handleSkip(-SKIP_SECONDS);
					break;
				case "ArrowRight":
					e.preventDefault();
					handleSkip(SKIP_SECONDS);
					break;
				case "KeyM":
					e.preventDefault();
					setVolume(volume === 0 ? 1 : 0);
					break;
				case "Comma":
					if (e.shiftKey) {
						e.preventDefault();
						const currentIndex = PLAYBACK_RATES.indexOf(playbackRate);
						if (currentIndex > 0) {
							setPlaybackRate(PLAYBACK_RATES[currentIndex - 1]);
						}
					}
					break;
				case "Period":
					if (e.shiftKey) {
						e.preventDefault();
						const currentIndex = PLAYBACK_RATES.indexOf(playbackRate);
						if (currentIndex < PLAYBACK_RATES.length - 1) {
							setPlaybackRate(PLAYBACK_RATES[currentIndex + 1]);
						}
					}
					break;
				case "Escape":
					e.preventDefault();
					close();
					break;
			}
		};

		window.addEventListener("keydown", handleKeyPress);
		return () => window.removeEventListener("keydown", handleKeyPress);
	}, [
		isPlaying,
		volume,
		playbackRate,
		setPlaying,
		setVolume,
		setPlaybackRate,
		close,
	]);

	const handleTimeUpdate = () => {
		if (audioRef.current) {
			setCurrentTime(audioRef.current.currentTime);
		}
	};

	const handleLoadedMetadata = () => {
		if (audioRef.current) {
			setDuration(audioRef.current.duration);
			if (currentTime > 0) {
				audioRef.current.currentTime = currentTime;
			}
		}
	};

	const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!progressRef.current || !duration) return;

		const rect = progressRef.current.getBoundingClientRect();
		const percentage = (e.clientX - rect.left) / rect.width;
		const newTime = Math.min(Math.max(percentage, 0), 1) * duration;

		if (audioRef.current) {
			audioRef.current.currentTime = newTime;
			setCurrentTime(newTime);
		}
	};

	const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!progressRef.current || !duration) return;

		const rect = progressRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const percentage = Math.min(Math.max(x / rect.width, 0), 1);

		setHoverTime(percentage * duration);
		setHoverPosition(x);
	};

	const handleProgressLeave = () => {
		setHoverTime(null);
		setHoverPosition(null);
	};

	const handleSpeedChange = (rate: number) => {
		setPlaybackRate(rate);
		setShowSpeedMenu(false);
	};

	const handleSkip = (seconds: number) => {
		if (audioRef.current) {
			const newTime = Math.min(
				Math.max(0, audioRef.current.currentTime + seconds),
				duration,
			);
			audioRef.current.currentTime = newTime;
			setCurrentTime(newTime);
		}
	};

	// 現在の再生位置つきリンクをコピーする
	const handleCopyLink = async () => {
		const url = `${window.location.origin}/ep/${episodeSlug || episodeNumber}?t=${Math.floor(currentTime)}`;
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		} catch {
			// クリップボードが使えない環境では何もしない
		}
	};

	if (!episodeNumber) return null;

	const progressPercent = duration ? (currentTime / duration) * 100 : 0;

	return (
		<div className="fixed inset-x-3 bottom-3 z-50 flex justify-center sm:inset-x-4 sm:bottom-4">
			{/* biome-ignore lint/a11y/useMediaCaption: Podcast音声に字幕トラックは存在しない */}
			<audio
				ref={audioRef}
				src={audioUrl}
				onTimeUpdate={handleTimeUpdate}
				onLoadedMetadata={handleLoadedMetadata}
				onEnded={() => setPlaying(false)}
			/>

			<div
				className={`w-full max-w-2xl rounded-2xl border-3 border-edge bg-surface shadow-pop transition-[transform,opacity] duration-300 ease-out-quart ${
					entered ? "translate-y-0 opacity-100" : "translate-y-[130%] opacity-0"
				}`}
			>
				{/* Progress Bar（シークは左右矢印キーでも操作可能） */}
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: グローバルショートカット(←/→)でキーボード操作を提供 */}
				<div
					ref={progressRef}
					className="group/progress relative flex h-6 cursor-pointer items-center px-4 pt-1"
					onClick={handleProgressClick}
					onMouseMove={handleProgressHover}
					onMouseLeave={handleProgressLeave}
					role="presentation"
				>
					<div className="relative h-2 w-full rounded-full border-2 border-edge bg-paper transition-[height] duration-150 group-hover/progress:h-2.5">
						<div
							className="absolute inset-y-0 left-0 rounded-full bg-tangerine"
							style={{ width: `${progressPercent}%` }}
						/>
						<div
							className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-edge bg-sun opacity-0 transition-opacity duration-150 group-hover/progress:opacity-100"
							style={{ left: `${progressPercent}%` }}
						/>
					</div>
					{hoverTime !== null && hoverPosition !== null && (
						<div
							className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 rounded-md border-2 border-edge bg-sun px-2 py-0.5 font-mono text-[11px] font-medium text-[rgb(29,26,46)]"
							style={{ left: hoverPosition + 16 }}
						>
							{formatTime(hoverTime)}
						</div>
					)}
				</div>

				{/* Controls */}
				<div className="flex items-center gap-1.5 px-3 pb-3 pt-1 sm:gap-2">
					<button
						type="button"
						onClick={() => setPlaying(!isPlaying)}
						className="btn-pop grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tangerine text-[rgb(29,26,46)]"
						aria-label={isPlaying ? "一時停止" : "再生"}
						title="スペースキーで再生/一時停止"
					>
						{isPlaying ? (
							<svg
								viewBox="0 0 24 24"
								className="h-5 w-5"
								fill="currentColor"
								aria-hidden="true"
							>
								<rect x="6" y="5" width="4" height="14" rx="1.2" />
								<rect x="14" y="5" width="4" height="14" rx="1.2" />
							</svg>
						) : (
							<svg
								viewBox="0 0 24 24"
								className="ml-0.5 h-5 w-5"
								fill="currentColor"
								aria-hidden="true"
							>
								<path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l11.05-6.86a1.04 1.04 0 0 0 0-1.76L9.56 4.26A1.04 1.04 0 0 0 8 5.14z" />
							</svg>
						)}
					</button>

					<button
						type="button"
						onClick={() => handleSkip(-SKIP_SECONDS)}
						className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-[transform,color,background-color] duration-150 ease-out-quart hover:bg-sun hover:text-[rgb(29,26,46)] active:scale-90"
						aria-label={`${SKIP_SECONDS}秒戻る`}
						title="←キーで10秒戻る"
					>
						<svg
							viewBox="0 0 24 24"
							className="h-5 w-5"
							fill="currentColor"
							aria-hidden="true"
						>
							<path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
						</svg>
					</button>

					<button
						type="button"
						onClick={() => handleSkip(SKIP_SECONDS)}
						className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-[transform,color,background-color] duration-150 ease-out-quart hover:bg-sun hover:text-[rgb(29,26,46)] active:scale-90"
						aria-label={`${SKIP_SECONDS}秒進む`}
						title="→キーで10秒進む"
					>
						<svg
							viewBox="0 0 24 24"
							className="h-5 w-5"
							fill="currentColor"
							aria-hidden="true"
						>
							<path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
						</svg>
					</button>

					<div className="min-w-0 flex-1 px-1">
						<a
							href={`/ep/${episodeSlug || episodeNumber}`}
							className="block truncate text-sm font-bold leading-tight transition-colors duration-150 hover:text-tangerine"
						>
							{episodeTitle}
						</a>
						<p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">
							{formatTime(currentTime)}
							<span className="text-muted/50"> / {formatTime(duration)}</span>
						</p>
					</div>

					{/* Playback Speed */}
					<div className="relative shrink-0" ref={speedMenuRef}>
						<button
							type="button"
							onClick={() => setShowSpeedMenu(!showSpeedMenu)}
							className="h-9 rounded-full px-3 font-mono text-xs font-medium text-muted transition-[transform,color,background-color] duration-150 ease-out-quart hover:bg-sun hover:text-[rgb(29,26,46)] active:scale-95"
							aria-label="再生速度"
							title="Shift + < または > で再生速度を変更"
						>
							{playbackRate}x
						</button>

						<div
							className={`absolute bottom-full right-0 mb-2 w-24 origin-bottom-right rounded-xl border-3 border-edge bg-surface py-1.5 shadow-pop-sm transition-[transform,opacity] duration-150 ease-out-quart ${
								showSpeedMenu
									? "scale-100 opacity-100"
									: "pointer-events-none scale-95 opacity-0"
							}`}
						>
							{PLAYBACK_RATES.map((rate) => (
								<button
									type="button"
									key={rate}
									onClick={() => handleSpeedChange(rate)}
									className={`block w-full px-4 py-1.5 text-left font-mono text-xs transition-colors duration-100 hover:bg-sun hover:text-[rgb(29,26,46)] ${
										rate === playbackRate
											? "font-medium text-tangerine"
											: "text-muted"
									}`}
								>
									{rate}x
								</button>
							))}
						</div>
					</div>

					{/* Volume Control */}
					<div className="hidden shrink-0 items-center gap-1 md:flex">
						<button
							type="button"
							onClick={() => setVolume(volume === 0 ? 1 : 0)}
							className="grid h-9 w-9 place-items-center rounded-full text-muted transition-[transform,color,background-color] duration-150 ease-out-quart hover:bg-sun hover:text-[rgb(29,26,46)] active:scale-90"
							aria-label="音量"
							title="Mキーでミュート切り替え"
						>
							{volume === 0 ? (
								<svg
									viewBox="0 0 24 24"
									className="h-5 w-5"
									fill="currentColor"
									aria-hidden="true"
								>
									<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
								</svg>
							) : (
								<svg
									viewBox="0 0 24 24"
									className="h-5 w-5"
									fill="currentColor"
									aria-hidden="true"
								>
									<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
								</svg>
							)}
						</button>
						<input
							type="range"
							min={0}
							max={1}
							step={0.1}
							value={volume}
							onChange={(e) => setVolume(Number.parseFloat(e.target.value))}
							className="h-1.5 w-16 cursor-pointer appearance-none rounded-full border border-edge bg-paper [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-solid [&::-webkit-slider-thumb]:border-edge [&::-webkit-slider-thumb]:bg-tangerine"
							aria-label="音量スライダー"
						/>
					</div>

					<button
						type="button"
						onClick={handleCopyLink}
						className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-[transform,color,background-color] duration-150 ease-out-quart active:scale-90 ${
							copied
								? "bg-lime text-[rgb(29,26,46)]"
								: "text-muted hover:bg-sun hover:text-[rgb(29,26,46)]"
						}`}
						aria-label="この位置のリンクをコピー"
						title="現在の再生位置つきリンクをコピー"
					>
						{copied ? (
							<svg
								viewBox="0 0 24 24"
								className="h-4 w-4"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<path d="M20 6L9 17l-5-5" />
							</svg>
						) : (
							<svg
								viewBox="0 0 24 24"
								className="h-4 w-4"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
								<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
							</svg>
						)}
					</button>

					<button
						type="button"
						onClick={close}
						className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-[transform,color,background-color] duration-150 ease-out-quart hover:bg-sun hover:text-[rgb(29,26,46)] active:scale-90"
						aria-label="プレーヤーを閉じる"
						title="Escキーでプレーヤーを閉じる"
					>
						<svg
							viewBox="0 0 24 24"
							className="h-4 w-4"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.2"
							strokeLinecap="round"
							aria-hidden="true"
						>
							<path d="M6 6l12 12M18 6L6 18" />
						</svg>
					</button>
				</div>
			</div>
		</div>
	);
}
