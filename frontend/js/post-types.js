/* ============================================================
   post-types.js
   Phase 4: switches the post form between material / activity /
   story panes, tracks the "needs a disposer" toggle, handles
   photo previews, uploads photos via POST /api/uploads, and
   submits through the api.js layer (backend, mock fallback).
   Uses prefixed IDs so it never clashes with post.js.
   ============================================================ */

const HEAD_TEXT = {
  material: "What are you giving away?",
  activity: "What are you organising?",
  story: "What did you clear?",
};

let materialNeedsDisposer = false;
let activityNeedsDisposer = false;
let activityPhotoDataUrl = null;

const postTypeToggle = document.getElementById("post-type-toggle");
const sectionHead = document.querySelector(".section-head h2");

postTypeToggle.addEventListener("click", e => {
  const btn = e.target.closest(".toggle-btn");
  if (!btn) return;
  const type = btn.dataset.type;
  document.querySelectorAll("#post-type-toggle .toggle-btn").forEach(b => b.classList.toggle("toggle-active", b === btn));

  document.getElementById("pane-material").hidden = type !== "material";
  document.getElementById("pane-activity").hidden = type !== "activity";
  document.getElementById("pane-story").hidden = type !== "story";

  if (sectionHead) sectionHead.textContent = HEAD_TEXT[type];
});

/* ---------- Needs-disposer toggles ---------- */
function wireDisposerToggle(btnId, setVar) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener("click", () => {
    const on = btn.textContent.trim() === "Off";
    btn.textContent = on ? "On" : "Off";
    btn.classList.toggle("toggle-active", on);
    setVar(on);
  });
}
wireDisposerToggle("needs-disposer-toggle", v => materialNeedsDisposer = v);
wireDisposerToggle("activity-needs-disposer-toggle", v => activityNeedsDisposer = v);

/* ---------- Activity photo dropzone (mirrors post.js) ---------- */
function initActivityDropzone() {
  const dropzone = document.getElementById("activity-dropzone");
  const fileInput = document.getElementById("activity-photo-input");
  if (!dropzone || !fileInput) return;
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("dragover"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", e => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleActivityPhoto(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", e => {
    if (e.target.files && e.target.files[0]) handleActivityPhoto(e.target.files[0]);
  });
}
function handleActivityPhoto(file) {
  const reader = new FileReader();
  reader.onload = e => {
    activityPhotoDataUrl = e.target.result;
    const dropzone = document.getElementById("activity-dropzone");
    dropzone.outerHTML = `
      <div class="photo-preview-wrap" id="activity-dropzone">
        <img src="${activityPhotoDataUrl}" alt="Preview">
        <button type="button" class="photo-remove-btn" onclick="removeActivityPhoto()">${ICON.close}</button>
      </div>`;
  };
  reader.readAsDataURL(file);
}
function removeActivityPhoto() {
  activityPhotoDataUrl = null;
  document.getElementById("activity-dropzone").outerHTML = `
    <div id="activity-dropzone" class="dropzone">
      ${ICON.upload}
      <div class="dropzone-text">Click to upload or drag & drop</div>
      <div class="dropzone-sub">PNG or JPG, shown as a preview only in this mockup</div>
    </div>`;
  initActivityDropzone();
}

/* ---------- Story photo previews ---------- */
function wireStoryPhoto(inputId, previewId) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!input || !preview) return;
  input.addEventListener("change", e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      preview.src = ev.target.result;
      document.getElementById("story-split").style.display = "grid";
    };
    reader.readAsDataURL(file);
  });
}
wireStoryPhoto("story-before-input", "story-before-preview");
wireStoryPhoto("story-after-input", "story-after-preview");

/* ---------- Submits ---------- */
/* Photos are hosted by POST /api/uploads (see uploadPhoto in api.js).
   If the upload fails (backend down) we keep the local data URL so the
   mock/offline path still shows a preview. */
async function resolvePhotoUrl(inputId, fallbackDataUrl) {
  const input = document.getElementById(inputId);
  const file = input && input.files && input.files[0];
  if (file && typeof uploadPhoto === "function") {
    const url = await uploadPhoto(file);
    if (url) return url;
  }
  return fallbackDataUrl || "";
}

async function submitActivity() {
  const title = document.getElementById("activity-title").value.trim();
  const location = document.getElementById("activity-location").value.trim();
  if (!title || !location) {
    showToast("Please fill in title and location.");
    return;
  }
  const activity = await apiCreateActivity({
    title,
    location,
    photo_url: await resolvePhotoUrl("activity-photo-input", activityPhotoDataUrl),
    description: document.getElementById("activity-description").value.trim() || "No extra details given.",
    event_date: document.getElementById("activity-date").value || "",
    target_volume_label: document.getElementById("activity-target-label").value.trim(),
    target_kg: Number(document.getElementById("activity-target-kg").value) || 0,
    volunteers_needed: Number(document.getElementById("activity-volunteers").value) || 0,
    needs_disposer: activityNeedsDisposer,
    disposer_note: document.getElementById("activity-disposer-note")?.value.trim() || "",
  });
  if (!activity) return; // api.js already toasted (e.g. "Please log in first.")
  showToast("Activity posted!");
  window.location.href = "browse.html";
}

async function submitStory() {
  const title = document.getElementById("story-title").value.trim();
  const location = document.getElementById("story-location").value.trim();
  if (!title || !location) {
    showToast("Please fill in title and location.");
    return;
  }
  const beforeImg = document.getElementById("story-before-preview").src;
  const afterImg = document.getElementById("story-after-preview").src;
  const story = await apiCreateStory({
    title,
    location,
    caption: document.getElementById("story-caption").value.trim() || "",
    kg_removed: Number(document.getElementById("story-kg").value) || 0,
    disposer_name: document.getElementById("story-disposer").value.trim(),
    before_photo_url: await resolvePhotoUrl("story-before-input", beforeImg && beforeImg.startsWith("data:") ? beforeImg : ""),
    after_photo_url: await resolvePhotoUrl("story-after-input", afterImg && afterImg.startsWith("data:") ? afterImg : ""),
  });
  if (!story) return; // api.js already toasted
  showToast("Story posted!");
  window.location.href = "browse.html";
}

initActivityDropzone();
