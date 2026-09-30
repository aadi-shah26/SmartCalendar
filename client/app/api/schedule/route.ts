import { NextRequest, NextResponse } from 'next/server';
import { scheduleTasksGreedy, SchedulerTask, Interval } from '@/lib/scheduler';

interface ScheduleRequestBody {
  tasks: SchedulerTask[];
  horizonStart: string;
  horizonEnd: string;
  bufferMinutes?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body: ScheduleRequestBody = await req.json();

    const horizon: Interval = {
      startMs: new Date(body.horizonStart).getTime(),
      endMs: new Date(body.horizonEnd).getTime(),
    };

    if (Number.isNaN(horizon.startMs) || Number.isNaN(horizon.endMs) || horizon.startMs >= horizon.endMs) {
      return NextResponse.json({ error: 'Invalid horizonStart/horizonEnd' }, { status: 400 });
    }

    const bufferMs = Math.max(0, body.bufferMinutes ?? 0) * 60 * 1000;

    const { placements, status } = scheduleTasksGreedy(body.tasks, horizon, { bufferMs });

    const sorted = [...placements].sort((a, b) => a.interval.startMs - b.interval.startMs);
    const response = {
      status,
      placements: sorted.map(p => ({
        taskId: p.task.id,
        taskName: p.task.name,
        start: new Date(p.interval.startMs).toISOString(),
        end: new Date(p.interval.endMs).toISOString(),
      })),
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err: any) {
    console.error('[schedule] error:', err);
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 });
  }
}
