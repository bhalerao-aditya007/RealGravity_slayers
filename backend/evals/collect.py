#!/usr/bin/env python3
"""
Collect token usage and execution metrics from OpenCode SQLite database or nginx logs.
Accurately filters by timestamp or session ID so benchmark runs don't accumulate past traffic.
"""

import os
import sys
import glob
import sqlite3
import json
import re
from datetime import datetime, timezone


def get_sqlite_stats(project_dir):
    # Locate OpenCode DB under ~/.local/share/opencode or project .opencode
    db_candidates = (
        glob.glob(os.path.expanduser("~/.local/share/opencode/*.db")) +
        glob.glob(os.path.join(project_dir, ".opencode", "*.db")) +
        glob.glob(os.path.join(project_dir, ".local", "share", "opencode", "*.db"))
    )

    for db_path in db_candidates:
        try:
            conn = sqlite3.connect(db_path)
            c = conn.cursor()
            c.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [r[0] for r in c.fetchall()]

            # Inspect possible usage tables
            if "messages" in tables:
                c.execute("PRAGMA table_info(messages)")
                cols = [col[1] for col in c.fetchall()]
                if "tokens" in cols:
                    c.execute("SELECT sum(tokens) FROM messages")
                    row = c.fetchone()
                    if row and row[0] is not None:
                        return {"input_tokens": row[0], "output_tokens": 0, "approx": False}

            if "usage" in tables:
                c.execute("SELECT sum(prompt_tokens), sum(completion_tokens) FROM usage")
                row = c.fetchone()
                if row and (row[0] is not None or row[1] is not None):
                    return {
                        "input_tokens": row[0] or 0,
                        "output_tokens": row[1] or 0,
                        "approx": False,
                    }
        except Exception:
            continue
    return None


def parse_iso_timestamp(ts_str):
    try:
        # Handles 2026-10-02T13:05:58+00:00 or similar
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    except Exception:
        return None


def get_nginx_stats(log_path, since_timestamp=None, session_id=None):
    if not os.path.exists(log_path):
        return {"input_tokens": 0, "output_tokens": 0, "requests": 0, "approx": True}

    total_req_bytes = 0
    total_res_bytes = 0
    total_requests = 0

    since_dt = None
    if since_timestamp:
        try:
            # If numeric unix epoch
            if str(since_timestamp).isdigit() or (str(since_timestamp).replace(".", "", 1).isdigit()):
                since_dt = datetime.fromtimestamp(float(since_timestamp), tz=timezone.utc)
            else:
                since_dt = parse_iso_timestamp(str(since_timestamp))
        except Exception:
            since_dt = None

    with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            parts = line.split()
            if not parts:
                continue

            # Check timestamp filter
            if since_dt:
                log_ts = parse_iso_timestamp(parts[0])
                if log_ts and log_ts < since_dt:
                    continue

            # Check session ID filter if provided
            if session_id:
                m_sess = re.search(r"sess=([^\s]+)", line)
                if m_sess and m_sess.group(1) != session_id:
                    continue

            m_req = re.search(r"req=(\d+)", line)
            m_res = re.search(r"res=(\d+)", line)
            if m_req:
                total_req_bytes += int(m_req.group(1))
            if m_res:
                total_res_bytes += int(m_res.group(1))
            total_requests += 1

    return {
        "input_tokens": int(total_req_bytes / 3.5),
        "output_tokens": int(total_res_bytes / 3.5),
        "requests": total_requests,
        "approx": True,
    }


def main():
    proj_dir = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else os.getcwd()
    pag_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    log_file = os.path.join(pag_root, "logs", "pag.log")

    since_ts = None
    sess_id = None

    # Parse CLI flags
    args = sys.argv[1:]
    for i, arg in enumerate(args):
        if arg == "--since" and i + 1 < len(args):
            since_ts = args[i + 1]
        elif arg == "--session" and i + 1 < len(args):
            sess_id = args[i + 1]

    stats = get_sqlite_stats(proj_dir)
    if not stats or stats.get("input_tokens") == 0:
        stats = get_nginx_stats(log_file, since_timestamp=since_ts, session_id=sess_id)

    print(json.dumps(stats))


if __name__ == "__main__":
    main()
