import Image from "next/image";
import Link from "next/link";

const teamMembers = [
    { name: "Team Member", role: "Role", id: 1 },
    { name: "Team Member", role: "Role", id: 2 },
    { name: "Team Member", role: "Role", id: 3 },
    { name: "Team Member", role: "Role", id: 4 },
    { name: "Team Member", role: "Role", id: 5 },
    { name: "Team Member", role: "Role", id: 6 },
];

export default function HomePage() {
    return (
        <div className="min-h-screen font-sans">


            <section
                className="relative flex flex-col items-center justify-center min-h-screen text-center overflow-hidden"
                style={{
                    background: "linear-gradient(160deg, #5fb3aa 0%, #8ecfc8 30%, #b8e0da 60%, #d8ede9 80%, #e8f4f1 100%)",
                }}
            >
                {/* Decorative circles???? fix */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {[
                        { size: 220, top: "8%", left: "5%", opacity: 0.12 },
                        { size: 160, top: "15%", right: "8%", opacity: 0.1 },
                        { size: 300, bottom: "10%", left: "15%", opacity: 0.08 },
                        { size: 120, top: "40%", right: "3%", opacity: 0.1 },
                        { size: 80, top: "60%", left: "3%", opacity: 0.12 },
                        { size: 200, bottom: "5%", right: "10%", opacity: 0.09 },
                    ].map((c, i) => (
                        <div
                            key={i}
                            className="absolute rounded-full border border-white"
                            style={{
                                width: c.size,
                                height: c.size,
                                top: c.top,
                                left: (c as any).left,
                                right: (c as any).right,
                                bottom: c.bottom,
                                opacity: c.opacity,
                            }}
                        />
                    ))}
                </div>

                <div className="relative z-10 px-6">
                    <h1 className="text-6xl md:text-7xl font-light text-white tracking-tight leading-none mb-4">
                        smart calendar
                    </h1>
                    <p className="text-xl md:text-2xl text-white/85 font-light tracking-wide">
                        your personal planner.
                    </p>
                </div>

                {/* Scroll */}
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 animate-bounce">
                    <svg className="w-8 h-8 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </section>

            {/* college is busy */}
            <section className="bg-[#eaf3f1] py-20 px-8">
                <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-12 items-center">
                    {/* Text */}
                    <div className="flex-1">
                        <h2 className="text-3xl font-semibold text-teal-800 mb-5">College is busy.</h2>
                        <p className="text-gray-600 leading-relaxed mb-4">
                            Between classes, meetings, assignments, and workouts, planning your day can feel like a
                            full-time job.
                        </p>
                        <p className="text-gray-600 leading-relaxed">
                            Instead of just tracking your schedule, SmartCalendar builds it for you.
                        </p>
                    </div>

                    {/* Image */}
                    <div className="flex-1 flex justify-center">
                        <div className="relative w-full max-w-sm h-60 rounded-2xl overflow-hidden shadow-lg">
                            <Image
                                src="/aboutGraphic.png"
                                alt="Smart Calendar on desktop"
                                fill
                                className="object-cover"
                            />
                        </div>
                    </div>
                </div>
            </section>



            {/* meet the team */}
            <section className="bg-[#eaf3f1] py-20 px-8">
                <div className="max-w-5xl mx-auto">
                    <h2 className="text-3xl font-semibold text-teal-800 text-center mb-12">Meet The Team</h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {teamMembers.map((member) => (
                            <div
                                key={member.id}
                                className="relative rounded-2xl overflow-hidden h-64 shadow-md bg-white/60"
                            >
                                <Image
                                    src="/aboutGraphic1.png"
                                    alt={member.name}
                                    fill
                                    className="object-cover"
                                />
                                {/* Pink placeholder bar (matches screenshot) */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-24 h-4 rounded-full bg-gray-600/70" />
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-t from-gray-700/60 via-transparent to-transparent" />
                                <div className="absolute bottom-0 left-0 p-4">
                                    <p className="text-white font-bold text-base leading-tight">{member.name}</p>
                                    <p className="text-white/80 text-xs">{member.role}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

        </div>
    );
}
