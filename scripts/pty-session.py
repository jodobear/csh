#!/usr/bin/env python3
import argparse
import base64
import errno
import json
import os
import select
import shlex
import signal
import struct
import termios
from typing import Any


def set_winsize(fd: int, rows: int, cols: int) -> None:
    import fcntl

    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


def kill_process_group(pid: int, sig: signal.Signals) -> None:
    try:
        pgid = os.getpgid(pid)
    except ProcessLookupError:
        return

    try:
        os.killpg(pgid, sig)
    except ProcessLookupError:
        return


def parse_signal(name: str) -> signal.Signals:
    try:
        return signal.Signals[name]
    except KeyError as error:
        raise ValueError(f"unknown signal: {name}") from error


def build_argv(command: str) -> list[str]:
    argv = shlex.split(command)
    if not argv:
        raise ValueError("command must not be empty")
    return argv


def atomic_write_text(path: str, text: str) -> None:
    temp_path = f"{path}.tmp-{os.getpid()}"
    with open(temp_path, "w", encoding="utf-8") as handle:
        handle.write(text)
    os.chmod(temp_path, 0o600)
    os.replace(temp_path, path)
    os.chmod(path, 0o600)


def atomic_write_bytes(path: str, payload: bytes) -> None:
    temp_path = f"{path}.tmp-{os.getpid()}"
    with open(temp_path, "wb") as handle:
        handle.write(payload)
    os.chmod(temp_path, 0o600)
    os.replace(temp_path, path)
    os.chmod(path, 0o600)


def load_json(path: str, default: dict[str, Any]) -> dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            loaded = json.load(handle)
        if isinstance(loaded, dict):
            return {**default, **loaded}
    except FileNotFoundError:
        pass
    except json.JSONDecodeError:
        pass
    return dict(default)


