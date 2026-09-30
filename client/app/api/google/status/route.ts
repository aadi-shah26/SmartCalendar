import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getAdminClient, getConnection, requireUser } from '@/lib/google/server';

export async function GET(req: NextRequest) {
  try {
    const admin = getAdminClient();
    const userId = await requireUser(req, admin);
    const conn = await getConnection(admin, userId);
    return NextResponse.json({ connected: !!conn, lastSyncedAt: conn?.last_synced_at ?? null });
  } catch (err) {
    const { status, body } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
