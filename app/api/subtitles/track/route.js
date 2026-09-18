import { sources } from '../../../../lib/db';
import { getVtt } from '../../../../lib/subtitles';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const source = sources.get(Number(searchParams.get('sourceId')));
  if (!source) return new Response('Unknown source', { status: 404 });
  if (source.type !== 'local') return new Response('Not supported for this source', { status: 400 });

  const relPath = searchParams.get('path') || '';
  const trackId = searchParams.get('trackId') || '';

  try {
    const vtt = await getVtt(source, relPath, trackId);
    return new Response(vtt, { headers: { 'Content-Type': 'text/vtt' } });
  } catch (err) {
    return new Response(err.message, { status: 400 });
  }
}
