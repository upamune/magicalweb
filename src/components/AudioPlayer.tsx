import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { useAudioStore } from '../store/audioStore';

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SKIP_SECONDS = 10;

export default function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const {
    isPlaying,
    currentTime,
    duration,
    volume,
    playbackRate,
    episodeNumber,
    episodeTitle,
    audioUrl,
    setPlaying,
    setCurrentTime,
    setDuration,
    setVolume,
    setPlaybackRate,
  } = useAudioStore();

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

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

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

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
  };

  const handleSkip = (seconds: number) => {
    if (audioRef.current) {
      const newTime = Math.min(
        Math.max(0, audioRef.current.currentTime + seconds),
        duration
      );
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  if (!episodeNumber) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg z-50">
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setPlaying(false)}
      />
      
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Episode Info */}
          <div className="hidden sm:block flex-1 min-w-0">
            <h3 className="text-sm font-medium truncate">
              <a 
                href={`/ep/${episodeNumber}`}
                className="hover:text-primary transition-colors"
              >
                {episodeTitle}
              </a>
            </h3>
          </div>

          {/* Controls */}
          <div className="flex-1 sm:flex-none flex items-center justify-center gap-4">
            {/* Skip Backward */}
            <button
              onClick={() => handleSkip(-SKIP_SECONDS)}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label={`${SKIP_SECONDS}秒戻る`}
            >
              <Icon icon="ri:arrow-go-back-line" className="w-5 h-5" />
            </button>

            {/* Play/Pause Button */}
            <button
              onClick={() => setPlaying(!isPlaying)}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label={isPlaying ? '一時停止' : '再生'}
            >
              <Icon 
                icon={isPlaying ? 'ri:pause-fill' : 'ri:play-fill'} 
                className="w-6 h-6"
              />
            </button>

            {/* Skip Forward */}
            <button
              onClick={() => handleSkip(SKIP_SECONDS)}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label={`${SKIP_SECONDS}秒進む`}
            >
              <Icon icon="ri:arrow-go-forward-line" className="w-5 h-5" />
            </button>

            {/* Time Display */}
            <div className="hidden sm:flex items-center gap-2 text-sm tabular-nums">
              <span>{formatTime(currentTime)}</span>
              <span>/</span>
              <span>{formatTime(duration)}</span>
            </div>

            {/* Progress Bar */}
            <input
              type="range"
              min={0}
              max={duration}
              value={currentTime}
              onChange={handleSeek}
              className="w-32 sm:w-48 md:w-64 h-1 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
            />

            {/* Playback Speed */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
                aria-label="再生速度"
              >
                {playbackRate}x
              </button>
              
              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2">
                  {PLAYBACK_RATES.map((rate) => (
                    <button
                      key={rate}
                      onClick={() => handleSpeedChange(rate)}
                      className={`w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-sm ${
                        rate === playbackRate ? 'text-primary font-medium' : ''
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Volume Control */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => setVolume(volume === 0 ? 1 : 0)}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="音量"
              >
                <Icon 
                  icon={
                    volume === 0 
                      ? 'ri:volume-mute-fill' 
                      : volume < 0.5 
                        ? 'ri:volume-down-fill' 
                        : 'ri:volume-up-fill'
                  }
                  className="w-5 h-5"
                />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}