// The cabinet around the tube: a canvas-drawn plastic bezel with a rounded screen aperture
// that matches the CRT shader's tube, so the inflated screen sits inside a real frame —
// bevel, screws, vents, label plate and a bit of grime. No image files: it is drawn at
// runtime and redrawn on resize.
const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

// rounded-rect path with per-axis radii (the tube corners are elliptical, like a real aperture)
function tubePath(ctx, x, y, w, h, rx, ry) {
  ctx.beginPath();
  ctx.moveTo(x + rx, y);
  ctx.lineTo(x + w - rx, y);
  ctx.ellipse(x + w - rx, y + ry, rx, ry, 0, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - ry);
  ctx.ellipse(x + w - rx, y + h - ry, rx, ry, 0, 0, Math.PI / 2);
  ctx.lineTo(x + rx, y + h);
  ctx.ellipse(x + rx, y + h - ry, rx, ry, 0, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + ry);
  ctx.ellipse(x + rx, y + ry, rx, ry, 0, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

function screw(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, "#9aa6b4");
  g.addColorStop(0.6, "#5d6773");
  g.addColorStop(1, "#2a2f36");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(10,12,16,0.9)";
  ctx.lineWidth = Math.max(1, r * 0.32);
  ctx.beginPath();
  ctx.moveTo(x - r * 0.6, y - r * 0.25);
  ctx.lineTo(x + r * 0.6, y + r * 0.25);
  ctx.stroke();
}

function plate(ctx, x, y, w, h, label, accent) {
  ctx.save();
  tubePath(ctx, x, y, w, h, h * 0.35, h * 0.35);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "#2b333d");
  g.addColorStop(1, "#151a21");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.clip();
  ctx.font = `${Math.floor(h * 0.46)}px "Press Start 2P", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = accent;
  ctx.shadowBlur = 14;
  ctx.fillStyle = "#eaf6ff";
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.restore();
}

function grime(ctx, w, h) {
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const r = Math.min(w, h) * (0.02 + Math.random() * 0.07);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.012 + Math.random() * 0.02})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function createBezel({ label = "ARCADE", accent = "#7fe3ff", parent = document.body,
                               rect = { x: 0.03, y: 0.05, w: 0.94, h: 0.90, rx: 0.07, ry: 0.07 } } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "crt-bezel";
  canvas.setAttribute("aria-hidden", "true");
  parent.appendChild(canvas);

  let w = 0, h = 0, queued = 0;

  function draw() {
    if (!w || !h) return;
    const s = dpr();
    canvas.width = Math.round(w * s);
    canvas.height = Math.round(h * s);
    const ctx = canvas.getContext("2d");
    ctx.scale(s, s);

    // plastic shell
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, "#252b34");
    base.addColorStop(0.5, "#171c24");
    base.addColorStop(1, "#0e1218");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    // brushed sheen + speckle
    for (let i = 0; i < 900; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.006 + Math.random() * 0.018})`;
      ctx.lineWidth = 1;
      const x = Math.random() * w;
      ctx.beginPath();
      ctx.moveTo(x, Math.random() * h);
      ctx.lineTo(x + (Math.random() - 0.5) * 8, Math.random() * h);
      ctx.stroke();
    }
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.16)";
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }
    grime(ctx, w, h);

    // vents and screws live in the frame bands
    const unit = Math.min(w, h);
    const band = h * rect.y;                       // the top/bottom frame bands
    const ventY = h - band * 0.62;
    ctx.fillStyle = "rgba(6,8,11,0.85)";
    for (let i = 0; i < 9; i++) {
      const x = w - w * rect.x - unit * 0.24 + i * unit * 0.022;
      tubePath(ctx, x, ventY, unit * 0.011, band * 0.5, unit * 0.005, band * 0.14);
      ctx.fill();
    }
    const m = band * 0.35;
    screw(ctx, w * rect.x * 0.5, m, band * 0.13);
    screw(ctx, w - w * rect.x * 0.5, m, band * 0.13);
    screw(ctx, w * rect.x * 0.5, h - m, band * 0.13);
    screw(ctx, w - w * rect.x * 0.5, h - m, band * 0.13);

    // punch the screen aperture (geometry shared with the CRT shader via tubeRect())
    const hx = w * rect.x, hy = h * rect.y, hw = w * rect.w, hh = h * rect.h;
    const rx = w * rect.rx, ry = h * rect.ry;
    ctx.globalCompositeOperation = "destination-out";
    tubePath(ctx, hx, hy, hw, hh, rx, ry);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    // bevel around the aperture, drawn only on the frame (clip out the hole)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    tubePath(ctx, hx, hy, hw, hh, rx, ry);
    ctx.clip("evenodd");
    tubePath(ctx, hx, hy, hw, hh, rx, ry);
    ctx.strokeStyle = "rgba(0,0,0,0.92)";
    ctx.lineWidth = unit * 0.03;
    ctx.stroke();
    tubePath(ctx, hx - unit * 0.008, hy - unit * 0.008, hw + unit * 0.016, hh + unit * 0.016, rx, ry);
    ctx.strokeStyle = "rgba(190,208,230,0.22)";
    ctx.lineWidth = unit * 0.006;
    ctx.stroke();
    tubePath(ctx, hx - unit * 0.022, hy - unit * 0.022, hw + unit * 0.044, hh + unit * 0.044, rx, ry);
    ctx.strokeStyle = "rgba(90,170,255,0.10)";
    ctx.lineWidth = unit * 0.03;
    ctx.stroke();
    ctx.restore();

    // marquee plate, drawn after the punch so the aperture cannot cut it
    const pw = Math.min(w * 0.44, unit * 0.72), ph = band * 0.62;
    plate(ctx, (w - pw) / 2, band * 0.19, pw, ph, label, accent);
  }

  function resize(nw, nh) {
    w = nw;
    h = nh;
    if (queued) cancelAnimationFrame(queued);
    queued = requestAnimationFrame(draw);
  }

  // the label is set before the webfont loads, so redraw once it is available
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw()).catch(() => {});

  return {
    el: canvas,
    resize,
    setLabel(t) { label = t; draw(); },
    setEnabled(on) { canvas.style.display = on ? "" : "none"; },
    destroy() { if (queued) cancelAnimationFrame(queued); canvas.remove(); },
  };
}
