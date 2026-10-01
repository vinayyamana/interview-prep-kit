const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");

const router = express.Router();

const Kit = require("../models/Kit");
const { assembleKit } = require("../services/assembleKit");
const { crawlSite } = require("../services/retrieval/crawlSite");
// NOTE: adjust this path to wherever your searchDiscussion lives
const { searchDiscussion } = require("../services/retrieval/searchDiscussion");
const { generateQuestions, buildResearch } = require("../services/generate/questions");
const { generateFlashcards } = require("../services/generate/flashcards");
const { buildSchedule } = require("../services/schedule/buildSchedule");
const { assertSafeUrl } = require("../services/security/validateUrl");

const CATEGORIES = ["technical", "behavioural", "system-design", "company-fit"];
const REGEN_SECTIONS = ["questions", "flashcards", "company_brief", "schedule"];
const MIN_DAYS = 1;
const MAX_DAYS = 60;
const MAX_JD_CHARS = 50000;

/* ---------- helpers ---------- */

// Express 4 does not catch rejected promises, so wrap every async handler.
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

// Returns the kit only if it belongs to the logged-in user (and id is valid).
async function findOwnKit(req) {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  return Kit.findOne({ _id: req.params.id, userId: req.session.userId });
}

// Re-load the kit, apply a change to the LATEST data, save.
// This way edits made while a slow regeneration was running are not overwritten.
async function commit(req, mutate) {
  const fresh = await findOwnKit(req);
  if (!fresh || !fresh.data) return null;
  const result = mutate(fresh.data);
  fresh.markModified("data");
  await fresh.save();
  return result === undefined ? fresh.data : result;
}

function isValidDays(n) {
  return Number.isInteger(n) && n >= MIN_DAYS && n <= MAX_DAYS;
}

function rebuildSchedule(data, daysOverride) {
  const days = daysOverride || data.schedule?.days_available || 5;
  data.schedule = buildSchedule(data.questions || [], data.role?.requirements || [], days);
}

function newUserItemId(prefix) {
  return `${prefix}-user-${crypto.randomBytes(4).toString("hex")}`;
}

function nextId(prefix, used) {
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  const id = `${prefix}${n}`;
  used.add(id);
  return id;
}

function isLocalUrl(url) {
  try {
    const h = new URL(url).hostname;
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(h);
  } catch {
    return false;
  }
}

function companyNameFromUrl(url) {
  try {
    const u = new URL(url);
    if (isLocalUrl(url)) {
      return u.pathname.split("/").filter(Boolean)[0] || "company";
    }
    const parts = u.hostname.replace(/^www\./, "").split(".");
    return parts.length > 1 ? parts[parts.length - 2] : parts[0];
  } catch {
    return "company";
  }
}

// Runs after the 202 response is sent. Never throws.
async function runPipeline(kitDoc, { jd, companyUrl, days }) {
  try {
    kitDoc.status = "researching";
    await kitDoc.save();

    const result = await assembleKit({ jd, companyUrl, days });
    kitDoc.data = result;
    kitDoc.status = "done";
  } catch (err) {
    console.error("PIPELINE ERROR:", err.stack);
    kitDoc.status = "failed";
    kitDoc.error = { code: err.code || "PIPELINE_FAILED", message: err.message };
  }
  try {
    await kitDoc.save();
  } catch (saveErr) {
    console.error("Could not save kit after pipeline:", saveErr);
  }
}

/* ---------- create / read ---------- */

