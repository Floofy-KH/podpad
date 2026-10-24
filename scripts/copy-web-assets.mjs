import { cpSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(projectDirectory, "src/web/public");
const outputDirectory = resolve(projectDirectory, "dist/web/public");

cpSync(sourceDirectory, outputDirectory, { recursive: true });
