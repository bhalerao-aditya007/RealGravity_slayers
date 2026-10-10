#!/usr/bin/env python3
"""
RealGravity API Usage & Quota Summary.
Cross-platform parser for logs/pag.log.
"""

import os
import sys
import re
from collections import defaultdict

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(script_dir)
    log_file = os.path.join(root_dir, "logs", "pag.log")

    print("=== RealGravity (PAG) API Usage & Quota Summary ===")
    print()

    if not os.path.isfile(log_file):
        print(f"No log file found at {log_file} yet. Run a session first.")
        return

    requests_by_date = defaultdict(int)
    requests_by_endpoint = defaultdict(int)
    total_req_bytes = 0
    total_res_bytes = 0
    total_requests = 0

    with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            parts = line.split()
            if not parts:
                continue

            date = parts[0][:10]
            requests_by_date[date] += 1

            if len(parts) >= 3:
                endpoint = parts[2]
                # Categorize provider
                if "/groq/" in endpoint:
                    provider = "Groq"
                elif "/nvidia/" in endpoint:
                    provider = "NVIDIA NIM"
                elif "/openrouter/" in endpoint:
                    provider = "OpenRouter"
                elif "/zen/go/" in endpoint:
                    provider = "OpenCode Go"
                else:
                    provider = endpoint.split("/")[1] if len(endpoint.split("/")) > 1 else "Other"
                requests_by_endpoint[provider] += 1

            m_req = re.search(r"req=(\d+)", line)
            m_res = re.search(r"res=(\d+)", line)
            if m_req:
                total_req_bytes += int(m_req.group(1))
            if m_res:
                total_res_bytes += int(m_res.group(1))
            total_requests += 1

    print("--- Requests per Day ---")
    for date, count in sorted(requests_by_date.items()):
        print(f"Date: {date} | Requests: {count}")

    print()
    print("--- Requests by Provider ---")
    for provider, count in sorted(requests_by_endpoint.items(), key=lambda x: x[1], reverse=True):
        print(f"Provider: {provider:<15} | Requests: {count}")

    print()
    print("--- Total Traffic Estimate ---")
    print(f"Total Requests:         {total_requests}")
    print(f"Estimated Input Tokens: ~{int(total_req_bytes / 3.5):,} (based on {total_req_bytes:,} bytes)")
    print(f"Estimated Output Tokens:~{int(total_res_bytes / 3.5):,} (based on {total_res_bytes:,} bytes)")

if __name__ == "__main__":
    main()
