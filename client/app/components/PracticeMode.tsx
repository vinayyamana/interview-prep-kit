"use client";
import { useMemo, useState } from "react";
import { Confidence, Ratings, orderCards, coveredCount } from "../lib/practice";

type Flashcard = { id: string; front: string; back: string; [key: string]: any };

const LEVELS: [Confidence, string, string][] = [
  [1, "Hard", "border-red-400 text-red-600 dark:text-red-400"],
  [2, "OK", "border-amber-400 text-amber-600 dark:text-amber-400"],
  [3, "Easy", "border-green-400 text-green-600 dark:text-green-400"],
];

const navBtn =
  "text-sm border rounded px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function PracticeMode({
  flashcards,
  initialRatings = {},
  onRate,
}: {
  flashcards: Flashcard[];
  initialRatings?: Ratings;
  onRate?: (cardId: string, value: Confidence) => void;
}) {
  const [ratings, setRatings] = useState<Ratings>(initialRatings);
  const [order, setOrder] = useState<string[]>(() =>
    orderCards(flashcards, initialRatings).map((c) => c.id)
  );
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // Session order stays fixed, but edited/added/deleted cards still show up
  const deck = useMemo(() => {
    const byId = new Map(flashcards.map((c) => [c.id, c]));
    const ordered = order.map((id) => byId.get(id)).filter(Boolean) as Flashcard[];
    const extra = flashcards.filter((c) => !order.includes(c.id));
    return [...ordered, ...extra];
  }, [flashcards, order]);

  if (deck.length === 0) return <p>No flashcards available yet.</p>;

  const i = Math.min(index, deck.length - 1);
  const card = deck[i];
  const covered = coveredCount(deck, ratings);
  const notCovered = deck.filter((c) => !ratings[c.id]);
  const lastRating = ratings[card.id];
  const lastLabel = LEVELS.find(([v]) => v === lastRating)?.[1];

  function go(step: number) {
    setFlipped(false);
    setIndex((i + step + deck.length) % deck.length);
  }

  function rate(value: Confidence) {
    setRatings((prev) => ({ ...prev, [card.id]: value }));
    onRate?.(card.id, value);
    go(1);
  }

  function startNextSession() {
    setOrder(orderCards(deck, ratings).map((c) => c.id));
    setIndex(0);
    setFlipped(false);
  }

  // Shortcuts only work while focus is inside the practice box
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if (e.key === " ") {
      if (tag === "BUTTON") return; // buttons handle Space themselves
      e.preventDefault();
      setFlipped((f) => !f);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (flipped && (e.key === "1" || e.key === "2" || e.key === "3")) {
      e.preventDefault();
      rate(Number(e.key) as Confidence);
    }
  }

  return (
    <div
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="Practice mode. Space flips the card, 1 2 3 rate it, left and right arrows move between cards."
      className="max-w-lg mx-auto text-center rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 p-2"
    >
      <div aria-live="polite" className="mb-3 text-sm text-gray-600 dark:text-gray-300">
        Card {i + 1} / {deck.length} | Covered: {covered} / {deck.length}
      </div>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Show question" : "Reveal answer"}
        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-8 min-h-[160px] text-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {flipped ? card.back : card.front}
      </button>

      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {lastLabel ? `Last rating: ${lastLabel}` : "Not rated yet"}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Space flip, 1/2/3 rate, ← → move
      </div>

      <div className="mt-4 flex flex-wrap gap-2 justify-center">
        <button type="button" onClick={() => go(-1)} className={navBtn}>
          ← Prev
        </button>
        {LEVELS.map(([value, label, color]) => (
          <button
            key={value}
            type="button"
            disabled={!flipped}
            onClick={() => rate(value)}
            aria-label={`Rate card ${label}`}
            className={`text-sm border rounded px-3 py-1.5 font-medium disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-blue-500 ${color}`}
          >
            {value}. {label}
          </button>
        ))}
        <button type="button" onClick={() => go(1)} className={navBtn}>
          Next →
        </button>
      </div>

      <div className="mt-6 text-left">
        {notCovered.length === 0 ? (
          <p className="text-sm text-green-600 dark:text-green-400">All cards covered</p>
        ) : (
          <>
            <strong>Not covered yet ({notCovered.length})</strong>
            <ul className="list-disc pl-5 mt-1 text-sm">
              {notCovered.map((c) => (
                <li key={c.id}>{c.front}</li>
              ))}
            </ul>
          </>
        )}
        <button type="button" onClick={startNextSession} className={`${navBtn} mt-3`}>
          Start next session (least confident first)
        </button>
      </div>
    </div>
  );
}