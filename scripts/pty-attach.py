#!/usr/bin/env python3
import argparse
import base64
import errno
import fcntl
import json
import os
import select
import signal
import struct
import sys
import termios


def set_winsize(fd: int, rows: int, cols: int) -> None:
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


def send_message(message: dict) -> None:
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tmux-socket", required=True)
    parser.add_argument("--session", required=True)
    parser.add_argument("--cols", type=int, required=True)
    parser.add_argument("--rows", type=int, required=True)
    args = parser.parse_args()

    pid, master_fd = os.forkpty()
    if pid == 0:
        os.execvp(
            "tmux",
            [
                "tmux",
                "-S",
                args.tmux_socket,
                "attach-session",
                "-t",
                args.session,
            ],
        )
        raise SystemExit(127)

    set_winsize(master_fd, args.rows, args.cols)
    stdin_fd = sys.stdin.fileno()
    stdin_buffer = b""
    exiting = False

    while True:
        read_fds = [master_fd, stdin_fd]
        ready, _, _ = select.select(read_fds, [], [], 0.1)

        if master_fd in ready:
          try:
              data = os.read(master_fd, 65536)
          except OSError as error:
              if error.errno != errno.EIO:
                  raise
              data = b""

          if data:
              send_message(
                  {
                      "type": "data",
                      "data": base64.b64encode(data).decode("ascii"),
                  }
              )
          else:
              _, status = os.waitpid(pid, 0)
              exit_status = os.waitstatus_to_exitcode(status)
              send_message({"type": "exit", "status": exit_status})
              return exit_status

        if stdin_fd in ready:
            chunk = os.read(stdin_fd, 65536)
            if not chunk:
                exiting = True
                os.kill(pid, signal.SIGHUP)
                continue

            stdin_buffer += chunk
            while b"\n" in stdin_buffer:
                raw_line, stdin_buffer = stdin_buffer.split(b"\n", 1)
                if not raw_line:
                    continue

                command = json.loads(raw_line.decode("utf-8"))
                command_type = command.get("type")
                if command_type == "write":
                    payload = base64.b64decode(command["data"])
                    os.write(master_fd, payload)
                elif command_type == "resize":
                    set_winsize(master_fd, int(command["rows"]), int(command["cols"]))
                elif command_type == "close":
                    exiting = True
                    os.kill(pid, signal.SIGHUP)
                else:
                    send_message({"type": "error", "error": f"unknown command type: {command_type}"})

        if exiting:
            try:
                waited_pid, status = os.waitpid(pid, os.WNOHANG)
            except ChildProcessError:
                return 0
            if waited_pid == pid:
                exit_status = os.waitstatus_to_exitcode(status)
                send_message({"type": "exit", "status": exit_status})
                return exit_status


if __name__ == "__main__":
    raise SystemExit(main())
