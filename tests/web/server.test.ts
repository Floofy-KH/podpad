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
    createAuthenticatedSession: async () => {
      throw new Error("Demo mode must not create a Solid session.");
    },
    createPodClient: () => {
      throw new Error("Demo mode must not create a Pod client.");
    },
    generateNoteFilename: () => "20261023T000000Z_abcdef_phone-test.txt",
    demoNotes
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
      listResourceUrls: async () => (writtenUrl ? [noteUrl] : [])
    };
    const liveDeps: WebServerDeps = {
      mode: "solid",
      loadConfig: () => config,
      createAuthenticatedSession: async () => session,
      createPodClient: () => client,
      generateNoteFilename: () => "20261022T120000Z_abcdef_phone-test.txt",
      demoNotes: []
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

      const response = await fetch(`${baseUrl}/api/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: baseUrl
        },
        body: JSON.stringify({ title: "Phone test", content: "Saved on the server." })
      });
      const result = (await response.json()) as {
        notes: Array<{ title: string }>;
      };

      assert.equal(response.status, 201);
      assert.equal(writtenUrl, `${config.pod.notesContainerUrl}20261022T120000Z_abcdef_phone-test.txt`);
      assert.equal(result.notes[0]?.title, "phone test");

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
