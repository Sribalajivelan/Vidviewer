import { sources, playback } from '../../../lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const source = sources.get(Number(searchParams.get('sourceId')));
  if (!source) return Response.json({ error: 'Unknown source' }, { status: 404 });
  const filePath = searchParams.get('path') || '';
  const progress = playback.getProgress(source.id, filePath) || { position: 0, duration: null };
  return Response.json(progress);
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { sourceId, path: filePath, name, position, duration } = body;
  const source = sources.get(Number(sourceId));
  if (!source) return Response.json({ error: 'Unknown source' }, { status: 404 });
  if (!filePath || typeof position !== 'number') {
    return Response.json({ error: 'path and position are required' }, { status: 400 });
  }
  playback.saveProgress({
    sourceId: source.id,
    filePath,
    fileName: name || filePath,
    position,
    duration: typeof duration === 'number' ? duration : null,
  });
  return new Response(null, { status: 204 });
}
