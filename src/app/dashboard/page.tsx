"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
const CATEGORIES = ["vocabulary", "kanji", "grammar"] as const;
type Category = (typeof CATEGORIES)[number];
type Level = "N5" | "N4" | "N3";

type VocabularyEntry = {
  id: number;
  word: string;
  reading: string;
  meaning: string;
};
type GrammarPoint = { id: number; title: string; status: string };
type KanjiEntry = { id: number; character: string; status: string };
type ReviewRecord = { vocabularyId: number };
type AssessmentResult = {
  score: number;
  total: number;
  categoryScores: Partial<Record<Category, number>>;
  incorrectQuestionIds: string[];
};
type DailyProgress = {
  studyDate: string;
  dailyNewWordLimit: number;
  newWordsStudiedToday: number;
  newWordsRemaining: number;
};
type StudySession = {
  dueCards: { id: number }[];
  newCards: { id: number }[];
  dailyProgress: DailyProgress;
};
type DashboardData = {
  vocabulary: VocabularyEntry[];
  reviews: ReviewRecord[];
  grammar: GrammarPoint[];
  kanji: KanjiEntry[];
  assessmentContent: {
    vocabulary: VocabularyEntry[];
    grammar: GrammarPoint[];
    kanji: KanjiEntry[];
  };
  studySession: StudySession;
};

const categoryDetails: Record<
  Category,
  { label: string; href: string; maximum: number }
> = {
  vocabulary: { label: "Vocabulary", href: "/vocabulary", maximum: 10 },
  kanji: { label: "Kanji", href: "/kanji", maximum: 5 },
  grammar: { label: "Grammar", href: "/grammar", maximum: 5 },
};

function readAssessmentResult(): AssessmentResult | null {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem("assessmentResult") ?? "null",
    );
    if (!value || typeof value !== "object") return null;

    const result = value as Record<string, unknown>;
    if (
      typeof result.score !== "number" ||
      !Number.isFinite(result.score) ||
      typeof result.total !== "number" ||
      !Number.isFinite(result.total) ||
      result.total <= 0 ||
      result.score < 0 ||
      result.score > result.total
    ) {
      return null;
    }

    const rawScores = result.categoryScores;
    const categoryScores: Partial<Record<Category, number>> = {};
    if (rawScores && typeof rawScores === "object") {
      for (const category of CATEGORIES) {
        const score = (rawScores as Record<string, unknown>)[category];
        if (
          typeof score === "number" &&
          Number.isFinite(score) &&
          score >= 0 &&
          score <= categoryDetails[category].maximum
        ) {
          categoryScores[category] = score;
        }
      }
    }

    return {
      score: result.score,
      total: result.total,
      categoryScores,
      incorrectQuestionIds: Array.isArray(result.incorrectQuestionIds)
        ? [...new Set(result.incorrectQuestionIds.filter(
            (id): id is string => typeof id === "string",
          ))]
        : [],
    };
  } catch {
    return null;
  }
}

