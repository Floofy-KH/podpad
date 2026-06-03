const COMMANDS = {
  HELP: "help",
  PHASE0_CHECK: "phase0-check",
  CONNECTIVITY_CHECK: "connectivity-check"
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

  printHelp();
}

main(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Command failed: ${message}`);
  process.exitCode = 1;
});
