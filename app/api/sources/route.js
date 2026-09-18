import path from 'path';
import { sources } from '../../../lib/db';
import { testConnection } from '../../../lib/ftp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return Response.json(sources.list());
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const name = (body.name || '').trim();
  if (!name) return Response.json({ error: 'Name is required' }, { status: 400 });

  if (body.type === 'local') {
    if (!body.rootPath) return Response.json({ error: 'Folder path is required' }, { status: 400 });
    try {
      const created = sources.createLocal(name, path.resolve(body.rootPath));
      return Response.json(created, { status: 201 });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400 });
    }
  }

  if (body.type === 'ftp') {
    if (!body.host) return Response.json({ error: 'Host is required' }, { status: 400 });
    const candidate = {
      host: body.host,
      port: Number(body.port) || 21,
      username: body.username || '',
      password: body.password || '',
      secure: !!body.secure,
      basePath: body.basePath || '/',
    };
    try {
      await testConnection(candidate);
    } catch (err) {
      return Response.json({ error: 'Could not connect: ' + err.message }, { status: 400 });
    }
    const created = sources.createFtp({ name, ...candidate });
    return Response.json(created, { status: 201 });
  }

  return Response.json({ error: 'type must be "local" or "ftp"' }, { status: 400 });
}
