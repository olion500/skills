---
name: backmerge
description: "Safely backmerge a git-flow downstream branch (master/main → develop): create a backmerge branch, merge, auto-resolve conflicts caused by cherry-picked commits (same patch, different hash) by taking the develop side, analyze genuine conflicts for the user to decide, then push and open a PR.\nTRIGGER when: user says backmerge, back-merge, back merge, 백머지; asks to merge master/main back into develop; mentions hotfix 반영, release를 develop에 머지, sync develop with master, downstream merge; or asks why develop is behind master after a hotfix.\nSKIP: normal feature-branch merges into develop; forward merges (develop → release/master); rebasing feature branches."
---

# Backmerge

Merge a downstream git-flow branch (usually `master`) back into an upstream one (usually `develop`) through a reviewable PR, without losing changes and without hand-resolving conflicts that a cherry-pick already made obsolete.

## Arguments

`/backmerge [repo] [base] [source]`

- `repo` — path to the repository. Default: current directory.
- `base` — branch that receives the merge. Default: `develop`.
- `source` — branch being merged back. Default: `master`, falling back to `main` if `master` does not exist on origin.

## Workflow

### 1. Preflight

```bash
git -C <repo> rev-parse --is-inside-work-tree   # must be a repo
git -C <repo> fetch origin --prune
git -C <repo> rev-list --count origin/<base>..origin/<source>
```

If the count is 0, report that `<base>` already contains `<source>` — no backmerge needed — and stop.

Otherwise summarize what will be merged before doing anything:

```bash
git -C <repo> log --oneline --cherry-pick --right-only origin/<base>...origin/<source>
```

This lists source commits with NO patch-equivalent in base (the real content of the backmerge). Show this list to the user in the final report.

### 2. Create the backmerge branch in an isolated worktree

Never work in the user's checkout — their current branch, uncommitted files, and editor state must survive the backmerge untouched. Work in a separate worktree:

```bash
wt="${TMPDIR:-/tmp}/backmerge/<repo-name>-<YYYYMMDD>"
git -C <repo> worktree add -b backmerge/<source>-to-<base>-<YYYYMMDD> "$wt" origin/<base>
```

Branch name: `backmerge/<source>-to-<base>-<YYYYMMDD>` (today's date). Run every subsequent git command inside `$wt`.

Because the worktree is separate, a dirty working tree in the user's checkout is NOT a blocker — soften the step-1 cleanliness check to a note in the report.

If the branch or worktree path already exists (a previous run), ask the user whether to resume it or recreate it (`git worktree remove --force "$wt"` + `git branch -D <branch>`, then start fresh). Do not silently reuse.

### 3. Merge

```bash
git -C "$wt" merge origin/<source>
```

Never use `-X ours` or `-X theirs`. A global strategy silently throws away source-only fixes (or base-side progress) in every conflicted file; resolution must be decided per file, which is what steps 4–5 do.

If the merge completes without conflicts, skip to step 6.

### 4. Classify conflicts

Run the bundled classifier (read-only) from inside the worktree:

```bash
bash <skill-dir>/scripts/classify_conflicts.sh origin/<base> origin/<source>
```

It prints one TSV line per conflicted file: `AUTO` or `MANUAL`, the file, and a reason.

- **AUTO** — every source-side commit touching the file is patch-equivalent to a commit already in base (a cherry-pick whose hash changed). The base side already contains everything; the conflict only exists because develop evolved further. Resolve by taking the base side:

  ```bash
  git checkout --ours -- <file> && git add <file>
  ```

- **MANUAL** — at least one source-only commit touched the file (the reason lists its short hashes), or it is a delete/binary conflict. Go to step 5.

### 5. Analyze genuine conflicts, ask the user

For each MANUAL file, build a short analysis before asking anything. The user needs enough context to decide without opening the files themselves:

- Read the conflict markers in the file.
- For each side, show the causing commits: `git log --no-merges --format='%h %an %ad %s' --date=format:'%Y-%m-%d %H:%M' origin/<base>..origin/<source> -- <file>` (source side) and `origin/<source>..origin/<base> -- <file>` (base side).
- Summarize in one or two sentences: what each side changed, which is newer, and what breaks if the other side is chosen.
- Check for the most common MANUAL pattern first: the source commit was cherry-picked to base and then *further improved* there (patch-id no longer matches, but base is a strict superset). Evidence: base's version contains the source fix's behavior plus extra changes, and the source-only commit's content appears inside base's history. If so, recommend the base side and say why nothing is lost.

Then ask per file (AskUserQuestion) with these options: take the base/develop side, take the source/master side, or have Claude write a combined resolution and show it before staging. Apply the choice with `git checkout --ours|--theirs -- <file> && git add <file>`, or by editing the file for a combined resolution.

If running non-interactively (no way to ask), do not guess: stop before resolving MANUAL files and report the analysis — unless the user's request already stated a preference (e.g. "conflicts: prefer master side").

### 6. Commit, push, PR

Complete the merge with a message that records what was done:

```
Backmerge <source> into <base> (<N> commits)

Auto-resolved (cherry-pick equivalents, took <base> side):
- <file>: <reason>

Manually resolved:
- <file>: <choice and why>
```

Before pushing, verify the invariant that makes a backmerge a backmerge — the new merge commit must fully contain the source branch:

```bash
git merge-base --is-ancestor origin/<source> HEAD && echo OK
```

If this fails, something went wrong in resolution (e.g. a checkout that dropped the merge state); stop and investigate rather than pushing.

Push the branch to origin. Check whether an open backmerge PR into `<base>` already exists (`az repos pr list` / `gh pr list`) — if so, report it instead of creating a duplicate. Otherwise create a PR targeting `<base>`:

- Remote on `dev.azure.com` → use the azure-devops skill (`az repos pr create`).
- Remote on `github.com` → use `gh pr create`.
- Otherwise → push only and give the user the branch name.

Put the step-1 commit summary and the resolution lists in the PR description, and include this warning:

> ⚠️ Complete this PR with a **merge commit** (no squash, no rebase). Squashing breaks the merge ancestry, so every future backmerge will re-raise the same conflicts.

### 7. Clean up the worktree

Once the branch is pushed (and the PR created), the worktree and local branch have served their purpose — the remote branch is the deliverable:

```bash
git -C <repo> worktree remove "$wt"
git -C <repo> branch -D backmerge/<source>-to-<base>-<YYYYMMDD>   # safe: it is on origin
```

If the run stops early (no-op, or MANUAL conflicts awaiting the user's decision), do NOT clean up — tell the user the worktree path so the in-progress merge can be resumed. Clean up an abandoned run with `git worktree remove --force` + `git branch -D`.

## Why patch-id classification is trustworthy — and when it isn't

`git cherry` compares patch-ids (a hash of the diff itself), so a commit cherry-picked with a changed hash still matches. It does NOT match when the patch was modified during cherry-pick, or when one side squashed several commits into one. Those cases fall through to MANUAL — the safe direction: the skill never auto-discards a change it cannot prove is already in base.
