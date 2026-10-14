"""Fail when tracked files show signs of injected or disguised code.

Guards against the infection removed in October 2026: obfuscated JavaScript hidden behind
long whitespace padding in config files, editor tasks that run on folder open, and
executable payloads disguised as font files. It only reads files, so it is safe to run
before any npm or Python tooling executes project code.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CODE_SUFFIXES = {
    ".cjs",
    ".css",
    ".html",
    ".js",
    ".json",
    ".jsx",
    ".mjs",
    ".ps1",
    ".py",
    ".sh",
    ".toml",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
}
SKIPPED_PREFIXES = ("mechlab/staticfiles/",)
SKIPPED_NAMES = {"package-lock.json"}

# Code pushed off-screen by a long run of spaces or tabs on the same line.
PADDED_CODE = re.compile(r"[ \t]{200,}\S")
OBFUSCATION_MARKERS = re.compile(r"global\[['\"]!['\"]\]|\b_0x[0-9a-f]{4,}\b")
AUTO_RUN_TASK = re.compile(r"[\"']runOn[\"']\s*:\s*[\"']folderOpen[\"']")

FONT_SIGNATURES = {
    ".woff": (b"wOFF",),
    ".woff2": (b"wOF2",),
    ".ttf": (b"\x00\x01\x00\x00", b"true", b"OTTO"),
    ".otf": (b"OTTO",),
}


def tracked_files() -> list[str]:
    output = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True
    ).stdout
    return [name for name in output.decode().split("\0") if name]


def font_problem(path: Path, data: bytes) -> str | None:
    suffix = path.suffix.lower()
    if suffix == ".eot":
        # Embedded OpenType stores the magic number 0x504C at byte offset 34.
        return None if data[34:36] == b"LP" else "not a valid EOT font"
    signatures = FONT_SIGNATURES.get(suffix)
    if signatures is None:
        return None
    return None if data.startswith(signatures) else f"not a valid {suffix} font"


def text_problems(name: str, text: str) -> list[str]:
    problems = []
    for number, line in enumerate(text.splitlines(), start=1):
        if PADDED_CODE.search(line):
            problems.append(f"line {number}: code hidden after long whitespace padding")
        if OBFUSCATION_MARKERS.search(line):
            problems.append(f"line {number}: obfuscated JavaScript marker")
    if name.startswith(".vscode/") and AUTO_RUN_TASK.search(text):
        problems.append("editor task runs automatically when the folder is opened")
    return problems


def main() -> int:
    failures = []
    for name in tracked_files():
        if name.startswith(SKIPPED_PREFIXES) or Path(name).name in SKIPPED_NAMES:
            continue
        path = ROOT / name
        if not path.is_file():
            continue
        data = path.read_bytes()
        problem = font_problem(path, data)
        if problem:
            failures.append(f"{name}: {problem}")
        if path.suffix.lower() in CODE_SUFFIXES and b"\0" not in data:
            text = data.decode("utf-8", errors="replace")
            failures.extend(f"{name}: {problem}" for problem in text_problems(name, text))

    if failures:
        print("Repository integrity check failed:", file=sys.stderr)
        for failure in failures:
            print(f"  {failure}", file=sys.stderr)
        return 1
    print("Repository integrity check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
