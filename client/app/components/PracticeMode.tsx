"use client";
import { useState } from "react";

type Flashcard = { id: string; front: string; back: string; [key: string]: any };

export default function PracticeMode({ flashcards }: { flashcards: Flashcard[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<string>>(new Set());

  if (!flashcards || flashcards.length === 0) {
    return <p>No flashcards available yet.</p>;
  }

  const card = flashcards[index];
  const progress = Math.round((known.size / flashcards.length) * 100);

  function next() {
    setFlipped(false);
    setIndex((i) => (i + 1) % flashcards.length);
  }
  function prev() {
    setFlipped(false);
    setIndex((i) => (i - 1 + flashcards.length) % flashcards.length);
  }
  function markKnown() {
    setKnown((prev) => new Set(prev).add(card.id));
    next();
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
      <div style={{ marginBottom: 12, fontSize: 14, color: "#666" }}>
        Card {index + 1} / {flashcards.length} | Known: {known.size} ({progress}%)
      </div>
      <div
        onClick={() => setFlipped((f) => !f)}
        style={{
          border: "1px solid #ccc", borderRadius: 12, padding: 32,
          minHeight: 160, display: "flex", alignItems: "center",
          justifyContent: "center", cursor: "pointer", fontSize: 18,
        }}
      >
        {flipped ? card.back : card.front}
      </div>
      <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>(Tap card to flip)</div>
      <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center" }}>
        <button onClick={prev}>⟵ Prev</button>
        <button onClick={markKnown}>✓ Known</button>
        <button onClick={next}>Next ⟶</button>
      </div>
    </div>
  );
}