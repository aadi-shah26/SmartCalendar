import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/api/auth/callback'
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/onboarding', req.url));
  }

  try {
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch Google Calendar events
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const now = new Date();
    const oneYearLater = new Date();
    oneYearLater.setFullYear(now.getFullYear() + 1);

    const eventsRes = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: oneYearLater.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    });

    const googleEvents = eventsRes.data.items || [];

    // Format and insert into Supabase
    const formattedEvents = googleEvents
      .filter(e => e.start?.dateTime || e.start?.date)
      .map(e => {
        const startDT = e.start?.dateTime
          ? new Date(e.start.dateTime)
          : new Date(e.start?.date!);
        const endDT = e.end?.dateTime
          ? new Date(e.end.dateTime)
          : new Date(e.end?.date!);
        return {
          title: e.summary || 'Untitled',
          date: startDT.toISOString().split('T')[0],
          start_time: startDT.toTimeString().slice(0, 5),
          end_time: endDT.toTimeString().slice(0, 5),
          description: e.description || '',
        };
      });

    if (formattedEvents.length > 0) {
      await supabase.from('events').insert(formattedEvents);
    }

    return NextResponse.redirect(new URL('/calendar', req.url));
  } catch (err) {
    console.error('Google OAuth error:', err);
    return NextResponse.redirect(new URL('/calendar', req.url));
  }
}