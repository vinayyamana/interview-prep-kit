"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PracticeMode from "../../components/PracticeMode";

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

const API_BASE = "http://localhost:5000/api/kits";

export default function KitPage() {
  const params = useParams();
  const id = params.id as string;

  const [kit, setKit] = useState<Kit | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Step 7: inline edit state
  const [editingQId, setEditingQId] = useState<string | null>(null);
  const [editQPrompt, setEditQPrompt] = useState("");
  const [editQAnswer, setEditQAnswer] = useState("");

  const [editingFId, setEditingFId] = useState<string | null>(null);
  const [editFFront, setEditFFront] = useState("");
  const [editFBack, setEditFBack] = useState("");

  // Step 8: add-question / add-flashcard form state
  const [newQPrompt, setNewQPrompt] = useState("");
  const [newQAnswer, setNewQAnswer] = useState("");
  const [newQCategory, setNewQCategory] = useState("technical");
  const [showAddQ, setShowAddQ] = useState(false);

  const [newFFront, setNewFFront] = useState("");
  const [newFBack, setNewFBack] = useState("");
  const [showAddF, setShowAddF] = useState(false);

  // Step 10: regenerate loading state, per section
  const [regenLoading, setRegenLoading] = useState<Record<string, boolean>>({});

  async function refreshKit() {
    try {
      const res = await fetch(`${API_BASE}/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Request failed with ${res.status}`);
      const data: Kit = await res.json();
      setKit(data);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load kit");
    }
  }

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/${id}`, {
          credentials: "include",
        });
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
  }, [id]);

  // ---------- Step 7: edit / delete question ----------
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
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to delete question");
    }
  }

  // ---------- Step 7: edit / delete flashcard ----------
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
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to delete flashcard");
    }
  }

  // ---------- Step 8: add question / flashcard ----------
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

  // ---------- Step 9: reorder (up/down arrows) ----------
  async function moveItem(section: "questions" | "flashcards", itemId: string, direction: "up" | "down") {
    if (!kit?.data?.[section]) return;
    const items = [...kit.data[section]];
    const idx = items.findIndex((it: any) => it.id === itemId);
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (idx === -1 || swapWith < 0 || swapWith >= items.length) return;

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

  // ---------- Step 10: regenerate a section ----------
  async function regenerateSection(section: "questions" | "flashcards" | "company_brief" | "schedule") {
    setRegenLoading((prev) => ({ ...prev, [section]: true }));
    try {
      const res = await fetch(`${API_BASE}/${id}/regenerate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section }),
      });
      if (!res.ok) throw new Error(`Regenerate failed with ${res.status}`);
      await refreshKit();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to regenerate");
    } finally {
      setRegenLoading((prev) => ({ ...prev, [section]: false }));
    }
  }

  if (errorMsg) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
          {errorMsg}
        </p>
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
        <p className="text-gray-600">Current step: {kit.status}</p>
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
        <p className="text-gray-700">{kit.error?.message || "Unknown error"}</p>
      </div>
    );
  }

  // Done - show the kit
  const data = kit.data;
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">{data.role?.title || "Untitled role"}</h1>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Company brief</h2>
          <button
            onClick={() => regenerateSection("company_brief")}
            disabled={regenLoading.company_brief}
            className="text-xs text-blue-600 border border-blue-300 rounded px-2 py-1 disabled:opacity-50"
          >
            {regenLoading.company_brief ? "Regenerating..." : "Regenerate"}
          </button>
        </div>
        <p className="text-gray-700">{data.company_brief?.summary}</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Requirements</h2>
        <ul className="list-disc pl-5 space-y-1">
          {data.role?.requirements?.map((r: any) => (
            <li key={r.id}>
              {r.text} <span className="text-xs text-gray-500">({r.priority})</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Questions</h2>
          <button
            onClick={() => regenerateSection("questions")}
            disabled={regenLoading.questions}
            className="text-xs text-blue-600 border border-blue-300 rounded px-2 py-1 disabled:opacity-50"
          >
            {regenLoading.questions ? "Regenerating..." : "Regenerate"}
          </button>
        </div>
        <ul className="space-y-3">
          {data.questions?.map((q: Question, idx: number) => (
            <li key={q.id} className="border rounded-md p-3">
              {editingQId === q.id ? (
                <div className="space-y-2">
                  <textarea
                    className="w-full border rounded p-2 text-sm"
                    value={editQPrompt}
                    onChange={(e) => setEditQPrompt(e.target.value)}
                  />
                  <textarea
                    className="w-full border rounded p-2 text-sm text-gray-600"
                    value={editQAnswer}
                    onChange={(e) => setEditQAnswer(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEditQuestion(q.id)}
                      className="text-xs bg-blue-600 text-white rounded px-2 py-1"
                    >
                      Save
                    </button>
                    <button onClick={cancelEditQuestion} className="text-xs border rounded px-2 py-1">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-start gap-2">
                  <div onClick={() => startEditQuestion(q)} className="cursor-text flex-1">
                    <p className="font-medium">{q.prompt}</p>
                    <p className="text-sm text-gray-600 mt-1">{q.answer_outline}</p>
                    {q.edited && <span className="text-xs text-green-600">edited</span>}
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <button onClick={() => moveItem("questions", q.id, "up")} disabled={idx === 0} className="text-xs disabled:opacity-30">
                      ▲
                    </button>
                    <button
                      onClick={() => moveItem("questions", q.id, "down")}
                      disabled={idx === data.questions.length - 1}
                      className="text-xs disabled:opacity-30"
                    >
                      ▼
                    </button>
                    <button onClick={() => deleteQuestion(q.id)} className="text-xs text-red-600">
                      ×
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

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
              className="border rounded p-2 text-sm"
              value={newQCategory}
              onChange={(e) => setNewQCategory(e.target.value)}
            >
              <option value="technical">technical</option>
              <option value="behavioural">behavioural</option>
              <option value="system-design">system-design</option>
              <option value="company-fit">company-fit</option>
            </select>
            <div className="flex gap-2">
              <button onClick={addQuestion} className="text-xs bg-blue-600 text-white rounded px-2 py-1">
                Add
              </button>
              <button onClick={() => setShowAddQ(false)} className="text-xs border rounded px-2 py-1">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddQ(true)} className="mt-3 text-sm text-blue-600">
            + Add question
          </button>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Flashcards</h2>
          <button
            onClick={() => regenerateSection("flashcards")}
            disabled={regenLoading.flashcards}
            className="text-xs text-blue-600 border border-blue-300 rounded px-2 py-1 disabled:opacity-50"
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
                    className="w-full border rounded p-2 text-sm"
                    value={editFFront}
                    onChange={(e) => setEditFFront(e.target.value)}
                  />
                  <textarea
                    className="w-full border rounded p-2 text-sm text-gray-600"
                    value={editFBack}
                    onChange={(e) => setEditFBack(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEditFlashcard(f.id)}
                      className="text-xs bg-blue-600 text-white rounded px-2 py-1"
                    >
                      Save
                    </button>
                    <button onClick={cancelEditFlashcard} className="text-xs border rounded px-2 py-1">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-start gap-2">
                  <div onClick={() => startEditFlashcard(f)} className="cursor-text flex-1">
                    <p className="font-medium">{f.front}</p>
                    <p className="text-sm text-gray-600 mt-1">{f.back}</p>
                    {f.edited && <span className="text-xs text-green-600">edited</span>}
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <button onClick={() => moveItem("flashcards", f.id, "up")} disabled={idx === 0} className="text-xs disabled:opacity-30">
                      ▲
                    </button>
                    <button
                      onClick={() => moveItem("flashcards", f.id, "down")}
                      disabled={idx === data.flashcards.length - 1}
                      className="text-xs disabled:opacity-30"
                    >
                      ▼
                    </button>
                    <button onClick={() => deleteFlashcard(f.id)} className="text-xs text-red-600">
                      ×
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
              <button onClick={addFlashcard} className="text-xs bg-blue-600 text-white rounded px-2 py-1">
                Add
              </button>
              <button onClick={() => setShowAddF(false)} className="text-xs border rounded px-2 py-1">
                Cancel
              </button>
            </div>
          </div>
        ) : (
        <button onClick={() => setShowAddF(true)} className="mt-3 text-sm text-blue-600">
          + Add flashcard
        </button>
      )}
    </section>

    <section>
      <h2 className="text-lg font-semibold mb-2">Practice Mode</h2>
      <PracticeMode flashcards={data.flashcards || []} />
    </section>

    <section>
      <h2 className="text-lg font-semibold mb-2">Coverage</h2>
      <p className="text-gray-700">{JSON.stringify(data.coverage)}</p>
    </section>

    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Schedule</h2>
        <button
          onClick={() => regenerateSection("schedule")}
          disabled={regenLoading.schedule}
          className="text-xs text-blue-600 border border-blue-300 rounded px-2 py-1 disabled:opacity-50"
        >
          {regenLoading.schedule ? "Regenerating..." : "Regenerate"}
        </button>
      </div>
      <ul className="space-y-2">
        {data.schedule?.days?.map((d: any) => (
          <li key={d.day}>
            <strong>Day {d.day}:</strong> {d.focus} ({d.minutes} min)
          </li>
        ))}
      </ul>
    </section>
  </div>
  );
}