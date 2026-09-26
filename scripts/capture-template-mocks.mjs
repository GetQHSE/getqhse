/**
 * Captures screens of the GetQhse demo template as static mocks for client-web
 * (features/template-mocks): the rendered HTML of every step and variant, the
 * modals they open, and only the CSS rules those screens use, scoped under
 * `.gq-mock`. The template's inline handlers become `data-mock` actions that
 * the mock page plays locally — no backend, no template logic. Chained
 * actions are joined with " && ".
 *
 * Usage: node scripts/capture-template-mocks.mjs <template.html>
 */
/* global document, window, localStorage, CSSStyleRule, CSSMediaRule, CSSSupportsRule,
   CSSKeyframesRule -- the capture runs inside the template page (page.evaluate). */
/* global state, save, render, setRoute, showToast, ensurePipFull, openPipEvalAdjust,
   generatePipRisks, openRiskRating, openExistingControls -- the template's own globals. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const templatePath = process.argv[2];
if (!templatePath) {
  console.error("Usage: node scripts/capture-template-mocks.mjs <template.html>");
  process.exit(1);
}
const TEMPLATE = pathToFileURL(resolve(templatePath)).href;
const OUT_DIR = resolve("apps/client-web/src/features/template-mocks");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("dialog", (d) => d.dismiss());
await page.goto(TEMPLATE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(800);

const result = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const settle = async () => {
    render();
    await sleep(120);
  };

  /* ------------------------------ CSS rules ------------------------------ */
  const flat = [];
  const walk = (rules, media) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) flat.push({ rule, media });
      else if (rule instanceof CSSMediaRule) walk(rule.cssRules, rule.conditionText);
      else if (rule instanceof CSSSupportsRule) walk(rule.cssRules, media);
    }
  };
  const keyframes = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    walk(rules, null);
    for (const r of rules) if (r instanceof CSSKeyframesRule) keyframes.push(r.cssText);
  }
  const splitSelectors = (text) => {
    const parts = [];
    let depth = 0,
      cur = "";
    for (const ch of text) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        parts.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  };
  const DYNAMIC =
    /::?(hover|focus-visible|focus-within|focus|active|visited|before|after|placeholder|selection|marker|first-letter|first-line|-webkit-[\w-]+|-moz-[\w-]+)(\([^)]*\))?/g;
  const testable = flat.map(({ rule }) =>
    splitSelectors(rule.selectorText).map((s) => {
      const test = s.replace(DYNAMIC, "").trim() || "*";
      return { s, test };
    }),
  );
  const matched = new Set();
  const rootMatched = new Set();
  const collect = (roots) => {
    flat.forEach((_, i) => {
      testable[i].forEach(({ test }, j) => {
        const key = i + "|" + j;
        if (matched.has(key)) return;
        try {
          for (const root of roots) {
            if (root.matches(test) || root.querySelector(test)) {
              matched.add(key);
              return;
            }
          }
        } catch {
          /* invalid selector for matches() */
        }
      });
    });
  };
  // Inherited typography from html/body/:root, and the .content container itself.
  flat.forEach((_, i) =>
    testable[i].forEach(({ test }, j) => {
      try {
        if (document.documentElement.matches(test) || document.body.matches(test))
          rootMatched.add(i + "|" + j);
      } catch {
        // Not a selector matches() accepts.
      }
    }),
  );

  /* --------------------------- handler mapping --------------------------- */
  const toastOf = (fn) => {
    const src = String(window[fn] || "");
    const m = src.match(/showToast\((['"`])(.*?)\1/);
    return m ? m[2] : "Action simulée (maquette)";
  };
  const mapHandler = (code, ctx) => {
    code = code.trim();
    let m;
    // The template renders its risk step 7 exactly as step 6 (Registre final).
    if (code === "setRiskStep(7)") return "step:6";
    if ((m = code.match(/^set(?:Pip|Risk)Step\((\d+)\)$/))) return "step:" + m[1];
    if (code === "goBack()") return "back";
    if ((m = code.match(/^setPipFilter\('([^']*)'\)$/))) return "variant:filter=" + m[1];
    if ((m = code.match(/^setPipEvalMode\('([^']*)'\)$/))) return "variant:evalMode=" + m[1];
    if ((m = code.match(/^openPipEvalAdjust\('([^']*)'\)$/))) return "variant:adjust=" + m[1];
    if ((m = code.match(/^togglePipEdit\('([^']*)'\)$/))) return "toggle:pipedit-" + m[1] + ":open";
    if ((m = code.match(/^editPipAnswer\('([^']*)'\)$/))) return "editfield:pip-answer-" + m[1];
    if (
      (m = code.match(/^this\.closest\('([^']+)'\)\.querySelector\('([^']+)'\)\.contentEditable/))
    )
      return "edit:" + m[1] + "|" + m[2];
    if (code === "editServiceAssignment(this)") return "assign";
    if ((m = code.match(/^openRiskRating\('([^']*)'\)$/))) return "modal:rating-" + m[1];
    if ((m = code.match(/^openExistingControls\('([^']*)'\)$/))) return "modal:controls-" + m[1];
    if (code === "generatePipRisks()")
      return "variant:generated=1 && toast:✓ Propositions PIP générées";
    if (code === "addPip()") return "toast:Ajout d’une partie intéressée — maquette";
    if (/^setNoControl\(/.test(code))
      return "toast:Aucune maîtrise existante retenue pour cette ligne";
    if ((m = code.match(/^showToast\((['"])(.*)\1\)$/))) return "toast:" + m[2];
    if (/this\.innerText=/.test(code)) {
      const text = (code.match(/this\.innerText='([^']*)'/) || [])[1] || "";
      const cls = (code.match(/classList\.add\('([^']*)'\)/) || [])[1] || "";
      return "self:" + text + "|" + cls;
    }
    if (/^if\(event\.target===this\)/.test(code)) return "backdrop";
    if (code === "event.preventDefault()" || code === "event.stopPropagation()") return "noop";
    if ((m = code.match(/^(\w+)\(/))) {
      const fn = m[1];
      if (ctx === "modal") {
        if (/close|cancel/i.test(fn)) return "close";
        if (/control/i.test(fn)) return "close-toast:✓ Maîtrises existantes enregistrées";
        return "close-toast:" + toastOf(fn);
      }
      if (ctx === "adjust" && /Adjust|Eval/i.test(fn) && /cancel|close/i.test(fn))
        return "variant:adjust=";
      if (ctx === "adjust" && /Adjust|Eval/i.test(fn))
        return "variant:adjust= && toast:" + toastOf(fn);
      if (/^export/i.test(fn)) return "toast:Export simulé — maquette sans génération de fichier";
      return "toast:" + toastOf(fn);
    }
    return "toast:Action simulée (maquette)";
  };
  const unmapped = new Set();
  const serialize = (node, ctx) => {
    const clone = node.cloneNode(true);
    for (const el of [clone, ...clone.querySelectorAll("*")]) {
      for (const attr of [...el.attributes]) {
        if (!attr.name.startsWith("on")) continue;
        if (attr.name === "onclick") {
          const action = mapHandler(attr.value, ctx);
          if (action.startsWith("toast:Action simulée")) unmapped.add(attr.value.slice(0, 80));
          if (action !== "noop") el.setAttribute("data-mock", action);
        }
        el.removeAttribute(attr.name);
      }
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        if (el.tagName === "TEXTAREA") el.textContent = el.value;
      }
    }
    return clone.outerHTML;
  };
  const pageNode = () => {
    const h = [...document.querySelectorAll(".content h1,.content h2")].find((x) =>
      /Parties intéressées pertinentes|Risques & opportunités/.test(x.textContent),
    );
    let el = h;
    while (el.parentElement && !el.parentElement.classList.contains("content"))
      el = el.parentElement;
    return el;
  };
  const argsOf = (node, re) => [
    ...new Set(
      [...node.querySelectorAll("[onclick]")]
        .map((e) => (e.getAttribute("onclick").match(re) || [])[1])
        .filter((x) => x !== undefined),
    ),
  ];

  const snapshot = (list, step, params, ctx = "page") => {
    const node = pageNode();
    collect([node]);
    list.push({ step, params, html: serialize(node, ctx) });
  };

  /* --------------------------------- PIP --------------------------------- */
  const pip = { snapshots: [], modals: {}, defaults: {} };
  setRoute("pip");
  await sleep(200);
  ensurePipFull();
  pip.defaults.filter = state.pipAnalysis.filter || "all";
  for (const step of [1, 2, 3, 4, 5]) {
    state.pipAnalysis.step = step;
    save();
    await settle();
    if (step === 1) {
      for (const filter of argsOf(pageNode(), /setPipFilter\('([^']*)'\)/)) {
        state.pipAnalysis.filter = filter;
        save();
        await settle();
        snapshot(pip.snapshots, 1, { filter });
      }
      state.pipAnalysis.filter = pip.defaults.filter;
      save();
      await settle();
    } else if (step === 4) {
      const modes = argsOf(pageNode(), /setPipEvalMode\('([^']*)'\)/);
      // The mode the template shows by default is the one its buttons mark active.
      const activeMode = pageNode().querySelector("[onclick^='setPipEvalMode'].active");
      const defaultMode =
        state.pipAnalysis.evalMode ||
        (activeMode?.getAttribute("onclick").match(/'([^']*)'/) || [])[1] ||
        modes[0];
      pip.defaults.evalMode = defaultMode;
      for (const mode of modes) {
        state.pipAnalysis.evalMode = mode;
        save();
        await settle();
        snapshot(pip.snapshots, 4, { evalMode: mode });
      }
      state.pipAnalysis.evalMode = defaultMode;
      save();
      await settle();
      for (const id of argsOf(pageNode(), /openPipEvalAdjust\('([^']*)'\)/)) {
        openPipEvalAdjust(id);
        await sleep(120);
        snapshot(pip.snapshots, 4, { evalMode: defaultMode, adjust: id }, "adjust");
        state.pipAnalysis.items.forEach((x) => (x.pipEvalEditing = false));
        save();
        await settle();
      }
    } else {
      snapshot(pip.snapshots, step, {});
    }
  }

  /* --------------------------------- RISKS -------------------------------- */
  const risks = { snapshots: [], modals: {}, defaults: { generated: "0" } };
  setRoute("risks");
  await sleep(200);
  const captureModal = async (open, key) => {
    open();
    await sleep(150);
    const modal = [
      ...document.querySelectorAll(".cot-modal-backdrop, [class*=modal-backdrop]"),
    ].pop();
    if (!modal) return;
    collect([modal]);
    risks.modals[key] = serialize(modal, "modal");
    modal.remove();
    await settle();
  };
  for (const generated of ["0", "1"]) {
    if (generated === "1") {
      generatePipRisks();
      await sleep(500);
    }
    for (const step of [1, 2, 3, 4, 5, 6]) {
      state.riskAnalysis.step = step;
      save();
      await settle();
      snapshot(risks.snapshots, step, { generated });
      if (step === 3)
        for (const id of argsOf(pageNode(), /openRiskRating\('([^']*)'\)/))
          await captureModal(() => openRiskRating(id), "rating-" + id);
      if (step === 4)
        for (const id of argsOf(pageNode(), /openExistingControls\('([^']*)'\)/))
          await captureModal(() => openExistingControls(id), "controls-" + id);
    }
  }

  // The template's toast, so its CSS is captured too.
  showToast("x");
  await sleep(50);
  collect([document.querySelector(".toast")]);
  const content = document.querySelector(".content");
  flat.forEach((_, i) =>
    testable[i].forEach(({ test }, j) => {
      try {
        if (content.matches(test)) matched.add(i + "|" + j);
      } catch {
        // Not a selector matches() accepts.
      }
    }),
  );

  /* ------------------------------ CSS output ------------------------------ */
  const INHERITED =
    /^(--|font|color$|line-height|letter-spacing|-webkit-font-smoothing|text-rendering|background)/;
  const scope = (sel) => {
    let rest = sel
      .replace(/#app\b/g, ".app")
      .replace(/^(:root|html)\b\s*/, "")
      .replace(/^body(\.[\w-]+)*\b\s*/, "")
      .replace(/^>\s*/, "");
    return rest ? ".gq-mock " + rest : ".gq-mock";
  };
  const css = [];
  flat.forEach(({ rule, media }, i) => {
    const parts = testable[i]
      .map((p, j) => ({ ...p, j }))
      .filter(({ j }) => matched.has(i + "|" + j));
    const rootParts = testable[i]
      .map((p, j) => ({ ...p, j }))
      .filter(({ j }) => rootMatched.has(i + "|" + j) && !matched.has(i + "|" + j));
    let out = "";
    if (parts.length) out += `${parts.map((p) => scope(p.s)).join(",")}{${rule.style.cssText}}`;
    if (rootParts.length) {
      // cssText keeps shorthands such as `background: var(--bg)`, which the
      // longhand accessors report as empty pending var() substitution.
      const decl = rule.style.cssText
        .split(/;(?![^(]*\))/)
        .map((d) => d.trim())
        .filter((d) => d && INHERITED.test(d.split(":")[0].trim()))
        .join(";");
      if (decl) out += `.gq-mock{${decl}}`;
    }
    if (!out) return;
    css.push(media ? `@media ${media}{${out}}` : out);
  });

  const rules = css.join("\n");
  const used = keyframes.filter((text) => rules.includes(text.match(/@keyframes ([\w-]+)/)[1]));
  return { pip, risks, css: [...used, rules].join("\n"), unmapped: [...unmapped] };
});

/* ------------------------------ write files ------------------------------ */

// Template keyframe names are global: prefix them so they never clash with the app's.
let css = result.css;
for (const [, name] of css.matchAll(/@keyframes ([\w-]+)/g)) {
  css = css.replace(new RegExp(`\\b${name}\\b`, "g"), `gqm-${name}`);
}

/** Identical screens (e.g. steps a variant does not change) are stored once. */
function bundle({ snapshots, modals, defaults }) {
  const html = [];
  const index = new Map();
  const refs = snapshots.map(({ step, params, html: markup }) => {
    if (!index.has(markup)) index.set(markup, html.push(markup) - 1);
    return { step, params, html: index.get(markup) };
  });
  return { defaults, snapshots: refs, html, modals };
}

const header = "/* Generated by scripts/capture-template-mocks.mjs — do not edit by hand. */\n";
writeFileSync(`${OUT_DIR}/pip.snapshots.json`, JSON.stringify(bundle(result.pip)));
writeFileSync(`${OUT_DIR}/risks.snapshots.json`, JSON.stringify(bundle(result.risks)));
writeFileSync(`${OUT_DIR}/template-mocks.css`, header + css + "\n");
console.log(
  `pip: ${result.pip.snapshots.length} screens · risks: ${result.risks.snapshots.length} screens,`,
  `${Object.keys(result.risks.modals).length} modals · css: ${Math.round(css.length / 1024)} KB`,
);
if (result.unmapped.length) console.warn("Handlers played as a generic toast:", result.unmapped);
await browser.close();