// POST /api/kits - create a new kit, run pipeline in background
router.post(
  "/",
  requireAuth,
  wrap(async (req, res) => {
    const { jd, company_url, days } = req.body || {};
    const dayCount = Number(days);

    if (typeof jd !== "string" || !jd.trim() || typeof company_url !== "string" || !company_url.trim()) {
      return res.status(400).json({ message: "jd, company_url and days are required" });
    }
    if (jd.length > MAX_JD_CHARS) {
      return res.status(400).json({ message: `jd must be under ${MAX_JD_CHARS} characters` });
    }
    if (!isValidDays(dayCount)) {
      return res.status(400).json({ message: `days must be a whole number from ${MIN_DAYS} to ${MAX_DAYS}` });
    }

    try {
      await assertSafeUrl(company_url);
    } catch (err) {
      return res.status(400).json({ message: "company_url is not allowed", error: err.message });
    }

    const kitDoc = await Kit.create({ userId: req.session.userId, status: "queued" });

    res.status(202).json({ id: kitDoc._id });

    // fire and forget; runPipeline handles its own errors
    runPipeline(kitDoc, { jd, companyUrl: company_url, days: dayCount }).catch(console.error);
  })
);

// GET /api/kits - list current user's kits
router.get(
  "/",
  requireAuth,
  wrap(async (req, res) => {
    const kits = await Kit.find({ userId: req.session.userId }).select("-data");
    res.json(kits);
  })
);

// GET /api/kits/:id - poll status / fetch one kit
router.get(
  "/:id",
  requireAuth,
  wrap(async (req, res) => {
    const kit = await findOwnKit(req);
    if (!kit) return res.status(404).json({ message: "Kit not found" });
    res.json(kit);
  })
);

/* ---------- questions ---------- */

// PATCH /api/kits/:id/question/:qid - edit prompt / answer_outline / category
router.patch(
  "/:id/question/:qid",
  requireAuth,
  wrap(async (req, res) => {
    const { prompt, answer_outline, category } = req.body || {};
    if (category !== undefined && !CATEGORIES.includes(category)) {
      return res.status(400).json({ message: `category must be one of ${CATEGORIES.join(", ")}` });
    }

    const kit = await findOwnKit(req);
    if (!kit) return res.status(404).json({ message: "Kit not found" });

    const q = (kit.data?.questions || []).find((item) => item.id === req.params.qid);
    if (!q) return res.status(404).json({ message: "Question not found" });

    if (prompt !== undefined) q.prompt = prompt;
    if (answer_outline !== undefined) q.answer_outline = answer_outline;
    if (category !== undefined) q.category = category;
    q.edited = true; // pinned: survives regeneration

    kit.markModified("data");
    await kit.save();
    res.json(q);
  })
);

// POST /api/kits/:id/question - add a new, user-written question
router.post(
  "/:id/question",
  requireAuth,
  wrap(async (req, res) => {
    const { prompt, answer_outline = "", category, requirement_ids = [], difficulty = 2 } = req.body || {};
    if (!prompt || !category) {
      return res.status(400).json({ message: "prompt and category are required" });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ message: `category must be one of ${CATEGORIES.join(", ")}` });
    }

    const kit = await findOwnKit(req);
    if (!kit) return res.status(404).json({ message: "Kit not found" });

    if (!kit.data) kit.data = {};
    if (!kit.data.questions) kit.data.questions = [];

    const newQuestion = {
      id: newUserItemId("q"),
      category,
      requirement_ids: Array.isArray(requirement_ids) ? requirement_ids : [],
      prompt,
      answer_outline,
      difficulty: [1, 2, 3].includes(difficulty) ? difficulty : 2,
      edited: true,
    };
    kit.data.questions.push(newQuestion);

    kit.markModified("data");
    await kit.save();
    res.status(201).json(newQuestion);
  })
);

// DELETE /api/kits/:id/question/:qid - remove a question
router.delete(
  "/:id/question/:qid",
  requireAuth,
  wrap(async (req, res) => {
    const kit = await findOwnKit(req);
    if (!kit) return res.status(404).json({ message: "Kit not found" });
    if (!kit.data?.questions) return res.status(404).json({ message: "Question not found" });

    const before = kit.data.questions.length;
    kit.data.questions = kit.data.questions.filter((q) => q.id !== req.params.qid);
    if (kit.data.questions.length === before) {
      return res.status(404).json({ message: "Question not found" });
    }

    // schedule must never point at a question that no longer exists
    rebuildSchedule(kit.data);

    kit.markModified("data");
    await kit.save();
    res.status(204).send();
  })
);

