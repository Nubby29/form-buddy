// Source of the script executed inside the remote Browserless browser.
// It is sent as plain text, so it must be self-contained ES module source.
export const BROWSER_SCRIPT = `

export default async ({ page, context }) => {
  const url = context.url;
  const mode = context.mode;
  const started = Date.now();

  try {
    await page.setViewport({ width: 1280, height: 1000 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    );

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    } catch (e) {
      return {
        data: { ok: false, reason: "navigation_failed", message: String(e && e.message || e) },
        type: "application/json"
      };
    }

    // Wake up delayed scripts (Breeze / WP Rocket / lazy hydration)
    await page.evaluate(function () {
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("mousemove"));
    });
    // Wait for scripts and dynamic hydration to settle
    await new Promise(function (r) { setTimeout(r, 3500); });

    // Smoothly scroll down to trigger lazy loading / footer forms
    await page.evaluate(async function () {
      await new Promise(function (resolve) {
        let totalHeight = 0;
        const distance = 500;
        const timer = setInterval(function () {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight || totalHeight > 3500) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, 150);
      });
    });

    await new Promise(function (r) { setTimeout(r, 1000); });

    const title = (await page.title()) || url;

    const plan = await page.evaluate(function () {
      function safeQuery(selector, root) {
        try {
          return (root || document).querySelector(selector);
        } catch (e) {
          return null;
        }
      }

      function isElementVisible(el) {
        if (!el) return false;
        try {
          let curr = el;
          while (curr && curr !== document.body) {
            const s = window.getComputedStyle(curr);
            if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
            curr = curr.parentElement;
          }
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0 && !el.offsetParent) return false;
          return true;
        } catch (e) {
          return true;
        }
      }

      function labelText(el) {
        let t = "";
        try {
          if (el.id) {
            const l = safeQuery('label[for="' + CSS.escape(el.id) + '"]');
            if (l) t = l.textContent || "";
          }
          if (!t) {
            const p = el.closest("label");
            if (p) t = p.textContent || "";
          }
          if (!t && el.getAttribute("aria-labelledby")) {
            const refIds = el.getAttribute("aria-labelledby").split(/\s+/);
            const parts = [];
            for (let i = 0; i < refIds.length; i++) {
              const refEl = document.getElementById(refIds[i]);
              if (refEl && refEl.textContent) parts.push(refEl.textContent.trim());
            }
            if (parts.length) t = parts.join(" ");
          }
          if (!t) {
            const container = el.closest(".mb-3, .form-group, .form-field, .field-wrapper, .elementor-field-group, .col-md-6, .col-12, div");
            if (container) {
              const lbl = container.querySelector("label, .form-label");
              if (lbl) {
                const forAttr = lbl.getAttribute("for");
                if (!forAttr || (el.id && forAttr === el.id)) {
                  t = lbl.textContent || "";
                }
              }
            }
          }
          if (!t) {
            let prev = el.previousElementSibling;
            while (prev) {
              if (prev.tagName && prev.tagName.toLowerCase() === "label") {
                t = prev.textContent || "";
                break;
              }
              prev = prev.previousElementSibling;
            }
          }
          if (!t) t = el.getAttribute("aria-label") || "";
          if (!t && el.getAttribute("placeholder") && !/^(yyyy|dd\/mm|mm\/dd|select|choose|enter|type)/i.test(el.getAttribute("placeholder"))) {
            t = el.getAttribute("placeholder");
          }
        } catch (e) {}
        return (t || "").replace(/\s+/g, " ").trim().slice(0, 80);
      }

      function hintOf(el) {
        const raw = [
          el.getAttribute("name") || "",
          el.getAttribute("id") || "",
          el.getAttribute("data-testid") || "",
          el.getAttribute("autocomplete") || "",
          el.getAttribute("placeholder") || "",
          labelText(el),
        ].join(" ");
        return raw.replace(/[-_.]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/\s+/g, " ");
      }

      function has(h) {
        const args = Array.prototype.slice.call(arguments, 1);
        for (let i = 0; i < args.length; i++) if (h.indexOf(args[i]) !== -1) return true;
        return false;
      }

      function futureDate(days) {
        const d = new Date(Date.now() + days * 86400000);
        return d.toISOString().slice(0, 10);
      }

      function valueFor(el, h) {
        const type = (el.getAttribute("type") || el.tagName.toLowerCase()).toLowerCase();
        const ph = (el.getAttribute("placeholder") || "").toLowerCase();

        if (type === "email" || has(h, "email", "e-mail")) return "qa.tester+" + Math.floor(Math.random() * 900 + 100) + "@example.com";
        if (type === "tel" || has(h, "phone", "tel", "mobile")) return "+1 415 555 0142";
        if (type === "url" || has(h, "website", "url")) return "https://example.com";
        if (type === "password") return "TestPass!2468";
        if (el.tagName.toLowerCase() === "textarea" || has(h, "message", "comment", "enquiry", "inquiry", "details", "description", "note")) {
          return "This is an automated form test submission generated by a form testing tool. Please ignore.";
        }
        if (type === "number" || has(h, "quantity", "amount") || /\bage\b/i.test(h)) return "7";

        const isDob = has(h, "dob", "birth", "bday", "date of birth", "born");
        const isDate = type === "date" || type === "datetime-local" || isDob ||
          has(h, "date", "joining", "doj", "departure", "arrival", "scheduled", "appointment", "expire", "expiry", "start date", "end date") ||
          has(ph, "yyyy", "yyyy-mm-dd", "dd/mm/yyyy", "mm/dd/yyyy", "dd-mm-yyyy", "yyyy/mm/dd");

        if (isDate) {
          const isDDMM = has(ph, "dd/mm/yyyy", "dd-mm-yyyy", "dd.mm.yyyy") || has(h, "dd/mm/yyyy", "dd-mm-yyyy");
          const isMMDD = has(ph, "mm/dd/yyyy", "mm-dd-yyyy", "mm.dd.yyyy") || has(h, "mm/dd/yyyy", "mm-dd-yyyy");
          if (isDob) {
            if (isDDMM) return "15/05/1995";
            if (isMMDD) return "05/15/1995";
            return "1995-05-15";
          }
          if (isDDMM) return "20/10/2026";
          if (isMMDD) return "10/20/2026";
          return "2026-10-20";
        }

        if (type === "time") return "14:30";
        if (type === "search") return "test query";

        if (has(h, "first name", "firstname", "given", "fname") && !has(h, "last name", "lastname", "surname", "family", "lname")) return "Jordan";
        if (has(h, "last name", "lastname", "surname", "family", "lname")) return "Ellis";
        if (has(h, "company", "organisation", "organization", "business")) return "Northwind Testing Ltd";
        if (has(h, "job", "role", "title") && !has(h, "subject")) return "QA Engineer";
        if (has(h, "subject")) return "Automated form test";
        if (has(h, "address", "street")) return "120 Market Street";
        if (has(h, "city", "town")) return "San Francisco";
        if (has(h, "state", "province", "region")) return "California";
        if (has(h, "zip", "postal", "postcode")) return "94105";
        if (has(h, "country")) return "United States";
        if (has(h, "budget", "price")) return "5000";
        if (has(h, "full name", "fullname") || (!has(h, "first", "last") && has(h, "name"))) return "Jordan Ellis";
        return "Test value";
      }

      function triggerChange(el) {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        if (typeof window !== "undefined" && window.jQuery) {
          try { window.jQuery(el).trigger("change"); } catch (e) {}
        }
      }

      function setNative(el, value) {
        const proto = el.tagName.toLowerCase() === "textarea" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value");
        if (setter && setter.set) setter.set.call(el, value); else el.value = value;
        triggerChange(el);
        el.dispatchEvent(new Event("blur", { bubbles: true }));
      }

      const skip = ["submit", "button", "reset", "image", "file", "hidden"];
      function fillable(root) {
        return Array.prototype.slice.call(root.querySelectorAll("input, textarea, select")).filter(function (el) {
          const t = (el.getAttribute("type") || "text").toLowerCase();
          if (el.tagName.toLowerCase() === "input" && skip.indexOf(t) !== -1) return false;
          if (el.disabled || el.readOnly) return false;
          return isElementVisible(el);
        });
      }

      const forms = Array.prototype.slice.call(document.querySelectorAll("form"));
      let target = null;
      let best = 0;
      for (let i = 0; i < forms.length; i++) {
        const n = fillable(forms[i]).length;
        if (n > best) { best = n; target = forms[i]; }
      }
      let scope = target;
      if (!scope || best === 0) {
        const loose = fillable(document.body);
        if (!loose.length) return { ok: false, reason: "no_fields", message: "No fillable form fields were detected on this page." };
        scope = document.body;
      }

      const els = fillable(scope);
      if (!els.length) return { ok: false, reason: "no_fields", message: "No fillable form fields were detected on this page." };

      const fields = [];
      const radioGroups = {};
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        const tag = el.tagName.toLowerCase();
        const type = tag === "input" ? (el.getAttribute("type") || "text").toLowerCase() : tag;
        const h = hintOf(el);
        const nameAttr = el.getAttribute("name");

        let selector = tag;
        if (nameAttr) {
          try {
            selector = '[name="' + CSS.escape(nameAttr) + '"]';
          } catch (e) {
            selector = '[name]';
          }
        } else if (el.id) {
          try {
            selector = '#' + CSS.escape(el.id);
          } catch (e) {
            selector = tag;
          }
        }

        const entry = {
          label: labelText(el) || nameAttr || "(unlabelled " + type + ")",
          selector: selector,
          field_type: type,
          required: !!(el.required || el.getAttribute("aria-required") === "true"),
          filled: false,
          value_used: "",
          note: "",
        };

        try {
          if (type === "checkbox") {
            if (!el.checked) el.click();
            entry.value_used = "checked";
            entry.filled = el.checked;
          } else if (type === "radio") {
            const nm = nameAttr || "anon";
            if (radioGroups[nm]) { continue; }
            radioGroups[nm] = true;
            if (!el.checked) el.click();
            entry.value_used = "selected: " + (labelText(el) || "first option");
            entry.filled = el.checked;
          } else if (tag === "select") {
            function isPlaceholder(opt) {
              const val = (opt.value || "").trim().toLowerCase();
              const txt = (opt.text || opt.textContent || "").trim().toLowerCase();
              if (!val || val === "0" || val === "-1") return true;
              return /^(select|choose|pick|--|none|select one|please select)/i.test(txt) ||
                     /^(select|choose|pick|--|none)/i.test(val);
            }
            const allOpts = Array.prototype.slice.call(el.options).filter(function (o) { return !o.disabled; });
            const validOpts = allOpts.filter(function (o) { return !isPlaceholder(o); });
            const chosen = validOpts.length > 0 ? validOpts[0] : (allOpts.length > 1 ? allOpts[1] : allOpts[0]);
            if (chosen && !isPlaceholder(chosen)) {
              el.value = chosen.value;
              triggerChange(el);
              entry.value_used = (chosen.text || chosen.value).trim().slice(0, 60);
              entry.filled = true;
            } else {
              entry.note = "no selectable options";
            }
          } else {
            const v = valueFor(el, h);
            setNative(el, v);
            entry.value_used = v;
            entry.filled = el.value === v;
            if (!entry.filled) entry.note = "value rejected by the page";
          }
        } catch (err) {
          entry.note = String(err && err.message || err).slice(0, 120);
        }
        fields.push(entry);
      }

      const box = scope === document.body ? document.body : scope;
      try {
        box.setAttribute("data-fta-form", "1");
        box.scrollIntoView({ block: "center" });
      } catch (e) {}

      let submitLabel = "";
      const btn = safeQuery('button[type="submit"], input[type="submit"], button:not([type])', box) ||
        Array.prototype.slice.call(box.querySelectorAll("button, input[type=button], a[role=button]")).filter(function (b) {
          const t = (b.textContent || b.value || "").toLowerCase();
          return /submit|send|sign up|register|subscribe|continue|book|request|get started/.test(t);
        })[0];
      if (btn) {
        try {
          btn.setAttribute("data-fta-submit", "1");
          submitLabel = (btn.textContent || btn.value || "Submit").replace(/\s+/g, " ").trim().slice(0, 40);
        } catch (e) {}
      }

      return {
        ok: true,
        fields: fields,
        submitLabel: submitLabel,
        isForm: scope.tagName.toLowerCase() === "form",
        formSelector: (function () {
          const tag = scope.tagName.toLowerCase();
          let sel = tag;
          try {
            if (scope.id) sel += "#" + CSS.escape(scope.id);
            const nm = scope.getAttribute("name");
            if (nm) sel += '[name="' + nm + '"]';
          } catch (e) {}
          return sel;
        })(),
      };
    });

    if (!plan || !plan.ok) {
      return {
        data: {
          ok: false,
          reason: (plan && plan.reason) || "no_fields",
          message: (plan && plan.message) || "No fillable form fields were detected on the page.",
          title: title
        },
        type: "application/json"
      };
    }

    // Wait for fonts and styles to fully render
    try {
      await page.evaluate(async function () {
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }
      });
    } catch (e) {}
    await new Promise(function (r) { setTimeout(r, 2000); });

    let filledShot = null;
    try {
      const el = await page.$('[data-fta-form="1"]');
      if (el) filledShot = await el.screenshot({ encoding: "base64" });
    } catch (e) { filledShot = null; }
    if (!filledShot) {
      try {
        filledShot = await page.screenshot({ encoding: "base64" });
      } catch (e) { filledShot = null; }
    }

    let submitted = false;
    let outcome = "filled_only";
    let resultText = "";
    let resultShot = null;

    if (mode === "fill_submit") {
      const before = page.url();
      try {
        const btn = await page.$('[data-fta-submit="1"]');
        if (!btn) {
          outcome = "no_submit_button";
        } else {
          await btn.click();
          submitted = true;
          await new Promise(function (r) { setTimeout(r, 6000); });
        }
      } catch (e) {
        outcome = "submit_error";
        resultText = String(e && e.message || e).slice(0, 300);
      }

      if (submitted) {
        const after = await page.evaluate(function (beforeUrl) {
          function vis(el) {
            try {
              const s = window.getComputedStyle(el);
              const r = el.getBoundingClientRect();
              return s.display !== "none" && s.visibility !== "hidden" && r.height > 0;
            } catch (e) { return false; }
          }
          const invalid = document.querySelectorAll('[aria-invalid="true"], .error, .invalid-feedback, .field-error, .help-block.error');
          const errorEls = Array.prototype.slice.call(invalid).filter(vis);
          const successSel = '[class*="success"], [class*="thank"], [role="status"], [role="alert"], .alert, [class*="confirm"]';
          const okEls = Array.prototype.slice.call(document.querySelectorAll(successSel)).filter(vis);
          const bodyText = (document.body.innerText || "").slice(0, 4000);
          const thanks = /thank you|thanks|we(?:'| ha)ve received|submission received|successfully|success!|message sent|we\'ll be in touch/i.test(bodyText);
          const failed = /required|invalid|please enter|please fill|error|try again|captcha/i.test(bodyText);
          let focus = null;
          const pick = okEls[0] || errorEls[0];
          if (pick) {
            try {
              pick.setAttribute("data-fta-result", "1");
              focus = true;
              pick.scrollIntoView({ block: "center" });
            } catch (e) {}
          }
          let snippet = "";
          if (pick) snippet = (pick.innerText || "").replace(/\s+/g, " ").trim().slice(0, 400);
          else snippet = bodyText.replace(/\s+/g, " ").trim().slice(0, 300);
          return {
            urlChanged: window.location.href !== beforeUrl,
            errors: errorEls.length,
            successFound: okEls.length > 0 || thanks,
            failureHints: failed,
            snippet: snippet,
            focused: !!focus,
            formGone: !document.querySelector('[data-fta-form="1"]'),
          };
        }, before);

        resultText = after.snippet;
        if (after.successFound || after.urlChanged || after.formGone) outcome = "submitted";
        else if (after.errors > 0 || after.failureHints) outcome = "validation_blocked";
        else outcome = "unknown_result";

        try {
          const rEl = await page.$('[data-fta-result="1"]');
          if (rEl) resultShot = await rEl.screenshot({ encoding: "base64" });
        } catch (e) { resultShot = null; }
        if (!resultShot) {
          try {
            resultShot = await page.screenshot({ encoding: "base64" });
          } catch (e) { resultShot = null; }
        }
      } else if (!resultShot) {
        try {
          resultShot = await page.screenshot({ encoding: "base64" });
        } catch (e) { resultShot = null; }
      }
    }

    return {
      data: {
        ok: true,
        title: title,
        pageUrl: page.url(),
        fields: plan.fields,
        formSelector: plan.formSelector,
        submitLabel: plan.submitLabel,
        submitted: submitted,
        outcome: outcome,
        resultText: resultText,
        filledShot: filledShot,
        resultShot: resultShot,
        durationMs: Date.now() - started,
      },
      type: "application/json",
    };
  } catch (err) {
    return {
      data: {
        ok: false,
        reason: "execution_error",
        message: String(err && err.message || err),
        durationMs: Date.now() - started,
      },
      type: "application/json"
    };
  }
}
`;
