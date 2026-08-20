/* ============================================================
   auth.js
   Handles the login and register forms. No backend yet — this
   just confirms the interaction and redirects home. Swap the
   body of handleAuthSubmit() for a real fetch() once auth exists.
============================================================ */

let selectedAccountType = "individual";

function selectAccountType(type) {
  selectedAccountType = type;
  document.getElementById("toggle-individual")?.classList.toggle("toggle-active", type === "individual");
  document.getElementById("toggle-organization")?.classList.toggle("toggle-active", type === "organization");
}

function handleAuthSubmit(event) {
  event.preventDefault();
  showToast("Mock only — no backend wired up yet.");
  setTimeout(() => { window.location.href = "index.html"; }, 900);
}
