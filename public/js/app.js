/**
 * Travel Voucher Generator App Controller
 */

// Global State
let currentAgencySettings = {};
let savedVouchersList = [];
let currentUploadedLogoBase64 = '';
let voucherDatePicker = null;
let transportDatePicker = null;
let depDatePicker = null;
let depTimePicker = null;
let retDatePicker = null;
let retTimePicker = null;
let makkahZiyaratDatePicker = null;
let madinahZiyaratDatePicker = null;

// Safe LocalStorage Parser
function safeGetLocalStorage(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`SafeLocalStorage parse error for key "${key}":`, e);
    return fallback;
  }
}

// On Document Load
document.addEventListener('DOMContentLoaded', async () => {
  // Listen for navigation state pop events
  window.addEventListener('popstate', checkAuth);

  // Authenticate session and setup display states
  checkAuth();

  try {
    // Set default voucher date to today
    const today = new Date().toISOString().split('T')[0];
    const voucherDateEl = document.getElementById('voucherDate');
    const transportDateEl = document.getElementById('transportDate');
    if (voucherDateEl) voucherDateEl.value = today;
    if (transportDateEl) transportDateEl.value = today;

    // Initialize Flatpickr Interactive DateTime Pickers
    if (typeof flatpickr !== 'undefined') {
      voucherDatePicker = flatpickr("#voucherDate", {
        enableTime: false,
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d/m/Y",
        defaultDate: today,
        allowInput: true
      });

      transportDatePicker = flatpickr("#transportDate", {
        enableTime: false,
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d/m/Y",
        defaultDate: today,
        allowInput: true
      });

      depDatePicker = flatpickr("#depDate", {
        enableTime: false,
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d/m/Y",
        defaultDate: "2026-08-16",
        allowInput: true
      });

      depTimePicker = flatpickr("#depTime", {
        enableTime: true,
        noCalendar: true,
        dateFormat: "h:i K",
        time_24hr: false,
        defaultDate: "04:30 AM",
        allowInput: true
      });

      retDatePicker = flatpickr("#retDate", {
        enableTime: false,
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d/m/Y",
        defaultDate: "2026-08-30",
        allowInput: true
      });

      retTimePicker = flatpickr("#retTime", {
        enableTime: true,
        noCalendar: true,
        dateFormat: "h:i K",
        time_24hr: false,
        defaultDate: "06:15 PM",
        allowInput: true
      });

      makkahZiyaratDatePicker = flatpickr("#makkahZiyaratDate", {
        enableTime: false,
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d/m/Y",
        allowInput: true
      });

      madinahZiyaratDatePicker = flatpickr("#madinahZiyaratDate", {
        enableTime: false,
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d/m/Y",
        allowInput: true
      });
    }

    // Generate initial Ref ID
    generateNewRefId();

    // Load Agency Settings
    await fetchAgencySettings();

    // Load Saved Vouchers
    await fetchSavedVouchers();

    // Initialize with 1 default passenger and 1 default hotel row if empty
    const passengerTbody = document.getElementById('passengerTableBody');
    if (passengerTbody && passengerTbody.children.length === 0) {
      addPassengerRow();
    }
    const hotelTbody = document.getElementById('hotelTableBody');
    if (hotelTbody && hotelTbody.children.length === 0) {
      addHotelRow();
    }

    // Load data from server if session exists
    await initDashboard();
  } catch (err) {
    console.error("Error during app initialization:", err);
  }
});

async function initDashboard() {
  const session = localStorage.getItem('tvg_session');
  if (!session) return;

  try {
    // Load Agency Settings
    await fetchAgencySettings();

    // Load Saved Vouchers
    await fetchSavedVouchers();

    // Load System Users if admin
    const user = JSON.parse(session);
    if (user.role === 'admin') {
      await fetchSystemUsers();
    }
  } catch (err) {
    console.error("Error loading dashboard data:", err);
  }
}

// --- NAVIGATION TABS ---
function switchTab(tabName) {
  const tabs = {
    create: { tab: 'tabCreateVoucher', nav: 'navCreateTab' },
    saved: { tab: 'tabSavedVouchers', nav: 'navSavedTab' },
    settings: { tab: 'tabAgencySettings', nav: 'navSettingsTab' }
  };

  Object.keys(tabs).forEach(key => {
    const isTarget = key === tabName;
    const tabEl = document.getElementById(tabs[key].tab);
    const navEl = document.getElementById(tabs[key].nav);

    if (tabEl && navEl) {
      if (isTarget) {
        tabEl.classList.remove('hidden');
        navEl.className = 'px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 bg-emerald-600 text-white shadow-sm';
      } else {
        tabEl.classList.add('hidden');
        navEl.className = 'px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 text-emerald-100 hover:bg-emerald-700 hover:text-white';
      }
    }
  });

  if (tabName === 'saved') {
    fetchSavedVouchers();
  }
}

// --- VOUCHER REF GENERATOR ---
function generateNewRefId() {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const refId = `UMR-${year}-${randomNum}`;
  const refInput = document.getElementById('voucherRefId');
  if (refInput) refInput.value = refId;
}

// --- PAX COUNT DISPLAY UPDATE ---
function updateTotalPaxDisplay() {
  const adults = parseInt(document.getElementById('adultsCount').value) || 0;
  const children = parseInt(document.getElementById('childrenCount').value) || 0;
  const infants = parseInt(document.getElementById('infantsCount').value) || 0;
  const total = adults + children + infants;
  const display = document.getElementById('totalPaxDisplay');
  if (display) display.innerText = `${total} PAX`;
}

// --- PACKAGE NAME CUSTOM INPUT ---
function handlePackageNameChange() {
  const select = document.getElementById('packageNameSelect');
  const customInput = document.getElementById('packageNameCustom');
  if (!select || !customInput) return;
  if (select.value === 'CUSTOM') {
    customInput.classList.remove('hidden');
    customInput.focus();
  } else {
    customInput.classList.add('hidden');
  }
}

