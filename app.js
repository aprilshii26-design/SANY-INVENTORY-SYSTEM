
'use strict';

/**
 * SANY INVENTORY SYSTEM
 * FRONTEND APPLICATION
 * Version 1.0.1
 *
 * Firebase Authentication
 * Google Apps Script API
 * USER_ACCESS Authorization
 *
 * QC Upload belum diaktifkan melalui frontend.
 */

// ==========================================
// 1. APP CONFIGURATION
// ==========================================

const INVENTORY_API_URL =
  'https://script.google.com/macros/s/AKfycbyp8c-1v-sJkJxwa02nR5BpQdipayr82sotT9fha_7IkXX4nFRCt-xHI-gCP-nM0q8dpg/exec';

const views = [...document.querySelectorAll('.view')];

const loginButton =
  document.getElementById('google-login-btn');

const logoutButton =
  document.getElementById('logout-btn');

const accountLabel =
  document.getElementById('account-label');

const loginStatus =
  document.getElementById('login-status');

let inventoryUser = null;
let authValidationRunning = false;


// ==========================================
// 2. VIEW MANAGEMENT
// ==========================================

function openView(viewId) {
  if (!inventoryUser && viewId !== 'login-view') {
    showView('login-view');
    return;
  }

  showView(viewId);
}