/* ---------- flashcards ---------- */

// PATCH /api/kits/:id/flashcard/:fid - edit a flashcard
router.patch(
  "/:id/flashcard/:fid",
  requireAuth,
  wrap(async (req, res) => {
    const { front, back } = req.body || {};
    const kit = await findOwnKit(req);
    if (!kit) return res.status(404).json({ message: "Kit not found" });

    const f = (kit.data?.flashcards || []).find((item) => item.id === req.params.fid);
    if (!f) return res.status(404).json({ message: "Flashcard not found" });

    if (front !== undefined) f.front = front;
    if (back !== undefined) f.back = back;
    f.edited = true;

    kit.markModified("data");
    await kit.save();
    res.json(f);
  })
);

// POST /api/kits/:id/flashcard - add a new, user-written flashcard
router.post(
  "/:id/flashcard",
  requireAuth,
  wrap(async (req, res) => {
    const { front, back, requirement_ids = [] } = req.body || {};
    if (!front || !back) {
      return res.status(400).json({ message: "front and back are required" });
    }

    const kit = await findOwnKit(req);
    if (!kit) return res.status(404).json({ message: "Kit not found" });

    if (!kit.data) kit.data = {};
    if (!kit.data.flashcards) kit.data.flashcards = [];

    const newFlashcard = {
      id: newUserItemId("f"),
      front,
      back,
      requirement_ids: Array.isArray(requirement_ids) ? requirement_ids : [],
      edited: true,
    };
    kit.data.flashcards.push(newFlashcard);

    kit.markModified("data");
    await kit.save();
    res.status(201).json(newFlashcard);
  })
);

// DELETE /api/kits/:id/flashcard/:fid - remove a flashcard
router.delete(
  "/:id/flashcard/:fid",
  requireAuth,
  wrap(async (req, res) => {
    const kit = await findOwnKit(req);
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
  })
);

/* ---------- company brief ---------- */

// PATCH /api/kits/:id/company_brief - edit the brief inline
router.patch(
  "/:id/company_brief",
  requireAuth,
  wrap(async (req, res) => {
    const { summary, what_they_do } = req.body || {};
    const kit = await findOwnKit(req);
    if (!kit) return res.status(404).json({ message: "Kit not found" });
    if (!kit.data?.company_brief) return res.status(404).json({ message: "Company brief not found" });

    if (summary !== undefined) kit.data.company_brief.summary = summary;
    if (what_they_do !== undefined) kit.data.company_brief.what_they_do = what_they_do;
    kit.data.company_brief.edited = true;

    kit.markModified("data");
    await kit.save();
    res.json(kit.data.company_brief);
  })
);

/* ---------- reorder ---------- */

