// Path check against the published site: for every page, resolve its local hrefs/srcs
// (relative, sub-path safe) and fetch them. A 404 here is a broken relative path.
const base = "https://makefunstuff.github.io/strata-test";
const pages = ["", "1-breakout/", "2-runner/", "3-marble-maze/", "4-tower-defense/", "5-flight/"];
const localRefs = (html) =>
  [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    .filter((u) => !/^(https?:|data:|#|mailto:)/.test(u));

let bad = 0, checked = 0;
for (const p of pages) {
  const url = `${base}/${p}`;
  const res = await fetch(url);
  if (!res.ok) { console.log(`FAIL ${res.status} ${url}`); bad++; continue; }
  const html = await res.text();
  for (const ref of localRefs(html)) {
    const target = new URL(ref, url);
    if (!target.pathname.startsWith("/strata-test/")) { console.log(`ABSOLUTE ${ref} in ${p}`); bad++; continue; }
    const r = await fetch(target);
    checked++;
    if (!r.ok) { console.log(`FAIL ${r.status} ${target}`); bad++; }
  }
}
console.log(`${checked} local refs fetched across ${pages.length} pages, ${bad} problems`);
