/* 11 · the one content, nine times.
   Every style page fetches this file and renders it with its own template, so
   "the same page in nine styles" is a fact about the build, not a claim in prose.
   The gallery reads the rendered text of all nine and prints the parity table. */

export async function loadContent() {
  const r = await fetch("content.json", { cache: "no-store" });
  if (!r.ok) throw new Error("content.json: " + r.status);
  return r.json();
}

export function esc(s) {
  return String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

/** The one shared behaviour: the release-notes form. Nine looks, one validation. */
function wire(root) {
  for (const form of root.querySelectorAll("form[data-subscribe]")) {
    const out = form.querySelector("[data-status]");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = (form.querySelector("input[type=email], input[name=email]")?.value || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
        out.textContent = "That is not an email address. Nothing was sent.";
        form.querySelector("input").focus();
        return;
      }
      out.textContent = "Noted: the next release note goes to " + v + ".";
      form.querySelector("input").value = "";
    });
  }
}

export async function renderPage(tpl, opts = {}) {
  const c = await loadContent();
  const root = document.getElementById("app");
  root.innerHTML = tpl(c, esc);
  if (opts.title) document.title = typeof opts.title === "function" ? opts.title(c) : opts.title;
  wire(root);
  // the style's own script, if the page declared one, runs after the markup exists
  if (typeof opts.after === "function") opts.after(root, c);
  document.documentElement.style.setProperty("--ready", "1");
  return c;
}

/** The words a style must carry — the parity check the gallery runs. */
export function contentStrings(c) {
  const out = [c.brand, c.brandNote, c.kicker, c.h1, c.lede, c.ctaPrimary, c.ctaSecondary];
  for (const f of c.features) out.push(f.t, f.b);
  for (const s of c.stats) out.push(s.u, s.n);
  out.push(c.quote.q, c.quote.by, c.quote.role);
  for (const p of c.plans) { out.push(p.t, p.p, p.per); for (const l of p.l) out.push(l); }
  out.push(c.foot.made, c.foot.legal, c.foot.inputLabel, c.foot.inputHint, c.foot.inputButton);
  for (const l of c.foot.lines) out.push(l);
  return out;
}
