// Foldline landing page behaviour: sticky header, small-screen nav, billing cycle,
// newsletter validation, footer year. Progressive: the page is complete without JS.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// sticky header rule appears once the page has moved
const head = $("header.site");
addEventListener("scroll", () => head.classList.toggle("stuck", scrollY > 8), { passive: true });

// small-screen nav: one button, aria-expanded drives the panel
const nav = $("#nav"), toggle = $(".navtoggle");
const cta = document.createElement("a");
cta.className = "btn mobile-cta";
cta.href = "#get";
cta.textContent = "Get Foldline";
nav.append(cta);
toggle.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  toggle.setAttribute("aria-expanded", String(open));
  toggle.textContent = open ? "Close" : "Menu";
  if (open) nav.querySelector("a").focus();
});
nav.addEventListener("click", (e) => {
  if (e.target.tagName === "A") { nav.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); toggle.textContent = "Menu"; }
});
nav.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { nav.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); toggle.textContent = "Menu"; toggle.focus(); }
});

// billing cycle: one source of truth in data attributes
$$(".billing .seg").forEach((btn) => btn.addEventListener("click", () => {
  const cycle = btn.dataset.cycle;
  $$(".billing .seg").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  $$(".price b, .price span").forEach((el) => {
    const v = el.dataset[cycle];
    if (v != null) el.textContent = v;
  });
}));

// newsletter: inline error, then a status message
const form = $("#signup");
if (form) {
  const input = $("#email"), help = $("#email-help"), sent = $("#sent");
  const valid = (v) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.trim());
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value;
    if (!valid(v)) {
      input.setAttribute("aria-invalid", "true");
      help.textContent = v.trim()
        ? "That address has no domain after the @ — check the spelling."
        : "Put your address in the box, then we will write twice a year.";
      help.classList.add("err");
      help.classList.remove("sent");
      input.focus();
      return;
    }
    input.removeAttribute("aria-invalid");
    help.classList.remove("err");
    help.hidden = true;
    sent.hidden = false;
    form.reset();
  });
  input.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
    help.classList.remove("err");
    help.textContent = "We write about twice a year. Unsubscribe in one click.";
  });
}

$("#year").textContent = new Date().getFullYear();
