const express = require("express");
const router = express.Router();
const Kit = require("../models/Kit");
const { assembleKit } = require("../services/assembleKit");
const { crawlSite } = require("../services/retrieval/crawlSite");
const { searchDiscussion, companyNameFromUrl, isLocalUrl } = require("../services/retrieval/searchDiscussion");
const { generateQuestions, buildResearch } = require("../services/generate/questions");
const { buildFlashcards } = require("../services/generate/flashcards");
const { buildSchedule } = require("../services/schedule/buildSchedule");
const { assertSafeUrl } = require("../services/security/validateUrl");

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

// POST /api/kits - create a new kit, run pipeline in background
router.post("/", requireAuth, async (req, res) => {
  const { jd, company_url, days } = req.body;

  if (!jd || !company_url || !days) {
    return res.status(400).json({ message: "jd, company_url and days are required" });
  }

  try {
    const kitDoc = await Kit.create({
      userId: req.session.userId,
      status: "queued",
    });

    res.status(202).json({ id: kitDoc._id });

    try {
      kitDoc.status = "researching";
      await kitDoc.save();

      const result = await assembleKit({ jd, companyUrl: company_url, days });

      kitDoc.data = result;
      kitDoc.status = "done";
      await kitDoc.save();
    } catch (err) {
      kitDoc.status = "failed";
      kitDoc.error = { message: err.message };
      await kitDoc.save();
    }
  } catch (err) {
    res.status(500).json({ message: "Failed to create kit", error: err.message });
  }
});

// GET /api/kits — list current user's kits
router.get("/", requireAuth, async (req, res) => {
  const kits = await Kit.find({ userId: req.session.userId }).select("-data");
  res.json(kits);
});

// GET /api/kits/:id — poll status / fetch one kit
router.get("/:id", requireAuth, async (req, res) => {
  const kit = await Kit.findOne({ _id: req.params.id, userId: req.session.userId });
  if (!kit) return res.status(404).json({ message: "Kit not found" });
  res.json(kit);
});

// PATCH /api/kits/:id/question/:qid — edit a question's prompt/answer_outline/category
router.patch("/:id/question/:qid", requireAuth, async (req, res) => {
  const kit = await Kit.findOne({ _id: req.params.id, userId: req.session.userId });
  if (!kit) return res.status(404).json({ message: "Kit not found" });

  const { prompt, answer_outline, category } = req.body;
  const questions = kit.data?.questions || [];
  const q = questions.find((item) => item.id === req.params.qid);
  if (!q) return res.status(404).json({ message: "Question not found" });

  if (prompt !== undefined) q.prompt = prompt;
  if (answer_outline !== undefined) q.answer_outline = answer_outline;
  if (category !== undefined) q.category = category;
  q.edited = true;

  kit.markModified("data");
  await kit.save();

  res.json(q);
});

// POST /api/kits/:id/question — add a new, user-written question
router.post("/:id/question", requireAuth, async (req, res) => {
  const kit = await Kit.findOne({ _id: req.params.id, userId: req.session.userId });
  if (!kit) return res.status(404).json({ message: "Kit not found" });

  const { prompt, answer_outline, category } = req.body;
  if (!prompt || !answer_outline || !category) {
    return res.status(400).json({ message: "prompt, answer_outline and category are required" });
  }

  if (!kit.data) kit.data = { questions: [] };
  if (!kit.data.questions) kit.data.questions = [];

  const newQuestion = {
    id: `q-user-${Date.now()}`,
    category,
    requirement_ids: [],
    prompt,
    answer_outline,
    difficulty: 2,
    edited: true,
  };
  kit.data.questions.push(newQuestion);

  kit.markModified("data");
  await kit.save();

  res.status(201).json(newQuestion);
});

// DELETE /api/kits/:id/question/:qid — remove a question
router.delete("/:id/question/:qid", requireAuth, async (req, res) => {
  const kit = await Kit.findOne({ _id: req.params.id, userId: req.session.userId });
  if (!kit) return res.status(404).json({ message: "Kit not found" });
  if (!kit.data?.questions) return res.status(404).json({ message: "Question not found" });

  const before = kit.data.questions.length;
  kit.data.questions = kit.data.questions.filter((q) => q.id !== req.params.qid);
  if (kit.data.questions.length === before) {
    return res.status(404).json({ message: "Question not found" });
  }

  kit.markModified("data");
  await kit.save();

  res.status(204).send();
});

// POST /api/kits/:id/flashcard — add a new, user-written flashcard
router.post("/:id/flashcard", requireAuth, async (req, res) => {
  const kit = await Kit.findOne({ _id: req.params.id, userId: req.session.userId });
  if (!kit) return res.status(404).json({ message: "Kit not found" });

  const { front, back } = req.body;
  if (!front || !back) {
    return res.status(400).json({ message: "front and back are required" });
  }

  if (!kit.data) kit.data = { flashcards: [] };
  if (!kit.data.flashcards) kit.data.flashcards = [];

  const newFlashcard = {
    id: `f-user-${Date.now()}`,
    front,
    back,
    requirement_ids: [],
    edited: true,
  };
  kit.data.flashcards.push(newFlashcard);

  kit.markModified("data");
  await kit.save();

  res.status(201).json(newFlashcard);
});