function ProgressBar({ value, maximum }: { value: number; maximum: number }) {
  const percentage = maximum > 0 ? Math.min(100, (value / maximum) * 100) : 0;
  return (
    <div
      className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={maximum}
    >
      <div
        className="h-full rounded-full bg-emerald-700 transition-all"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

export default function Dashboard() {
  const [level, setLevel] = useState<Level>("N5");
  const [data, setData] = useState<DashboardData | null>(null);
  const [assessment, setAssessment] = useState<AssessmentResult | null>(null);
  const [loadedLevel, setLoadedLevel] = useState<Level | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      try {
        const endpoints = [
          `/api/vocabulary?level=${level}`,
          "/api/reviews",
          `/api/grammar?level=${level}`,
          `/api/kanji?level=${level}`,
          `/api/vocabulary/study?level=${level}`,
        ];
        const responses = await Promise.all(
          endpoints.map((endpoint) =>
            fetch(`${API_URL}${endpoint}`, { signal: controller.signal }),
          ),
        );
        if (responses.some((response) => !response.ok)) {
          throw new Error("Failed to load dashboard data");
        }

        const [vocabulary, reviews, grammar, kanji, studySession] =
          await Promise.all(responses.map((response) => response.json()));
        let assessmentContent = { vocabulary, grammar, kanji };
        if (level !== "N5") {
          const assessmentResponses = await Promise.all(
            ["/api/vocabulary?level=N5", "/api/grammar?level=N5", "/api/kanji?level=N5"].map(
              (endpoint) => fetch(`${API_URL}${endpoint}`, { signal: controller.signal }),
            ),
          );
          if (assessmentResponses.some((response) => !response.ok)) {
            throw new Error("Failed to load assessment question labels");
          }
          const [assessmentVocabulary, assessmentGrammar, assessmentKanji] =
            await Promise.all(assessmentResponses.map((response) => response.json()));
          assessmentContent = {
            vocabulary: assessmentVocabulary,
            grammar: assessmentGrammar,
            kanji: assessmentKanji,
          };
        }
        if (controller.signal.aborted) return;
        setData({ vocabulary, reviews, grammar, kanji, assessmentContent, studySession });
        setError("");
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === "AbortError") return;
        setData(null);
        setError("Couldn’t load your learning progress. Check that the backend is running.");
      } finally {
        if (!controller.signal.aborted) setLoadedLevel(level);
      }
    }

    void loadDashboard();
    return () => controller.abort();
  }, [level]);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setAssessment(readAssessmentResult()),
      0,
    );
    return () => window.clearTimeout(timeout);
  }, []);

  const reviewedVocabularyCount = useMemo(() => {
    if (!data) return 0;
    const vocabularyIds = new Set(data.vocabulary.map((item) => item.id));
    return new Set(
      data.reviews
        .filter((review) => vocabularyIds.has(review.vocabularyId))
        .map((review) => review.vocabularyId),
    ).size;
  }, [data]);

  const learnedGrammarCount =
    data?.grammar.filter((item) => item.status === "Learned").length ?? 0;
  const learnedKanjiCount =
    data?.kanji.filter((item) => item.status === "Learned").length ?? 0;
  const dueReviewCount = data?.studySession.dueCards.length ?? 0;
  const dailyProgress = data?.studySession.dailyProgress;

  const assessmentCategories = CATEGORIES.map((category) => {
    const score = assessment?.categoryScores[category];
    const maximum = categoryDetails[category].maximum;
    return {
      category,
      score,
      maximum,
      percentage:
        score === undefined ? null : Math.min(100, (score / maximum) * 100),
    };
  });
  const categoriesNeedingPractice = assessmentCategories.filter(
    (category) => category.percentage !== null && category.percentage < 70,
  ).sort((a, b) => (a.percentage ?? 0) - (b.percentage ?? 0));
  const weakestCategory = categoriesNeedingPractice[0];

  const incorrectItems = useMemo(() => {
    if (!assessment) return [];
    return assessment.incorrectQuestionIds.map((id) => {
      const match = /^(vocabulary|kanji|grammar)-(\d+)$/.exec(id);
      if (!match) return { id, label: id, category: "Assessment" };
      const category = match[1] as Category;
      const itemId = Number(match[2]);
      const label =
        category === "vocabulary"
          ? data?.assessmentContent.vocabulary.find((item) => item.id === itemId)?.word
          : category === "kanji"
            ? data?.assessmentContent.kanji.find((item) => item.id === itemId)?.character
            : data?.assessmentContent.grammar.find((item) => item.id === itemId)?.title;
      return {
        id,
        label: label ?? id,
        category: categoryDetails[category].label,
      };
    });
  }, [assessment, data]);

  if (loadedLevel !== level) {
    return <main className="p-8"><p className="loading-state">Loading your progress...</p></main>;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
            Study overview
          </p>
          <h1 className="text-4xl font-bold">おかえり、</h1>
          <p className="mt-2 text-gray-500">Keep going on your Japanese journey.</p>
        </div>
        <label className="text-sm font-medium">
          Learning level
          <select
            className="ml-3 rounded-lg border px-3 py-2"
            value={level}
            onChange={(event) => setLevel(event.target.value as Level)}
          >
            <option value="N5">N5</option>
            <option value="N4">N4</option>
            <option value="N3">N3</option>
          </select>
        </label>
      </header>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <section className="rounded-xl border p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Latest N5 assessment</h2>
            <p className="mt-1 text-sm text-gray-500">
              A snapshot from a short check, not a measure of full JLPT mastery.
            </p>
          </div>
          <Link
            href="/assessment"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Take assessment
          </Link>
        </div>

        {!assessment ? (
          <p className="mt-5 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
            No assessment result yet. Take the short assessment to see which areas could use more practice.
          </p>
        ) : (
          <>
            <p className="mt-5 text-3xl font-bold">
              {assessment.score} / {assessment.total}
              <span className="ml-2 text-base font-normal text-gray-500">
                ({Math.round((assessment.score / assessment.total) * 100)}%)
              </span>
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {assessmentCategories.map(({ category, score, maximum, percentage }) => (
                <Link
                  href={categoryDetails[category].href}
                  key={category}
                  className="rounded-lg border p-4 hover:bg-gray-50"
                >
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">{categoryDetails[category].label}</span>
                    <span className="text-sm text-gray-600">
                      {score === undefined ? "—" : `${score} / ${maximum}`}
                    </span>
                  </div>
                  {percentage !== null && (
                    <ProgressBar value={score ?? 0} maximum={maximum} />
                  )}
                </Link>
              ))}
            </div>

            <div className="mt-5 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-950">
              {weakestCategory ? (
                <p>
                  Focus next on {categoryDetails[weakestCategory.category].label.toLowerCase()} ({weakestCategory.score} / {weakestCategory.maximum}).{" "}
                  <Link
                    href={categoryDetails[weakestCategory.category].href}
                    className="font-semibold underline"
                  >
                    Practice this area
                  </Link>
                  .
                </p>
              ) : assessmentCategories.some((category) => category.percentage !== null) ? (
                <p>
                  No category fell below 70% on this short check. Keep regular practice across vocabulary, kanji, and grammar.
                </p>
              ) : (
                <p>Category scores are unavailable for this assessment result.</p>
              )}
              {weakestCategory && (
                <p className="mt-2">
                  Areas below 70% on this check: {categoriesNeedingPractice
                    .map((item) => categoryDetails[item.category].label)
                    .join(", ")}.
                </p>
              )}
            </div>

            <div className="mt-5">
              <h3 className="font-semibold">Questions to revisit</h3>
              {incorrectItems.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">
                  No missed questions were recorded in your latest check.
                </p>
              ) : (
                <>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {incorrectItems.slice(0, 6).map((item) => (
                      <li key={item.id} className="rounded-lg border px-3 py-2 text-sm">
                        <span className="text-gray-500">{item.category}: </span>
                        {item.label}
                      </li>
                    ))}
                  </ul>
                  {incorrectItems.length > 6 && (
                    <p className="mt-2 text-sm text-gray-500">
                      And {incorrectItems.length - 6} more to revisit.
                    </p>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border p-6">
        <h2 className="text-xl font-bold">Learning progress · {level}</h2>
        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
            Learning totals are unavailable until the backend reconnects.
          </p>
        ) : !data || (data.vocabulary.length + data.grammar.length + data.kanji.length === 0) ? (
          <p className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
            No learning items are available for {level} yet. Your progress will appear here when content is added.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <ProgressCard
              title="Vocabulary reviews"
              completed={reviewedVocabularyCount}
              total={data.vocabulary.length}
              href="/review"
              detail={`${dueReviewCount} due for review`}
            />
            <ProgressCard
              title="Grammar learned"
              completed={learnedGrammarCount}
              total={data.grammar.length}
              href="/grammar"
              detail={`${data.grammar.length - learnedGrammarCount} not marked learned`}
            />
            <ProgressCard
              title="Kanji learned"
              completed={learnedKanjiCount}
              total={data.kanji.length}
              href="/kanji"
              detail={`${data.kanji.length - learnedKanjiCount} not marked learned`}
            />
          </div>
        )}
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border p-6">
          <h2 className="text-xl font-bold">Today&apos;s New Words</h2>
          {dailyProgress ? (
            <>
              <div className="mt-4 flex items-baseline justify-between gap-4">
                <p className="text-3xl font-bold">
                  {dailyProgress.newWordsStudiedToday}
                  <span className="text-lg font-normal text-gray-500">
                    {" "}/ {dailyProgress.dailyNewWordLimit}
                  </span>
                </p>
                <p className="text-sm text-gray-500">
                  {dailyProgress.newWordsRemaining} remaining
                </p>
              </div>
              <ProgressBar
                value={dailyProgress.newWordsStudiedToday}
                maximum={dailyProgress.dailyNewWordLimit}
              />
            </>
          ) : (
            <p className="mt-3 text-sm text-gray-500">Daily study data is unavailable.</p>
          )}
          <p className="mt-3 text-sm text-gray-500">
            Due reviews are separate from your daily new-word allowance.
          </p>
          <Link
            href="/vocabulary"
            className="mt-4 inline-block rounded-lg bg-red-700 px-4 py-2 text-white hover:bg-red-800"
          >
            Study vocabulary
          </Link>
        </div>

        <div className="rounded-xl border p-6">
          <h2 className="text-xl font-bold">Due Reviews</h2>
          <p className="mt-3 text-3xl font-bold">{dueReviewCount}</p>
          <p className="mt-1 text-sm text-gray-500">Vocabulary cards ready for review</p>
          <Link
            href="/review"
            className="mt-4 inline-block rounded-lg bg-red-700 px-4 py-2 text-white hover:bg-red-800"
          >
            Start reviewing
          </Link>
        </div>
      </section>
    </main>
  );
}

function ProgressCard({
  title,
  completed,
  total,
  href,
  detail,
}: {
  title: string;
  completed: number;
  total: number;
  href: string;
  detail: string;
}) {
  return (
    <Link href={href} className="rounded-lg border p-4 hover:bg-gray-50">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <span className="text-sm text-gray-600">{completed} / {total}</span>
      </div>
      <ProgressBar value={completed} maximum={total} />
      <p className="mt-2 text-sm text-gray-500">{detail}</p>
    </Link>
  );
}
