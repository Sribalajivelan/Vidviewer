import { sources } from '../../../../lib/db';
import { listAudioTracks } from '../../../../lib/convert';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const source = sources.get(Number(searchParams.get('sourceId')));
  if (!source) return Response.json({ error: 'Unknown source' }, { status: 404 });
  if (source.type !== 'local') return Response.json([]);

  const relPath = searchParams.get('path') || '';
  const tracks = await listAudioTracks(source, relPath);
  return Response.json(tracks);
}
