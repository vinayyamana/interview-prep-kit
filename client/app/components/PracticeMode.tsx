"use client";
import { useMemo, useState } from "react";
import { Confidence, Ratings, orderCards, coveredCount } from "../lib/practice";

type Flashcard = { id: string; front: string; back: string; [key: string]: any };

const LEVELS: [Confidence, string][] = [[1, "Hard"], [2, "OK"], [3, "Easy"]];

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

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
      <div aria-live="polite" style={{ marginBottom: 12, fontSize: 14, color: "#666" }}>
        Card {i + 1} / {deck.length} | Covered: {covered} / {deck.length}
      </div>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Show question" : "Reveal answer"}
        style={{
          width: "100%", border: "1px solid #ccc", borderRadius: 12, padding: 32,
          minHeight: 160, fontSize: 18, cursor: "pointer", background: "transparent",
          color: "inherit",
        }}
      >
        {flipped ? card.back : card.front}
      </button>
      <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>
        (Tap card to flip, then rate)
      </div>

      <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center" }}>
        <button onClick={() => go(-1)}>← Prev</button>
        {LEVELS.map(([value, label]) => (
          <button
            key={value}
            disabled={!flipped}
            onClick={() => rate(value)}
            aria-label={`Rate card ${label}`}
          >
            {label}
          </button>
        ))}
        <button onClick={() => go(1)}>Next →</button>
      </div>

      <div style={{ marginTop: 24, textAlign: "left" }}>
        <strong>Not covered yet ({notCovered.length})</strong>
        <ul>
          {notCovered.map((c) => (
            <li key={c.id}>{c.front}</li>
          ))}
        </ul>
        <button onClick={startNextSession}>Start next session (least confident first)</button>
      </div>
    </div>
  );
}