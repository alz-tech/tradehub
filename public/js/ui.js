// ════════════════════════════════════════════════════
// TRADEHUB — Shared UI helpers
// ════════════════════════════════════════════════════
// Styled, in-app replacement for window.confirm(). Injects its markup
// once on first use (so no page has to add the HTML itself — same
// on-demand pattern as the toast), then resolves true/false exactly
// like confirm() does, so call sites just add `await` in front:
//
//   if (!confirm("Delete this?")) return;
//   →
//   if (!(await confirmDialog("Delete this?"))) return;

let overlay = null;
let resolveFn = null;

function ensureBuilt() {
  if (overlay) return;
  overlay = document.createElement("div");
  overlay.className = "hidden modal-overlay confirm-overlay";
  overlay.innerHTML = `
    <div class="modal-box">
      <h3 id="confirm-dialog-title"></h3>
      <p id="confirm-dialog-msg" class="confirm-dialog-msg"></p>
      <div class="modal-btns">
        <button type="button" class="modal-btn cancel" id="confirm-dialog-cancel"></button>
        <button type="button" class="modal-btn confirm" id="confirm-dialog-ok"></button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => { if (e.target === overlay) settle(false); });
  overlay.querySelector("#confirm-dialog-cancel").addEventListener("click", () => settle(false));
  overlay.querySelector("#confirm-dialog-ok").addEventListener("click", () => settle(true));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) settle(false);
  });
}

function settle(value) {
  overlay.classList.add("hidden");
  const r = resolveFn;
  resolveFn = null;
  if (r) r(value);
}

/**
 * Styled replacement for window.confirm(). Resolves true (confirmed)
 * or false (cancelled / dismissed).
 *
 * @param {string} message - Body text.
 * @param {object} [opts]
 * @param {string} [opts.title="Are you sure?"]
 * @param {string} [opts.confirmLabel="Confirm"]
 * @param {string} [opts.cancelLabel="Cancel"]
 * @param {boolean} [opts.danger=true] - Red confirm button for destructive actions vs blue for neutral ones.
 */
export function confirmDialog(message, opts = {}) {
  const {
    title = "Are you sure?",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = true
  } = opts;

  ensureBuilt();

  overlay.querySelector("#confirm-dialog-title").textContent = title;
  overlay.querySelector("#confirm-dialog-msg").textContent = message;
  overlay.querySelector("#confirm-dialog-cancel").textContent = cancelLabel;
  const okBtn = overlay.querySelector("#confirm-dialog-ok");
  okBtn.textContent = confirmLabel;
  okBtn.classList.toggle("confirm", danger);
  okBtn.classList.toggle("confirm-safe", !danger);

  overlay.classList.remove("hidden");

  return new Promise((resolve) => { resolveFn = resolve; });
}
