#!/usr/bin/env python3
"""Authorize a site commit only for exact main push with completed publish CI."""
import json
import re
import sys

def decision(data: dict, source_sha: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{40}", source_sha):
        raise ValueError("not a full git commit SHA")
    runs = [run for run in data.get("workflow_runs", [])
            if run.get("head_sha") == source_sha
            and run.get("head_branch") == "main"
            and run.get("event") == "push"]
    if not runs:
        return "waiting:no matching publishing workflow"
    run = max(runs, key=lambda r: (int(r.get("id", 0)), int(r.get("run_attempt", 0))))
    if run.get("status") == "completed" and run.get("conclusion") == "success":
        return "approved"
    return f"waiting:{run.get('status')}/{run.get('conclusion')}"

if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("Usage: check-publish.py MAIN_SHA API_JSON")
    try:
        with open(sys.argv[2], encoding="utf-8") as f:
            print(decision(json.load(f), sys.argv[1]))
    except (OSError, ValueError, TypeError, KeyError) as exc:
        sys.exit(str(exc))
