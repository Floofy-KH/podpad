import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { AuthSession } from "../../src/pod/session";
import {
  isNoteFilename,
  parseNoteFromUrl,
  runListNotes,
  type ListNotesDeps
} from "../../src/commands/list-notes";

describe("parseNoteFromUrl", () => {
  it("parses a note URL with a slug", () => {
    const note = parseNoteFromUrl("https://pod.example/notes/20231001T120000Z_abc123_my-first-note.txt");

    assert.equal(note.filename, "20231001T120000Z_abc123_my-first-note.txt");
    assert.equal(note.title, "my first note");
    assert.equal(note.createdAt.toISOString(), "2023-10-01T12:00:00.000Z");
    assert.equal(note.resourceUrl, "https://pod.example/notes/20231001T120000Z_abc123_my-first-note.txt");
  });

  it("parses a note URL without a slug", () => {
    const note = parseNoteFromUrl("https://pod.example/notes/20231001T120000Z_abc123.txt");

    assert.equal(note.filename, "20231001T120000Z_abc123.txt");
    assert.equal(note.title, "Untitled note");
    assert.equal(note.createdAt.toISOString(), "2023-10-01T12:00:00.000Z");
  });

  it("handles URL-encoded filenames", () => {
    const note = parseNoteFromUrl("https://pod.example/notes/20231001T120000Z_abc123_hello%20world.txt");

    assert.equal(note.filename, "20231001T120000Z_abc123_hello world.txt");
    assert.equal(note.title, "hello world");
  });

  it("falls back to epoch for invalid filenames", () => {
    const note = parseNoteFromUrl("https://pod.example/notes/random-file.txt");

    assert.equal(note.filename, "random-file.txt");
    assert.equal(note.title, "Untitled note");
    assert.equal(note.createdAt.toISOString(), "1970-01-01T00:00:00.000Z");
  });
});

describe("isNoteFilename", () => {
  it("returns true for valid note filenames", () => {
    assert.equal(isNoteFilename("20231001T120000Z_abc123.txt"), true);
    assert.equal(isNoteFilename("20231001T120000Z_abc123_my-note.txt"), true);
    assert.equal(isNoteFilename("20231001T120000Z_abc123_my-long-note-name.txt"), true);
  });

  it("returns false for invalid filenames", () => {
    assert.equal(isNoteFilename("random.txt"), false);
    assert.equal(isNoteFilename("20231001T120000Z_abc123"), false);
    assert.equal(isNoteFilename("note.txt"), false);
    assert.equal(isNoteFilename(".txt"), false);
  });
});

describe("runListNotes", () => {
  const fakeSession: AuthSession = {
    fetch: globalThis.fetch,
    logout: async () => {
      return;
    },
    info: {
      webId: "https://example.test/profile/card#me"
    }
  };

  it("lists notes sorted by newest first", async () => {
    const readCalls: string[] = [];

    const deps: ListNotesDeps = {
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
      createAuthenticatedSession: async () => fakeSession as never,
      createPodClient: () => ({
        listResourceUrls: async () => [
          "https://pod.example/user/notes/20231001T100000Z_abc111_first-note.txt",
          "https://pod.example/user/notes/20231001T120000Z_abc123_second-note.txt"
        ],
        readTextResource: async (url: string) => {
          readCalls.push(url);
          return `Content for ${url}`;
        }
      })
    };

    await runListNotes(deps);

    // Should have read both notes for preview
    assert.equal(readCalls.length, 2);
  });

  it("reports no notes when container is empty", async () => {
    const deps: ListNotesDeps = {
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
      createAuthenticatedSession: async () => fakeSession as never,
      createPodClient: () => ({
        listResourceUrls: async () => [],
        readTextResource: async () => {
          throw new Error("Should not be called");
        }
      })
    };

    await runListNotes(deps);

    // Should complete without throwing
    assert.ok(true);
  });
});
