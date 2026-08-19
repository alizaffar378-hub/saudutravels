/**
 * PDF Generator & A4 Printable Voucher Rendering Engine
 */

// Generate QR Code Data URL asynchronously
async function generateQRCodeDataUrl(text) {
  try {
    const response = await fetch('/api/generate-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const result = await response.json();
    if (result.success) {
      return result.qrDataUrl;
    }
  } catch (e) {
    console.warn("Server QR code API failed, using fallback script: ", e);
  }

  // Fallback client side QR generation
  return new Promise((resolve) => {
    const tempDiv = document.createElement('div');
    tempDiv.style.display = 'none';
    document.body.appendChild(tempDiv);
    
    new QRCode(tempDiv, {
      text: text,
      width: 150,
      height: 150,
      colorDark: "#047857",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });

    setTimeout(() => {
      const img = tempDiv.querySelector('img');
      const canvas = tempDiv.querySelector('canvas');
      let dataUrl = '';
      if (img && img.src) dataUrl = img.src;
      else if (canvas) dataUrl = canvas.toDataURL('image/png');
      document.body.removeChild(tempDiv);
      resolve(dataUrl);
    }, 150);
  });
}

// Helper function to format DateTime nicely for PDF output (e.g. 16-Aug-2026, 04:30 AM)
function formatDateTimeForPDF(str) {
  if (!str) return '-';
  const cleanStr = str.replace('T', ' ');
  const parts = cleanStr.split(' ');
  if (parts.length >= 2 && parts[0].includes('-')) {
    const [year, month, day] = parts[0].split('-');
    const [hrs, mins] = parts[1].split(':');
    if (year && month && day && hrs !== undefined && mins !== undefined) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const mIdx = parseInt(month, 10) - 1;
      const mStr = monthNames[mIdx] || month;
      let h = parseInt(hrs, 10);
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      if (h === 0) h = 12;
      return `${day}-${mStr}-${year}, ${h.toString().padStart(2, '0')}:${mins} ${ampm}`;
    }
  }
  return str;
}

// Helper function to format Date in DD/MM/YYYY format (e.g. 16/08/2026)
function formatDateToDMY(str) {
  if (!str) return '-';
  const datePart = str.split(/[ T]/)[0];
  const parts = datePart.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  if (str.includes('/')) return str;
}

function formatCreatorName(email, role) {
  if (!email || email === 'unknown') return 'System';

  const parts = (role || '').split(':');
  const baseRole = parts[0];
  const fullName = parts[1] || '';

  let roleDisplay = '';
  if (baseRole === 'admin') roleDisplay = 'Admin';
  else if (baseRole === 'staff_approved') roleDisplay = 'Staff - Approved';
  else if (baseRole === 'staff_pending') roleDisplay = 'Staff - Pending';

  if (fullName) {
    return `${fullName} (${roleDisplay || baseRole})`;
  }

  let username = email.split('@')[0];
  username = username.charAt(0).toUpperCase() + username.slice(1);
  
  return `${username} (${roleDisplay || baseRole || role})`;
}

