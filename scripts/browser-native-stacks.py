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


def on_stop(event):
    if not isinstance(event, gdb.SignalEvent):
        return
    if event.stop_signal not in {"SIGSEGV", "SIGABRT", "SIGBUS", "SIGILL", "SIGFPE"}:
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
        # Convenience variables describe the selected inferior only. Do not
        # assign another process's signal to this exit event.
        if gdb.selected_inferior().num == event.inferior.num:
            try:
                row["signal"] = int(gdb.parse_and_eval("$_exitsignal"))
            except (gdb.error, TypeError):
                pass
    if len(report["exits"]) < 128:
        report["exits"].append(row)
    else:
        report["truncated"] = True
    if event.inferior.num == 1:
        root_exit = row["exitCode"] if isinstance(row["exitCode"], int) else 1
    save()


for command in [
    "set pagination off", "set confirm off", "set startup-with-shell off",
    "set disable-randomization off", "set print thread-events off",
    "set print inferior-events off", "set print frame-arguments none",
    "set print entry-values no", "set follow-fork-mode parent",
    "set detach-on-fork off", "set schedule-multiple on",
    "handle SIGPIPE nostop noprint pass", "handle SIGCHLD nostop noprint pass",
    "handle SIGSEGV SIGABRT SIGBUS SIGILL SIGFPE stop print pass",
]:
    gdb.execute(command)

gdb.events.stop.connect(on_stop)
gdb.events.exited.connect(on_exit)
report["startedAt"] = now()
save()
try:
    gdb.execute("run")
    while root_exit is None:
        live = [i for i in gdb.inferiors() if i.pid and i.threads()]
        if not live:
            raise RuntimeError("No live inferior and no root exit receipt")
        # Keep the signal-receiving inferior selected so continue passes the
        # original signal. Switch only when the selected process has exited.
        if not gdb.selected_inferior().pid or not gdb.selected_inferior().threads():
            gdb.execute("inferior %d" % live[0].num)
        gdb.execute("continue")
    report["complete"] = True
except (gdb.error, RuntimeError, KeyboardInterrupt) as error:
    report["observerError"] = type(error).__name__ + ": " + str(error)[:500]
finally:
    # All inferiors belong to this diagnostic invocation. Terminate its children
    # on interruption; never attach to or inspect unrelated processes.
    for inferior in gdb.inferiors():
        if inferior.pid:
            try:
                gdb.execute("inferior %d" % inferior.num)
                gdb.execute("kill")
            except gdb.error:
                pass
    report["finishedAt"] = now()
    report["rootExitCode"] = root_exit
    save()
gdb.execute("quit %d" % (root_exit if root_exit is not None else 1))
