/* ============================================================
   auth.js
   Handles the login and register forms — real fetch() calls
   to the Dump Trade backend. Stores the JWT + user in
   localStorage so other pages (post.html, etc.) can use it.
============================================================ */

const API_BASE = "/api";

let selectedAccountType = "individual";

function selectAccountType(type) {
  selectedAccountType = type;
  document.getElementById("toggle-individual")?.classList.toggle("toggle-active", type === "individual");
  document.getElementById("toggle-organization")?.classList.toggle("toggle-active", type === "organization");
}

function saveSession(token, user) {
  localStorage.setItem("dumptrade_token", token);
  localStorage.setItem("dumptrade_user", JSON.stringify(user));
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  const isRegister = document.getElementById("reg-email") !== null;

  try {
    let res, data;

    if (isRegister) {
      const name = document.getElementById("reg-name").value;
      const email = document.getElementById("reg-email").value;
      const password = document.getElementById("reg-password").value;

      res = await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, account_type: selectedAccountType }),
      });
    } else {
      const email = document.getElementById("login-email").value;
      const password = document.getElementById("login-password").value;

      res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    }

    data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Something went wrong. Please try again.");
      return;
    }

    saveSession(data.token, data.user);
    showToast(isRegister ? "Account created!" : "Welcome back!");
    setTimeout(() => { window.location.href = "index.html"; }, 900);
  } catch (err) {
    showToast("Could not reach the server. Is it running?");
  }
}
