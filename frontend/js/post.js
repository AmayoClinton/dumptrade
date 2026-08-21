/* Handles the authenticated post-an-item flow and image preview. */

let postPhotoFile = null;
let postPreviewUrl = null;

if (!isAuthenticated()) {
  window.location.replace("login.html");
}

document.getElementById("f-category").innerHTML = CATEGORIES.map(c => `<option value="${c.key}">${c.label}</option>`).join("");

function initDropzone() {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("photo-input");
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", event => { event.preventDefault(); dropzone.classList.add("dragover"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", event => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
    if (event.dataTransfer.files[0]) handlePhotoFile(event.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", event => {
    if (event.target.files[0]) handlePhotoFile(event.target.files[0]);
  });
}

function handlePhotoFile(file) {
  if (!file.type.startsWith("image/")) {
    showToast("Please choose a PNG, JPG, GIF, or WebP image.");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast("Photos must be 5 MB or smaller.");
    return;
  }

  if (postPreviewUrl) URL.revokeObjectURL(postPreviewUrl);
  postPhotoFile = file;
  postPreviewUrl = URL.createObjectURL(file);
  document.getElementById("dropzone").outerHTML = `
    <div class="photo-preview-wrap" id="dropzone">
      <img src="${postPreviewUrl}" alt="Selected photo preview">
      <button type="button" class="photo-remove-btn" onclick="removePhoto()">${ICON.close}</button>
    </div>`;
}

function removePhoto() {
  if (postPreviewUrl) URL.revokeObjectURL(postPreviewUrl);
  postPhotoFile = null;
  postPreviewUrl = null;
  document.getElementById("dropzone").outerHTML = `
    <div id="dropzone" class="dropzone">
      ${ICON.upload}
      <div class="dropzone-text">Click to upload or drag and drop</div>
      <div class="dropzone-sub">PNG, JPG, GIF, or WebP up to 5 MB</div>
    </div>`;
  initDropzone();
}

async function submitPost() {
  const title = document.getElementById("f-title").value.trim();
  const location = document.getElementById("f-location").value.trim();
  const qtyLabel = document.getElementById("f-qtylabel").value.trim();
  if (!title || !location || !qtyLabel) {
    showToast("Please fill in title, quantity label, and location.");
    return;
  }

  const submitButton = document.querySelector(".detail-actions .btn-primary");
  submitButton.disabled = true;
  submitButton.textContent = "Posting...";

  try {
    const photoUrl = await apiUploadPhoto(postPhotoFile);
    const listing = await apiCreateListing({
      title,
      category: document.getElementById("f-category").value,
      qtyLabel,
      qtyNum: Number(document.getElementById("f-qtynum").value) || 1,
      condition: document.getElementById("f-condition").value.trim() || "Not specified",
      location,
      description: document.getElementById("f-description").value.trim() || "No extra details given.",
      photoUrl,
    });
    window.location.href = `listing.html?id=${listing.id}`;
  } catch (error) {
    showToast(error.message);
    submitButton.disabled = false;
    submitButton.textContent = "Post listing";
  }
}

initDropzone();