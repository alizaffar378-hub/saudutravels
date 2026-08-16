// --- GLOBAL STATE & CONFIGURATION ---
let savedVouchersList = [];
let currentAgencySettings = safeGetLocalStorage('tvg_agency_settings', {
  agencyName: 'Travel Agency',
  phone: '',
  email: '',
  address: '',
  logoUrl: ''
});

// Flatpickr instances global references
let voucherDatePicker = null;
let transportDatePicker = null;
let depDatePicker = null;
let depTimePicker = null;
let retDatePicker = null;
let retTimePicker = null;
let makkahZiyaratDatePicker = null;
let madinahZiyaratDatePicker = null;

// --- SAFE HELPER FUNCTIONS ---
function safeGetLocalStorage(key, defaultValue) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (err) {
    console.error(`Error reading ${key} from localStorage:`, err);
    return defaultValue;
  }
}

function safeGetSession() {
  try {
    const session = localStorage.getItem('tvg_session');
    return session ? JSON.parse(session) : null;
  } catch (e) {
    console.error("Corrupted session data in LocalStorage", e);
    return null;
  }
}

function formatDateToDMY(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB');
}

function formatCreatorName(createdBy, role) {
  if (!createdBy) return 'System';
  const roleLabel = role ? ` (${role})` : '';
  return `${createdBy}${roleLabel}`;
}

// --- INITIALIZATION & EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', async () => {
  checkAuth();
  initDatePickers();
  bindGlobalEvents();
  await initDashboard();
});

function bindGlobalEvents() {
  // Logo URL & File Upload preview handler
  const logoInput = document.getElementById('settingLogoUrl');
  if (logoInput) {
    logoInput.addEventListener('input', (e) => {
      const url = e.target.value.trim();
      updateHeaderBranding({ ...currentAgencySettings, logoUrl: url });
    });
  }

  // Live Preview Button
  const previewBtn = document.getElementById('btnLivePreview') || document.getElementById('btnPreviewVoucher');
  if (previewBtn) {
    previewBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openLivePreviewModal();
    });
  }

  // Direct Generate & Download PDF Button
  const downloadPdfBtn = document.getElementById('btnDownloadPdf') || document.getElementById('btnGeneratePdf');
  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await generateAndDownloadPDFFromForm();
    });
  }
}

async function initDashboard() {
  await fetchAgencySettings();
  await fetchSavedVouchers();
}

function initDatePickers() {
  if (typeof flatpickr === 'undefined') return;

  const dateConfig = { dateFormat: "Y-m-d", allowInput: true };
  const timeConfig = { enableTime: true, noCalendar: true, dateFormat: "H:i", time_24hr: true };

  const elIds = [
    { id: 'voucherDate', setter: (inst) => voucherDatePicker = inst, cfg: dateConfig },
    { id: 'transportDate', setter: (inst) => transportDatePicker = inst, cfg: dateConfig },
    { id: 'depDate', setter: (inst) => depDatePicker = inst, cfg: dateConfig },
    { id: 'depTime', setter: (inst) => depTimePicker = inst, cfg: timeConfig },
    { id: 'retDate', setter: (inst) => retDatePicker = inst, cfg: dateConfig },
    { id: 'retTime', setter: (inst) => retTimePicker = inst, cfg: timeConfig },
    { id: 'makkahZiyaratDate', setter: (inst) => makkahZiyaratDatePicker = inst, cfg: dateConfig },
    { id: 'madinahZiyaratDate', setter: (inst) => madinahZiyaratDatePicker = inst, cfg: dateConfig }
  ];

  elIds.forEach(item => {
    const el = document.getElementById(item.id);
    if (el) item.setter(flatpickr(el, item.cfg));
  });
}

// --- UI / NAVIGATION TABS ---
function switchTab(tabName) {
  const createTab = document.getElementById('tabCreateVoucher');
  const archiveTab = document.getElementById('tabSavedVouchers');
  const settingsTab = document.getElementById('tabAgencySettings');

  const navCreate = document.getElementById('navCreateTab');
  const navArchive = document.getElementById('navArchiveTab');
  const navSettings = document.getElementById('navSettingsTab');

  if (createTab) createTab.classList.add('hidden');
  if (archiveTab) archiveTab.classList.add('hidden');
  if (settingsTab) settingsTab.classList.add('hidden');

  const inactiveNavClass = "px-4 py-2 text-xs font-bold text-slate-300 hover:bg-emerald-800 rounded-lg transition-colors flex items-center space-x-2";
  const activeNavClass = "px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg shadow transition-colors flex items-center space-x-2";

  if (navCreate) navCreate.className = inactiveNavClass;
  if (navArchive) navArchive.className = inactiveNavClass;
  if (navSettings) navSettings.className = inactiveNavClass;

  if (tabName === 'create') {
    if (createTab) createTab.classList.remove('hidden');
    if (navCreate) navCreate.className = activeNavClass;
  } else if (tabName === 'archive') {
    if (archiveTab) archiveTab.classList.remove('hidden');
    if (navArchive) navArchive.className = activeNavClass;
    fetchSavedVouchers();
  } else if (tabName === 'settings') {
    if (settingsTab) settingsTab.classList.remove('hidden');
    if (navSettings) navSettings.className = activeNavClass;
    loadAgencySettingsToForm();
    fetchSystemUsers();
  }
}