// --- TOGGLE VISA/MOFA FIELDS ---
function toggleMofaFields() {
  const checkbox = document.getElementById('includeMofaToggle');
  const show = checkbox ? checkbox.checked : false;
  const mofaCols = document.querySelectorAll('.mofa-col');
  mofaCols.forEach(el => {
    if (show) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
}

// --- DYNAMIC PASSENGER TABLE ---
function addPassengerRow(pax = {}, e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  const tbody = document.getElementById('passengerTableBody');
  if (!tbody) return;
  const rowCount = tbody.children.length + 1;

  const checkbox = document.getElementById('includeMofaToggle');
  const showMofa = checkbox ? checkbox.checked : false;
  const mofaClass = showMofa ? 'mofa-col' : 'mofa-col hidden';

  const tr = document.createElement('tr');
  tr.className = 'hover:bg-emerald-50/50 transition-colors';
  tr.innerHTML = `
    <td class="text-center font-bold py-1.5 px-1 sno-cell">${rowCount}</td>
    <td><input type="text" value="${pax.passportNo || ''}" placeholder="PK1234567" class="w-full border border-slate-300 rounded p-1 text-xs font-semibold uppercase"></td>
    <td><input type="text" value="${pax.name || ''}" placeholder="Full Name" class="w-full border border-slate-300 rounded p-1 text-xs font-bold text-slate-800"></td>
    <td>
      <select class="w-full border border-slate-300 rounded p-1 text-xs">
        <option value="Male" ${pax.gender === 'Male' ? 'selected' : ''}>Male</option>
        <option value="Female" ${pax.gender === 'Female' ? 'selected' : ''}>Female</option>
      </select>
    </td>
    <td>
      <select class="w-full border border-slate-300 rounded p-1 text-xs">
        <option value="Adult" ${pax.type === 'Adult' ? 'selected' : ''}>Adult</option>
        <option value="Child" ${pax.type === 'Child' ? 'selected' : ''}>Child</option>
        <option value="Infant" ${pax.type === 'Infant' ? 'selected' : ''}>Infant</option>
      </select>
    </td>
    <td>
      <select class="w-full border border-slate-300 rounded p-1 text-xs">
        <option value="Double" ${pax.bed === 'Double' ? 'selected' : ''}>Double</option>
        <option value="Triple" ${pax.bed === 'Triple' ? 'selected' : ''}>Triple</option>
        <option value="Quad" ${pax.bed === 'Quad' ? 'selected' : ''}>Quad</option>
        <option value="Sharing" ${pax.bed === 'Sharing' ? 'selected' : ''}>Sharing</option>
        <option value="No Bed" ${pax.bed === 'No Bed' ? 'selected' : ''}>No Bed</option>
      </select>
    </td>
    <td class="${mofaClass}"><input type="text" value="${pax.mofaNo || ''}" placeholder="MOFA #" class="w-full border border-slate-300 rounded p-1 text-xs"></td>
    <td class="${mofaClass}"><input type="text" value="${pax.groupNo || ''}" placeholder="Group #" class="w-full border border-slate-300 rounded p-1 text-xs"></td>
    <td class="${mofaClass}"><input type="text" value="${pax.visaNo || ''}" placeholder="Visa #" class="w-full border border-slate-300 rounded p-1 text-xs"></td>
    <td class="${mofaClass}"><input type="text" value="${pax.pnr || ''}" placeholder="PNR" class="w-full border border-slate-300 rounded p-1 text-xs font-mono font-bold"></td>
    <td class="text-center">
      <button type="button" onclick="deletePassengerRow(this)" title="Delete Passenger" class="text-red-500 hover:text-red-700 p-1">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </td>
  `;

  tbody.appendChild(tr);
  reindexPassengerRows();
}

function reindexPassengerRows() {
  const tbody = document.getElementById('passengerTableBody');
  if (!tbody) return;
  Array.from(tbody.children).forEach((tr, idx) => {
    const sno = tr.querySelector('.sno-cell');
    if (sno) sno.innerText = idx + 1;
  });
}

function deletePassengerRow(btn) {
  const tbody = document.getElementById('passengerTableBody');
  if (!tbody) return;
  if (tbody.children.length <= 1) {
    showToast('At least one passenger row is required', 'warning');
    return;
  }
  btn.closest('tr').remove();
  reindexPassengerRows();
}

// --- DYNAMIC ACCOMMODATION / HOTEL TABLE ---
function addHotelRow(hotel = {}, e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  const tbody = document.getElementById('hotelTableBody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.className = 'hover:bg-emerald-50/50 transition-colors';

  const today = new Date().toISOString().split('T')[0];
  const nextWeekDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  tr.innerHTML = `
    <td>
      <select class="w-full border border-slate-300 rounded p-1 text-xs font-semibold text-emerald-800">
        <option value="Makkah" ${hotel.city === 'Makkah' ? 'selected' : ''}>Makkah</option>
        <option value="Madinah" ${hotel.city === 'Madinah' ? 'selected' : ''}>Madinah</option>
        <option value="Jeddah" ${hotel.city === 'Jeddah' ? 'selected' : ''}>Jeddah</option>
        <option value="Taif" ${hotel.city === 'Taif' ? 'selected' : ''}>Taif</option>
        <option value="Riyadh" ${hotel.city === 'Riyadh' ? 'selected' : ''}>Riyadh</option>
      </select>
    </td>
    <td><input type="text" value="${hotel.hotelName || ''}" placeholder="e.g. Swissotel Clock Tower" class="w-full border border-slate-300 rounded p-1 text-xs font-bold"></td>
    <td>
      <select class="w-full border border-slate-300 rounded p-1 text-xs">
        <option value="Single Room" ${hotel.roomType === 'Single Room' ? 'selected' : ''}>Single Room</option>
        <option value="Double Room" ${hotel.roomType === 'Double Room' ? 'selected' : ''}>Double Room</option>
        <option value="Triple Room" ${hotel.roomType === 'Triple Room' ? 'selected' : ''}>Triple Room</option>
        <option value="Quad Room" ${hotel.roomType === 'Quad Room' ? 'selected' : ''}>Quad Room</option>
        <option value="Quint Room" ${hotel.roomType === 'Quint Room' ? 'selected' : ''}>Quint Room</option>
        <option value="Family Sharing" ${hotel.roomType === 'Family Sharing' ? 'selected' : ''}>Family Sharing</option>
        <option value="Gender Sharing" ${hotel.roomType === 'Gender Sharing' ? 'selected' : ''}>Gender Sharing</option>
        <option value="Executive Suite" ${hotel.roomType === 'Executive Suite' ? 'selected' : ''}>Executive Suite</option>
      </select>
    </td>
    <td>
      <select class="w-full border border-slate-300 rounded p-1 text-xs">
        <option value="Bed & Breakfast" ${hotel.mealPlan === 'Bed & Breakfast' ? 'selected' : ''}>Bed & Breakfast</option>
        <option value="Room Only" ${hotel.mealPlan === 'Room Only' ? 'selected' : ''}>Room Only</option>
        <option value="Half Board (Breakfast & Dinner)" ${hotel.mealPlan === 'Half Board (Breakfast & Dinner)' ? 'selected' : ''}>Half Board</option>
        <option value="Full Board (All Meals)" ${hotel.mealPlan === 'Full Board (All Meals)' ? 'selected' : ''}>Full Board</option>
        <option value="No Meal" ${hotel.mealPlan === 'No Meal' ? 'selected' : ''}>No Meal</option>
      </select>
    </td>
    <td><input type="text" value="${hotel.checkIn || today}" class="checkin-date w-full border border-slate-300 rounded p-1 text-xs font-medium"></td>
    <td><input type="text" value="${hotel.checkOut || nextWeekDate}" class="checkout-date w-full border border-slate-300 rounded p-1 text-xs font-medium"></td>
    <td class="text-center font-extrabold text-xs text-emerald-700 nights-cell bg-emerald-50">${hotel.totalNights || 7} Nts</td>
    <td class="text-center">
      <button type="button" onclick="deleteHotelRow(this)" title="Delete Hotel" class="text-red-500 hover:text-red-700 p-1">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </td>
  `;

  tbody.appendChild(tr);

  // Initialize Flatpickr on dynamic inputs
  if (typeof flatpickr !== 'undefined') {
    const cinInput = tr.querySelector('.checkin-date');
    const coutInput = tr.querySelector('.checkout-date');

    flatpickr(cinInput, {
      enableTime: false,
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "d/m/Y",
      allowInput: true,
      onChange: function() {
        calculateNightsForRow(cinInput);
      }
    });

    flatpickr(coutInput, {
      enableTime: false,
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "d/m/Y",
      allowInput: true,
      onChange: function() {
        calculateNightsForRow(coutInput);
      }
    });
  }

  const checkinInput = tr.querySelector('.checkin-date');
  if (checkinInput) calculateNightsForRow(checkinInput);
}

function calculateNightsForRow(inputEl) {
  if (!inputEl) return;
  const row = inputEl.closest('tr');
  if (!row) return;
  const checkInEl = row.querySelector('.checkin-date');
  const checkOutEl = row.querySelector('.checkout-date');
  const nightsCell = row.querySelector('.nights-cell');

  if (checkInEl && checkOutEl && nightsCell) {
    const checkIn = checkInEl.value;
    const checkOut = checkOutEl.value;
    if (checkIn && checkOut) {
      const d1 = new Date(checkIn);
      const d2 = new Date(checkOut);
      const timeDiff = d2.getTime() - d1.getTime();
      const nights = Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24)));
      nightsCell.innerText = `${nights} Nts`;
    }
  }
}

