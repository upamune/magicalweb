import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://www.magical.fm',
  integrations: [
    react({
      include: ['**/react/*', '**/components/*'],
    }), 
    tailwind()
  ],
  output: 'static',
  vite: {
    ssr: {
      noExternal: ['swiper', 'swiper/*'],
    },
  },
});