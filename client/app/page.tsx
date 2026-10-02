import Image from "next/image";
import Link from "next/link";
import AuthNav from "./AuthNav";

const features = [
    {
        title: "Just type it",
        body: "“Essay due Friday, ~4 hours” becomes a task with a deadline and an estimate. No forms.",
        color: "var(--mint)",
        icon: "M4 6h16M4 12h10M4 18h7",
    },
    {
        title: "Planned into your free time",
        body: "Work sessions are placed around your classes and events, before the deadline, when you work best.",
        color: "var(--sky)",
        icon: "M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z",
    },
    {
        title: "Adapts when plans change",
        body: "Add a meeting on top of a study block and the session moves somewhere that still fits.",
        color: "var(--peach)",
        icon: "M4 4v5h5M20 20v-5h-5M5.6 15a7 7 0 0011.8 2.4M18.4 9A7 7 0 006.6 6.6",
    },
    {
        title: "Works with Google Calendar",
        body: "Bring your existing events in and keep them in sync, so nothing gets double-booked.",
        color: "var(--sun)",
        icon: "M5 13l4 4L19 7",
    },
];

// Mini week preview for the hero. Times are rows from 9am; spans are in hours.
const previewDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const previewBlocks = [
    { day: 0, start: 0, span: 1.5, label: "CS 101", color: "var(--sky)" },
    { day: 0, start: 2.5, span: 2, label: "Essay draft", color: "var(--mint)", planned: true },
    { day: 1, start: 1, span: 1, label: "Gym", color: "var(--peach)" },
    { day: 1, start: 3, span: 1.5, label: "Problem set", color: "var(--mint)", planned: true },
    { day: 2, start: 0, span: 1.5, label: "CS 101", color: "var(--sky)" },
    { day: 2, start: 2, span: 1, label: "Club meeting", color: "var(--lilac)" },
    { day: 3, start: 0.5, span: 2, label: "Essay edits", color: "var(--mint)", planned: true },
    { day: 3, start: 3.5, span: 1, label: "Gym", color: "var(--peach)" },
    { day: 4, start: 0, span: 1.5, label: "CS 101", color: "var(--sky)" },
    { day: 4, start: 2, span: 1, label: "Essay due", color: "var(--sun)" },
];
const HOUR_PX = 44;

