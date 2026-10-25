import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import {
  createWebServer,
  type WebServerDeps
} from "../../src/web/server";
import type { AuthSession } from "../../src/pod/session";
import type { SolidConfig } from "../../src/utils/config";
import type { Summarizer } from "../../src/agent/summarizer";

const mockSummarizer: Summarizer = {
  summarize: async () => "Mocked LLM summary."
};

const config: SolidConfig = {
  auth: {
    oidcIssuer: "https://issuer.example",
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
    tokenType: "DPoP",
    maxRetries: 0,
    retryDelayMs: 0
  },
  pod: {
    podBaseUrl: "https://pod.example/alex/",
    notesContainerUrl: "https://pod.example/alex/notes/",
    summariesContainerUrl: "https://pod.example/alex/summaries/"
  }
};

describe("phone web server", () => {
  const demoNotes: WebServerDeps["demoNotes"] = [];
  const deps: WebServerDeps = {
    mode: "demo",
    loadConfig: () => config,
    loadSummarizerConfig: () => ({ provider: "mock" }),
    createAuthenticatedSession: async () => {
      throw new Error("Demo mode must not create a Solid session.");
    },
    createPodClient: () => {
      throw new Error("Demo mode must not create a Pod client.");
    },
    createSummarizer: () => mockSummarizer,
    generateNoteFilename: () => "20261023T000000Z_abcdef_phone-test.txt",
    demoNotes,
    demoSummaries: []
  };
  const server = createWebServer(deps);
  let baseUrl: string;

  before(async () => {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    server.close();
    await once(server, "close");
  });

  it("serves a phone-friendly page without embedding Solid configuration", async () => {
    const response = await fetch(baseUrl);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /name="viewport"/);
    assert.match(html, /New note/);
    assert.match(html, /Recent notes/);
    assert.match(html, /href="\/app\.css"/);
    assert.match(html, /src="\/app\.js"/);
    assert.doesNotMatch(html, /<style|<script>/);
    assert.doesNotMatch(html, /SOLID_CLIENT_SECRET|refresh-token/);
    const policy = response.headers.get("content-security-policy");
    assert.equal(policy?.includes("frame-ancestors 'none'"), true);
    assert.equal(policy?.includes("script-src 'self'"), true);
    assert.equal(policy?.includes("unsafe-inline"), false);
  });

  it("serves the page styles and browser behavior as separate assets", async () => {
    const [styles, script] = await Promise.all([
      fetch(`${baseUrl}/app.css`),
      fetch(`${baseUrl}/app.js`)
    ]);

    assert.equal(styles.status, 200);
    assert.match(styles.headers.get("content-type") ?? "", /text\/css/);
    assert.match(await styles.text(), /\.note-workspace/);
    assert.equal(script.status, 200);
    assert.match(script.headers.get("content-type") ?? "", /javascript/);
    assert.match(await script.text(), /function renderNotes/);
  });

  it("supports demo status and listing without Solid credentials", async () => {
    const [status, notes] = await Promise.all([
      fetch(`${baseUrl}/api/status`),
      fetch(`${baseUrl}/api/notes`)
    ]);

    assert.deepEqual(await status.json(), { mode: "demo", message: "Demo is ready" });
    assert.deepEqual(await notes.json(), { notes: [] });
  });

  it("validates and stores a demo note in memory", async () => {
    const response = await fetch(`${baseUrl}/api/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: baseUrl
      },
      body: JSON.stringify({ title: "Phone test", content: "A note from the phone." })
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      notes: [{
        id: "20261023T000000Z_abcdef_phone-test.txt",
        title: "Phone test",
        createdAt: demoNotes[0]?.createdAt
      }]
    });
    assert.equal(demoNotes.length, 1);

    const preview = await fetch(`${baseUrl}/api/notes/${encodeURIComponent(demoNotes[0]!.id)}`);
    assert.equal(preview.status, 200);
    assert.deepEqual(await preview.json(), { content: "A note from the phone." });
  });

  it("rejects invalid and unknown note preview identifiers", async () => {
    const invalid = await fetch(`${baseUrl}/api/notes/not-a-note`);
    const missing = await fetch(`${baseUrl}/api/notes/20261023T000000Z_abcdef_missing.txt`);

    assert.equal(invalid.status, 400);
    assert.equal(missing.status, 404);
  });

  it("rejects cross-origin and empty note submissions", async () => {
    const crossOrigin = await fetch(`${baseUrl}/api/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example"
      },
      body: JSON.stringify({ title: "", content: "Do not save" })
    });
    const empty = await fetch(`${baseUrl}/api/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: baseUrl
      },
      body: JSON.stringify({ title: "", content: "  " })
    });

    assert.equal(crossOrigin.status, 403);
    assert.equal(empty.status, 400);
    assert.equal(demoNotes.length, 1);
  });

  it("rejects requests with an unsupported content type", async () => {
    const response = await fetch(`${baseUrl}/api/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Origin: baseUrl
      },
      body: "not JSON"
    });

    assert.equal(response.status, 415);
  });
});

