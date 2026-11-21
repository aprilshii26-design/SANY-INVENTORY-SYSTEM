'use strict';

// SANY INVENTORY SYSTEM — frontend starter only.
// Authentication and Apps Script integration will be added after configuration review.

const views = [...document.querySelectorAll('.view')];
const navigationButtons = [...document.querySelectorAll('[data-open]')];

function openView(viewId) {
  views.forEach((view) => { view.hidden = view.id !== viewId; });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

navigationButtons.forEach((button) => {
  button.addEventListener('click', () => openView(button.dataset.open));
});

document.getElementById('qc-form').addEventListener('submit', (event) => {
  event.preventDefault();
  alert('Form masih dalam tahap pembangunan. Belum ada data yang dikirim atau disimpan.');
});

// Future PDA integration check:
// Many laser scanners can type into the focused input as a keyboard wedge/HID device.
// Confirm scanner configuration on the actual PDA before implementing auto-advance.
