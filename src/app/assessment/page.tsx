"use client";

import { useEffect, useState } from "react";

const API_URL = "http://localhost:5000";

type AssessmentQuestion = {
  id: string;
  category: "vocabulary" | "kanji" | "grammar";
  question: string;
  options: string[];
  correctAnswer: string;
};

export default function AssessmentPage() {
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [categoryScores, setCategoryScores] = useState({
    vocabulary: 0,
    kanji: 0,
    grammar: 0,
  });
  const [incorrectQuestionIds, setIncorrectQuestionIds] = useState<string[]>(
    [],
  );

  useEffect(() => {
    async function loadAssessment() {
      try {
        const response = await fetch(`${API_URL}/api/assessment`);

        if (!response.ok) {
          throw new Error("Failed to load assessment");
        }

        const data: { questions: AssessmentQuestion[] } = await response.json();

        setQuestions(data.questions);
      } catch {
        setError("Couldn't load the assessment.");
      } finally {
        setLoading(false);
      }
    }

    void loadAssessment();
  }, []);

  useEffect(() => {
    if (currentIndex >= questions.length && questions.length > 0) {
      localStorage.setItem(
        "assessmentResult",
        JSON.stringify({
          score,
          total: questions.length,
          categoryScores,
          incorrectQuestionIds,
        }),
      );
    }
  }, [
    currentIndex,
    questions.length,
    score,
    categoryScores,
    incorrectQuestionIds,
  ]);

  if (loading) {
    return <main className="p-6"><p className="loading-state">Loading assessment...</p></main>;
  }

  if (error) {
    return <main className="p-6">{error}</main>;
  }

  const percentage = (score / questions.length) * 100;

  let assessmentMessage = "";

  if (percentage >= 90) {
    assessmentMessage = "Strong N5 foundation";
  } else if (percentage >= 75) {
    assessmentMessage = "Good N5 foundation";
  } else if (percentage >= 50) {
    assessmentMessage = "Developing N5 foundation";
  } else {
    assessmentMessage = "Needs more N5 study";
  }

  const currentQuestion = questions[currentIndex];

  if (currentIndex >= questions.length) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
          N5 knowledge check
        </p>
        <h1 className="text-3xl font-bold">Assessment complete</h1>

        <div className="mt-6 space-y-4">
          <div className="rounded-xl border p-5">
            <p className="text-sm text-gray-500">Overall Score</p>
            <p className="mt-1 text-3xl font-bold">
              {score} / {questions.length}
            </p>
            <p className="mt-3 text-gray-600">{assessmentMessage}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border p-5">
              <p className="text-sm text-gray-500">Vocabulary</p>
              <p className="mt-1 text-2xl font-bold">
                {categoryScores.vocabulary} / 10
              </p>
            </div>

            <div className="rounded-xl border p-5">
              <p className="text-sm text-gray-500">Kanji</p>
              <p className="mt-1 text-2xl font-bold">
                {categoryScores.kanji} / 5
              </p>
            </div>

            <div className="rounded-xl border p-5">
              <p className="text-sm text-gray-500">Grammar</p>
              <p className="mt-1 text-2xl font-bold">
                {categoryScores.grammar} / 5
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
          N5 knowledge check
        </p>
        <div className="flex items-end justify-between gap-4">
          <h1 className="text-3xl font-bold">Assessment</h1>
          <p className="text-sm text-gray-500">
            Question {currentIndex + 1} of {questions.length}
          </p>
        </div>
        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-200"
          role="progressbar"
          aria-label="Assessment progress"
          aria-valuenow={currentIndex + 1}
          aria-valuemin={1}
          aria-valuemax={questions.length}
        >
          <div
            className="h-full rounded-full bg-red-700 transition-all"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </header>

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {currentQuestion.category}
      </p>

      <h1 className="mt-4 text-2xl font-bold">{currentQuestion.question}</h1>

      <div className="mt-6 space-y-3">
        {currentQuestion.options.map((option) => (
          <button
            key={option}
            onClick={() => setSelectedAnswer(option)}
            aria-pressed={selectedAnswer === option}
            className={`w-full rounded-xl border p-4 text-left font-medium transition ${
              selectedAnswer === option
                ? "border-red-700 bg-red-50 text-gray-900"
                : "border-gray-200 bg-white text-gray-800 hover:border-red-300 hover:bg-red-50"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {selectedAnswer && (
        <button
          onClick={() => {
            if (selectedAnswer === currentQuestion.correctAnswer) {
              setScore((previous) => previous + 1);
              setCategoryScores((previous) => ({
                ...previous,
                [currentQuestion.category]:
                  previous[currentQuestion.category] + 1,
              }));
            } else {
              setIncorrectQuestionIds((previous) => [
                ...previous,
                currentQuestion.id,
              ]);
            }

            setSelectedAnswer(null);
            setCurrentIndex((previous) => previous + 1);
          }}
          className="mt-6 rounded-lg bg-red-700 px-5 py-3 font-semibold text-white hover:bg-red-800"
        >
          {currentIndex === questions.length - 1 ? "Finish" : "Next"}
        </button>
      )}
    </main>
  );
}
