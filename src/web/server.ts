import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createAuthenticatedSession } from "../pod/auth";
import { PodClient } from "../pod/client";
import type { AuthSession } from "../pod/session";
import { ConfigError, loadConfigFromEnv, type SolidConfig } from "../utils/config";
import { generateNoteFilename } from "../utils/note-name";
import { createSummarizer, type NoteInput, type Summarizer } from "../agent/summarizer";
import { loadSummarizerConfigFromEnv, type SummarizerConfig } from "../agent/config";
import { buildSummaryText } from "../commands/summarize-notes";

const MAX_REQUEST_BYTES = 32_000;
const MAX_NOTES = 25;

interface WebNote {
  id: string;
  title: string;
  createdAt: string;
}

interface DemoNote extends WebNote {
  content: string;
}

interface WebSummary {
  id: string;
  title: string;
  createdAt: string;
}

interface DemoSummary extends WebSummary {
  content: string;
}

type WebMode = "demo" | "solid";

type WebPodClient = Pick<
  PodClient,
  "assertReadable" | "ensureContainer" | "listResourceUrls" | "readTextResource" | "writeTextResource"
>;

export interface WebServerDeps {
  mode: WebMode;
  loadConfig: () => SolidConfig;
  loadSummarizerConfig: () => SummarizerConfig;
  createAuthenticatedSession: typeof createAuthenticatedSession;
  createPodClient: (session: AuthSession) => WebPodClient;
  createSummarizer: (config: SummarizerConfig) => Summarizer;
  generateNoteFilename: typeof generateNoteFilename;
  demoNotes: DemoNote[];
  demoSummaries: DemoSummary[];
}

class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

const publicDirectory = join(__dirname, "public");
const webAssets: Record<string, { content: Buffer; contentType: string }> = {
  "/": {
    content: readFileSync(join(publicDirectory, "index.html")),
    contentType: "text/html; charset=utf-8"
  },
  "/app.css": {
    content: readFileSync(join(publicDirectory, "app.css")),
    contentType: "text/css; charset=utf-8"
  },
  "/app.js": {
    content: readFileSync(join(publicDirectory, "app.js")),
    contentType: "text/javascript; charset=utf-8"
  }
};

