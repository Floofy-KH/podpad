#!/usr/bin/env node
/**
 * One-shot Solid auth setup for PodPad.
 *
 * Flow:
 * 1. Register an OIDC client with the issuer.
 * 2. Start a temporary local callback server.
 * 3. Open the browser for authorization (PKCE).
 * 4. Catch the callback automatically.
 * 5. Exchange the auth code for a refresh token.
 * 6. Discover the Pod base URL from the ID token / WebID.
 * 7. Write (or update) .env.
 *
 * Usage:
 *   node scripts/auth-setup.mjs
 *   node scripts/auth-setup.mjs --issuer https://solidcommunity.net --port 8787
 */

import http from "http";
import https from "https";
import crypto from "crypto";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import readline from "readline";

// ------------------------------------------------------------------
// CLI args
// ------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    issuer: "https://solidcommunity.net",
    port: 8787,
    envFile: ".env",
  };

  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--issuer") {
      args.issuer = argv[i + 1] ?? args.issuer;
      i += 1;
    } else if (flag === "--port") {
      args.port = Number.parseInt(argv[i + 1] ?? String(args.port), 10);
      i += 1;
    } else if (flag === "--env-file") {
      args.envFile = argv[i + 1] ?? args.envFile;
      i += 1;
    } else if (flag === "--help" || flag === "-h") {
      console.log(`Usage: node scripts/auth-setup.mjs [options]

Options:
  --issuer <url>    OIDC issuer (default: https://solidcommunity.net)
  --port <number>   Local callback port (default: 8787)
  --env-file <path> Path to write env vars (default: .env)
  --help            Show this help`);
      process.exit(0);
    }
  }

  return args;
}

const ARGS = parseArgs(process.argv);

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function b64url(bytes) {
  return Buffer.from(bytes).toString("base64url").replace(/=+$/, "");
}

function randomString(byteLength = 32) {
  return b64url(crypto.randomBytes(byteLength));
}

function sha256B64url(input) {
  return b64url(crypto.createHash("sha256").update(input, "ascii").digest());
}

function openBrowser(url) {
  const platform = process.platform;
  let child;
  if (platform === "win32") {
    // Use rundll32 to bypass cmd.exe shell parsing (avoids & truncation issues)
    child = spawn("rundll32", ["url.dll,FileProtocolHandler", url], {
      detached: true,
      stdio: "ignore",
    });
  } else if (platform === "darwin") {
    child = spawn("open", [url], { detached: true, stdio: "ignore" });
  } else {
    child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
  }

  child.on("error", (err) => {
    console.warn(`  Could not open browser automatically (${err.message}).`);
    console.log(`  Please open this URL manually:\n  ${url}`);
  });
}

function requestJson(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: options.method ?? "GET",
        headers: options.headers ?? {},
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(data));
            } else {
              reject(
                new Error(
                  `HTTP ${res.statusCode}: ${data.slice(0, 500)}`
                )
              );
            }
          } catch (err) {
            reject(new Error(`Invalid JSON response: ${data.slice(0, 500)}`));
          }
        });
      }
    );

    req.on("error", reject);

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function requestText(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: options.method ?? "GET",
        headers: options.headers ?? {},
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
          }
        });
      }
    );

    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ------------------------------------------------------------------
// 1. Register client
// ------------------------------------------------------------------

