import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  episodeNumber: number | null;
  episodeSlug: string;
  episodeTitle: string;
  audioUrl: string;
  setPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  setEpisode: (number: number, slug: string, title: string, url: string) => void;
  reset: () => void;
  close: () => void;
}

export const useAudioStore = create<AudioState>()(
  persist(
    (set) => ({
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 1,
      playbackRate: 1,
      episodeNumber: null,
      episodeSlug: '',
      episodeTitle: '',
      audioUrl: '',
      setPlaying: (isPlaying) => set({ isPlaying }),
      setCurrentTime: (time) => set({ currentTime: time }),
      setDuration: (duration) => set({ duration }),
      setVolume: (volume) => set({ volume }),
      setPlaybackRate: (rate) => set({ playbackRate: rate }),
      setEpisode: (number, slug, title, url) => set((state) => ({
        episodeNumber: number,
        episodeSlug: slug,
        episodeTitle: title,
        audioUrl: url,
        currentTime: state.episodeNumber === number ? state.currentTime : 0,
        isPlaying: true,
      })),
      reset: () => set({
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        episodeNumber: null,
        episodeSlug: '',
        episodeTitle: '',
        audioUrl: '',
      }),
      close: () => set({
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        episodeNumber: null,
        episodeSlug: '',
        episodeTitle: '',
        audioUrl: '',
      }),
    }),
    {
      name: 'audio-storage',
      partialize: (state) => ({
        currentTime: state.currentTime,
        volume: state.volume,
        playbackRate: state.playbackRate,
        episodeNumber: state.episodeNumber,
        episodeSlug: state.episodeSlug,
        episodeTitle: state.episodeTitle,
        audioUrl: state.audioUrl,
      }),
    }
  )
);
