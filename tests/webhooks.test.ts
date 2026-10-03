import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseMetaComments, verifyMetaSignature } from "@/lib/webhooks";

describe("verifyMetaSignature", () => {
  const body = JSON.stringify({ object: "page" });
  const sig = (secret: string) => "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a signature from any configured secret", () => {
    expect(verifyMetaSignature(body, sig("ig-secret"), ["fb-secret", "ig-secret"])).toBe(true);
  });

  it("rejects bad or missing signatures", () => {
    expect(verifyMetaSignature(body, sig("other"), ["fb-secret"])).toBe(false);
    expect(verifyMetaSignature(body, null, ["fb-secret"])).toBe(false);
    expect(verifyMetaSignature(body, sig("x"), [undefined])).toBe(false);
  });
});

describe("parseMetaComments", () => {
  it("reads Instagram comment webhooks", () => {
    const out = parseMetaComments({
      object: "instagram",
      entry: [
        {
          id: "17841400000000000",
          changes: [
            {
              field: "comments",
              value: { id: "c1", text: "LINK please", from: { id: "u1", username: "sam" }, media: { id: "m1" } },
            },
          ],
        },
      ],
    });
    expect(out).toEqual([
      {
        platform: "instagram",
        accountExternalId: "17841400000000000",
        commentId: "c1",
        postExternalId: "m1",
        authorId: "u1",
        authorName: "sam",
        text: "LINK please",
      },
    ]);
  });

  it("reads new Facebook Page comments and skips edits and other items", () => {
    const out = parseMetaComments({
      object: "page",
      entry: [
        {
          id: "page1",
          changes: [
            { field: "feed", value: { item: "comment", verb: "add", comment_id: "c2", post_id: "page1_p9", message: "guide", from: { id: "u2", name: "Ana" } } },
            { field: "feed", value: { item: "comment", verb: "edited", comment_id: "c3", message: "x" } },
            { field: "feed", value: { item: "reaction", verb: "add" } },
          ],
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ platform: "facebook", commentId: "c2", postExternalId: "page1_p9", authorName: "Ana" });
  });
});
