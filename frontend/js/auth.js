/* ============================================================
   auth.js
   Handles the login and register forms â€” real fetch() calls
   to the DumpTrade backend. Stores the JWT + user in
   localStorage so other pages (post.html, etc.) can use it.
============================================================ */

const AUTH_API_BASE = "/api";

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

function isAuthenticated() {
  return Boolean(localStorage.getItem("dumptrade_token"));
}

function logout() {
  localStorage.removeItem("dumptrade_token");
  localStorage.removeItem("dumptrade_user");
  window.location.href = "index.html";
}

function renderAuthNavigation() {
  const navAuth = document.querySelector(".nav-auth");
  if (!navAuth) return;

  navAuth.innerHTML = isAuthenticated()
    ? `<button class="btn btn-outline" type="button" onclick="logout()">Log out</button>`
    : `<a class="btn btn-outline" href="login.html">Log in</a>\n       <a class="btn btn-primary" href="register.html">Register</a>`;
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

      res = await fetch(`${AUTH_API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, account_type: selectedAccountType }),
      });
    } else {
      const email = document.getElementById("login-email").value;
      const password = document.getElementById("login-password").value;

      res = await fetch(`${AUTH_API_BASE}/login`, {
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

renderAuthNavigation();
