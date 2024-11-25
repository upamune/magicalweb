import type { APIRoute } from 'astro';
import { getLatestEpisodes } from '../../utils/rss';

export const GET: APIRoute = async ({ url }) => {
  const params = new URL(url).searchParams;
  const page = parseInt(params.get('page') || '1');
  const limit = parseInt(params.get('limit') || '12');
  
  try {
    const episodes = await getLatestEpisodes(limit);
    
    return new Response(JSON.stringify({ episodes }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch episodes' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}