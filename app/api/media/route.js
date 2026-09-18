import { sources } from '../../../lib/db';
import { streamLocalFile } from '../../../lib/local';
import { streamFtpFile } from '../../../lib/ftp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const source = sources.get(Number(searchParams.get('sourceId')));
  if (!source) return new Response('Unknown source', { status: 404 });
  const filePath = searchParams.get('path') || '';
  const rangeHeader = request.headers.get('range');

  if (source.type === 'local') {
    return streamLocalFile(source, filePath, rangeHeader);
  }
  return streamFtpFile(source, filePath, rangeHeader, request.signal);
}
