import { describe, it, expect } from "vitest";
import { scoreLink } from "../services/retrieval/crawlSite.js";

const link = (url, text = "") => ({ url, text });

describe("scoreLink", () => {
  it("ranks an interview page above a generic about page", () => {
    expect(scoreLink(link("https://x.com/handbook/hiring/interviewing"))).toBeGreaterThan(
      scoreLink(link("https://x.com/about"))
    );
  });

  it("rejects login, privacy and edit/IDE links", () => {
    expect(scoreLink(link("https://x.com/login"))).toBe(-1);
    expect(scoreLink(link("https://x.com/privacy"))).toBe(-1);
    expect(scoreLink(link("https://gitlab.com/-/ide/project/a/b/edit/main/-/content/hiring/x.md"))).toBe(-1);
  });

  it("does not reject a company just because its domain contains login or cart", () => {
    expect(scoreLink(link("https://loginradius.com/careers"))).toBeGreaterThan(0);
    expect(scoreLink(link("https://cartwheel.com/careers"))).toBeGreaterThan(0);
  });
});
