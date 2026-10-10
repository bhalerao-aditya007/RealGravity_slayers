#!/usr/bin/env python3
"""
Generate a concise repository map for PAG / RealGravity.
Lists tracked files, runs ctags -x to extract top-level symbols,
ranks by git commit activity, and caps output at 6,000 characters.
Output is written to .agent/repo-map.md in the current working directory.
"""

import os
import subprocess
import sys
from collections import defaultdict


def run_cmd(cmd, cwd=None):
    try:
        res = subprocess.run(
            cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            check=False,
        )
        return res.stdout.strip()
    except Exception:
        return ""


def main():
    target_dir = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    target_dir = os.path.abspath(target_dir)

    # 1. Get tracked files
    ls_out = run_cmd(["git", "ls-files"], cwd=target_dir)
    if not ls_out:
        files = []
        for root, _, filenames in os.walk(target_dir):
            if ".git" in root or ".venv" in root or "node_modules" in root:
                continue
            for f in filenames:
                rel = os.path.relpath(os.path.join(root, f), target_dir)
                files.append(rel)
    else:
        files = [line.strip() for line in ls_out.splitlines() if line.strip()]

    # Filter out binary, dependency, or virtualenv files
    ignore_exts = {
        ".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".lock", ".log",
        ".pyc", ".min.js", ".min.css", ".map", ".tar.gz", ".tgz", ".zip",
        ".mo", ".po", ".exe", ".pem"
    }
    ignore_parts = {
        "site-packages", "node_modules", ".venv", "venv", "env",
        "expense_env", "__pycache__", ".git", "dist-info", "Lib"
    }

    def should_include(path_str):
        parts = set(path_str.replace("\\", "/").split("/"))
        if parts & ignore_parts:
            return False
        if any(path_str.endswith(ext) for ext in ignore_exts):
            return False
        if path_str.startswith(".agent/"):
            return False
        return True

    code_files = [f for f in files if should_include(f)]

    # 2. Rank files by commit count (recency/importance)
    commit_counts = defaultdict(int)
    log_out = run_cmd(["git", "log", "--name-only", "--pretty=format:", "-n", "100"], cwd=target_dir)
    for line in log_out.splitlines():
        line = line.strip()
        if line and line in code_files:
            commit_counts[line] += 1

    sorted_files = sorted(
        code_files,
        key=lambda f: (commit_counts[f], os.path.getsize(os.path.join(target_dir, f)) if os.path.exists(os.path.join(target_dir, f)) else 0),
        reverse=True,
    )

    # 3. Extract symbols using ctags -x
    lines = ["# Repository Map", ""]
    current_chars = sum(len(l) + 1 for l in lines)
    max_chars = 6000

    for rel_path in sorted_files:
        full_path = os.path.join(target_dir, rel_path)
        if not os.path.exists(full_path):
            continue

        symbols = []
        ctags_out = run_cmd(["ctags", "-x", "--c-kinds=+p", full_path])
        if ctags_out:
            for c_line in ctags_out.splitlines():
                parts = c_line.split()
                if len(parts) >= 1:
                    symbols.append(parts[0])

        # Deduplicate and sort symbols
        sym_str = ", ".join(sorted(list(set(symbols[:15]))))
        if sym_str:
            entry = f"{rel_path}: {sym_str}"
        else:
            entry = f"{rel_path}"

        if current_chars + len(entry) + 1 > max_chars:
            lines.append("... [remaining files omitted]")
            break

        lines.append(entry)
        current_chars += len(entry) + 1

    out_dir = os.path.join(target_dir, ".agent")
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "repo-map.md")

    with open(out_file, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"[OK] Generated repo map: {out_file} ({current_chars} chars)")


if __name__ == "__main__":
    main()
