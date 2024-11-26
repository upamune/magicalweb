import React from 'react';
import { useAudioStore } from '../store/audioStore';

interface PlayButtonProps {
  episodeNumber: number;
  episodeTitle: string;
  audioUrl: string;
}

export default function PlayButton({ episodeNumber, episodeTitle, audioUrl }: PlayButtonProps) {
  const setEpisode = useAudioStore((state) => state.setEpisode);

  return (
    <button
      className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 px-8 rounded-xl transition-colors flex items-center justify-center gap-3"
      onClick={() => setEpisode(episodeNumber, episodeTitle, audioUrl)}
    >
      <span className="i-[ri:play-fill] w-6 h-6"></span>
      再生する
    </button>
  );
}