describe("Solid-backed phone web server", () => {
  it("uses the server-side session for status, writing, and listing", async () => {
    let readableUrl = "";
    let writtenUrl = "";
    let readUrl = "";
    let loggedOut = false;
    const noteUrl = "https://pod.example/alex/notes/20261022T120000Z_abcdef_phone-test.txt";
    const unrelatedNoteUrl = "https://pod.example/alex/notes/shopping.txt";
    const session: AuthSession = {
      fetch: globalThis.fetch,
      logout: async () => {
        loggedOut = true;
      },
      info: { webId: "https://pod.example/alex/profile/card#me" }
    };
    const client = {
      assertReadable: async (url: string) => {
        readableUrl = url;
      },
      ensureContainer: async () => undefined,
      writeTextResource: async (url: string) => {
        writtenUrl = url;
      },
      readTextResource: async (url: string) => {
        readUrl = url;
        return "Saved on the server.";
      },
      listResourceUrls: async () => [noteUrl, unrelatedNoteUrl]
    };
    const liveDeps: WebServerDeps = {
      mode: "solid",
      loadConfig: () => config,
      loadSummarizerConfig: () => ({ provider: "mock" }),
      createAuthenticatedSession: async () => session,
      createPodClient: () => client,
      createSummarizer: () => mockSummarizer,
      generateNoteFilename: () => "20261022T120000Z_abcdef_phone-test.txt",
      demoNotes: [],
      demoSummaries: []
    };
    const server = createWebServer(liveDeps);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const status = await fetch(`${baseUrl}/api/status`);
      assert.equal(status.status, 200);
      assert.equal(readableUrl, config.pod.podBaseUrl);

      const listed = await fetch(`${baseUrl}/api/notes`);
      const listedResult = (await listed.json()) as {
        notes: Array<{ id: string }>;
      };
      assert.equal(listed.status, 200);
      assert.deepEqual(listedResult.notes.map(({ id }) => id), ["20261022T120000Z_abcdef_phone-test.txt"]);

      const response = await fetch(`${baseUrl}/api/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: baseUrl
        },
        body: JSON.stringify({ title: "Phone test", content: "Saved on the server." })
      });
      const result = (await response.json()) as {
        notes: Array<{ id: string; title: string }>;
      };

      assert.equal(response.status, 201);
      assert.equal(writtenUrl, `${config.pod.notesContainerUrl}20261022T120000Z_abcdef_phone-test.txt`);
      assert.equal(result.notes[0]?.title, "phone test");
      assert.deepEqual(result.notes.map(({ id }) => id), ["20261022T120000Z_abcdef_phone-test.txt"]);

      const preview = await fetch(`${baseUrl}/api/notes/20261022T120000Z_abcdef_phone-test.txt`);
      assert.equal(preview.status, 200);
      assert.deepEqual(await preview.json(), { content: "Saved on the server." });
      assert.equal(readUrl, noteUrl);
      assert.equal(loggedOut, true);
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});

describe("summary web server", () => {
  const deps: WebServerDeps = {
    mode: "demo",
    loadConfig: () => config,
    loadSummarizerConfig: () => ({ provider: "mock" }),
    createAuthenticatedSession: async () => {
      throw new Error("Demo mode must not create a Solid session.");
    },
    createPodClient: () => {
      throw new Error("Demo mode must not create a Pod client.");
    },
    createSummarizer: () => mockSummarizer,
    generateNoteFilename: () => "20261024T120000Z_abcdef_summary.txt",
    demoNotes: [],
    demoSummaries: []
  };
  const server = createWebServer(deps);
  let baseUrl: string;

  before(async () => {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    server.close();
    await once(server, "close");
  });

  it("generates, lists, and reads summaries in demo mode", async () => {
    deps.demoNotes.unshift({
      id: "20261024T110000Z_abcdef_demo-note.txt",
      title: "Demo source note",
      content: "A note used for the demo summary.",
      createdAt: "2026-10-24T11:00:00.000Z"
    });

    const post = await fetch(`${baseUrl}/api/summaries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: baseUrl
      },
      body: JSON.stringify({})
    });
    assert.equal(post.status, 201);
    const postResult = (await post.json()) as { summaries: Array<{ id: string; title: string }> };
    assert.equal(postResult.summaries.length, 1);
    assert.equal(postResult.summaries[0]?.id, "20261024T120000Z_abcdef_summary.txt");

    const list = await fetch(`${baseUrl}/api/summaries`);
    assert.equal(list.status, 200);
    const listResult = (await list.json()) as { summaries: Array<{ id: string }> };
    assert.deepEqual(listResult.summaries.map(({ id }) => id), ["20261024T120000Z_abcdef_summary.txt"]);

    const preview = await fetch(`${baseUrl}/api/summaries/${encodeURIComponent("20261024T120000Z_abcdef_summary.txt")}`);
    assert.equal(preview.status, 200);
    const previewResult = (await preview.json()) as { content: string };
    assert.ok(previewResult.content.includes("Mocked LLM summary."));
  });

  it("rejects invalid summary generation requests", async () => {
    const post = await fetch(`${baseUrl}/api/summaries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: baseUrl
      },
      body: JSON.stringify({ noteLimit: -1 })
    });

    assert.equal(post.status, 400);
  });
});

describe("Solid-backed summary web server", () => {
  it("generates, lists, and reads summaries from the Pod", async () => {
    const noteUrl = "https://pod.example/alex/notes/20261022T120000Z_abcdef_phone-test.txt";
    const summaryUrl = "https://pod.example/alex/summaries/20261022T120000Z_abcdef_summary.txt";
    const session: AuthSession = {
      fetch: globalThis.fetch,
      logout: async () => undefined,
      info: { webId: "https://pod.example/alex/profile/card#me" }
    };
    const client = {
      assertReadable: async () => undefined,
      ensureContainer: async () => undefined,
      writeTextResource: async () => undefined,
      readTextResource: async (url: string) => {
        if (url === noteUrl) return "Saved on the server.";
        if (url === summaryUrl) return "Mocked LLM summary.";
        return "Mocked note content.";
      },
      listResourceUrls: async (containerUrl: string) => {
        if (containerUrl.includes("/notes/")) {
          return [noteUrl];
        }
        if (containerUrl.includes("/summaries/")) {
          return [summaryUrl];
        }
        return [];
      }
    };
    const liveDeps: WebServerDeps = {
      mode: "solid",
      loadConfig: () => config,
      loadSummarizerConfig: () => ({ provider: "mock" }),
      createAuthenticatedSession: async () => session,
      createPodClient: () => client,
      createSummarizer: () => mockSummarizer,
      generateNoteFilename: () => "20261022T120000Z_abcdef_summary.txt",
      demoNotes: [],
      demoSummaries: []
    };
    const server = createWebServer(liveDeps);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const post = await fetch(`${baseUrl}/api/summaries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: baseUrl
        },
        body: JSON.stringify({ noteLimit: 5 })
      });
      assert.equal(post.status, 201);
      const postResult = (await post.json()) as { summaries: Array<{ id: string }> };
      assert.deepEqual(postResult.summaries.map(({ id }) => id), ["20261022T120000Z_abcdef_summary.txt"]);

      const list = await fetch(`${baseUrl}/api/summaries`);
      assert.equal(list.status, 200);
      const listResult = (await list.json()) as { summaries: Array<{ id: string }> };
      assert.deepEqual(listResult.summaries.map(({ id }) => id), ["20261022T120000Z_abcdef_summary.txt"]);

      const preview = await fetch(`${baseUrl}/api/summaries/${encodeURIComponent("20261022T120000Z_abcdef_summary.txt")}`);
      assert.equal(preview.status, 200);
      const previewResult = (await preview.json()) as { content: string };
      assert.equal(previewResult.content, "Mocked LLM summary.");
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});
