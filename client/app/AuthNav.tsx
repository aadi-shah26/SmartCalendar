'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

// Home page nav buttons. Signed-in users get a way back to their calendar
// instead of Log in / Sign up, so leaving the calendar never looks like a logout.
export default function AuthNav() {
    const [signedIn, setSignedIn] = useState(false);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => setSignedIn(!!session));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(!!session));
        return () => subscription.unsubscribe();
    }, []);

    if (signedIn) {
        return (
            <Link
                href="/calendar"
                style={{ color: "#fff" }}
                className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-semibold transition hover:bg-black"
            >
                Open calendar
            </Link>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <Link
                href="/login"
                className="rounded-full px-4 py-2 text-sm font-medium text-[var(--muted)] transition hover:text-[var(--ink)]"
            >
                Log in
            </Link>
            <Link
                href="/onboarding"
                style={{ color: "#fff" }}
                className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-semibold transition hover:bg-black"
            >
                Sign up
            </Link>
        </div>
    );
}