function deleteHotelRow(btn) {
  const tbody = document.getElementById('hotelTableBody');
  if (!tbody) return;
  if (tbody.children.length <= 1) {
    showToast('At least one hotel accommodation row is required', 'warning');
    return;
  }
  btn.closest('tr').remove();
}

// --- FILL SAMPLE DATA FUNCTION ---
function fillSampleData(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  try {
    const familyHeadInput = document.getElementById('familyHeadName');
    if (familyHeadInput) familyHeadInput.value = 'Muhammad Ahmed Siddiqui';
    document.getElementById('adultsCount').value = 2;
    document.getElementById('childrenCount').value = 1;
    document.getElementById('infantsCount').value = 0;
    updateTotalPaxDisplay();

    const mofaToggle = document.getElementById('includeMofaToggle');
    if (mofaToggle) {
      mofaToggle.checked = true;
      toggleMofaFields();
    }

    document.getElementById('packageNameSelect').value = '15-Days Executive Umrah Package';
    handlePackageNameChange();

    // Clear existing table rows
    const pBody = document.getElementById('passengerTableBody');
    const hBody = document.getElementById('hotelTableBody');
    if (pBody) pBody.innerHTML = '';
    if (hBody) hBody.innerHTML = '';

    // Add sample passengers
    addPassengerRow({ passportNo: 'PK8920194', name: 'Muhammad Ahmed Siddiqui', gender: 'Male', type: 'Adult', bed: 'Double', mofaNo: '90481204', groupNo: 'GRP-902', visaNo: '6701824901', pnr: 'SV-98A7' });
    addPassengerRow({ passportNo: 'PK8920195', name: 'Fatima Siddiqui', gender: 'Female', type: 'Adult', bed: 'Double', mofaNo: '90481205', groupNo: 'GRP-902', visaNo: '6701824902', pnr: 'SV-98A7' });
    addPassengerRow({ passportNo: 'PK8920196', name: 'Yousuf Siddiqui', gender: 'Male', type: 'Child', bed: 'Sharing', mofaNo: '90481206', groupNo: 'GRP-902', visaNo: '6701824903', pnr: 'SV-98A7' });

    // Add sample hotels
    addHotelRow({ city: 'Makkah', hotelName: 'Swissôtel Makkah (Clock Tower)', roomType: 'Family Sharing', mealPlan: 'Bed & Breakfast', checkIn: '2026-08-16', checkOut: '2026-08-23', totalNights: 7 });
    addHotelRow({ city: 'Madinah', hotelName: 'Pullman Zamzam Madinah', roomType: 'Gender Sharing', mealPlan: 'No Meal', checkIn: '2026-08-23', checkOut: '2026-08-30', totalNights: 7 });

    // Ziyarat Details sample
    document.getElementById('makkahZiyaratSelect').value = 'Yes';
    if (makkahZiyaratDatePicker) makkahZiyaratDatePicker.setDate('2026-08-18');
    else document.getElementById('makkahZiyaratDate').value = '2026-08-18';

    document.getElementById('madinahZiyaratSelect').value = 'Yes';
    if (madinahZiyaratDatePicker) madinahZiyaratDatePicker.setDate('2026-08-25');
    else document.getElementById('madinahZiyaratDate').value = '2026-08-25';

    // Transport sample
    if (transportDatePicker) transportDatePicker.setDate('2026-08-16');
    else document.getElementById('transportDate').value = '2026-08-16';
    document.getElementById('transporterName').value = 'Al-Saptco Transport Co.';
    document.getElementById('vehicleType').value = 'Private GMC / Yukon (4x4)';
    if (document.getElementById('transportRouteNo')) document.getElementById('transportRouteNo').value = 'TRP-VOUCHER-9042';
    document.getElementById('transportRoute').value = 'Jeddah Apt -> Makkah Hotel -> Madinah Hotel -> Medina Apt';

    // Flight sample
    document.getElementById('depAirline').value = 'Saudi Arabian Airlines (SV)';
    document.getElementById('depFlightNo').value = 'SV-739';
    if (depDatePicker) depDatePicker.setDate('2026-08-16');
    else document.getElementById('depDate').value = '2026-08-16';
    if (depTimePicker) depTimePicker.setDate('04:30 AM');
    else document.getElementById('depTime').value = '04:30 AM';
    document.getElementById('depRoute').value = 'LHE -> JED';

    document.getElementById('retAirline').value = 'Saudi Arabian Airlines (SV)';
    document.getElementById('retFlightNo').value = 'SV-738';
    if (retDatePicker) retDatePicker.setDate('2026-08-30');
    else document.getElementById('retDate').value = '2026-08-30';
    if (retTimePicker) retTimePicker.setDate('06:15 PM');
    else document.getElementById('retTime').value = '06:15 PM';
    document.getElementById('retRoute').value = 'MED -> LHE';

    // Helplines sample
    document.getElementById('makkahHelplineInput').value = '+966 54 111 2233';
    document.getElementById('medinaHelplineInput').value = '+966 54 444 5566';
    document.getElementById('transportHelplineInput').value = '+966 56 777 8899';

    // Terms sample
    document.getElementById('termsUrduInput').value = `1- تمام حجاج کرام ہوٹل کے چیک ان کے اوقات (04:00 PM) کی پابندی کریں۔
2- کسی بھی ایمرجنسی کی صورت میں فراہم کردہ ہیلپ لائنز پر فوری رابطہ کریں۔
3- پاسپورٹ اور ویزا کی نقل سفر کے دوران ساتھ رکھیں۔`;

    document.getElementById('termsEnglishInput').value = `1- Standard Check-In time is 04:00 PM and Check-Out time is 12:00 PM.
2- Transport will depart strictly as per schedule. Delayed passengers must arrange their own transit.
3- Keep your passport copy and Umrah Visa printout with you at all times in KSA.`;

    showToast('Sample Umrah voucher data populated!', 'success');
  } catch (err) {
    console.error("Error populating sample data:", err);
    showToast('Error populating sample data', 'error');
  }
}

