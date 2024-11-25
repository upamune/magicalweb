import React from 'react';
import { Icon } from '@iconify/react';

export default function SocialLinks() {
  return (
    <div className="flex justify-center gap-6 mb-8">
      <a
        href="https://open.spotify.com/show/magicalfm"
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-600 hover:text-spotify dark:text-gray-400 dark:hover:text-spotify transition-colors"
        aria-label="Listen on Spotify"
      >
        <Icon icon="mdi:spotify" className="w-8 h-8" />
      </a>
      <a
        href="https://podcasts.apple.com/podcast/magicalfm"
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-600 hover:text-apple dark:text-gray-400 dark:hover:text-apple transition-colors"
        aria-label="Listen on Apple Podcasts"
      >
        <Icon icon="mdi:podcast" className="w-8 h-8" />
      </a>
      <a
        href="https://youtube.com/@magicalfm"
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