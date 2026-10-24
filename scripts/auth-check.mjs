#!/usr/bin/env node
/**
 * Load .env values and run the connectivity-check command.
 *
 * Usage:
 *   node scripts/auth-check.mjs
 *   node scripts/auth-check.mjs --env-file .env
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";

// ------------------------------------------------------------------
// CLI args
// ------------------------------------------------------------------

function parseArgs(argv) {
  const args = { envFile: ".env" };
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--env-file") {
      args.envFile = argv[i + 1] ?? args.envFile;
      i += 1;
    } else if (flag === "--help" || flag === "-h") {
      console.log("Usage: node scripts/auth-check.mjs [--env-file <path>]");
      process.exit(0);
    }
  }
  return args;
}

const ARGS = parseArgs(process.argv);

// ------------------------------------------------------------------
// Load .env
// ------------------------------------------------------------------

function loadDotenv(filePath) {
  const envPath = path.resolve(filePath);
  if (!fs.existsSync(envPath)) return;

  const text = fs.readFileSync(envPath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip matching surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

async function main() {
  loadDotenv(ARGS.envFile);

  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const args = ["run", "dev", "--", "connectivity-check"];

  console.log(`Running connectivity-check with env from ${ARGS.envFile}...\n`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      cwd: process.cwd(),
      env: process.env,
    });

    child.on("close", (code) => {
      resolve(code ?? 0);
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("auth-check failed:", err.message);
    process.exit(1);
  });
