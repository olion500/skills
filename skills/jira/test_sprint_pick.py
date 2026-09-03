#!/usr/bin/env python3
"""Fixtures for _pick_latest_sprint. Run: python3 .claude/skills/jira/test_sprint_pick.py

The two-active-sprint cases cannot be observed live (board 14 has one active sprint
most of the time), so they are pinned here from real /rest/agile/1.0 payloads.
"""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("jira_cli", Path(__file__).parent / "jira-cli.py")
jira_cli = importlib.util.module_from_spec(spec)
spec.loader.exec_module(jira_cli)
pick = jira_cli._pick_latest_sprint

BACKEND_348 = {"id": 5934, "name": "9/1 Backend Sprint 348", "originBoardId": 14,
               "startDate": "2026-09-01T05:29:33.966Z", "endDate": "2026-09-07T15:00:00.000Z"}
BACKEND_349 = {"id": 5935, "name": "9/8 Backend Sprint 349", "originBoardId": 14,
               "startDate": "2026-09-08T01:00:00.000Z", "endDate": "2026-09-15T01:00:00.000Z"}
MW_2026_33 = {"id": 5895, "name": "MW Sprint 2026-33", "originBoardId": 6,
              "startDate": "2026-08-31T05:00:23.149Z", "endDate": "2026-09-07T05:00:00.000Z"}

CASES = [
    ("single active", [BACKEND_348], 5934),
    ("two active, normal overlap", [BACKEND_348, BACKEND_349], 5935),
    # 348 slips and gets extended past 349 -- endDate would pick the older sprint
    ("old sprint extended past its successor",
     [{**BACKEND_348, "endDate": "2026-09-30T15:00:00.000Z"}, BACKEND_349], 5935),
    # board 14's sprint list includes sprints owned by other boards
    ("MW Frontend sprint leaks in", [BACKEND_348, MW_2026_33], 5934),
    ("MW sprint runs later than ours", [BACKEND_348, {**MW_2026_33, "startDate": "2026-09-05T05:00:00.000Z",
                                                      "endDate": "2026-09-12T05:00:00.000Z"}], 5934),
    ("only foreign sprints active -> no sprint", [MW_2026_33], 0),
    ("nothing active -> no sprint", [], 0),
    ("API order must not matter", [BACKEND_349, BACKEND_348], 5935),
    ("startDate missing falls back to id", [{**BACKEND_348, "startDate": None}, BACKEND_349], 5935),
]

failed = 0
for label, sprints, want in CASES:
    got = pick(sprints, 14)
    ok = got == want
    failed += not ok
    print(f"{'PASS' if ok else 'FAIL'}  want={want:<5} got={got:<5} {label}")
assert not failed, f"{failed} case(s) failed"
print(f"\n{len(CASES)} passed")