async function registerClient() {
  const issuer = ARGS.issuer.replace(/\/$/, "");
  const redirectUri = `http://127.0.0.1:${ARGS.port}/callback`;

  console.log(`Registering client with ${issuer}...`);

  const body = JSON.stringify({
    client_name: "PodPad CLI",
    redirect_uris: [redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_basic",
  });

  const client = await requestJson(`${issuer}/.oidc/reg`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!client.client_id || !client.client_secret) {
    throw new Error("Registration response missing client_id or client_secret.");
  }

  console.log(`  Client ID:     ${client.client_id}`);
  console.log(`  Client Secret: ${client.client_secret.slice(0, 6)}...`);
  return { clientId: client.client_id, clientSecret: client.client_secret };
}

// ------------------------------------------------------------------
// 2. Start callback server + open browser
// ------------------------------------------------------------------

function startCallbackServer(expectedState, timeoutMs = 5 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        fail(
          new Error(
            `Timed out waiting for authorization callback after ${timeoutMs / 1000}s. ` +
              "You can try running the script again."
          )
        );
      }
    }, timeoutMs);

    function finish(value) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        server.close(() => resolve(value));
      }
    }

    function fail(err) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        server.close(() => reject(err));
      }
    }

    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${ARGS.port}`);

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(
            `<html><body><h1>Authorization failed</h1><p>${error}${errorDescription ? `: ${errorDescription}` : ""}</p></body></html>`
          );
          fail(new Error(`OAuth error: ${error}${errorDescription ? ` - ${errorDescription}` : ""}`));
          return;
        }

        if (!code || !state) {
          res.writeHead(404, { "Content-Type": "text/html" });
          res.end("<html><body><p>Not found.</p></body></html>");
          return;
        }

        if (state !== expectedState) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<html><body><h1>State mismatch</h1></body></html>");
          fail(new Error("State mismatch in callback."));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h1>Authentication successful</h1><p>You can close this tab and return to the terminal.</p></body></html>"
        );
        finish(code);
      } catch (err) {
        res.writeHead(500);
        res.end("Internal error");
        fail(err);
      }
    });

    server.listen(ARGS.port, "127.0.0.1", () => {
      console.log(`  Callback server listening on http://127.0.0.1:${ARGS.port}/callback`);
    });

    server.on("error", (err) => {
      fail(new Error(`Failed to start callback server: ${err.message}`));
    });
  });
}

async function requestAuthCode(clientId) {
  const issuer = ARGS.issuer.replace(/\/$/, "");
  const redirectUri = `http://127.0.0.1:${ARGS.port}/callback`;
  const pkceVerifier = randomString(64);
  const pkceChallenge = sha256B64url(pkceVerifier);
  const state = randomString(24);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid webid offline_access profile",
    code_challenge: pkceChallenge,
    code_challenge_method: "S256",
    state,
    prompt: "consent",
  });

  const authUrl = `${issuer}/.oidc/auth?${params.toString()}`;

  console.log("Opening browser for authorization...");
  console.log(`  URL: ${authUrl}`);

  const codePromise = startCallbackServer(state);
  openBrowser(authUrl);

  const code = await codePromise;
  console.log("  Authorization code received.");
  return { code, pkceVerifier, redirectUri };
}

// ------------------------------------------------------------------
// 3. Exchange code for refresh token
// ------------------------------------------------------------------

async function exchangeCode(clientId, clientSecret, code, pkceVerifier, redirectUri) {
  const issuer = ARGS.issuer.replace(/\/$/, "");

  console.log("Exchanging auth code for refresh token...");

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: pkceVerifier,
  }).toString();

  const tokenResponse = await requestJson(`${issuer}/.oidc/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!tokenResponse.refresh_token) {
    throw new Error("Token response did not include a refresh_token.");
  }

  console.log("  Refresh token acquired.");
  return {
    refreshToken: tokenResponse.refresh_token,
    idToken: tokenResponse.id_token,
  };
}

// ------------------------------------------------------------------
// 4. Discover Pod base URL
// ------------------------------------------------------------------

function parseJwtPayload(idToken) {
  try {
    const parts = idToken.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

async function discoverPodBaseUrl(webId) {
  console.log(`Looking up Pod storage for ${webId}...`);

  // Try to fetch WebID profile and find pim:storage or solid:storage
  try {
    const profile = await requestText(webId, {
      headers: { Accept: "text/turtle, application/rdf+xml, */*" },
    });

    // Very lightweight regex-based extraction for common Turtle patterns
    const storageRegex = /<([^>]+)>\s*[\w:]*storage\s*<([^>]+)>/gi;
    const matches = [...profile.matchAll(storageRegex)];
    for (const m of matches) {
      const storageUrl = m[2];
      if (storageUrl && storageUrl.startsWith("http")) {
        console.log(`  Found storage: ${storageUrl}`);
        return storageUrl;
      }
    }
  } catch {
    // If profile fetch fails, fall through to heuristic
  }

  // Heuristic: if WebID follows https://host/profile/card#me pattern, guess Pod root
  const parsed = new URL(webId);
  if (parsed.pathname === "/profile/card" || parsed.pathname === "/profile/card#me" || parsed.hash === "#me") {
    const guess = `${parsed.protocol}//${parsed.hostname}/`;
    console.log(`  Could not read WebID profile. Guessing Pod base: ${guess}`);
    const ok = await prompt(`Use this Pod base URL? [${guess}] (y/n/edit) `);
    if (ok.toLowerCase() === "y" || ok === "") return guess;
    if (ok.toLowerCase() === "n") return null;
    return ok; // user typed a custom URL
  }

  console.log("  Could not auto-detect Pod base URL from WebID profile.");
  return null;
}

