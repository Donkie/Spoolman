#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/pr-preflight.sh <pr> [options]

Examples:
  scripts/pr-preflight.sh 874 --expected-worktree /private/tmp/spoolman_pr874_runtime_iQoS --expected-branch feat/complex-fields-framework --strict
  scripts/pr-preflight.sh 874 --expected-worktree /private/tmp/spoolman_pr874_runtime_iQoS --expected-branch feat/complex-fields-framework --strict --require-container --require-url
  scripts/pr-preflight.sh 876 --expected-branch tmp/pr876-template-filters --strict

Options:
  --expected-worktree <abs-path>   Exact worktree path required for strict checks.
  --expected-branch <name>         Exact branch name required for strict checks.
  --require-container              Require spoolman_pr<PR>_8<PR> to be running.
  --require-url                    Require localhost:8<PR> to respond with HTTP status.
  --strict                         Exit non-zero when any mismatch is found.
EOF
}

if [[ "${1:-}" == "" || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if ! [[ "$1" =~ ^[0-9]+$ ]]; then
  echo "ERROR: first argument must be a numeric PR id." >&2
  usage
  exit 1
fi

PR="$1"
shift

EXPECTED_WORKTREE=""
EXPECTED_BRANCH=""
REQUIRE_CONTAINER=0
REQUIRE_URL=0
STRICT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --expected-worktree)
      EXPECTED_WORKTREE="${2:-}"
      shift 2
      ;;
    --expected-branch)
      EXPECTED_BRANCH="${2:-}"
      shift 2
      ;;
    --require-container)
      REQUIRE_CONTAINER=1
      shift
      ;;
    --require-url)
      REQUIRE_URL=1
      shift
      ;;
    --strict)
      STRICT=1
      shift
      ;;
    *)
      echo "ERROR: unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "ERROR: not inside a git repository." >&2
  exit 1
fi

CURRENT_PWD="$(pwd -P)"
REPO_ROOT="$(git rev-parse --show-toplevel)"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
HEAD_LINE="$(git log --oneline -n 1)"

PORT="8${PR}"
CONTAINER="spoolman_pr${PR}_${PORT}"
DB_PATH="/tmp/spoolman_pr_${PR}_data"
URL="http://localhost:${PORT}"

echo "PR            : #${PR}"
echo "Repo Root     : ${REPO_ROOT}"
echo "Worktree      : ${CURRENT_PWD}"
echo "Branch        : ${CURRENT_BRANCH}"
echo "HEAD          : ${HEAD_LINE}"
echo "Container     : ${CONTAINER}"
echo "Port          : ${PORT}"
echo "DB Mount      : ${DB_PATH}"
echo "URL           : ${URL}"
echo "Strict Mode   : ${STRICT}"

ERRORS=0
WARNINGS=0

if [[ -n "${EXPECTED_WORKTREE}" && "${CURRENT_PWD}" != "${EXPECTED_WORKTREE}" ]]; then
  echo "MISMATCH: worktree '${CURRENT_PWD}' != expected '${EXPECTED_WORKTREE}'" >&2
  ERRORS=1
fi

if [[ -n "${EXPECTED_BRANCH}" && "${CURRENT_BRANCH}" != "${EXPECTED_BRANCH}" ]]; then
  echo "MISMATCH: branch '${CURRENT_BRANCH}' != expected '${EXPECTED_BRANCH}'" >&2
  ERRORS=1
fi

if [[ "${CURRENT_BRANCH}" == "HEAD" ]]; then
  echo "MISMATCH: detached HEAD detected. Switch to the PR branch before editing." >&2
  ERRORS=1
fi

# If no explicit expected values are provided, still surface a context warning when
# neither path nor branch appears to include the PR id.
if [[ -z "${EXPECTED_WORKTREE}" && -z "${EXPECTED_BRANCH}" ]]; then
  if ! [[ "${CURRENT_PWD}" =~ ${PR} || "${CURRENT_BRANCH}" =~ ${PR} ]]; then
    echo "WARNING: PR id '${PR}' not found in current worktree path or branch name." >&2
    WARNINGS=1
  fi
fi

if command -v docker >/dev/null 2>&1; then
  echo "Docker        :"
  CONTAINER_LINE="$(docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}' | awk -v name="${CONTAINER}" '$1 == name {print $0}')"
  if [[ -n "${CONTAINER_LINE}" ]]; then
    echo "  ${CONTAINER_LINE}"
  else
    echo "  (not running)"
    if [[ "${REQUIRE_CONTAINER}" -eq 1 ]]; then
      echo "MISMATCH: required container '${CONTAINER}' is not running." >&2
      ERRORS=1
    fi
  fi
else
  echo "Docker        : not found"
  if [[ "${REQUIRE_CONTAINER}" -eq 1 ]]; then
    echo "MISMATCH: --require-container specified but docker is not available." >&2
    ERRORS=1
  fi
fi

if [[ "${REQUIRE_URL}" -eq 1 ]]; then
  if command -v curl >/dev/null 2>&1; then
    HTTP_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "${URL}" || true)"
    echo "URL Probe     : ${HTTP_CODE}"
    if [[ "${HTTP_CODE}" == "000" ]]; then
      echo "MISMATCH: URL '${URL}' is not reachable." >&2
      ERRORS=1
    fi
  else
    echo "URL Probe     : curl not found"
    echo "MISMATCH: --require-url specified but curl is not available." >&2
    ERRORS=1
  fi
fi

if [[ "${ERRORS}" -eq 0 ]]; then
  if [[ "${WARNINGS}" -eq 0 ]]; then
    echo "RESULT        : PASS"
  else
    echo "RESULT        : PASS (with warnings)"
  fi
else
  echo "RESULT        : FAIL"
fi

if [[ "${STRICT}" -eq 1 && "${ERRORS}" -ne 0 ]]; then
  echo "ERROR: strict preflight failed." >&2
  exit 2
fi
