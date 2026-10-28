import argparse
import fcntl
import json
import os
import pty
import re
import select
import signal
import struct
import sys
import termios
import time

KEYS = {
    "Enter": b"\r",
    "Tab": b"\t",
    "Escape": b"\x1b",
    "Backspace": b"\x7f",
    "Space": b" ",
    "Up": b"\x1b[A",
    "Down": b"\x1b[B",
    "Right": b"\x1b[C",
    "Left": b"\x1b[D",
    "Home": b"\x1b[H",
    "End": b"\x1b[F",
    "PageUp": b"\x1b[5~",
    "PageDown": b"\x1b[6~",
    "Delete": b"\x1b[3~",
    "C-a": b"\x01",
    "C-c": b"\x03",
    "C-d": b"\x04",
    "C-e": b"\x05",
    "C-k": b"\x0b",
    "C-l": b"\x0c",
    "C-r": b"\x12",
    "C-u": b"\x15",
    "C-w": b"\x17",
    "C-z": b"\x1a",
}

SIGNALS = {"INT": signal.SIGINT, "TERM": signal.SIGTERM, "KILL": signal.SIGKILL, "HUP": signal.SIGHUP}

ANSI = re.compile(rb"\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]|\x1b[=>78DEHMNOZc]")


class Paths:
    def __init__(self, directory):
        self.control = os.path.join(directory, "control")
        self.log = os.path.join(directory, "output.log")
        self.exit = os.path.join(directory, "exit")
        self.size = os.path.join(directory, "size")


def set_size(fd, rows, cols):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


def write_text(path, text):
    with open(path, "w") as handle:
        handle.write(text)


def apply_message(message, master, pid, paths):
    if "text" in message:
        os.write(master, message["text"].encode())
    for name in message.get("keys", []):
        os.write(master, KEYS[name])
    if "resize" in message:
        rows, cols = message["resize"]
        set_size(master, rows, cols)
        write_text(paths.size, f"{rows} {cols}")
        os.killpg(pid, signal.SIGWINCH)
    if "signal" in message:
        os.killpg(pid, SIGNALS[message["signal"]])


def read_chunk(fd):
    try:
        return os.read(fd, 65536)
    except OSError:
        return b""


def exit_code(status):
    if os.WIFSIGNALED(status):
        return 128 + os.WTERMSIG(status)
    return os.WEXITSTATUS(status)


def start(args):
    paths = Paths(args.dir)
    os.makedirs(args.dir, exist_ok=True)
    for stale in (paths.control, paths.exit):
        if os.path.exists(stale):
            os.remove(stale)
    os.mkfifo(paths.control)
    control = os.open(paths.control, os.O_RDWR | os.O_NONBLOCK)
    write_text(paths.size, f"{args.rows} {args.cols}")
    open(paths.log, "ab").close()
    pid, master = pty.fork()
    if pid == 0:
        os.execvpe(args.command[0], args.command, dict(os.environ, TERM=args.term))
    set_size(master, args.rows, args.cols)
    deadline = time.monotonic() + args.timeout if args.timeout > 0 else None
    pending = b""
    status = None
    with open(paths.log, "ab", buffering=0) as out:
        while status is None:
            if deadline is not None and time.monotonic() > deadline:
                os.killpg(pid, signal.SIGKILL)
                deadline = None
            ready, _, _ = select.select([master, control], [], [], 0.2)
            if master in ready:
                out.write(read_chunk(master))
            if control in ready:
                pending += read_chunk(control)
                while b"\n" in pending:
                    line, pending = pending.split(b"\n", 1)
                    if line.strip():
                        apply_message(json.loads(line), master, pid, paths)
            done, raw = os.waitpid(pid, os.WNOHANG)
            if done:
                status = raw
        while select.select([master], [], [], 0.2)[0]:
            chunk = read_chunk(master)
            if not chunk:
                break
            out.write(chunk)
    os.close(control)
    os.remove(paths.control)
    code = exit_code(status)
    write_text(paths.exit, str(code))
    print(f"exit {code}")
    return 0


def log_size(paths):
    return os.path.getsize(paths.log) if os.path.exists(paths.log) else 0


def open_control(paths, patience):
    deadline = time.monotonic() + patience
    while True:
        try:
            return os.open(paths.control, os.O_WRONLY | os.O_NONBLOCK)
        except OSError:
            if os.path.exists(paths.exit) or time.monotonic() > deadline:
                return None
            time.sleep(0.05)


def post(paths, message, patience=2.0):
    fd = open_control(paths, patience)
    if fd is None:
        return None
    offset = log_size(paths)
    os.write(fd, json.dumps(message).encode() + b"\n")
    os.close(fd)
    return offset


