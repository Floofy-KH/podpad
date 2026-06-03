const COMMANDS = {
  HELP: "help",
  PHASE0_CHECK: "phase0-check"
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

  return COMMANDS.HELP;
}

function main(argv: string[]): void {
  const command = parseCommand(argv);

  if (command === COMMANDS.PHASE0_CHECK) {
    runPhase0Check();
    return;
  }

  printHelp();
}

main(process.argv);
