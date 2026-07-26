/* پیشخوان مدیریت آفتاب نیرو */

(function () {
  "use strict";

  const TOKEN_KEY = "aftab_admin_token";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  let token = localStorage.getItem(TOKEN_KEY) || "";

  const titles = {
    calculator: ["ماشین‌حساب", "نرخ‌ها و فرمول برآورد هزینه آنلاین"],
    sms: ["پیامک SMS.IR", "ارسال اطلاعات فرم مشاوره به مدیر"],
    site: ["اطلاعات سایت", "نمایش در هدر، فوتر و تماس"],
    leads: ["درخواست‌ها", "فرم‌های مشاوره ثبت‌شده"],
    account: ["حساب کاربری", "نام کاربری و رمز پیشخوان"],
  };

  async function api(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    if (token) headers["X-Session-Token"] = token;

    const res = await fetch(path, { ...options, headers });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {}

    if (res.status === 401 && !path.includes("/login")) {
      logout(false);
      throw new Error("نشست منقضی شده. دوباره وارد شوید.");
    }
    if (!res.ok) {
      throw new Error(data.error || data.detail || "خطا");
    }
    return data;
  }

  function showLogin() {
    $("#login-view").hidden = false;
    $("#dash-view").hidden = true;
  }

  function showDash() {
    $("#login-view").hidden = true;
    $("#dash-view").hidden = false;
  }

  function logout(callApi) {
    if (callApi && token) {
      api("/api/admin/logout", { method: "POST", body: "{}" }).catch(() => {});
    }
    token = "";
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
  }

  function flashSaved() {
    const pill = $("#save-pill");
    if (!pill) return;
    pill.hidden = false;
    clearTimeout(flashSaved._t);
    flashSaved._t = setTimeout(() => {
      pill.hidden = true;
    }, 2200);
  }

  function setStatus(el, msg, ok) {
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status" + (msg ? (ok ? " is-ok" : " is-err") : "");
  }

  /* Tabs */
  function initTabs() {
    $$(".nav-item[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        $$(".nav-item[data-tab]").forEach((b) => b.classList.toggle("is-active", b === btn));
        $$(".panel").forEach((p) => p.classList.toggle("is-active", p.dataset.panel === tab));
        const t = titles[tab] || ["پیشخوان", ""];
        $("#page-title").textContent = t[0];
        $("#page-sub").textContent = t[1];
        if (tab === "leads") loadLeads();
      });
    });
  }

  /* Login */
  function initLogin() {
    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = $("#login-status");
      const btn = $("#login-btn");
      setStatus(status, "");
      btn.disabled = true;
      try {
        const data = await api("/api/admin/login", {
          method: "POST",
          body: JSON.stringify({
            username: $("#username").value.trim(),
            password: $("#password").value,
          }),
        });
        token = data.token;
        localStorage.setItem(TOKEN_KEY, token);
        showDash();
        await loadConfig();
      } catch (err) {
        setStatus(status, err.message, false);
      } finally {
        btn.disabled = false;
      }
    });

    $("#logout-btn").addEventListener("click", () => logout(true));
  }

  /* Load / save config */
  async function loadConfig() {
    const data = await api("/api/admin/config");
    const cfg = data.config || {};
    const c = cfg.calculator || {};
    const s = cfg.site || {};
    const sms = cfg.sms || {};
    const admin = cfg.admin || {};

    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el && v != null) el.value = v;
    };

    setVal("pricePerKw", c.pricePerKw);
    setVal("structurePerM2", c.structurePerM2);
    setVal("laborPerKw", c.laborPerKw);
    setVal("inverterBase", c.inverterBase);
    setVal("inverterPerKw", c.inverterPerKw);
    setVal("miscPercent", c.miscPercent);
    setVal("minArea", c.minArea);
    setVal("maxArea", c.maxArea);
    setVal("minKw", c.minKw);
    setVal("maxKw", c.maxKw);
    setVal("currencyLabel", c.currencyLabel);
    setVal("notes", c.notes);

    setVal("lineNumber", sms.lineNumber);
    setVal("adminMobile", sms.adminMobile);
    $("#apiKey").value = "";
    $("#apiKey").placeholder = sms.apiKeySet ? "کلید ذخیره شده — برای تغییر، کلید جدید وارد کنید" : "کلید API از پنل sms.ir";
    $("#apiKey-hint").textContent = sms.apiKeySet
      ? "API Key قبلاً ذخیره شده است. فقط در صورت نیاز به تعویض، مقدار جدید بنویسید."
      : "هنوز API Key تنظیم نشده. از پنل app.sms.ir کلید بگیرید.";

    setVal("site-name", s.name);
    setVal("site-tagline", s.tagline);
    setVal("site-phone", s.phone);
    setVal("site-mobile", s.mobile);
    setVal("site-email", s.email);
    setVal("site-hours", s.workingHours);
    setVal("site-address", s.address);

    setVal("admin-username", admin.username);
  }

  function initForms() {
    $("#calc-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const calculator = {
        pricePerKw: Number(f.pricePerKw.value),
        structurePerM2: Number(f.structurePerM2.value),
        laborPerKw: Number(f.laborPerKw.value),
        inverterBase: Number(f.inverterBase.value),
        inverterPerKw: Number(f.inverterPerKw.value),
        miscPercent: Number(f.miscPercent.value),
        minArea: Number(f.minArea.value),
        maxArea: Number(f.maxArea.value),
        minKw: Number(f.minKw.value),
        maxKw: Number(f.maxKw.value),
        currencyLabel: f.currencyLabel.value.trim() || "تومان",
        notes: f.notes.value.trim(),
      };
      try {
        await api("/api/admin/config", {
          method: "PUT",
          body: JSON.stringify({ calculator }),
        });
        flashSaved();
      } catch (err) {
        alert(err.message);
      }
    });

    $("#sms-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = $("#sms-status");
      const sms = {
        lineNumber: $("#lineNumber").value.trim(),
        adminMobile: $("#adminMobile").value.trim(),
      };
      const key = $("#apiKey").value.trim();
      if (key) sms.apiKey = key;
      try {
        await api("/api/admin/config", {
          method: "PUT",
          body: JSON.stringify({ sms }),
        });
        setStatus(status, "تنظیمات پیامک ذخیره شد.", true);
        flashSaved();
        await loadConfig();
      } catch (err) {
        setStatus(status, err.message, false);
      }
    });

    $("#test-sms-btn").addEventListener("click", async () => {
      const status = $("#sms-status");
      const btn = $("#test-sms-btn");
      btn.disabled = true;
      setStatus(status, "در حال ارسال پیامک تست...");
      try {
        const data = await api("/api/admin/test-sms", {
          method: "POST",
          body: JSON.stringify({ mobile: $("#adminMobile").value.trim() }),
        });
        setStatus(status, data.detail || "پیامک تست ارسال شد.", true);
      } catch (err) {
        setStatus(status, err.message, false);
      } finally {
        btn.disabled = false;
      }
    });

    $("#site-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const site = {
        name: f.name.value.trim(),
        tagline: f.tagline.value.trim(),
        phone: f.phone.value.trim(),
        mobile: f.mobile.value.trim(),
        email: f.email.value.trim(),
        workingHours: f.workingHours.value.trim(),
        address: f.address.value.trim(),
      };
      try {
        await api("/api/admin/config", {
          method: "PUT",
          body: JSON.stringify({ site }),
        });
        flashSaved();
      } catch (err) {
        alert(err.message);
      }
    });

    $("#account-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = $("#account-status");
      const admin = {
        username: $("#admin-username").value.trim(),
      };
      const pass = $("#admin-password").value;
      if (pass) admin.password = pass;
      try {
        await api("/api/admin/config", {
          method: "PUT",
          body: JSON.stringify({ admin }),
        });
        setStatus(status, "حساب کاربری به‌روز شد.", true);
        $("#admin-password").value = "";
        flashSaved();
      } catch (err) {
        setStatus(status, err.message, false);
      }
    });

    $("#refresh-leads").addEventListener("click", loadLeads);
  }

  function formatDate(ts) {
    if (!ts) return "—";
    try {
      return new Date(ts * 1000).toLocaleString("fa-IR");
    } catch {
      return String(ts);
    }
  }

  async function loadLeads() {
    const body = $("#leads-body");
    body.innerHTML = '<tr><td colspan="7" class="empty">در حال بارگذاری...</td></tr>';
    try {
      const data = await api("/api/admin/leads");
      const leads = data.leads || [];
      if (!leads.length) {
        body.innerHTML = '<tr><td colspan="7" class="empty">هنوز درخواستی ثبت نشده است.</td></tr>';
        return;
      }
      body.innerHTML = leads
        .map((l) => {
          let smsBadge = '<span class="badge badge--na">—</span>';
          if (l.smsStatus === "sent") smsBadge = '<span class="badge badge--ok">ارسال شد</span>';
          else if (l.smsStatus === "failed") smsBadge = '<span class="badge badge--err">ناموفق</span>';
          const specs = [l.area != null ? l.area + " m²" : null, l.kw != null ? l.kw + " kW" : null]
            .filter(Boolean)
            .join(" / ") || "—";
          const msg = (l.message || "—").replace(/</g, "&lt;");
          return `<tr>
            <td>${formatDate(l.createdAt)}</td>
            <td>${(l.name || "").replace(/</g, "&lt;")}</td>
            <td dir="ltr">${l.mobile || ""}</td>
            <td>${(l.city || "—").replace(/</g, "&lt;")}</td>
            <td>${specs}</td>
            <td>${smsBadge}</td>
            <td class="msg-cell" title="${msg}">${msg}</td>
          </tr>`;
        })
        .join("");
    } catch (err) {
      body.innerHTML = `<tr><td colspan="7" class="empty">${err.message}</td></tr>`;
    }
  }

  async function boot() {
    initTabs();
    initLogin();
    initForms();

    if (!token) {
      showLogin();
      return;
    }
    try {
      await api("/api/admin/me");
      showDash();
      await loadConfig();
    } catch {
      showLogin();
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
