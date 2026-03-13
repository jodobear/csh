#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${ROOT_DIR}/.csh-runtime/contextvm-private-demo"
XDG_CONFIG_HOME="${RUNTIME_DIR}/xdg-config"
TMUX_SOCKET="${RUNTIME_DIR}/ops-tmux.sock"
TMUX_SESSION_NAME="csh-contextvm-gateway"
SERVER_ENV_FILE="${RUNTIME_DIR}/server.env"
CLIENT_ENV_FILE="${RUNTIME_DIR}/client.env"
SERVER_KEY_FILE="${RUNTIME_DIR}/server.key"
CLIENT_KEY_FILE="${RUNTIME_DIR}/client.key"
GATEWAY_LOG_FILE="${RUNTIME_DIR}/gateway.log"

usage() {
  cat <<'EOF'
Usage:
  scripts/contextvm-private-demo.sh setup --relay-url <url> [--relay-url <url> ...] [--server-relay-url <url>] [--client-relay-url <url>] [--session-name <name>]
  scripts/contextvm-private-demo.sh start
  scripts/contextvm-private-demo.sh stop
  scripts/contextvm-private-demo.sh status
  scripts/contextvm-private-demo.sh print-client

What it does:
  - generates demo Nostr keys with nak
  - writes server/client env files under .csh-runtime/contextvm-private-demo/
  - starts or restarts the private ContextVM gateway in tmux
  - prints the exact demo command to run from this host or another client machine

Notes:
  - pass relay URLs that are reachable from the client machine that will run demo:contextvm
  - this script assumes bun, tmux, and nak are installed
EOF
}

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 1
  fi
}

