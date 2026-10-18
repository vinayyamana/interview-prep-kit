"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import PracticeMode from "../../components/PracticeMode";
const STEP_LABELS: Record<string, string> = {
  queued: "Queued",
  researching: "Researching the company",
  extracting: "Extracting requirements",
  generating: "Generating questions",
  coverage: "Checking coverage",
  scheduling: "Building your schedule",
};
const stepLabel = (s: string) =>
  STEP_LABELS[s] || s.replace(/[_-]/g, " ");

// Ratings come from the saved kit; localStorage is only a fallback cache
function mergeRatings(kitId: string, saved: Record<string, 1 | 2 | 3> | undefined) {
  let local: Record<string, 1 | 2 | 3> = {};
  try {
    local = JSON.parse(localStorage.getItem("ratings-" + kitId) || "{}");
  } catch {
    /* ignore */
  }
  return { ...local, ...(saved || {}) };
}

type Question = {
  id: string;
  category: string;
  requirement_ids: string[];
  prompt: string;
  answer_outline: string;
  difficulty: number;
  edited: boolean;
};

type Flashcard = {
  id: string;
  front: string;
  back: string;
  requirement_ids: string[];
  edited: boolean;
};

type Kit = {
  _id: string;
  status: string;
  error?: { message: string } | null;
  data?: any;
};

type MockResult = {
  score: number;
  strengths: string[];
  gaps: string[];
  feedback: string;
  answer: string;
  attempts: number;
  scoredAt: string;
};

type WeakItem = {
  requirement_id: string;
  text: string;
  kind: string;
  priority: "must" | "nice";
  mastery: number | null;
  status: "weak" | "not_practised" | "strong";
  signals: number;
};

type WeakSpots = {
  summary: {
    requirements: number;
    weak: number;
    not_practised: number;
    strong: number;
    mock_answers: number;
  };
  items: WeakItem[];
  revision: { question_ids: string[]; flashcard_ids: string[] };
};

