import React from 'react';
import { Icon } from '@iconify/react';

export default function SocialLinks() {
  return (
    <div className="flex justify-center gap-6 mb-8">
      <a
        href="https://open.spotify.com/show/14hhOIT7FeMOQomciCN7ac"
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-600 hover:text-spotify dark:text-gray-400 dark:hover:text-spotify transition-colors"
        aria-label="Listen on Spotify"
      >
        <Icon icon="mdi:spotify" className="w-8 h-8" />
      </a>
      <a
        href="https://podcasts.apple.com/us/podcast/%E3%83%9E%E3%83%82%E3%82%AB%E3%83%AB-fm/id1723445201"
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-600 hover:text-apple dark:text-gray-400 dark:hover:text-apple transition-colors"
        aria-label="Listen on Apple Podcasts"
      >
        <Icon icon="mdi:podcast" className="w-8 h-8" />
      </a>
      <a
        href="https://music.youtube.com/playlist?list=PL-CmGAXMh0sLM1HwNQhSmLazMhBuvVHZE&si=-nTseXVn_li15PxW"
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-600 hover:text-youtube dark:text-gray-400 dark:hover:text-youtube transition-colors"
        aria-label="Watch on YouTube"
      >
        <Icon icon="mdi:youtube" className="w-8 h-8" />
      </a>
      <a
        href="https://listen.style/p/magicalfm/rss"
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-600 hover:text-rss dark:text-gray-400 dark:hover:text-rss transition-colors"
        aria-label="RSS Feed"
      >
        <Icon icon="mdi:rss" className="w-8 h-8" />
      </a>
    </div>
  );
}