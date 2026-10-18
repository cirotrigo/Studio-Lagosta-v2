"""Runs INSIDE GDB, never emits memory, args, locals, env or source paths."""
import gdb
import json
import os
import re

def clean_symbol(value):
    if value is None:
        return "unknown"
    if len(value) > 500 or re.search(r"[/\\\r\n\x00-\x1f]", value):
        return "redacted"
    return value

def module_at(pc):
    name = gdb.solib_name(pc)
    # A missing shared-library mapping does NOT prove this is the main executable.
    return clean_symbol(os.path.basename(name)) if name else "main-or-unmapped"

try:
    fault = gdb.selected_thread()
    mappings = []
    try:
        for line in gdb.execute("info proc mappings", to_string=True).splitlines():
            match = re.match(r"\s*(0x[0-9a-f]+)\s+(0x[0-9a-f]+)\s+(0x[0-9a-f]+)\s+(0x[0-9a-f]+)", line)
            if match:
                start, end, _, offset = (int(v, 16) for v in match.groups())
                mappings.append((start, end, offset))
    except gdb.error:
        pass
    rows = []
    threads = sorted(gdb.selected_inferior().threads(), key=lambda t: t.num)
    for thread in threads[:128]:
        thread.switch()
        frame = gdb.newest_frame()
        frames = []
        for level in range(40):
            if frame is None:
                break
            try:
                pc = frame.pc()
                location = next((hex(pc - a + offset) for a, b, offset in mappings if a <= pc < b), None)
                frames.append({"n": level, "symbol": clean_symbol(frame.name()), "module": module_at(pc), "module_file_offset": location})
                frame = frame.older()
            except gdb.error:
                frames.append({"n": level, "unwind": "unavailable"})
                break
        rows.append({"thread": thread.num, "fault_thread": thread == fault, "frames": frames})
    print("DIAG_NATIVE_JSON=" + json.dumps({"threads": rows}, ensure_ascii=True))
except Exception:
    # Do not leak exception messages (GDB often embeds complete local paths).
    print('DIAG_NATIVE_JSON={"error":"native-extraction-failed"}')
