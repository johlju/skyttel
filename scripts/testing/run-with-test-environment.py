"""Run one build or test process at a time across the user's worktrees."""

import argparse
import fcntl
from html import escape
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import sys
from tempfile import NamedTemporaryFile
import time


def acquire_lock(lock, wait_seconds):
    deadline = time.monotonic() + wait_seconds
    reported = False
    while True:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return True
        except BlockingIOError:
            if not reported:
                owner = lock.read().strip() or "another build or test process"
                action = (f"Waiting up to {wait_seconds:g}s." if wait_seconds
                          else "Retry after it finishes.")
                print(f"Skyttel test lock is busy: {owner}. {action}", file=sys.stderr)
                reported = True
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return False
            time.sleep(min(0.1, remaining))


def run(command, environment, descriptor, log=None):
    output = {"stdout": subprocess.PIPE, "stderr": subprocess.STDOUT} if log else {}
    child = subprocess.Popen(
        command, env=environment, start_new_session=True, pass_fds=(descriptor,), **output
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
        if log:
            with child.stdout:
                for line in child.stdout:
                    log.write(line)
                    if not line.startswith(b'{"event":"security_operation",'):
                        sys.stdout.buffer.write(line)
                        sys.stdout.buffer.flush()
        status = child.wait()
    finally:
        for signum, handler in previous.items():
            signal.signal(signum, handler)
    return status if status >= 0 else 128 - status


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wait-seconds", type=float,
                        default=os.environ.get("SKYTTEL_TEST_LOCK_WAIT_SECONDS", "0"),
                        help="maximum lock wait (default: SKYTTEL_TEST_LOCK_WAIT_SECONDS or 0)")
    parser.add_argument("--chromium", action="store_true", help="check pinned headless Chromium")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--ci-fonts", action="store_true")
    mode.add_argument("--prepare", action="store_true")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if not math.isfinite(args.wait_seconds) or args.wait_seconds < 0:
        parser.error("lock wait must be a finite, nonnegative number of seconds")
    if args.prepare and args.command:
        parser.error("--prepare does not accept a child command")
    if args.prepare and args.chromium:
        parser.error("--chromium requires a verification command")
    if not args.prepare and not args.command:
        parser.error("a command is required")

    # A fixed host path shares the lock even when worktrees use different TMPDIRs.
    lock_path = os.environ.get(
        "SKYTTEL_TEST_LOCK_FILE", f"/tmp/skyttel-tests-{os.getuid()}.lock"
    )
    descriptor = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "r+") as lock:
        if not acquire_lock(lock, args.wait_seconds):
            return 75

        lock.seek(0)
        lock.truncate()
        json.dump({"pid": os.getpid(), "cwd": os.getcwd(),
                   "command": ["deps:prepare"] if args.prepare else args.command}, lock)
        lock.flush()
        environment = os.environ.copy()
        compact_output = environment.pop("SKYTTEL_TEST_COMPACT_OUTPUT", None) == "1"
        setup = Path(__file__).resolve().with_name("dependency-environment.mjs")
        setup_command = [environment.get("npm_node_execpath", "node"), str(setup),
                         "prepare" if args.prepare else "check"]
        if args.chromium:
            setup_command.append("--chromium")
        try:
            status = run(setup_command, environment, descriptor)
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
        if compact_output:
            directory = Path("logs/tests").resolve()
            directory.mkdir(parents=True, exist_ok=True)
            with NamedTemporaryFile(dir=directory, prefix="verification-", suffix=".log",
                                    buffering=0, delete=False) as log:
                print(f"Full verification log: {log.name}", file=sys.stderr, flush=True)
                return run(args.command, environment, descriptor, log)
        return run(args.command, environment, descriptor)


if __name__ == "__main__":
    sys.exit(main())
