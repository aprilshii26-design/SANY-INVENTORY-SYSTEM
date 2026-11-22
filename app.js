'use strict';

// ==========================================
// APP CONFIGURATION
// ==========================================

const INVENTORY_API_URL =
  'https://script.google.com/macros/s/AKfycbyp8c-1v-sJkJxwa02nR5BpQdipayr82sotT9fha_7IkXX4nFRCt-xHI-gCP-nM0q8dpg/exec';

const views = [...document.querySelectorAll('.view')];
const loginButton = document.getElementById('google-login-btn');
const logoutButton = document.getElementById('logout-btn');
const accountLabel = document.getElementById('account-label');
const loginStatus = document.getElementById('login-status');

let inventoryUser = null;
let authValidationRunning = false;

// ==========================================
// VIEW MANAGEMENT
// ==========================================

function openView(viewId) {
  if (!inventoryUser && viewId !== 'login-view') {
    showView('login-view');
    return;
  }
  showView(viewId);
}

function showView(viewId) {
  views.forEach(view => { view.hidden = view.id !== viewId; });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('[data-open]').forEach(button => {
  button.addEventListener('click', () => openView(button.dataset.open));
});

function setLoginMessage(message, isError = false) {
  if (!loginStatus) return;
  loginStatus.textContent = message;
  loginStatus.classList.toggle('error', Boolean(isError));
}

// ==========================================
// APPS SCRIPT POST TRANSPORT
// Hidden iframe + form POST + postMessage
// ==========================================

function createRequestId() {
  return 'inv-' + Date.now() + '-' +
    Math.random().toString(36).slice(2, 12);
}

function callInventoryApi(action, data = {}) {
  return new Promise((resolve, reject) => {
    const requestId = createRequestId();
    const frameName = 'inventory-api-frame-' + requestId;
    const iframe = document.createElement('iframe');
    iframe.name = frameName;
    iframe.title = 'SANY Inventory API response';
    iframe.style.display = 'none';

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = INVENTORY_API_URL;
    form.target = frameName;
    form.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'payload';
    input.value = JSON.stringify({
      action,
      requestId,
      ...data
    });
    form.appendChild(input);

    let timeoutId;

    function cleanup() {
      window.removeEventListener('message', handleMessage);
      if (timeoutId) window.clearTimeout(timeoutId);
      form.remove();
      iframe.remove();
    }

    function handleMessage(event) {
      // Accept only a message sent by this request's iframe.
      if (event.source !== iframe.contentWindow) return;

      const response = event.data;
      if (!response || response.requestId !== requestId) return;

      cleanup();

      if (response.success) {
        resolve(response);
      } else {
        reject(new Error(response.message || 'Permintaan API gagal.'));
      }
    }

    window.addEventListener('message', handleMessage);
    document.body.append(iframe, form);

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error(
        'Waktu tunggu API habis. Periksa koneksi dan deployment Apps Script.'
      ));
    }, 45000);

    try {
      form.submit();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

// ==========================================
// FIREBASE LOGIN + INVENTORY AUTHORIZATION
// ==========================================

function setLoginBusy(busy) {
  if (!loginButton) return;
  loginButton.disabled = Boolean(busy);
  loginButton.textContent = busy
    ? 'MEMERIKSA AKUN...'
    : 'G LOGIN DENGAN GOOGLE';
}

async function authorizeFirebaseUser(firebaseUser) {
  if (authValidationRunning) return;
  authValidationRunning = true;
  setLoginBusy(true);
  setLoginMessage('Memverifikasi akun dan hak akses Inventory...');

  try {
    const idToken = await firebaseUser.getIdToken(true);
    const response = await callInventoryApi('AUTH_ME', { idToken });

    inventoryUser = response.user;

    accountLabel.textContent =
      `${inventoryUser.email} | ${inventoryUser.role}`;

    logoutButton.hidden = false;
    setLoginMessage('Akses berhasil diverifikasi.');
    showView('dashboard-view');

  } catch (error) {
    inventoryUser = null;
    console.error('Inventory authorization failed:', error);
    setLoginMessage(error.message || 'Akses Inventory ditolak.', true);

    try {
      await firebase.auth().signOut();
    } catch (signOutError) {
      console.error('Firebase sign-out error:', signOutError);
    }

    accountLabel.textContent = 'AKSES DITOLAK / BELUM LOGIN';
    logoutButton.hidden = true;
    showView('login-view');

  } finally {
    authValidationRunning = false;
    setLoginBusy(false);
  }
}

async function handleGoogleLogin() {
  if (!firebase || !firebase.auth) {
    setLoginMessage('Firebase SDK belum berhasil dimuat.', true);
    return;
  }

  setLoginBusy(true);
  setLoginMessage('Membuka login Google...');

  const auth = firebase.auth();
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

    const isMobile = /Android|iPhone|iPad|iPod/i.test(
      navigator.userAgent
    );

    if (isMobile) {
      await auth.signInWithRedirect(provider);
    } else {
      await auth.signInWithPopup(provider);
    }

  } catch (error) {
    console.error('Google sign-in error:', error);

    if (error.code === 'auth/popup-blocked') {
      setLoginMessage('Popup diblokir. Mencoba metode redirect...');
      try {
        await auth.signInWithRedirect(provider);
        return;
      } catch (redirectError) {
        console.error('Redirect sign-in error:', redirectError);
        setLoginMessage(
          redirectError.message || 'Login Google gagal.',
          true
        );
      }
    } else {
      setLoginMessage(error.message || 'Login Google gagal.', true);
    }

  } finally {
    // Redirect navigates away; popup returns to this page.
    setLoginBusy(false);
  }
}

if (loginButton) {
  loginButton.addEventListener('click', handleGoogleLogin);
}

if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    try {
      await firebase.auth().signOut();
      inventoryUser = null;
      accountLabel.textContent = 'BELUM LOGIN';
      showView('login-view');
      setLoginMessage('Anda sudah logout.');
    } catch (error) {
      alert('Logout gagal: ' + error.message);
    } finally {
      logoutButton.disabled = false;
    }
  });
}

