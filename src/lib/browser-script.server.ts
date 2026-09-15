// Source of the script executed inside the remote Browserless browser.
// It is sent as plain text, so it must be self-contained ES module source.
export const BROWSER_SCRIPT = String.raw`

export default async ({ page, context }) => {
  const url = context.url;
  const mode = context.mode;
  const started = Date.now();

  try {
    await page.setViewport({ width: 1280, height: 1000 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    );

    async function loadAndSettle() {
      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
      } catch (e) {
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
        } catch (e2) {
          return { ok: false, reason: "navigation_failed", message: String(e2 && e2.message || e2) };
        }
      }

      // Wake up delayed scripts (Elementor, Breeze, WP Rocket, lazy hydration)
      await page.evaluate(function () {
        window.dispatchEvent(new Event("scroll"));
        window.dispatchEvent(new Event("mousemove"));
      });
      await new Promise(function (r) { setTimeout(r, 2000); });

      // Smooth scroll down to trigger lazy sections and footer forms
      await page.evaluate(async function () {
        await new Promise(function (resolve) {
          let totalHeight = 0;
          const distance = 400;
          const timer = setInterval(function () {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= scrollHeight || totalHeight > 12000) {
              clearInterval(timer);
              window.scrollTo(0, 0);
              resolve();
            }
          }, 100);
        });
      });

      // Wait for fonts, CSS transitions, and dynamic hydration to settle
      try {
        await page.evaluate(async function () {
          if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
          }
        });
      } catch (e) {}
      await new Promise(function (r) { setTimeout(r, 3000); });

      // Nudge conditional-logic plugins (e.g. Extensions for Elementor Form) to
      // evaluate their rules: they often only hide fields after a change event.
      try {
        await page.evaluate(function () {
          const els = Array.prototype.slice.call(document.querySelectorAll("select, input"));
          for (let i = 0; i < els.length; i++) {
            const el = els[i];
            try {
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
              if (window.jQuery) { try { window.jQuery(el).trigger("change"); } catch (e) {} }
            } catch (e) {}
          }
        });
      } catch (e) {}
      await new Promise(function (r) { setTimeout(r, 1500); });
      return { ok: true };
    }

    const initNav = await loadAndSettle();
    if (!initNav.ok) {
      return {
        data: { ok: false, reason: initNav.reason, message: initNav.message },
        type: "application/json"
      };
    }

    const title = await page.title();

    // Inspect how many visible forms exist on the page
    const formMeta = await page.evaluate(function () {
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
          return false;
        }
      }

      const skip = ["submit", "button", "reset", "image", "file", "hidden"];
      function fillableIn(root) {
        return Array.prototype.slice.call(root.querySelectorAll("input, textarea, select")).filter(function (el) {
          const t = (el.getAttribute("type") || "text").toLowerCase();
          if (el.tagName.toLowerCase() === "input" && skip.indexOf(t) !== -1) return false;
          if (el.disabled || el.readOnly) return false;
          return isElementVisible(el);
        });
      }

      const allForms = Array.prototype.slice.call(document.querySelectorAll("form")).filter(function (f) {
        return fillableIn(f).length > 0 && isElementVisible(f);
      });

      if (allForms.length === 0) {
        const loose = fillableIn(document.body);
        if (loose.length === 0) return [];
        return [{ index: 0, selector: "body", heading: "Main page form", fieldCount: loose.length }];
      }

      return allForms.map(function (f, idx) {
        let heading = "";
        let prev = f.previousElementSibling;
        while (prev && !heading) {
          if (/^H[1-6]$/i.test(prev.tagName)) heading = prev.textContent || "";
          else {
            const h = prev.querySelector("h1, h2, h3, h4, h5, h6");
            if (h) heading = h.textContent || "";
          }
          prev = prev.previousElementSibling;
        }
        if (!heading && f.parentElement) {
          const parentH = f.parentElement.querySelector("h1, h2, h3, h4");
          if (parentH) heading = parentH.textContent || "";
        }
        heading = (heading || f.getAttribute("aria-label") || f.getAttribute("name") || ("Form " + (idx + 1))).replace(/\s+/g, " ").trim().slice(0, 70);

        let sel = "form:nth-of-type(" + (idx + 1) + ")";
        if (f.id) sel = "form#" + CSS.escape(f.id);
        else if (f.getAttribute("name")) sel = "form[name=\"" + CSS.escape(f.getAttribute("name")) + "\"]:nth-of-type(" + (idx + 1) + ")";

        return {
          index: idx,
          selector: sel,
          heading: heading,
          fieldCount: fillableIn(f).length
        };
      });
    });

    if (!formMeta || formMeta.length === 0) {
      return {
        data: {
          ok: false,
          reason: "no_fields",
          message: "No visible fillable form fields were detected after full render.",
          title: title
        },
        type: "application/json"
      };
    }

    const formResults = [];

    for (let fIdx = 0; fIdx < formMeta.length; fIdx++) {
      const meta = formMeta[fIdx];

      // If we are on form 2+ and we already submitted form 1 in fill_submit mode, reload page cleanly
      if (fIdx > 0 && mode === "fill_submit") {
        await loadAndSettle();
      }

      // Execute autofill on this specific form
      const plan = await page.evaluate(function (targetIndex) {
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
            return false;
          }
        }

        function labelText(el) {
          let t = "";
          try {
            if (el.id) {
              const l = safeQuery("label[for=\"" + CSS.escape(el.id) + "\"]");
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
            const rawPh = (el.getAttribute("placeholder") || "").trim();
            const isGenericPh = /^(yyyy|dd|mm|select|choose|enter|type)/i.test(rawPh) || rawPh.includes("yyyy") || rawPh.includes("dd/mm") || rawPh.includes("mm/dd");
            if (!t && rawPh && !isGenericPh) {
              t = rawPh;
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
          if (has(h, "location", "city, state", "preferred job location", "locations")) return "San Francisco, CA";
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

        const skip = ["submit", "button", "reset", "image", "hidden"];
        function fillable(root) {
          return Array.prototype.slice.call(root.querySelectorAll("input, textarea, select")).filter(function (el) {
            const t = (el.getAttribute("type") || "text").toLowerCase();
            if (el.tagName.toLowerCase() === "input" && skip.indexOf(t) !== -1) return false;
            if (el.disabled || el.readOnly) return false;
            return isElementVisible(el);
          });
        }

        const forms = Array.prototype.slice.call(document.querySelectorAll("form")).filter(function (f) {
          return fillable(f).length > 0 && isElementVisible(f);
        });

        const scope = forms[targetIndex] || (targetIndex === 0 ? document.body : null);
        if (!scope) return { ok: false, reason: "form_missing", message: "Form not found" };

        const els = fillable(scope);
        if (!els.length) return { ok: false, reason: "no_fields", message: "No fillable form fields" };

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
              selector = "[name=\"" + CSS.escape(nameAttr) + "\"]";
            } catch (e) {
              selector = "[name]";
            }
          } else if (el.id) {
            try {
              selector = "#" + CSS.escape(el.id);
            } catch (e) {
              selector = tag;
            }
          }

          const entry = {
            label: labelText(el) || nameAttr || ("(unlabelled " + type + ")"),
            selector: selector,
            field_type: type,
            required: !!(el.required || el.getAttribute("aria-required") === "true"),
            filled: false,
            value_used: "",
            note: "",
          };

          try {
            if (type === "file") {
              entry.value_used = "(optional file upload skipped)";
              entry.filled = true;
            } else if (type === "checkbox") {
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

        // Tag the form box for clean screenshotting
        document.querySelectorAll("[data-fta-form]").forEach(function (e) { e.removeAttribute("data-fta-form"); });
        document.querySelectorAll("[data-fta-submit]").forEach(function (e) { e.removeAttribute("data-fta-submit"); });

        const box = scope === document.body ? document.body : scope;
        try {
          box.setAttribute("data-fta-form", String(targetIndex));
          box.scrollIntoView({ block: "center" });
        } catch (e) {}

        let submitLabel = "";
        const btn = safeQuery("button[type=\"submit\"], input[type=\"submit\"], button:not([type])", box) ||
          Array.prototype.slice.call(box.querySelectorAll("button, input[type=button], a[role=button]")).filter(function (b) {
            const t = (b.textContent || b.value || "").toLowerCase();
            return /submit|send|sign up|register|subscribe|continue|book|request|get started/.test(t);
          })[0];
        if (btn) {
          try {
            btn.setAttribute("data-fta-submit", String(targetIndex));
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
              if (nm) sel += "[name=\"" + nm + "\"]";
            } catch (e) {}
            return sel;
          })(),
        };
      }, fIdx);

      if (!plan || !plan.ok) continue;

      // Small wait to allow DOM to visually reflect input values
      await new Promise(function (r) { setTimeout(r, 1200); });

      let filledShot = null;
      try {
        const el = await page.$("[data-fta-form=\"" + fIdx + "\"]");
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
          const btn = await page.$("[data-fta-submit=\"" + fIdx + "\"]");
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
          const after = await page.evaluate(function (beforeUrl, targetIdx) {
            function vis(el) {
              try {
                const s = window.getComputedStyle(el);
                const r = el.getBoundingClientRect();
                return s.display !== "none" && s.visibility !== "hidden" && r.height > 0;
              } catch (e) { return false; }
            }
            const invalid = document.querySelectorAll("[aria-invalid=\"true\"], .error, .invalid-feedback, .field-error, .help-block.error");
            const errorEls = Array.prototype.slice.call(invalid).filter(vis);
            const successSel = "[class*=\"success\"], [class*=\"thank\"], [role=\"status\"], [role=\"alert\"], .alert, [class*=\"confirm\"]";
            const okEls = Array.prototype.slice.call(document.querySelectorAll(successSel)).filter(vis);
            const bodyText = (document.body.innerText || "").slice(0, 4000);
            const thanks = /thank you|thanks|we(?:'| ha)ve received|submission received|successfully|success!|message sent|we'll be in touch/i.test(bodyText);
            const failed = /required|invalid|please enter|please fill|error|try again|captcha/i.test(bodyText);
            let focus = null;
            const pick = okEls[0] || errorEls[0];
            if (pick) {
              try {
                pick.setAttribute("data-fta-result", String(targetIdx));
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
              formGone: !document.querySelector("[data-fta-form=\"" + targetIdx + "\"]"),
            };
          }, before, fIdx);

          resultText = after.snippet;
          if (after.successFound || after.urlChanged || after.formGone) outcome = "submitted";
          else if (after.errors > 0 || after.failureHints) outcome = "validation_blocked";
          else outcome = "unknown_result";

          try {
            const rEl = await page.$("[data-fta-result=\"" + fIdx + "\"]");
            if (rEl) resultShot = await rEl.screenshot({ encoding: "base64" });
          } catch (e) { resultShot = null; }
          if (!resultShot) {
            try {
              resultShot = await page.screenshot({ encoding: "base64" });
            } catch (e) { resultShot = null; }
          }
        }
      }

      formResults.push({
        formIndex: fIdx,
        heading: meta.heading,
        formSelector: plan.formSelector,
        fields: plan.fields,
        submitLabel: plan.submitLabel,
        submitted: submitted,
        outcome: outcome,
        resultText: resultText,
        filledShot: filledShot,
        resultShot: resultShot,
      });
    }

    if (formResults.length === 0) {
      return {
        data: {
          ok: false,
          reason: "no_fields",
          message: "No fillable form fields could be tested.",
          title: title
        },
        type: "application/json"
      };
    }

    return {
      data: {
        ok: true,
        title: title,
        pageUrl: page.url(),
        forms: formResults,
        // Preserve top-level fields for backwards compatibility with single form results
        fields: formResults[0].fields,
        formSelector: formResults[0].formSelector,
        submitLabel: formResults[0].submitLabel,
        submitted: formResults[0].submitted,
        outcome: formResults[0].outcome,
        resultText: formResults[0].resultText,
        filledShot: formResults[0].filledShot,
        resultShot: formResults[0].resultShot,
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
};
`;