// ------------------------------------------------------------------
// 5. Write .env
// ------------------------------------------------------------------

async function writeEnv(values) {
  const envPath = path.resolve(ARGS.envFile);
  let existing = "";

  if (fs.existsSync(envPath)) {
    existing = fs.readFileSync(envPath, "utf8");
    console.log(`\nUpdating existing ${ARGS.envFile}...`);
  } else {
    console.log(`\nCreating ${ARGS.envFile}...`);
  }

  const lines = existing.length > 0 ? existing.split("\n") : [];
  const entries = [];
  const seenKeys = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      entries.push({ type: "blank", line });
      continue;
    }
    if (trimmed.startsWith("#")) {
      entries.push({ type: "comment", line });
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      entries.push({ type: "unknown", line });
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    entries.push({ type: "kv", key, line });
    seenKeys.add(key);
  }

  // Overwrite or add our keys
  for (const [key, value] of Object.entries(values)) {
    if (seenKeys.has(key)) {
      for (const entry of entries) {
        if (entry.type === "kv" && entry.key === key) {
          entry.line = `${key}=${value}`;
        }
      }
    } else {
      entries.push({ type: "kv", key, line: `${key}=${value}` });
      seenKeys.add(key);
    }
  }

  const output = entries.map((e) => e.line).join("\n") + "\n";
  fs.writeFileSync(envPath, output, "utf8");

  console.log("  Saved:");
  for (const key of Object.keys(values)) {
    console.log(`    ${key}=...`);
  }
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

async function main() {
  console.log("=== PodPad Solid Auth Setup ===\n");

  try {
    // 1. Register
    const { clientId, clientSecret } = await registerClient();

    // 2. Auth code via browser
    const { code, pkceVerifier, redirectUri } = await requestAuthCode(clientId);

    // 3. Exchange
    const { refreshToken, idToken } = await exchangeCode(
      clientId,
      clientSecret,
      code,
      pkceVerifier,
      redirectUri
    );

    // 4. Discover Pod
    const jwtPayload = parseJwtPayload(idToken);
    const webId = jwtPayload?.webid ?? jwtPayload?.sub;
    if (!webId) {
      console.warn("Could not extract WebID from ID token. You will need to set SOLID_POD_BASE_URL manually.");
    }

    let podBaseUrl = null;
    if (webId) {
      podBaseUrl = await discoverPodBaseUrl(webId);
    }

    if (!podBaseUrl) {
      const manual = await prompt("Enter your Pod base URL (e.g. https://username.solidcommunity.net/): ");
      if (!manual) {
        throw new Error("Pod base URL is required.");
      }
      podBaseUrl = manual;
    }

    // Validate absolute URL
    try {
      const parsedPod = new URL(podBaseUrl);
      if (!/^https?:$/.test(parsedPod.protocol)) {
        throw new Error("Pod base URL must be http or https.");
      }
    } catch {
      throw new Error(`Invalid Pod base URL: ${podBaseUrl}`);
    }

    if (!podBaseUrl.endsWith("/")) {
      podBaseUrl = `${podBaseUrl}/`;
    }

    // 5. Write .env
    await writeEnv({
      SOLID_OIDC_ISSUER: ARGS.issuer.replace(/\/$/, ""),
      SOLID_CLIENT_ID: clientId,
      SOLID_CLIENT_SECRET: clientSecret,
      SOLID_REFRESH_TOKEN: refreshToken,
      SOLID_POD_BASE_URL: podBaseUrl,
    });

    console.log("\nDone! You can now run:");
    console.log("  npm run auth:check");
  } catch (err) {
    console.error("\nSetup failed:", err.message);
    process.exit(1);
  }
}

main();