// --- RESET FORM ---
function resetVoucherForm(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  try {
    const form = document.getElementById('voucherForm');
    if (form) form.reset();
    generateNewRefId();
    const today = new Date().toISOString().split('T')[0];
    
    if (voucherDatePicker) voucherDatePicker.setDate(today);
    else document.getElementById('voucherDate').value = today;
    if (transportDatePicker) transportDatePicker.setDate(today);
    else document.getElementById('transportDate').value = today;

    document.getElementById('adultsCount').value = 1;
    document.getElementById('childrenCount').value = 0;
    document.getElementById('infantsCount').value = 0;
    updateTotalPaxDisplay();

    const mofaToggle = document.getElementById('includeMofaToggle');
    if (mofaToggle) {
      mofaToggle.checked = false;
      toggleMofaFields();
    }

    if (depDatePicker) depDatePicker.setDate('2026-08-16');
    if (depTimePicker) depTimePicker.setDate('04:30 AM');
    if (retDatePicker) retDatePicker.setDate('2026-08-30');
    if (retTimePicker) retTimePicker.setDate('06:15 PM');

    document.getElementById('makkahZiyaratSelect').value = 'No';
    if (makkahZiyaratDatePicker) makkahZiyaratDatePicker.clear();
    else document.getElementById('makkahZiyaratDate').value = '';

    document.getElementById('madinahZiyaratSelect').value = 'No';
    if (madinahZiyaratDatePicker) madinahZiyaratDatePicker.clear();
    else document.getElementById('madinahZiyaratDate').value = '';

    const pBody = document.getElementById('passengerTableBody');
    const hBody = document.getElementById('hotelTableBody');
    if (pBody) pBody.innerHTML = '';
    if (hBody) hBody.innerHTML = '';
    addPassengerRow();
    addHotelRow();

    showToast('Form reset to default state', 'info');
  } catch (err) {
    console.error("Error resetting form:", err);
  }
}

// --- GATHER FORM DATA ---
function getVoucherFormData() {
  const getVal = (id, def = '') => {
    const el = document.getElementById(id);
    return el ? (el.value || def) : def;
  };

  const refId = getVal('voucherRefId', 'UMR-2026-9999');
  const voucherDate = voucherDatePicker ? voucherDatePicker.input.value : getVal('voucherDate', new Date().toISOString().split('T')[0]);
  const packageSelect = getVal('packageNameSelect', '15-Days Executive Umrah Package');
  const packageCustom = getVal('packageNameCustom', '');
  const packageName = packageSelect === 'CUSTOM' ? (packageCustom || 'Custom Package') : packageSelect;

  const familyHead = getVal('familyHeadName', 'Guest Family');
  const adultsCount = parseInt(getVal('adultsCount', '1'), 10) || 0;
  const childrenCount = parseInt(getVal('childrenCount', '0'), 10) || 0;
  const infantsCount = parseInt(getVal('infantsCount', '0'), 10) || 0;
  const totalPax = adultsCount + childrenCount + infantsCount;

  // Gather Passengers
  const passengerRows = document.querySelectorAll('#passengerTableBody tr');
  const passengers = [];
  passengerRows.forEach(tr => {
    const inputs = tr.querySelectorAll('input, select');
    if (inputs.length >= 9) {
      passengers.push({
        passportNo: inputs[0].value || '',
        name: inputs[1].value || '',
        gender: inputs[2].value || 'Male',
        type: inputs[3].value || 'Adult',
        bed: inputs[4].value || 'Double',
        mofaNo: inputs[5].value || '',
        groupNo: inputs[6].value || '',
        visaNo: inputs[7].value || '',
        pnr: inputs[8].value || ''
      });
    }
  });

  // Gather Hotels
  const hotelRows = document.querySelectorAll('#hotelTableBody tr');
  const hotels = [];
  hotelRows.forEach(tr => {
    const selects = tr.querySelectorAll('select');
    const inputs = tr.querySelectorAll('input');
    const nightsCell = tr.querySelector('.nights-cell');

    if (selects.length >= 3 && inputs.length >= 2) {
      const totalNights = parseInt(nightsCell ? nightsCell.innerText : '0', 10) || 0;
      hotels.push({
        city: selects[0].value || 'Makkah',
        hotelName: inputs[0].value || '',
        roomType: selects[1].value || 'Double Room',
        mealPlan: selects[2].value || 'Bed & Breakfast',
        checkIn: inputs[1].value || '',
        checkOut: inputs[2].value || '',
        totalNights: totalNights
      });
    }
  });

  // Transport
  const transport = {
    date: transportDatePicker ? transportDatePicker.input.value : getVal('transportDate', ''),
    transporter: getVal('transporterName', ''),
    vehicleType: getVal('vehicleType', ''),
    routeNo: getVal('transportRouteNo', ''),
    route: getVal('transportRoute', '')
  };

  // Flight
  const depDateVal = depDatePicker ? depDatePicker.input.value : getVal('depDate', '');
  const depTimeVal = depTimePicker ? depTimePicker.input.value : getVal('depTime', '');
  const retDateVal = retDatePicker ? retDatePicker.input.value : getVal('retDate', '');
  const retTimeVal = retTimePicker ? retTimePicker.input.value : getVal('retTime', '');

  const flight = {
    departureAirline: getVal('depAirline', ''),
    departureFlightNo: getVal('depFlightNo', ''),
    departureDate: depDateVal,
    departureTime: depTimeVal,
    departureRoute: getVal('depRoute', ''),
    returnAirline: getVal('retAirline', ''),
    returnFlightNo: getVal('retFlightNo', ''),
    returnDate: retDateVal,
    returnTime: retTimeVal,
    returnRoute: getVal('retRoute', '')
  };

  // Helplines
  const helplines = {
    makkah: getVal('makkahHelplineInput') || currentAgencySettings.makkahHelpline || '',
    medina: getVal('medinaHelplineInput') || currentAgencySettings.medinaHelpline || '',
    transport: getVal('transportHelplineInput') || currentAgencySettings.transportHelpline || ''
  };

  // Ziyarat
  const ziyarat = {
    makkahIncluded: getVal('makkahZiyaratSelect', 'No'),
    makkahDate: makkahZiyaratDatePicker ? makkahZiyaratDatePicker.input.value : getVal('makkahZiyaratDate', ''),
    madinahIncluded: getVal('madinahZiyaratSelect', 'No'),
    madinahDate: madinahZiyaratDatePicker ? madinahZiyaratDatePicker.input.value : getVal('madinahZiyaratDate', '')
  };

  const termsUrdu = getVal('termsUrduInput', '');
  const termsEnglish = getVal('termsEnglishInput', '');

  const showMofaDetails = document.getElementById('includeMofaToggle') ? document.getElementById('includeMofaToggle').checked : false;

  return {
    id: refId,
    voucherDate,
    packageName,
    familyHead,
    adultsCount,
    childrenCount,
    infantsCount,
    totalPax,
    showMofaDetails,
    passengers: passengers || [],
    hotels: hotels || [],
    transport: transport || {},
    flight: flight || {},
    ziyarat: ziyarat || {},
    helplines: helplines || {},
    termsUrdu: termsUrdu || '',
    termsEnglish: termsEnglish || ''
  };
}

