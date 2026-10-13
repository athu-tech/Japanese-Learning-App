import express from "express";
import cors from "cors";
import pg from "pg";
import next from "next";
import { format } from "node:path";
import { createEmptyCard, fsrs, Rating, type Card } from "ts-fsrs";
import "dotenv/config";

const scheduler = fsrs();

const ratingMap = {
  Again: Rating.Again,
  Hard: Rating.Hard,
  Good: Rating.Good,
  "Very good": Rating.Easy,
} as const;

type ReviewRating = keyof typeof ratingMap;
function restoreCard(saved: Card): Card {
  return {
    ...saved,
    due: new Date(saved.due),
    ...(saved.last_review ? { last_review: new Date(saved.last_review) } : {}),
  };
}

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool
  .query("SELECT NOW()")
  .then((result) => {
    console.log("Database connected:", result.rows[0]);
  })
  .catch((error) => {
    console.error("Database connection failed:", error);
  });

const app = express();
app.use(cors());
app.use(express.json());
const reviews: { vocabularyId: number; rating: string }[] = [];
const DAILY_NEW_WORD_LIMIT = 10;

const PORT = 5000;
app.use(express.json());

// GET /api/vocabulary
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

app.get("/api/vocabulary", async (req, res) => {
  try {
    const level = req.query.level ?? "N5";

    if (typeof level !== "string" || !["N5", "N4", "N3"].includes(level)) {
      return res.status(400).json({
        error: "Invalid level. Use N5, N4, or N3.",
      });
    }

    const result = await pool.query(
      "SELECT * FROM vocabulary WHERE level = $1",
      [level],
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch vocabulary:", error);
    return res.status(500).json({
      error: "Failed to fetch vocabulary",
    });
  }
});

app.get("/api/vocabulary/study", async (req, res) => {
  try {
    const level = req.query.level ?? "N5";

    if (typeof level !== "string" || !["N5", "N4", "N3"].includes(level)) {
      return res.status(400).json({
        error: "Invalid level. Use N5, N4, or N3.",
      });
    }

    const [progressResult, dueResult] = await Promise.all([
      pool.query(
        `SELECT CURRENT_DATE AS "studyDate",
                COUNT(*) FILTER (
                  WHERE first_studied_date = CURRENT_DATE
                )::int AS "newWordsStudiedToday"
         FROM reviews`,
      ),
      pool.query(
        `SELECT vocabulary.*, reviews.fsrs_card,
                reviews.nextReviewDate
         FROM vocabulary
         JOIN reviews ON vocabulary.id = reviews.vocabularyId
         WHERE vocabulary.level = $1
           AND reviews.fsrs_card IS NOT NULL
           AND (reviews.fsrs_card->>'due')::timestamptz <= NOW()
         ORDER BY reviews.nextReviewDate ASC`,
        [level],
      ),
    ]);

    const { studyDate, newWordsStudiedToday } = progressResult.rows[0];

    const newWordsRemaining = Math.max(
      0,
      DAILY_NEW_WORD_LIMIT - newWordsStudiedToday,
    );

    const newResult = await pool.query(
      `SELECT vocabulary.*
       FROM vocabulary
       LEFT JOIN reviews ON vocabulary.id = reviews.vocabularyId
       WHERE vocabulary.level = $1
         AND reviews.vocabularyId IS NULL
       ORDER BY vocabulary.id
       LIMIT $2`,
      [level, newWordsRemaining],
    );

    return res.json({
      dueCards: dueResult.rows,
      newCards: newResult.rows,
      dailyProgress: {
        studyDate,
        dailyNewWordLimit: DAILY_NEW_WORD_LIMIT,
        newWordsStudiedToday,
        newWordsRemaining,
      },
    });
  } catch (error) {
    console.error("Failed to build vocabulary study session:", error);
    return res.status(500).json({
      error: "Failed to load vocabulary study session",
    });
  }
});

app.post("/api/reviews", async (req, res) => {
  const { vocabularyId, rating } = req.body;

  if (
    !Number.isInteger(vocabularyId) ||
    vocabularyId <= 0 ||
    typeof rating !== "string" ||
    !Object.hasOwn(ratingMap, rating)
  ) {
    return res.status(400).json({
      error: "Invalid vocabularyId or rating",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    // Serialize first-time ratings so concurrent sessions cannot exceed the limit.
    await client.query("SELECT pg_advisory_xact_lock($1)", [20351010]);

    const existing = await client.query(
      `SELECT fsrs_card
       FROM reviews
       WHERE vocabularyId = $1
       FOR UPDATE`,
      [vocabularyId],
    );

    if (existing.rows.length === 0) {
      const studiedToday = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM reviews
         WHERE first_studied_date = CURRENT_DATE`,
      );

      if (studiedToday.rows[0].count >= DAILY_NEW_WORD_LIMIT) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Daily new-word limit reached",
          dailyNewWordLimit: DAILY_NEW_WORD_LIMIT,
        });
      }
    }

    const now = new Date();

    const card: Card =
      existing.rows.length > 0 && existing.rows[0].fsrs_card
        ? restoreCard(existing.rows[0].fsrs_card)
        : createEmptyCard(now);

    const result = scheduler.next(card, now, ratingMap[rating as ReviewRating]);

    const nextCard = result.card;

    const saved = await client.query(
      `INSERT INTO reviews
         (vocabularyId, fsrs_card, nextReviewDate, first_studied_date)
       VALUES ($1, $2, $3, CURRENT_DATE)
       ON CONFLICT (vocabularyId)
       DO UPDATE SET
         fsrs_card = EXCLUDED.fsrs_card,
         nextReviewDate = EXCLUDED.nextReviewDate
       RETURNING *`,
      [
        vocabularyId,
        JSON.stringify(nextCard),
        nextCard.due.toISOString().slice(0, 10),
      ],
    );

    const dailyProgress = await client.query(
      `SELECT CURRENT_DATE AS "studyDate",
              $1::int AS "dailyNewWordLimit",
              COUNT(*) FILTER (WHERE first_studied_date = CURRENT_DATE)::int
                AS "newWordsStudiedToday"
       FROM reviews`,
      [DAILY_NEW_WORD_LIMIT],
    );
    const progress = dailyProgress.rows[0];
    await client.query("COMMIT");

    return res.json({
      review: saved.rows[0],
      card: nextCard,
      log: result.log,
      dailyProgress: {
        ...progress,
        newWordsRemaining: Math.max(
          0,
          DAILY_NEW_WORD_LIMIT - progress.newWordsStudiedToday,
        ),
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Review scheduling failed:", error);

    return res.status(500).json({
      error: "Failed to schedule review",
    });
  } finally {
    client.release();
  }
});

app.get("/api/reviews", async (req, res) => {
  const result = await pool.query("SELECT * FROM reviews");
  res.json(result.rows);
});

app.get("/api/reviews/due", async (req, res) => {
  try {
    const level = req.query.level ?? "N5";

    if (typeof level !== "string" || !["N5", "N4", "N3"].includes(level)) {
      return res.status(400).json({
        error: "Invalid level. Use N5, N4, or N3.",
      });
    }

    const result = await pool.query(
      `SELECT vocabulary.*, reviews.fsrs_card,
              reviews.nextReviewDate
       FROM vocabulary
       JOIN reviews
         ON vocabulary.id = reviews.vocabularyId
       WHERE vocabulary.level = $1
         AND reviews.fsrs_card IS NOT NULL
         AND (reviews.fsrs_card->>'due')::timestamptz <= NOW()
       ORDER BY reviews.nextReviewDate ASC`,
      [level],
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch due reviews:", error);
    return res.status(500).json({
      error: "Failed to fetch due reviews",
    });
  }
});

app.get("/api/grammar", async (req, res) => {
  try {
    const level = req.query.level ?? "N5";

    if (typeof level !== "string" || !["N5", "N4", "N3"].includes(level)) {
      return res.status(400).json({
        error: "Invalid level. Use N5, N4, or N3.",
      });
    }

    const result = await pool.query(
      `SELECT
        g.id,
        g.title,
        g.explanation,
        g.example,
        g.meaning,
        g.level,
        COALESCE(p.status, 'Not started') AS status
       FROM grammar g
       LEFT JOIN grammar_progress p
         ON g.id = p.grammar_id
       WHERE g.level = $1
       ORDER BY g.id`,
      [level],
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch grammar:", error);
    return res.status(500).json({
      error: "Failed to fetch grammar",
    });
  }
});

const grammarStatuses = ["Not started", "In progress", "Learned"] as const;

app.post("/api/grammar/:id/status", async (req, res) => {
  const grammarId = Number(req.params.id);
  const { status } = req.body as { status?: unknown };

  if (
    !Number.isInteger(grammarId) ||
    grammarId <= 0 ||
    typeof status !== "string" ||
    !grammarStatuses.includes(status as (typeof grammarStatuses)[number])
  ) {
    return res.status(400).json({ error: "Invalid grammar id or status" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO grammar_progress (grammar_id, status)
       SELECT id, $2
       FROM grammar
       WHERE id = $1
       ON CONFLICT (grammar_id)
       DO UPDATE SET status = EXCLUDED.status
       RETURNING grammar_id AS id, status`,
      [grammarId, status],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Grammar point not found" });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to update grammar progress:", error);
    return res.status(500).json({ error: "Failed to update grammar progress" });
  }
});

app.patch("/api/grammar/:id/progress", async (req, res) => {
  const grammarId = Number(req.params.id);
  const { status } = req.body;

  const validStatuses = ["Not started", "Learning", "Learned"];

  if (
    !Number.isInteger(grammarId) ||
    grammarId <= 0 ||
    !validStatuses.includes(status)
  ) {
    return res.status(400).json({ error: "Invalid grammar ID or status" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO grammar_progress (grammar_id, status)
       SELECT id, $2
       FROM grammar
       WHERE id = $1
       ON CONFLICT (grammar_id)
       DO UPDATE SET status = EXCLUDED.status
       RETURNING grammar_id, status`,
      [grammarId, status],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Grammar point not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to update grammar progress:", error);
    res.status(500).json({ error: "Failed to update progress" });
  }
});

app.get("/api/kanji", async (req, res) => {
  try {
    const level = req.query.level ?? "N5";

    if (typeof level !== "string" || !["N5", "N4", "N3"].includes(level)) {
      return res.status(400).json({
        error: "Invalid level. Use N5, N4, or N3.",
      });
    }

    const result = await pool.query(
      `SELECT
        k.id,
        k.character,
        k.meaning,
        k.onyomi,
        k.kunyomi,
        k.example,
        k.example_meaning,
        k.level,
        COALESCE(p.status, 'Not started') AS status
       FROM kanji k
       LEFT JOIN kanji_progress p
         ON k.id = p.kanji_id
       WHERE k.level = $1
       ORDER BY k.id`,
      [level],
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch kanji:", error);
    return res.status(500).json({
      error: "Failed to fetch kanji",
    });
  }
});

function shuffle<T>(array: T[]): T[] {
  return array
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}

function createVocabularyQuestion(
  word: {
    id: number;
    word: string;
    meaning: string;
  },
  allWords: {
    id: number;
    word: string;
    meaning: string;
  }[],
) {
  const distractors = shuffle(allWords.filter((item) => item.id !== word.id))
    .slice(0, 3)
    .map((item) => item.meaning);

  const options = shuffle([word.meaning, ...distractors]);

  return {
    id: `vocabulary-${word.id}`,
    category: "vocabulary",
    question: `What does 「${word.word}」 mean?`,
    options,
    correctAnswer: word.meaning,
  };
}

function createKanjiQuestion(
  kanji: {
    id: number;
    character: string;
    meaning: string;
  },
  allKanji: {
    id: number;
    character: string;
    meaning: string;
  }[],
) {
  const distractors = shuffle(allKanji.filter((item) => item.id !== kanji.id))
    .slice(0, 3)
    .map((item) => item.meaning);

  const options = shuffle([kanji.meaning, ...distractors]);

  return {
    id: `kanji-${kanji.id}`,
    category: "kanji",
    question: `What does 「${kanji.character}」 mean?`,
    options,
    correctAnswer: kanji.meaning,
  };
}

function createGrammarQuestion(
  grammar: {
    id: number;
    title: string;
    meaning: string;
  },
  allGrammar: {
    id: number;
    title: string;
    meaning: string;
  }[],
) {
  const distractors = shuffle(
    allGrammar.filter((item) => item.id !== grammar.id),
  )
    .slice(0, 3)
    .map((item) => item.meaning);

  const options = shuffle([grammar.meaning, ...distractors]);

  return {
    id: `grammar-${grammar.id}`,
    category: "grammar",
    question: `What does 「${grammar.title}」 mean?`,
    options,
    correctAnswer: grammar.meaning,
  };
}

app.get("/api/assessment", async (_req, res) => {
  try {
    const [vocabularyResult, kanjiResult, grammarResult] = await Promise.all([
      pool.query(`
        SELECT id, word, reading, meaning
        FROM vocabulary
        WHERE level = 'N5'
        ORDER BY RANDOM()
        LIMIT 10
      `),

      pool.query(`
        SELECT id, character, meaning, onyomi, kunyomi
        FROM kanji
        WHERE level = 'N5'
        ORDER BY RANDOM()
        LIMIT 5
      `),

      pool.query(`
        SELECT id, title, explanation, example, meaning
        FROM grammar
        WHERE level = 'N5'
        ORDER BY RANDOM()
        LIMIT 5
      `),
    ]);

    const vocabularyQuestions = vocabularyResult.rows.map((word) =>
      createVocabularyQuestion(word, vocabularyResult.rows),
    );

    const kanjiQuestions = kanjiResult.rows.map((kanji) =>
      createKanjiQuestion(kanji, kanjiResult.rows),
    );

    const grammarQuestions = grammarResult.rows.map((grammar) =>
      createGrammarQuestion(grammar, grammarResult.rows),
    );

    return res.json({
      questions: shuffle([
        ...vocabularyQuestions,
        ...kanjiQuestions,
        ...grammarQuestions,
      ]),
    });
  } catch (error) {
    console.error("Failed to create assessment:", error);
    return res.status(500).json({
      error: "Failed to create assessment",
    });
  }
});

app.patch("/api/kanji/:id/progress", async (req, res) => {
  const kanjiId = Number(req.params.id);
  const { status } = req.body;

  const validStatuses = ["Not started", "Learning", "Learned"];

  if (
    !Number.isInteger(kanjiId) ||
    kanjiId <= 0 ||
    !validStatuses.includes(status)
  ) {
    return res.status(400).json({ error: "Invalid kanji ID or status" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO kanji_progress (kanji_id, status)
       SELECT id, $2
       FROM kanji
       WHERE id = $1
       ON CONFLICT (kanji_id)
       DO UPDATE SET status = EXCLUDED.status
       RETURNING kanji_id, status`,
      [kanjiId, status],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Kanji not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to update kanji progress:", error);
    res.status(500).json({ error: "Failed to update kanji progress" });
  }
});

app.post("/api/roadmap", async (req, res) => {
  try {
    const { level, studyTime, targetDate, assessmentResult } = req.body;

    if (!["N5", "N4", "N3"].includes(level)) {
      return res.status(400).json({ error: "Invalid JLPT level" });
    }

    if (!studyTime || studyTime <= 0) {
      return res.status(400).json({ error: "Invalid study time" });
    }

    if (!targetDate) {
      return res.status(400).json({ error: "Target date is required" });
    }

    const today = new Date();
    const target = new Date(`${targetDate}T00:00:00`);

    const millisecondsPerDay = 1000 * 60 * 60 * 24;
    const daysAvailable = Math.ceil(
      (target.getTime() - today.getTime()) / millisecondsPerDay,
    );

    if (daysAvailable <= 0) {
      return res.status(400).json({
        error: "Target date must be in the future",
      });
    }

    const weeksAvailable = Math.ceil(daysAvailable / 7);
    const [vocabularyResult, kanjiResult, grammarResult] = await Promise.all([
      pool.query(
        `
      SELECT id, word, reading, meaning
      FROM vocabulary
      WHERE level = $1
      ORDER BY id
    `,
        [level],
      ),

      pool.query(
        `
      SELECT id, character, meaning, onyomi, kunyomi
      FROM kanji
      WHERE level = $1
      ORDER BY id
    `,
        [level],
      ),

      pool.query(
        `
      SELECT id, title, explanation, example, meaning
      FROM grammar
      WHERE level = $1
      ORDER BY id
    `,
        [level],
      ),
    ]);

    const incorrectIds = new Set<string>(
      assessmentResult &&
        typeof assessmentResult === "object" &&
        Array.isArray(assessmentResult.incorrectQuestionIds)
        ? assessmentResult.incorrectQuestionIds.filter(
            (id: unknown): id is string => typeof id === "string",
          )
        : [],
    );

    function prioritizeIncorrect<T extends { id: number }>(
      items: T[],
      category: "vocabulary" | "kanji" | "grammar",
    ) {
      return [...items].sort((a, b) => {
        const aIncorrect = incorrectIds.has(`${category}-${a.id}`);
        const bIncorrect = incorrectIds.has(`${category}-${b.id}`);
        return Number(bIncorrect) - Number(aIncorrect);
      });
    }

    function distributeItems<T>(items: T[], weeks: number) {
      return Array.from({ length: weeks }, (_, index) => {
        const start = Math.floor((index * items.length) / weeks);
        const end = Math.floor(((index + 1) * items.length) / weeks);

        return items.slice(start, end);
      });
    }

    const vocabularyByWeek = distributeItems(
      prioritizeIncorrect(vocabularyResult.rows, "vocabulary"),
      weeksAvailable,
    );

    const kanjiByWeek = distributeItems(
      prioritizeIncorrect(kanjiResult.rows, "kanji"),
      weeksAvailable,
    );

    const grammarByWeek = distributeItems(
      prioritizeIncorrect(grammarResult.rows, "grammar"),
      weeksAvailable,
    );
    const vocabularyPerWeek = Math.ceil(vocabularyResult.rows.length / weeksAvailable);
    const kanjiPerWeek = Math.ceil(kanjiResult.rows.length / weeksAvailable);
    const grammarPerWeek = Math.ceil(grammarResult.rows.length / weeksAvailable);
    const weeks = Array.from({ length: weeksAvailable }, (_, index) => ({
      week: index + 1,
      vocabulary: vocabularyByWeek[index],
      kanji: kanjiByWeek[index],
      grammar: grammarByWeek[index],
    }));

    return res.json({
      level,
      studyTime,
      targetDate,
      daysAvailable,
      weeksAvailable,
      vocabularyPerWeek,
      kanjiPerWeek,
      grammarPerWeek,
      weeks,
    });
  } catch (error) {
    console.error("Failed to generate roadmap:", error);
    return res.status(500).json({ error: "Failed to generate roadmap" });
  }
});
