import { sources } from '../../../../lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function DELETE(request, { params }) {
  const { id } = await params;
  sources.remove(Number(id));
  return new Response(null, { status: 204 });
}
