#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="${CSH_INSTALL_PREFIX:-$HOME/.local}"
FORCE=0
SKIP_RUNTIME=0

while (($# > 0)); do
  case "$1" in
    --prefix)
      PREFIX="$2"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --no-runtime)
      SKIP_RUNTIME=1
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required to install csh" >&2
  exit 1
fi

BIN_DIR="$PREFIX/bin"
COMPLETIONS_DIR="$PREFIX/share/csh/completions"
LAUNCHER_PATH="$BIN_DIR/csh"
MARKER="# csh-managed-launcher"

mkdir -p "$BIN_DIR" "$COMPLETIONS_DIR"

if [[ -e "$LAUNCHER_PATH" ]] && ! grep -q "$MARKER" "$LAUNCHER_PATH" 2>/dev/null && [[ "$FORCE" != "1" ]]; then
  echo "Refusing to overwrite existing $LAUNCHER_PATH without --force" >&2
  exit 1
fi

if [[ "$SKIP_RUNTIME" != "1" ]]; then
  bash "$ROOT_DIR/scripts/install-runtime.sh"
fi

cat >"$LAUNCHER_PATH" <<EOF
#!/usr/bin/env bash
$MARKER
set -euo pipefail
ROOT_DIR="$ROOT_DIR"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required to run csh" >&2
  exit 1
fi

exec bun "\$ROOT_DIR/scripts/csh.ts" "\$@"
EOF
chmod 0755 "$LAUNCHER_PATH"

bun "$ROOT_DIR/scripts/csh.ts" completion bash >"$COMPLETIONS_DIR/csh.bash"
bun "$ROOT_DIR/scripts/csh.ts" completion zsh >"$COMPLETIONS_DIR/_csh"
bun "$ROOT_DIR/scripts/csh.ts" completion fish >"$COMPLETIONS_DIR/csh.fish"

echo "Installed csh launcher: $LAUNCHER_PATH"
echo "Installed completion files: $COMPLETIONS_DIR"

case ":${PATH:-}:" in
  *:"$BIN_DIR":*)
    ;;
  *)
    echo "Add $BIN_DIR to PATH to run csh without the repo checkout path." >&2
    ;;
esac

echo "Next steps:"
echo "  csh version"
echo "  csh doctor"
echo "  csh status"
