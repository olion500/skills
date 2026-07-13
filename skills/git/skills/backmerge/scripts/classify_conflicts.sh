#!/usr/bin/env bash
# Classify merge conflicts during a backmerge as AUTO or MANUAL.
#
# AUTO   = every source-side commit that touched the file has a patch-equivalent
#          commit in the base branch (cherry-pick with a different hash). The
#          base side already contains everything the source side has, so taking
#          the base ("ours") side loses nothing.
# MANUAL = at least one source-only commit touched the file (a genuine change
#          that exists only on the source branch), or the conflict is a
#          delete/binary conflict that needs human judgment.
#
# Usage: classify_conflicts.sh <base-ref> <source-ref>
#   Run inside a repository with an in-progress merge of <source-ref> into a
#   branch created from <base-ref> (e.g. base-ref=origin/develop,
#   source-ref=origin/master).
#
# Output: one TSV line per conflicted file:
#   AUTO\t<file>\t<reason>
#   MANUAL\t<file>\t<reason>   (for source-only commits, reason lists their short hashes)
#
# Read-only: never modifies the index or working tree.
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <base-ref> <source-ref>" >&2
  exit 2
fi
base=$1
source=$2

git rev-parse --verify --quiet "$base^{commit}" >/dev/null || { echo "error: unknown ref: $base" >&2; exit 2; }
git rev-parse --verify --quiet "$source^{commit}" >/dev/null || { echo "error: unknown ref: $source" >&2; exit 2; }

if git diff --name-only --diff-filter=U | grep -q .; then :; else
  echo "no unmerged files" >&2
  exit 0
fi

# Commits in source whose patch also exists in base — git cherry marks them '-'.
# Merge commits have no patch-id and never match, which is why cause-commit
# collection below uses --no-merges.
equiv=$(git cherry "$base" "$source" | awk '$1 == "-" { print $2 }')

has_stage() {
  git ls-files -u -- "$1" | awk -v s="$2" '$3 == s' | grep -q .
}

while IFS= read -r -d '' file; do
  if ! has_stage "$file" 2; then
    printf 'MANUAL\t%s\t%s\n' "$file" "deleted on base side (ours)"
    continue
  fi
  if ! has_stage "$file" 3; then
    printf 'MANUAL\t%s\t%s\n' "$file" "deleted on source side (theirs)"
    continue
  fi
  # git prints "-\t-\t<file>" in numstat output when either side is binary
  if git diff --numstat "$base" "$source" -- "$file" | grep -q '^-'; then
    printf 'MANUAL\t%s\t%s\n' "$file" "binary file"
    continue
  fi

  cause=$(git log --no-merges --format=%H "$base..$source" -- "$file")
  if [[ -z "$cause" ]]; then
    printf 'MANUAL\t%s\t%s\n' "$file" "no source-side commits found (rename or merge-introduced change)"
    continue
  fi

  unmatched=""
  for c in $cause; do
    if ! grep -qx "$c" <<<"$equiv"; then
      unmatched+="${unmatched:+,}$(git log -1 --format=%h "$c")"
    fi
  done

  if [[ -z "$unmatched" ]]; then
    printf 'AUTO\t%s\t%s\n' "$file" "all source-side commits are patch-equivalent in base"
  else
    printf 'MANUAL\t%s\t%s\n' "$file" "source-only commits: $unmatched"
  fi
done < <(git diff --name-only --diff-filter=U -z)