validate_relay_url() {
  local relay_url="$1"
  if [[ ! "${relay_url}" =~ ^wss?://[^[:space:]]+$ ]]; then
    echo "Invalid relay URL: ${relay_url}" >&2
    exit 1
  fi
  if [[ "${relay_url}" =~ ^wss?://[^/]+:$ ]]; then
    echo "Relay URL is missing a port after the colon: ${relay_url}" >&2
    exit 1
  fi
}

nak_cmd() {
  XDG_CONFIG_HOME="${XDG_CONFIG_HOME}" nak "$@"
}

ensure_runtime_dir() {
  mkdir -p "${RUNTIME_DIR}" "${XDG_CONFIG_HOME}"
}

generate_key_if_missing() {
  local target_file="$1"
  if [[ ! -f "${target_file}" ]]; then
    nak_cmd key generate > "${target_file}"
    chmod 600 "${target_file}"
  fi
}

get_file_contents() {
  local target_file="$1"
  tr -d '\n' < "${target_file}"
}

write_env_files() {
  local server_relay_urls_csv="$1"
  local client_relay_urls_csv="$2"
  local server_private_key client_private_key server_pubkey client_pubkey

  server_private_key="$(get_file_contents "${SERVER_KEY_FILE}")"
  client_private_key="$(get_file_contents "${CLIENT_KEY_FILE}")"
  server_pubkey="$(nak_cmd key public "${server_private_key}" | tr -d '\n')"
  client_pubkey="$(nak_cmd key public "${client_private_key}" | tr -d '\n')"

  cat > "${SERVER_ENV_FILE}" <<EOF
export CSH_NOSTR_PRIVATE_KEY=${server_private_key}
export CSH_NOSTR_RELAY_URLS=${server_relay_urls_csv}
export CSH_ALLOWED_PUBLIC_KEYS=${client_pubkey}
export CSH_SERVER_NAME="csh private shell"
export CSH_SERVER_ABOUT="Private ContextVM shell gateway"
EOF

  cat > "${CLIENT_ENV_FILE}" <<EOF
export CSH_CLIENT_PRIVATE_KEY=${client_private_key}
export CSH_SERVER_PUBKEY=${server_pubkey}
export CSH_NOSTR_RELAY_URLS=${client_relay_urls_csv}
EOF

  chmod 600 "${SERVER_ENV_FILE}" "${CLIENT_ENV_FILE}"
}

tmux_cmd() {
  tmux -S "${TMUX_SOCKET}" "$@"
}

start_gateway() {
  if tmux_cmd has-session -t "${TMUX_SESSION_NAME}" 2>/dev/null; then
    echo "Gateway tmux session already running: ${TMUX_SESSION_NAME}"
    return
  fi

  : > "${GATEWAY_LOG_FILE}"

  local command
  command=$(
    cat <<EOF
cd "${ROOT_DIR}"
source "${SERVER_ENV_FILE}"
bun run start:contextvm >> "${GATEWAY_LOG_FILE}" 2>&1
EOF
  )

  tmux_cmd new-session -d -s "${TMUX_SESSION_NAME}" "${command}"
}

restart_gateway_if_running() {
  if tmux_cmd has-session -t "${TMUX_SESSION_NAME}" 2>/dev/null; then
    tmux_cmd kill-session -t "${TMUX_SESSION_NAME}"
    echo "Restarting ${TMUX_SESSION_NAME} to apply updated relay configuration"
  fi
}

print_status() {
  echo "Runtime directory: ${RUNTIME_DIR}"
  if tmux_cmd has-session -t "${TMUX_SESSION_NAME}" 2>/dev/null; then
    echo "Gateway session: running (${TMUX_SESSION_NAME})"
    echo "Recent gateway log:"
    tail -n 20 "${GATEWAY_LOG_FILE}" 2>/dev/null || true
  else
    echo "Gateway session: not running"
  fi
}

print_client_instructions() {
  local server_pubkey client_pubkey relay_urls_csv
  server_pubkey="$(grep '^export CSH_SERVER_PUBKEY=' "${CLIENT_ENV_FILE}" | cut -d= -f2-)"
  client_pubkey="$(grep '^export CSH_ALLOWED_PUBLIC_KEYS=' "${SERVER_ENV_FILE}" | cut -d= -f2-)"
  relay_urls_csv="$(grep '^export CSH_NOSTR_RELAY_URLS=' "${CLIENT_ENV_FILE}" | cut -d= -f2-)"

  cat <<EOF
Server-side bootstrap is ready.

Paths:
  server env: ${SERVER_ENV_FILE}
  client env: ${CLIENT_ENV_FILE}
  gateway log: ${GATEWAY_LOG_FILE}
  tmux socket: ${TMUX_SOCKET}
  tmux session: ${TMUX_SESSION_NAME}

Pubkeys:
  server pubkey: ${server_pubkey}
  allowed client pubkey: ${client_pubkey}
  relay urls: ${relay_urls_csv}

Run from this server checkout:
  source "${CLIENT_ENV_FILE}"
  bun run demo:contextvm

Run from another client machine with a csh checkout:
  export CSH_CLIENT_PRIVATE_KEY=$(grep '^export CSH_CLIENT_PRIVATE_KEY=' "${CLIENT_ENV_FILE}" | cut -d= -f2-)
  export CSH_SERVER_PUBKEY=${server_pubkey}
  export CSH_NOSTR_RELAY_URLS=${relay_urls_csv}
  bun run demo:contextvm

Useful tmux commands:
  tmux -S "${TMUX_SOCKET}" capture-pane -p -t "${TMUX_SESSION_NAME}:0.0"
  tmux -S "${TMUX_SOCKET}" attach -t "${TMUX_SESSION_NAME}"
EOF
}

setup_command() {
  local relay_urls=()
  local server_relay_urls=()
  local client_relay_urls=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --relay-url)
        relay_urls+=("$2")
        shift 2
        ;;
      --server-relay-url)
        server_relay_urls+=("$2")
        shift 2
        ;;
      --client-relay-url)
        client_relay_urls+=("$2")
        shift 2
        ;;
      --session-name)
        TMUX_SESSION_NAME="$2"
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        echo "Unknown argument: $1" >&2
        usage >&2
        exit 1
        ;;
    esac
  done

  if [[ ${#relay_urls[@]} -eq 0 ]]; then
    if [[ ${#server_relay_urls[@]} -eq 0 || ${#client_relay_urls[@]} -eq 0 ]]; then
      echo "setup requires either --relay-url or both --server-relay-url and --client-relay-url" >&2
      usage >&2
      exit 1
    fi
  else
    if [[ ${#server_relay_urls[@]} -eq 0 ]]; then
      server_relay_urls=("${relay_urls[@]}")
    fi
    if [[ ${#client_relay_urls[@]} -eq 0 ]]; then
      client_relay_urls=("${relay_urls[@]}")
    fi
  fi

  ensure_runtime_dir
  generate_key_if_missing "${SERVER_KEY_FILE}"
  generate_key_if_missing "${CLIENT_KEY_FILE}"

  local relay_url
  for relay_url in "${server_relay_urls[@]}"; do
    validate_relay_url "${relay_url}"
  done
  for relay_url in "${client_relay_urls[@]}"; do
    validate_relay_url "${relay_url}"
  done

  local server_relay_urls_csv client_relay_urls_csv
  server_relay_urls_csv="$(IFS=,; echo "${server_relay_urls[*]}")"
  client_relay_urls_csv="$(IFS=,; echo "${client_relay_urls[*]}")"

  write_env_files "${server_relay_urls_csv}" "${client_relay_urls_csv}"
  restart_gateway_if_running
  start_gateway
  print_client_instructions
}

start_command() {
  ensure_runtime_dir
  if [[ ! -f "${SERVER_ENV_FILE}" ]]; then
    echo "Missing ${SERVER_ENV_FILE}. Run setup first." >&2
    exit 1
  fi
  start_gateway
  print_status
}

stop_command() {
  ensure_runtime_dir
  if tmux_cmd has-session -t "${TMUX_SESSION_NAME}" 2>/dev/null; then
    tmux_cmd kill-session -t "${TMUX_SESSION_NAME}"
    echo "Stopped ${TMUX_SESSION_NAME}"
  else
    echo "Gateway session is not running."
  fi
}

print_client_command() {
  ensure_runtime_dir
  if [[ ! -f "${CLIENT_ENV_FILE}" || ! -f "${SERVER_ENV_FILE}" ]]; then
    echo "Missing env files. Run setup first." >&2
    exit 1
  fi
  print_client_instructions
}

main() {
  require_command bun
  require_command tmux
  require_command nak

  local command_name="${1:-}"
  if [[ -z "${command_name}" ]]; then
    usage
    exit 1
  fi
  shift

  case "${command_name}" in
    setup)
      setup_command "$@"
      ;;
    start)
      start_command
      ;;
    stop)
      stop_command
      ;;
    status)
      ensure_runtime_dir
      print_status
      ;;
    print-client)
      print_client_command
      ;;
    --help|-h|help)
      usage
      ;;
    *)
      echo "Unknown command: ${command_name}" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
