"use client";

import { useEffect, useState } from "react";

type VocabularyEntry = {
  id: number;
  word: string;
  reading: string;
  meaning: string;
  example: string;
};

type StudyCard = VocabularyEntry & { studyType: "due" | "new" };
type ReviewRating = "Again" | "Hard" | "Good" | "Very good";

type DailyProgress = {
  studyDate: string;
  dailyNewWordLimit: number;
  newWordsStudiedToday: number;
  newWordsRemaining: number;
};

type StudySession = {
  dueCards: VocabularyEntry[];
  newCards: VocabularyEntry[];
  dailyProgress: DailyProgress;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

export default function VocabularyPage() {
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  const [dailyProgress, setDailyProgress] = useState<DailyProgress | null>(
    null,
  );
  const [levelVocabularyCount, setLevelVocabularyCount] = useState<number | null>(null);
  const [level, setLevel] = useState<"N5" | "N4" | "N3">("N5");

  useEffect(() => {
    async function loadCards() {
      setLoading(true);
      setError("");
      setFinished(false);
      setLevelVocabularyCount(null);

      try {
        const [response, vocabularyResponse] = await Promise.all([
          fetch(`${API_URL}/api/vocabulary/study?level=${level}`),
          fetch(`${API_URL}/api/vocabulary?level=${level}`),
        ]);
        if (!response.ok || !vocabularyResponse.ok) {
          throw new Error("Failed to load vocabulary");
        }

        const [session, vocabulary] = await Promise.all([
          response.json() as Promise<StudySession>,
          vocabularyResponse.json() as Promise<VocabularyEntry[]>,
        ]);
        const queue: StudyCard[] = [
          ...session.dueCards.map((card) => ({
            ...card,
            studyType: "due" as const,
          })),
          ...session.newCards.map((card) => ({
            ...card,
            studyType: "new" as const,
          })),
        ];

        setCards(queue);
        setLevelVocabularyCount(vocabulary.length);
        setDailyProgress(session.dailyProgress);
        setCurrentIndex(0);
        setRevealed(false);
        setFinished(queue.length === 0);
      } catch {
        setError("Couldn't load vocabulary. Check the backend and database.");
      } finally {
        setLoading(false);
      }
    }

    void loadCards();
  }, [level]);

  const currentCard = cards[currentIndex];

  function handleAudio() {
    if (!currentCard || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      currentCard.example || currentCard.word,
    );
    utterance.lang = "ja-JP";
    window.speechSynthesis.speak(utterance);
  }

  async function handleReview(rating: ReviewRating) {
    if (!currentCard || saving) return;

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vocabularyId: currentCard.id, rating }),
      });

      if (response.status === 409) {
        setError(
          "The daily new-word limit was reached in another session. Refresh the queue to continue with due reviews.",
        );
        return;
      }
      if (!response.ok) throw new Error("Failed to save review");

      const result: { dailyProgress: DailyProgress } = await response.json();
      setDailyProgress(result.dailyProgress);

      if (currentIndex === cards.length - 1) {
        setFinished(true);
      } else {
        setCurrentIndex((index) => index + 1);
      }
      setRevealed(false);
    } catch {
      setError("Couldn't save your review. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="p-8"><p className="loading-state">Loading vocabulary...</p></main>;
  }

  if (finished) {
    return (
      <main className="mx-auto max-w-2xl space-y-5 p-6 md:p-8">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
            Daily practice
          </p>
          <h1 className="text-3xl font-bold">Vocabulary</h1>

          <div className="flex items-center gap-3">
            <label htmlFor="vocabulary-level" className="font-medium">
              JLPT Level
            </label>
            <select
              id="vocabulary-level"
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

          <p className="text-gray-500">
            Due reviews come first. New words use your daily allowance.
          </p>

          <DailyProgressCard progress={dailyProgress} />
        </header>

        <section className="space-y-3 rounded-xl border p-8 text-center">
          <p className="text-4xl">🎉</p>
          <h2 className="text-2xl font-bold">
            {levelVocabularyCount === 0
              ? `No ${level} vocabulary content yet.`
              : "You’re all caught up for today!"}
          </h2>
          <p className="text-gray-500">
            {levelVocabularyCount === 0
              ? "Choose another level or return when vocabulary has been added."
              : "There are no due reviews or unreviewed words available within today’s allowance. The allowance resets on the next study day."}
          </p>
        </section>
      </main>
    );
  }

  if (!currentCard) {
    return (
      <main className="mx-auto max-w-2xl space-y-5 p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
          Daily practice
        </p>
        <h1 className="text-3xl font-bold">Vocabulary</h1>
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800"
        >
          {error || "No vocabulary card is available."}
        </p>
        <button
          className="rounded-lg border px-4 py-2"
          onClick={() => window.location.reload()}
        >
          Refresh
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6 md:p-8">
      <header>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
          Daily practice
        </p>
        <h1 className="text-3xl font-bold">Vocabulary</h1>
        <div className="flex items-center gap-3">
          <label htmlFor="vocabulary-level" className="font-medium">
            JLPT Level
          </label>
          <select
            id="vocabulary-level"
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
        <p className="mt-2 text-gray-500">
          Due reviews come first. New words use your daily allowance.
        </p>
        <DailyProgressCard progress={dailyProgress} />
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          <p>{error}</p>
          {error.includes("daily new-word limit") && (
            <button
              className="mt-2 rounded-md border border-red-400 px-3 py-1 font-medium"
              onClick={() => window.location.reload()}
            >
              Refresh queue
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          Card {currentIndex + 1} of {cards.length}
        </span>
        <span className="rounded-full border px-3 py-1">
          {currentCard.studyType === "due" ? "Due review" : "New word"}
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-emerald-700 transition-all"
          style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
        />
      </div>

      <section className="space-y-6 rounded-xl border p-6 md:p-8">
        <div className="py-6 text-center">
          <h2 className="text-5xl font-medium">{currentCard.word}</h2>
        </div>

        {!revealed ? (
          <button
            className="w-full rounded-lg bg-red-700 px-4 py-3 font-semibold text-white hover:bg-red-800"
            onClick={() => setRevealed(true)}
          >
            Reveal answer
          </button>
        ) : (
          <div className="space-y-5">
            <div className="rounded-lg bg-gray-100 p-5 text-gray-900">
              <p className="text-lg">{currentCard.reading}</p>
              <p className="mt-1 text-xl font-semibold">
                {currentCard.meaning}
              </p>

              <div className="mt-5 space-y-2">
                <h3 className="text-sm font-semibold text-gray-500">Example</h3>
                <p className="text-lg">{currentCard.example}</p>
                <button
                  className="rounded-lg border px-3 py-2 text-sm"
                  onClick={handleAudio}
                  aria-label={`Play Japanese pronunciation for ${currentCard.word}`}
                >
                  🔊 Play Japanese audio
                </button>
              </div>
            </div>

            <p className="text-sm text-gray-500">
              How well did you remember this word?
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(["Again", "Hard", "Good", "Very good"] as const).map(
                (rating) => (
                  <button
                    key={rating}
                    disabled={saving}
                    className="rounded-lg border px-4 py-3 font-medium transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
                    onClick={() => handleReview(rating)}
                  >
                    {saving ? "Saving..." : rating}
                  </button>
                ),
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function DailyProgressCard({ progress }: { progress: DailyProgress | null }) {
  if (!progress) return null;

  return (
    <section
      className="mt-4 rounded-xl bg-gray-50 p-4"
      aria-live="polite"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-semibold">Today&apos;s new words</h2>
        <p className="text-sm text-gray-600">
          {progress.newWordsStudiedToday} / {progress.dailyNewWordLimit} studied
        </p>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        {progress.newWordsRemaining} new{" "}
        {progress.newWordsRemaining === 1 ? "word" : "words"} remaining. Due
        reviews don&apos;t use this allowance.
      </p>
    </section>
  );
}
