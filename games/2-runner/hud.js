// HTML overlay: score / speed / best / lane / state, plus the game-over panel.
export function createHud(root) {
  const nodes = {};
  for (const n of root.querySelectorAll("[data-k]")) nodes[n.dataset.k] = n;

  return {
    set(key, value) {
      const n = nodes[key];
      if (n && n.textContent !== value) n.textContent = value;
    },
    showScreen(title, msg) {
      if (nodes.title) nodes.title.textContent = title;
      if (nodes.msg) nodes.msg.textContent = msg;
      const screen = nodes.title ? nodes.title.closest("#screen") : null;
      if (screen) screen.hidden = false;
    },
    hideScreen() {
      const screen = nodes.title ? nodes.title.closest("#screen") : null;
      if (screen) screen.hidden = true;
    },
  };
}
