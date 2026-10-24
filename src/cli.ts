const COMMANDS = {
  HELP: "help",
  PHASE0_CHECK: "phase0-check",
  CONNECTIVITY_CHECK: "connectivity-check",
  ADD_NOTE: "add-note",
  LIST_NOTES: "list-notes"
} as const;

type Command = (typeof COMMANDS)[keyof typeof COMMANDS];

function printHelp(): void {
  console.log("PodPad CLI (Phase 0 scaffold)");
  console.log("");
  console.log("Usage:");
  console.log("  podpad <command>");
  console.log("");
  console.log("Commands:");
  console.log(`  ${COMMANDS.HELP}          Show this help text`);
  console.log(`  ${COMMANDS.PHASE0_CHECK}  Confirm scaffold is wired`);
  console.log(`  ${COMMANDS.CONNECTIVITY_CHECK}  Validate auth + Pod connectivity`);
  console.log(`  ${COMMANDS.ADD_NOTE}      Add a note from stdin to your Pod`);
  console.log(`  ${COMMANDS.LIST_NOTES}    List notes from your Pod`);
}

function runPhase0Check(): void {
  console.log("Phase 0 check passed.");
  console.log("Next: implement Solid auth + Pod client in Phase 1A.");
}

function parseCommand(argv: string[]): Command {
  const command = argv[2] ?? COMMANDS.HELP;

  if (command === COMMANDS.PHASE0_CHECK) {
    return COMMANDS.PHASE0_CHECK;
  }

  if (command === COMMANDS.CONNECTIVITY_CHECK) {
    return COMMANDS.CONNECTIVITY_CHECK;
  }

  if (command === COMMANDS.ADD_NOTE) {
    return COMMANDS.ADD_NOTE;
  }

  if (command === COMMANDS.LIST_NOTES) {
    return COMMANDS.LIST_NOTES;
  }

  return COMMANDS.HELP;
}

async function main(argv: string[]): Promise<void> {
  const command = parseCommand(argv);

  if (command === COMMANDS.PHASE0_CHECK) {
    runPhase0Check();
    return;
  }

  if (command === COMMANDS.CONNECTIVITY_CHECK) {
    const { runConnectivityCheck } = await import("./commands/connectivity-check");
    await runConnectivityCheck();
    return;
  }

  if (command === COMMANDS.ADD_NOTE) {
    const { runAddNote } = await import("./commands/add-note");
    await runAddNote(argv);
    return;
  }

  if (command === COMMANDS.LIST_NOTES) {
    const { runListNotes } = await import("./commands/list-notes");
    await runListNotes();
    return;
  }

  printHelp();
}

main(process.argv)
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Command failed: ${message}`);
    process.exit(1);
  });
