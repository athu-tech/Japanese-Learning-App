"use client";

import { useEffect, useState } from "react";

type KanjiEntry = {
  id: number;
  character: string;
  meaning: string;
  onyomi: string | null;
  kunyomi: string | null;
  example: string | null;
  example_meaning: string | null;
  status: "Not started" | "Learning" | "Learned";
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

export default function KanjiPage() {
  const [kanji, setKanji] = useState<KanjiEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [level, setLevel] = useState<"N5" | "N4" | "N3">("N5");
  const [revealed, setRevealed] = useState<number | null>(null);

  useEffect(() => {
    async function fetchKanji() {
      try {
        const response = await fetch(`${API_URL}/api/kanji?level=${level}`);

        if (!response.ok) {
          throw new Error("Failed to load kanji");
        }

        const data: KanjiEntry[] = await response.json();
        setKanji(data);
      } catch {
        setError("Couldn't load kanji. Is the backend running?");
      } finally {
        setLoading(false);
      }
    }

    fetchKanji();
  }, [level]);

  async function updateStatus(id: number, status: KanjiEntry["status"]) {
    const previous = kanji;
    setError("");

    setKanji((items) =>
      items.map((item) => (item.id === id ? { ...item, status } : item)),
    );

    try {
      const response = await fetch(`${API_URL}/api/kanji/${id}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error("Failed to save progress");
      }
    } catch {
      setKanji(previous);
      setError("Couldn't save progress. Please try again.");
    }
  }

  const learnedCount = kanji.filter((item) => item.status === "Learned").length;

  const learningCount = kanji.filter(
    (item) => item.status === "Learning",
  ).length;

  if (loading) {
    return <main className="p-8"><p className="loading-state">Loading kanji...</p></main>;
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <header>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
          Character library
        </p>
        <h1 className="text-3xl font-bold">Kanji</h1>
        <p className="mt-2 text-gray-500">
          Learn kanji, explore their readings, and track your progress.
        </p>
      </header>
      <div className="mt-3 flex items-center gap-3">
        <label htmlFor="kanji-level" className="font-medium">
          JLPT Level
        </label>

        <select
          id="kanji-level"
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

      {kanji.length > 0 && (
        <section className="rounded-xl border p-4">
          <div className="flex justify-between gap-3 text-sm">
            <span>Learning progress</span>
            <span>
              {learnedCount} / {kanji.length} learned
            </span>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-emerald-700 transition-all"
              style={{
                width: `${
                  kanji.length ? (learnedCount / kanji.length) * 100 : 0
                }%`,
              }}
            />
          </div>

          <p className="mt-3 text-sm text-gray-500">
            {learningCount} currently learning ·{" "}
            {kanji.length - learnedCount - learningCount} not started
          </p>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {kanji.map((item) => (
          <article key={item.id} className="space-y-4 rounded-xl border p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-5xl font-medium">{item.character}</h2>

              <select
                aria-label={`Progress for ${item.character}`}
                value={item.status}
                onChange={(event) =>
                  updateStatus(
                    item.id,
                    event.target.value as KanjiEntry["status"],
                  )
                }
                className="max-w-36 rounded-lg border bg-transparent px-2 py-2 text-sm"
              >
                <option value="Not started">Not started</option>
                <option value="Learning">Learning</option>
                <option value="Learned">Learned</option>
              </select>
            </div>

            {!revealed || revealed !== item.id ? (
              <button
                className="w-full rounded-lg border px-4 py-3 font-medium hover:bg-gray-100"
                onClick={() => setRevealed(item.id)}
                aria-expanded={revealed === item.id}
              >
                Reveal answer
              </button>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-semibold">{item.meaning}</p>
                </div>

                <div className="space-y-2 text-sm">
                  <p>
                    <span className="text-gray-500">On&apos;yomi: </span>
                    {item.onyomi || "—"}
                  </p>
                  <p>
                    <span className="text-gray-500">Kun&apos;yomi: </span>
                    {item.kunyomi || "—"}
                  </p>
                </div>

                {item.example && (
                  <div className="rounded-lg bg-gray-100 p-4 text-gray-900">
                    <p className="text-xl">{item.example}</p>
                    {item.example_meaning && (
                      <p className="mt-2 text-sm text-gray-600">
                        {item.example_meaning}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </article>
        ))}

        {kanji.length === 0 && !error && (
          <div className="rounded-xl border border-dashed p-8 text-center text-gray-600">
            <p className="font-medium">No {level} kanji content yet.</p>
            <p className="mt-1 text-sm">
              There&apos;s no {level} kanji content available right now.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
