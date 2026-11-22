
'use strict';

/**
 * SANY INVENTORY SYSTEM
 * FRONTEND APPLICATION
 * Version 1.1.0
 *
 * Firebase Authentication
 * Google Apps Script API
 * USER_ACCESS Authorization
 * QC Transaction + Photo Upload Integration
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


const INVENTORY_API_TIMEOUT_MS = 180000;

function callInventoryApi(action, data = {}) {
  return new Promise((resolve, reject) => {
    (async function() {
      let iframe;
      let form;
      let timeoutId;
      let completed = false;
      // Harus berada pada scope yang sama dengan handleMessage().
      let requestId = null;

      function cleanup() {
        window.removeEventListener('message', handleMessage);

        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }

        if (form) form.remove();
        if (iframe) iframe.remove();
      }

      function finish(callback, value) {
        if (completed) return;
        completed = true;
        cleanup();
        callback(value);
      }

      function handleMessage(event) {
        if (!isTrustedAppsScriptOrigin(event.origin)) return;

        let response = event.data;

        if (typeof response === 'string') {
          try {
            response = JSON.parse(response);
          } catch (error) {
            return;
          }
        }

        if (!response || typeof response !== 'object') return;
        if (!requestId || response.requestId !== requestId) return;

        if (response.success === true) {
          finish(resolve, response);
        } else {
          finish(
            reject,
            new Error(response.message || 'Permintaan API gagal.')
          );
        }
      }

      try {
        if (
          typeof firebase === 'undefined' ||
          !firebase.auth ||
          !firebase.auth().currentUser
        ) {
          throw new Error('Silakan login kembali.');
        }

        // Token selalu berasal dari sesi Firebase yang sedang aktif.
        const idToken = data.idToken ||
          await firebase.auth().currentUser.getIdToken();

        if (!idToken) {
          throw new Error('Firebase ID Token tidak tersedia.');
        }

        requestId = createRequestId();
        const frameName = 'inventory-api-' + requestId;

        iframe = document.createElement('iframe');
        iframe.name = frameName;
        iframe.title = 'SANY Inventory API';
        iframe.style.display = 'none';

        form = document.createElement('form');
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
          idToken: idToken,
          action: action,
          requestId: requestId
        });

        form.appendChild(input);
        window.addEventListener('message', handleMessage);
        document.body.append(iframe, form);

        timeoutId = window.setTimeout(() => {
          finish(
            reject,
            new Error(
              'Waktu tunggu API habis. Periksa koneksi dan status Apps Script sebelum mengulang transaksi.'
            )
          );
        }, INVENTORY_API_TIMEOUT_MS);

        form.submit();

      } catch (error) {
        finish(reject, error);
      }
    })();
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
  setLoginMessage('Membuka login Google...');

  const auth = firebase.auth();
  const provider = new firebase.auth.GoogleAuthProvider();

  provider.setCustomParameters({
    prompt: 'select_account'
  });

  try {
    await auth.setPersistence(
      firebase.auth.Auth.Persistence.LOCAL
    );

    // Gunakan Popup untuk laptop dan HP.
    await auth.signInWithPopup(provider);

  } catch (error) {
    console.error('Google sign-in error:', error);

    let message = error.message || 'Login Google gagal.';

    if (
      error.code === 'auth/popup-blocked' ||
      error.code === 'auth/popup-closed-by-user'
    ) {
      message =
        'Jendela login Google tertutup atau diblokir. ' +
        'Izinkan popup untuk website Inventory lalu coba lagi.';
    }

    setLoginMessage(message, true);

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
// 11. QC PHOTO STATE + UPLOAD CONFIGURATION
// ==========================================

const photoState = {
  picking: [],
  part: []
};

const MAX_PICKING_PHOTOS = 10;
const SUPPORTED_PHOTO_MIME = /^image\/(jpeg|png|webp|heic|heif)$/i;
const PHOTO_UPLOAD_TYPE = {
  picking: 'PICKING_LIST',
  part: 'PART'
};

// Photo ID stabil selama sesi halaman ini. Jika request timeout,
// retry akan menggunakan Photo ID yang sama (idempotent di backend).
const photoIds = new WeakMap();
const previewUrls = new WeakMap();
const uploadedPhotoIds = new Set();

let pendingQCTransaction = null;
let qcSubmitting = false;
let qcCreationUncertain = false;

function getPhotoId(file) {
  if (!photoIds.has(file)) {
    photoIds.set(
      file,
      'photo-' + createRequestId().replace(/[^A-Za-z0-9_-]/g, '')
    );
  }

  return photoIds.get(file);
}

function getPreviewUrl(file) {
  if (!previewUrls.has(file)) {
    previewUrls.set(file, URL.createObjectURL(file));
  }

  return previewUrls.get(file);
}

function releasePreviewUrl(file) {
  const url = previewUrls.get(file);
  if (url) URL.revokeObjectURL(url);
  previewUrls.delete(file);
}


// ==========================================
// 12. QC UPLOAD STATUS UI
// ==========================================

const qcForm = document.getElementById('qc-form');
let qcProgressElement = null;
let qcSubmitButton = null;
let qcControlState = [];
let qcSubmitOriginalLabel = '';

function ensureQCProgressElement() {
  if (!qcForm) return null;
  if (qcProgressElement && qcProgressElement.isConnected) {
    return qcProgressElement;
  }

  qcProgressElement = document.createElement('div');
  qcProgressElement.id = 'qc-upload-progress';
  qcProgressElement.setAttribute('role', 'status');
  qcProgressElement.setAttribute('aria-live', 'polite');
  qcProgressElement.style.cssText = [
    'display:none',
    'margin:16px 0',
    'padding:14px',
    'border:1px solid #d7dce2',
    'border-radius:10px',
    'background:#f7f8fa',
    'color:#222',
    'font-size:14px',
    'line-height:1.5',
    'white-space:pre-wrap'
  ].join(';');

  qcSubmitButton = qcForm.querySelector(
    'button[type="submit"], input[type="submit"]'
  );

  if (qcSubmitButton && qcSubmitButton.parentNode) {
    qcSubmitButton.parentNode.insertBefore(
      qcProgressElement,
      qcSubmitButton
    );
  } else {
    qcForm.appendChild(qcProgressElement);
  }

  return qcProgressElement;
}

function setQCProgress(message, state = 'info') {
  const element = ensureQCProgressElement();
  if (!element) return;

  element.style.display = 'block';
  element.textContent = message;
  element.style.borderColor =
    state === 'error' ? '#d93025' :
    state === 'success' ? '#188038' : '#d7dce2';
  element.style.background =
    state === 'error' ? '#fce8e6' :
    state === 'success' ? '#e6f4ea' : '#f7f8fa';
}

function setQCFormBusy(busy, label = '') {
  if (!qcForm) return;

  if (busy) {
    qcControlState = [...qcForm.querySelectorAll('input, button, select, textarea')]
      .map(control => ({ control, disabled: control.disabled }));

    qcControlState.forEach(item => {
      item.control.disabled = true;
    });

    if (qcSubmitButton) {
      if (qcSubmitButton.tagName === 'INPUT') {
        qcSubmitOriginalLabel = qcSubmitButton.value;
        qcSubmitButton.value = label || 'MENGUNGGAH...';
      } else {
        qcSubmitOriginalLabel = qcSubmitButton.textContent;
        qcSubmitButton.textContent = label || 'MENGUNGGAH...';
      }
    }

  } else {
    qcControlState.forEach(item => {
      item.control.disabled = item.disabled;
    });
    qcControlState = [];

    if (qcSubmitButton && qcSubmitOriginalLabel) {
      if (qcSubmitButton.tagName === 'INPUT') {
        qcSubmitButton.value = qcSubmitOriginalLabel;
      } else {
        qcSubmitButton.textContent = qcSubmitOriginalLabel;
      }
    }
    qcSubmitOriginalLabel = '';
  }
}


// ==========================================
// 13. PHOTO PREVIEW
// ==========================================

function renderPhotos(kind) {
  const files = photoState[kind];
  const count = document.getElementById(`${kind}-count`);
  const previews = document.getElementById(`${kind}-previews`);

  if (!count || !previews) return;

  const uploadedCount = files.filter(file =>
    uploadedPhotoIds.has(getPhotoId(file))
  ).length;

  count.textContent = kind === 'picking'
    ? `${files.length}/${MAX_PICKING_PHOTOS} foto dipilih · ${uploadedCount} berhasil`
    : `${files.length} foto dipilih · ${uploadedCount} berhasil`;

  previews.replaceChildren();

  files.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'preview-item';

    const image = document.createElement('img');
    image.alt = file.name || `Foto ${index + 1}`;
    image.src = getPreviewUrl(file);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = '×';
    removeButton.setAttribute(
      'aria-label',
      `Hapus ${file.name || `foto ${index + 1}`}`
    );

    const isUploaded = uploadedPhotoIds.has(getPhotoId(file));
    removeButton.disabled = isUploaded || qcSubmitting;
    removeButton.title = isUploaded
      ? 'Foto sudah tersimpan dan tidak dapat dihapus dari transaksi.'
      : 'Hapus foto';

    removeButton.addEventListener('click', () => {
      if (uploadedPhotoIds.has(getPhotoId(file)) || qcSubmitting) return;
      releasePreviewUrl(file);
      files.splice(index, 1);
      renderPhotos(kind);
    });

    const name = document.createElement('small');
    name.textContent = isUploaded
      ? `${file.name} · TERUPLOAD`
      : (file.name || `Foto ${index + 1}`);

    item.append(image, removeButton, name);
    previews.append(item);
  });
}


// ==========================================
// 14. ADD PHOTO
// ==========================================

function addPhotos(kind, fileList) {
  const selected = [...fileList];
  const incoming = selected.filter(file =>
    SUPPORTED_PHOTO_MIME.test(file.type || '')
  );
  const unsupportedCount = selected.length - incoming.length;

  if (unsupportedCount > 0) {
    alert(
      `${unsupportedCount} file tidak ditambahkan. Format yang didukung: JPEG, PNG, WEBP, HEIC, dan HEIF.`
    );
  }

  if (kind === 'picking') {
    const remaining = MAX_PICKING_PHOTOS - photoState.picking.length;

    if (incoming.length > remaining) {
      alert(
        `Maksimal 10 foto Picking List. Slot tersisa: ${Math.max(0, remaining)}.`
      );
    }

    photoState.picking.push(
      ...incoming.slice(0, Math.max(0, remaining))
    );
  } else {
    // Foto PART tidak dibatasi jumlahnya oleh frontend.
    photoState.part.push(...incoming);
  }

  renderPhotos(kind);
}


// ==========================================
// 15. CAMERA BUTTON
// ==========================================

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

    const input = document.getElementById(`${kind}-camera`);
    if (input) input.click();
  });
});


// ==========================================
// 16. UPLOAD FILE BUTTON
// ==========================================

document.querySelectorAll('[data-upload]').forEach(button => {
  button.addEventListener('click', () => {
    const kind = button.dataset.upload;
    const input = document.getElementById(`${kind}-upload`);
    if (input) input.click();
  });
});


// ==========================================
// 17. PHOTO INPUT EVENTS
// ==========================================

['picking', 'part'].forEach(kind => {
  ['camera', 'upload'].forEach(source => {
    const input = document.getElementById(`${kind}-${source}`);
    if (!input) return;

    input.addEventListener('change', event => {
      addPhotos(kind, event.target.files);
      event.target.value = '';
    });
  });
});


// ==========================================
// 18. FILE READER + PHOTO UPLOAD
// ==========================================

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result.includes(',')) {
        reject(new Error(`Gagal membaca file ${file.name}.`));
        return;
      }
      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error(`Tidak dapat membaca file ${file.name}.`));
    };

    reader.onabort = () => {
      reject(new Error(`Pembacaan file ${file.name} dibatalkan.`));
    };

    reader.readAsDataURL(file);
  });
}

async function uploadOneQCPhoto(file, kind, transaction) {
  const photoId = getPhotoId(file);

  if (uploadedPhotoIds.has(photoId)) {
    return { skipped: true, photoId };
  }

  if (!SUPPORTED_PHOTO_MIME.test(file.type || '')) {
    throw new Error(`Format file ${file.name} tidak didukung.`);
  }

  const base64 = await fileToDataUrl(file);
  const response = await callInventoryApi('UPLOAD_QC_PHOTO', {
    photoId: photoId,
    qcTransactionId: transaction.qcTransactionId,
    folderId: transaction.folderId,
    doNumber: transaction.doNumber,
    pickingList: transaction.pickingList,
    photoType: PHOTO_UPLOAD_TYPE[kind],
    fileName: file.name || `${photoId}.jpg`,
    mimeType: file.type,
    base64: base64,
    remarks: transaction.remarks || ''
  });

  if (!response.upload || response.upload.ok !== true) {
    throw new Error(`Server belum mengonfirmasi upload ${file.name}.`);
  }

  uploadedPhotoIds.add(photoId);
  return response.upload;
}

function getPendingPhotos() {
  const list = [];

  photoState.picking.forEach(file => {
    if (!uploadedPhotoIds.has(getPhotoId(file))) {
      list.push({ file, kind: 'picking' });
    }
  });

  photoState.part.forEach(file => {
    if (!uploadedPhotoIds.has(getPhotoId(file))) {
      list.push({ file, kind: 'part' });
    }
  });

  return list;
}


// ==========================================
// 19. QC TRANSACTION + FORM SUBMISSION
// ==========================================

function getQCFormValues() {
  const doInput = document.getElementById('do-number');
  const pickingInput = document.getElementById('picking-list');
  const remarksInput = document.getElementById('remarks');

  return {
    doNumber: doInput ? doInput.value.trim() : '',
    pickingList: pickingInput ? pickingInput.value.trim() : '',
    remarks: remarksInput ? remarksInput.value.trim() : ''
  };
}

function clearCompletedQCForm() {
  photoState.picking.forEach(releasePreviewUrl);
  photoState.part.forEach(releasePreviewUrl);

  photoState.picking = [];
  photoState.part = [];
  uploadedPhotoIds.clear();
  pendingQCTransaction = null;
  qcCreationUncertain = false;

  const doInput = document.getElementById('do-number');
  const pickingInput = document.getElementById('picking-list');
  const remarksInput = document.getElementById('remarks');

  if (doInput) doInput.value = '';
  if (pickingInput) pickingInput.value = '';
  if (remarksInput) remarksInput.value = '';

  ['picking-camera', 'picking-upload', 'part-camera', 'part-upload']
    .forEach(id => {
      const input = document.getElementById(id);
      if (input) input.value = '';
    });

  renderPhotos('picking');
  renderPhotos('part');
}

async function submitQCForm(event) {
  event.preventDefault();

  if (qcSubmitting) return;

  if (!inventoryUser) {
    alert('Silakan login terlebih dahulu.');
    showView('login-view');
    return;
  }

  const formValues = getQCFormValues();

  if (!formValues.doNumber || !formValues.pickingList) {
    alert('DO Number dan Picking List wajib diisi.');
    return;
  }

  if (photoState.picking.length === 0 || photoState.part.length === 0) {
    alert('Foto Picking List dan Item / Part wajib ditambahkan.');
    return;
  }

  if (photoState.picking.length > MAX_PICKING_PHOTOS) {
    alert('Maksimal 10 foto Picking List per transaksi.');
    return;
  }

  const allFiles = [
    ...photoState.picking.map(file => ({ file, kind: 'picking' })),
    ...photoState.part.map(file => ({ file, kind: 'part' }))
  ];

  const unsupported = allFiles.filter(item =>
    !SUPPORTED_PHOTO_MIME.test(item.file.type || '')
  );

  if (unsupported.length) {
    alert(
      `Ada ${unsupported.length} foto dengan format yang tidak didukung. Gunakan JPEG, PNG, WEBP, HEIC, atau HEIF.`
    );
    return;
  }

  if (qcCreationUncertain && !pendingQCTransaction) {
    alert(
      'Status pembuatan transaksi sebelumnya belum dapat dipastikan karena koneksi timeout. Jangan submit ulang dulu. Periksa folder Drive QC dan Apps Script Executions untuk memastikan apakah folder QC sudah terbentuk.'
    );
    return;
  }

  if (pendingQCTransaction) {
    if (
      formValues.doNumber !== pendingQCTransaction.doNumber ||
      formValues.pickingList !== pendingQCTransaction.pickingList
    ) {
      alert(
        `Masih ada transaksi ${pendingQCTransaction.qcTransactionId} yang belum selesai di-upload. Gunakan DO Number dan Picking List yang sama untuk melanjutkan upload foto yang gagal.`
      );
      return;
    }
  }

  qcSubmitting = true;
  setQCFormBusy(true, 'MENYIAPKAN QC...');

  try {
    // Create satu kali. Jika upload gagal sebagian, transaksi ini
    // dipertahankan dan submit berikutnya hanya mengulang foto gagal.
    if (!pendingQCTransaction) {
      setQCProgress('Membuat QC Transaction dan folder Drive...', 'info');

      let response;
      try {
        response = await callInventoryApi('CREATE_QC_TRANSACTION', {
          doNumber: formValues.doNumber,
          pickingList: formValues.pickingList,
          remarks: formValues.remarks
        });
      } catch (error) {
        if ((error.message || '').toLowerCase().includes('timeout') ||
            (error.message || '').toLowerCase().includes('waktu tunggu')) {
          qcCreationUncertain = true;
          setQCProgress(
            'Koneksi timeout saat membuat transaksi. Status pembuatan folder belum pasti. Jangan submit ulang sebelum memeriksa folder Drive QC dan Apps Script Executions.',
            'error'
          );
        }
        throw error;
      }

      const transaction = response.transaction;
      if (
        !transaction ||
        !transaction.qcTransactionId ||
        !transaction.folderId
      ) {
        throw new Error(
          'Respons CREATE_QC_TRANSACTION tidak lengkap. Periksa Web.gs dan Apps Script Executions.'
        );
      }

      pendingQCTransaction = {
        qcTransactionId: transaction.qcTransactionId,
        folderId: transaction.folderId,
        pickingListFolderId: transaction.pickingListFolderId,
        partFolderId: transaction.partFolderId,
        doNumber: transaction.doNumber || formValues.doNumber,
        pickingList: transaction.pickingList || formValues.pickingList,
        remarks: transaction.remarks !== undefined
          ? transaction.remarks
          : formValues.remarks
      };

      qcCreationUncertain = false;
      setQCProgress(
        `Transaksi ${pendingQCTransaction.qcTransactionId} berhasil dibuat. Menyiapkan upload foto...`,
        'info'
      );
    }

    const pendingPhotos = getPendingPhotos();
    const total = pendingPhotos.length;
    let completed = 0;
    let failed = 0;
    const errors = [];

    if (total === 0) {
      const completedQCId = pendingQCTransaction.qcTransactionId;
      const totalUploaded = uploadedPhotoIds.size;
      setQCProgress(
        `Semua ${totalUploaded} foto untuk ${completedQCId} sudah terkonfirmasi tersimpan.`,
        'success'
      );
      clearCompletedQCForm();
      setQCProgress(
        `QC BERHASIL\nTransaction ID: ${completedQCId}\nSemua foto telah tersimpan.`,
        'success'
      );
      return;
    }

    for (const item of pendingPhotos) {
      const displayIndex = completed + failed + 1;
      setQCProgress(
        `QC ${pendingQCTransaction.qcTransactionId}\nUpload ${displayIndex}/${total}\n${item.file.name || 'Foto'}\nMohon jangan tutup halaman selama proses berlangsung.`,
        'info'
      );

      try {
        await uploadOneQCPhoto(
          item.file,
          item.kind,
          pendingQCTransaction
        );
        completed++;
        renderPhotos(item.kind);
      } catch (error) {
        failed++;
        errors.push(`${item.file.name || 'Foto'}: ${error.message}`);
        console.error('QC photo upload failed:', item.file.name, error);
      }
    }

    if (failed > 0) {
      const alreadyUploaded = uploadedPhotoIds.size;
      const sampleErrors = errors.slice(0, 5).join('\n');

      setQCProgress(
        `UPLOAD BELUM SELESAI\nQC ID: ${pendingQCTransaction.qcTransactionId}\nBerhasil pada proses ini: ${completed}\nGagal pada proses ini: ${failed}\nTotal sudah tersimpan: ${alreadyUploaded}\n\nFoto yang berhasil tidak akan di-upload ulang. Tekan SUBMIT QC lagi untuk mencoba foto yang gagal.\n\n${sampleErrors}`,
        'error'
      );
      return;
    }

    const completedQCId = pendingQCTransaction.qcTransactionId;
    setQCProgress(
      `Semua ${uploadedPhotoIds.size} foto berhasil diunggah. QC Transaction ${completedQCId} tersimpan di Google Drive dan QC_DOCUMENTATION.`,
      'success'
    );

    clearCompletedQCForm();
    setQCProgress(
      `QC BERHASIL\nTransaction ID: ${completedQCId}\nSemua foto telah tersimpan.`,
      'success'
    );

  } catch (error) {
    console.error('QC submission failed:', error);

    if (!qcCreationUncertain) {
      setQCProgress(
        `Proses QC mengalami kendala: ${error.message || 'Kesalahan tidak diketahui.'}\nPeriksa koneksi dan Apps Script Executions. Jika transaksi sudah terbentuk, lanjutkan dengan DO Number dan Picking List yang sama.`,
        'error'
      );
    }

  } finally {
    qcSubmitting = false;
    setQCFormBusy(false);
    renderPhotos('picking');
    renderPhotos('part');
  }
}

if (qcForm) {
  qcSubmitButton = qcForm.querySelector(
    'button[type="submit"], input[type="submit"]'
  );
  qcForm.addEventListener('submit', submitQCForm);
}

// Peringatkan jika halaman ditutup ketika upload parsial belum selesai.
window.addEventListener('beforeunload', event => {
  if (pendingQCTransaction && getPendingPhotos().length > 0) {
    event.preventDefault();
    event.returnValue = '';
  }
});


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
  'SANY INVENTORY SYSTEM FRONTEND INITIALIZED - QC UPLOAD 1.1.0'
);
