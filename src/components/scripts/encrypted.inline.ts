// @ts-nocheck
// ============================================================================
// Encrypted Pages — Client-Side Decryption Script
// ============================================================================
// Runs in the browser. Decrypts AES-256-GCM encrypted content using the
// Web Crypto API with PBKDF2 key derivation. Caches successful passwords
// in sessionStorage for convenience across encrypted pages.
// ============================================================================

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** Decode a base64 string into a Uint8Array. */
function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Derive an AES-256-GCM key from a password and salt using PBKDF2. */
async function deriveKey(password, salt, iterations) {
  const enc = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

/**
 * Decrypt an AES-256-GCM encrypted payload.
 *
 * Input format: base64(salt[16] + iv[12] + authTag[16] + ciphertext)
 * Node.js crypto produces authTag separately, but Web Crypto expects
 * tag appended to ciphertext. We reassemble accordingly.
 */
async function decryptContent(encryptedBase64, password, iterations) {
  const data = base64ToBuffer(encryptedBase64);

  const salt = data.slice(0, SALT_LENGTH);
  const iv = data.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = data.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.slice(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  // Web Crypto expects ciphertext + authTag concatenated
  const ciphertextWithTag = new Uint8Array(ciphertext.length + authTag.length);
  ciphertextWithTag.set(ciphertext, 0);
  ciphertextWithTag.set(authTag, ciphertext.length);

  const aesKey = await deriveKey(password, salt, iterations);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ciphertextWithTag,
  );

  return new TextDecoder().decode(decrypted);
}

/** Get cached passwords from sessionStorage. */
function getCachedPasswords() {
  try {
    const raw = sessionStorage.getItem("encrypted-pages-passwords");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Add a password to the sessionStorage cache. */
function cachePassword(password) {
  const passwords = getCachedPasswords();
  if (!passwords.includes(password)) {
    passwords.push(password);
    sessionStorage.setItem("encrypted-pages-passwords", JSON.stringify(passwords));
  }
}

/** Show an error message on the password form. */
function showError(container, message) {
  const errorEl = container.querySelector(".encrypted-page-error");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = "block";
  }
}

/** Hide the error message. */
function hideError(container) {
  const errorEl = container.querySelector(".encrypted-page-error");
  if (errorEl) {
    errorEl.style.display = "none";
    errorEl.textContent = "";
  }
}

/** Set the form into a loading/disabled state. */
function setLoading(container, loading) {
  const button = container.querySelector(".encrypted-page-submit");
  const input = container.querySelector(".encrypted-page-input");
  if (button) {
    button.disabled = loading;
    button.textContent = loading ? "Decrypting\u2026" : "Unlock";
  }
  if (input) {
    input.disabled = loading;
  }
}

/**
 * Attempt to decrypt and reveal the page content.
 * On success, replaces the encrypted container with decrypted HTML and
 * dispatches a `render` event so other components re-initialize.
 */
async function attemptDecrypt(container, password) {
  const encryptedData = container.getAttribute("data-encrypted");
  const iterations = parseInt(container.getAttribute("data-iterations") || "600000", 10);

  if (!encryptedData) return false;

  try {
    const html = await decryptContent(encryptedData, password, iterations);

    // Replace the encrypted container with decrypted content.
    // The decrypted HTML is the full page body, so we replace the container's
    // parent (article) children or the container itself.
    const parent = container.parentElement;
    if (parent) {
      // Create a temporary wrapper to parse the HTML
      const temp = document.createElement("div");
      temp.innerHTML = html;

      // Replace the encrypted container with decrypted content
      container.replaceWith(...temp.childNodes);
    }

    // Cache the successful password
    cachePassword(password);

    // Dispatch render event so other plugins (graph, TOC, etc.) re-initialize
    document.dispatchEvent(new CustomEvent("render"));

    return true;
  } catch {
    return false;
  }
}

/** Initialize decryption UI for all encrypted containers on the page. */
function init() {
  const containers = document.querySelectorAll(".encrypted-page");
  if (containers.length === 0) return;

  for (const container of containers) {
    // Skip if already has a form (re-initialization after nav)
    if (container.querySelector(".encrypted-page-form")) continue;

    const encryptedData = container.getAttribute("data-encrypted");
    if (!encryptedData) continue;

    // Build the password prompt UI
    const form = document.createElement("div");
    form.className = "encrypted-page-form";
    form.innerHTML = [
      '<div class="encrypted-page-icon" aria-hidden="true">',
      '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">',
      '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>',
      '<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
      "</svg>",
      "</div>",
      '<p class="encrypted-page-label">This page is encrypted. Enter the password to view its content.</p>',
      '<div class="encrypted-page-input-row">',
      '<input type="password" class="encrypted-page-input" placeholder="Password" autocomplete="off" />',
      '<button type="button" class="encrypted-page-submit">Unlock</button>',
      "</div>",
      '<p class="encrypted-page-error" style="display:none"></p>',
    ].join("");

    container.appendChild(form);

    const input = form.querySelector(".encrypted-page-input");
    const button = form.querySelector(".encrypted-page-submit");

    async function handleSubmit() {
      const password = input?.value;
      if (!password) return;

      hideError(container);
      setLoading(container, true);

      const success = await attemptDecrypt(container, password);

      if (!success) {
        setLoading(container, false);
        showError(container, "Incorrect password. Please try again.");
        if (input) {
          input.value = "";
          input.focus();
        }
      }
    }

    if (button) {
      button.addEventListener("click", handleSubmit);
    }

    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleSubmit();
        }
      });
    }

    // Try cached passwords automatically
    const cached = getCachedPasswords();
    if (cached.length > 0) {
      (async () => {
        for (const pw of cached) {
          const success = await attemptDecrypt(container, pw);
          if (success) return;
        }
      })();
    }
  }
}

// Listen to Quartz navigation events
document.addEventListener("nav", () => {
  init();
});

// Re-initialize on render (e.g. if another plugin triggers re-render)
document.addEventListener("render", () => {
  // Only re-init if there are still encrypted containers
  const containers = document.querySelectorAll(".encrypted-page");
  if (containers.length > 0) {
    init();
  }
});
