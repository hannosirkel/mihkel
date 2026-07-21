#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT

git init --bare --quiet "$test_root/remote.git"
git init --quiet --initial-branch=main "$test_root/work"
git -C "$test_root/work" config user.name "Mihkel hook test"
git -C "$test_root/work" config user.email "mihkel-hook-test@example.invalid"
git -C "$test_root/work" remote add origin "$test_root/remote.git"
mkdir -p "$test_root/work/.githooks" "$test_root/bin"
cp "$repo_root/.githooks/pre-push" "$test_root/work/.githooks/pre-push"
chmod +x "$test_root/work/.githooks/pre-push"
git -C "$test_root/work" config core.hooksPath .githooks

cat >"$test_root/bin/gitleaks" <<'SHIM'
#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" == "git" ]]
shift
log_opts=""
while (($#)); do
  case "$1" in
    --redact)
      shift
      ;;
    --log-opts)
      log_opts="${2:-}"
      shift 2
      ;;
    *)
      exit 2
      ;;
  esac
done
[[ -n "$log_opts" ]]
if git log -p "$log_opts" | grep -q 'EXAMPLE_SECRET_DO_NOT_COMMIT'; then
  exit 1
fi
SHIM
chmod +x "$test_root/bin/gitleaks"

printf '%s\n' 'EXAMPLE_SECRET_DO_NOT_COMMIT' >"$test_root/work/credential.txt"
git -C "$test_root/work" add credential.txt
git -C "$test_root/work" commit --quiet -m 'test: add fake credential'

if PATH="$test_root/bin:$PATH" git -C "$test_root/work" push origin main \
  >"$test_root/rejected.out" 2>&1; then
  echo "secret-bearing push unexpectedly succeeded" >&2
  exit 1
fi
if grep -q 'EXAMPLE_SECRET_DO_NOT_COMMIT' "$test_root/rejected.out"; then
  echo "rejected push exposed credential contents" >&2
  exit 1
fi

rm "$test_root/work/credential.txt"
printf '%s\n' 'ordinary workspace text' >"$test_root/work/README.md"
git -C "$test_root/work" add --all
git -C "$test_root/work" commit --quiet --amend -m 'test: add safe text'
PATH="$test_root/bin:$PATH" git -C "$test_root/work" push --quiet origin main

echo "pre-push hook tests passed"
