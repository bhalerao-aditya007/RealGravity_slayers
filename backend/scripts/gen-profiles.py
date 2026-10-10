#!/usr/bin/env python3
"""
Generate complete profile configs by combining profiles/base.json with profiles/<p>.rules.json.
Output is placed in build/<p>.json.
Works cross-platform (Linux, macOS, Windows).
"""

import json
import os
import sys

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(script_dir)
    build_dir = os.path.join(root_dir, "build")
    profiles_dir = os.path.join(root_dir, "profiles")
    base_file = os.path.join(profiles_dir, "base.json")

    if not os.path.isfile(base_file):
        print(f"[ERROR] base.json not found at {base_file}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(build_dir, exist_ok=True)

    with open(base_file, "r", encoding="utf-8") as f:
        base_config = json.load(f)

    for profile in ["strict", "assist", "turbo"]:
        rules_file = os.path.join(profiles_dir, f"{profile}.rules.json")
        if not os.path.isfile(rules_file):
            print(f"[WARN] Rules file not found: {rules_file}")
            continue

        with open(rules_file, "r", encoding="utf-8") as f:
            rules = json.load(f)

        profile_config = dict(base_config)
        profile_config["permissions"] = rules

        out_file = os.path.join(build_dir, f"{profile}.json")
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(profile_config, f, indent=2)

        print(f"[OK] Generated {out_file}")

if __name__ == "__main__":
    main()
