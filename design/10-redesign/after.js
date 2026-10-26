/* 10 · the redesign's behaviour. Four things, and all four answer a question a
   person arriving in a flood actually asks. */
const $ = (s, r = document) => r.querySelector(s);

/* the address: the page's reason for existing is "am I affected". Three demo
   addresses stand in for the Authority's address index. */
const KNOWN = {
  "qr1": { label: "2 Quay Wall, Harrowmouth", zone: "Zone 3 — designated area, flood line 4.20 m", state: "red",
    say: "Yes. Your street is inside the warned area. Barriers up now; the peak is 4.61 m at 22:14 on 3 December." },
  "quay wall": null,
  "sb4": { label: "14 Lower Sandbar Road", zone: "Zone 2 — designated area, flood line 4.65 m", state: "flood",
    say: "Watch it. The forecast peak of 4.61 m is 4 cm below your flood line, and the model run is uncertain by 15 cm. Fill in your flood plan tonight." },
  "uc2": { label: "9 Upcerne Lane, above the marsh", zone: "Zone 1 — outside the designated area", state: "ok",
    say: "No warning for you. The tide reaches 4.61 m at the mouth and falls away inland; Upcerne Lane is above it. Keep the number for flooding from surface water." },
};
KNOWN["quay wall"] = KNOWN["qr1"];
function checkAddr() {
  const raw = $("#addr").value.trim().toLowerCase();
  const v = $("#verdict");
  v.className = "verdict";
  if (!raw) { v.textContent = "Type an address, like “2 Quay Wall”, or the code from your flood line marker, like “QR1”."; return }
  const hit = KNOWN[raw] || Object.entries(KNOWN).find(([k]) => raw.includes(k) || k.includes(raw.split(" ")[0]))?.[1];
  if (!hit) {
    v.className = "verdict on-flood";
    v.innerHTML = "No exact match for <b>“" + raw.replace(/[<>&]/g, "") + "”</b> in the address index. " +
      "The index covers the designated areas only. Call <b>0300 123 4567</b>, or check the " +
      '<a href="#notices">street list in the Designated Areas Order</a>.';
    return;
  }
  v.className = "verdict on-" + hit.state;
  v.innerHTML = "<b>" + hit.label + "</b> — " + hit.zone + ". " + hit.say;
  v.dataset.code = "checked";
}
$("#addrGo").addEventListener("click", checkAddr);
$("#addr").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); checkAddr() } });
$("#addr").addEventListener("input", () => {
  const v = $("#verdict");
  v.className = "verdict";
  v.textContent = "Checking as you type is off, on purpose: press Check, and the answer is the answer at that moment.";
});
checkAddr();

/* the cookie banner: the least-tracking choice is the first button, and
   dismissing it changes nothing about the page */
const ck = $("#ck");
const close = (msg) => {
  const box = document.createElement("div");
  box.setAttribute("role", "status");
  box.className = "ck";
  box.innerHTML = '<div class="ck-in"><p>' + msg + ' <button type="button" id="ckDone">Close</button></p></div>';
  document.body.append(box);
  $("#ckDone").addEventListener("click", () => box.remove());
  box.querySelector("button").addEventListener("click", () => box.remove());
  ck.remove();
};
$("#ckMin").addEventListener("click", () => close("Saved: one cookie, for your search. No analytics."));
$("#ckAll").addEventListener("click", () => close("Saved: the search cookie, and analytics."));

/* the newsletter is not a warning service, and says so */
$("#nlGo").addEventListener("click", () => {
  const v = $("#nl").value.trim(), msg = $("#nlMsg");
  if (!/^[^@s]+@[^@@]+.[^@]+$/.test(v)) {
    msg.textContent = "That is not an email address. Nothing has been sent.";
    $("#nl").focus();
    return;
  }
  msg.textContent = "Subscribed: the fortnightly update, at " + v + ". Warnings are a separate service — use the button above.";
});

/* print the seven days: a tide table is the thing people take to a wall */
$("#printTides").addEventListener("click", () => window.print());

/* ---- the water, drawn ----------------------------------------------------------
   Two instruments, both built from numbers that are already on this page: the tide
   table's own cells, and the data attributes on the gauge. Nothing here invents a
   value, a missing gauge reading stays a gap in the line, and the geometry is
   exposed on window.__water so 10-redesign/measure.mjs can check the drawing against
   the text. The domain is read from the table, never typed. */