// --- DYNAMIC ROWS (PASSENGERS & HOTELS) ---
function addPassengerRow(pData = {}) {
  const tbody = document.getElementById('passengerTableBody');
  if (!tbody) return;

  const rowId = 'p_row_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const row = document.createElement('tr');
  row.id = rowId;
  row.className = "hover:bg-slate-50 transition-colors";

  row.innerHTML = `
    <td class="py-2 px-2">
      <input type="text" class="p-name form-input w-full text-xs rounded border-slate-300 focus:border-emerald-500 focus:ring-emerald-500 font-semibold" placeholder="Passenger Full Name" value="${pData.name || ''}">
    </td>
    <td class="py-2 px-2">
      <input type="text" class="p-pp form-input w-full text-xs font-mono rounded border-slate-300 focus:border-emerald-500 focus:ring-emerald-500" placeholder="Passport No" value="${pData.passportNo || ''}">
    </td>
    <td class="py-2 px-2">
      <select class="p-type form-select w-full text-xs rounded border-slate-300 focus:border-emerald-500 focus:ring-emerald-500">
        <option value="Adult" ${pData.type === 'Adult' ? 'selected' : ''}>Adult</option>
        <option value="Child" ${pData.type === 'Child' ? 'selected' : ''}>Child</option>
        <option value="Infant" ${pData.type === 'Infant' ? 'selected' : ''}>Infant</option>
      </select>
    </td>
    <td class="py-2 px-2 mofa-field ${document.getElementById('includeMofaToggle')?.checked ? '' : 'hidden'}">
      <input type="text" class="p-mofa form-input w-full text-xs font-mono rounded border-slate-300 focus:border-emerald-500 focus:ring-emerald-500" placeholder="MOFA No" value="${pData.mofaNo || ''}">
    </td>
    <td class="py-2 px-2 mofa-field ${document.getElementById('includeMofaToggle')?.checked ? '' : 'hidden'}">
      <input type="text" class="p-visa form-input w-full text-xs font-mono rounded border-slate-300 focus:border-emerald-500 focus:ring-emerald-500" placeholder="Visa No" value="${pData.visaNo || ''}">
    </td>
    <td class="py-2 px-2 text-center">
      <button type="button" onclick="removePassengerRow('${rowId}')" class="text-red-500 hover:text-red-700 p-1 font-bold">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </td>
  `;

  tbody.appendChild(row);
  updateTotalPaxDisplay();
}

function removePassengerRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) {
    row.remove();
    updateTotalPaxDisplay();
  }
}

function addHotelRow(hData = {}) {
  const tbody = document.getElementById('hotelTableBody');
  if (!tbody) return;

  const rowId = 'h_row_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const row = document.createElement('tr');
  row.id = rowId;
  row.className = "hover:bg-slate-50 transition-colors";

  row.innerHTML = `
    <td class="py-2 px-2">
      <select class="h-city form-select w-full text-xs rounded border-slate-300 focus:border-emerald-500 focus:ring-emerald-500 font-semibold">
        <option value="Makkah" ${hData.city === 'Makkah' ? 'selected' : ''}>Makkah</option>
        <option value="Madinah" ${hData.city === 'Madinah' ? 'selected' : ''}>Madinah</option>
      </select>
    </td>
    <td class="py-2 px-2">
      <input type="text" class="h-name form-input w-full text-xs rounded border-slate-300 focus:border-emerald-500 focus:ring-emerald-500 font-medium" placeholder="Hotel Name" value="${hData.hotelName || ''}">
    </td>
    <td class="py-2 px-2">
      <input type="date" class="h-checkin form-input w-full text-xs rounded border-slate-300 focus:border-emerald-500 focus:ring-emerald-500" value="${hData.checkIn || ''}">
    </td>
    <td class="py-2 px-2">
      <input type="date" class="h-checkout form-input w-full text-xs rounded border-slate-300 focus:border-emerald-500 focus:ring-emerald-500" value="${hData.checkOut || ''}">
    </td>
    <td class="py-2 px-2">
      <input type="number" min="1" class="h-nights form-input w-16 text-xs rounded border-slate-300 focus:border-emerald-500 focus:ring-emerald-500 text-center font-bold" placeholder="Nights" value="${hData.nights || 1}">
    </td>
    <td class="py-2 px-2">
      <input type="text" class="h-roomtype form-input w-full text-xs rounded border-slate-300 focus:border-emerald-500 focus:ring-emerald-500" placeholder="Double/Triple/Quad" value="${hData.roomType || ''}">
    </td>
    <td class="py-2 px-2">
      <input type="text" class="h-meal form-input w-full text-xs rounded border-slate-300 focus:border-emerald-500 focus:ring-emerald-500" placeholder="RO / BB / Half Board" value="${hData.mealPlan || ''}">
    </td>
    <td class="py-2 px-2 text-center">
      <button type="button" onclick="removeHotelRow('${rowId}')" class="text-red-500 hover:text-red-700 p-1 font-bold">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </td>
  `;

  tbody.appendChild(row);
}

function removeHotelRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) row.remove();
}

