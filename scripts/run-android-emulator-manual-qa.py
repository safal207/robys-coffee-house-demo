#!/usr/bin/env python3
import argparse
import json
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = "com.robys.coffeehouse"


def run(*args: str, check: bool = True) -> str:
    completed = subprocess.run(args, text=True, capture_output=True)
    output = (completed.stdout or "") + (completed.stderr or "")
    if check and completed.returncode != 0:
        command = " ".join(args)
        raise RuntimeError(f"Command failed ({completed.returncode}): {command}\n{output.strip()}")
    return output


def adb(*args: str, check: bool = True) -> str:
    return run("adb", *args, check=check)


def dump_ui(output_dir: Path, name: str) -> tuple[Path, ET.Element]:
    remote = "/data/local/tmp/robys-window.xml"
    last_error = "UI hierarchy was not produced"
    for attempt in range(1, 4):
        dump_output = adb("shell", "uiautomator", "dump", remote, check=False)
        raw = adb("exec-out", "cat", remote, check=False)
        xml_start = raw.find("<?xml")
        if xml_start < 0:
            xml_start = raw.find("<hierarchy")
        if xml_start >= 0:
            xml_text = raw[xml_start:].strip()
            try:
                root = ET.fromstring(xml_text)
                local = output_dir / f"{name}.xml"
                local.write_text(xml_text + "\n", encoding="utf-8")
                return local, root
            except ET.ParseError as exc:
                last_error = f"Invalid UI XML on attempt {attempt}: {exc}; dump={dump_output.strip()}; raw={raw[:500]!r}"
        else:
            last_error = f"Missing UI XML on attempt {attempt}; dump={dump_output.strip()}; cat={raw[:500]!r}"
        time.sleep(1.5)
    raise RuntimeError(last_error)


def take_screenshot(output_dir: Path, name: str) -> Path:
    local = output_dir / f"{name}.png"
    with local.open("wb") as handle:
        completed = subprocess.run(["adb", "exec-out", "screencap", "-p"], stdout=handle, stderr=subprocess.PIPE)
    if completed.returncode != 0:
        raise RuntimeError(f"Could not capture screenshot {name}: {(completed.stderr or b'').decode(errors='replace')}")
    return local


def save_logcat(output_dir: Path, name: str) -> Path:
    local = output_dir / f"{name}.logcat.txt"
    local.write_text(adb("logcat", "-d", "-v", "threadtime", check=False), encoding="utf-8")
    return local


def node_text(node: ET.Element) -> str:
    return " ".join(filter(None, [node.attrib.get("text", ""), node.attrib.get("content-desc", "")])).strip()


def find_node(root: ET.Element, candidates: list[str]) -> ET.Element | None:
    normalized = [candidate.casefold() for candidate in candidates]
    for node in root.iter("node"):
        text = node_text(node).casefold()
        if any(candidate in text for candidate in normalized):
            return node
    return None


