import { sources } from '../../../lib/db';
import { listLocalDir } from '../../../lib/local';
import { listFtpDir } from '../../../lib/ftp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const source = sources.get(Number(searchParams.get('sourceId')));
  if (!source) return Response.json({ error: 'Unknown source' }, { status: 404 });
  const dir = searchParams.get('dir') || '';

  if (source.type === 'local') {
    return new Promise((resolve) => {
      listLocalDir(source, dir, (err, result) => {
        if (err) return resolve(Response.json({ error: 'Folder not found' }, { status: 404 }));
        resolve(Response.json({ sourceId: source.id, dir, ...result }));
      });
    });
  }

  try {
    const result = await listFtpDir(source, dir);
    return Response.json({ sourceId: source.id, dir, ...result });
  } catch (err) {
    return Response.json({ error: 'FTP error: ' + err.message }, { status: 502 });
  }
}