function WeekPreview() {
    return (
        <div className="rounded-3xl bg-white p-4 sm:p-5 shadow-[0_30px_60px_-20px_rgba(25,25,25,0.25)] ring-1 ring-black/5">
            <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-[var(--ink)]">This week</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)]">
                    <span className="h-2 w-2 rounded-full border border-dashed border-emerald-700/60 bg-[var(--mint)]" />
                    auto-planned
                </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
                {previewDays.map((d, i) => (
                    <div key={d}>
                        <p className="text-[11px] font-medium text-[var(--muted)] text-center mb-2">{d}</p>
                        <div className="relative rounded-xl bg-[var(--bg)]" style={{ height: HOUR_PX * 5 }}>
                            {previewBlocks
                                .filter((b) => b.day === i)
                                .map((b) => (
                                    <div
                                        key={b.label + b.start}
                                        className={`absolute inset-x-1 rounded-lg px-1.5 py-1 text-[10px] sm:text-[11px] font-medium leading-tight text-[var(--ink)] overflow-hidden ${
                                            b.planned ? "border border-dashed border-emerald-700/40" : ""
                                        }`}
                                        style={{
                                            top: b.start * HOUR_PX + 2,
                                            height: b.span * HOUR_PX - 4,
                                            background: b.color,
                                        }}
                                    >
                                        {b.label}
                                    </div>
                                ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function HomePage() {
    return (
        <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)] font-sans">
            {/* Nav */}
            <header className="sticky top-0 z-20 bg-[var(--bg)]/80 backdrop-blur-md">
                <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-4">
                    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                        <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--ink)] text-white text-sm">
                            sc
                        </span>
                        smart calendar
                    </Link>
                    <AuthNav />
                </nav>
            </header>

            {/* Hero */}
            <section className="relative overflow-hidden">
                <div
                    className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
                    style={{ background: "radial-gradient(closest-side, var(--mint), transparent)" }}
                />
                <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 pt-12 pb-20 lg:grid-cols-[1.05fr_1fr] lg:pt-20 lg:pb-28">
                    <div className="animate-fade-up">
                        <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--muted)] ring-1 ring-black/5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Built for busy students
                        </p>
                        <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight leading-[1.02]">
                            Your week,
                            <br />
                            <span className="text-[#3f8f78]">planned for you.</span>
                        </h1>
                        <p className="mt-6 max-w-md text-lg leading-relaxed text-[var(--muted)]">
                            Tell Smart Calendar what you need to get done. It finds the time between classes, meetings and
                            workouts, and keeps the plan up to date as your week changes.
                        </p>
                        <div className="mt-8 flex flex-wrap items-center gap-3">
                            <Link
                                href="/onboarding"
                                style={{ color: "#fff" }}
                                className="inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-7 py-3.5 text-base font-semibold text-white shadow-[0_10px_24px_-8px_rgba(25,25,25,0.5)] transition hover:-translate-y-0.5 hover:bg-black"
                            >
                                Get started free
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6l6 6-6 6" />
                                </svg>
                            </Link>
                            <Link
                                href="/login"
                                className="rounded-full px-6 py-3.5 text-base font-medium text-[var(--ink)] ring-1 ring-black/10 bg-white/60 transition hover:bg-white"
                            >
                                I have an account
                            </Link>
                        </div>
                    </div>
                    <div className="animate-float">
                        <WeekPreview />
                    </div>
                </div>
            </section>

            {/* Features */}
            <section className="bg-white py-20 sm:py-24">
                <div className="mx-auto max-w-6xl px-4 sm:px-6">
                    <div className="max-w-xl">
                        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
                            Less planning. More doing.
                        </h2>
                        <p className="mt-4 text-lg text-[var(--muted)]">
                            Most calendars just hold what you put in them. This one figures out when the work happens.
                        </p>
                    </div>
                    <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {features.map((f) => (
                            <div key={f.title} className="rounded-3xl bg-[var(--bg)] p-6 transition hover:-translate-y-1">
                                <span
                                    className="grid h-11 w-11 place-items-center rounded-2xl"
                                    style={{ background: f.color }}
                                >
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
                                    </svg>
                                </span>
                                <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                                <p className="mt-2 text-[15px] leading-relaxed text-[var(--muted)]">{f.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* College is busy */}
            <section className="py-20 sm:py-24">
                <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-4 sm:px-6 lg:flex-row">
                    <div className="flex-1">
                        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">College is busy.</h2>
                        <p className="mt-5 text-lg leading-relaxed text-[var(--muted)]">
                            Between classes, meetings, assignments, and workouts, planning your day can feel like a
                            full-time job.
                        </p>
                        <p className="mt-4 text-lg leading-relaxed text-[var(--muted)]">
                            Instead of just tracking your schedule, Smart Calendar builds it for you.
                        </p>
                    </div>
                    <div className="flex flex-1 justify-center">
                        <div className="relative aspect-[740/532] w-full max-w-md overflow-hidden rounded-3xl shadow-xl ring-1 ring-black/5">
                            <Image src="/aboutGraphic.png" alt="Smart Calendar on desktop" fill className="object-cover" />
                        </div>
                    </div>
                </div>
            </section>

            {/* Closing CTA */}
            <section className="px-4 sm:px-6 pb-20">
                <div className="mx-auto max-w-6xl rounded-[2rem] bg-[var(--ink)] px-6 py-14 text-center text-white sm:px-12">
                    <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">Ready to get your time back?</h2>
                    <p className="mx-auto mt-4 max-w-md text-white/70">
                        Set up takes about a minute. Add your first task and watch it land on your calendar.
                    </p>
                    <Link
                        href="/onboarding"
                        className="mt-8 inline-flex rounded-full bg-[var(--mint)] px-7 py-3.5 font-semibold text-[var(--ink)] transition hover:-translate-y-0.5 hover:brightness-105"
                    >
                        Create your account
                    </Link>
                </div>
            </section>

            <footer className="pb-10 text-center text-sm text-[var(--muted)]">
                © {new Date().getFullYear()} Smart Calendar
            </footer>
        </div>
    );
}