// PATCH /api/kits/:id/reorder - reorder questions or flashcards by id
router.patch(
  "/:id/reorder",
  requireAuth,
  wrap(async (req, res) => {
    const { section, orderedIds } = req.body || {};
    if (!["questions", "flashcards"].includes(section) || !Array.isArray(orderedIds)) {
      return res
        .status(400)
        .json({ message: "section must be 'questions' or 'flashcards', orderedIds must be an array" });
    }

    const kit = await findOwnKit(req);
    if (!kit) return res.status(404).json({ message: "Kit not found" });

    const items = kit.data?.[section];
    if (!items) return res.status(404).json({ message: `No ${section} found on this kit` });

    if (orderedIds.length !== items.length || new Set(orderedIds).size !== items.length) {
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
  })
);

/* ---------- regenerate ---------- */

// POST /api/kits/:id/regenerate - regenerate one section; edited items stay pinned
router.post(
  "/:id/regenerate",
  requireAuth,
  wrap(async (req, res) => {
    const { section, category, force, days } = req.body || {};

    if (!REGEN_SECTIONS.includes(section)) {
      return res.status(400).json({ message: `section must be one of ${REGEN_SECTIONS.join(", ")}` });
    }
    if (category !== undefined && !CATEGORIES.includes(category)) {
      return res.status(400).json({ message: `category must be one of ${CATEGORIES.join(", ")}` });
    }

    const kit = await findOwnKit(req);
    if (!kit) return res.status(404).json({ message: "Kit not found" });
    if (!kit.data) return res.status(400).json({ message: "Kit has no data yet" });
    if (kit.status !== "done") return res.status(409).json({ message: "Kit is still being generated" });

    const snapshot = kit.data; // used only for the slow generation step

    try {
      /* schedule: pure arithmetic, no network */
      if (section === "schedule") {
        const requested = days === undefined ? undefined : Number(days);
        if (requested !== undefined && !isValidDays(requested)) {
          return res.status(400).json({ message: `days must be a whole number from ${MIN_DAYS} to ${MAX_DAYS}` });
        }
        const schedule = await commit(req, (d) => {
          rebuildSchedule(d, requested);
          return d.schedule;
        });
        return res.json(schedule);
      }

      const companyUrl = snapshot.source?.company_url;
      try {
        await assertSafeUrl(companyUrl); // re-check before any re-crawl
      } catch (err) {
        return res.status(400).json({ message: "company_url is not allowed", error: err.message });
      }

      /* company brief */
      if (section === "company_brief") {
        if (snapshot.company_brief?.edited && !force) {
          return res.json(snapshot.company_brief); // pinned; send force:true to override
        }
        const crawl = await crawlSite(companyUrl);
        const pages = crawl?.pages || [];
        const home = pages[0];
        const brief = await commit(req, (d) => {
          d.company_brief = {
            summary: home ? home.text.slice(0, 300) : "",
            what_they_do: home ? home.text.slice(0, 600) : "",
            sources: pages.map((p) => p.url),
            edited: false,
          };
          return d.company_brief;
        });
        return res.json(brief);
      }

      /* questions / flashcards: slow step first, using the snapshot */
      const companyName = snapshot.source?.company || companyNameFromUrl(companyUrl);
      const crawl = await crawlSite(companyUrl);
      const discussion = await searchDiscussion(companyName, { skip: isLocalUrl(companyUrl) });
      const research = buildResearch(crawl, discussion?.results || []);

      let generated;
      if (section === "questions") {
        const out = await generateQuestions({ role: snapshot.role, research });
        generated = (out.questions || []).filter((q) => !category || q.category === category);
      } else {
        generated = (await generateFlashcards(snapshot.questions || [])) || [];
      }

      // never wipe existing items because the model returned nothing
      if (generated.length === 0) {
        return res.status(502).json({ message: "Generation returned nothing; existing items were kept" });
      }

      // merge against the LATEST saved data so edits made meanwhile survive
      const prefix = section === "questions" ? "q" : "f";
      const result = await commit(req, (d) => {
        const items = d[section] || [];
        const inScope = (i) => (section === "questions" && category ? i.category === category : true);

        // keep: everything out of scope + everything the user edited (original order kept)
        const kept = items.filter((i) => !inScope(i) || i.edited);
        const used = new Set(kept.map((i) => i.id));
        const fresh = generated.map((g) => ({ ...g, id: nextId(prefix, used), edited: false }));

        d[section] = [...kept, ...fresh];
        if (section === "questions") rebuildSchedule(d); // keep schedule ids valid
        return d[section];
      });

      if (!result) return res.status(404).json({ message: "Kit not found" });
      return res.json(result);
    } catch (err) {
      console.error("REGENERATE ERROR:", err.stack);
      return res.status(500).json({ message: "Regenerate failed", error: err.message });
    }
  })
);

/* ---------- error handler for this router ---------- */

router.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: "Something went wrong", error: err.message });
});

module.exports = router;