// --- LIVE PREVIEW MODAL ---
async function openLivePreviewModal(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  try {
    const formData = getVoucherFormData();
    const modal = document.getElementById('pdfPreviewModal');
    const templateContainer = document.getElementById('voucher-preview-container') || document.getElementById('a4VoucherTemplate');

    if (!modal || !templateContainer) return;

    templateContainer.innerHTML = '<div class="p-12 text-center text-slate-500 font-bold"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2 text-emerald-700"></i><p>Compiling A4 Voucher Preview & Generating QR Code...</p></div>';
    modal.classList.remove('hidden');

    const renderedHtml = await renderA4VoucherHTML(formData, currentAgencySettings);
    templateContainer.innerHTML = renderedHtml;
  } catch (err) {
    console.error("Error opening preview modal:", err);
    showToast('Failed to load PDF preview', 'error');
  }
}

function closeLivePreviewModal() {
  const modal = document.getElementById('pdfPreviewModal');
  if (modal) modal.classList.add('hidden');
}

// --- CLIENT-SIDE / SERVER PDF DOWNLOAD ENGINE ---
async function downloadPreviewPDF(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  const formData = getVoucherFormData();
  const filename = `Voucher_${formData.id}_${(formData.familyHead || 'Guest').replace(/\s+/g, '_')}.pdf`;
  
  showToast('Generating 1-Page A4 PDF via Puppeteer engine...', 'info');

  const session = localStorage.getItem('tvg_session');
  const user = session ? JSON.parse(session) : null;
  const userRole = user ? user.role : 'staff_pending';
  const userEmail = user ? user.email : 'unknown';

  try {
    const response = await fetch('/api/generate-pdf', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-role': userRole,
        'x-user-email': userEmail
      },
      body: JSON.stringify({ voucherData: formData, filename })
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
      showToast('1-Page A4 PDF downloaded via Puppeteer!', 'success');
      return;
    }
  } catch (err) {
    console.warn("Puppeteer server download failed, trying client fallback: ", err);
  }

  // Client html2pdf fallback
  try {
    // Create a temporary off-screen container for rendering
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '-9999px';
    tempContainer.style.width = '794px'; // standard A4 width representation
    document.body.appendChild(tempContainer);

    const renderedHtml = await renderA4VoucherHTML(formData, currentAgencySettings);
    tempContainer.innerHTML = renderedHtml;

    // Pass the actual rendered layout element to html2pdf
    const elementToPrint = tempContainer.firstElementChild || tempContainer;

    const opt = {
      margin:       [5, 5, 5, 5],
      filename:     filename,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    await html2pdf().set(opt).from(elementToPrint).save();
    document.body.removeChild(tempContainer);
    showToast('1-Page A4 PDF downloaded successfully!', 'success');
  } catch (err) {
    console.error("PDF download failed: ", err);
    showToast('Failed to generate PDF download', 'error');
  }
}

function printVoucherDirect() {
  window.print();
}

async function generateAndSaveVoucher(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  const btn = (e && (e.currentTarget || e.target)) || document.getElementById('saveVoucherBtn');
  if (btn) btn.disabled = true;

  try {
    const formData = getVoucherFormData();

    if (!formData.familyHead) {
      showToast('Please enter Family Head Name', 'error');
      return;
    }

    showToast('Saving voucher & generating PDF...', 'info');

    const session = localStorage.getItem('tvg_session');
    const user = session ? JSON.parse(session) : null;
    const userRole = user ? user.role : 'staff_pending';
    const userEmail = user ? user.email : 'unknown';

    const response = await fetch('/api/vouchers', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-role': userRole,
        'x-user-email': userEmail
      },
      body: JSON.stringify(formData)
    });

    if (!response.ok) {
      let errMsg = `Save failed with status ${response.status}`;
      try {
        const resultErr = await response.json();
        if (resultErr && resultErr.message) errMsg = resultErr.message;
      } catch (_) {}
      throw new Error(errMsg);
    }

    const result = await response.json();
    showToast('Voucher record saved successfully!', 'success');
    await fetchSavedVouchers();
    await downloadPreviewPDF(e);
  } catch (err) {
    console.error("Error saving voucher:", err);
    showToast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// LocalStorage Fallback
function saveVoucherToLocalStorage(voucher) {
  let localVouchers = safeGetLocalStorage('tvg_vouchers', []);
  const idx = localVouchers.findIndex(v => v.id === voucher.id);
  if (idx >= 0) localVouchers[idx] = voucher;
  else localVouchers.unshift(voucher);
  localStorage.setItem('tvg_vouchers', JSON.stringify(localVouchers));
}

// --- AGENCY SETTINGS PERSISTENCE ---
async function fetchAgencySettings() {
  const localSettings = safeGetLocalStorage('tvg_agency_settings', {});
  if (localSettings && (localSettings.agencyName || localSettings.logo)) {
    currentAgencySettings = localSettings;
  }

  try {
    const res = await fetch('/api/settings');
    const result = await res.json();
    if (result.success && (result.settings || result.data)) {
      const serverSettings = result.settings || result.data;
      currentAgencySettings = { ...currentAgencySettings, ...serverSettings };
      localStorage.setItem('tvg_agency_settings', JSON.stringify(currentAgencySettings));
    }
  } catch (err) {
    console.warn("Failed to fetch settings from server, using LocalStorage fallback: ", err);
  }

  populateAgencySettingsForm(currentAgencySettings);
  updateHeaderBranding(currentAgencySettings);
}

function populateAgencySettingsForm(settings) {
  if (!settings) return;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  setVal('settingAgencyName', settings.agencyName || 'Al-Haramain Global Travel & Umrah Services');
  setVal('settingTagline', settings.tagline || 'Your Trusted Partner for Hajj & Umrah Pilgrimage');
  setVal('settingLicenseNo', settings.licenseNo || 'IATA-9620481 / DTS-4492');
  setVal('settingPhone1', settings.phone1 || '+92 300 1234567');
  setVal('settingPhone2', settings.phone2 || '+966 50 9876543');
  setVal('settingEmail', settings.email || 'info@alharamaintravel.com');
  setVal('settingWebsite', settings.website || 'www.alharamaintravel.com');
  setVal('settingAddress', settings.address || 'Suite #402, Al-Madina Tower, Main Boulevard, Lahore, Pakistan');

  if (settings.makkahHelpline) setVal('makkahHelplineInput', settings.makkahHelpline);
  if (settings.medinaHelpline) setVal('medinaHelplineInput', settings.medinaHelpline);
  if (settings.transportHelpline) setVal('transportHelplineInput', settings.transportHelpline);

  if (settings.logo) {
    currentUploadedLogoBase64 = settings.logo;
    renderLogoPreviewInSettings(settings.logo);
  }
}

function updateHeaderBranding(settings) {
  if (!settings) return;
  const nameEl = document.getElementById('headerAgencyName');
  const tagEl = document.getElementById('headerAgencyTagline');

  if (nameEl && settings.agencyName) nameEl.innerText = settings.agencyName;
  if (tagEl && settings.tagline) tagEl.innerText = settings.tagline;

  const logoImg = document.getElementById('headerAgencyLogo');
  const fallbackIcon = document.getElementById('headerFallbackIcon');

  if (logoImg && fallbackIcon) {
    if (settings.logo && settings.logo.startsWith('data:image')) {
      logoImg.src = settings.logo;
      logoImg.classList.remove('hidden');
      fallbackIcon.classList.add('hidden');
    } else {
      logoImg.classList.add('hidden');
      fallbackIcon.classList.remove('hidden');
    }
  }
}

function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    showToast('Logo file size must be less than 2MB', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    currentUploadedLogoBase64 = e.target.result;
    renderLogoPreviewInSettings(currentUploadedLogoBase64);
  };
  reader.readAsDataURL(file);
}