function toggleMofaFields() {
  const isChecked = document.getElementById('includeMofaToggle')?.checked || false;
  document.querySelectorAll('.mofa-field').forEach(field => {
    if (isChecked) field.classList.remove('hidden');
    else field.classList.add('hidden');
  });
}

function togglePackageCustomInput() {
  const select = document.getElementById('packageNameSelect');
  const customInput = document.getElementById('packageNameCustom');
  if (!select || !customInput) return;

  if (select.value === 'CUSTOM') {
    customInput.classList.remove('hidden');
  } else {
    customInput.classList.add('hidden');
  }
}

function updateTotalPaxDisplay() {
  const adults = parseInt(document.getElementById('adultsCount')?.value || 1, 10);
  const children = parseInt(document.getElementById('childrenCount')?.value || 0, 10);
  const infants = parseInt(document.getElementById('infantsCount')?.value || 0, 10);
  const total = adults + children + infants;

  const displayEl = document.getElementById('totalPaxDisplay');
  if (displayEl) displayEl.innerText = `${total} PAX`;
}

// --- GATHER FORM DATA ---
function getVoucherFormData() {
  const session = safeGetSession();
  const createdBy = session ? session.email : 'Unknown Staff';
  const createdByRole = session ? session.role : 'staff_pending';

  const packageSelect = document.getElementById('packageNameSelect')?.value || '';
  const customPackage = document.getElementById('packageNameCustom')?.value || '';
  const packageName = (packageSelect === 'CUSTOM') ? customPackage : packageSelect;

  const passengers = [];
  document.querySelectorAll('#passengerTableBody tr').forEach(row => {
    const name = row.querySelector('.p-name')?.value.trim();
    if (name) {
      passengers.push({
        name: name,
        passportNo: row.querySelector('.p-pp')?.value.trim() || '',
        type: row.querySelector('.p-type')?.value || 'Adult',
        mofaNo: row.querySelector('.p-mofa')?.value.trim() || '',
        visaNo: row.querySelector('.p-visa')?.value.trim() || ''
      });
    }
  });

  const hotels = [];
  document.querySelectorAll('#hotelTableBody tr').forEach(row => {
    const hotelName = row.querySelector('.h-name')?.value.trim();
    if (hotelName) {
      hotels.push({
        city: row.querySelector('.h-city')?.value || 'Makkah',
        hotelName: hotelName,
        checkIn: row.querySelector('.h-checkin')?.value || '',
        checkOut: row.querySelector('.h-checkout')?.value || '',
        nights: parseInt(row.querySelector('.h-nights')?.value || 1, 10),
        roomType: row.querySelector('.h-roomtype')?.value || '',
        mealPlan: row.querySelector('.h-meal')?.value || ''
      });
    }
  });

  const adultsCount = parseInt(document.getElementById('adultsCount')?.value || 1, 10);
  const childrenCount = parseInt(document.getElementById('childrenCount')?.value || 0, 10);
  const infantsCount = parseInt(document.getElementById('infantsCount')?.value || 0, 10);

  return {
    id: document.getElementById('voucherRefId')?.value || ('TVG-' + Math.floor(100000 + Math.random() * 900000)),
    voucherDate: document.getElementById('voucherDate')?.value || new Date().toISOString().split('T')[0],
    familyHead: document.getElementById('familyHeadName')?.value.trim() || 'Guest Family',
    adultsCount,
    childrenCount,
    infantsCount,
    totalPax: adultsCount + childrenCount + infantsCount,
    showMofaDetails: document.getElementById('includeMofaToggle')?.checked || false,
    packageName,
    passengers,
    hotels,
    transport: {
      date: document.getElementById('transportDate')?.value || '',
      transporter: document.getElementById('transporterName')?.value || '',
      vehicleType: document.getElementById('vehicleType')?.value || '',
      routeNo: document.getElementById('transportRouteNo')?.value || '',
      route: document.getElementById('transportRoute')?.value || ''
    },
    flight: {
      departureAirline: document.getElementById('depAirline')?.value || '',
      departureFlightNo: document.getElementById('depFlightNo')?.value || '',
      departureRoute: document.getElementById('depRoute')?.value || '',
      departureDate: document.getElementById('depDate')?.value || '',
      departureTime: document.getElementById('depTime')?.value || '',
      returnAirline: document.getElementById('retAirline')?.value || '',
      returnFlightNo: document.getElementById('retFlightNo')?.value || '',
      returnRoute: document.getElementById('retRoute')?.value || '',
      returnDate: document.getElementById('retDate')?.value || '',
      returnTime: document.getElementById('retTime')?.value || ''
    },
    ziyarat: {
      makkahIncluded: document.getElementById('makkahZiyaratSelect')?.value || 'No',
      makkahDate: document.getElementById('makkahZiyaratDate')?.value || '',
      madinahIncluded: document.getElementById('madinahZiyaratSelect')?.value || 'No',
      madinahDate: document.getElementById('madinahZiyaratDate')?.value || ''
    },
    helplines: {
      makkah: document.getElementById('makkahHelplineInput')?.value || '',
      medina: document.getElementById('medinaHelplineInput')?.value || '',
      transport: document.getElementById('transportHelplineInput')?.value || ''
    },
    termsUrdu: document.getElementById('termsUrduInput')?.value || '',
    termsEnglish: document.getElementById('termsEnglishInput')?.value || '',
    status: createdByRole === 'admin' ? 'APPROVED' : 'NOT APPROVED',
    createdBy,
    createdByRole
  };
}

