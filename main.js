/* آفتاب نیرو — frontend */

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  let lastQuote = { area: null, kw: null };
  let currencyLabel = "تومان";

  /* ---------- Utils ---------- */
  function toPersianDigits(str) {
    return String(str).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  }

  function formatMoney(n) {
    if (n == null || Number.isNaN(n)) return "—";
    const formatted = Math.round(n).toLocaleString("en-US");
    return toPersianDigits(formatted) + " " + currencyLabel;
  }

  function formatSitePhone(phone) {
    return toPersianDigits(phone || "");
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      /* ignore */
    }
    if (!res.ok) {
      const err = new Error(data.error || "خطا در ارتباط با سرور");
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  /* ---------- Site info ---------- */
  async function loadSite() {
    try {
      const data = await api("/api/site");
      const s = data.site || {};
      const set = (id, val) => {
        const el = document.getElementById(id);
        if (el && val) el.textContent = /phone|hours|address/i.test(id) ? toPersianDigits(val) : val;
      };
      set("site-phone", s.phone);
      set("site-email", s.email);
      set("site-hours", s.workingHours);
      set("contact-phone", s.phone);
      set("contact-address", s.address);
      set("contact-hours", s.workingHours);
      set("footer-phone", s.phone);
      set("footer-email", s.email);
      set("footer-address", s.address);
      if (s.phone) {
        $$('a[href^="tel:"]').forEach((a) => {
          a.href = "tel:" + String(s.phone).replace(/[^\d+]/g, "");
        });
      }
      if (s.email) {
        $$('a[href^="mailto:"]').forEach((a) => {
          a.href = "mailto:" + s.email;
        });
      }
    } catch (_) {
      /* keep defaults */
    }
  }

  /* ---------- Header / nav ---------- */
  function initChrome() {
    const header = $("#header");
    const burger = $("#burger");
    const nav = $("#nav");
    const backTop = $("#back-top");
    const year = $("#year");

    if (year) year.textContent = toPersianDigits(new Date().getFullYear());

    const onScroll = () => {
      if (header) header.classList.toggle("is-scrolled", window.scrollY > 12);
      if (backTop) backTop.classList.toggle("is-visible", window.scrollY > 500);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    if (burger && nav) {
      burger.addEventListener("click", () => {
        nav.classList.toggle("is-open");
        document.body.classList.toggle("nav-open");
      });
      $$("a", nav).forEach((a) =>
        a.addEventListener("click", () => {
          nav.classList.remove("is-open");
          document.body.classList.remove("nav-open");
        })
      );
    }

    if (backTop) {
      backTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    }
  }

  /* ---------- Reveal on scroll ---------- */
  function initReveal() {
    const els = $$(".reveal");
    if (!els.length || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => io.observe(el));
  }

  /* ---------- Stats counter ---------- */
  function initCounters() {
    const items = $$("[data-count]");
    if (!items.length) return;

    const animate = (el) => {
      const target = parseFloat(el.dataset.count || "0");
      const suffix = el.dataset.suffix || "";
      const duration = 1400;
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const val = Math.round(target * eased);
        el.textContent = toPersianDigits(val) + suffix;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    if (!("IntersectionObserver" in window)) {
      items.forEach(animate);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            animate(e.target);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    items.forEach((el) => io.observe(el));
  }

  /* ---------- Calculator ---------- */
  function fillResult(box, result, notes) {
    if (!box) return;
    box.hidden = false;
    const map = {
      panels: result.panels,
      structure: result.structure,
      labor: result.labor,
      inverter: result.inverter,
      misc: result.misc,
      subtotal: result.subtotal,
      total: result.total,
    };
    Object.keys(map).forEach((key) => {
      const el = box.querySelector(`[data-r="${key}"]`);
      if (el) el.textContent = formatMoney(map[key]);
    });
    const noteEl = box.querySelector('[data-r="notes"]');
    if (noteEl) noteEl.textContent = notes || "";
  }

  async function runCalculate(area, kw, resultBox, btn) {
    const prev = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "در حال محاسبه...";
    }
    try {
      const data = await api("/api/calculate", {
        method: "POST",
        body: JSON.stringify({ area: Number(area), kw: Number(kw) }),
      });
      if (data.currencyLabel) currencyLabel = data.currencyLabel;
      fillResult(resultBox, data.result, data.notes);
      lastQuote = { area: Number(area), kw: Number(kw) };
      return data;
    } catch (err) {
      alert(err.message || "خطا در محاسبه");
      throw err;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prev;
      }
    }
  }

  function initCalculators() {
    $$("form[data-calc]").forEach((form) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = form.getAttribute("data-calc");
        const area = form.elements.area?.value;
        const kw = form.elements.kw?.value;
        if (!area || !kw) {
          alert("لطفاً متراژ و میزان پنل را وارد کنید.");
          return;
        }
        const box = document.querySelector(`[data-calc-result="${id}"]`);
        const btn = form.querySelector('button[type="submit"]');
        await runCalculate(area, kw, box, btn);
      });
    });
  }

  /* ---------- Modal ---------- */
  function initModal() {
    const modal = $("#calc-modal");
    if (!modal) return;

    const open = () => {
      modal.hidden = false;
      document.body.style.overflow = "hidden";
      const first = modal.querySelector("input");
      if (first) setTimeout(() => first.focus(), 50);
    };
    const close = () => {
      modal.hidden = true;
      document.body.style.overflow = "";
    };

    $$("[data-open-calc-modal]").forEach((btn) => btn.addEventListener("click", open));
    $$("[data-close-modal]").forEach((el) =>
      el.addEventListener("click", (e) => {
        if (el.tagName === "A" && el.getAttribute("href") === "#contact") {
          close();
          return;
        }
        if (el.hasAttribute("data-close-modal")) close();
      })
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) close();
    });
  }

  /* ---------- Fill consult from quote ---------- */
  function initFillConsult() {
    $$("[data-fill-consult]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const areaEl = $("#c-area");
        const kwEl = $("#c-kw");
        if (areaEl && lastQuote.area != null) areaEl.value = lastQuote.area;
        if (kwEl && lastQuote.kw != null) kwEl.value = lastQuote.kw;
        const contact = $("#contact");
        if (contact) contact.scrollIntoView({ behavior: "smooth" });
      });
    });
  }

  /* ---------- Consult form ---------- */
  function initConsultForm() {
    const form = $("#consult-form");
    const status = $("#consult-status");
    const submitBtn = $("#consult-submit");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (status) {
        status.textContent = "";
        status.className = "form-status";
      }

      const payload = {
        name: form.elements.name.value.trim(),
        mobile: form.elements.mobile.value.trim(),
        city: form.elements.city.value.trim(),
        message: form.elements.message.value.trim(),
        area: form.elements.area.value ? Number(form.elements.area.value) : null,
        kw: form.elements.kw.value ? Number(form.elements.kw.value) : null,
      };

      if (!payload.name || payload.name.length < 2) {
        if (status) {
          status.textContent = "نام را کامل وارد کنید.";
          status.classList.add("is-err");
        }
        return;
      }

      const prev = submitBtn ? submitBtn.textContent : "";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "در حال ارسال...";
      }

      try {
        const data = await api("/api/consult", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (status) {
          let msg = data.message || "درخواست شما ثبت شد.";
          if (data.smsSent === false) {
            msg += " (پیامک به مدیر ارسال نشد — درخواست در سیستم ثبت شده است.)";
          }
          status.textContent = msg;
          status.classList.add(data.smsSent === false ? "is-err" : "is-ok");
          if (data.smsSent !== false) status.classList.add("is-ok");
        }
        form.reset();
        if (lastQuote.area != null && form.elements.area) {
          /* keep empty after success */
        }
      } catch (err) {
        if (status) {
          status.textContent = err.message || "ارسال ناموفق بود.";
          status.classList.add("is-err");
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = prev;
        }
      }
    });
  }

  /* ---------- Boot ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    initChrome();
    initReveal();
    initCounters();
    initCalculators();
    initModal();
    initFillConsult();
    initConsultForm();
    loadSite();
  });
})();