function renderLogoPreviewInSettings(logoSrc) {
  const container = document.getElementById('settingsLogoPreviewBox');
  if (container) {
    container.innerHTML = `<img src="${logoSrc}" class="max-h-full max-w-full object-contain" alt="Preview">`;
  }
}

async function saveAgencySettings(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  const getVal = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : '';
  };

  const settings = {
    agencyName: getVal('settingAgencyName'),
    tagline: getVal('settingTagline'),
    licenseNo: getVal('settingLicenseNo'),
    phone1: getVal('settingPhone1'),
    phone2: getVal('settingPhone2'),
    email: getVal('settingEmail'),
    website: getVal('settingWebsite'),
    address: getVal('settingAddress'),
    logo: currentUploadedLogoBase64 || currentAgencySettings.logo || '',
    makkahHelpline: getVal('makkahHelplineInput'),
    medinaHelpline: getVal('medinaHelplineInput'),
    transportHelpline: getVal('transportHelplineInput')
  };

  currentAgencySettings = settings;
  localStorage.setItem('tvg_agency_settings', JSON.stringify(settings));

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    const result = await res.json();
    if (result.success) {
      showToast('Agency profile saved permanently!', 'success');
    }
  } catch (err) {
    console.warn("Server save failed, saving settings to LocalStorage: ", err);
    showToast('Agency profile saved to LocalStorage!', 'success');
  }

  updateHeaderBranding(settings);
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
    console.warn("Failed to fetch vouchers from API, using LocalStorage: ", err);
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

  const session = localStorage.getItem('tvg_session');
  const user = session ? JSON.parse(session) : null;
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
          <div class="text-[9px] text-slate-400 font-medium font-normal mt-0.5">Created by: ${formatCreatorName(v.createdBy, v.createdByRole)}</div>
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
  const renderedHtml = await renderA4VoucherHTML(v, currentAgencySettings);
  templateContainer.innerHTML = renderedHtml;
}

function loadVoucherToForm(id) {
  const v = (savedVouchersList || []).find(item => item.id === id);
  if (!v) return;

  document.getElementById('voucherRefId').value = v.id;
  if (voucherDatePicker && v.voucherDate) voucherDatePicker.setDate(v.voucherDate);
  else document.getElementById('voucherDate').value = v.voucherDate || '';
  document.getElementById('familyHeadName').value = v.familyHead || '';
  document.getElementById('adultsCount').value = v.adultsCount || 1;
  document.getElementById('childrenCount').value = v.childrenCount || 0;
  document.getElementById('infantsCount').value = v.infantsCount || 0;
  updateTotalPaxDisplay();

  const mofaToggle = document.getElementById('includeMofaToggle');
  if (mofaToggle) {
    mofaToggle.checked = v.showMofaDetails || false;
    toggleMofaFields();
  }

  const packageSelect = document.getElementById('packageNameSelect');
  const customInput = document.getElementById('packageNameCustom');
  let optionExists = false;
  for (let opt of packageSelect.options) {
    if (opt.value === v.packageName) {
      optionExists = true;
      break;
    }
  }

  if (optionExists) {
    packageSelect.value = v.packageName;
    customInput.classList.add('hidden');
  } else {
    packageSelect.value = 'CUSTOM';
    customInput.value = v.packageName || '';
    customInput.classList.remove('hidden');
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
    else if (v.transport.date) document.getElementById('transportDate').value = v.transport.date;
    if (v.transport.transporter) document.getElementById('transporterName').value = v.transport.transporter;
    if (v.transport.vehicleType) document.getElementById('vehicleType').value = v.transport.vehicleType;
    if (v.transport.routeNo && document.getElementById('transportRouteNo')) document.getElementById('transportRouteNo').value = v.transport.routeNo;
    if (v.transport.route) document.getElementById('transportRoute').value = v.transport.route;
  }

  // Load Flight
  if (v.flight) {
    if (v.flight.departureAirline) document.getElementById('depAirline').value = v.flight.departureAirline;
    if (v.flight.departureFlightNo) document.getElementById('depFlightNo').value = v.flight.departureFlightNo;
    if (v.flight.departureRoute) document.getElementById('depRoute').value = v.flight.departureRoute;
    if (depDatePicker && v.flight.departureDate) depDatePicker.setDate(v.flight.departureDate);
    if (depTimePicker && v.flight.departureTime) depTimePicker.setDate(v.flight.departureTime);
    else if (v.flight.departureTime) document.getElementById('depTime').value = v.flight.departureTime;

    if (v.flight.returnAirline) document.getElementById('retAirline').value = v.flight.returnAirline;
    if (v.flight.returnFlightNo) document.getElementById('retFlightNo').value = v.flight.returnFlightNo;
    if (v.flight.returnRoute) document.getElementById('retRoute').value = v.flight.returnRoute;
    if (retDatePicker && v.flight.returnDate) retDatePicker.setDate(v.flight.returnDate);
    if (retTimePicker && v.flight.returnTime) retTimePicker.setDate(v.flight.returnTime);
    else if (v.flight.returnTime) document.getElementById('retTime').value = v.flight.returnTime;
  }

  // Load Terms & Helplines
  if (v.helplines) {
    if (v.helplines.makkah) document.getElementById('makkahHelplineInput').value = v.helplines.makkah;
    if (v.helplines.medina) document.getElementById('medinaHelplineInput').value = v.helplines.medina;
    if (v.helplines.transport) document.getElementById('transportHelplineInput').value = v.helplines.transport;
  }

  // Load Ziyarat
  if (v.ziyarat) {
    document.getElementById('makkahZiyaratSelect').value = v.ziyarat.makkahIncluded || 'No';
    if (makkahZiyaratDatePicker && v.ziyarat.makkahDate) makkahZiyaratDatePicker.setDate(v.ziyarat.makkahDate);
    else document.getElementById('makkahZiyaratDate').value = v.ziyarat.makkahDate || '';

    document.getElementById('madinahZiyaratSelect').value = v.ziyarat.madinahIncluded || 'No';
    if (madinahZiyaratDatePicker && v.ziyarat.madinahDate) madinahZiyaratDatePicker.setDate(v.ziyarat.madinahDate);
    else document.getElementById('madinahZiyaratDate').value = v.ziyarat.madinahDate || '';
  } else {
    document.getElementById('makkahZiyaratSelect').value = 'No';
    if (makkahZiyaratDatePicker) makkahZiyaratDatePicker.clear();
    else document.getElementById('makkahZiyaratDate').value = '';

    document.getElementById('madinahZiyaratSelect').value = 'No';
    if (madinahZiyaratDatePicker) madinahZiyaratDatePicker.clear();
    else document.getElementById('madinahZiyaratDate').value = '';
  }

  if (v.termsUrdu) document.getElementById('termsUrduInput').value = v.termsUrdu;
  if (v.termsEnglish) document.getElementById('termsEnglishInput').value = v.termsEnglish;

  switchTab('create');
  showToast(`Voucher ${v.id} loaded to form for editing`, 'info');
}