// DELETE /api/kits/:id/flashcard/:fid — remove a flashcard
router.delete("/:id/flashcard/:fid", requireAuth, async (req, res) => {
  const kit = await Kit.findOne({ _id: req.params.id, userId: req.session.userId });
  if (!kit) return res.status(404).json({ message: "Kit not found" });
  if (!kit.data?.flashcards) return res.status(404).json({ message: "Flashcard not found" });

  const before = kit.data.flashcards.length;
  kit.data.flashcards = kit.data.flashcards.filter((f) => f.id !== req.params.fid);
  if (kit.data.flashcards.length === before) {
    return res.status(404).json({ message: "Flashcard not found" });
  }

  kit.markModified("data");
  await kit.save();

  res.status(204).send();
});

// PATCH /api/kits/:id/reorder — reorder questions or flashcards by id
router.patch("/:id/reorder", requireAuth, async (req, res) => {
  const kit = await Kit.findOne({ _id: req.params.id, userId: req.session.userId });
  if (!kit) return res.status(404).json({ message: "Kit not found" });

  const { section, orderedIds } = req.body;
  if (!["questions", "flashcards"].includes(section) || !Array.isArray(orderedIds)) {
    return res.status(400).json({ message: "section must be 'questions' or 'flashcards', orderedIds must be an array" });
  }

  const items = kit.data?.[section];
  if (!items) return res.status(404).json({ message: `No ${section} found on this kit` });

  if (orderedIds.length !== items.length) {
    return res.status(400).json({ message: "orderedIds must include every item's id, exactly once" });
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  const reordered = orderedIds.map((id) => byId.get(id));

  if (reordered.some((item) => !item)) {
    return res.status(400).json({ message: "orderedIds contains an id not present in this section" });
  }

  kit.data[section] = reordered;

  kit.markModified("data");
  await kit.save();

  res.json(reordered);
});

// POST /api/kits/:id/regenerate — regenerate a section, keeping edited:true items pinned
router.post("/:id/regenerate", requireAuth, async (req, res) => {
  const kit = await Kit.findOne({ _id: req.params.id, userId: req.session.userId });
  if (!kit) return res.status(404).json({ message: "Kit not found" });
  if (!kit.data) return res.status(400).json({ message: "Kit has no data yet" });

  const { section, category } = req.body;
  if (!["questions", "flashcards", "company_brief", "schedule"].includes(section)) {
    return res.status(400).json({ message: "section must be one of questions, flashcards, company_brief, schedule" });
  }

  try {
    const companyUrl = kit.data.source.company_url;
    await assertSafeUrl(companyUrl); // re-check before any re-crawl

    if (section === "company_brief") {
      if (kit.data.company_brief?.edited) {
        return res.json(kit.data.company_brief);
      }
      const crawl = await crawlSite(companyUrl);
      const home = crawl.pages[0];
      kit.data.company_brief = {
        summary: home ? home.text.slice(0, 300) : "",
        what_they_do: home ? home.text.slice(0, 600) : "",
        sources: crawl.pages.map((p) => p.url),
        edited: false,
      };
      kit.markModified("data");
      await kit.save();
      return res.json(kit.data.company_brief);
    }

    if (section === "schedule") {
      const days = kit.data.schedule?.days_available || 5;
      kit.data.schedule = buildSchedule(kit.data.questions || [], kit.data.role.requirements, days);
      kit.markModified("data");
      await kit.save();
      return res.json(kit.data.schedule);
    }

    const items = kit.data[section] || [];
    const relevant = category ? items.filter((i) => i.category === category) : items;
    const pinned = relevant.filter((i) => i.edited);
    const untouched = items.filter((i) => !relevant.includes(i));

    const companyName = companyNameFromUrl(companyUrl);
    const crawl = await crawlSite(companyUrl);
    const discussion = await searchDiscussion(companyName, { skip: isLocalUrl(companyUrl) });
    const research = buildResearch(crawl, discussion.results);

    let freshItems;
    if (section === "questions") {
      const generated = await generateQuestions({ role: kit.data.role, research });
      freshItems = generated.questions
        .filter((q) => !category || q.category === category)
        .map((q) => ({ ...q, edited: false }));
    } else {
      const generated = await generateQuestions({ role: kit.data.role, research });
      freshItems = buildFlashcards(generated.questions)
        .filter((f) => !category || f.category === category)
        .map((f) => ({ ...f, edited: false }));
    }

    kit.data[section] = [...untouched, ...pinned, ...freshItems];

    kit.markModified("data");
    await kit.save();

    res.json(kit.data[section]);
  } catch (err) {
    res.status(500).json({ message: "Regenerate failed", error: err.message });
  }
});

module.exports = router;
