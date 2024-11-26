import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { useAudioStore } from '../store/audioStore';

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SKIP_SECONDS = 10;

export default function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
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
    close,
  } = useAudioStore();

  useEffect(() => {
    if (!episodeNumber) {
      document.body.classList.remove('has-player');
    } else {
      document.body.classList.add('has-player');
    }
  }, [episodeNumber]);

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

  // キーボードショートカットの処理
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // テキスト入力中は無視
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          setPlaying(!isPlaying);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleSkip(-SKIP_SECONDS);
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleSkip(SKIP_SECONDS);
          break;
        case 'KeyM':
          e.preventDefault();
          setVolume(volume === 0 ? 1 : 0);
          break;
        case 'Comma':
          if (e.shiftKey) {
            e.preventDefault();
            const currentIndex = PLAYBACK_RATES.indexOf(playbackRate);
            if (currentIndex > 0) {
              setPlaybackRate(PLAYBACK_RATES[currentIndex - 1]);
            }
          }
          break;
        case 'Period':
          if (e.shiftKey) {
            e.preventDefault();
            const currentIndex = PLAYBACK_RATES.indexOf(playbackRate);
            if (currentIndex < PLAYBACK_RATES.length - 1) {
              setPlaybackRate(PLAYBACK_RATES[currentIndex + 1]);
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          close();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isPlaying, volume, playbackRate, setPlaying, setVolume, setPlaybackRate, close]);

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

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current) return;
    
    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current) return;
    
    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const time = percentage * duration;
    
    setHoverTime(time);
    setHoverPosition(x);
  };

  const handleProgressLeave = () => {
    setHoverTime(null);
    setHoverPosition(null);
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
      
      <div className="container mx-auto px-4">
        {/* Progress Bar */}
        <div 
          ref={progressRef}
          className="h-2 -mt-[1px] bg-gray-200 dark:bg-gray-700 cursor-pointer relative group"
          onClick={handleProgressClick}
          onMouseMove={handleProgressHover}
          onMouseLeave={handleProgressLeave}
        >
          <div
            className="h-full bg-primary transition-all duration-100 group-hover:bg-primary-light"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
          {hoverTime !== null && hoverPosition !== null && (
            <div 
              className="absolute bottom-full mb-2 -translate-x-1/2 bg-gray-900 dark:bg-gray-700 text-white px-2 py-1 rounded text-xs"
              style={{ left: hoverPosition }}
            >
              {formatTime(hoverTime)}
            </div>
          )}
        </div>

        {/* Title Row */}
        <div className="py-2 flex items-center gap-3 border-b border-gray-200 dark:border-gray-700">
          <div className="w-8 h-8 flex items-center justify-center">
            <Icon 
              icon={isPlaying ? 'ri:volume-up-fill' : 'ri:volume-mute-fill'} 
              className="w-5 h-5 text-primary"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium truncate">
              <a 
                href={`/ep/${episodeNumber}`}
                className="hover:text-primary transition-colors"
              >
                {episodeTitle}
              </a>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              再生中のエピソード
            </p>
          </div>
          <button
            onClick={close}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="プレーヤーを閉じる"
            title="Escキーでプレーヤーを閉じる"
          >
            <Icon icon="ri:close-line" className="w-5 h-5" />
          </button>
        </div>

        {/* Controls Row */}
        <div className="py-3 flex items-center justify-center gap-4">
          {/* Skip Backward */}
          <button
            onClick={() => handleSkip(-SKIP_SECONDS)}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
            aria-label={`${SKIP_SECONDS}秒戻る`}
            title="←キーで10秒戻る"
          >
            <Icon icon="ri:arrow-go-back-line" className="w-5 h-5" />
          </button>

          {/* Play/Pause Button */}
          <button
            onClick={() => setPlaying(!isPlaying)}
            className="p-3 rounded-full bg-primary hover:bg-primary-dark text-white transition-colors"
            aria-label={isPlaying ? '一時停止' : '再生'}
            title="スペースキーで再生/一時停止"
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
            title="→キーで10秒進む"
          >
            <Icon icon="ri:arrow-go-forward-line" className="w-5 h-5" />
          </button>

          {/* Time Display */}
          <div className="hidden sm:flex items-center gap-2 text-sm tabular-nums">
            <span>{formatTime(currentTime)}</span>
            <span>/</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Playback Speed */}
          <div className="relative">
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
              aria-label="再生速度"
              title="Shift + < または > で再生速度を変更"
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
              title="Mキーでミュート切り替え"
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
  );
}
