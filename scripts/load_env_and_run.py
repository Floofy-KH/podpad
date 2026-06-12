import argparse
import os
import subprocess


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Load .env values and run a command.")
    parser.add_argument(
        "--env-file",
        default=".env",
        help="Path to .env file to load",
    )
    parser.add_argument(
        "command",
        nargs=argparse.REMAINDER,
        help="Command to run, prefixed with --",
    )
    return parser.parse_args()


def parse_dotenv(path: str) -> dict[str, str]:
    values: dict[str, str] = {}
    with open(path, encoding="utf-8") as file:
        for raw in file:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                raise SystemExit(f"Invalid .env line (missing '='): {line}")
            key, value = line.split("=", 1)
            values[key] = value
    return values


def main() -> int:
    args = parse_args()
    command = args.command

    if command and command[0] == "--":
        command = command[1:]

    if not command:
        raise SystemExit("No command provided. Example: python scripts/load_env_and_run.py -- npm run dev -- connectivity-check")

    env = os.environ.copy()
    env.update(parse_dotenv(args.env_file))

    completed = subprocess.run(command, env=env, check=False)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
