# SANY INVENTORY SYSTEM

Project 2 — Inventory workflow, initially QC Documentation.

## Architecture (starter)
- Frontend: static web app (GitHub Pages)
- Authentication: Firebase Authentication (to be wired after config is supplied)
- Backend: Google Apps Script (separate deployment from Logistic)
- Data: dedicated Inventory Google Spreadsheet and Drive folder

## Important design decisions
- Dashboard is always the landing page, even with one active menu.
- QC menu is opened by clicking the dashboard card.
- PDA laser scanner enters text into the focused input (keyboard-wedge/HID support must be verified on the actual PDA).
- Camera is for QC photos only; no camera barcode scanning.
- Original photo files must be preserved. No lossy compression of QC originals.
- Duplicate DO numbers are allowed.
- One QC transaction has one backend-generated QC ID; each photo is one row in the flat six-column sheet.

## Local preview
Open `index.html` in a browser, or serve this folder with any static HTTP server.

## Deployment checklist
1. Create a new GitHub repository named `SANY-INVENTORY-SYSTEM`.
2. Upload this folder's contents to the repository root.
3. Enable GitHub Pages from the chosen branch/root.
4. Create a separate Google Apps Script project for Inventory.
5. Create a dedicated Inventory spreadsheet and Drive parent folder.
6. Configure Firebase web app settings in `js/firebase-config.js` (do not commit private keys or service-account JSON).
7. Wire and test authentication before enabling data writes.

This starter is a UI/architecture scaffold. It is not yet connected to Firebase, Sheets, or Drive.
