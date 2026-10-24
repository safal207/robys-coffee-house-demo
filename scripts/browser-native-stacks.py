"""GDB-only observer. Run with -nx and auto-loading/debuginfod disabled.

Signals are passed unchanged. A signal stop is not labelled a fatal crash:
JavaScriptCore can handle SIGSEGV. Exit receipts must corroborate a fatal exit.
Only frame locations and module identities are retained, never locals, arguments,
register dumps, environment values, source text, or process memory/core files.
"""

import datetime
import hashlib
import json
import os

import gdb


output = os.environ["ROBYS_GDB_RECEIPT"]
cancel = os.environ["ROBYS_GDB_CANCEL"]
report = {
    "schemaVersion": 1,
    "role": "Diagnostic replay only; cannot replace the original suite verdict",
    "gdbVersion": gdb.VERSION,
    "signals": [],
    "exits": [],
    "processes": {},
    "binaries": {},
    "truncated": False,
    "complete": False,
    "interpretation": "A signal stop may be handled; correlate with the same inferior exit",
}
root_exit = None
closing = False


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def save():
    with open(output + ".tmp", "w", encoding="utf-8") as stream:
        json.dump(report, stream, ensure_ascii=True, indent=2)
        stream.write("\n")
    os.replace(output + ".tmp", output)


def identity(inferior):
    key = str(inferior.num)
    row = report["processes"].get(key, {"inferior": inferior.num})
    if inferior.pid:
        row["pid"] = inferior.pid
    executable = inferior.progspace.filename
    if executable:
        row["executable"] = executable[:1000]
    if len(report["processes"]) < 128 or key in report["processes"]:
        report["processes"][key] = row
    else:
        report["truncated"] = True
    return dict(row)


def binary_identity(path):
    if path in report["binaries"] or len(report["binaries"]) >= 256:
        return
    try:
        digest = hashlib.sha256()
        with open(path, "rb") as stream:
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
        report["binaries"][path] = {"sha256": digest.hexdigest()}
    except OSError as error:
        report["binaries"][path] = {"status": "UNAVAILABLE", "code": error.errno}


def capture_signal(event):
    if not isinstance(event, gdb.SignalEvent):
        return
    if event.stop_signal not in {"SIGSEGV", "SIGABRT", "SIGBUS", "SIGILL", "SIGFPE", "SIGTRAP"}:
        return
    if len(report["signals"]) >= 32:
        report["truncated"] = True
        save()
        return
    inferior = gdb.selected_inferior()
    row = {"at": now(), **identity(inferior), "signal": event.stop_signal,
           "fatal": "UNKNOWN_UNTIL_EXIT", "frames": [], "modules": []}
    thread = gdb.selected_thread()
    if thread:
        row["thread"] = list(thread.ptid)
    try:
        frame = gdb.newest_frame()
        for _ in range(32):
            if frame is None:
                break
            pc = frame.pc()
            module = gdb.solib_name(pc)
            name = frame.name()
            location = {"pc": hex(pc), "function": name[:500] if name else None,
                        "module": module[:1000] if module else None}
            # No read_var(), arguments, locals, disassembly, or source contents.
            row["frames"].append(location)
            frame = frame.older()
        row["framesTruncated"] = frame is not None
    except gdb.error as error:
        row["unwindError"] = str(error)[:500]
    objects = gdb.objfiles()
    if len(objects) > 256:
        report["truncated"] = True
    for obj in objects[:256]:
        row["modules"].append({"path": obj.filename[:1000],
                               "buildId": getattr(obj, "build_id", None)})
        binary_identity(obj.filename)
    # Executable mappings give ASLR load addresses for later symbolization.
    # No anonymous data mappings or their contents are read.
    row["mappings"] = []
    try:
        with open("/proc/%d/maps" % inferior.pid, encoding="utf-8") as stream:
            for line in stream:
                fields = line.rstrip().split(None, 5)
                if len(fields) != 6 or "x" not in fields[1] or not fields[5].startswith("/"):
                    continue
                if len(row["mappings"]) == 256:
                    report["truncated"] = True
                    break
                start, end = fields[0].split("-")
                row["mappings"].append({"start": start, "end": end, "offset": fields[2], "path": fields[5][:1000]})
    except OSError as error:
        row["mappingsError"] = error.errno
    row["symbolization"] = "PARTIAL" if any(f["function"] for f in row["frames"]) else "UNAVAILABLE"
    report["signals"].append(row)
    save()