export function createWebServer(deps: WebServerDeps): Server {
  return createServer((request, response) => {
    void handleRequest(request, response, deps).catch((error: unknown) => {
      const status = error instanceof RequestError ? error.status : 500;
      const message = error instanceof RequestError ? error.message : "The server could not complete that request.";
      // eslint-disable-next-line no-console
      console.error(`[${request.method} ${request.url}] ${status}: ${message}`, error);
      if (!response.headersSent) {
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

  const asset = request.method === "GET" ? webAssets[requestUrl.pathname] : undefined;
  if (asset) {
    response.writeHead(200, {
      "Content-Type": asset.contentType,
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer"
    });
    response.end(asset.content);
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
        ? deps.demoNotes.slice(0, MAX_NOTES).map(({ id, title, createdAt }) => ({ id, title, createdAt }))
        : await listPodNotes(deps);
    sendJson(response, 200, { notes });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname.startsWith("/api/notes/")) {
    let id: string;
    try {
      id = decodeURIComponent(requestUrl.pathname.slice("/api/notes/".length));
    } catch {
      throw new RequestError("Invalid note identifier.", 400);
    }
    if (!isNoteFilename(id)) {
      throw new RequestError("Invalid note identifier.", 400);
    }
    const content = await readNoteContent(deps, id);
    sendJson(response, 200, { content });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/notes") {
    assertSameOrigin(request);
    const body = await readJsonBody(request);
    const { title, content } = validateNote(body);

    if (deps.mode === "demo") {
      deps.demoNotes.unshift({
        id: deps.generateNoteFilename(title),
        title: title || "Untitled note",
        content,
        createdAt: new Date().toISOString()
      });
      const notes = deps.demoNotes
        .slice(0, MAX_NOTES)
        .map(({ id, title: noteTitle, createdAt }) => ({ id, title: noteTitle, createdAt }));
      sendJson(response, 201, { notes });
      return;
    }

    const notes = await withPodClient(deps, async (client, config) => {
      await client.ensureContainer(config.pod.notesContainerUrl);
      const filename = deps.generateNoteFilename(title);
      await client.writeTextResource(`${config.pod.notesContainerUrl}${filename}`, content);
      const urls = await client.listResourceUrls(config.pod.notesContainerUrl);
      return urls
        .filter(isPreviewableNoteUrl)
        .sort((left, right) => right.localeCompare(left))
        .slice(0, MAX_NOTES)
        .map(noteFromUrl);
    });
    sendJson(response, 201, { notes });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/summaries") {
    const summaries =
      deps.mode === "demo"
        ? deps.demoSummaries.slice(0, MAX_NOTES).map(toWebSummary)
        : await listPodSummaries(deps);
    sendJson(response, 200, { summaries });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname.startsWith("/api/summaries/")) {
    let id: string;
    try {
      id = decodeURIComponent(requestUrl.pathname.slice("/api/summaries/".length));
    } catch {
      throw new RequestError("Invalid summary identifier.", 400);
    }
    if (!isSummaryFilename(id)) {
      throw new RequestError("Invalid summary identifier.", 400);
    }
    const content = await readSummaryContent(deps, id);
    sendJson(response, 200, { content });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/summaries") {
    assertSameOrigin(request);
    const body = await readJsonBody(request);
    const { noteLimit } = validateSummariesBody(body);
    const summaries = await generateSummary(deps, noteLimit);
    sendJson(response, 201, { summaries });
    return;
  }

  sendJson(response, 404, { error: "Not found." });
}

async function listPodNotes(deps: WebServerDeps): Promise<WebNote[]> {
  return withPodClient(deps, async (client, config) => {
    await client.ensureContainer(config.pod.notesContainerUrl);
    const urls = await client.listResourceUrls(config.pod.notesContainerUrl);
    return urls
      .filter(isPreviewableNoteUrl)
      .sort((left, right) => right.localeCompare(left))
      .slice(0, MAX_NOTES)
      .map(noteFromUrl);
  });
}

function isPreviewableNoteUrl(resourceUrl: string): boolean {
  return isNoteFilename(noteFromUrl(resourceUrl).id);
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
    id: filename,
    title: slug ? slug.replace(/-/g, " ") : "Untitled note",
    createdAt
  };
}

function isNoteFilename(filename: string): boolean {
  return /^\d{8}T\d{6}Z_[a-f0-9]{6}(?:_[a-z0-9]+(?:-[a-z0-9]+)*)?\.txt$/i.test(filename);
}

async function readNoteContent(deps: WebServerDeps, id: string): Promise<string> {
  if (deps.mode === "demo") {
    const note = deps.demoNotes.find((item) => item.id === id);
    if (!note) throw new RequestError("Note not found.", 404);
    return note.content;
  }

  return withPodClient(deps, async (client, config) => {
    const resourceUrl = new URL(id, config.pod.notesContainerUrl).href;
    const containedUrls = await client.listResourceUrls(config.pod.notesContainerUrl);
    const isContained = containedUrls.some((url) => {
      try {
        return new URL(url).href === resourceUrl;
      } catch {
        return false;
      }
    });
    if (!isContained) throw new RequestError("Note not found.", 404);
    return client.readTextResource(resourceUrl);
  });
}

function toWebSummary(summary: DemoSummary): WebSummary {
  const { id, title, createdAt } = summary;
  return { id, title, createdAt };
}

function isSummaryFilename(filename: string): boolean {
  return /^\d{8}T\d{6}Z_[a-f0-9]{6}_summary\.txt$/i.test(filename);
}

function summaryFromUrl(resourceUrl: string): WebSummary {
  const encodedFilename = new URL(resourceUrl).pathname.split("/").pop() ?? "";
  let filename = encodedFilename;
  try {
    filename = decodeURIComponent(encodedFilename);
  } catch {
    // Keep encoded filename if decoding fails
  }

  const match = /^(\d{8}T\d{6}Z)_[a-f0-9]{6}_summary\.txt$/i.exec(filename);
  let createdAt = new Date(0).toISOString();
  if (match) {
    const timestamp = match[1];
    const date = new Date(
      `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}Z`
    );
    if (!Number.isNaN(date.valueOf())) {
      createdAt = date.toISOString();
    }
  }

  return { id: filename, title: "Summary", createdAt };
}

async function listPodSummaries(deps: WebServerDeps): Promise<WebSummary[]> {
  return withPodClient(deps, async (client, config) => {
    await client.ensureContainer(config.pod.summariesContainerUrl);
    const urls = await client.listResourceUrls(config.pod.summariesContainerUrl);
    const summaries = urls
      .map(summaryFromUrl)
      .filter((summary) => isSummaryFilename(summary.id))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return summaries;
  });
}

async function readSummaryContent(deps: WebServerDeps, id: string): Promise<string> {
  if (deps.mode === "demo") {
    const summary = deps.demoSummaries.find((item) => item.id === id);
    if (!summary) throw new RequestError("Summary not found.", 404);
    return summary.content;
  }

  return withPodClient(deps, async (client, config) => {
    const resourceUrl = new URL(id, config.pod.summariesContainerUrl).href;
    const containedUrls = await client.listResourceUrls(config.pod.summariesContainerUrl);
    const isContained = containedUrls.some((url) => {
      try {
        return new URL(url).href === resourceUrl;
      } catch {
        return false;
      }
    });
    if (!isContained) throw new RequestError("Summary not found.", 404);
    return client.readTextResource(resourceUrl);
  });
}

async function generateSummary(deps: WebServerDeps, noteLimit: number | undefined): Promise<WebSummary[]> {
  if (deps.mode === "demo") {
    const demoNotes = deps.demoNotes.slice(0, MAX_NOTES);
    const selectedNotes = noteLimit === undefined ? demoNotes : demoNotes.slice(0, noteLimit);
    const inputs: NoteInput[] = selectedNotes.map((note) => ({
      title: note.title,
      content: note.content,
      resourceUrl: note.id
    }));
    const summarizer = deps.createSummarizer(deps.loadSummarizerConfig());
    const summary = await summarizer.summarize(inputs);
    const content = buildSummaryText(
      selectedNotes.map((note) => ({
        filename: note.id,
        title: note.title,
        createdAt: new Date(note.createdAt),
        resourceUrl: note.id
      })),
      summary
    );
    const entry: DemoSummary = {
      id: deps.generateNoteFilename("summary"),
      title: "Summary",
      createdAt: new Date().toISOString(),
      content
    };
    deps.demoSummaries.unshift(entry);
    return deps.demoSummaries.slice(0, MAX_NOTES).map(toWebSummary);
  }

  return withPodClient(deps, async (client, config) => {
    await client.ensureContainer(config.pod.notesContainerUrl);
    const urls = await client.listResourceUrls(config.pod.notesContainerUrl);
    const notes = urls
      .map((url) => {
        const note = noteFromUrl(url);
        return {
          filename: note.id,
          title: note.title,
          createdAt: new Date(note.createdAt),
          resourceUrl: new URL(note.id, config.pod.notesContainerUrl).href
        };
      })
      .filter((note) => isNoteFilename(note.filename))
      .sort((left, right) => right.createdAt.valueOf() - left.createdAt.valueOf())
      .slice(0, noteLimit ?? MAX_NOTES);

    const inputs: NoteInput[] = [];
    for (const note of notes) {
      const content = await client.readTextResource(note.resourceUrl);
      inputs.push({ title: note.title, content, resourceUrl: note.resourceUrl });
    }

    const summarizer = deps.createSummarizer(deps.loadSummarizerConfig());
    const summary = await summarizer.summarize(inputs);
    const filename = deps.generateNoteFilename("summary");
    const resourceUrl = `${config.pod.summariesContainerUrl}${filename}`;
    await client.writeTextResource(resourceUrl, buildSummaryText(notes, summary));

    const summaryUrls = await client.listResourceUrls(config.pod.summariesContainerUrl);
    const summaries = summaryUrls
      .map(summaryFromUrl)
      .filter((summary) => isSummaryFilename(summary.id))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return summaries;
  });
}

function validateSummariesBody(value: unknown): { noteLimit?: number } {
  if (typeof value !== "object" || value === null) {
    throw new RequestError("A note limit is optional.", 400);
  }
  const { noteLimit } = value as { noteLimit?: unknown };
  if (noteLimit === undefined) {
    return {};
  }
  if (typeof noteLimit !== "number" || !Number.isInteger(noteLimit) || noteLimit < 0) {
    throw new RequestError("noteLimit must be a non-negative integer.", 400);
  }
  return { noteLimit };
}

async function withPodClient<T>(
  deps: WebServerDeps,
  operation: (client: WebPodClient, config: SolidConfig) => Promise<T>
): Promise<T> {
  let config: SolidConfig;
  try {
    config = deps.loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      throw new RequestError(
        "Solid configuration is incomplete. Check that SOLID_* environment variables are set.",
        503
      );
    }
    throw error;
  }

  let session: AuthSession;
  try {
    session = await deps.createAuthenticatedSession(config.auth);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new RequestError(`Solid authentication failed: ${message}`, 503);
  }

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

function loadDotenv(filePath: string): void {
  const envPath = resolve(filePath);
  let text: string;
  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function start(): void {
  loadDotenv(".env");

  const mode = webModeFromEnv();
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  const host = process.env.CODESPACES === "true" ? "0.0.0.0" : "127.0.0.1";
  const server = createWebServer({
    mode,
    loadConfig: loadConfigFromEnv,
    loadSummarizerConfig: loadSummarizerConfigFromEnv,
    createAuthenticatedSession,
    createPodClient: (session) => new PodClient(session),
    createSummarizer,
    generateNoteFilename,
    demoNotes: [],
    demoSummaries: []
  });
  server.listen(port, host, () => {
    console.log(`PodPad web app (${mode}) listening on http://${host}:${port}`);
  });

  function shutdown(signal: string): void {
    console.log(`\nReceived ${signal}. Shutting down...`);
    server.close(() => {
      process.exit(0);
    });
    // Force exit if graceful close hangs
    setTimeout(() => process.exit(0), 5000).unref();
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) {
  start();
}