const FLOOD = 4.20;                                     // metres — the lede's number
function readTides() {
  return [...document.querySelectorAll("table.tides tbody tr")].map((tr) => {
    const cells = [...tr.querySelectorAll("td[data-l]")];
    const waters = [];
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const h = parseFloat(cells[i + 1].textContent);
      waters.push({ t: cells[i].textContent.trim(), h: Number.isFinite(h) ? h : null });
    }
    return { tr, day: tr.querySelector("th").textContent.trim(), waters };
  });
}
function drawCurves() {
  const rows = readTides();
  const hs = rows.flatMap((r) => r.waters.map((w) => w.h)).filter((v) => v != null);
  const lo = Math.min(...hs, FLOOD) - 0.35, hi = Math.max(...hs, FLOOD) + 0.35;
  const W = 118, H = 30, pad = 3;
  const y = (v) => H - pad - ((v - lo) / (hi - lo)) * (H - 2 * pad);
  for (const r of rows) {
    const n = r.waters.length, x = (i) => pad + (i * (W - 2 * pad)) / (n - 1);
    let d = "", pen = false;
    r.waters.forEach((w, i) => {
      if (w.h == null) { pen = false; return }          // a gauge out of service is a gap
      d += (pen ? " L " : " M ") + x(i).toFixed(1) + " " + y(w.h).toFixed(1);
      pen = true;
    });
    const marks = r.waters.map((w, i) => w.h == null
      ? `<line class="gap" x1="${x(i).toFixed(1)}" y1="${pad}" x2="${x(i).toFixed(1)}" y2="${H - pad}"/>`
      : `<circle class="${w.h > FLOOD ? "peak" : "pt"}" cx="${x(i).toFixed(1)}" cy="${y(w.h).toFixed(1)}" r="2"/>`).join("");
    r.tr.querySelector("th").insertAdjacentHTML("beforeend",
      `<svg class="tide-curve" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">` +
      `<rect class="above" x="${pad}" y="0" width="${W - 2 * pad}" height="${y(FLOOD).toFixed(1)}"/>` +
      `<line class="line" x1="${pad}" y1="${y(FLOOD).toFixed(1)}" x2="${W - pad}" y2="${y(FLOOD).toFixed(1)}"/>` +
      `<path class="water" d="${d.trim()}"/>${marks}</svg>`);
  }
  return { lo, hi, W, H, flood_y: y(FLOOD), rows: rows.map((r) => ({ day: r.day, waters: r.waters })) };
}
function drawGauge() {
  const el = document.getElementById("gauge");
  if (!el) return null;
  const d = el.dataset, lo = +d.lo, hi = +d.hi, W = 288, H = 26, pad = 2;
  const x = (v) => pad + ((v - lo) / (hi - lo)) * (W - 2 * pad);
  el.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">` +
    `<rect class="g-track" x="${pad}" y="9" width="${W - 2 * pad}" height="8" rx="2"/>` +
    `<rect class="g-now" x="${pad}" y="9" width="${(x(+d.now) - pad).toFixed(1)}" height="8" rx="2"/>` +
    `<line class="g-line" x1="${x(+d.line).toFixed(1)}" y1="2" x2="${x(+d.line).toFixed(1)}" y2="24"/>` +
    `<line class="g-pred" x1="${x(+d.predicted).toFixed(1)}" y1="4" x2="${x(+d.predicted).toFixed(1)}" y2="22"/>` +
    `<line class="g-fc" x1="${x(+d.forecast).toFixed(1)}" y1="4" x2="${x(+d.forecast).toFixed(1)}" y2="22"/></svg>` +
    `<ul class="g-key">` +
    `<li><span class="sw now" aria-hidden="true"></span><span>Tide now <b class="num">${(+d.now).toFixed(2)} m</b>, rising to the next high at <b class="num">${d.at}</b></span></li>` +
    `<li><span class="sw line" aria-hidden="true"></span><span>Flood line <b class="num">${(+d.line).toFixed(2)} m</b> — ${(+d.now) < (+d.line) ? `now <b class="num">${Math.round((+d.line - +d.now) * 100)} cm</b> below it, above it from <b class="num">${d.since}</b>` : `now <b class="num">${Math.round((+d.now - +d.line) * 100)} cm</b> above it`}</span></li>` +
    `<li><span class="sw pred" aria-hidden="true"></span><span>Predicted tide at that high <b class="num">${(+d.predicted).toFixed(2)} m</b> — <b class="num">${Math.round((+d.predicted - +d.line) * 100)} cm</b> over the line</span></li>` +
    `<li><span class="sw fc" aria-hidden="true"></span><span>Forecast peak with surge <b class="num">${(+d.forecast).toFixed(2)} m</b> — <b class="num">${Math.round((+d.forecast - +d.line) * 100)} cm</b> over: the surge is the difference</span></li>` +
    `</ul>`;
  return { lo, hi, x: { now: x(+d.now), line: x(+d.line), pred: x(+d.predicted), fc: x(+d.forecast) } };
}
window.__water = { curves: drawCurves(), gauge: drawGauge(), flood: FLOOD };
