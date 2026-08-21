/* ============================================================
   post.js
   Handles the post-an-item form: photo dropzone/preview via
   FileReader, category dropdown population, and submission
   into the mock api.js listings array.
============================================================ */

let postPhotoDataUrl = null;

document.getElementById("f-category").innerHTML = CATEGORIES.map(c => `<option value="${c.key}">${c.label}</option>`).join("");

function initDropzone() {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("photo-input");
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("dragover"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", e => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handlePhotoFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", e => {
    if (e.target.files && e.target.files[0]) handlePhotoFile(e.target.files[0]);
  });
}

function handlePhotoFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    postPhotoDataUrl = e.target.result;
    const dropzone = document.getElementById("dropzone");
    dropzone.outerHTML = `
      <div class="photo-preview-wrap" id="dropzone">
        <img src="${postPhotoDataUrl}" alt="Preview">
        <button type="button" class="photo-remove-btn" onclick="removePhoto()">${ICON.close}</button>
      </div>`;
  };
  reader.readAsDataURL(file);
}

function removePhoto() {
  postPhotoDataUrl = null;
  document.getElementById("dropzone").outerHTML = `
    <div id="dropzone" class="dropzone">
      ${ICON.upload}
      <div class="dropzone-text">Click to upload or drag & drop</div>
      <div class="dropzone-sub">PNG or JPG, shown as a preview only in this mockup</div>
    </div>`;
  initDropzone();
}

function submitPost() {
  const title = document.getElementById("f-title").value.trim();
  const location = document.getElementById("f-location").value.trim();
  const qtyLabel = document.getElementById("f-qtylabel").value.trim();
  if (!title || !location || !qtyLabel) {
    showToast("Please fill in title, quantity label, and location.");
    return;
  }

  // Host the photo if one was chosen; fall back to the local data URL
  // (offline / mock path) when the upload endpoint is unavailable.
  let photoUrl = postPhotoDataUrl;
  const fileInput = document.getElementById("photo-input");
  const file = fileInput && fileInput.files && fileInput.files[0];
  if (file && typeof uploadPhoto === "function") {
    const hosted = uploadPhoto(file);
    if (hosted) photoUrl = hosted;
  }

  const listing = apiAddListing({
    title,
    category: document.getElementById("f-category").value,
    qtyLabel,
    qtyNum: Number(document.getElementById("f-qtynum").value) || 1,
    condition: document.getElementById("f-condition").value.trim() || "Not specified",
    location,
    description: document.getElementById("f-description").value.trim() || "No extra details given.",
    photoUrl: photoUrl,
    needs_disposer: document.getElementById("needs-disposer-toggle")?.classList.contains("toggle-active") || false,
    disposer_note: document.getElementById("f-disposer-note")?.value.trim() || "",
  });

  if (!listing) return; // api.js already toasted (e.g. "Please log in first.")
  window.location.href = `listing.html?id=${listing.id}`;
}

initDropzone();
