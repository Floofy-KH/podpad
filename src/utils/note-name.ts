import { randomBytes } from "node:crypto";

/**
 * Generates a note filename with a stable shape:
 *   - {yyyyMMddTHHmmssZ}_{6hex}.txt
 *   - {yyyyMMddTHHmmssZ}_{6hex}_{slug}.txt (when title is provided)
 */
export function generateNoteFilename(title?: string): string {
  const timestamp = formatUtcTimestamp(new Date());
  const randomHex = randomBytes(3).toString("hex");
  const slug = slugifyTitle(title);

  if (!slug) {
    return `${timestamp}_${randomHex}.txt`;
  }

  return `${timestamp}_${randomHex}_${slug}.txt`;
}

function formatUtcTimestamp(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function slugifyTitle(title: string | undefined): string {
  if (!title || title.trim().length === 0) {
    return "";
  }

  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}