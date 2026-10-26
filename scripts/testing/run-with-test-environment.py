"""Run one build or test process at a time across the user's worktrees."""

import argparse
import fcntl
from html import escape
import json
import os
from pathlib import Path
import signal
import subprocess
import sys


def run(command, environment, descriptor):
    child = subprocess.Popen(
        command, env=environment, start_new_session=True, pass_fds=(descriptor,)
    )

    def forward(signum, _frame):
        try:
            os.killpg(child.pid, signum)
        except ProcessLookupError:
            pass

    previous = {}
    for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        previous[signum] = signal.getsignal(signum)
        signal.signal(signum, forward)
    try:
        status = child.wait()
    finally:
        for signum, handler in previous.items():
            signal.signal(signum, handler)
    return status if status >= 0 else 128 - status


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--ci-fonts", action="store_true")
    mode.add_argument("--prepare", action="store_true")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if args.prepare and args.command:
        parser.error("--prepare does not accept a child command")
    if not args.prepare and not args.command:
        parser.error("a command is required")

    # A fixed host path shares the lock even when worktrees use different TMPDIRs.
    lock_path = os.environ.get(
        "SKYTTEL_TEST_LOCK_FILE", f"/tmp/skyttel-tests-{os.getuid()}.lock"
    )
    descriptor = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "r+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            owner = lock.read().strip() or "another build or test process"
            print(f"Skyttel test lock is busy: {owner}. Retry after it finishes.", file=sys.stderr)
            return 75

        lock.seek(0)
        lock.truncate()
        json.dump({"pid": os.getpid(), "cwd": os.getcwd(),
                   "command": ["deps:prepare"] if args.prepare else args.command}, lock)
        lock.flush()
        environment = os.environ.copy()
        setup = Path(__file__).resolve().with_name("dependency-environment.mjs")
        try:
            status = run(
                [environment.get("npm_node_execpath", "node"), str(setup),
                 "prepare" if args.prepare else "check"],
                environment, descriptor,
            )
        except OSError as error:
            print(f"Skyttel dependency setup failed: cannot start Node ({error}). "
                  "Install the Node version declared in package.json, then run "
                  "npm run deps:prepare.", file=sys.stderr)
            return 78
        if status or args.prepare:
            return status
        if args.ci_fonts:
            if sys.platform != "linux":
                print("The CI font profile requires Linux; run it in the devcontainer.", file=sys.stderr)
                return 2
            config = Path(__file__).resolve().with_name("fonts.conf")
            cache = config.parent.parent.parent / ".cache" / "fontconfig"
            cache.mkdir(parents=True, exist_ok=True)
            profile = cache / "fonts.conf"
            profile.write_text(
                config.read_text()
                .replace("@SKYTTEL_FONT_DIRECTORY@", escape(str(config.parent / "fonts")))
                .replace("@SKYTTEL_FONT_CACHE@", escape(str(cache)))
            )
            environment["FONTCONFIG_FILE"] = str(profile)
            match = subprocess.run(
                ["fc-match", "-f", "%{file}", "system-ui"],
                env=environment, capture_output=True, text=True, check=True,
            ).stdout
            expected = config.parent / "fonts" / "DejaVuSans.ttf"
            if Path(match).resolve() != expected:
                print(f"CI font profile selected {match}, expected {expected}.", file=sys.stderr)
                return 2
            print(f"CI font profile: {expected}", flush=True)
        return run(args.command, environment, descriptor)


if __name__ == "__main__":
    sys.exit(main())
