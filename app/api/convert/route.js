import { sources } from '../../../lib/db';
import { startConversion } from '../../../lib/convert';
import { classify } from '../../../lib/mediaTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const source = sources.get(Number(body.sourceId));
  if (!source) return Response.json({ error: 'Unknown source' }, { status: 404 });
  if (source.type !== 'local') {
    return Response.json({ error: 'Conversion is only supported for local sources' }, { status: 400 });
  }

  const relPath = typeof body.path === 'string' ? body.path : '';
  const name = relPath.split('/').pop() || '';
  if (classify(name) !== 'video') {
    return Response.json({ error: 'Not a video file' }, { status: 400 });
  }
  if (/\.(mp4|m4v)$/i.test(name)) {
    return Response.json({ error: 'Already an MP4' }, { status: 400 });
  }

  const audioTrackIndex = Number.isInteger(body.audioTrackIndex) ? body.audioTrackIndex : undefined;

  try {
    const jobId = await startConversion(source, relPath, audioTrackIndex);
    return Response.json({ jobId }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
