#!/usr/bin/env python3
"""
Generate native OpenCode configuration from profiles/base.json and .env.
Points directly to official provider HTTPS endpoints with no Docker/proxy required.
Writes to %USERPROFILE%/.config/opencode/opencode.json and build/native-<profile>.json.
"""

import os
import sys
import json
import shutil

def parse_env(env_path):
    env_vars = {}
    if not os.path.isfile(env_path):
        return env_vars
    with open(env_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                env_vars[k.strip()] = v.strip().strip('"').strip("'")
    return env_vars

def main():
    profile = sys.argv[1] if len(sys.argv) > 1 else "assist"
    model_override = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None

    script_dir = os.path.dirname(os.path.abspath(__file__))
    pag_root = os.path.dirname(script_dir)
    env_file = os.path.join(pag_root, ".env")
    base_file = os.path.join(pag_root, "profiles", "base.json")
    rules_file = os.path.join(pag_root, "profiles", f"{profile}.rules.json")

    env_vars = parse_env(env_file)

    with open(base_file, "r", encoding="utf-8") as f:
        config = json.load(f)

    # Replace proxy URLs with real endpoints and inject keys
    endpoints = {
        "groq": ("https://api.groq.com/openai/v1", env_vars.get("GROQ_API_KEY", "")),
        "nvidia": ("https://integrate.api.nvidia.com/v1", env_vars.get("NVIDIA_API_KEY", "")),
        "openrouter": ("https://openrouter.ai/api/v1", env_vars.get("OPENROUTER_API_KEY", "")),
        "go": ("https://opencode.ai/zen/go/v1", env_vars.get("GO_API_KEY", "")),
        "go-anthropic": ("https://opencode.ai/zen/go/v1", env_vars.get("GO_API_KEY", "")),
    }

    providers = config.get("providers", {})
    for p_name, (url, key) in endpoints.items():
        if p_name in providers:
            providers[p_name]["settings"]["baseURL"] = url
            providers[p_name]["settings"]["apiKey"] = key

    # Merge permissions
    if os.path.isfile(rules_file):
        with open(rules_file, "r", encoding="utf-8") as f:
            config["permissions"] = json.load(f)

    # Model override
    if model_override:
        config["model"] = model_override
        if "agents" in config:
            for ag in ["build", "plan"]:
                if ag in config["agents"]:
                    config["agents"][ag]["model"] = model_override

    # Write to build/native-<profile>.json
    build_dir = os.path.join(pag_root, "build")
    os.makedirs(build_dir, exist_ok=True)
    native_build_file = os.path.join(build_dir, f"native-{profile}.json")
    with open(native_build_file, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)

    # Write to %USERPROFILE%/.config/opencode/opencode.json
    user_config_dir = os.path.expanduser("~/.config/opencode")
    os.makedirs(user_config_dir, exist_ok=True)
    user_config_file = os.path.join(user_config_dir, "opencode.json")
    with open(user_config_file, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)

    # Copy AGENTS.global.md to user_config_dir/AGENTS.md
    agents_global = os.path.join(pag_root, "AGENTS.global.md")
    if os.path.isfile(agents_global):
        shutil.copy2(agents_global, os.path.join(user_config_dir, "AGENTS.md"))

    # Copy plugins to user_config_dir/plugins
    src_plugins = os.path.join(pag_root, "plugins")
    dst_plugins = os.path.join(user_config_dir, "plugins")
    if os.path.isdir(src_plugins):
        if os.path.exists(dst_plugins):
            shutil.rmtree(dst_plugins)
        shutil.copytree(src_plugins, dst_plugins)

    print(f"[OK] Native configuration generated: {user_config_file}")

if __name__ == "__main__":
    main()
