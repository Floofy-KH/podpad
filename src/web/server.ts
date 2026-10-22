import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createAuthenticatedSession } from "../pod/auth";
import { PodClient } from "../pod/client";
import type { AuthSession } from "../pod/session";
import { loadConfigFromEnv, type SolidConfig } from "../utils/config";
import { generateNoteFilename } from "../utils/note-name";

const MAX_REQUEST_BYTES = 32_000;
const MAX_NOTES = 25;

interface WebNote {
  title: string;
  createdAt: string;
}

interface DemoNote extends WebNote {
  content: string;
}

type WebMode = "demo" | "solid";

type WebPodClient = Pick<
  PodClient,
  "assertReadable" | "ensureContainer" | "listResourceUrls" | "writeTextResource"
>;

export interface WebServerDeps {
  mode: WebMode;
  loadConfig: () => SolidConfig;
  createAuthenticatedSession: typeof createAuthenticatedSession;
  createPodClient: (session: AuthSession) => WebPodClient;
  generateNoteFilename: typeof generateNoteFilename;
  demoNotes: DemoNote[];
}

class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f5f4ef">
  <title>PodPad</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; background: #f5f4ef; color: #192b27; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px 16px 48px; }
    main { max-width: 620px; margin: 0 auto; }
    h1 { margin: 0; font-size: 2rem; }
    h2 { margin: 28px 0 12px; font-size: 1.2rem; }
    .subtitle { margin: 4px 0 20px; color: #52615b; }
    .card { padding: 18px; border: 1px solid #d9ded7; border-radius: 16px; background: #fff; }
    .status { display: flex; align-items: center; gap: 10px; }
    .dot { width: 11px; height: 11px; flex: 0 0 auto; border-radius: 50%; background: #a17620; }
    .dot.connected { background: #22845e; }
    .dot.error { background: #b33b35; }
    .mode { margin-left: auto; color: #52615b; font-size: .82rem; }
    label { display: block; margin: 14px 0 6px; font-weight: 650; }
    input, textarea { width: 100%; padding: 12px; border: 1px solid #aab7b0; border-radius: 10px; font: inherit; }
    textarea { min-height: 140px; resize: vertical; }
    button { width: 100%; margin-top: 14px; padding: 13px; border: 0; border-radius: 10px; background: #176b50; color: white; font: inherit; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: .6; cursor: wait; }
    .message { min-height: 1.5em; margin: 10px 0 0; color: #52615b; }
    .note { padding: 14px 0; border-bottom: 1px solid #e3e7e2; }
    .note:last-child { border-bottom: 0; padding-bottom: 0; }
    .note-title { margin: 0 0 4px; font-weight: 700; overflow-wrap: anywhere; }
    .note-date { color: #64716b; font-size: .86rem; }
    .empty { color: #64716b; }
    .demo-hint { margin: 16px 2px 0; color: #52615b; font-size: .88rem; }
    @media (min-width: 600px) { body { padding-top: 40px; } .card { padding: 22px; } }
  </style>
</head>
<body>
  <main>
    <h1>PodPad</h1>
    <p class="subtitle">A little notes space for your Solid Pod.</p>
    <section class="card" aria-labelledby="connection-heading">
      <h2 id="connection-heading" style="margin:0 0 12px">Pod connection</h2>
      <div class="status" role="status" aria-live="polite">
        <span class="dot" id="status-dot"></span>
        <span id="status-text">Checking connection…</span>
        <span class="mode" id="mode"></span>
      </div>
    </section>
    <section aria-labelledby="new-note-heading">
      <h2 id="new-note-heading">New note</h2>
      <form class="card" id="note-form">
        <label for="title">Title <span aria-hidden="true">(optional)</span></label>
        <input id="title" name="title" maxlength="100" autocomplete="off">
        <label for="content">Your note</label>
        <textarea id="content" name="content" maxlength="5000" required></textarea>
        <button id="save-button" type="submit">Save note</button>
        <p class="message" id="message" role="status" aria-live="polite"></p>
      </form>
    </section>
    <section aria-labelledby="recent-heading">
      <h2 id="recent-heading">Recent notes</h2>
      <div class="card" id="notes" aria-live="polite"><p class="empty">Loading notes…</p></div>
    </section>
    <p class="demo-hint" id="demo-hint" hidden>Demo mode keeps notes in memory; they disappear when the server restarts.</p>
  </main>
  <script>
    const statusText = document.querySelector("#status-text");
    const statusDot = document.querySelector("#status-dot");
    const noteList = document.querySelector("#notes");
    const message = document.querySelector("#message");
    const saveButton = document.querySelector("#save-button");
    const form = document.querySelector("#note-form");

    async function request(path, options) {
      const response = await fetch(path, options);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Request failed.");
      return result;
    }

    function renderNotes(notes) {
      noteList.replaceChildren();
      if (notes.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "No notes yet. Add one above to get started.";
        noteList.append(empty);
        return;
      }
      for (const note of notes) {
        const item = document.createElement("article");
        item.className = "note";
        const title = document.createElement("p");
        title.className = "note-title";
        title.textContent = note.title;
        const date = document.createElement("time");
        date.className = "note-date";
        date.textContent = new Date(note.createdAt).toLocaleString();
        item.append(title, date);
        noteList.append(item);
      }
    }

    async function refresh() {
      try {
        const [status, notes] = await Promise.all([
          request("/api/status"),
          request("/api/notes")
        ]);
        statusText.textContent = status.message;
        statusDot.className = "dot connected";
        document.querySelector("#mode").textContent = status.mode === "demo" ? "Demo" : "Solid Pod";
        document.querySelector("#demo-hint").hidden = status.mode !== "demo";
        renderNotes(notes.notes);
      } catch (error) {
        statusText.textContent = error.message;
        statusDot.className = "dot error";
        noteList.replaceChildren();
        const unavailable = document.createElement("p");
        unavailable.className = "empty";
        unavailable.textContent = "Could not load notes. Check the connection and try again.";
        noteList.append(unavailable);
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      message.textContent = "";
      saveButton.disabled = true;
      try {
        const result = await request("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: document.querySelector("#title").value,
            content: document.querySelector("#content").value
          })
        });
        form.reset();
        message.textContent = "Note saved.";
        renderNotes(result.notes);
      } catch (error) {
        message.textContent = error.message;
      } finally {
        saveButton.disabled = false;
      }
    });

    refresh();
  </script>
</body>
</html>`;

export function createWebServer(deps: WebServerDeps): Server {
  return createServer((request, response) => {
    void handleRequest(request, response, deps).catch((error: unknown) => {
      if (!response.headersSent) {
        const status = error instanceof RequestError ? error.status : 500;
        const message =
          error instanceof RequestError ? error.message : "The server could not complete that request.";
        sendJson(response, status, { error: message });
      }
    });
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  deps: WebServerDeps
): Promise<void> {
  const requestUrl = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && requestUrl.pathname === "/") {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer"
    });
    response.end(page);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/status") {
    if (deps.mode === "demo") {
      sendJson(response, 200, { mode: "demo", message: "Demo is ready" });
      return;
    }

    await withPodClient(deps, async (client, config) => {
      await client.assertReadable(config.pod.podBaseUrl);
      sendJson(response, 200, { mode: "solid", message: "Connected to your Solid Pod" });
    });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/notes") {
    const notes =
      deps.mode === "demo"
        ? deps.demoNotes.slice(0, MAX_NOTES).map(({ title, createdAt }) => ({ title, createdAt }))
        : await listPodNotes(deps);
    sendJson(response, 200, { notes });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/notes") {
    assertSameOrigin(request);
    const body = await readJsonBody(request);
    const { title, content } = validateNote(body);

    if (deps.mode === "demo") {
      deps.demoNotes.unshift({
        title: title || "Untitled note",
        content,
        createdAt: new Date().toISOString()
      });
      const notes = deps.demoNotes
        .slice(0, MAX_NOTES)
        .map(({ title: noteTitle, createdAt }) => ({ title: noteTitle, createdAt }));
      sendJson(response, 201, { notes });
      return;
    }

    const notes = await withPodClient(deps, async (client, config) => {
      await client.ensureContainer(config.pod.notesContainerUrl);
      const filename = deps.generateNoteFilename(title);
      await client.writeTextResource(`${config.pod.notesContainerUrl}${filename}`, content);
      const urls = await client.listResourceUrls(config.pod.notesContainerUrl);
      return urls
        .filter((url) => url.toLowerCase().endsWith(".txt"))
        .sort((left, right) => right.localeCompare(left))
        .slice(0, MAX_NOTES)
        .map(noteFromUrl);
    });
    sendJson(response, 201, { notes });
    return;
  }

  sendJson(response, 404, { error: "Not found." });
}

async function listPodNotes(deps: WebServerDeps): Promise<WebNote[]> {
  return withPodClient(deps, async (client, config) => {
    const urls = await client.listResourceUrls(config.pod.notesContainerUrl);
    return urls
      .filter((url) => url.toLowerCase().endsWith(".txt"))
      .sort((left, right) => right.localeCompare(left))
      .slice(0, MAX_NOTES)
      .map(noteFromUrl);
  });
}

function noteFromUrl(resourceUrl: string): WebNote {
  const encodedFilename = new URL(resourceUrl).pathname.split("/").pop() ?? "";
  let filename = encodedFilename;
  try {
    filename = decodeURIComponent(encodedFilename);
  } catch {
    // Keep the encoded filename if the Pod returns invalid percent-encoding.
  }
  const match = /^(\d{8}T\d{6}Z)_[a-f0-9]{6}(?:_(.*))?\.txt$/i.exec(filename);
  const timestamp = match?.[1];
  let createdAt = new Date(0).toISOString();
  if (timestamp) {
    const date = new Date(
      `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}Z`
    );
    if (!Number.isNaN(date.valueOf())) {
      createdAt = date.toISOString();
    }
  }
  const slug = match?.[2];
  return {
    title: slug ? slug.replace(/-/g, " ") : "Untitled note",
    createdAt
  };
}

async function withPodClient<T>(
  deps: WebServerDeps,
  operation: (client: WebPodClient, config: SolidConfig) => Promise<T>
): Promise<T> {
  const config = deps.loadConfig();
  const session = await deps.createAuthenticatedSession(config.auth);
  try {
    return await operation(deps.createPodClient(session), config);
  } finally {
    await session.logout().catch(() => undefined);
  }
}

function assertSameOrigin(request: IncomingMessage): void {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) {
    throw new RequestError("A same-origin browser request is required.", 403);
  }
  try {
    const parsedOrigin = new URL(origin);
    if (
      (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") ||
      parsedOrigin.host !== host
    ) {
      throw new RequestError("Cross-origin requests are not allowed.", 403);
    }
  } catch (error) {
    if (error instanceof RequestError) {
      throw error;
    }
    throw new RequestError("Invalid request origin.", 403);
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new RequestError("Send note data as JSON.", 415);
  }

  const contentLength = Number(request.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    request.resume();
    throw new RequestError("The request is too large.", 413);
  }

  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_REQUEST_BYTES) {
      request.resume();
      throw new RequestError("The request is too large.", 413);
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new RequestError("The request body must be valid JSON.", 400);
  }
}

function validateNote(value: unknown): { title: string; content: string } {
  if (typeof value !== "object" || value === null) {
    throw new RequestError("A note title and content are required.", 400);
  }
  const { title, content } = value as { title?: unknown; content?: unknown };
  if (typeof title !== "string" || typeof content !== "string") {
    throw new RequestError("A note title and content are required.", 400);
  }
  if (title.length > 100 || content.length > 5000) {
    throw new RequestError("Title and note must be within the displayed length limits.", 400);
  }
  if (content.trim().length === 0) {
    throw new RequestError("Note content cannot be empty.", 400);
  }
  return { title: title.trim(), content };
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(value));
}

function webModeFromEnv(): WebMode {
  const mode = process.env.PODPAD_WEB_MODE ?? "demo";
  if (mode !== "demo" && mode !== "solid") {
    throw new Error("PODPAD_WEB_MODE must be either demo or solid.");
  }
  return mode;
}

function start(): void {
  const mode = webModeFromEnv();
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  const host = process.env.CODESPACES === "true" ? "0.0.0.0" : "127.0.0.1";
  const server = createWebServer({
    mode,
    loadConfig: loadConfigFromEnv,
    createAuthenticatedSession,
    createPodClient: (session) => new PodClient(session),
    generateNoteFilename,
    demoNotes: []
  });
  server.listen(port, host, () => {
    console.log(`PodPad web app (${mode}) listening on http://${host}:${port}`);
  });
}

if (require.main === module) {
  start();
}
