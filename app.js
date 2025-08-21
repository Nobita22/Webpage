// Globals
const SALT = new TextEncoder().encode('static_salt_pi_vault');

let cryptoKey = null;

// IndexedDB Helper
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('piVaultDB', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('media')) {
        const mediaStore = db.createObjectStore('media', {keyPath: 'id', autoIncrement: true});
        mediaStore.createIndex('hidden', 'hidden', {unique: false});
      }
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
}

// Derive a fixed crypto key
async function deriveKey() {
  // Create a fixed key just once (no password)
  const rawKey = new TextEncoder().encode('fixed_static_key_for_demo');
  const baseKey = await crypto.subtle.importKey('raw', rawKey, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: SALT,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    {name: 'AES-GCM', length: 256},
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt Blob with AES-GCM
async function encryptBlob(blob, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const arrayBuffer = await blob.arrayBuffer();
  const encryptedBuffer = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv},
    key,
    arrayBuffer
  );
  const ivAndEncrypted = new Uint8Array(iv.byteLength + encryptedBuffer.byteLength);
  ivAndEncrypted.set(iv, 0);
  ivAndEncrypted.set(new Uint8Array(encryptedBuffer), iv.byteLength);
  return ivAndEncrypted.buffer;
}

// Decrypt Blob
async function decryptBuffer(buffer, key) {
  const data = new Uint8Array(buffer);
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new Blob([decryptedBuffer]);
}

// IndexedDB Media Storage
async function storeMedia(blob, hidden = true) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('media', 'readwrite');
    const store = tx.objectStore('media');
    const request = store.add({blob, hidden, timestamp: Date.now()});
    request.onsuccess = () => res(request.result);
    request.onerror = () => rej(request.error);
  });
}

async function getAllMedia() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('media', 'readonly');
    const store = tx.objectStore('media');
    const request = store.getAll();
    request.onsuccess = () => res(request.result);
    request.onerror = () => rej(request.error);
  });
}

async function updateMediaHiddenFlag(id, hidden) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('media', 'readwrite');
    const store = tx.objectStore('media');
    const req = store.get(id);
    req.onsuccess = () => {
      const item = req.result;
      item.hidden = hidden;
      const updateReq = store.put(item);
      updateReq.onsuccess = () => res();
      updateReq.onerror = () => rej(updateReq.error);
    };
    req.onerror = () => rej(req.error);
  });
}

// Download helper
async function downloadBlob(blob, filename) {
  if ('showSaveFilePicker' in window) {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: 'Media files',
          accept: {'image/*': ['.png', '.jpg', '.jpeg'], 'video/*': ['.mp4', '.webm'], 'audio/*': ['.mp3', '.wav']}
        }]
      });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (e) {
      alert("Save cancelled or error: " + e.message);
    }
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Persistent Storage Request
async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    const granted = await navigator.storage.persist();
    console.log("Persistent storage granted:", granted);
    return granted;
  }
  return false;
}

// UI Elements
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');
const themeToggle = document.getElementById('theme-toggle');
const picloudBtn = document.getElementById('picloud-btn');
const uploadBtn = document.getElementById('upload-btn');
const fileUpload = document.getElementById('file-upload');
const installBtn = document.getElementById('install-btn');
const mediaContainer = document.getElementById('media-container');

let keyPromise = null;

// Initialize App
async function init() {
  keyPromise = deriveKey();
  setupEventListeners();
  await loadAndRenderMedia();
  requestPersistentStorage();
}

function setupEventListeners() {
  menuToggle.onclick = () => sidebar.classList.toggle('hidden');

  themeToggle.onclick = () => {
    if(document.body.classList.contains('dark')){
      document.body.classList.replace('dark', 'light');
    } else {
      document.body.classList.replace('light', 'dark');
    }
  };

  picloudBtn.onclick = () => {
    window.location.href = 'https://your-picloud-url.example.com'; // update this URL
  };

  uploadBtn.onclick = () => fileUpload.click();

  fileUpload.onchange = async e => {
    const files = e.target.files;
    const key = await keyPromise;
    for (const file of files) {
      const encryptedBuffer = await encryptBlob(file, key);
      await storeMedia(new Blob([encryptedBuffer]), true);
    }
    await loadAndRenderMedia();
    fileUpload.value = '';
  };

  // PWA install prompt handling
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'block';
  });

  installBtn.onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if(choice.outcome === 'accepted'){
      installBtn.style.display = 'none';
    }
    deferredPrompt = null;
  };
}

async function loadAndRenderMedia() {
  const media = await getAllMedia();
  mediaContainer.innerHTML = '';
  const key = await keyPromise;
  for(const item of media) {
    const div = document.createElement('div');
    div.classList.add('media-item');
    if(item.hidden) div.classList.add('hidden-media');
    let decryptedBlob;
    try {
      decryptedBlob = await decryptBuffer(await item.blob.arrayBuffer(), key);
    } catch(e) {
      console.error("Decryption failed", e);
      continue;
    }

    let mediaEl;
    if(decryptedBlob.type.startsWith('image/')) {
      mediaEl = document.createElement('img');
    } else if(decryptedBlob.type.startsWith('video/')) {
      mediaEl = document.createElement('video');
      mediaEl.controls = true;
    } else if(decryptedBlob.type.startsWith('audio/')) {
      mediaEl = document.createElement('audio');
      mediaEl.controls = true;
    } else {
      mediaEl = document.createElement('span');
      mediaEl.textContent = 'Unsupported media';
    }

    mediaEl.src = URL.createObjectURL(decryptedBlob);
    div.appendChild(mediaEl);

    const btnContainer = document.createElement('div');

    // Hide/unhide button
    const hideUnhideBtn = document.createElement('button');
    if(item.hidden) {
      hideUnhideBtn.textContent = 'Unhide';
      hideUnhideBtn.onclick = async () => {
        await updateMediaHiddenFlag(item.id, false);
        await downloadBlob(decryptedBlob, `media-${item.id}`);
        await loadAndRenderMedia();
      };
    } else {
      hideUnhideBtn.textContent = 'Hide';
      hideUnhideBtn.onclick = async () => {
        await updateMediaHiddenFlag(item.id, true);
        await loadAndRenderMedia();
      };
    }
    btnContainer.appendChild(hideUnhideBtn);

    // Download button
    const downloadBtn = document.createElement('button');
    downloadBtn.textContent = 'Download';
    downloadBtn.onclick = () => downloadBlob(decryptedBlob, `media-${item.id}`);
    btnContainer.appendChild(downloadBtn);

    div.appendChild(btnContainer);
    mediaContainer.appendChild(div);
  }
}

init();
