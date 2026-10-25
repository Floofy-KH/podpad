import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCommand } from "../src/cli";

describe("parseCommand", () => {
  it("returns add-note for 'add-note' argv", () => {
    const argv = ["node", "src/cli.ts", "add-note"];

    assert.equal(parseCommand(argv), "add-note");
  });

  it("returns list-notes for 'list-notes' argv", () => {
    const argv = ["node", "src/cli.ts", "list-notes"];

    assert.equal(parseCommand(argv), "list-notes");
  });

  it("returns help for an unrecognized command string", () => {
    const argv = ["node", "src/cli.ts", "unknown-command"];

    assert.equal(parseCommand(argv), "help");
  });

  it("returns help when no command is given", () => {
    const argv = ["node", "src/cli.ts"];

    assert.equal(parseCommand(argv), "help");
  });

  it("returns phase0-check for 'phase0-check' argv", () => {
    const argv = ["node", "src/cli.ts", "phase0-check"];

    assert.equal(parseCommand(argv), "phase0-check");
  });

  it("returns connectivity-check for 'connectivity-check' argv", () => {
    const argv = ["node", "src/cli.ts", "connectivity-check"];

    assert.equal(parseCommand(argv), "connectivity-check");
  });

  it("returns help for 'help' argv", () => {
    const argv = ["node", "src/cli.ts", "help"];

    assert.equal(parseCommand(argv), "help");
  });

  it("returns summarize-notes for 'summarize-notes' argv", () => {
    const argv = ["node", "src/cli.ts", "summarize-notes"];

    assert.equal(parseCommand(argv), "summarize-notes");
  });

  it("still returns correct values for existing commands", () => {
    assert.equal(parseCommand(["node", "src/cli.ts", "add-note"]), "add-note");
    assert.equal(parseCommand(["node", "src/cli.ts", "list-notes"]), "list-notes");
    assert.equal(parseCommand(["node", "src/cli.ts", "phase0-check"]), "phase0-check");
    assert.equal(parseCommand(["node", "src/cli.ts", "connectivity-check"]), "connectivity-check");
  });
});