// Show Firebase redirect errors if a redirect login was attempted.
if (typeof firebase !== 'undefined' && firebase.auth) {
  firebase.auth().getRedirectResult().catch(error => {
    console.error('Google redirect result error:', error);
    setLoginMessage(error.message || 'Login Google gagal.', true);
  });

  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      authorizeFirebaseUser(user);
    } else {
      inventoryUser = null;
      accountLabel.textContent = 'BELUM LOGIN';
      logoutButton.hidden = true;
      showView('login-view');
      setLoginBusy(false);
    }
  });
} else {
  setLoginMessage('Firebase SDK tidak ditemukan. Periksa index.html.', true);
  showView('login-view');
}

// ==========================================
// QC PHOTO SELECTION / PREVIEW
// Upload to backend is NOT enabled in this version.
// ==========================================

const photoState = { picking: [], part: [] };
const MAX_PICKING_PHOTOS = 10;

function renderPhotos(kind) {
  const files = photoState[kind];
  const count = document.getElementById(`${kind}-count`);
  const previews = document.getElementById(`${kind}-previews`);

  count.textContent = kind === 'picking'
    ? `${files.length}/${MAX_PICKING_PHOTOS} foto dipilih`
    : `${files.length} foto dipilih`;

  previews.replaceChildren();

  files.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'preview-item';

    const image = document.createElement('img');
    image.alt = file.name || `Foto ${index + 1}`;
    image.src = URL.createObjectURL(file);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = '×';
    removeButton.setAttribute('aria-label', `Hapus ${file.name}`);

    removeButton.addEventListener('click', () => {
      URL.revokeObjectURL(image.src);
      files.splice(index, 1);
      renderPhotos(kind);
    });

    const name = document.createElement('small');
    name.textContent = file.name || `Foto ${index + 1}`;

    item.append(image, removeButton, name);
    previews.append(item);
  });
}

function addPhotos(kind, fileList) {
  const incoming = [...fileList].filter(file =>
    file.type.startsWith('image/')
  );

  if (kind === 'picking') {
    const remaining = MAX_PICKING_PHOTOS - photoState.picking.length;

    if (incoming.length > remaining) {
      alert(
        `Maksimal 10 foto Picking List. Slot tersisa: ${remaining}.`
      );
    }

    photoState.picking.push(
      ...incoming.slice(0, Math.max(0, remaining))
    );
  } else {
    photoState.part.push(...incoming);
  }

  renderPhotos(kind);
}

document.querySelectorAll('[data-camera]').forEach(button => {
  button.addEventListener('click', () => {
    const kind = button.dataset.camera;

    if (
      kind === 'picking' &&
      photoState.picking.length >= MAX_PICKING_PHOTOS
    ) {
      alert('Photo Picking List sudah mencapai batas 10 foto.');
      return;
    }

    document.getElementById(`${kind}-camera`).click();
  });
});

document.querySelectorAll('[data-upload]').forEach(button => {
  button.addEventListener('click', () => {
    const kind = button.dataset.upload;
    document.getElementById(`${kind}-upload`).click();
  });
});

['picking', 'part'].forEach(kind => {
  ['camera', 'upload'].forEach(source => {
    const input = document.getElementById(`${kind}-${source}`);

    input.addEventListener('change', event => {
      addPhotos(kind, event.target.files);
      event.target.value = '';
    });
  });
});

document.getElementById('qc-form').addEventListener('submit', event => {
  event.preventDefault();

  if (!inventoryUser) {
    alert('Silakan login terlebih dahulu.');
    showView('login-view');
    return;
  }

  const doNumber = document.getElementById('do-number').value.trim();
  const pickingList = document.getElementById('picking-list').value.trim();

  if (!doNumber || !pickingList) {
    alert('DO Number dan Picking List wajib diisi.');
    return;
  }

  if (!photoState.picking.length || !photoState.part.length) {
    alert('Foto Picking List dan Item / Part wajib ditambahkan.');
    return;
  }

  alert(
    'Validasi form berhasil. Upload dan penyimpanan transaksi belum diaktifkan.'
  );
});

// Laser PDA should type into the focused field when configured
// as keyboard wedge/HID. No camera barcode scanner is included.
