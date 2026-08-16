/**
 * PDF Generator Module - Optimized for Single Page A4 Umrah Voucher
 */

// Helper function to format date to DD-MM-YYYY
function formatDateToDMY(dateString) {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (e) {
    return dateString;
  }
}

// Helper function to format creator name nicely
function formatCreatorName(name, role) {
  if (!name) return 'System';
  if (!role) return name;
  return `${name} (${role})`;
}

// Mock QR Code generator data url placeholder / integration
async function generateQRCodeDataUrl(text) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=${encodeURIComponent(text)}`;
}

// Main function to render A4 Voucher Template
async function renderA4VoucherHTML(data, agencySettings) {
  const voucher_ref = data.voucherRef || data.id || '';
  const baseUrl = (typeof process !== 'undefined' && process.env && process.env.PUBLIC_APP_URL)
    || 'https://saudipak-vouchers.vercel.app';
  const verifyUrl = `${baseUrl}/verify?voucher=${voucher_ref}`;
  const qrDataUrl = await generateQRCodeDataUrl(verifyUrl);

  // Agency logo HTML
  let logoHtml = '';
  if (agencySettings.logo && agencySettings.logo.startsWith('data:image')) {
    logoHtml = `<img src="${agencySettings.logo}" style="max-height: 35px; max-width: 100px; object-fit: contain;" alt="Logo">`;
  } else {
    logoHtml = `
      <div class="flex items-center space-x-1 text-emerald-800">
        <i class="fa-solid fa-kaaba text-xl"></i>
        <span class="font-extrabold text-xs uppercase tracking-tight text-emerald-900">${agencySettings.agencyName || 'SAUDI PAK GROUP OF TRAVELS'}</span>
      </div>`;
  }

  // 1. Passenger Basic Details Table Rows
  const passBasicRowsHtml = (data.passengers || []).map((p, idx) => `
    <tr class="${idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'} border-b border-slate-200">
      <td class="text-center font-bold py-0.5 px-1 text-slate-900 text-[9px]">${idx + 1}</td>
      <td class="font-bold py-0.5 px-1 text-slate-900 text-[9px]">${p.passportNo || '-'}</td>
      <td class="font-extrabold py-0.5 px-1 text-emerald-900 text-[9.5px] truncate">${p.name || '-'}</td>
      <td class="text-center font-semibold py-0.5 px-0.5 text-slate-900 text-[9px]">${p.gender || '-'}</td>
      <td class="text-center py-0.5 px-0.5"><span class="px-1 py-0.1 bg-sky-100 text-sky-800 rounded text-[8.5px] font-extrabold">${p.type || '-'}</span></td>
      <td class="text-center font-semibold py-0.5 px-0.5 text-slate-900 text-[9px]">${p.bed || '-'}</td>
    </tr>
  `).join('');

  // 2. Visa & MOFA Details Table Rows
  const passVisaRowsHtml = (data.passengers || []).map((p, idx) => `
    <tr class="${idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'} border-b border-slate-200">
      <td class="text-center font-bold py-0.5 px-1 text-slate-900 text-[9px]">${idx + 1}</td>
      <td class="font-extrabold py-0.5 px-1 text-slate-900 text-[9px] truncate">${p.name || '-'}</td>
      <td class="font-bold py-0.5 px-1 text-slate-900 text-[9px]">${p.mofaNo || '-'}</td>
      <td class="font-bold py-0.5 px-1 text-slate-900 text-[9px]">${p.groupNo || '-'}</td>
      <td class="font-bold py-0.5 px-1 text-slate-900 text-[9px]">${p.visaNo || '-'}</td>
      <td class="font-mono font-extrabold py-0.5 px-1 text-emerald-800 text-[9.5px]">${p.pnr || '-'}</td>
    </tr>
  `).join('');

  // 3. Hotel Rows
  const hotelRowsHtml = (data.hotels || []).map((h, idx) => `
    <tr class="${idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'} border-b border-slate-200 text-[9px]">
      <td class="font-extrabold py-0.5 px-1 text-emerald-900">${h.city || '-'}</td>
      <td class="font-extrabold py-0.5 px-1 text-slate-900 truncate">${h.hotelName || '-'}</td>
      <td class="font-bold py-0.5 px-1 text-slate-800">${h.roomType || '-'}</td>
      <td class="font-bold py-0.5 px-1 text-slate-800">${h.mealPlan || '-'}</td>
      <td class="font-bold py-0.5 px-1 text-slate-900">${formatDateToDMY(h.checkIn)}</td>
      <td class="font-bold py-0.5 px-1 text-slate-900">${formatDateToDMY(h.checkOut)}</td>
      <td class="text-center font-black py-0.5 px-1 text-emerald-800 bg-emerald-50">${h.totalNights || 0} Nts</td>
    </tr>
  `).join('');

  // Dual Terms HTML
  const termsUrduLines = (data.termsUrdu || '').split('\n').filter(l => l.trim()).map(l => `<li class="mb-0.2">${l}</li>`).join('');
  const termsEngLines = (data.termsEnglish || '').split('\n').filter(l => l.trim()).map(l => `<li class="mb-0.2">${l}</li>`).join('');

  const status = data.status || 'NOT APPROVED';
  return `
    <div style="width: 100%; box-sizing: border-box; page-break-inside: avoid;" class="a4-voucher-page pdf-container voucher-wrapper pdf-page-container voucher-root-container p-3 bg-white text-slate-900 text-[9.5px] leading-tight">
      <div class="watermark-overlay" style="position: absolute !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) rotate(-30deg) !important; width: 80% !important; text-align: center !important; pointer-events: none !important; user-select: none !important; z-index: 9999 !important; opacity: 0.12 !important; color: ${status === 'APPROVED' ? '#00875A' : '#EF4444'} !important;">
        <div style="font-family: 'Impact', 'Arial Black', 'Arial', sans-serif !important; font-size: ${status === 'APPROVED' ? '65pt' : '50pt'} !important; font-weight: 950 !important; border: 5px double currentColor !important; padding: 8px 20px !important; border-radius: 8px !important; letter-spacing: 3px !important; white-space: nowrap !important; line-height: 1.1 !important; text-transform: uppercase !important; display: inline-block !important;">
          ${status === 'APPROVED' ? 'APPROVED' : 'NOT APPROVED'}
        </div>
      </div>
      
      <!-- TOP HEADER (AGENCY BRANDING) -->
      <div class="flex items-center justify-between border-b-2 border-emerald-700 pb-1.5 mb-1.5">
        <div class="flex items-center space-x-2 max-w-[55%]">
          ${logoHtml}
          <div>
            <h1 class="text-[10.5px] font-black text-emerald-950 tracking-tight uppercase leading-tight">${agencySettings.agencyName || 'SAUDI PAK GROUP OF TRAVELS'}</h1>
            <p class="text-[8px] text-slate-700 font-bold">${agencySettings.tagline || 'Hajj & Umrah Pilgrimage Services'}</p>
            <p class="text-[7.5px] text-emerald-800 font-extrabold">${agencySettings.licenseNo ? 'Lic: ' + agencySettings.licenseNo : ''}</p>
          </div>
        </div>

        <div class="text-right text-[8.5px] space-y-0.5 text-slate-800 font-semibold max-w-[45%]">
          <p class="font-extrabold text-slate-900"><i class="fa-solid fa-phone text-emerald-700 mr-1"></i>${agencySettings.phone1 || ''}</p>
          <p><i class="fa-solid fa-envelope text-emerald-700 mr-1"></i>${agencySettings.email || ''}</p>
          <p><i class="fa-solid fa-globe text-emerald-700 mr-1"></i>${agencySettings.website || ''}</p>
          <p class="text-[7.5px] text-slate-700"><i class="fa-solid fa-location-dot text-emerald-700 mr-1"></i>${agencySettings.address || ''}</p>
        </div>
      </div>

      <!-- VOUCHER TITLE BAR -->
      <div class="bg-emerald-800 text-white rounded px-2 py-1 flex items-center justify-between shadow-sm mb-1.5">
        <div class="flex items-center space-x-1.5">
          <i class="fa-solid fa-kaaba text-amber-300 text-[10px]"></i>
          <span class="font-black text-[9.5px] tracking-wider uppercase">OFFICIAL TRAVEL & UMRAH VOUCHER</span>
        </div>
        <div class="flex items-center space-x-2 text-[9px]">
          <span>Ref: <strong class="text-amber-300 font-mono font-bold">${data.id}</strong></span>
          <span>Date: <strong>${formatDateToDMY(data.voucherDate)}</strong></span>
        </div>
      </div>

      <!-- SUMMARY INFO GRID -->
      <div class="grid grid-cols-4 gap-1.5 bg-emerald-50/80 border border-emerald-200 rounded p-1.5 mb-1.5 text-[9px]">
        <div>
          <span class="text-slate-600 block uppercase tracking-wider text-[7px] font-extrabold">Family Head</span>
          <strong class="text-slate-900 text-[9.5px] block truncate">${data.familyHead}</strong>
        </div>
        <div>
          <span class="text-slate-600 block uppercase tracking-wider text-[7px] font-extrabold">Package Name</span>
          <strong class="text-emerald-900 text-[9.5px] block truncate">${data.packageName}</strong>
        </div>
        <div>
          <span class="text-slate-600 block uppercase tracking-wider text-[7px] font-extrabold">PAX Breakdown</span>
          <strong class="text-slate-900 block text-[9px]">${data.adultsCount || 0} Ad, ${data.childrenCount || 0} Ch, ${data.infantsCount || 0} Inf</strong>
        </div>
        <div>
          <span class="text-slate-600 block uppercase tracking-wider text-[7px] font-extrabold">Total PAX</span>
          <span class="px-1.5 py-0.2 bg-emerald-700 text-white rounded font-black text-[9px] inline-block">${data.totalPax} Person(s)</span>
        </div>
      </div>

      <!-- 1. PASSENGER BASIC DETAILS TABLE -->
      <div class="mb-1.5">
        <div class="bg-slate-800 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-t flex items-center justify-between">
          <span><i class="fa-solid fa-users text-emerald-400 mr-1"></i>PASSENGER BASIC DETAILS</span>
          <span>Total: ${data.passengers ? data.passengers.length : 0}</span>
        </div>
        <table class="w-full text-left border-collapse border border-slate-300 text-[9px]">
          <thead>
            <tr class="bg-slate-100 text-slate-900 uppercase font-black text-[7.5px]">
              <th style="width: 5%;" class="border border-slate-300 py-0.5 px-1 text-center">#</th>
              <th style="width: 20%;" class="border border-slate-300 py-0.5 px-1">Passport #</th>
              <th style="width: 35%;" class="border border-slate-300 py-0.5 px-1">Passenger Name</th>
              <th style="width: 12%;" class="border border-slate-300 py-0.5 px-1 text-center">Gender</th>
              <th style="width: 13%;" class="border border-slate-300 py-0.5 px-1 text-center">Type</th>
              <th style="width: 15%;" class="border border-slate-300 py-0.5 px-1 text-center">Bed Type</th>
            </tr>
          </thead>
          <tbody>
            ${passBasicRowsHtml || '<tr><td colspan="6" class="text-center py-1 font-bold text-slate-500">No passenger basic details listed</td></tr>'}
          </tbody>
        </table>
      </div>

      ${data.showMofaDetails ? `
      <!-- 2. VISA, MOFA & BOOKING DETAILS TABLE -->
      <div class="mb-1.5">
        <div class="bg-emerald-950 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-t flex items-center justify-between">
          <span><i class="fa-solid fa-passport text-amber-300 mr-1"></i>VISA, MOFA & BOOKING DETAILS</span>
        </div>
        <table class="w-full text-left border-collapse border border-slate-300 text-[9px]">
          <thead>
            <tr class="bg-slate-100 text-slate-900 uppercase font-black text-[7.5px]">
              <th style="width: 5%;" class="border border-slate-300 py-0.5 px-1 text-center">#</th>
              <th style="width: 30%;" class="border border-slate-300 py-0.5 px-1">Passenger Name</th>
              <th style="width: 17%;" class="border border-slate-300 py-0.5 px-1">MOFA #</th>
              <th style="width: 16%;" class="border border-slate-300 py-0.5 px-1">Group #</th>
              <th style="width: 17%;" class="border border-slate-300 py-0.5 px-1">Visa #</th>
              <th style="width: 15%;" class="border border-slate-300 py-0.5 px-1">PNR</th>
            </tr>
          </thead>
          <tbody>
            ${passVisaRowsHtml || '<tr><td colspan="6" class="text-center py-1 font-bold text-slate-500">No visa / MOFA details listed</td></tr>'}
          </tbody>
        </table>
      </div>` : ''}

      <!-- 3. ACCOMMODATION / HOTEL TABLE -->
      <div class="mb-1.5">
        <div class="bg-emerald-900 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-t flex items-center justify-between">
          <span><i class="fa-solid fa-hotel text-amber-300 mr-1"></i>ACCOMMODATION & HOTEL BOOKING SCHEDULE</span>
        </div>
        <table class="w-full text-left border-collapse border border-slate-300 text-[9px]">
          <thead>
            <tr class="bg-slate-100 text-slate-900 uppercase font-black text-[7.5px]">
              <th style="width: 13%;" class="border border-slate-300 py-0.5 px-1">City</th>
              <th style="width: 27%;" class="border border-slate-300 py-0.5 px-1">Hotel Name</th>
              <th style="width: 15%;" class="border border-slate-300 py-0.5 px-1">Room Type</th>
              <th style="width: 15%;" class="border border-slate-300 py-0.5 px-1">Meal Plan</th>
              <th style="width: 11%;" class="border border-slate-300 py-0.5 px-1">Check-In</th>
              <th style="width: 11%;" class="border border-slate-300 py-0.5 px-1">Check-Out</th>
              <th style="width: 8%;" class="border border-slate-300 py-0.5 px-1 text-center">Nts</th>
            </tr>
          </thead>
          <tbody>
            ${hotelRowsHtml || '<tr><td colspan="7" class="text-center py-1 font-bold text-slate-500">No accommodation details listed</td></tr>'}
          </tbody>
        </table>
      </div>

      <!-- 4. STRUCTURED FLIGHT SCHEDULE TABLE -->
      <div class="mb-1.5">
        <div class="bg-slate-800 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-t flex items-center justify-between">
          <span><i class="fa-solid fa-plane-departure text-emerald-400 mr-1"></i>FLIGHT SCHEDULE TABLE</span>
        </div>
        <table class="w-full text-left border-collapse border border-slate-300 text-[9px]">
          <thead>
            <tr class="bg-slate-100 text-slate-900 uppercase font-black text-[7.5px]">
              <th style="width: 12%;" class="border border-slate-300 py-0.5 px-1">Sector</th>
              <th style="width: 22%;" class="border border-slate-300 py-0.5 px-1">Airline</th>
              <th style="width: 14%;" class="border border-slate-300 py-0.5 px-1">Flight No</th>
              <th style="width: 18%;" class="border border-slate-300 py-0.5 px-1">Date</th>
              <th style="width: 18%;" class="border border-slate-300 py-0.5 px-1">Time</th>
              <th style="width: 16%;" class="border border-slate-300 py-0.5 px-1">Route</th>
            </tr>
          </thead>
          <tbody>
            <tr class="bg-white border-b border-slate-200">
              <td class="font-black text-emerald-800 py-0.5 px-1">Departure</td>
              <td class="font-extrabold text-slate-900 py-0.5 px-1">${data.flight ? data.flight.departureAirline || '-' : '-'}</td>
              <td class="font-mono font-black text-slate-900 py-0.5 px-1">${data.flight ? data.flight.departureFlightNo || '-' : '-'}</td>
              <td class="font-bold text-slate-900 py-0.5 px-1">${formatDateToDMY(data.flight ? data.flight.departureDate : '')}</td>
              <td class="font-bold text-slate-900 py-0.5 px-1">${data.flight ? data.flight.departureTime || '-' : '-'}</td>
              <td class="font-extrabold text-emerald-900 py-0.5 px-1">${data.flight ? data.flight.departureRoute || '-' : '-'}</td>
            </tr>
            <tr class="bg-slate-50 border-b border-slate-200">
              <td class="font-black text-emerald-800 py-0.5 px-1">Return</td>
              <td class="font-extrabold text-slate-900 py-0.5 px-1">${data.flight ? data.flight.returnAirline || '-' : '-'}</td>
              <td class="font-mono font-black text-slate-900 py-0.5 px-1">${data.flight ? data.flight.returnFlightNo || '-' : '-'}</td>
              <td class="font-bold text-slate-900 py-0.5 px-1">${formatDateToDMY(data.flight ? data.flight.returnDate : '')}</td>
              <td class="font-bold text-slate-900 py-0.5 px-1">${data.flight ? data.flight.returnTime || '-' : '-'}</td>
              <td class="font-extrabold text-emerald-900 py-0.5 px-1">${data.flight ? data.flight.returnRoute || '-' : '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 4.5. ZIYARAT SCHEDULE TABLE -->
      <div class="mb-1.5">
        <div class="bg-emerald-900 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-t flex items-center justify-between">
          <span><i class="fa-solid fa-mosque text-amber-300 mr-1"></i>ZIYARAT SCHEDULE</span>
        </div>
        <table class="w-full text-left border-collapse border border-slate-300 text-[9px]">
          <thead>
            <tr class="bg-slate-100 text-slate-900 uppercase font-black text-[7.5px]">
              <th style="width: 30%;" class="border border-slate-300 py-0.5 px-1">City</th>
              <th style="width: 35%;" class="border border-slate-300 py-0.5 px-1">Ziyarat Included</th>
              <th style="width: 35%;" class="border border-slate-300 py-0.5 px-1">Date</th>
            </tr>
          </thead>
          <tbody>
            <tr class="bg-white border-b border-slate-200">
              <td class="font-black text-emerald-800 py-0.5 px-1">Makkah</td>
              <td class="font-bold text-slate-900 py-0.5 px-1">${data.ziyarat ? data.ziyarat.makkahIncluded || 'No' : 'No'}</td>
              <td class="font-bold text-slate-900 py-0.5 px-1">${formatDateToDMY(data.ziyarat ? data.ziyarat.makkahDate : '')}</td>
            </tr>
            <tr class="bg-slate-50 border-b border-slate-200">
              <td class="font-black text-emerald-800 py-0.5 px-1">Madinah</td>
              <td class="font-bold text-slate-900 py-0.5 px-1">${data.ziyarat ? data.ziyarat.madinahIncluded || 'No' : 'No'}</td>
              <td class="font-bold text-slate-900 py-0.5 px-1">${formatDateToDMY(data.ziyarat ? data.ziyarat.madinahDate : '')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 5. TRANSPORT & ROUTE NO CARD -->
      <div class="border border-slate-300 rounded p-1.5 bg-slate-50 mb-1.5 text-[9px] space-y-0.5">
        <div class="font-black text-emerald-900 text-[9.5px] border-b border-slate-200 pb-0.5 flex items-center">
          <i class="fa-solid fa-bus text-emerald-700 mr-1"></i>TRANSPORT & TRANSFER DETAILS
        </div>
        <div class="grid grid-cols-2 gap-1.5 text-slate-900 font-bold">
          <p><strong>Date:</strong> ${data.transport ? formatDateToDMY(data.transport.date) : '-'}</p>
          <p><strong>Company:</strong> ${data.transport ? data.transport.transporter || '-' : '-'}</p>
          <p><strong>Vehicle:</strong> ${data.transport ? data.transport.vehicleType || '-' : '-'}</p>
          <p><strong>Route No:</strong> <span class="font-mono font-black text-emerald-800">${data.transport ? data.transport.routeNo || '-' : '-'}</span></p>
        </div>
        <p class="text-slate-900 font-extrabold pt-0.5"><strong>Transport Route:</strong> ${data.transport ? data.transport.route || '-' : '-'}</p>
      </div>

      <!-- 6. HELPLINES & QR CODE STAMP -->
      <div class="flex items-center justify-between border-2 border-emerald-300 bg-emerald-50/90 rounded p-1.5 mb-1.5 text-[9px]">
        <div class="space-y-0.5 text-slate-900">
          <span class="font-black text-emerald-950 uppercase block text-[9.5px]"><i class="fa-solid fa-headset mr-1 text-emerald-700"></i>24/7 KSA EMERGENCY HELPLINES:</span>
          <div class="flex space-x-3 text-[9px] font-bold">
            <span>Makkah: <strong class="text-emerald-900 font-mono text-[9.5px]">${data.helplines ? data.helplines.makkah || '-' : '-'}</strong></span>
            <span>Medina: <strong class="text-emerald-900 font-mono text-[9.5px]">${data.helplines ? data.helplines.medina || '-' : '-'}</strong></span>
            <span>Transport: <strong class="text-emerald-900 font-mono text-[9.5px]">${data.helplines ? data.helplines.transport || '-' : '-'}</strong></span>
          </div>
        </div>

        <div class="flex items-center space-x-1.5 bg-white p-1 rounded border border-emerald-300 shadow-sm shrink-0">
          ${qrDataUrl ? `<img src="${qrDataUrl}" style="width: 55px; height: 55px;" class="w-[55px] h-[55px] object-contain" alt="Voucher QR">` : ''}
          <div class="text-[8px] leading-tight text-slate-700">
            <strong class="font-black text-emerald-900 block text-[9px] uppercase">VERIFIED</strong>
            <span>Scan QR</span>
            <span class="block font-mono font-bold text-[7.5px] text-slate-900">${data.id}</span>
          </div>
        </div>
      </div>

      <!-- FOOTER TERMS & CONDITIONS -->
      <div class="border-t-2 border-emerald-700 pt-1 text-[8.5px] text-slate-900 font-semibold space-y-1">
        <div class="grid grid-cols-2 gap-1.5">
          <!-- Urdu Rules -->
          <div dir="rtl" class="text-right font-arabic bg-slate-50 p-1.5 rounded border border-slate-200">
            <span class="font-black text-emerald-950 block text-[9px] mb-0.5">ضروری ہدایات و شرائط:</span>
            <ul class="list-disc pr-3 space-y-0.5 text-[8px] font-bold">
              ${termsUrduLines || '<li>ہوٹل کیلیے چیک ان 04:00 PM اور چیک آؤٹ 12:00 PM ہے۔</li>'}
            </ul>
          </div>

          <!-- English Terms -->
          <div class="bg-slate-50 p-1.5 rounded border border-slate-200">
            <span class="font-black text-emerald-950 block text-[9px] mb-0.5">Terms & Conditions:</span>
            <ul class="list-disc pl-3 space-y-0.5 text-[8px] font-bold">
              ${termsEngLines || '<li>Hotel check-in is 04:00 PM and check-out is 12:00 PM.</li>'}
            </ul>
          </div>
        </div>

        <div class="flex items-center justify-between text-[7.5px] text-slate-500 font-bold border-t border-slate-200 pt-0.5">
          <span>Prepared By: <strong>${formatCreatorName(data.createdBy, data.createdByRole)}</strong></span>
          <span>Generated via Travel Voucher Generator System</span>
          <span>Page 1 of 1</span>
        </div>
      </div>

    </div>
  `;
}