async function deleteSavedVoucher(id) {
  if (!confirm(`Are you sure you want to delete Voucher Ref: ${id}?`)) return;

  const session = localStorage.getItem('tvg_session');
  const user = session ? JSON.parse(session) : null;
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
    console.warn("Backend delete failed, removing from LocalStorage: ", err);
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

// --- SAVED VOUCHERS SIDE-DRAWER FLOWS ---
async function openSavedVouchersDrawer() {
  const drawer = document.getElementById('savedVouchersDrawer');
  const overlay = document.getElementById('drawerOverlay');
  if (!drawer || !overlay) return;

  drawer.classList.remove('hidden');
  overlay.classList.remove('hidden');
  
  // Wait a small frame for transition
  setTimeout(() => {
    drawer.classList.remove('translate-x-full');
  }, 20);

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

  const session = localStorage.getItem('tvg_session');
  const user = session ? JSON.parse(session) : null;
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
          <p class="text-[9px] text-slate-400 font-medium mt-1">Created by: ${formatCreatorName(v.createdBy, v.createdByRole)}</p>
        </div>
        <div class="flex items-center justify-between border-t border-slate-100 pt-2 text-[10px]">
          <span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded font-black">${v.totalPax || 1} PAX</span>
          <div class="flex space-x-1">
            ${approveButton}
            <button type="button" onclick="loadVoucherToFormFromDrawer('${v.id}')" title="Load into Form" class="px-2 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-bold rounded flex items-center space-x-1">
              <i class="fa-solid fa-pen-to-square"></i>
              <span>Edit</span>
            </button>
            <button type="button" onclick="reDownloadVoucherPDF('${v.id}')" title="Re-Download PDF" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold rounded flex items-center space-x-1">
              <i class="fa-solid fa-download"></i>
              <span>PDF</span>
            </button>
            <button type="button" onclick="deleteVoucherFromDrawer('${v.id}')" title="Delete" class="px-2 py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold rounded flex items-center space-x-1">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterDrawerVouchers() {
  const input = document.getElementById('drawerSearchInput');
  if (!input) return;
  const query = input.value.toLowerCase().trim();
  const filtered = (savedVouchersList || []).filter(v => 
    (v.id && v.id.toLowerCase().includes(query)) ||
    (v.familyHead && v.familyHead.toLowerCase().includes(query)) ||
    (v.packageName && v.packageName.toLowerCase().includes(query)) ||
    (v.voucherDate && v.voucherDate.toLowerCase().includes(query))
  );
  renderDrawerVouchers(filtered);
}

function loadVoucherToFormFromDrawer(id) {
  loadVoucherToForm(id);
  closeSavedVouchersDrawer();
}

async function reDownloadVoucherPDF(id) {
  const v = (savedVouchersList || []).find(item => item.id === id);
  if (!v) return;
  const filename = `Voucher_${v.id}_${(v.familyHead || 'Guest').replace(/\s+/g, '_')}.pdf`;
  showToast('Generating A4 PDF via Puppeteer...', 'info');

  const session = localStorage.getItem('tvg_session');
  const user = session ? JSON.parse(session) : null;
  const userRole = user ? user.role : 'staff_pending';
  const userEmail = user ? user.email : 'unknown';

  try {
    const response = await fetch('/api/generate-pdf', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-role': userRole,
        'x-user-email': userEmail
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
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to download PDF', 'error');
  }
}

async function deleteVoucherFromDrawer(id) {
  if (!confirm(`Are you sure you want to delete Voucher Ref: ${id}?`)) return;

  const session = localStorage.getItem('tvg_session');
  const user = session ? JSON.parse(session) : null;
  const userRole = user ? user.role : 'staff_pending';

  try {
    const res = await fetch(`/api/vouchers/${id}`, { 
      method: 'DELETE',
      headers: {
        'x-user-role': userRole
      }
    });
    const result = await res.json();
    if (result.success) {
      showToast(`Voucher ${id} deleted`, 'info');
      await fetchSavedVouchers();
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to delete voucher', 'error');
  }
}

async function approveVoucher(id) {
  const session = localStorage.getItem('tvg_session');
  if (!session) return;
  const user = JSON.parse(session);

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
      
      // Refresh list
      await fetchSavedVouchers();
      
      // Automatically download the updated PDF
      await reDownloadVoucherPDF(id);
    } else {
      showToast(result.message || 'Failed to approve voucher', 'error');
    }
  } catch (err) {
    console.error("Approval Error:", err);
    showToast('Failed to approve voucher due to connection error', 'error');
  }
}

async function approveVoucherFromDrawer(id) {
  await approveVoucher(id);
}

// --- AUTHENTICATION & ACCESS CONTROL (RBAC) ---
function checkAuth() {
  const session = localStorage.getItem('tvg_session');
  const appContainer = document.getElementById('appContainer');
  const loginContainer = document.getElementById('loginContainer');

  if (!session) {
    if (appContainer) appContainer.classList.add('hidden');
    if (loginContainer) loginContainer.classList.remove('hidden');
    if (window.location.pathname !== '/login') {
      window.history.pushState(null, '', '/login');
    }
  } else {
    const user = JSON.parse(session);
    if (appContainer) appContainer.classList.remove('hidden');
    if (loginContainer) loginContainer.classList.add('hidden');

    // Populate topbar details
    const emailEl = document.getElementById('userProfileEmail');
    const roleEl = document.getElementById('userProfileRole');
    const profileMenu = document.getElementById('userProfileMenu');
    if (emailEl) emailEl.innerText = user.email;
    if (roleEl) roleEl.innerText = user.role;
    if (profileMenu) profileMenu.classList.remove('hidden');

    // Admin-only permissions
    const settingsTabBtn = document.getElementById('navSettingsTab');
    const manageUsersCard = document.getElementById('manageUsersCard');
    if (user.role === 'admin') {
      if (settingsTabBtn) settingsTabBtn.classList.remove('hidden');
      if (manageUsersCard) manageUsersCard.classList.remove('hidden');
    } else {
      if (settingsTabBtn) settingsTabBtn.classList.add('hidden');
      if (manageUsersCard) manageUsersCard.classList.add('hidden');
      // Redirect if staff tries to view settings
      const activeNavTab = document.getElementById('navSettingsTab');
      if (activeNavTab && activeNavTab.classList.contains('bg-emerald-600')) {
        switchTab('create');
      }
    }

    if (window.location.pathname === '/login') {
      window.history.pushState(null, '', '/');
    }
  }
}

async function handleLogin() {
  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  if (!emailInput || !passwordInput) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  showToast('Signing in...', 'info');

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const result = await response.json();
    if (result.success && result.user) {
      localStorage.setItem('tvg_session', JSON.stringify(result.user));
      showToast('Signed in successfully!', 'success');
      
      // Clear login inputs
      emailInput.value = '';
      passwordInput.value = '';

      // Run auth routing
      checkAuth();
      
      // Load backend dashboard resources
      await initDashboard();
    } else {
      showToast(result.message || 'Invalid email or password', 'error');
    }
  } catch (err) {
    console.error("Login Error:", err);
    showToast('Login connection failed', 'error');
  }
}

function handleLogout() {
  localStorage.removeItem('tvg_session');
  showToast('Logged out successfully', 'info');
  
  // Clear user profile menu display
  const emailEl = document.getElementById('userProfileEmail');
  const roleEl = document.getElementById('userProfileRole');
  const profileMenu = document.getElementById('userProfileMenu');
  if (emailEl) emailEl.innerText = '';
  if (roleEl) roleEl.innerText = '';
  if (profileMenu) profileMenu.classList.add('hidden');

  // Perform full form reset on logout
  resetVoucherForm();

  // Run auth check to display login page
  checkAuth();
}

// --- ADMIN USER MANAGEMENT CRUD ---
async function fetchSystemUsers() {
  const session = localStorage.getItem('tvg_session');
  if (!session) return;
  const user = JSON.parse(session);
  if (user.role !== 'admin') return;

  try {
    const response = await fetch('/api/auth/users', {
      headers: {
        'x-user-role': user.role
      }
    });
    const result = await response.json();
    if (result.success && Array.isArray(result.users)) {
      renderSystemUsers(result.users);
    }
  } catch (err) {
    console.error("Fetch Users Error:", err);
    showToast('Failed to load user accounts', 'error');
  }
}

function renderSystemUsers(users) {
  const tableBody = document.getElementById('userTableBody');
  if (!tableBody) return;

  if (users.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="text-center py-6 text-slate-400">
          No system user accounts found.
        </td>
      </tr>`;
    return;
  }

  tableBody.innerHTML = users.map(u => {
    let badgeColor = 'bg-blue-100 text-blue-800';
    if (u.role === 'admin') badgeColor = 'bg-amber-100 text-amber-800';
    else if (u.role === 'staff_approved') badgeColor = 'bg-emerald-100 text-emerald-800';
    else if (u.role === 'staff_pending') badgeColor = 'bg-rose-100 text-rose-800';

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="py-3 px-3 font-semibold text-slate-800">${u.email}</td>
        <td class="py-3 px-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${badgeColor}">
            ${u.role}
          </span>
        </td>
        <td class="py-3 px-3 text-center">
          <button type="button" onclick="handleDeleteUser('${u.id}')" class="text-red-500 hover:text-red-700 p-1 font-bold">
            <i class="fa-solid fa-user-minus"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function handleAddUser() {
  const session = localStorage.getItem('tvg_session');
  if (!session) return;
  const user = JSON.parse(session);
  if (user.role !== 'admin') return;

  const emailInput = document.getElementById('newUserEmail');
  const passwordInput = document.getElementById('newUserPassword');
  const roleSelect = document.getElementById('newUserRole');
  if (!emailInput || !passwordInput || !roleSelect) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const role = roleSelect.value;

  if (password.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return;
  }

  showToast('Creating user account...', 'info');

  try {
    const response = await fetch('/api/auth/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user.role
      },
      body: JSON.stringify({ email, password, role })
    });

    const result = await response.json();
    if (result.success) {
      showToast('User account created successfully!', 'success');
      emailInput.value = '';
      passwordInput.value = '';
      roleSelect.value = 'staff_approved';
      await fetchSystemUsers();
    } else {
      showToast(result.message || 'Failed to create user', 'error');
    }
  } catch (err) {
    console.error("Create User Error:", err);
    showToast('Failed to connect to create user api', 'error');
  }
}

async function handleDeleteUser(id) {
  const session = localStorage.getItem('tvg_session');
  if (!session) return;
  const user = JSON.parse(session);
  if (user.role !== 'admin') return;

  if (!confirm('Are you sure you want to delete this user account?')) return;

  showToast('Deleting account...', 'info');

  try {
    const response = await fetch(`/api/auth/users/${id}`, {
      method: 'DELETE',
      headers: {
        'x-user-role': user.role
      }
    });

    const result = await response.json();
    if (result.success) {
      showToast('User account deleted successfully', 'success');
      await fetchSystemUsers();
    } else {
      showToast(result.message || 'Failed to delete user', 'error');
    }
  } catch (err) {
    console.error("Delete User Error:", err);
    showToast('Failed to connect to delete user api', 'error');
  }
}
