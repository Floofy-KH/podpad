import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { AuthSession } from "../../src/pod/session";
import {
  assertNonEmptyNoteContent,
  parseTitle,
  runAddNote,
  type AddNoteDeps
} from "../../src/commands/add-note";

describe("parseTitle", () => {
  it("extracts --title value", () => {
    const argv = ["node", "src/cli.ts", "add-note", "--title", "My Note"];

    assert.equal(parseTitle(argv), "My Note");
  });

  it("extracts -t value", () => {
    const argv = ["node", "src/cli.ts", "add-note", "-t", "Short Flag"];

    assert.equal(parseTitle(argv), "Short Flag");
  });

  it("returns undefined when title flag is not present", () => {
    const argv = ["node", "src/cli.ts", "add-note"];

    assert.equal(parseTitle(argv), undefined);
  });
});

describe("runAddNote", () => {
  it("rejects empty content before any session is created", async () => {
    let createSessionCalled = false;

    const fakeSession: AuthSession = {
      fetch: globalThis.fetch,
      logout: async () => {
        return;
      },
      info: {
        webId: "https://example.test/profile/card#me"
      }
    };

    const deps: AddNoteDeps = {
      readStdin: async () => "   \n\t",
      loadConfig: () => ({
        auth: {
          oidcIssuer: "https://issuer.test",
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token",
          tokenType: "DPoP",
          maxRetries: 0,
          retryDelayMs: 0
        },
        pod: {
          podBaseUrl: "https://pod.example/user/",
          notesContainerUrl: "https://pod.example/user/notes/",
          summariesContainerUrl: "https://pod.example/user/summaries/"
        }
      }),
      createAuthenticatedSession: async () => {
        createSessionCalled = true;
        return fakeSession as never;
      },
      createPodClient: () => ({
        writeTextResource: async () => {
          return;
        }
      }),
      generateNoteFilename: () => "unused.txt"
    };

    await assert.rejects(
      () => runAddNote(["node", "src/cli.ts", "add-note"], deps),
      (error: unknown) => {
        assert.ok(error instanceof Error, "expected Error instance");
        assert.match(error.message, /Note content is empty/);
        return true;
      }
    );

    assert.equal(createSessionCalled, false);
  });
});

describe("assertNonEmptyNoteContent", () => {
  it("throws for empty content", () => {
    assert.throws(
      () => assertNonEmptyNoteContent("\n   \t"),
      (error: unknown) => {
        assert.ok(error instanceof Error, "expected Error instance");
        assert.match(error.message, /Note content is empty/);
        return true;
      }
    );
  });
});