type RegenSection = "questions" | "flashcards" | "company_brief" | "schedule";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/kits`;

const CATEGORIES = ["technical", "behavioural", "system-design", "company-fit"];
const MAX_ANSWER_CHARS = 4000;

const STATUS_LABEL: Record<WeakItem["status"], string> = {
  weak: "Weak",
  not_practised: "Not practised",
  strong: "Strong",
};
const STATUS_STYLE: Record<WeakItem["status"], string> = {
  weak: "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950 dark:border-red-800",
  not_practised:
    "text-amber-800 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950 dark:border-amber-800",
  strong:
    "text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-950 dark:border-green-800",
};
const BAR_STYLE: Record<WeakItem["status"], string> = {
  weak: "bg-red-500",
  not_practised: "bg-gray-400",
  strong: "bg-green-500",
};

const btnOutline =
  "text-xs text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-500 rounded px-2 py-1 disabled:opacity-50";
const btnPrimary = "text-xs bg-blue-600 text-white rounded px-2 py-1 disabled:opacity-50";
const btnGhost = "text-xs border rounded px-2 py-1";
const bodyText = "text-gray-700 dark:text-gray-300";
const mutedText = "text-gray-600 dark:text-gray-300";

export default function KitPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [kit, setKit] = useState<Kit | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // inline edit state
  const [editingQId, setEditingQId] = useState<string | null>(null);
  const [editQPrompt, setEditQPrompt] = useState("");
  const [editQAnswer, setEditQAnswer] = useState("");

  const [editingFId, setEditingFId] = useState<string | null>(null);
  const [editFFront, setEditFFront] = useState("");
  const [editFBack, setEditFBack] = useState("");

  // add-question / add-flashcard form state
  const [newQPrompt, setNewQPrompt] = useState("");
  const [newQAnswer, setNewQAnswer] = useState("");
  const [newQCategory, setNewQCategory] = useState("technical");
  const [showAddQ, setShowAddQ] = useState(false);

  const [newFFront, setNewFFront] = useState("");
  const [newFBack, setNewFBack] = useState("");
  const [showAddF, setShowAddF] = useState(false);

  // regenerate loading state, per section (questions:<category> for a single category)
  const [regenLoading, setRegenLoading] = useState<Record<string, boolean>>({});

  // mock interview state
  const [mockQId, setMockQId] = useState("");
  const [mockAnswer, setMockAnswer] = useState("");
  const [mockLoading, setMockLoading] = useState(false);
  const [mockError, setMockError] = useState("");

  // weak spots state (weakTick is bumped to force a refetch)
  const [weak, setWeak] = useState<WeakSpots | null>(null);
  const [weakLoading, setWeakLoading] = useState(false);
  const [weakError, setWeakError] = useState("");
  const [weakTick, setWeakTick] = useState(0);

  async function refreshKit() {
    try {
      const res = await fetch(`${API_BASE}/${id}`, { credentials: "include" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error(`Request failed with ${res.status}`);
      const data: Kit = await res.json();
      setKit(data);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load kit");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line prefer-const
    let interval: ReturnType<typeof setInterval>;

    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/${id}`, {
          credentials: "include",
        });
        if (res.status === 401) {
          clearInterval(interval);
          router.push("/login");
          return;
        }
        if (!res.ok) {
          throw new Error(`Request failed with ${res.status}`);
        }
        const data: Kit = await res.json();
        setKit(data);

        if (data.status === "done" || data.status === "failed") {
          clearInterval(interval);
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to load kit");
        clearInterval(interval);
      }
    }

    poll();
    interval = setInterval(poll, 2000);

    return () => clearInterval(interval);
  }, [id, router]);

  // ---------- weak spots ----------
  async function loadWeakSpots() {
    setWeakLoading(true);
    try {
      const res = await fetch(`${API_BASE}/${id}/weak-spots`, { credentials: "include" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error(`Request failed with ${res.status}`);
      setWeak(await res.json());
      setWeakError("");
    } catch (err: any) {
      setWeakError(err.message || "Failed to load weak spots");
    } finally {
      setWeakLoading(false);
    }
  }

  useEffect(() => {
    if (kit?.status === "done") loadWeakSpots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, kit?.status, weakTick]);

  // ---------- mock interview ----------
  function pickQuestionForMe(questions: Question[], mock: Record<string, MockResult>) {
    if (questions.length === 0) return;
    const unanswered = questions.filter((q) => !mock[q.id]);
    const pool = unanswered.length > 0 ? unanswered : questions;
    const next =
      unanswered.length > 0
        ? pool[0]
        : [...pool].sort((a, b) => (mock[a.id]?.score ?? 0) - (mock[b.id]?.score ?? 0))[0];
    setMockQId(next.id);
    setMockAnswer("");
    setMockError("");
  }

  async function submitMockAnswer() {
    if (!mockQId || !mockAnswer.trim() || mockLoading) return;
    setMockLoading(true);
    setMockError("");
    try {
      const res = await fetch(`${API_BASE}/${id}/mock/score`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: mockQId, answer: mockAnswer }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Scoring failed with ${res.status}`);
      }
      setMockAnswer("");
      await refreshKit();
      setWeakTick((t) => t + 1);
    } catch (err: any) {
      setMockError(err.message || "Scoring failed, please try again");
    } finally {
      setMockLoading(false);
    }
  }

  // ---------- edit / delete question ----------
  function startEditQuestion(q: Question) {
    setEditingQId(q.id);
    setEditQPrompt(q.prompt);
    setEditQAnswer(q.answer_outline);
  }

  function cancelEditQuestion() {
    setEditingQId(null);
  }

  async function saveEditQuestion(qid: string) {
    try {
      const res = await fetch(`${API_BASE}/${id}/question/${qid}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: editQPrompt, answer_outline: editQAnswer }),
      });
      if (!res.ok) throw new Error(`Save failed with ${res.status}`);
      setEditingQId(null);
      await refreshKit();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save question");
    }
  }

  async function deleteQuestion(qid: string) {
    try {
      const res = await fetch(`${API_BASE}/${id}/question/${qid}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) throw new Error(`Delete failed with ${res.status}`);
      await refreshKit();
      setWeakTick((t) => t + 1);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to delete question");
    }
  }

  async function changeCategory(qid: string, category: string) {
    try {
      const res = await fetch(`${API_BASE}/${id}/question/${qid}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      if (!res.ok) throw new Error(`Move failed with ${res.status}`);
      await refreshKit();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to move question");
    }
  }

  // ---------- edit / delete flashcard ----------
  function startEditFlashcard(f: Flashcard) {
    setEditingFId(f.id);
    setEditFFront(f.front);
    setEditFBack(f.back);
  }

  function cancelEditFlashcard() {
    setEditingFId(null);
  }

  async function saveEditFlashcard(fid: string) {
    try {
      const res = await fetch(`${API_BASE}/${id}/flashcard/${fid}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front: editFFront, back: editFBack }),
      });
      if (!res.ok) throw new Error(`Save failed with ${res.status}`);
      setEditingFId(null);
      await refreshKit();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save flashcard");
    }
  }

  async function deleteFlashcard(fid: string) {
    try {
      const res = await fetch(`${API_BASE}/${id}/flashcard/${fid}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) throw new Error(`Delete failed with ${res.status}`);
      await refreshKit();
      setWeakTick((t) => t + 1);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to delete flashcard");
    }
  }

  // ---------- add question / flashcard ----------
  async function addQuestion() {
    if (!newQPrompt || !newQAnswer) return;
    try {
      const res = await fetch(`${API_BASE}/${id}/question`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: newQPrompt, answer_outline: newQAnswer, category: newQCategory }),
      });
      if (!res.ok) throw new Error(`Add failed with ${res.status}`);
      setNewQPrompt("");
      setNewQAnswer("");
      setShowAddQ(false);
      await refreshKit();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to add question");
    }
  }

  async function addFlashcard() {
    if (!newFFront || !newFBack) return;
    try {
      const res = await fetch(`${API_BASE}/${id}/flashcard`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front: newFFront, back: newFBack }),
      });
      if (!res.ok) throw new Error(`Add failed with ${res.status}`);
      setNewFFront("");
      setNewFBack("");
      setShowAddF(false);
      await refreshKit();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to add flashcard");
    }
  }

  // ---------- reorder (up/down arrows) ----------
  // Questions move within their own category; flashcards move within the whole list.
  async function moveItem(section: "questions" | "flashcards", itemId: string, direction: "up" | "down") {
    if (!kit?.data?.[section]) return;
    const items = [...kit.data[section]];
    const idx = items.findIndex((it: any) => it.id === itemId);
    if (idx === -1) return;

    const step = direction === "up" ? -1 : 1;
    let swapWith = idx + step;

    if (section === "questions") {
      const cat = items[idx].category;
      while (swapWith >= 0 && swapWith < items.length && items[swapWith].category !== cat) {
        swapWith += step;
      }
    }

    if (swapWith < 0 || swapWith >= items.length) return;

    [items[idx], items[swapWith]] = [items[swapWith], items[idx]];

    // optimistic UI update
    setKit((prev) => (prev ? { ...prev, data: { ...prev.data, [section]: items } } : prev));

    try {
      const res = await fetch(`${API_BASE}/${id}/reorder`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, orderedIds: items.map((it: any) => it.id) }),
      });
      if (!res.ok) throw new Error(`Reorder failed with ${res.status}`);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to reorder");
      await refreshKit(); // roll back to server truth
    }
  }

  // ---------- regenerate a section (or one question category) ----------
  async function regenerateSection(section: RegenSection, category?: string) {
    const key = category ? `${section}:${category}` : section;
    setRegenLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`${API_BASE}/${id}/regenerate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(category ? { section, category } : { section }),
      });
      if (!res.ok) throw new Error(`Regenerate failed with ${res.status}`);
      await refreshKit();
      setWeakTick((t) => t + 1);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to regenerate");
    } finally {
      setRegenLoading((prev) => ({ ...prev, [key]: false }));
    }
  }

  // Full-page error only when there is no kit to show yet
  if (errorMsg && !kit) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="text-red-600 bg-red-50 border border-red-200 rounded-md p-3">{errorMsg}</p>
      </div>
    );
  }

  if (!kit) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p>Loading...</p>
      </div>
    );
  }

  // Still generating
  if (kit.status !== "done" && kit.status !== "failed") {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Generating your kit...</h1>
        <p className={mutedText} aria-live="polite">Current step: {stepLabel(kit.status)}...</p>
        <div className="mt-4 h-2 w-full bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600 animate-pulse w-2/3" />
        </div>
      </div>
    );
  }

  // Failed
  if (kit.status === "failed") {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4 text-red-600">Generation failed</h1>
        <p className={bodyText}>{kit.error?.message || "Unknown error"}</p>
        <Link href="/kits/new" className="inline-block mt-4 rounded-md border px-4 py-2 font-medium">Try again with a new kit</Link>
      </div>
    );
  }

  // Done - show the kit
  const data = kit.data;
  const questions: Question[] = data.questions || [];
  const flashcards: Flashcard[] = data.flashcards || [];
  const questionCategories: string[] = Array.from(
    new Set([...CATEGORIES, ...questions.map((q) => q.category)])
  );
  const uncovered: string[] = data.coverage?.uncovered_requirement_ids || [];

  const mock: Record<string, MockResult> = data.mock || {};
  const selectedQuestion = questions.find((q) => q.id === mockQId);
  const selectedResult = selectedQuestion ? mock[selectedQuestion.id] : undefined;
  const answerTooLong = mockAnswer.length > MAX_ANSWER_CHARS;

  const revisionQuestions = (weak?.revision.question_ids || [])
    .map((qid) => questions.find((q) => q.id === qid))
    .filter(Boolean) as Question[];
  const revisionFlashcards = (weak?.revision.flashcard_ids || [])
    .map((fid) => flashcards.find((f) => f.id === fid))
    .filter(Boolean) as Flashcard[];

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">{data.role?.title || "Untitled role"}</h1>

      {errorMsg && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 text-red-700 bg-red-50 border border-red-200 rounded-md p-3 text-sm"
        >
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg("")} className="font-medium underline" aria-label="Dismiss error">
            Dismiss
          </button>
        </div>
      )}

      {data.meta?.thin_description && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
          The job description had very little detail, so this kit is intentionally thin.
        </p>
      )}

      {data.meta?.crawl_error && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
          The company site could not be fully retrieved: {data.meta.crawl_error}
        </p>
      )}

      {/* ---------- Company brief ---------- */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Company brief</h2>
          <button
            onClick={() => regenerateSection("company_brief")}
            disabled={regenLoading.company_brief}
            className={btnOutline}
          >
            {regenLoading.company_brief ? "Regenerating..." : "Regenerate"}
          </button>
        </div>
        <p className={bodyText}>{data.company_brief?.summary}</p>
        {data.company_brief?.what_they_do && (
          <p className={`${mutedText} mt-2`}>{data.company_brief.what_they_do}</p>
        )}
      </section>

      {/* ---------- Requirements ---------- */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Requirements</h2>
        <ul className="list-disc pl-5 space-y-1">
          {data.role?.requirements?.map((r: any) => (
            <li key={r.id}>
              {r.text} <span className="text-xs text-gray-500 dark:text-gray-400">({r.priority})</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Questions (grouped by category) ---------- */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Questions</h2>
          <button
            onClick={() => regenerateSection("questions")}
            disabled={regenLoading.questions}
            className={btnOutline}
          >
            {regenLoading.questions ? "Regenerating..." : "Regenerate all"}
          </button>
        </div>

        {questions.length === 0 && (
          <p className={`${mutedText} text-sm`}>No questions yet. Add one below or regenerate.</p>
        )}

        <div className="space-y-6">
          {questionCategories.map((cat) => {
            const inCat = questions.filter((q) => q.category === cat);
            if (inCat.length === 0) return null;
            const catKey = `questions:${cat}`;

            return (
              <div key={cat}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    {cat} <span className="font-normal">({inCat.length})</span>
                  </h3>
                  <button
                    onClick={() => regenerateSection("questions", cat)}
                    disabled={regenLoading[catKey]}
                    className={btnOutline}
                  >
                    {regenLoading[catKey] ? "Regenerating..." : `Regenerate ${cat}`}
                  </button>
                </div>

                <ul className="space-y-3">
                  {inCat.map((q, ci) => (
                    <li key={q.id} className="border rounded-md p-3">
                      {editingQId === q.id ? (
                        <div className="space-y-2">
                          <textarea
                            aria-label="Question prompt"
                            className="w-full border rounded p-2 text-sm"
                            value={editQPrompt}
                            onChange={(e) => setEditQPrompt(e.target.value)}
                          />
                          <textarea
                            aria-label="Answer outline"
                            className={`w-full border rounded p-2 text-sm ${mutedText}`}
                            value={editQAnswer}
                            onChange={(e) => setEditQAnswer(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <button onClick={() => saveEditQuestion(q.id)} className={btnPrimary}>
                              Save
                            </button>
                            <button onClick={cancelEditQuestion} className={btnGhost}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex justify-between items-start gap-2">
                            <div
                              role="button"
                              tabIndex={0}
                              aria-label="Edit question"
                              onClick={() => startEditQuestion(q)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") startEditQuestion(q);
                              }}
                              className="cursor-text flex-1"
                            >
                              <p className="font-medium">{q.prompt}</p>
                              <p className={`text-sm ${mutedText} mt-1`}>{q.answer_outline}</p>
                              {q.edited && <span className="text-xs text-green-600 dark:text-green-400">edited</span>}
                            </div>
                            <div className="flex flex-col items-center gap-1 shrink-0">
                              <button
                                onClick={() => moveItem("questions", q.id, "up")}
                                disabled={ci === 0}
                                aria-label="Move question up"
                                className="text-xs disabled:opacity-30"
                              >
                                ▲
                              </button>
                              <button
                                onClick={() => moveItem("questions", q.id, "down")}
                                disabled={ci === inCat.length - 1}
                                aria-label="Move question down"
                                className="text-xs disabled:opacity-30"
                              >
                                ▼
                              </button>
                              <button
                                onClick={() => deleteQuestion(q.id)}
                                aria-label="Delete question"
                                className="text-xs text-red-600"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                          <label className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            Category
                            <select
                              value={q.category}
                              onChange={(e) => changeCategory(q.id, e.target.value)}
                              className="border rounded px-1 py-0.5 text-xs bg-transparent"
                            >
                              {CATEGORIES.map((c) => (
                                <option key={c} value={c} className="text-black">
                                  {c}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {showAddQ ? (
          <div className="mt-3 border rounded-md p-3 space-y-2">
            <input
              className="w-full border rounded p-2 text-sm"
              placeholder="Prompt"
              value={newQPrompt}
              onChange={(e) => setNewQPrompt(e.target.value)}
            />
            <textarea
              className="w-full border rounded p-2 text-sm"
              placeholder="Answer outline"
              value={newQAnswer}
              onChange={(e) => setNewQAnswer(e.target.value)}
            />
            <select
              className="border rounded p-2 text-sm bg-transparent"
              value={newQCategory}
              onChange={(e) => setNewQCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="text-black">
                  {c}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={addQuestion} className={btnPrimary}>
                Add
              </button>
              <button onClick={() => setShowAddQ(false)} className={btnGhost}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddQ(true)} className="mt-3 text-sm text-blue-600 dark:text-blue-400">
            + Add question
          </button>
        )}
      </section>

      {/* ---------- Flashcards ---------- */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Flashcards</h2>
          <button
            onClick={() => regenerateSection("flashcards")}
            disabled={regenLoading.flashcards}
            className={btnOutline}
          >
            {regenLoading.flashcards ? "Regenerating..." : "Regenerate"}
          </button>
        </div>
        <ul className="space-y-3">
          {data.flashcards?.map((f: Flashcard, idx: number) => (
            <li key={f.id} className="border rounded-md p-3">
              {editingFId === f.id ? (
                <div className="space-y-2">
                  <textarea
                    aria-label="Flashcard front"
                    className="w-full border rounded p-2 text-sm"
                    value={editFFront}
                    onChange={(e) => setEditFFront(e.target.value)}
                  />
                  <textarea
                    aria-label="Flashcard back"
                    className={`w-full border rounded p-2 text-sm ${mutedText}`}
                    value={editFBack}
                    onChange={(e) => setEditFBack(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => saveEditFlashcard(f.id)} className={btnPrimary}>
                      Save
                    </button>
                    <button onClick={cancelEditFlashcard} className={btnGhost}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-start gap-2">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Edit flashcard"
                    onClick={() => startEditFlashcard(f)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") startEditFlashcard(f);
                    }}
                    className="cursor-text flex-1"
                  >
                    <p className="font-medium">{f.front}</p>
                    <p className={`text-sm ${mutedText} mt-1`}>{f.back}</p>
                    {f.edited && <span className="text-xs text-green-600 dark:text-green-400">edited</span>}
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <button
                      onClick={() => moveItem("flashcards", f.id, "up")}
                      disabled={idx === 0}
                      aria-label="Move flashcard up"
                      className="text-xs disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveItem("flashcards", f.id, "down")}
                      disabled={idx === data.flashcards.length - 1}
                      aria-label="Move flashcard down"
                      className="text-xs disabled:opacity-30"
                    >
                      ▼
                    </button>
                    <button
                      onClick={() => deleteFlashcard(f.id)}
                      aria-label="Delete flashcard"
                      className="text-xs text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        {showAddF ? (
          <div className="mt-3 border rounded-md p-3 space-y-2">
            <input
              className="w-full border rounded p-2 text-sm"
              placeholder="Front"
              value={newFFront}
              onChange={(e) => setNewFFront(e.target.value)}
            />
            <textarea
              className="w-full border rounded p-2 text-sm"
              placeholder="Back"
              value={newFBack}
              onChange={(e) => setNewFBack(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={addFlashcard} className={btnPrimary}>
                Add
              </button>
              <button onClick={() => setShowAddF(false)} className={btnGhost}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddF(true)} className="mt-3 text-sm text-blue-600 dark:text-blue-400">
            + Add flashcard
          </button>
        )}
      </section>

      {/* ---------- Practice mode ---------- */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Practice Mode</h2>
        <PracticeMode
          key={id}
          flashcards={data.flashcards || []}
          initialRatings={mergeRatings(id, data.practice)}
          onRate={(cardId, value) => {
            // instant local cache
            const r = mergeRatings(id, data.practice);
            r[cardId] = value;
            try {
              localStorage.setItem("ratings-" + id, JSON.stringify(r));
            } catch {
              /* ignore */
            }
            // durable save on the server, then refresh weak spots
            fetch(`${API_BASE}/${id}/practice`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cardId, confidence: value }),
            })
              .then(() => setWeakTick((t) => t + 1))
              .catch(() => setErrorMsg("Could not save your rating to the server"));
          }}
        />
      </section>

      {/* ---------- Mock interview ---------- */}
      <section aria-labelledby="mock-heading">
        <h2 id="mock-heading" className="text-lg font-semibold mb-1">
          Mock Interview
        </h2>
        <p className={`text-sm ${mutedText} mb-3`}>
          Flashcards test recall. This tests whether you can actually explain an answer. Type your answer and
          get scored against the reference outline.
        </p>

        {questions.length === 0 ? (
          <p className={`text-sm ${mutedText}`}>Add or generate some questions first.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                aria-label="Choose a question"
                value={mockQId}
                onChange={(e) => {
                  setMockQId(e.target.value);
                  setMockAnswer("");
                  setMockError("");
                }}
                className="flex-1 border rounded p-2 text-sm bg-transparent min-w-0"
              >
                <option value="" className="text-black">
                  Choose a question...
                </option>
                {questions.map((q) => (
                  <option key={q.id} value={q.id} className="text-black">
                    {mock[q.id] ? `[${mock[q.id].score}/5] ` : ""}
                    {q.prompt.length > 70 ? q.prompt.slice(0, 70) + "..." : q.prompt}
                  </option>
                ))}
              </select>
              <button
                onClick={() => pickQuestionForMe(questions, mock)}
                className={btnOutline}
                type="button"
              >
                Pick for me
              </button>
            </div>

            {selectedQuestion && (
              <div className="border rounded-md p-3 space-y-3">
                <div>
                  <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {selectedQuestion.category}
                  </span>
                  <p className="font-medium mt-1">{selectedQuestion.prompt}</p>
                </div>

                <div>
                  <textarea
                    aria-label="Your answer"
                    className="w-full border rounded p-2 text-sm min-h-32"
                    placeholder="Type your answer as you would say it in the interview..."
                    value={mockAnswer}
                    onChange={(e) => setMockAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submitMockAnswer();
                    }}
                    disabled={mockLoading}
                  />
                  <div className="flex items-center justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span className={answerTooLong ? "text-red-600" : ""}>
                      {mockAnswer.length}/{MAX_ANSWER_CHARS}
                    </span>
                    <span>Ctrl+Enter to submit</span>
                  </div>
                </div>

                <button
                  onClick={submitMockAnswer}
                  disabled={mockLoading || !mockAnswer.trim() || answerTooLong}
                  className={btnPrimary}
                >
                  {mockLoading ? "Scoring..." : "Score my answer"}
                </button>

                {mockError && (
                  <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
                    {mockError}
                  </p>
                )}

                {selectedResult && (
                  <div className="border-t pt-3 space-y-2" aria-live="polite">
                    <p className="font-semibold">
                      Score: {selectedResult.score}/5{" "}
                      <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                        (attempt {selectedResult.attempts})
                      </span>
                    </p>
                    {selectedResult.feedback && <p className={`text-sm ${bodyText}`}>{selectedResult.feedback}</p>}
                    {selectedResult.strengths.length > 0 && (
                      <div className="text-sm">
                        <p className="font-medium text-green-700 dark:text-green-400">Strengths</p>
                        <ul className={`list-disc pl-5 ${bodyText}`}>
                          {selectedResult.strengths.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selectedResult.gaps.length > 0 && (
                      <div className="text-sm">
                        <p className="font-medium text-red-700 dark:text-red-400">Gaps</p>
                        <ul className={`list-disc pl-5 ${bodyText}`}>
                          {selectedResult.gaps.map((g, i) => (
                            <li key={i}>{g}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <details className="text-sm">
                      <summary className="cursor-pointer text-blue-600 dark:text-blue-400">
                        Show reference outline
                      </summary>
                      <p className={`mt-1 ${mutedText}`}>{selectedQuestion.answer_outline || "No outline."}</p>
                    </details>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---------- Weak spots ---------- */}
      <section aria-labelledby="weak-heading">
        <div className="flex items-center justify-between mb-2">
          <h2 id="weak-heading" className="text-lg font-semibold">
            Weak Spots
          </h2>
          <button
            onClick={() => setWeakTick((t) => t + 1)}
            disabled={weakLoading}
            className={btnOutline}
          >
            {weakLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {weakError && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-2">
            {weakError}
          </p>
        )}

        {!weak && weakLoading && <p className={`text-sm ${mutedText}`}>Calculating...</p>}

        {weak && weak.items.length === 0 && (
          <p className={`text-sm ${mutedText}`}>No requirements to measure yet.</p>
        )}

        {weak && weak.items.length > 0 && (
          <div className="space-y-4">
            <p className={`text-sm ${bodyText}`}>
              {weak.summary.weak} weak, {weak.summary.not_practised} not practised, {weak.summary.strong} strong
              out of {weak.summary.requirements} requirements. Based on your flashcard ratings and{" "}
              {weak.summary.mock_answers} mock answer(s).
            </p>

            <ul className="space-y-2">
              {weak.items.map((i) => (
                <li key={i.requirement_id} className="border rounded-md p-2">
                  <div className="flex items-start justify-between gap-2 text-sm">
                    <span className={bodyText}>
                      {i.text}{" "}
                      <span className="text-xs text-gray-500 dark:text-gray-400">({i.priority})</span>
                    </span>
                    <span
                      className={`shrink-0 text-xs border rounded px-1.5 py-0.5 ${STATUS_STYLE[i.status]}`}
                    >
                      {STATUS_LABEL[i.status]}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div
                      className="h-2 flex-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
                      role="progressbar"
                      aria-label={`Mastery of ${i.text}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={i.mastery === null ? 0 : Math.round(i.mastery * 100)}
                    >
                      <div
                        className={`h-full ${BAR_STYLE[i.status]}`}
                        style={{ width: `${i.mastery === null ? 0 : Math.round(i.mastery * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">
                      {i.mastery === null ? "n/a" : `${Math.round(i.mastery * 100)}%`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {(revisionQuestions.length > 0 || revisionFlashcards.length > 0) && (
              <div className="border rounded-md p-3 space-y-3">
                <h3 className="font-semibold text-sm">Last-night revision list</h3>
                {revisionQuestions.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                      Questions
                    </p>
                    <ol className={`list-decimal pl-5 space-y-1 text-sm ${bodyText}`}>
                      {revisionQuestions.map((q) => (
                        <li key={q.id}>{q.prompt}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {revisionFlashcards.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                      Flashcards
                    </p>
                    <ol className={`list-decimal pl-5 space-y-1 text-sm ${bodyText}`}>
                      {revisionFlashcards.map((f) => (
                        <li key={f.id}>{f.front}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---------- Coverage ---------- */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Coverage</h2>
        {(() => {
          const history: { pass: number; gaps: string[] }[] = data.coverage?.history || [];
          const reqText = (rid: string) =>
            data.role?.requirements?.find((r: any) => r.id === rid)?.text || rid;

          if (!data.role?.requirements || data.role.requirements.length === 0) {
            return (
              <p className="text-amber-700 dark:text-amber-300">
                No requirements could be extracted, so there is nothing to check.
              </p>
            );
          }

          return (
            <div className="space-y-2">
              {history.length <= 1 && uncovered.length === 0 ? (
                <p className={bodyText}>No gaps found. Every requirement has at least one question.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {history.map((h) => (
                    <li key={h.pass} className={bodyText}>
                      <strong>Pass {h.pass}:</strong>{" "}
                      {h.gaps.length === 0
                        ? "all gaps closed"
                        : `${h.gaps.length} gap(s) found (${h.gaps.map(reqText).join("; ")})`}
                    </li>
                  ))}
                </ul>
              )}
              {uncovered.length > 0 && (
                <p className="text-amber-700 dark:text-amber-300 text-sm">
                  Still not covered: {uncovered.map(reqText).join("; ")}
                </p>
              )}
            </div>
          );
        })()}
      </section>

      {/* ---------- Schedule ---------- */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Schedule</h2>
          <button
            onClick={() => regenerateSection("schedule")}
            disabled={regenLoading.schedule}
            className={btnOutline}
          >
            {regenLoading.schedule ? "Regenerating..." : "Regenerate"}
          </button>
        </div>
        <ul className="space-y-2">
          {data.schedule?.days?.map((d: any) => {
            const dayQuestions = ((d.question_ids || []) as string[])
              .map((qid) => questions.find((q) => q.id === qid))
              .filter(Boolean) as Question[];

            return (
              <li key={d.day} className="border rounded-md">
                <details open={d.day === 1} className="p-3">
                  <summary className="cursor-pointer font-medium">
                    Day {d.day}: {d.focus} ({d.minutes} min)
                  </summary>
                  {dayQuestions.length === 0 ? (
                    <p className={`text-sm ${mutedText} mt-2`}>No questions scheduled for this day.</p>
                  ) : (
                    <ol className="list-decimal pl-5 mt-2 space-y-2 text-sm">
                      {dayQuestions.map((q) => (
                        <li key={q.id} className={bodyText}>
                          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mr-2">
                            {q.category}
                          </span>
                          {q.prompt}
                        </li>
                      ))}
                    </ol>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}