// --- LIVE PREVIEW & DIRECT PDF GENERATION ---
async function openLivePreviewModal() {
  const vData = getVoucherFormData();
  const modal = document.getElementById('pdfPreviewModal');
  const templateContainer = document.getElementById('voucher-preview-container') || document.getElementById('a4VoucherTemplate');
  
  if (!modal || !templateContainer) {
    showToast('Preview modal structure not found in HTML', 'error');
    return;
  }

  modal.classList.remove('hidden');
  if (typeof renderA4VoucherHTML === 'function') {
    const htmlContent = await renderA4VoucherHTML(vData, currentAgencySettings);
    templateContainer.innerHTML = htmlContent;
  } else {
    templateContainer.innerHTML = `<div class="p-6 text-center font-bold">Voucher Ref: ${vData.id} - ${vData.familyHead} (${vData.totalPax} PAX)</div>`;
  }
}

function closePdfPreviewModal() {
  const modal = document.getElementById('pdfPreviewModal');
  if (modal) modal.classList.add('hidden');
}

async function generateAndDownloadPDFFromForm() {
  const vData = getVoucherFormData();
  await saveVoucher(); // Pehle auto-save karein
  await reDownloadVoucherPDF(vData.id);
}

// --- SAVE VOUCHER ACTION ---
async function saveVoucher() {
  const vData = getVoucherFormData();
  const session = safeGetSession();
  const userRole = session ? session.role : 'staff_pending';
  const userEmail = session ? session.email : 'unknown';

  showToast('Saving voucher...', 'info');

  try {
    const res = await fetch('/api/vouchers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': userRole,
        'x-user-email': userEmail
      },
      body: JSON.stringify(vData)
    });
    const result = await res.json();
    if (result.success) {
      showToast('Voucher saved successfully!', 'success');
      await fetchSavedVouchers();
    } else {
      showToast(result.message || 'Failed to save voucher on server', 'warning');
    }
  } catch (err) {
    console.warn("API Save failed, storing in LocalStorage: ", err);
    let localVouchers = safeGetLocalStorage('tvg_vouchers', []);
    const existingIdx = localVouchers.findIndex(v => v.id === vData.id);
    if (existingIdx >= 0) localVouchers[existingIdx] = vData;
    else localVouchers.unshift(vData);

    localStorage.setItem('tvg_vouchers', JSON.stringify(localVouchers));
    showToast('Voucher saved to local browser storage', 'info');
    await fetchSavedVouchers();
  }
}

// --- BRANDING & SETTINGS ---
async function fetchAgencySettings() {
  try {
    const res = await fetch('/api/settings');
    const result = await res.json();
    if (result.success && result.settings) {
      currentAgencySettings = result.settings;
      localStorage.setItem('tvg_agency_settings', JSON.stringify(result.settings));
    }
  } catch (err) {
    console.warn("Could not fetch agency settings from API, using cached LocalStorage.");
  }
  updateHeaderBranding(currentAgencySettings);
}

function loadAgencySettingsToForm() {
  if (!currentAgencySettings) return;
  if (document.getElementById('settingAgencyName')) document.getElementById('settingAgencyName').value = currentAgencySettings.agencyName || '';
  if (document.getElementById('settingAgencyPhone')) document.getElementById('settingAgencyPhone').value = currentAgencySettings.phone || '';
  if (document.getElementById('settingAgencyEmail')) document.getElementById('settingAgencyEmail').value = currentAgencySettings.email || '';
  if (document.getElementById('settingAgencyAddress')) document.getElementById('settingAgencyAddress').value = currentAgencySettings.address || '';
  if (document.getElementById('settingLogoUrl')) document.getElementById('settingLogoUrl').value = currentAgencySettings.logoUrl || '';
}

async function saveAgencySettings() {
  const session = safeGetSession();
  const userRole = session ? session.role : 'staff_pending';

  const updatedSettings = {
    agencyName: document.getElementById('settingAgencyName')?.value.trim() || 'Travel Agency',
    phone: document.getElementById('settingAgencyPhone')?.value.trim() || '',
    email: document.getElementById('settingAgencyEmail')?.value.trim() || '',
    address: document.getElementById('settingAgencyAddress')?.value.trim() || '',
    logoUrl: document.getElementById('settingLogoUrl')?.value.trim() || ''
  };

  showToast('Saving agency settings...', 'info');

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': userRole
      },
      body: JSON.stringify(updatedSettings)
    });
    const result = await res.json();
    if (result.success) {
      currentAgencySettings = updatedSettings;
      localStorage.setItem('tvg_agency_settings', JSON.stringify(updatedSettings));
      updateHeaderBranding(updatedSettings);
      showToast('Settings saved successfully!', 'success');
    } else {
      showToast(result.message || 'Failed to save settings', 'error');
    }
  } catch (err) {
    currentAgencySettings = updatedSettings;
    localStorage.setItem('tvg_agency_settings', JSON.stringify(updatedSettings));
    updateHeaderBranding(updatedSettings);
    showToast('Saved to local storage', 'info');
  }
}

