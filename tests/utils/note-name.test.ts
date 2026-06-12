import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { generateNoteFilename } from "../../src/utils/note-name";

describe("generateNoteFilename", () => {
  it("returns {timestamp}_{6hex}.txt when no title is provided", () => {
    const fileName = generateNoteFilename();

    assert.match(fileName, /^\d{8}T\d{6}Z_[a-f0-9]{6}\.txt$/);
  });

  it("returns {timestamp}_{6hex}_{slug}.txt when title is provided", () => {
    const fileName = generateNoteFilename("My First Note");

    assert.match(fileName, /^\d{8}T\d{6}Z_[a-f0-9]{6}_my-first-note\.txt$/);
  });

  it("slug strips leading/trailing dashes and collapses punctuation runs", () => {
    const fileName = generateNoteFilename("--- Hello,,,   world!!! ---");

    assert.match(fileName, /^\d{8}T\d{6}Z_[a-f0-9]{6}_hello-world\.txt$/);
  });

  it("treats empty string title as no title", () => {
    const fileName = generateNoteFilename("");

    assert.match(fileName, /^\d{8}T\d{6}Z_[a-f0-9]{6}\.txt$/);
    assert.doesNotMatch(fileName, /^\d{8}T\d{6}Z_[a-f0-9]{6}_/);
  });

  it("produces different filenames across rapid calls", () => {
    const fileA = generateNoteFilename();
    const fileB = generateNoteFilename();

    assert.notEqual(fileA, fileB);
  });
});