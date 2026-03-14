import crypto from 'crypto';
import { toHtml } from 'hast-util-to-html';
import { jsx } from 'preact/jsx-runtime';

// src/transformer.ts
var ALGORITHM = "aes-256-gcm";
var KEY_LENGTH = 32;
var IV_LENGTH = 12;
var SALT_LENGTH = 16;
var defaultOptions = {
  visibility: "icon",
  iterations: 6e5,
  passwordField: "password"
};
function encrypt(plaintext, password, iterations) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, "sha256");
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const result = Buffer.concat([salt, iv, authTag, encrypted]);
  return result.toString("base64");
}
var rehypeEncryptedPages = (options) => {
  return () => (tree, file) => {
    const frontmatter = file.data?.frontmatter ?? {};
    const password = frontmatter[options.passwordField];
    if (typeof password !== "string" || password.length === 0) {
      return;
    }
    const html = toHtml(tree, { allowDangerousHtml: true });
    const encryptedData = encrypt(html, password, options.iterations);
    const encryptedContainer = {
      type: "element",
      tagName: "div",
      properties: {
        className: ["encrypted-page", "popover-hint"],
        "data-encrypted": encryptedData,
        "data-iterations": String(options.iterations)
      },
      children: []
    };
    tree.children = [encryptedContainer];
    file.data.encrypted = true;
    file.data.encryptedVisibility = options.visibility;
    file.data.text = "";
    file.data.description = "";
  };
};
var EncryptedPages = (userOptions) => {
  const options = { ...defaultOptions, ...userOptions };
  return {
    name: "EncryptedPages",
    htmlPlugins() {
      return [rehypeEncryptedPages(options)];
    }
  };
};

// src/filter.ts
var defaultOptions2 = {
  visibility: "icon"
};
var EncryptedPageFilter = (userOptions) => {
  const options = { ...defaultOptions2, ...userOptions };
  return {
    name: "EncryptedPageFilter",
    shouldPublish(_ctx, [_tree, vfile]) {
      const data = vfile.data;
      const isEncrypted = data.encrypted === true;
      if (!isEncrypted) {
        return true;
      }
      if (options.visibility === "hidden") {
        return false;
      }
      return true;
    }
  };
};

// src/components/styles/encrypted.scss
var encrypted_default = ".encrypted-page {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  min-height: 300px;\n  padding: 2rem;\n}\n\n.encrypted-page-form {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 1rem;\n  max-width: 400px;\n  width: 100%;\n  text-align: center;\n}\n\n.encrypted-page-icon {\n  color: var(--gray, #6b7280);\n  opacity: 0.6;\n}\n\n.encrypted-page-label {\n  color: var(--darkgray, #4b5563);\n  font-size: 0.95rem;\n  margin: 0;\n  line-height: 1.5;\n}\n\n.encrypted-page-input-row {\n  display: flex;\n  gap: 0.5rem;\n  width: 100%;\n}\n\n.encrypted-page-input {\n  flex: 1;\n  padding: 0.5rem 0.75rem;\n  border: 1px solid var(--lightgray, #d1d5db);\n  border-radius: 4px;\n  font-size: 0.9rem;\n  font-family: inherit;\n  background: var(--light, #fff);\n  color: var(--dark, #111);\n  outline: none;\n  transition: border-color 0.15s ease;\n}\n.encrypted-page-input:focus {\n  border-color: var(--secondary, #3b82f6);\n}\n.encrypted-page-input:disabled {\n  opacity: 0.6;\n  cursor: not-allowed;\n}\n\n.encrypted-page-submit {\n  padding: 0.5rem 1.25rem;\n  border: none;\n  border-radius: 4px;\n  font-size: 0.9rem;\n  font-family: inherit;\n  font-weight: 600;\n  cursor: pointer;\n  background: var(--secondary, #3b82f6);\n  color: var(--light, #fff);\n  transition: background 0.15s ease, opacity 0.15s ease;\n  white-space: nowrap;\n}\n.encrypted-page-submit:hover:not(:disabled) {\n  opacity: 0.9;\n}\n.encrypted-page-submit:disabled {\n  opacity: 0.6;\n  cursor: not-allowed;\n}\n\n.encrypted-page-error {\n  color: var(--red, #dc2626);\n  font-size: 0.85rem;\n  margin: 0;\n}";

