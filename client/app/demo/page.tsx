"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type StatusKind = "idle" | "success" | "error";

const tableName = "demo_flags";
const demoRowId = 1;

function maskKey(key: string) {
  if (key.length <= 10) {
    return "********";
  }

  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

export default function DemoPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  const [flagEnabled, setFlagEnabled] = useState(false);
  const [flagLoaded, setFlagLoaded] = useState(false);
  const [envStatus, setEnvStatus] = useState<{ kind: StatusKind; text: string }>({
    kind: "idle",
    text: "Run the connection test to verify your .env values.",
  });
  const [dbStatus, setDbStatus] = useState<{ kind: StatusKind; text: string }>({
    kind: "idle",
    text: "Load and flip the demo bit to verify read/write access.",
  });

  const hasEnv = Boolean(supabaseUrl && supabaseAnonKey);

  const supabase = useMemo(() => {
    if (!hasEnv) {
      return null;
    }

    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, [hasEnv]);

  useEffect(() => {
    if (!supabase) {
      setFlagLoaded(false);
      return;
    }

    let active = true;

    const loadFlag = async () => {
      const { data, error } = await supabase
        .from(tableName)
        .select("is_enabled")
        .eq("id", demoRowId)
        .maybeSingle();

      if (!active) {
        return;
      }

      if (error) {
        setDbStatus({
          kind: "error",
          text: `Connected, but could not read from ${tableName}: ${error.message}`,
        });
        setFlagLoaded(false);
        return;
      }

      setFlagEnabled(Boolean(data?.is_enabled));
      setFlagLoaded(true);
      setDbStatus({
        kind: "success",
        text: "Read successful. Demo row is reachable.",
      });
    };

    void loadFlag();

    return () => {
      active = false;
    };
  }, [supabase]);

  async function testEnvConnection() {
    if (!hasEnv) {
      setEnvStatus({
        kind: "error",
        text: "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      });
      return;
    }

    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
        headers: {
          apikey: supabaseAnonKey,
        },
      });

      if (response.ok) {
        setEnvStatus({
          kind: "success",
          text: "Supabase endpoint responded. .env values look valid.",
        });
        return;
      }

      if (response.status === 401) {
        setEnvStatus({
          kind: "error",
          text: "Supabase rejected the key (401). Use your project's NEXT_PUBLIC publishable/anon key, not a secret key.",
        });
        return;
      }

      setEnvStatus({
        kind: "error",
        text: `Supabase request failed with status ${response.status}. Check URL/key values.`,
      });
    } catch (error) {
      setEnvStatus({
        kind: "error",
        text: `Connection test failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  async function toggleFlag() {
    if (!supabase) {
      setDbStatus({
        kind: "error",
        text: "Supabase client not initialized. Check .env setup.",
      });
      return;
    }

    const nextValue = !flagEnabled;

    const { error } = await supabase.from(tableName).upsert(
      {
        id: demoRowId,
        is_enabled: nextValue,
      },
      { onConflict: "id" }
    );

    if (error) {
      setDbStatus({
        kind: "error",
        text: `Write failed for ${tableName}: ${error.message}`,
      });
      return;
    }

    setFlagEnabled(nextValue);
    setFlagLoaded(true);
    setDbStatus({
      kind: "success",
      text: `Database updated: is_enabled = ${String(nextValue)}`,
    });
  }

  return (
    <main className="min-h-screen bg-(--bg)">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-14">
        <header className="rounded-3xl border border-black/10 bg-white p-6 shadow-[0_12px_24px_var(--shadow)]">
          <p className="text-sm text-[var(--muted)]">Supabase Demo</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--ink)]">
            Supabase connection + bit flip test at /demo
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Use this page to verify your .env setup and anonymously toggle one
            boolean value in a demo table.
          </p>
        </header>

        <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-[0_12px_24px_var(--shadow)]">
          <h2 className="text-lg font-semibold text-[var(--ink)]">1) .env check</h2>
          <div className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <p>
              URL: {supabaseUrl ? supabaseUrl : "Missing NEXT_PUBLIC_SUPABASE_URL"}
            </p>
            <p>
              Anon key: {supabaseAnonKey ? maskKey(supabaseAnonKey) : "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY"}
            </p>
          </div>
          <button
            type="button"
            className="mt-4 rounded-full bg-[var(--sky)] px-4 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-50"
            onClick={testEnvConnection}
            disabled={!hasEnv}
          >
            Test Supabase connection
          </button>
          <p
            className={`mt-3 text-sm ${
              envStatus.kind === "error"
                ? "text-red-700"
                : envStatus.kind === "success"
                  ? "text-emerald-700"
                  : "text-[var(--muted)]"
            }`}
          >
            {envStatus.text}
          </p>
        </section>

        <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-[0_12px_24px_var(--shadow)]">
          <h2 className="text-lg font-semibold text-[var(--ink)]">
            2) Basic database action (flip a bit)
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Table: {tableName}. Row id: {demoRowId}. Column toggled: is_enabled.
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Current value: {flagLoaded ? String(flagEnabled) : "No value loaded yet"}
          </p>
          <button
            type="button"
            onClick={toggleFlag}
            className="mt-4 rounded-full bg-[var(--peach)] px-4 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-50"
            disabled={!hasEnv}
          >
            Flip value
          </button>
          <p
            className={`mt-3 text-sm ${
              dbStatus.kind === "error"
                ? "text-red-700"
                : dbStatus.kind === "success"
                  ? "text-emerald-700"
                  : "text-[var(--muted)]"
            }`}
          >
            {dbStatus.text}
          </p>
        </section>
      </div>
    </main>
  );
}