function showView(viewId) {
  views.forEach(view => {
    view.hidden = view.id !== viewId;
  });

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

document.querySelectorAll('[data-open]').forEach(button => {
  button.addEventListener('click', () => {
    openView(button.dataset.open);
  });
});

function setLoginMessage(message, isError = false) {
  if (!loginStatus) return;

  loginStatus.textContent = message;

  loginStatus.classList.toggle(
    'error',
    Boolean(isError)
  );
}


// ==========================================
// 3. REQUEST ID GENERATOR
// ==========================================

function createRequestId() {
  const bytes = new Uint8Array(16);

  if (
    window.crypto &&
    typeof window.crypto.getRandomValues === 'function'
  ) {
    window.crypto.getRandomValues(bytes);

    return 'inv-' +
      Array.from(bytes)
        .map(value => value.toString(16).padStart(2, '0'))
        .join('');
  }

  return 'inv-' +
    Date.now() + '-' +
    Math.random().toString(36).slice(2) + '-' +
    Math.random().toString(36).slice(2);
}


// ==========================================
// 4. TRUSTED APPS SCRIPT ORIGIN
// ==========================================

function isTrustedAppsScriptOrigin(origin) {
  try {
    const parsed = new URL(origin);

    if (parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    return (
      hostname === 'script.google.com' ||
      hostname === 'googleusercontent.com' ||
      hostname.endsWith('.googleusercontent.com')
    );

  } catch (error) {
    return false;
  }
}


// ==========================================
// 5. APPS SCRIPT API TRANSPORT
//
// Hidden iframe + POST form + postMessage
//
// Catatan:
// Apps Script HTML Service dapat menggunakan
// nested sandbox iframe. Karena itu event.source
// tidak selalu sama dengan iframe luar.
//
// Respons diverifikasi menggunakan:
// - HTTPS Google Apps Script origin
// - Request ID unik
// ==========================================

function callInventoryApi(action, data = {}) {
  return new Promise((resolve, reject) => {

    const requestId = createRequestId();

    const frameName = 'inventory-api-' + requestId;

    const iframe = document.createElement('iframe');

    iframe.name = frameName;
    iframe.title = 'SANY Inventory API';
    iframe.style.display = 'none';

    const form = document.createElement('form');

    form.method = 'POST';
    form.action = INVENTORY_API_URL;
    form.target = frameName;
    form.enctype = 'application/x-www-form-urlencoded';
    form.style.display = 'none';

    const input = document.createElement('input');

    input.type = 'hidden';
    input.name = 'payload';

    input.value = JSON.stringify({
      ...data,
      action: action,
      requestId: requestId
    });

    form.appendChild(input);

    let timeoutId = null;
    let completed = false;

    function cleanup() {
      window.removeEventListener(
        'message',
        handleMessage
      );

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      form.remove();
      iframe.remove();
    }

    function finish(callback, value) {
      if (completed) return;

      completed = true;

      cleanup();

      callback(value);
    }

    function handleMessage(event) {

      let response = event.data;

      // Terima object atau JSON string.
      if (typeof response === 'string') {
        try {
          response = JSON.parse(response);
        } catch (error) {
          return;
        }
      }

      if (
        !response ||
        typeof response !== 'object'
      ) {
        return;
      }

      // Pastikan respons adalah milik request ini.
      if (response.requestId !== requestId) {
        return;
      }

      // Pastikan pesan berasal dari domain Google.
      if (!isTrustedAppsScriptOrigin(event.origin)) {
        console.warn(
          'Ignored API message from untrusted origin:',
          event.origin
        );

        return;
      }

      if (response.success === true) {
        finish(resolve, response);

      } else {
        finish(
          reject,
          new Error(
            response.message ||
            'Permintaan API gagal.'
          )
        );
      }
    }

    // Listener dipasang sebelum form dikirim.
    window.addEventListener(
      'message',
      handleMessage
    );

    document.body.append(iframe, form);

    // Timeout 60 detik.
    timeoutId = window.setTimeout(() => {

      finish(
        reject,
        new Error(
          'Waktu tunggu API habis. ' +
          'Periksa koneksi dan deployment Apps Script.'
        )
      );

    }, 60000);

    try {
      form.submit();

    } catch (error) {
      finish(reject, error);
    }
  });
}


// ==========================================
// 6. LOGIN BUTTON STATE
// ==========================================

function setLoginBusy(busy) {
  if (!loginButton) return;

  loginButton.disabled = Boolean(busy);

  loginButton.textContent = busy
    ? 'MEMERIKSA AKUN...'
    : 'G LOGIN DENGAN GOOGLE';
}


// ==========================================
// 7. FIREBASE AUTHORIZATION
// ==========================================

async function authorizeFirebaseUser(firebaseUser) {

  if (authValidationRunning) return;

  authValidationRunning = true;

  setLoginBusy(true);

  setLoginMessage(
    'Memverifikasi akun dan hak akses Inventory...'
  );

  try {

    const idToken = await firebaseUser.getIdToken(true);

    const response = await callInventoryApi(
      'AUTH_ME',
      {
        idToken: idToken
      }
    );

    if (!response.user) {
      throw new Error(
        'Data pengguna tidak diterima dari server.'
      );
    }

    inventoryUser = response.user;

    accountLabel.textContent =
      `${inventoryUser.email} | ${inventoryUser.role}`;

    logoutButton.hidden = false;

    setLoginMessage(
      'Akses Inventory berhasil diverifikasi.'
    );

    showView('dashboard-view');

  } catch (error) {

    inventoryUser = null;

    console.error(
      'Inventory authorization failed:',
      error
    );

    setLoginMessage(
      error.message || 'Akses Inventory ditolak.',
      true
    );

    try {
      await firebase.auth().signOut();

    } catch (signOutError) {
      console.error(
        'Firebase sign-out error:',
        signOutError
      );
    }

    accountLabel.textContent =
      'AKSES DITOLAK / BELUM LOGIN';

    logoutButton.hidden = true;

    showView('login-view');

  } finally {

    authValidationRunning = false;

    setLoginBusy(false);
  }
}


// ==========================================
// 8. GOOGLE SIGN-IN
// ==========================================

async function handleGoogleLogin() {

  if (
    typeof firebase === 'undefined' ||
    !firebase.auth
  ) {
    setLoginMessage(
      'Firebase SDK belum berhasil dimuat.',
      true
    );

    return;
  }

  setLoginBusy(true);

  setLoginMessage(
    'Membuka login Google...'
  );

  const auth = firebase.auth();

  const provider =
    new firebase.auth.GoogleAuthProvider();

  provider.setCustomParameters({
    prompt: 'select_account'
  });

  try {

    await auth.setPersistence(
      firebase.auth.Auth.Persistence.LOCAL
    );

    const isMobile =
      /Android|iPhone|iPad|iPod/i.test(
        navigator.userAgent
      );

    if (isMobile) {

      await auth.signInWithRedirect(provider);

    } else {

      await auth.signInWithPopup(provider);
    }

  } catch (error) {

    console.error(
      'Google sign-in error:',
      error
    );

    if (error.code === 'auth/popup-blocked') {

      setLoginMessage(
        'Popup diblokir. Mencoba metode redirect...'
      );

      try {

        await auth.signInWithRedirect(provider);

        return;

      } catch (redirectError) {

        console.error(
          'Redirect sign-in error:',
          redirectError
        );

        setLoginMessage(
          redirectError.message ||
          'Login Google gagal.',
          true
        );
      }

    } else {

      setLoginMessage(
        error.message || 'Login Google gagal.',
        true
      );
    }

  } finally {

    setLoginBusy(false);
  }
}

if (loginButton) {
  loginButton.addEventListener(
    'click',
    handleGoogleLogin
  );
}


// ==========================================
// 9. LOGOUT
// ==========================================

if (logoutButton) {

  logoutButton.addEventListener(
    'click',
    async () => {

      logoutButton.disabled = true;

      try {

        await firebase.auth().signOut();

        inventoryUser = null;

        accountLabel.textContent = 'BELUM LOGIN';

        logoutButton.hidden = true;

        showView('login-view');

        setLoginMessage(
          'Anda sudah logout.'
        );

      } catch (error) {

        alert(
          'Logout gagal: ' + error.message
        );

      } finally {

        logoutButton.disabled = false;
      }
    }
  );
}


// ==========================================
// 10. FIREBASE SESSION RESTORATION
// ==========================================

if (
  typeof firebase !== 'undefined' &&
  firebase.auth
) {

  firebase.auth()
    .getRedirectResult()
    .catch(error => {

      console.error(
        'Google redirect result error:',
        error
      );

      setLoginMessage(
        error.message || 'Login Google gagal.',
        true
      );
    });

  firebase.auth()
    .onAuthStateChanged(user => {

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

  setLoginMessage(
    'Firebase SDK tidak ditemukan. Periksa index.html.',
    true
  );

  showView('login-view');
}


// ==========================================
// 11. QC PHOTO STATE
// ==========================================

const photoState = {
  picking: [],
  part: []
};

const MAX_PICKING_PHOTOS = 10;


// ==========================================
// 12. PHOTO PREVIEW
// ==========================================

function renderPhotos(kind) {

  const files = photoState[kind];

  const count = document.getElementById(
    `${kind}-count`
  );

  const previews = document.getElementById(
    `${kind}-previews`
  );

  if (!count || !previews) return;

  count.textContent =
    kind === 'picking'
      ? `${files.length}/${MAX_PICKING_PHOTOS} foto dipilih`
      : `${files.length} foto dipilih`;

  previews.replaceChildren();

  files.forEach((file, index) => {

    const item = document.createElement('div');

    item.className = 'preview-item';

    const image = document.createElement('img');

    image.alt =
      file.name || `Foto ${index + 1}`;

    image.src = URL.createObjectURL(file);

    const removeButton =
      document.createElement('button');

    removeButton.type = 'button';

    removeButton.textContent = '×';

    removeButton.setAttribute(
      'aria-label',
      `Hapus ${file.name}`
    );

    removeButton.addEventListener(
      'click',
      () => {

        URL.revokeObjectURL(image.src);

        files.splice(index, 1);

        renderPhotos(kind);
      }
    );

    const name = document.createElement('small');

    name.textContent =
      file.name || `Foto ${index + 1}`;

    item.append(
      image,
      removeButton,
      name
    );

    previews.append(item);
  });
}


// ==========================================
// 13. ADD PHOTO
// ==========================================

function addPhotos(kind, fileList) {

  const incoming = [...fileList].filter(
    file => file.type.startsWith('image/')
  );

  if (kind === 'picking') {

    const remaining =
      MAX_PICKING_PHOTOS -
      photoState.picking.length;

    if (incoming.length > remaining) {

      alert(
        `Maksimal 10 foto Picking List. ` +
        `Slot tersisa: ${remaining}.`
      );
    }

    photoState.picking.push(
      ...incoming.slice(
        0,
        Math.max(0, remaining)
      )
    );

  } else {

    photoState.part.push(...incoming);
  }

  renderPhotos(kind);
}


// ==========================================
// 14. CAMERA BUTTON
// ==========================================

document.querySelectorAll('[data-camera]')
  .forEach(button => {

    button.addEventListener(
      'click',
      () => {

        const kind = button.dataset.camera;

        if (
          kind === 'picking' &&
          photoState.picking.length >=
            MAX_PICKING_PHOTOS
        ) {

          alert(
            'Photo Picking List sudah mencapai batas 10 foto.'
          );

          return;
        }

        const input = document.getElementById(
          `${kind}-camera`
        );

        input.click();
      }
    );
  });


// ==========================================
// 15. UPLOAD FILE BUTTON
// ==========================================

document.querySelectorAll('[data-upload]')
  .forEach(button => {

    button.addEventListener(
      'click',
      () => {

        const kind = button.dataset.upload;

        const input = document.getElementById(
          `${kind}-upload`
        );

        input.click();
      }
    );
  });


// ==========================================
// 16. PHOTO INPUT EVENTS
// ==========================================

['picking', 'part'].forEach(kind => {

  ['camera', 'upload'].forEach(source => {

    const input = document.getElementById(
      `${kind}-${source}`
    );

    if (!input) return;

    input.addEventListener(
      'change',
      event => {

        addPhotos(
          kind,
          event.target.files
        );

        event.target.value = '';
      }
    );
  });
});


// ==========================================
// 17. QC FORM VALIDATION
// ==========================================

const qcForm = document.getElementById('qc-form');

if (qcForm) {

  qcForm.addEventListener(
    'submit',
    event => {

      event.preventDefault();

      if (!inventoryUser) {

        alert(
          'Silakan login terlebih dahulu.'
        );

        showView('login-view');

        return;
      }

      const doNumber =
        document.getElementById('do-number')
          .value.trim();

      const pickingList =
        document.getElementById('picking-list')
          .value.trim();

      if (!doNumber || !pickingList) {

        alert(
          'DO Number dan Picking List wajib diisi.'
        );

        return;
      }

      if (
        photoState.picking.length === 0 ||
        photoState.part.length === 0
      ) {

        alert(
          'Foto Picking List dan Item / Part wajib ditambahkan.'
        );

        return;
      }

      alert(
        'Validasi form berhasil. ' +
        'Upload dan penyimpanan transaksi belum diaktifkan.'
      );
    }
  );
}


// ==========================================
// 18. PDA LASER SCANNER
// ==========================================

// Laser PDA diharapkan mengirim hasil scan
// ke kolom input yang sedang fokus.
//
// Syarat:
// Scanner dikonfigurasi sebagai HID / Keyboard Wedge.
//
// Tidak ada kamera barcode scanner pada Inventory.
// Kamera hanya untuk dokumentasi QC.

console.log(
  'SANY INVENTORY SYSTEM FRONTEND INITIALIZED'
);
