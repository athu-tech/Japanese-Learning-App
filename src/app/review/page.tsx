"use client";

import { useCallback, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

type VocabularyCard = {
  id: number;
  word: string;
  reading: string | null;
  meaning: string | null;
  example: string | null;
};

const ratings = ["Again", "Hard", "Good", "Very good"] as const;
type ReviewRating = (typeof ratings)[number];

export default function Review() {
  const [cards, setCards] = useState<VocabularyCard[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchDueCards = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/reviews/due`);

      if (!response.ok) {
        throw new Error("Failed to fetch due cards.");
      }

      const data: VocabularyCard[] = await response.json();
      setCards(data);
    } catch {
      setError(
        "Couldn't load review cards. Make sure your backend is running.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchDueCards(false), 0);
    return () => window.clearTimeout(timeout);
  }, [fetchDueCards]);

  function playAudio() {
    const card = cards[0];
    if (!card) return;

    if (!("speechSynthesis" in window)) {
      setError("Speech synthesis isn't supported by this browser.");
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(card.example || card.word);
    utterance.lang = "ja-JP";
    window.speechSynthesis.speak(utterance);
  }

  async function submitRating(rating: ReviewRating) {
    const card = cards[0];
    if (!card || saving) return;

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vocabularyId: card.id,
          rating,
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "Failed to save your review.");
      }

      // Advance only after the backend successfully saves the rating.
      setCards((previous) => previous.slice(1));
      setRevealed(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while saving.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <p className="loading-state">Loading review cards...</p>
      </main>
    );
  }

  if (error && cards.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
          Spaced repetition
        </p>
        <h1 className="text-3xl font-bold text-gray-900">Review</h1>
        <p className="mt-4 text-red-600">{error}</p>
        <button
          onClick={() => void fetchDueCards()}
          className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-white hover:bg-red-800"
        >
          Try again
        </button>
      </main>
    );
  }

  if (cards.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12 text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
          Spaced repetition
        </p>
        <h1 className="text-3xl font-bold text-gray-900">Review complete</h1>
        <p className="mt-3 text-gray-600">
          No cards are due right now. Come back when your next reviews are due.
        </p>
        <button
          onClick={() => void fetchDueCards()}
          className="mt-6 rounded-lg border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50"
        >
          Check again
        </button>
      </main>
    );
  }

  const currentCard = cards[0];

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
            Spaced repetition
          </p>
          <h1 className="text-3xl font-bold text-gray-900">Review</h1>
          <p className="mt-2 text-gray-600">
            Focus on remembering, not just recognizing.
          </p>
        </div>

        <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
          {cards.length} remaining
        </span>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="flex min-h-64 flex-col items-center justify-center text-center">
          <p className="mb-5 text-sm text-gray-500">
            What does this word mean?
          </p>

          <h2 className="text-5xl font-bold text-gray-900">
            {currentCard.word}
          </h2>

          {revealed && (
            <div className="mt-6 space-y-3">
              {currentCard.reading && (
                <p className="text-xl text-red-700">{currentCard.reading}</p>
              )}

              <p className="text-2xl font-semibold text-gray-900">
                {currentCard.meaning}
              </p>

              {currentCard.example && (
                <div className="mt-5 rounded-xl bg-gray-50 p-4">
                  <p className="text-lg text-gray-800">{currentCard.example}</p>
                  <button
                    onClick={playAudio}
                    className="mt-2 text-sm font-medium text-red-700 hover:text-red-800"
                  >
                    Play Japanese audio
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="mb-4 text-center text-sm text-red-600">
            {error}
          </p>
        )}

        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            className="w-full rounded-xl bg-red-700 px-5 py-3 font-semibold text-white hover:bg-red-800"
          >
            Reveal answer
          </button>
        ) : (
          <div className="mt-4">
            <p className="mb-3 text-center text-sm text-gray-500">
              How well did you remember?
            </p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {ratings.map((rating) => (
                <button
                  key={rating}
                  disabled={saving}
                  onClick={() => void submitRating(rating)}
                  className="rounded-xl border border-gray-200 px-3 py-3 font-medium text-gray-800 transition hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving..." : rating}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <p className="mt-4 text-center text-sm text-gray-500">
        {cards.length} {cards.length === 1 ? "card" : "cards"} left in this
        session
      </p>
    </main>
  );
}
