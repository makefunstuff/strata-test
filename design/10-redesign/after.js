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