def send(args):
    paths = Paths(args.dir)
    unknown = [name for name in args.keys if name not in KEYS]
    if unknown:
        print(f"unknown keys: {' '.join(unknown)}; known: {' '.join(KEYS)}", file=sys.stderr)
        return 2
    message = {}
    if args.text is not None:
        message["text"] = args.text
    if args.keys:
        message["keys"] = args.keys
    if args.resize:
        message["resize"] = args.resize
    if args.signal:
        message["signal"] = args.signal
    offset = post(paths, message)
    if offset is None:
        print(f"no running session in {args.dir}", file=sys.stderr)
        return 3
    print(f"offset {offset}")
    return 0


def read_from(path, offset):
    if not os.path.exists(path):
        return b""
    with open(path, "rb") as handle:
        handle.seek(offset)
        return handle.read()


def plain(raw):
    text = ANSI.sub(b"", raw).decode(errors="replace")
    lines = []
    for line in text.replace("\r\n", "\n").split("\n"):
        lines.append(line.rsplit("\r", 1)[-1])
    return lines


def wait(args):
    paths = Paths(args.dir)
    pattern = re.compile(args.pattern)
    deadline = time.monotonic() + args.timeout
    while True:
        lines = plain(read_from(paths.log, args.after))
        for line in lines:
            if pattern.search(line):
                print(f"match {line}")
                print(f"offset {log_size(paths)}")
                return 0
        if os.path.exists(paths.exit):
            print(f"session ended with exit {open(paths.exit).read()} before a match", file=sys.stderr)
            print("\n".join(lines[-20:]), file=sys.stderr)
            return 3
        if time.monotonic() > deadline:
            print(f"timeout after {args.timeout}s; last lines:", file=sys.stderr)
            print("\n".join(lines[-20:]), file=sys.stderr)
            return 1
        time.sleep(0.1)


def screen(args):
    paths = Paths(args.dir)
    raw = read_from(paths.log, 0)
    try:
        import pyte
    except ImportError:
        print("\n".join(plain(raw)[-args.lines :]))
        return 0
    rows, cols = (int(part) for part in open(paths.size).read().split())
    term = pyte.Screen(cols, rows)
    pyte.ByteStream(term).feed(raw)
    print("\n".join(line.rstrip() for line in term.display))
    return 0


def stop(args):
    paths = Paths(args.dir)
    for name in ("TERM", "KILL"):
        if os.path.exists(paths.exit):
            break
        if post(paths, {"signal": name}) is None:
            break
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline and not os.path.exists(paths.exit):
            time.sleep(0.1)
    if not os.path.exists(paths.exit):
        print(f"no exit recorded in {args.dir}", file=sys.stderr)
        return 1
    print(f"exit {open(paths.exit).read()}")
    return 0


def main():
    parser = argparse.ArgumentParser(prog="pty_session.py")
    commands = parser.add_subparsers(dest="action", required=True)

    start_parser = commands.add_parser("start")
    start_parser.add_argument("--dir", required=True)
    start_parser.add_argument("--rows", type=int, default=40)
    start_parser.add_argument("--cols", type=int, default=120)
    start_parser.add_argument("--term", default="xterm-256color")
    start_parser.add_argument("--timeout", type=float, default=0)
    start_parser.add_argument("command", nargs=argparse.REMAINDER)

    send_parser = commands.add_parser("send")
    send_parser.add_argument("--dir", required=True)
    send_parser.add_argument("--text")
    send_parser.add_argument("--keys", nargs="+", default=[])
    send_parser.add_argument("--resize", nargs=2, type=int, metavar=("ROWS", "COLS"))
    send_parser.add_argument("--signal", choices=sorted(SIGNALS))

    wait_parser = commands.add_parser("wait")
    wait_parser.add_argument("--dir", required=True)
    wait_parser.add_argument("--pattern", required=True)
    wait_parser.add_argument("--after", type=int, default=0)
    wait_parser.add_argument("--timeout", type=float, default=30)

    screen_parser = commands.add_parser("screen")
    screen_parser.add_argument("--dir", required=True)
    screen_parser.add_argument("--lines", type=int, default=40)

    stop_parser = commands.add_parser("stop")
    stop_parser.add_argument("--dir", required=True)

    args = parser.parse_args()
    if args.action == "start":
        if args.command and args.command[0] == "--":
            args.command = args.command[1:]
        if not args.command:
            parser.error("start needs a command after --")
    handlers = {"start": start, "send": send, "wait": wait, "screen": screen, "stop": stop}
    return handlers[args.action](args)


if __name__ == "__main__":
    sys.exit(main())
