#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
آفتاب نیرو — سرور لندینگ پنل خورشیدی
Python stdlib only (no external deps)
"""

from __future__ import annotations

import json
import os
import re
import secrets
import hashlib
import hmac
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
DATA = ROOT / "data"
CONFIG_PATH = DATA / "config.json"
LEADS_PATH = DATA / "leads.json"

HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8080"))

# session_token -> {username, expires}
SESSIONS: dict[str, dict] = {}
SESSION_TTL = 60 * 60 * 12  # 12 hours


def load_json(path: Path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def get_config() -> dict:
    return load_json(CONFIG_PATH, {})


def save_config(cfg: dict) -> None:
    save_json(CONFIG_PATH, cfg)


def get_leads() -> list:
    return load_json(LEADS_PATH, [])


def save_leads(leads: list) -> None:
    save_json(LEADS_PATH, leads)


def public_calculator(cfg: dict) -> dict:
    """Rates exposed to the public frontend (no secrets)."""
    c = cfg.get("calculator", {})
    return {
        "pricePerKw": c.get("pricePerKw", 0),
        "structurePerM2": c.get("structurePerM2", 0),
        "laborPerKw": c.get("laborPerKw", 0),
        "inverterBase": c.get("inverterBase", 0),
        "inverterPerKw": c.get("inverterPerKw", 0),
        "miscPercent": c.get("miscPercent", 0),
        "minKw": c.get("minKw", 1),
        "maxKw": c.get("maxKw", 100),
        "minArea": c.get("minArea", 10),
        "maxArea": c.get("maxArea", 5000),
        "currencyLabel": c.get("currencyLabel", "تومان"),
        "notes": c.get("notes", ""),
    }


def compute_quote(area: float, kw: float, calc: dict) -> dict:
    panels = kw * calc.get("pricePerKw", 0)
    structure = area * calc.get("structurePerM2", 0)
    labor = kw * calc.get("laborPerKw", 0)
    inverter = calc.get("inverterBase", 0) + kw * calc.get("inverterPerKw", 0)
    subtotal = panels + structure + labor + inverter
    misc = subtotal * (calc.get("miscPercent", 0) / 100.0)
    total = subtotal + misc
    return {
        "panels": round(panels),
        "structure": round(structure),
        "labor": round(labor),
        "inverter": round(inverter),
        "misc": round(misc),
        "subtotal": round(subtotal),
        "total": round(total),
        "area": area,
        "kw": kw,
    }


def normalize_mobile(raw: str) -> str | None:
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("98") and len(digits) == 12:
        digits = "0" + digits[2:]
    if digits.startswith("9") and len(digits) == 10:
        digits = "0" + digits
    if re.fullmatch(r"09\d{9}", digits):
        return digits
    return None


def send_sms_ir(api_key: str, line_number: str, mobile: str, message: str) -> tuple[bool, str]:
    if not api_key or not line_number or not mobile:
        return False, "تنظیمات پیامک ناقص است (API Key / شماره خط / موبایل مدیر)."

    try:
        line = int(str(line_number).strip())
    except ValueError:
        return False, "شماره خط پیامک نامعتبر است."

    payload = json.dumps(
        {
            "lineNumber": line,
            "messageText": message,
            "mobiles": [mobile],
            "sendDateTime": None,
        },
        ensure_ascii=False,
    ).encode("utf-8")

    req = urllib.request.Request(
        "https://api.sms.ir/v1/send",
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-api-key": api_key,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                return True, body
            status = data.get("status")
            if status == 1 or status == "1":
                return True, data.get("message", "ارسال شد")
            return False, data.get("message") or body
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        return False, f"HTTP {e.code}: {err}"
    except Exception as e:
        return False, str(e)


def create_session(username: str) -> str:
    token = secrets.token_urlsafe(32)
    SESSIONS[token] = {"username": username, "expires": time.time() + SESSION_TTL}
    return token


def validate_session(token: str | None) -> bool:
    if not token:
        return False
    s = SESSIONS.get(token)
    if not s:
        return False
    if time.time() > s["expires"]:
        SESSIONS.pop(token, None)
        return False
    s["expires"] = time.time() + SESSION_TTL
    return True


def constant_time_eq(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {self.address_string()} {fmt % args}")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Session-Token")

    def _json(self, code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def _session_token(self) -> str | None:
        auth = self.headers.get("Authorization") or ""
        if auth.lower().startswith("bearer "):
            return auth[7:].strip()
        return self.headers.get("X-Session-Token")

    def _require_admin(self) -> bool:
        if validate_session(self._session_token()):
            return True
        self._json(401, {"ok": False, "error": "نشست منقضی شده یا وارد نشده‌اید."})
        return False

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/api/health":
            return self._json(200, {"ok": True, "service": "aftab-niro"})

        if path == "/api/calculator":
            cfg = get_config()
            return self._json(200, {"ok": True, "calculator": public_calculator(cfg)})

        if path == "/api/site":
            cfg = get_config()
            site = cfg.get("site", {})
            return self._json(200, {"ok": True, "site": site})

        if path == "/api/admin/me":
            if not validate_session(self._session_token()):
                return self._json(401, {"ok": False})
            return self._json(200, {"ok": True})

        if path == "/api/admin/config":
            if not self._require_admin():
                return
            cfg = get_config()
            safe = {
                "site": cfg.get("site", {}),
                "calculator": cfg.get("calculator", {}),
                "sms": {
                    "apiKey": cfg.get("sms", {}).get("apiKey", ""),
                    "lineNumber": cfg.get("sms", {}).get("lineNumber", ""),
                    "adminMobile": cfg.get("sms", {}).get("adminMobile", ""),
                    "apiKeySet": bool(cfg.get("sms", {}).get("apiKey")),
                },
                "admin": {"username": cfg.get("admin", {}).get("username", "admin")},
            }
            return self._json(200, {"ok": True, "config": safe})

        if path == "/api/admin/leads":
            if not self._require_admin():
                return
            leads = get_leads()
            # newest first
            leads_sorted = sorted(leads, key=lambda x: x.get("createdAt", 0), reverse=True)
            return self._json(200, {"ok": True, "leads": leads_sorted})

        # static files — admin routes
        if path == "/admin" or path == "/admin/":
            self.path = "/admin.html"
            return super().do_GET()

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/api/calculate":
            body = self._read_json()
            try:
                area = float(body.get("area", 0))
                kw = float(body.get("kw", 0))
            except (TypeError, ValueError):
                return self._json(400, {"ok": False, "error": "مقادیر نامعتبر"})

            calc = get_config().get("calculator", {})
            min_a, max_a = calc.get("minArea", 10), calc.get("maxArea", 5000)
            min_k, max_k = calc.get("minKw", 1), calc.get("maxKw", 100)
            if not (min_a <= area <= max_a):
                return self._json(400, {"ok": False, "error": f"متراژ باید بین {min_a} تا {max_a} باشد."})
            if not (min_k <= kw <= max_k):
                return self._json(400, {"ok": False, "error": f"ظرفیت پنل باید بین {min_k} تا {max_k} کیلووات باشد."})

            result = compute_quote(area, kw, calc)
            return self._json(
                200,
                {
                    "ok": True,
                    "result": result,
                    "currencyLabel": calc.get("currencyLabel", "تومان"),
                    "notes": calc.get("notes", ""),
                },
            )

        if path == "/api/consult":
            body = self._read_json()
            name = (body.get("name") or "").strip()
            mobile_raw = (body.get("mobile") or "").strip()
            city = (body.get("city") or "").strip()
            message = (body.get("message") or "").strip()
            area = body.get("area")
            kw = body.get("kw")

            if len(name) < 2:
                return self._json(400, {"ok": False, "error": "نام را وارد کنید."})
            mobile = normalize_mobile(mobile_raw)
            if not mobile:
                return self._json(400, {"ok": False, "error": "شماره موبایل معتبر نیست (مثال: 0912xxxxxxx)."})

            lead = {
                "id": secrets.token_hex(8),
                "name": name,
                "mobile": mobile,
                "city": city,
                "message": message,
                "area": area,
                "kw": kw,
                "createdAt": int(time.time()),
                "smsStatus": None,
                "smsDetail": None,
            }

            cfg = get_config()
            sms_cfg = cfg.get("sms", {})
            site_name = cfg.get("site", {}).get("name", "سایت")

            sms_text = (
                f"درخواست مشاوره {site_name}\n"
                f"نام: {name}\n"
                f"موبایل: {mobile}\n"
                f"شهر: {city or '—'}\n"
            )
            if area:
                sms_text += f"متراژ: {area}\n"
            if kw:
                sms_text += f"ظرفیت: {kw} kW\n"
            if message:
                sms_text += f"پیام: {message[:80]}\n"

            ok_sms, detail = send_sms_ir(
                sms_cfg.get("apiKey", ""),
                str(sms_cfg.get("lineNumber", "")),
                normalize_mobile(sms_cfg.get("adminMobile", "") or "") or sms_cfg.get("adminMobile", ""),
                sms_text,
            )
            lead["smsStatus"] = "sent" if ok_sms else "failed"
            lead["smsDetail"] = detail

            leads = get_leads()
            leads.append(lead)
            save_leads(leads)

            # Always accept the lead; SMS failure is reported but form succeeds
            return self._json(
                200,
                {
                    "ok": True,
                    "message": "درخواست شما ثبت شد. به‌زودی با شما تماس می‌گیریم.",
                    "smsSent": ok_sms,
                    "smsDetail": detail if not ok_sms else None,
                },
            )

        if path == "/api/admin/login":
            body = self._read_json()
            username = (body.get("username") or "").strip()
            password = body.get("password") or ""
            admin = get_config().get("admin", {})
            if (
                constant_time_eq(username, admin.get("username", "admin"))
                and constant_time_eq(password, admin.get("password", ""))
            ):
                token = create_session(username)
                return self._json(200, {"ok": True, "token": token})
            return self._json(401, {"ok": False, "error": "نام کاربری یا رمز عبور اشتباه است."})

        if path == "/api/admin/logout":
            token = self._session_token()
            if token:
                SESSIONS.pop(token, None)
            return self._json(200, {"ok": True})

        if path == "/api/admin/test-sms":
            if not self._require_admin():
                return
            cfg = get_config()
            sms_cfg = cfg.get("sms", {})
            body = self._read_json()
            mobile = normalize_mobile(body.get("mobile") or sms_cfg.get("adminMobile") or "")
            if not mobile:
                return self._json(400, {"ok": False, "error": "موبایل تست نامعتبر است."})
            ok_sms, detail = send_sms_ir(
                sms_cfg.get("apiKey", ""),
                str(sms_cfg.get("lineNumber", "")),
                mobile,
                "پیامک تست از پیشخوان آفتاب نیرو — اتصال SMS.IR برقرار است.",
            )
            return self._json(200 if ok_sms else 400, {"ok": ok_sms, "detail": detail})

        return self._json(404, {"ok": False, "error": "Not found"})

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/api/admin/config":
            if not self._require_admin():
                return
            body = self._read_json()
            cfg = get_config()

            if "site" in body and isinstance(body["site"], dict):
                cfg.setdefault("site", {}).update({k: v for k, v in body["site"].items() if isinstance(v, str)})

            if "calculator" in body and isinstance(body["calculator"], dict):
                c = cfg.setdefault("calculator", {})
                num_keys = [
                    "pricePerKw",
                    "structurePerM2",
                    "laborPerKw",
                    "inverterBase",
                    "inverterPerKw",
                    "miscPercent",
                    "minKw",
                    "maxKw",
                    "minArea",
                    "maxArea",
                ]
                for k in num_keys:
                    if k in body["calculator"]:
                        try:
                            c[k] = float(body["calculator"][k])
                        except (TypeError, ValueError):
                            pass
                if "currencyLabel" in body["calculator"]:
                    c["currencyLabel"] = str(body["calculator"]["currencyLabel"])
                if "notes" in body["calculator"]:
                    c["notes"] = str(body["calculator"]["notes"])

            if "sms" in body and isinstance(body["sms"], dict):
                s = cfg.setdefault("sms", {})
                if "apiKey" in body["sms"] and body["sms"]["apiKey"] != "":
                    # empty string means "keep existing" if client sends blank intentionally via flag
                    s["apiKey"] = str(body["sms"]["apiKey"])
                if body["sms"].get("clearApiKey"):
                    s["apiKey"] = ""
                if "lineNumber" in body["sms"]:
                    s["lineNumber"] = str(body["sms"]["lineNumber"])
                if "adminMobile" in body["sms"]:
                    s["adminMobile"] = str(body["sms"]["adminMobile"])

            if "admin" in body and isinstance(body["admin"], dict):
                a = cfg.setdefault("admin", {})
                if body["admin"].get("username"):
                    a["username"] = str(body["admin"]["username"]).strip()
                if body["admin"].get("password"):
                    a["password"] = str(body["admin"]["password"])

            save_config(cfg)
            return self._json(200, {"ok": True, "message": "تنظیمات ذخیره شد."})

        return self._json(404, {"ok": False, "error": "Not found"})


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    if not CONFIG_PATH.exists():
        print("config.json missing!")
    if not LEADS_PATH.exists():
        save_leads([])

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"☀️  آفتاب نیرو — http://{HOST}:{PORT}")
    print(f"   لندینگ:  http://127.0.0.1:{PORT}/")
    print(f"   پیشخوان: http://127.0.0.1:{PORT}/admin")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nتوقف سرور.")
        server.server_close()


if __name__ == "__main__":
    main()
