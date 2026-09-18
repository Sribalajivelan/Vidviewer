import { getJob } from '../../../../lib/convert';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) return Response.json({ error: 'Unknown job' }, { status: 404 });
  return Response.json(job);
}