function updateHeaderBranding(settings) {
  const nameEl = document.getElementById('headerAgencyName');
  const logoEl = document.getElementById('headerAgencyLogo');
  if (nameEl) nameEl.innerText = settings.agencyName || 'Travel Agency';
  if (logoEl && settings.logoUrl) {
    logoEl.src = settings.logoUrl;
    logoEl.classList.remove('hidden');
  }
}

// --- SAVED VOUCHERS ARCHIVE ---
async function fetchSavedVouchers() {
  try {
    const res = await fetch('/api/vouchers');
    const result = await res.json();
    if (result.success && Array.isArray(result.vouchers || result.data)) {
      savedVouchersList = result.vouchers || result.data;
    }
  } catch (err) {
    savedVouchersList = safeGetLocalStorage('tvg_vouchers', []);
  }

  renderSavedVouchersTable(savedVouchersList);
  renderDrawerVouchers(savedVouchersList);
}

function renderSavedVouchersTable(vouchers) {
  const tbody = document.getElementById('savedVouchersTableBody');
  const noMsg = document.getElementById('noVouchersMessage');
  const badge = document.getElementById('savedVoucherBadge');

  if (badge) badge.innerText = (vouchers || []).length;
  if (!tbody || !noMsg) return;

  if (!vouchers || vouchers.length === 0) {
    tbody.innerHTML = '';
    noMsg.classList.remove('hidden');
    return;
  }

  const user = safeGetSession();
  const isAuthorizedToApprove = user && (user.role === 'admin' || user.role === 'staff_approved');

  noMsg.classList.add('hidden');
  tbody.innerHTML = vouchers.map(v => {
    const status = v.status || 'NOT APPROVED';
    const statusBadgeClass = status === 'APPROVED'
      ? 'bg-emerald-100 text-emerald-800'
      : 'bg-rose-100 text-rose-800';

    let approveButton = '';
    if (isAuthorizedToApprove && status === 'NOT APPROVED') {
      approveButton = `
        <button type="button" onclick="approveVoucher('${v.id}')" title="Approve Voucher" class="px-2 py-1 bg-teal-600 hover:bg-teal-700 text-white border border-teal-700 rounded text-xs font-bold shadow-sm">
          <i class="fa-solid fa-circle-check"></i> Approve
        </button>
      `;
    }

    return `
      <tr class="hover:bg-emerald-50/40 transition-colors">
        <td class="font-bold text-emerald-800 font-mono py-2 px-3">${v.id}</td>
        <td class="py-2 px-3 text-slate-600">${v.voucherDate || '-'}</td>
        <td class="font-bold text-slate-900 py-2 px-3 text-xs">
          <div>${v.familyHead || '-'}</div>
          <div class="text-[9px] text-slate-400 font-normal mt-0.5">Created by: ${formatCreatorName(v.createdBy, v.createdByRole)}</div>
        </td>
        <td class="py-2 px-3 text-slate-700 font-medium">${v.packageName || '-'}</td>
        <td class="text-center font-bold py-2 px-3"><span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-xs">${v.totalPax || 1} PAX</span></td>
        <td class="text-center py-2 px-3"><span class="px-2 py-0.5 rounded-full text-xs font-bold ${statusBadgeClass}">${status}</span></td>
        <td class="py-2 px-3">
          <div class="flex items-center space-x-1.5">
            ${approveButton}
            <button type="button" onclick="previewSavedVoucher('${v.id}')" title="Preview PDF" class="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 rounded text-xs font-semibold">
              <i class="fa-solid fa-eye"></i> View
            </button>
            <button type="button" onclick="loadVoucherToForm('${v.id}')" title="Edit / Load to Form" class="px-2 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-300 rounded text-xs font-semibold">
              <i class="fa-solid fa-pen-to-square"></i> Edit
            </button>
            <button type="button" onclick="deleteSavedVoucher('${v.id}')" title="Delete" class="px-2 py-1 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded text-xs font-semibold">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function searchSavedVouchers() {
  const searchInput = document.getElementById('searchVoucherInput');
  if (!searchInput) return;
  const query = searchInput.value.toLowerCase().trim();
  const filtered = (savedVouchersList || []).filter(v => 
    (v.id && v.id.toLowerCase().includes(query)) ||
    (v.familyHead && v.familyHead.toLowerCase().includes(query)) ||
    (v.packageName && v.packageName.toLowerCase().includes(query)) ||
    (v.voucherDate && v.voucherDate.toLowerCase().includes(query))
  );
  renderSavedVouchersTable(filtered);
}

async function previewSavedVoucher(id) {
  const v = (savedVouchersList || []).find(item => item.id === id);
  if (!v) return;

  const modal = document.getElementById('pdfPreviewModal');
  const templateContainer = document.getElementById('voucher-preview-container') || document.getElementById('a4VoucherTemplate');
  if (!modal || !templateContainer) return;

  modal.classList.remove('hidden');
  if (typeof renderA4VoucherHTML === 'function') {
    const renderedHtml = await renderA4VoucherHTML(v, currentAgencySettings);
    templateContainer.innerHTML = renderedHtml;
  }
}

function loadVoucherToForm(id) {
  const v = (savedVouchersList || []).find(item => item.id === id);
  if (!v) return;

  if (document.getElementById('voucherRefId')) document.getElementById('voucherRefId').value = v.id;
  
  if (voucherDatePicker && v.voucherDate) {
    voucherDatePicker.setDate(v.voucherDate);
  } else if (document.getElementById('voucherDate')) {
    document.getElementById('voucherDate').value = v.voucherDate || '';
  }

  if (document.getElementById('familyHeadName')) document.getElementById('familyHeadName').value = v.familyHead || '';
  if (document.getElementById('adultsCount')) document.getElementById('adultsCount').value = v.adultsCount || 1;
  if (document.getElementById('childrenCount')) document.getElementById('childrenCount').value = v.childrenCount || 0;
  if (document.getElementById('infantsCount')) document.getElementById('infantsCount').value = v.infantsCount || 0;
  updateTotalPaxDisplay();

  const mofaToggle = document.getElementById('includeMofaToggle');
  if (mofaToggle) {
    mofaToggle.checked = v.showMofaDetails || false;
    toggleMofaFields();
  }

  const packageSelect = document.getElementById('packageNameSelect');
  const customInput = document.getElementById('packageNameCustom');
  if (packageSelect && customInput) {
    let optionExists = Array.from(packageSelect.options).some(opt => opt.value === v.packageName);
    if (optionExists) {
      packageSelect.value = v.packageName;
      customInput.classList.add('hidden');
    } else {
      packageSelect.value = 'CUSTOM';
      customInput.value = v.packageName || '';
      customInput.classList.remove('hidden');
    }
  }

  // Load Passengers
  const pBody = document.getElementById('passengerTableBody');
  if (pBody) {
    pBody.innerHTML = '';
    if (v.passengers && v.passengers.length > 0) {
      v.passengers.forEach(p => addPassengerRow(p));
    } else {
      addPassengerRow();
    }
  }

  // Load Hotels
  const hBody = document.getElementById('hotelTableBody');
  if (hBody) {
    hBody.innerHTML = '';
    if (v.hotels && v.hotels.length > 0) {
      v.hotels.forEach(h => addHotelRow(h));
    } else {
      addHotelRow();
    }
  }

  // Load Transport
  if (v.transport) {
    if (transportDatePicker && v.transport.date) transportDatePicker.setDate(v.transport.date);
    else if (v.transport.date && document.getElementById('transportDate')) document.getElementById('transportDate').value = v.transport.date;
    if (v.transport.transporter && document.getElementById('transporterName')) document.getElementById('transporterName').value = v.transport.transporter;
    if (v.transport.vehicleType && document.getElementById('vehicleType')) document.getElementById('vehicleType').value = v.transport.vehicleType;
    if (v.transport.routeNo && document.getElementById('transportRouteNo')) document.getElementById('transportRouteNo').value = v.transport.routeNo;
    if (v.transport.route && document.getElementById('transportRoute')) document.getElementById('transportRoute').value = v.transport.route;
  }

  // Load Flight
  if (v.flight) {
    if (v.flight.departureAirline && document.getElementById('depAirline')) document.getElementById('depAirline').value = v.flight.departureAirline;
    if (v.flight.departureFlightNo && document.getElementById('depFlightNo')) document.getElementById('depFlightNo').value = v.flight.departureFlightNo;
    if (v.flight.departureRoute && document.getElementById('depRoute')) document.getElementById('depRoute').value = v.flight.departureRoute;
    if (depDatePicker && v.flight.departureDate) depDatePicker.setDate(v.flight.departureDate);
    if (depTimePicker && v.flight.departureTime) depTimePicker.setDate(v.flight.departureTime);

    if (v.flight.returnAirline && document.getElementById('retAirline')) document.getElementById('retAirline').value = v.flight.returnAirline;
    if (v.flight.returnFlightNo && document.getElementById('retFlightNo')) document.getElementById('retFlightNo').value = v.flight.returnFlightNo;
    if (v.flight.returnRoute && document.getElementById('retRoute')) document.getElementById('retRoute').value = v.flight.returnRoute;
    if (retDatePicker && v.flight.returnDate) retDatePicker.setDate(v.flight.returnDate);
    if (retTimePicker && v.flight.returnTime) retTimePicker.setDate(v.flight.returnTime);
  }

  // Load Helplines
  if (v.helplines) {
    if (v.helplines.makkah && document.getElementById('makkahHelplineInput')) document.getElementById('makkahHelplineInput').value = v.helplines.makkah;
    if (v.helplines.medina && document.getElementById('medinaHelplineInput')) document.getElementById('medinaHelplineInput').value = v.helplines.medina;
    if (v.helplines.transport && document.getElementById('transportHelplineInput')) document.getElementById('transportHelplineInput').value = v.helplines.transport;
  }

  // Load Ziyarat
  if (v.ziyarat) {
    if (document.getElementById('makkahZiyaratSelect')) document.getElementById('makkahZiyaratSelect').value = v.ziyarat.makkahIncluded || 'No';
    if (makkahZiyaratDatePicker && v.ziyarat.makkahDate) makkahZiyaratDatePicker.setDate(v.ziyarat.makkahDate);

    if (document.getElementById('madinahZiyaratSelect')) document.getElementById('madinahZiyaratSelect').value = v.ziyarat.madinahIncluded || 'No';
    if (madinahZiyaratDatePicker && v.ziyarat.madinahDate) madinahZiyaratDatePicker.setDate(v.ziyarat.madinahDate);
  }

  if (v.termsUrdu && document.getElementById('termsUrduInput')) document.getElementById('termsUrduInput').value = v.termsUrdu;
  if (v.termsEnglish && document.getElementById('termsEnglishInput')) document.getElementById('termsEnglishInput').value = v.termsEnglish;

  switchTab('create');
  showToast(`Voucher ${v.id} loaded to form for editing`, 'info');
}

async function deleteSavedVoucher(id) {
  if (!confirm(`Are you sure you want to delete Voucher Ref: ${id}?`)) return;

  const user = safeGetSession();
  const userRole = user ? user.role : 'staff_pending';
  const userEmail = user ? user.email : 'unknown';

  try {
    const res = await fetch(`/api/vouchers/${id}`, { 
      method: 'DELETE',
      headers: {
        'x-user-role': userRole,
        'x-user-email': userEmail
      }
    });
    const result = await res.json();
    if (result.success) {
      showToast(`Voucher ${id} deleted`, 'info');
    }
  } catch (err) {
    let localVouchers = safeGetLocalStorage('tvg_vouchers', []);
    localVouchers = localVouchers.filter(v => v.id !== id);
    localStorage.setItem('tvg_vouchers', JSON.stringify(localVouchers));
    showToast(`Voucher ${id} deleted from local storage`, 'info');
  }

  await fetchSavedVouchers();
}

// --- TOAST NOTIFICATIONS SYSTEM ---
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = {
    success: 'fa-circle-check text-emerald-500',
    error: 'fa-circle-xmark text-red-500',
    warning: 'fa-triangle-exclamation text-amber-500',
    info: 'fa-circle-info text-blue-500'
  };

  const bgColors = {
    success: 'border-emerald-500',
    error: 'border-red-500',
    warning: 'border-amber-500',
    info: 'border-blue-500'
  };

  const toast = document.createElement('div');
  toast.className = `pointer-events-auto bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-lg shadow-xl border-l-4 ${bgColors[type] || bgColors.info} flex items-center space-x-3 transition-all duration-300 transform translate-y-2 opacity-0`;
  toast.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info} text-base"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 4000);
}

// --- SAVED VOUCHERS DRAWER FLOWS ---
async function openSavedVouchersDrawer() {
  const drawer = document.getElementById('savedVouchersDrawer');
  const overlay = document.getElementById('drawerOverlay');
  if (!drawer || !overlay) return;

  drawer.classList.remove('hidden');
  overlay.classList.remove('hidden');

  setTimeout(() => drawer.classList.remove('translate-x-full'), 20);
  await fetchSavedVouchers();
}

function closeSavedVouchersDrawer() {
  const drawer = document.getElementById('savedVouchersDrawer');
  const overlay = document.getElementById('drawerOverlay');
  if (!drawer || !overlay) return;

  drawer.classList.add('translate-x-full');
  setTimeout(() => {
    drawer.classList.add('hidden');
    overlay.classList.add('hidden');
  }, 300);
}

function renderDrawerVouchers(vouchers) {
  const listContainer = document.getElementById('drawerVouchersList');
  const badge = document.getElementById('savedVoucherBadge');

  if (badge) badge.innerText = (vouchers || []).length;
  if (!listContainer) return;

  if (!vouchers || vouchers.length === 0) {
    listContainer.innerHTML = `
      <div class="text-center text-slate-400 py-12">
        <i class="fa-solid fa-folder-open text-3xl mb-2"></i>
        <p class="text-xs font-semibold">No saved vouchers found</p>
      </div>`;
    return;
  }

  const user = safeGetSession();
  const isAuthorizedToApprove = user && (user.role === 'admin' || user.role === 'staff_approved');

  listContainer.innerHTML = vouchers.map(v => {
    const status = v.status || 'NOT APPROVED';
    const statusBadgeClass = status === 'APPROVED'
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-rose-50 text-rose-700';

    let approveButton = '';
    if (isAuthorizedToApprove && status === 'NOT APPROVED') {
      approveButton = `
        <button type="button" onclick="approveVoucherFromDrawer('${v.id}')" title="Approve Voucher" class="px-2 py-1 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded flex items-center space-x-1">
          <i class="fa-solid fa-circle-check"></i>
          <span>Approve</span>
        </button>
      `;
    }

    return `
      <div class="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:border-emerald-300 transition-colors space-y-2">
        <div class="flex items-center justify-between">
          <span class="font-bold text-emerald-800 font-mono text-xs">${v.id}</span>
          <div class="flex items-center space-x-1.5">
            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${statusBadgeClass}">${status}</span>
            <span class="text-[10px] text-slate-400 font-semibold">${formatDateToDMY(v.voucherDate)}</span>
          </div>
        </div>
        <div>
          <p class="font-bold text-slate-900 text-xs">${v.familyHead || 'Guest Family'}</p>
          <p class="text-[10px] text-slate-500 truncate">${v.packageName || 'Umrah Package'}</p>
        </div>
        <div class="flex items-center justify-between border-t border-slate-100 pt-2 text-[10px]">
          <span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded font-black">${v.totalPax || 1} PAX</span>
          <div class="flex space-x-1">
            ${approveButton}
            <button type="button" onclick="loadVoucherToFormFromDrawer('${v.id}')" class="px-2 py-1 bg-amber-50 text-amber-700 font-bold rounded">Edit</button>
            <button type="button" onclick="reDownloadVoucherPDF('${v.id}')" class="px-2 py-1 bg-emerald-50 text-emerald-700 font-bold rounded">PDF</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function loadVoucherToFormFromDrawer(id) {
  loadVoucherToForm(id);
  closeSavedVouchersDrawer();
}

async function reDownloadVoucherPDF(id) {
  const v = (savedVouchersList || []).find(item => item.id === id);
  if (!v) return;
  const filename = `Voucher_${v.id}_${(v.familyHead || 'Guest').replace(/\s+/g, '_')}.pdf`;
  showToast('Generating PDF...', 'info');

  const user = safeGetSession();

  try {
    const response = await fetch('/api/generate-pdf', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-role': user?.role || 'staff_pending',
        'x-user-email': user?.email || 'unknown'
      },
      body: JSON.stringify({ voucherData: v, filename })
    });
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showToast('PDF downloaded successfully!', 'success');
    } else {
      showToast('Failed to generate PDF from backend', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to download PDF', 'error');
  }
}

async function approveVoucher(id) {
  const user = safeGetSession();
  if (!user) return;

  showToast(`Approving voucher ${id}...`, 'info');

  try {
    const response = await fetch(`/api/vouchers/${id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user.role
      }
    });

    const result = await response.json();
    if (result.success) {
      showToast(`Voucher ${id} approved!`, 'success');
      await fetchSavedVouchers();
      await reDownloadVoucherPDF(id);
    } else {
      showToast(result.message || 'Failed to approve voucher', 'error');
    }
  } catch (err) {
    showToast('Failed to approve voucher', 'error');
  }
}

async function approveVoucherFromDrawer(id) {
  await approveVoucher(id);
}

// --- AUTHENTICATION & ACCESS CONTROL (RBAC) ---
function checkAuth() {
  const user = safeGetSession();
  const appContainer = document.getElementById('appContainer');
  const loginContainer = document.getElementById('loginContainer');

  if (!user) {
    if (appContainer) appContainer.classList.add('hidden');
    if (loginContainer) loginContainer.classList.remove('hidden');
  } else {
    if (appContainer) appContainer.classList.remove('hidden');
    if (loginContainer) loginContainer.classList.add('hidden');

    const emailEl = document.getElementById('userProfileEmail');
    const roleEl = document.getElementById('userProfileRole');
    if (emailEl) emailEl.innerText = user.email || '';
    if (roleEl) roleEl.innerText = user.role || '';

    const settingsTabBtn = document.getElementById('navSettingsTab');
    const manageUsersCard = document.getElementById('manageUsersCard');
    if (user.role === 'admin') {
      if (settingsTabBtn) settingsTabBtn.classList.remove('hidden');
      if (manageUsersCard) manageUsersCard.classList.remove('hidden');
    } else {
      if (settingsTabBtn) settingsTabBtn.classList.add('hidden');
      if (manageUsersCard) manageUsersCard.classList.add('hidden');
    }
  }
}

async function handleLogin() {
  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  if (!emailInput || !passwordInput) return;

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput.value.trim(), password: passwordInput.value })
    });

    const result = await response.json();
    if (result.success && result.user) {
      localStorage.setItem('tvg_session', JSON.stringify(result.user));
      showToast('Signed in successfully!', 'success');
      checkAuth();
      await initDashboard();
    } else {
      showToast(result.message || 'Invalid email or password', 'error');
    }
  } catch (err) {
    showToast('Login connection failed', 'error');
  }
}

function handleLogout() {
  localStorage.removeItem('tvg_session');
  checkAuth();
}

// --- ADMIN USER MANAGEMENT ---
async function fetchSystemUsers() {
  const user = safeGetSession();
  if (!user || user.role !== 'admin') return;

  try {
    const response = await fetch('/api/auth/users', { headers: { 'x-user-role': user.role } });
    const result = await response.json();
    if (result.success && Array.isArray(result.users)) {
      renderSystemUsers(result.users);
    }
  } catch (err) {
    showToast('Failed to load users', 'error');
  }
}

function renderSystemUsers(users) {
  const tableBody = document.getElementById('userTableBody');
  if (!tableBody) return;

  tableBody.innerHTML = users.map(u => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="py-3 px-3 font-semibold text-slate-800">${u.email}</td>
      <td class="py-3 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-800">${u.role}</span></td>
      <td class="py-3 px-3 text-center">
        <button type="button" onclick="handleDeleteUser('${u.id}')" class="text-red-500 font-bold"><i class="fa-solid fa-user-minus"></i></button>
      </td>
    </tr>
  `).join('');
}
