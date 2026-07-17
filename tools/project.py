"""Cross-platform project commands used locally and by maintainers."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "mechlab"
FRONTEND = ROOT / "frontend"


def run(*command: str, cwd: Path = ROOT, env: dict[str, str] | None = None) -> None:
    print(f"> {' '.join(command)}", flush=True)
    subprocess.run(command, cwd=cwd, env=env, check=True)


def django_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("DJANGO_DEBUG", "true")
    env.setdefault("DJANGO_USE_SQLITE", "true")
    env.setdefault("DJANGO_SECRET_KEY", "local-command-only-secret")
    env.setdefault("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,testserver")
    return env


def backend(*arguments: str) -> None:
    run(sys.executable, "manage.py", *arguments, cwd=BACKEND, env=django_env())


def npm(*arguments: str) -> None:
    executable = "npm.cmd" if os.name == "nt" else "npm"
    run(executable, *arguments, cwd=FRONTEND)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(
            "Usage: python tools/project.py <dev|seed|lint|format|test|build|check|api-generate>"
        )

    task = sys.argv[1]
    if task == "dev":
        run("docker", "compose", "up", "--build")
    elif task == "seed":
        backend("migrate")
        backend("seed_demo")
    elif task == "lint":
        run(sys.executable, "-m", "ruff", "check", "mechlab", "tools")
        run(sys.executable, "-m", "ruff", "format", "--check", "mechlab", "tools")
        npm("run", "lint")
        npm("run", "format:check")
    elif task == "format":
        run(sys.executable, "-m", "ruff", "check", "--fix", "mechlab", "tools")
        run(sys.executable, "-m", "ruff", "format", "mechlab", "tools")
        npm("run", "format")
    elif task == "test":
        backend("test")
        npm("run", "test")
    elif task == "build":
        backend("check")
        npm("run", "build")
    elif task == "api-generate":
        schema_path = ROOT / "openapi" / "schema.yml"
        schema_path.parent.mkdir(exist_ok=True)
        backend("spectacular", "--file", str(schema_path), "--validate", "--fail-on-warn")
        npm("run", "api:types")
    elif task == "check":
        backend("makemigrations", "--check", "--dry-run")
        main_task("api-generate")
        main_task("lint")
        main_task("test")
        main_task("build")
        run("docker", "compose", "config", "--quiet")
    else:
        raise SystemExit(f"Unknown task: {task}")


def main_task(task: str) -> None:
    original = sys.argv
    try:
        sys.argv = [original[0], task]
        main()
    finally:
        sys.argv = original


if __name__ == "__main__":
    main()