def bounds_center(node: ET.Element) -> tuple[int, int]:
    match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
    if not match:
        raise RuntimeError(f"Node has invalid bounds: {node.attrib.get('bounds')}")
    x1, y1, x2, y2 = map(int, match.groups())
    return ((x1 + x2) // 2, (y1 + y2) // 2)


def tap_node(node: ET.Element) -> dict:
    x, y = bounds_center(node)
    adb("shell", "input", "tap", str(x), str(y))
    time.sleep(1.5)
    return {"matched": node_text(node), "x": x, "y": y}


def wait_for_text(output_dir: Path, label: str, candidates: list[str], timeout: int = 45, scroll: bool = False) -> ET.Element:
    deadline = time.time() + timeout
    attempt = 0
    observed: list[str] = []
    while time.time() < deadline:
        attempt += 1
        _, root = dump_ui(output_dir, f"{label}-{attempt}")
        observed = [node_text(node) for node in root.iter("node") if node_text(node)]
        node = find_node(root, candidates)
        if node is not None:
            return node
        if scroll:
            adb("shell", "input", "swipe", "200", "700", "200", "250", "350")
        time.sleep(2)
    sample = " | ".join(observed[:80])
    raise RuntimeError(f"Could not find UI text for {label}: {candidates}; observed: {sample}")


def tap_text(output_dir: Path, label: str, candidates: list[str], timeout: int = 30, scroll: bool = False) -> dict:
    return tap_node(wait_for_text(output_dir, label, candidates, timeout=timeout, scroll=scroll))


def prepare_network() -> dict:
    adb("shell", "cmd", "connectivity", "airplane-mode", "disable", check=False)
    adb("shell", "settings", "put", "global", "private_dns_mode", "off", check=False)
    adb("shell", "svc", "wifi", "enable", check=False)
    adb("shell", "svc", "data", "enable", check=False)
    diagnostics = []
    reachable = False
    for attempt in range(1, 16):
        ping = adb("shell", "ping", "-c", "1", "-W", "2", "safal207.github.io", check=False)
        diagnostics.append(ping.strip()[-300:])
        if "1 received" in ping or "1 packets received" in ping or "1 packets transmitted, 1 received" in ping:
            reachable = True
            break
        time.sleep(2)
    return {"reachableByPing": reachable, "attempts": len(diagnostics), "lastPing": diagnostics[-1] if diagnostics else ""}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apk", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    apk = Path(args.apk)
    output_dir = Path(args.out)
    output_dir.mkdir(parents=True, exist_ok=True)
    results: list[dict] = []

    def case(case_id: str, title: str, action) -> bool:
        started = time.time()
        try:
            evidence = action()
            results.append({"id": case_id, "title": title, "status": "PASS", "seconds": round(time.time() - started, 2), "evidence": evidence})
            print(f"✅ {case_id} {title}")
            return True
        except Exception as exc:
            screenshot = take_screenshot(output_dir, f"failure-{case_id.lower()}")
            logcat = save_logcat(output_dir, f"failure-{case_id.lower()}")
            results.append({"id": case_id, "title": title, "status": "FAIL", "seconds": round(time.time() - started, 2), "error": str(exc), "evidence": {"screenshot": str(screenshot), "logcat": str(logcat)}})
            print(f"❌ {case_id} {title}: {exc}")
            return False

    def skip(case_id: str, title: str, reason: str) -> None:
        results.append({"id": case_id, "title": title, "status": "SKIP", "seconds": 0, "error": reason})
        print(f"⏭️ {case_id} {title}: {reason}")

    def launch_home():
        network = prepare_network()
        adb("logcat", "-c", check=False)
        adb("shell", "am", "force-stop", PACKAGE)
        adb("shell", "monkey", "-p", PACKAGE, "-c", "android.intent.category.LAUNCHER", "1")

        deadline = time.time() + 120
        attempt = 0
        observed: list[str] = []
        refreshes = 0
        while time.time() < deadline:
            attempt += 1
            _, root = dump_ui(output_dir, f"home-smart-choice-entry-{attempt}")
            observed = [node_text(node) for node in root.iter("node") if node_text(node)]
            entry = find_node(root, ["Seçmeme yardım et", "Help me choose", "Помочь выбрать"])
            if entry is not None:
                screenshot = take_screenshot(output_dir, "android-home")
                return {"matched": node_text(entry), "screenshot": str(screenshot), "network": network, "refreshes": refreshes}

            offline = find_node(root, ["Нет подключения", "No connection", "Bağlantı yok", "Проверьте интернет", "Check your internet"])
            refresh = find_node(root, ["Обновить", "Refresh", "Yenile"])
            if offline is not None and refresh is not None:
                tap_node(refresh)
                refreshes += 1
            else:
                adb("shell", "input", "swipe", "200", "700", "200", "250", "350", check=False)
            time.sleep(3)

        sample = " | ".join(observed[:80])
        raise RuntimeError(f"Landing page did not load after network recovery; network={network}; refreshes={refreshes}; observed: {sample}")

    def open_smart_choice():
        tap = tap_text(output_dir, "tap-smart-choice-entry", ["Seçmeme yardım et", "Help me choose", "Помочь выбрать"], timeout=30, scroll=True)
        node = wait_for_text(output_dir, "smart-choice-welcome", ["Bugünkü Roby's anınızı birlikte seçelim", "Let’s find your Roby's moment today", "Давайте найдём ваш момент Roby's сегодня"], timeout=45)
        screenshot = take_screenshot(output_dir, "android-smart-choice-welcome")
        return {"tap": tap, "welcome": node_text(node), "screenshot": str(screenshot)}

    def complete_flow():
        evidence = {"start": tap_text(output_dir, "start", ["Seçime başla", "Start choosing", "Начать выбор"]), "steps": [], "path": "dessert/cold/sweet/one/400"}
        choices = [
            ["Tatlı", "Dessert", "Десерт"],
            ["Soğuk", "Cold", "Холодное"],
            ["Tatlı", "Sweet", "Сладкое"],
            ["Bir kişi", "One", "Один"],
            ["400 ₺'ye kadar", "Up to 400 ₺", "До 400 ₺"],
        ]
        for index, candidates in enumerate(choices, start=1):
            selected = tap_text(output_dir, f"step-{index}-choice", candidates, timeout=30)
            continued = tap_text(output_dir, f"step-{index}-continue", ["Devam et", "Continue", "Продолжить"], timeout=30)
            evidence["steps"].append({"step": index, "selected": selected, "continue": continued})
        result = wait_for_text(output_dir, "result", ["Roby's seçiminiz hazır", "Your Roby's choice is ready", "Ваш выбор Roby's готов"], timeout=45)
        evidence["result"] = node_text(result)
        evidence["resultScreenshot"] = str(take_screenshot(output_dir, "android-smart-choice-results"))
        evidence["choose"] = tap_text(output_dir, "choose-result", ["Bunu seç", "Choose this", "Выбрать"], timeout=30, scroll=True)
        confirmation = wait_for_text(output_dir, "confirmation", ["Güzel seçim", "Lovely choice", "Отличный выбор"], timeout=30)
        evidence["confirmation"] = node_text(confirmation)
        evidence["confirmationScreenshot"] = str(take_screenshot(output_dir, "android-smart-choice-confirmation"))
        return evidence

    def verify_back():
        adb("shell", "input", "keyevent", "4")
        node = wait_for_text(output_dir, "back-to-results", ["Roby's seçiminiz hazır", "Your Roby's choice is ready", "Ваш выбор Roby's готов"], timeout=30)
        screenshot = take_screenshot(output_dir, "android-back-results")
        return {"returnedTo": node_text(node), "screenshot": str(screenshot)}

    sequence = [
        ("APK-02", "Install signed APK", lambda: {"adb": adb("install", "-r", str(apk)).strip()}),
        ("APK-03", "Launch app and recover live landing page", launch_home),
        ("APK-04", "Open Smart Choice inside app WebView", open_smart_choice),
        ("APK-05", "Complete confirmed five-step Smart Choice path and select result", complete_flow),
        ("APK-06", "Android Back returns to in-app results", verify_back),
    ]

    blocked_by: str | None = None
    for case_id, title, action in sequence:
        if blocked_by:
            skip(case_id, title, f"Blocked by {blocked_by}")
            continue
        if not case(case_id, title, action):
            blocked_by = case_id

    report = {
        "completedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "package": PACKAGE,
        "apk": str(apk),
        "passed": all(entry["status"] == "PASS" for entry in results),
        "results": results,
    }
    (output_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
