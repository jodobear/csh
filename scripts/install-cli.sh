#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTION="install"
PREFIX="${CSH_INSTALL_PREFIX:-$HOME/.local}"
FORCE=0
SKIP_RUNTIME=0
BIN_DIR=""
COMPLETIONS_DIR=""
LAUNCHER_PATH=""
MARKER="# csh-managed-launcher"

if (($# > 0)); then
  case "$1" in
    install|upgrade|uninstall)
      ACTION="$1"
      shift
      ;;
  esac
fi

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

BIN_DIR="$PREFIX/bin"
COMPLETIONS_DIR="$PREFIX/share/csh/completions"
LAUNCHER_PATH="$BIN_DIR/csh"

managed_launcher() {
  [[ -e "$LAUNCHER_PATH" ]] && grep -q "$MARKER" "$LAUNCHER_PATH" 2>/dev/null
}

if ! command -v bun >/dev/null 2>&1 && [[ "$ACTION" != "uninstall" ]]; then
  echo "bun is required to ${ACTION} csh" >&2
  exit 1
fi

case "$ACTION" in
  uninstall)
    if [[ -e "$LAUNCHER_PATH" ]] && ! managed_launcher && [[ "$FORCE" != "1" ]]; then
      echo "Refusing to remove non-managed launcher $LAUNCHER_PATH without --force" >&2
      exit 1
    fi

    rm -f "$LAUNCHER_PATH"
    rm -f "$COMPLETIONS_DIR/csh.bash" "$COMPLETIONS_DIR/_csh" "$COMPLETIONS_DIR/csh.fish"
    rmdir "$COMPLETIONS_DIR" 2>/dev/null || true
    rmdir "$PREFIX/share/csh" 2>/dev/null || true
    echo "Removed csh launcher from $LAUNCHER_PATH"
    echo "Removed completion files from $COMPLETIONS_DIR"
    exit 0
    ;;
  install|upgrade)
    ;;
  *)
    echo "Unsupported action: $ACTION" >&2
    exit 1
    ;;
esac

mkdir -p "$BIN_DIR" "$COMPLETIONS_DIR"

if [[ -e "$LAUNCHER_PATH" ]] && ! managed_launcher && [[ "$FORCE" != "1" ]]; then
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

if [[ "$ACTION" == "upgrade" ]]; then
  echo "Upgraded csh launcher: $LAUNCHER_PATH"
else
  echo "Installed csh launcher: $LAUNCHER_PATH"
fi
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
