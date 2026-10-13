"use client";

import { useState } from "react";

export default function RoadmapPage() {
  const [level, setLevel] = useState<"N5" | "N4" | "N3">("N5");
  const [studyTime, setStudyTime] = useState("1");
  const [targetDate, setTargetDate] = useState("");
  const [roadmap, setRoadmap] = useState<{
    level: string;
    studyTime: string;
    targetDate: string;
    daysAvailable: number;
    weeksAvailable: number;
    vocabularyPerWeek: number;
    kanjiPerWeek: number;
    grammarPerWeek: number;
    weeks: {
      week: number;
      vocabulary: {
        id: number;
        word: string;
        reading: string;
        meaning: string;
      }[];
      kanji: {
        id: number;
        character: string;
        meaning: string;
        onyomi: string;
        kunyomi: string;
      }[];
      grammar: {
        id: number;
        title: string;
        explanation: string;
        example: string;
        meaning: string;
      }[];
    }[];
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generateRoadmap() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("http://localhost:5000/api/roadmap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          level,
          studyTime,
          targetDate,
          assessmentResult: (() => {
            try {
              return JSON.parse(
                localStorage.getItem("assessmentResult") ?? "null",
              );
            } catch {
              return null;
            }
          })(),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate roadmap");
      }

      const data = await response.json();
      setRoadmap(data);
    } catch {
      setError("Couldn't generate the roadmap.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
        Plan your study
      </p>
      <h1 className="text-3xl font-bold">Your Japanese Roadmap</h1>

      <p className="mt-2 text-gray-600">
        Tell us about your goal and we&apos;ll create a learning path.
      </p>

      <div className="mt-8 space-y-6 rounded-2xl border p-6 sm:p-8">
        <div>
          <label className="block font-medium">Target JLPT level</label>

          <select
            value={level}
            onChange={(event) =>
              setLevel(event.target.value as "N5" | "N4" | "N3")
            }
            className="mt-2 w-full max-w-sm rounded-lg border px-3 py-2"
          >
            <option value="N5">N5</option>
            <option value="N4">N4</option>
            <option value="N3">N3</option>
          </select>
        </div>

        <div>
          <label className="block font-medium">
            Study time per day (hours)
          </label>

          <input
            type="number"
            min="0.5"
            step="0.5"
            value={studyTime}
            onChange={(event) => setStudyTime(event.target.value)}
            className="mt-2 block w-full max-w-sm rounded-lg border px-3 py-2"
          />
        </div>

        <div>
          <label className="block font-medium">Target date</label>

          <input
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
            className="mt-2 block w-full max-w-sm rounded-lg border px-3 py-2"
          />
        </div>

        <button
          type="button"
          onClick={generateRoadmap}
          disabled={loading}
          className="rounded-lg bg-red-700 px-5 py-3 font-semibold text-white hover:bg-red-800 disabled:opacity-60"
        >
          {loading ? "Generating..." : "Generate Roadmap"}
        </button>

        {error && <p className="mt-4 text-red-500">{error}</p>}

        {roadmap && (
          <div className="mt-6 rounded-xl border p-5">
            <p>Level: {roadmap.level}</p>
            <p>Study time: {roadmap.studyTime} hours/day</p>
            <p>Target date: {roadmap.targetDate}</p>
            <p>Days available: {roadmap.daysAvailable}</p>
            <p>Weeks available: {roadmap.weeksAvailable}</p>

            <div className="mt-6 space-y-4">
              <h2 className="text-xl font-bold">Weekly Roadmap</h2>

              {roadmap.weeks.map((week) => (
                <div key={week.week} className="rounded-xl border p-5">
                  <h3 className="font-semibold">Week {week.week}</h3>

                  <div className="mt-3 space-y-4">
                    <div>
                      <p className="font-medium">Vocabulary</p>
                      <ul className="mt-1 list-disc pl-5">
                        {week.vocabulary.length > 0 ? (
                          week.vocabulary.map((item) => (
                            <li key={item.id}>{item.word}</li>
                          ))
                        ) : (
                          <li className="list-none text-sm text-gray-500">No vocabulary items for this level yet.</li>
                        )}
                      </ul>
                    </div>

                    <div>
                      <p className="font-medium">Kanji</p>
                      <ul className="mt-1 list-disc pl-5">
                        {week.kanji.length > 0 ? (
                          week.kanji.map((item) => (
                            <li key={item.id}>{item.character}</li>
                          ))
                        ) : (
                          <li className="list-none text-sm text-gray-500">No kanji items for this level yet.</li>
                        )}
                      </ul>
                    </div>

                    <div>
                      <p className="font-medium">Grammar</p>
                      <ul className="mt-1 list-disc pl-5">
                        {week.grammar.length > 0 ? (
                          week.grammar.map((item) => (
                            <li key={item.id}>{item.title}</li>
                          ))
                        ) : (
                          <li className="list-none text-sm text-gray-500">No grammar items for this level yet.</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