def on_exit(event):
    global root_exit
    row = {"at": now(), **identity(event.inferior)}
    if hasattr(event, "exit_code"):
        row["exitCode"] = event.exit_code
        row["signal"] = None
    else:
        row["exitCode"] = None
        row["signal"] = "UNKNOWN"
        # In non-stop mode GDB does not select the event's inferior for us.
        try:
            gdb.execute("inferior %d" % event.inferior.num, to_string=True)
            row["signal"] = int(gdb.parse_and_eval("$_exitsignal"))
        except (gdb.error, TypeError):
            pass
    if len(report["exits"]) < 128:
        report["exits"].append(row)
    else:
        report["truncated"] = True
    if event.inferior.num == 1:
        root_exit = row["exitCode"] if isinstance(row["exitCode"], int) else 1
        if not closing:
            report["complete"] = True
            gdb.post_event(finish)
    save()


def finish():
    global closing
    closing = True
    # Only processes launched by this debugger are inferiors. No attachment to
    # unrelated processes, global ptrace change, or sandbox/capability change.
    for inferior in gdb.inferiors():
        if inferior.pid:
            try:
                gdb.execute("inferior %d" % inferior.num, to_string=True)
                gdb.execute("kill")
            except gdb.error as error:
                report.setdefault("cleanupErrors", []).append(str(error)[:500])
    report["finishedAt"] = now()
    report["rootExitCode"] = root_exit
    save()
    gdb.execute("quit %d" % (root_exit if root_exit is not None else 1))


def request_deadline():
    global closing
    if closing:
        return
    closing = True
    report["observerError"] = "TimeoutError: diagnostic deadline requested"
    report["complete"] = False
    save()
    gdb.execute("interrupt -a")
    gdb.post_event(finish)


def on_stop(event):
    if closing:
        return
    if os.path.exists(cancel):
        request_deadline()
        return
    thread = getattr(event, "inferior_thread", None) or gdb.selected_thread()
    if thread:
        thread.switch()
    try:
        capture_signal(event)
    except (gdb.error, OSError, TypeError) as error:
        report["observerError"] = type(error).__name__ + ": " + str(error)[:500]
        save()

    def resume():
        if closing or not thread or not thread.is_valid() or not thread.is_stopped():
            return
        if os.path.exists(cancel):
            request_deadline()
            return
        thread.switch()
        # Deliver an application trap only after GDB exposes a SignalEvent.
        # Global SIGTRAP pass also forwards debugger-internal exec traps before
        # this callback runs. `signal` bypasses nopass for this thread alone;
        # the background form lets browser/server threads continue progressing.
        if isinstance(event, gdb.SignalEvent) and event.stop_signal == "SIGTRAP":
            gdb.execute("signal SIGTRAP &")
        else:
            gdb.execute("continue &")

    gdb.post_event(resume)


for command in [
    "set pagination off", "set confirm off", "set startup-with-shell off",
    "set disable-randomization off", "set print thread-events off",
    "set print inferior-events off", "set print frame-arguments none",
    "set print entry-values no", "set follow-fork-mode parent",
    "set detach-on-fork off", "set schedule-multiple on", "set non-stop on",
    "handle SIGPIPE nostop noprint pass", "handle SIGCHLD nostop noprint pass",
    "handle SIGSEGV SIGABRT SIGBUS SIGILL SIGFPE stop print pass",
    # Preserve debugger-internal traps; on_stop explicitly delivers only traps
    # reported as application signals, including GLib fatal diagnostics.
    "handle SIGTRAP stop print nopass",
]:
    gdb.execute(command)

gdb.events.stop.connect(on_stop)
gdb.events.exited.connect(on_exit)
report["startedAt"] = now()
report["executionMode"] = "non-stop; background; resume only the stopped thread"
save()
try:
    gdb.execute("run &")
except (gdb.error, RuntimeError, TimeoutError, KeyboardInterrupt) as error:
    report["observerError"] = type(error).__name__ + ": " + str(error)[:500]
    finish()