def now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--session-dir", required=True)
    parser.add_argument("--command", required=True)
    parser.add_argument("--cwd")
    parser.add_argument("--cols", type=int, required=True)
    parser.add_argument("--rows", type=int, required=True)
    parser.add_argument("--output-byte-limit", type=int, required=True)
    args = parser.parse_args()

    os.makedirs(args.session_dir, exist_ok=True)
    os.chmod(args.session_dir, 0o700)

    session_path = os.path.join(args.session_dir, "session.json")
    runtime_path = os.path.join(args.session_dir, "runtime.json")
    output_path = os.path.join(args.session_dir, "output.bin")
    control_path = os.path.join(args.session_dir, "control.fifo")
    replies_dir = os.path.join(args.session_dir, "replies")
    os.makedirs(replies_dir, exist_ok=True)
    os.chmod(replies_dir, 0o700)

    default_runtime = {
        "runtimePid": None,
        "helperPid": None,
        "revision": 0,
        "outputBaseOffset": 0,
        "exitStatus": None,
    }
    runtime = load_json(runtime_path, default_runtime)

    try:
        with open(output_path, "rb") as handle:
            output_buffer = bytearray(handle.read())
    except FileNotFoundError:
        output_buffer = bytearray()

    revision = max(int(runtime.get("revision", 0)), int(runtime.get("outputBaseOffset", 0)) + len(output_buffer))
    output_base_offset = revision - len(output_buffer)

    if not os.path.exists(control_path):
        os.mkfifo(control_path, 0o600)
    os.chmod(control_path, 0o600)

    pid, master_fd = os.forkpty()
    if pid == 0:
        if args.cwd:
            os.chdir(args.cwd)
        os.environ["TERM"] = os.environ.get("TERM", "xterm-256color")
        argv = build_argv(args.command)
        os.execvpe(argv[0], argv, os.environ.copy())
        raise SystemExit(127)

    set_winsize(master_fd, args.rows, args.cols)
    control_fd = os.open(control_path, os.O_RDONLY | os.O_NONBLOCK)
    control_keepalive_fd = os.open(control_path, os.O_WRONLY | os.O_NONBLOCK)
    control_buffer = b""

    def persist_runtime(**patch: Any) -> None:
        runtime.update(patch)
        atomic_write_text(runtime_path, json.dumps(runtime, indent=2) + "\n")

    def persist_output() -> None:
        atomic_write_bytes(output_path, bytes(output_buffer))

    def append_output(data: bytes) -> None:
        nonlocal revision, output_base_offset
        if not data:
            return
        revision += len(data)
        output_buffer.extend(data)
        if len(output_buffer) > args.output_byte_limit:
            del output_buffer[: len(output_buffer) - args.output_byte_limit]
        output_base_offset = revision - len(output_buffer)
        persist_output()
        persist_runtime(
            revision=revision,
            outputBaseOffset=output_base_offset,
        )

    def close_runtime(exit_status: int | None) -> None:
        persist_runtime(
            closedAt=now_iso(),
            exitStatus=exit_status,
            revision=revision,
            outputBaseOffset=output_base_offset,
        )
        try:
            os.close(control_fd)
        except OSError:
            pass
        try:
            os.close(control_keepalive_fd)
        except OSError:
            pass
        try:
            os.unlink(control_path)
        except FileNotFoundError:
            pass

    persist_output()
    persist_runtime(
        runtimePid=pid,
        helperPid=os.getpid(),
        revision=revision,
        outputBaseOffset=output_base_offset,
        startedAt=now_iso(),
        closedAt=None,
        exitStatus=None,
    )

    closing = False

    def handle_request(payload: dict[str, Any]) -> dict[str, Any]:
        nonlocal closing
        request_id = str(payload.get("requestId", ""))
        command_type = payload.get("type")
        if command_type == "ping":
            return {
                "requestId": request_id,
                "ok": True,
                "runtimePid": runtime.get("runtimePid"),
                "helperPid": runtime.get("helperPid"),
                "revision": revision,
                "outputBaseOffset": output_base_offset,
                "closedAt": runtime.get("closedAt"),
                "exitStatus": runtime.get("exitStatus"),
            }
        if command_type == "write":
            os.write(master_fd, base64.b64decode(payload.get("data", "")))
            return {"requestId": request_id, "ok": True}
        if command_type == "resize":
            set_winsize(master_fd, int(payload["rows"]), int(payload["cols"]))
            return {"requestId": request_id, "ok": True}
        if command_type == "signal":
            kill_process_group(pid, parse_signal(str(payload["signal"])))
            return {"requestId": request_id, "ok": True}
        if command_type == "close":
            closing = True
            kill_process_group(pid, signal.SIGHUP)
            return {"requestId": request_id, "ok": True}
        if command_type == "keepalive":
            return {"requestId": request_id, "ok": True}
        return {"requestId": request_id, "error": f"unknown command type: {command_type}"}

    def persist_reply(request_id: str, payload: dict[str, Any]) -> None:
        if not request_id:
            return
        atomic_write_text(
            os.path.join(replies_dir, f"{request_id}.json"),
            json.dumps(payload, indent=2) + "\n",
        )

    def terminate_child(_: int, __: Any) -> None:
        nonlocal closing
        closing = True
        kill_process_group(pid, signal.SIGHUP)

    signal.signal(signal.SIGTERM, terminate_child)
    signal.signal(signal.SIGINT, terminate_child)
    signal.signal(signal.SIGHUP, terminate_child)

    while True:
        read_fds = [master_fd, control_fd]
        ready, _, _ = select.select(read_fds, [], [], 0.1)

        if master_fd in ready:
            try:
                data = os.read(master_fd, 65536)
            except OSError as error:
                if error.errno != errno.EIO:
                    raise
                data = b""

            if data:
                append_output(data)
            else:
                _, status = os.waitpid(pid, 0)
                close_runtime(os.waitstatus_to_exitcode(status))
                return 0

        if control_fd in ready:
            chunk = os.read(control_fd, 65536)
            if chunk:
                control_buffer += chunk
            while b"\n" in control_buffer:
                raw_line, control_buffer = control_buffer.split(b"\n", 1)
                if not raw_line:
                    continue
                payload = json.loads(raw_line.decode("utf-8"))
                response = handle_request(payload)
                persist_reply(str(payload.get("requestId", "")), response)

        if closing:
            try:
                waited_pid, status = os.waitpid(pid, os.WNOHANG)
            except ChildProcessError:
                close_runtime(None)
                return 0
            if waited_pid == pid:
                close_runtime(os.waitstatus_to_exitcode(status))
                return 0


if __name__ == "__main__":
    raise SystemExit(main())
