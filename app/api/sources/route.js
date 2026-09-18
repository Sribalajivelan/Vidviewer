import path from 'path';
import { sources } from '../../../lib/db';
import { testConnection as testFtpConnection } from '../../../lib/ftp';
import { testConnection as testUrlConnection } from '../../../lib/urlSource';

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
      await testFtpConnection(candidate);
    } catch (err) {
      return Response.json({ error: 'Could not connect: ' + err.message }, { status: 400 });
    }
    const created = sources.createFtp({ name, ...candidate });
    return Response.json(created, { status: 201 });
  }

  if (body.type === 'url') {
    const url = (body.url || '').trim();
    if (!url) return Response.json({ error: 'URL is required' }, { status: 400 });
    try {
      new URL(url);
    } catch {
      return Response.json({ error: 'That does not look like a valid URL' }, { status: 400 });
    }
    if (!/^https?:$/.test(new URL(url).protocol)) {
      return Response.json({ error: 'Only http:// and https:// URLs are supported' }, { status: 400 });
    }
    const mediaType = body.mediaType === 'image' ? 'image' : 'video';
    try {
      await testUrlConnection(url);
    } catch (err) {
      return Response.json({ error: 'Could not reach that URL: ' + err.message }, { status: 400 });
    }
    const created = sources.createUrl({ name, url, mediaType });
    return Response.json(created, { status: 201 });
  }

  return Response.json({ error: 'type must be "local", "ftp", or "url"' }, { status: 400 });
}