// src/components/scripts/encrypted.inline.ts
var encrypted_inline_default = `function g(t){let e=atob(t),n=new Uint8Array(e.length);for(let r=0;r<e.length;r++)n[r]=e.charCodeAt(r);return n}async function h(t,e,n){let r=new TextEncoder,s=await window.crypto.subtle.importKey("raw",r.encode(t),"PBKDF2",!1,["deriveKey"]);return window.crypto.subtle.deriveKey({name:"PBKDF2",salt:e,iterations:n,hash:"SHA-256"},s,{name:"AES-GCM",length:256},!1,["decrypt"])}async function w(t,e,n){let r=g(t),s=r.slice(0,16),a=r.slice(16,28),o=r.slice(28,44),i=r.slice(44),c=new Uint8Array(i.length+o.length);c.set(i,0),c.set(o,i.length);let d=await h(e,s,n),f=await window.crypto.subtle.decrypt({name:"AES-GCM",iv:a},d,c);return new TextDecoder().decode(f)}function y(){try{let t=sessionStorage.getItem("encrypted-pages-passwords");if(!t)return[];let e=JSON.parse(t);return Array.isArray(e)?e:[]}catch{return[]}}function T(t){let e=y();e.includes(t)||(e.push(t),sessionStorage.setItem("encrypted-pages-passwords",JSON.stringify(e)))}function m(t,e){let n=t.querySelector(".encrypted-page-error");n&&(n.textContent=e,n.style.display="block")}function E(t){let e=t.querySelector(".encrypted-page-error");e&&(e.style.display="none",e.textContent="")}function u(t,e){let n=t.querySelector(".encrypted-page-submit"),r=t.querySelector(".encrypted-page-input");n&&(n.disabled=e,n.textContent=e?"Decrypting\\u2026":"Unlock"),r&&(r.disabled=e)}async function l(t,e){let n=t.getAttribute("data-encrypted"),r=parseInt(t.getAttribute("data-iterations")||"600000",10);if(!n)return!1;try{let s=await w(n,e,r);if(t.parentElement){let o=document.createElement("div");o.innerHTML=s,t.replaceWith(...o.childNodes)}return T(e),document.dispatchEvent(new CustomEvent("render")),!0}catch{return!1}}function p(){let t=document.querySelectorAll(".encrypted-page");if(t.length!==0)for(let e of t){if(e.querySelector(".encrypted-page-form")||!e.getAttribute("data-encrypted"))continue;let r=document.createElement("div");r.className="encrypted-page-form",r.innerHTML=['<div class="encrypted-page-icon" aria-hidden="true">','<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">','<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>','<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',"</svg>","</div>",'<p class="encrypted-page-label">This page is encrypted. Enter the password to view its content.</p>','<div class="encrypted-page-input-row">','<input type="password" class="encrypted-page-input" placeholder="Password" autocomplete="off" />','<button type="button" class="encrypted-page-submit">Unlock</button>',"</div>",'<p class="encrypted-page-error" style="display:none"></p>'].join(""),e.appendChild(r);let s=r.querySelector(".encrypted-page-input"),a=r.querySelector(".encrypted-page-submit");async function o(){let c=s?.value;if(!c)return;E(e),u(e,!0),await l(e,c)||(u(e,!1),m(e,"Incorrect password. Please try again."),s&&(s.value="",s.focus()))}a&&a.addEventListener("click",o),s&&s.addEventListener("keydown",c=>{c.key==="Enter"&&(c.preventDefault(),o())});let i=y();i.length>0&&(async()=>{for(let c of i)if(await l(e,c))return})()}}document.addEventListener("nav",()=>{p()});document.addEventListener("render",()=>{document.querySelectorAll(".encrypted-page").length>0&&p()});var L=new MutationObserver(t=>{for(let e of t)for(let n of e.addedNodes){if(!(n instanceof HTMLElement))continue;if((n.classList?.contains("encrypted-page")?[n]:[...n.querySelectorAll(".encrypted-page")]).filter(a=>!a.querySelector(".encrypted-page-form")).length>0){p();return}}});L.observe(document.body,{childList:!0,subtree:!0});
`;
var EncryptedPage_default = ((opts) => {
  const { className = "encrypted-page-wrapper" } = opts ?? {};
  const Component = (_props) => {
    return /* @__PURE__ */ jsx("div", { class: className });
  };
  Component.css = encrypted_default;
  Component.afterDOMLoaded = encrypted_inline_default;
  return Component;
});

export { EncryptedPage_default as EncryptedPage, EncryptedPageFilter, EncryptedPages };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map