// Main function to render A4 Voucher Template
async function renderA4VoucherHTML(data, agencySettings) {
  const voucher_ref = data.voucherRef || data.id || '';
  const baseUrl = (typeof window !== 'undefined' && window.location && window.location.origin)
    || (typeof process !== 'undefined' && process.env && process.env.PUBLIC_APP_URL)
    || 'https://saudipak-vouchers.vercel.app';
  const verifyUrl = `${baseUrl}/verify?voucher=${voucher_ref}`;
  const qrDataUrl = await generateQRCodeDataUrl(verifyUrl);

  // Agency logo HTML
  let letterheadLogoHtml = '';
  if (agencySettings.logo && agencySettings.logo.startsWith('data:image')) {
    letterheadLogoHtml = `<img src="${agencySettings.logo}" class="max-h-20 max-w-[200px] object-contain mb-1" alt="Logo">`;
  } else {
    letterheadLogoHtml = `<i class="fa-solid fa-kaaba text-emerald-800 text-5xl mb-1"></i>`;
  }

  // 1. Passenger Basic Details Table Rows
  const passBasicRowsHtml = (data.passengers || []).map((p, idx) => `
    <tr class="${idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'} border-b border-slate-200">
      <td data-label="Sr." class="text-center font-bold py-1.5 px-2 text-slate-900 text-[10px]">${idx + 1}</td>
      <td data-label="Passport No" class="font-bold py-1.5 px-2 text-slate-900 text-[10px]">${p.passportNo || '-'}</td>
      <td data-label="Passenger Name" class="font-extrabold py-1.5 px-2 text-emerald-900 text-[10.5px] truncate">${p.name || '-'}</td>
      <td data-label="Gender" class="text-center font-semibold py-1.5 px-1 text-slate-900 text-[10px]">${p.gender || '-'}</td>
      <td data-label="Type" class="text-center py-1.5 px-1"><span class="px-1.5 py-0.5 bg-sky-100 text-sky-800 rounded text-[9.5px] font-extrabold">${p.type || '-'}</span></td>
    </tr>
  `).join('');

  // 2. Visa & MOFA Details Table Rows
  const passVisaRowsHtml = (data.passengers || []).map((p, idx) => `
    <tr class="${idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'} border-b border-slate-200">
      <td data-label="Sr." class="text-center font-bold py-1.5 px-2 text-slate-900 text-[10px]">${idx + 1}</td>
      <td data-label="Passenger Name" class="font-extrabold py-1.5 px-2 text-slate-900 text-[10px] truncate">${p.name || '-'}</td>
      <td data-label="MOFA No" class="font-bold py-1.5 px-2 text-slate-900 text-[10px]">${p.mofaNo || '-'}</td>
      <td data-label="Group No" class="font-bold py-1.5 px-2 text-slate-900 text-[10px]">${p.groupNo || '-'}</td>
      <td data-label="Visa No" class="font-bold py-1.5 px-2 text-slate-900 text-[10px]">${p.visaNo || '-'}</td>
      <td data-label="PNR" class="font-mono font-extrabold py-1.5 px-2 text-emerald-800 text-[10.5px]">${p.pnr || '-'}</td>
    </tr>
  `).join('');

  // 3. Hotel Rows
  const hotelRowsHtml = (data.hotels || []).map((h, idx) => `
    <tr class="${idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'} border-b border-slate-200 text-[10px]">
      <td data-label="City" class="font-extrabold py-1.5 px-2 text-emerald-900">${h.city || '-'}</td>
      <td data-label="Hotel Name" class="font-extrabold py-1.5 px-2 text-slate-900 truncate">${h.hotelName || '-'}</td>
      <td data-label="Room Type" class="font-bold py-1.5 px-2 text-slate-800">${h.roomType || '-'}</td>
      <td data-label="Meal Plan" class="font-bold py-1.5 px-2 text-slate-800">${h.mealPlan || '-'}</td>
      <td data-label="Check In" class="font-bold py-1.5 px-2 text-slate-900">${formatDateToDMY(h.checkIn)}</td>
      <td data-label="Check Out" class="font-bold py-1.5 px-2 text-slate-900">${formatDateToDMY(h.checkOut)}</td>
      <td data-label="Bed" class="text-center font-semibold py-1.5 px-2 text-slate-900">${h.bed || '-'}</td>
      <td data-label="Nights" class="text-center font-black py-1.5 px-2 text-emerald-800 bg-emerald-50">${h.totalNights || 0} Nts</td>
    </tr>
  `).join('');

  // Dual Terms HTML
  const termsUrduLines = (data.termsUrdu || '').split('\n').filter(l => l.trim()).map(l => `<li class="mb-0.5">${l}</li>`).join('');
  const termsEngLines = (data.termsEnglish || '').split('\n').filter(l => l.trim()).map(l => `<li class="mb-0.5">${l}</li>`).join('');

  const showMakkah = data.ziyarat && data.ziyarat.makkahIncluded === 'Yes';
  const showMadinah = data.ziyarat && data.ziyarat.madinahIncluded === 'Yes';
  const showZiyaratSection = data.showZiyaratDetails && (showMakkah || showMadinah);

  let ziyaratRowsHtml = '';
  if (showMakkah) {
    ziyaratRowsHtml += `
      <tr class="bg-white border-b border-slate-200">
        <td data-label="City" class="font-black text-emerald-800 py-1.5 px-2">Makkah</td>
        <td data-label="Ziyarat Included" class="font-bold text-slate-900 py-1.5 px-2">Yes</td>
        <td data-label="Date" class="font-bold text-slate-900 py-1.5 px-2">${formatDateToDMY(data.ziyarat.makkahDate)}</td>
      </tr>
    `;
  }
  if (showMadinah) {
    ziyaratRowsHtml += `
      <tr class="${showMakkah ? 'bg-slate-50' : 'bg-white'} border-b border-slate-200">
        <td data-label="City" class="font-black text-emerald-800 py-1.5 px-2">Madinah</td>
        <td data-label="Ziyarat Included" class="font-bold text-slate-900 py-1.5 px-2">Yes</td>
        <td data-label="Date" class="font-bold text-slate-900 py-1.5 px-2">${formatDateToDMY(data.ziyarat.madinahDate)}</td>
      </tr>
    `;
  }

  let calculatedPackageDays = 0;
  if (data.flight && data.flight.departureDate && data.flight.returnDate) {
    const depDate = new Date(data.flight.departureDate);
    const retDate = new Date(data.flight.returnDate);
    if (!isNaN(depDate) && !isNaN(retDate)) {
      const timeDiff = retDate - depDate;
      calculatedPackageDays = Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24))) + 1;
    }
  }

  const status = data.status || 'NOT APPROVED';
  return `
    <style>
      .watermark-stamp {
        position: absolute !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) rotate(-30deg) !important;
        width: 80% !important;
        max-width: 500px !important;
        text-align: center !important;
        pointer-events: none !important;
        user-select: none !important;
        z-index: 0 !important;
        opacity: 0.08 !important;
        border: 8px double currentColor !important;
        padding: 15px 30px !important;
        border-radius: 12px !important;
        box-sizing: border-box !important;
        display: inline-block !important;
        object-fit: contain !important;
      }
      .watermark-stamp > div {
        font-family: 'Impact', 'Arial Black', 'Arial', sans-serif !important;
        font-size: 55pt !important;
        font-weight: 950 !important;
        letter-spacing: 5px !important;
        white-space: nowrap !important;
        line-height: 1.1 !important;
        text-transform: uppercase !important;
        display: inline-block !important;
        max-width: 100% !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        object-fit: contain !important;
      }
      
      @media (max-width: 767px) {
        .pdf-container, .voucher-wrapper, .voucher-root-container {
          padding: 10px !important;
          border-radius: 8px !important;
          box-shadow: none !important;
          border: none !important;
        }
        table, thead, tbody, th, td, tr {
          display: block !important;
          width: 100% !important;
        }
        thead {
          display: none !important;
        }
        tr {
          margin-bottom: 10px !important;
          border: 1px solid #cbd5e1 !important;
          border-radius: 6px !important;
          background-color: #ffffff !important;
          padding: 6px !important;
          overflow: hidden !important;
          box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05) !important;
        }
        tr:nth-child(even) {
          background-color: #f8fafc !important;
        }
        td {
          border: none !important;
          border-bottom: 1px solid #f1f5f9 !important;
          position: relative !important;
          padding: 6px 8px 6px 45% !important;
          text-align: right !important;
          font-size: 10px !important;
          display: flex !important;
          justify-content: flex-end !important;
          align-items: center !important;
          min-height: 28px !important;
        }
        td:last-child {
          border-bottom: none !important;
        }
        td::before {
          content: attr(data-label) !important;
          position: absolute !important;
          left: 8px !important;
          width: 40% !important;
          text-align: left !important;
          font-weight: 800 !important;
          color: #047857 !important;
          text-transform: uppercase !important;
          font-size: 8px !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        td[colspan] {
          padding-left: 8px !important;
          text-align: center !important;
          justify-content: center !important;
        }
        td[colspan]::before {
          display: none !important;
        }
        /* Mobile Watermark overrides */
        .watermark-stamp {
          width: 70% !important;
          border-width: 4px !important;
          padding: 8px 16px !important;
          opacity: 0.05 !important;
        }
        .watermark-stamp > div {
          font-size: 6.5vw !important;
          letter-spacing: 2px !important;
        }
      }
    </style>
    <div style="width: 100%; max-width: 100%; box-sizing: border-box;" class="a4-voucher-page pdf-container voucher-wrapper pdf-page-container voucher-root-container flex flex-col justify-between overflow-hidden p-4 bg-white text-slate-900 text-[11px] leading-snug">
      <div class="watermark-stamp" style="color: ${status === 'APPROVED' ? '#00875A' : '#EF4444'} !important;">
        <div>
          ${status}
        </div>
      </div>
      
      <!-- TOP HEADER (AGENCY BRANDING) -->
      <div>
        <div class="relative flex flex-col items-center justify-center text-center border-b-2 border-emerald-700 pb-2 mb-2 w-full gap-2 md:gap-0">
          <!-- Booking Agent Badge on the Top Left -->
          <div class="md:absolute md:left-0 md:top-1 static flex flex-col items-center md:items-start text-center md:text-left bg-emerald-50 border border-emerald-200 px-5 py-3 rounded shadow-sm leading-tight w-full md:w-auto max-w-[320px] md:max-w-none order-2 md:order-none">
            <span class="block text-[11px] uppercase text-emerald-800 font-extrabold tracking-wider">Booking By</span>
            <strong class="text-emerald-950 font-black text-[16px]">${data.bookingAgentName || '-'}</strong>
          </div>
          <!-- QR Code Badge on the Top Right -->
          <div class="md:absolute md:right-0 md:top-1 static flex items-center justify-center space-x-3 bg-white p-2 rounded border border-emerald-200 shadow-sm shrink-0 w-full md:w-auto max-w-[320px] md:max-w-none order-3 md:order-none">
            ${qrDataUrl ? `<img src="${qrDataUrl}" style="width: 72px; height: 72px;" class="w-[72px] h-[72px] object-contain" alt="Voucher QR">` : ''}
            <div class="text-[9px] leading-tight text-slate-700 text-left">
              <strong class="font-extrabold text-emerald-800 block text-[10px] uppercase">VERIFIED</strong>
              <span>Scan to verify</span>
              <span class="block font-mono font-bold text-[9px] text-slate-900">${data.id}</span>
            </div>
          </div>
          <!-- Centered Logo, Name, Tagline, and License -->
          <div class="flex flex-col items-center order-first md:order-none">
            ${letterheadLogoHtml}
            <h1 class="text-[13px] font-black text-emerald-950 tracking-wide uppercase leading-tight mt-1">${agencySettings.agencyName || 'SAUDI PAK GROUP OF TRAVELS'}</h1>
            <p class="text-[9.5px] text-slate-700 font-bold mt-0.5">${agencySettings.tagline || 'Hajj & Umrah Pilgrimage Services'}</p>
            ${agencySettings.licenseNo ? `<p class="text-[8.5px] text-emerald-800 font-extrabold mt-0.5">Lic / IATA: ${agencySettings.licenseNo}</p>` : ''}
          </div>
        </div>

        <!-- VOUCHER TITLE BAR -->
        <div class="bg-emerald-800 text-white rounded-md px-3 py-1.5 flex flex-col md:flex-row items-center justify-between shadow-sm mb-2 gap-1 text-center">
          <div class="flex items-center space-x-2">
            <i class="fa-solid fa-kaaba text-amber-300 text-sm"></i>
            <span class="font-black text-[11px] tracking-wider uppercase">OFFICIAL TRAVEL & UMRAH VOUCHER</span>
          </div>
          <div class="flex flex-wrap items-center justify-center gap-3 text-[10.5px]">
            <span>Voucher Ref: <strong class="text-amber-300 font-mono font-bold">${data.id}</strong></span>
            <span>Date: <strong>${formatDateToDMY(data.voucherDate)}</strong></span>
          </div>
        </div>

        <!-- SUMMARY INFO GRID -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-2 bg-emerald-50/80 border border-emerald-200 rounded-md p-2 mb-2 text-[10px]">
          <div>
            <span class="text-slate-600 block uppercase tracking-wider text-[8px] font-extrabold">Family Head / Leader</span>
            <strong class="text-slate-900 text-[11px] block truncate">${data.familyHead}</strong>
          </div>
          <div>
            <span class="text-slate-600 block uppercase tracking-wider text-[8px] font-extrabold">Package Name</span>
            <strong class="text-emerald-900 text-[11px] block truncate">${data.packageName}</strong>
          </div>
          <div>
            <span class="text-slate-600 block uppercase tracking-wider text-[8px] font-extrabold">PAX Breakdown</span>
            <strong class="text-slate-900 block text-[10px]">${data.adultsCount || 0} Adults, ${data.childrenCount || 0} Child, ${data.infantsCount || 0} Inf</strong>
          </div>
          <div>
            <span class="text-slate-600 block uppercase tracking-wider text-[8px] font-extrabold">Total PAX</span>
            <span class="px-2 py-0.5 bg-emerald-700 text-white rounded font-black text-[10px] inline-block text-center w-full">${data.totalPax} Person(s)</span>
          </div>
          <div class="col-span-2 md:col-span-1 text-center md:text-left">
            <span class="text-slate-600 block uppercase tracking-wider text-[8px] font-extrabold">Total Package Days</span>
            <span class="px-2 py-0.5 bg-emerald-800 text-white rounded font-black text-[10px] inline-block text-center w-full">${calculatedPackageDays > 0 ? calculatedPackageDays + ' Days' : '-'}</span>
          </div>
        </div>

        <!-- 1. PASSENGER BASIC DETAILS TABLE -->
        <div class="mb-2">
          <div class="bg-slate-800 text-white text-[10px] font-extrabold px-2 py-1 rounded-t-md flex items-center justify-between">
            <span><i class="fa-solid fa-users text-emerald-400 mr-1.5"></i>PASSENGER BASIC DETAILS</span>
            <span>Total Passengers: ${data.passengers ? data.passengers.length : 0}</span>
          </div>
          <table class="w-full text-left border-collapse border border-slate-300 text-[10px] table-fixed">
            <thead>
              <tr class="bg-slate-100 text-slate-900 uppercase font-black text-[8.5px]">
                <th style="width: 5%;" class="border border-slate-300 py-1 px-1.5 text-center">#</th>
                <th style="width: 20%;" class="border border-slate-300 py-1 px-2">Passport #</th>
                <th style="width: 50%;" class="border border-slate-300 py-1 px-2">Passenger Name</th>
                <th style="width: 12%;" class="border border-slate-300 py-1 px-1 text-center">Gender</th>
                <th style="width: 13%;" class="border border-slate-300 py-1 px-1 text-center">Type</th>
              </tr>
            </thead>
            <tbody>
              ${passBasicRowsHtml || '<tr><td colspan="5" class="text-center py-2 font-bold text-slate-500">No passenger basic details listed</td></tr>'}
            </tbody>
          </table>
        </div>

        ${data.showMofaDetails ? `
        <!-- 2. VISA, MOFA & BOOKING DETAILS TABLE -->
        <div class="mb-2">
          <div class="bg-emerald-950 text-white text-[10px] font-extrabold px-2 py-1 rounded-t-md flex items-center justify-between">
            <span><i class="fa-solid fa-passport text-amber-300 mr-1.5"></i>VISA, MOFA & BOOKING DETAILS</span>
          </div>
          <table class="w-full text-left border-collapse border border-slate-300 text-[10px] table-fixed">
            <thead>
              <tr class="bg-slate-100 text-slate-900 uppercase font-black text-[8.5px]">
                <th style="width: 5%;" class="border border-slate-300 py-1 px-1.5 text-center">#</th>
                <th style="width: 30%;" class="border border-slate-300 py-1 px-2">Passenger Name</th>
                <th style="width: 17%;" class="border border-slate-300 py-1 px-2">MOFA #</th>
                <th style="width: 16%;" class="border border-slate-300 py-1 px-2">Group #</th>
                <th style="width: 17%;" class="border border-slate-300 py-1 px-2">Visa #</th>
                <th style="width: 15%;" class="border border-slate-300 py-1 px-2">PNR</th>
              </tr>
            </thead>
            <tbody>
              ${passVisaRowsHtml || '<tr><td colspan="6" class="text-center py-2 font-bold text-slate-500">No visa / MOFA details listed</td></tr>'}
            </tbody>
          </table>
        </div>` : ''}

        <!-- 3. ACCOMMODATION / HOTEL TABLE -->
        <div class="mb-2">
          <div class="bg-emerald-900 text-white text-[10px] font-extrabold px-2 py-1 rounded-t-md flex items-center justify-between">
            <span><i class="fa-solid fa-hotel text-amber-300 mr-1.5"></i>ACCOMMODATION & HOTEL BOOKING SCHEDULE</span>
          </div>
          <table class="w-full text-left border-collapse border border-slate-300 text-[10px] table-fixed">
            <thead>
              <tr class="bg-slate-100 text-slate-900 uppercase font-black text-[8.5px]">
                <th style="width: 12%;" class="border border-slate-300 py-1 px-2">City</th>
                <th style="width: 23%;" class="border border-slate-300 py-1 px-2">Hotel Name</th>
                <th style="width: 14%;" class="border border-slate-300 py-1 px-2">Room Type</th>
                <th style="width: 13%;" class="border border-slate-300 py-1 px-2">Meal Plan</th>
                <th style="width: 11%;" class="border border-slate-300 py-1 px-2">Check-In</th>
                <th style="width: 11%;" class="border border-slate-300 py-1 px-2">Check-Out</th>
                <th style="width: 10%;" class="border border-slate-300 py-1 px-2 text-center">Bed Type</th>
                <th style="width: 6%;" class="border border-slate-300 py-1 px-1 text-center">Nights</th>
              </tr>
            </thead>
            <tbody>
              ${hotelRowsHtml || '<tr><td colspan="8" class="text-center py-2 font-bold text-slate-500">No accommodation details listed</td></tr>'}
            </tbody>
          </table>
        </div>

        <!-- 4. STRUCTURED FLIGHT SCHEDULE TABLE -->
        <div class="mb-2">
          <div class="bg-slate-800 text-white text-[10px] font-extrabold px-2 py-1 rounded-t-md flex items-center justify-between">
            <span><i class="fa-solid fa-plane-departure text-emerald-400 mr-1.5"></i>FLIGHT SCHEDULE TABLE</span>
          </div>
          <table class="w-full text-left border-collapse border border-slate-300 text-[10px] table-fixed">
            <thead>
              <tr class="bg-slate-100 text-slate-900 uppercase font-black text-[8.5px]">
                <th style="width: 10%;" class="border border-slate-300 py-1 px-2">Sector</th>
                <th style="width: 18%;" class="border border-slate-300 py-1 px-2">Airline</th>
                <th style="width: 12%;" class="border border-slate-300 py-1 px-2">Flight No</th>
                <th style="width: 14%;" class="border border-slate-300 py-1 px-2">Route</th>
                <th style="width: 14%;" class="border border-slate-300 py-1 px-2">Date</th>
                <th style="width: 16%;" class="border border-slate-300 py-1 px-2 text-center">Departure Time</th>
                <th style="width: 16%;" class="border border-slate-300 py-1 px-2 text-center">Arrival Time</th>
              </tr>
            </thead>
            <tbody>
              <tr class="bg-white border-b border-slate-200">
                <td data-label="Flight Type" class="font-black text-emerald-800 py-1.5 px-2">Departure</td>
                <td data-label="Airline" class="font-extrabold text-slate-900 py-1.5 px-2">${data.flight ? data.flight.departureAirline || '-' : '-'}</td>
                <td data-label="Flight No" class="font-mono font-black text-slate-900 py-1.5 px-2">${data.flight ? data.flight.departureFlightNo || '-' : '-'}</td>
                <td data-label="Route" class="font-extrabold text-emerald-900 py-1.5 px-2">${data.flight ? data.flight.departureRoute || '-' : '-'}</td>
                <td data-label="Date" class="font-bold text-slate-900 py-1.5 px-2">${formatDateToDMY(data.flight ? data.flight.departureDate : '')}</td>
                <td data-label="Dep. Time" class="font-bold text-slate-900 py-1.5 px-2 text-center">${data.flight ? data.flight.departureTime || '-' : '-'}</td>
                <td data-label="Arrival Time" class="font-bold text-slate-900 py-1.5 px-2 text-center">${data.flight ? data.flight.departureArrivalTime || '-' : '-'}</td>
              </tr>
              <tr class="bg-slate-50 border-b border-slate-200">
                <td data-label="Flight Type" class="font-black text-emerald-800 py-1.5 px-2">Return</td>
                <td data-label="Airline" class="font-extrabold text-slate-900 py-1.5 px-2">${data.flight ? data.flight.returnAirline || '-' : '-'}</td>
                <td data-label="Flight No" class="font-mono font-black text-slate-900 py-1.5 px-2">${data.flight ? data.flight.returnFlightNo || '-' : '-'}</td>
                <td data-label="Route" class="font-extrabold text-emerald-900 py-1.5 px-2">${data.flight ? data.flight.returnRoute || '-' : '-'}</td>
                <td data-label="Date" class="font-bold text-slate-900 py-1.5 px-2">${formatDateToDMY(data.flight ? data.flight.returnDate : '')}</td>
                <td data-label="Dep. Time" class="font-bold text-slate-900 py-1.5 px-2 text-center">${data.flight ? data.flight.returnTime || '-' : '-'}</td>
                <td data-label="Arrival Time" class="font-bold text-slate-900 py-1.5 px-2 text-center">${data.flight ? data.flight.returnArrivalTime || '-' : '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        ${showZiyaratSection ? `
        <!-- 4.5. ZIYARAT SCHEDULE TABLE -->
        <div class="mb-2">
          <div class="bg-emerald-900 text-white text-[10px] font-extrabold px-2 py-1 rounded-t-md flex items-center justify-between">
            <span><i class="fa-solid fa-mosque text-amber-300 mr-1.5"></i>ZIYARAT SCHEDULE</span>
          </div>
          <table class="w-full text-left border-collapse border border-slate-300 text-[10px] table-fixed">
            <thead>
              <tr class="bg-slate-100 text-slate-900 uppercase font-black text-[8.5px]">
                <th style="width: 30%;" class="border border-slate-300 py-1 px-2">City</th>
                <th style="width: 35%;" class="border border-slate-300 py-1 px-2">Ziyarat Included</th>
                <th style="width: 35%;" class="border border-slate-300 py-1 px-2">Date</th>
              </tr>
            </thead>
            <tbody>
              ${ziyaratRowsHtml}
            </tbody>
          </table>
        </div>` : ''}

        <!-- 5. TRANSPORT & TRANSFER DETAILS TABLE -->
        <div class="mb-2">
          <div class="bg-emerald-900 text-white text-[10px] font-extrabold px-2 py-1 rounded-t-md flex items-center justify-between">
            <span><i class="fa-solid fa-bus text-amber-300 mr-1.5"></i>TRANSPORT & TRANSFER DETAILS</span>
          </div>
          <table class="w-full text-left border-collapse border border-slate-300 text-[10px] table-fixed">
            <thead>
              <tr class="bg-slate-100 text-slate-900 uppercase font-black text-[8.5px]">
                <th style="width: 14%;" class="border border-slate-300 py-1 px-2">Date</th>
                <th style="width: 20%;" class="border border-slate-300 py-1 px-2">Company</th>
                <th style="width: 22%;" class="border border-slate-300 py-1 px-2">Vehicle</th>
                <th style="width: 16%;" class="border border-slate-300 py-1 px-2">Route No</th>
                <th style="width: 28%;" class="border border-slate-300 py-1 px-2">Transport Route</th>
              </tr>
            </thead>
            <tbody>
              <tr class="bg-white border-b border-slate-200">
                <td data-label="Date" class="font-bold text-slate-900 py-1.5 px-2">${data.transport ? formatDateToDMY(data.transport.date) : '-'}</td>
                <td data-label="Company" class="font-bold text-slate-900 py-1.5 px-2">${data.transport ? data.transport.transporter || '-' : '-'}</td>
                <td data-label="Vehicle" class="font-bold text-slate-900 py-1.5 px-2">${data.transport ? data.transport.vehicleType || '-' : '-'}</td>
                <td data-label="Route No" class="font-black text-emerald-800 py-1.5 px-2 font-mono">${data.transport ? data.transport.routeNo || '-' : '-'}</td>
                <td data-label="Transport Route" class="font-bold text-slate-900 py-1.5 px-2">${data.transport ? data.transport.route || '-' : '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 6. HELPLINES -->
        <div class="border-2 border-emerald-300 bg-emerald-50/90 rounded-md p-2 mb-2 text-[10px]">
          <div class="space-y-1 text-slate-900">
            <span class="font-black text-emerald-950 uppercase block text-[11px]"><i class="fa-solid fa-headset mr-1.5 text-emerald-700"></i>24/7 KSA EMERGENCY HELPLINES:</span>
            <div class="flex space-x-4 text-[10px] font-bold">
              <span>Makkah: <strong class="text-emerald-900 font-mono text-[10.5px]">${data.helplines ? data.helplines.makkah || '-' : '-'}</strong></span>
              <span>Medina: <strong class="text-emerald-900 font-mono text-[10.5px]">${data.helplines ? data.helplines.medina || '-' : '-'}</strong></span>
              <span>Transport: <strong class="text-emerald-900 font-mono text-[10.5px]">${data.helplines ? data.helplines.transport || '-' : '-'}</strong></span>
            </div>
          </div>
        </div>

      </div>

      <!-- FOOTER TERMS & CONDITIONS (DUAL URDU & ENGLISH) -->
      <div class="border-t-2 border-emerald-700 pt-1.5 text-[9.5px] text-slate-900 font-semibold space-y-1">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          
          <!-- Urdu Rules -->
          <div dir="rtl" class="text-right font-arabic bg-slate-50 p-1.5 rounded border border-slate-200">
            <span class="font-black text-emerald-950 block text-[10px] mb-0.5">ضروری ہدایات و شرائط:</span>
            <ul class="list-disc pr-3 space-y-0.5 text-[9px] font-bold">
              ${termsUrduLines || '<li>ہوٹل کیلیے چیک ان 04:00 PM اور چیک آؤٹ 12:00 PM ہے۔</li>'}
            </ul>
          </div>

          <!-- English Terms -->
          <div class="bg-slate-50 p-1.5 rounded border border-slate-200">
            <span class="font-black text-emerald-950 block text-[10px] mb-0.5">Terms & Conditions:</span>
            <ul class="list-disc pl-3 space-y-0.5 text-[9px] font-bold">
              ${termsEngLines || '<li>Hotel check-in is 04:00 PM and check-out is 12:00 PM.</li>'}
            </ul>
          </div>

        </div>

        <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[9px] text-slate-800 font-bold w-full py-1 border-t border-b border-slate-200 mt-1">
          ${agencySettings.phone1 || agencySettings.phone2 ? `<span><i class="fa-solid fa-phone text-emerald-700 mr-1"></i>${agencySettings.phone1 || ''}${agencySettings.phone2 ? ' | ' + agencySettings.phone2 : ''}</span>` : ''}
          ${agencySettings.email ? `<span><i class="fa-solid fa-envelope text-emerald-700 mr-1"></i>${agencySettings.email}</span>` : ''}
          ${agencySettings.website ? `<span><i class="fa-solid fa-globe text-emerald-700 mr-1"></i>${agencySettings.website}</span>` : ''}
          ${agencySettings.address ? `<span><i class="fa-solid fa-location-dot text-emerald-700 mr-1"></i>${agencySettings.address}</span>` : ''}
        </div>

        <div class="flex flex-col md:flex-row items-center justify-between text-[8px] text-slate-500 font-bold pt-1 gap-1">
          <span>Prepared By: <strong>${data.agentName || formatCreatorName(data.createdBy, data.createdByRole)}</strong></span>
          <span>Generated via Travel Voucher Generator System</span>
          <span>Page 1 of 1</span>
        </div>
      </div>

    </div>
  `;
}