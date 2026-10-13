"use client";

import { useEffect, useState } from "react";

const API_URL = "http://localhost:5000/api/grammar";
const STATUSES = ["Not started", "In progress", "Learned"] as const;
type GrammarStatus = (typeof STATUSES)[number];

type GrammarPoint = {
  id: number;
  title: string;
  explanation: string;
  example: string;
  meaning: string;
  status: GrammarStatus;
};

export default function GrammarPage() {
  const [grammar, setGrammar] = useState<GrammarPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [level, setLevel] = useState<"N5" | "N4" | "N3">("N5");

  const learnedCount = grammar.filter(
    (point) => point.status === "Learned",
  ).length;

  const progressPercent =
    grammar.length === 0 ? 0 : (learnedCount / grammar.length) * 100;

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_URL}?level=${level}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load grammar points.");
        return (await response.json()) as GrammarPoint[];
      })
      .then(setGrammar)
      .catch((fetchError: unknown) => {
        if (fetchError instanceof Error && fetchError.name === "AbortError")
          return;
        setError(
          "Could not load grammar points. Check that the backend is running.",
        );
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [level]);

  async function updateStatus(id: number, status: GrammarStatus) {
    const previousStatus = grammar.find((point) => point.id === id)?.status;
    if (!previousStatus || previousStatus === status) return;

    setError("");
    setSavingId(id);
    setGrammar((points) =>
      points.map((point) => (point.id === id ? { ...point, status } : point)),
    );

    try {
      const response = await fetch(`${API_URL}/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Could not save status.");
    } catch {
      setGrammar((points) =>
        points.map((point) =>
          point.id === id ? { ...point, status: previousStatus } : point,
        ),
      );
      setError("Could not save your status. Please try again.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8">
      <header className="mb-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
          Pattern library
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Grammar
        </h1>
        <p className="mt-2 text-gray-600">
          Review each pattern and keep track of your progress.
        </p>
      </header>

      <div className="flex items-center gap-3">
        <label htmlFor="grammar-level" className="font-medium">
          JLPT Level
        </label>
        <select
          id="grammar-level"
          value={level}
          onChange={(event) =>
            setLevel(event.target.value as "N5" | "N4" | "N3")
          }
          className="rounded-lg border bg-background px-3 py-2"
        >
          <option value="N5">N5 — Beginner</option>
          <option value="N4">N4 — Elementary</option>
          <option value="N3">N3 — Intermediate</option>
        </select>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {!loading && grammar.length > 0 && (
        <section className="mb-6 rounded-xl border p-4">
          <div className="flex justify-between gap-3 text-sm">
            <span>Learning progress</span>
            <span>
              {learnedCount} / {grammar.length} learned
            </span>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-emerald-700 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </section>
      )}

      {loading ? (
        <p className="loading-state">
          Loading grammar points…
        </p>
      ) : grammar.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-gray-600">
          <p className="font-medium">No {level} grammar content yet.</p>
          <p className="mt-1 text-sm">
            There&apos;s no {level} grammar content available right now.
          </p>
        </div>
      ) : (
        <section
          aria-label="Grammar points"
          className="grid gap-5 md:grid-cols-2"
        >
          {grammar.map((point) => (
            <article
              key={point.id}
              className="rounded-2xl border bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-2xl font-semibold">{point.title}</h2>
                <label
                  className="sr-only"
                  htmlFor={`grammar-status-${point.id}`}
                >
                  Progress for {point.title}
                </label>
                <select
                  id={`grammar-status-${point.id}`}
                  value={point.status}
                  disabled={savingId === point.id}
                  onChange={(event) =>
                    updateStatus(point.id, event.target.value as GrammarStatus)
                  }
                  className="rounded-lg border bg-transparent px-3 py-2 text-sm disabled:opacity-60"
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              <p className="mt-4 leading-7 text-gray-700">
                {point.explanation}
              </p>
              <div className="mt-5 rounded-xl bg-gray-50 p-4">
                <p className="text-xl" lang="ja">
                  {point.example}
                </p>
                <p className="mt-2 text-sm text-gray-600">
                  {point.meaning}
                </p>
              </div>
              {savingId === point.id && (
                <p className="mt-3 text-xs text-gray-500" aria-live="polite">
                  Saving…
                </p>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
