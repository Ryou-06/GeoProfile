<!-- src/routes/staff/encodeRegistration/+page.svelte -->
<!-- Staff-assisted registration — staff visits resident's home and fills form on their behalf -->
<script>
  import { onMount, onDestroy } from 'svelte';

  // ── Auth ───────────────────────────────────────────────
  let staffUid  = '';
  let staffName = '';

  // ── Household selection ────────────────────────────────
  /** @type {any[]} */
  let households        = [];
  /** @type {any} */
  let selectedHousehold = null;
  let householdLoading  = true;
  let showHouseholdPicker = true;

  // ── GPS (Enhanced) ─────────────────────────────────────
  let gpsLat      = /** @type {number|null} */ (null);
  let gpsLng      = /** @type {number|null} */ (null);
  let gpsAccuracy = /** @type {number|null} */ (null);
  let gpsStatus   = 'pending';
  let gpsAttempt  = 0;
  let maxGpsRetries = 5;
  let watchId     = /** @type {number|null} */ (null);
  let bestAccuracy = /** @type {number|null} */ (null);
  let gpsMessage  = 'Requesting GPS location...';
  let maxWatchTimeout = /** @type {any} */ (null);

  // ── Form fields ────────────────────────────────────────
  let firstName    = '';
  let lastName     = '';
  let middleName   = '';
  let birthdate    = '';
  let sex          = '';
  let civilStatus  = '';
  let contactNo    = '';

  // ── Address ────────────────────────────────────────────
  let houseNo = '';
  let street  = '';
  let purok   = '';

  const streets = [
    'Gordon Avenue', 'Murphy Street', 'Natividad Street',
    'Burgos Street', 'East 12th Street',
    'Perimeter Road', 'Bonifacio Street',
  ];

  // ── Categories ─────────────────────────────────────────
  let isPWD          = false;
  let isSenior       = false;
  let isSingleParent = false;
  let pwdType        = '';

  // ── House photo ────────────────────────────────────────
  /** @type {File|null} */
  let housePhoto        = null;
  /** @type {string} */
  let housePhotoPreview = '';
  let photoError        = '';

  // ── Form state ─────────────────────────────────────────
  let step      = 1;
  let loading   = false;
  let errorMsg  = '';
  let submitted = false;

  /** @type {(() => void)[]} */
  let unsubs = [];

  // ── Computed ───────────────────────────────────────────
  $: age = birthdate
    ? Math.floor((Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;
  $: if (age !== null && age >= 60) isSenior = true;

  $: fullAddress = [houseNo.trim(), street, purok, 'Barangay Pag-Asa', 'Olongapo City', 'Zambales']
    .filter(Boolean).join(', ');

  $: accuracyQuality = gpsAccuracy === null ? 'Unknown'
    : gpsAccuracy <= 10  ? '🟢 Excellent (±10m)'
    : gpsAccuracy <= 25  ? '🟡 Good (±25m)'
    : gpsAccuracy <= 50  ? '🟠 Fair (±50m)'
    : '🔴 Poor (>50m)';

  // ── GPS ────────────────────────────────────────────────
  /**
   * @param {number} lat @param {number} lng @param {number} accuracy
   * @returns {boolean}
   */
  function isValidLocation(lat, lng, accuracy) {
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
    if (accuracy > 1000) return false;
    if (gpsLat !== null && gpsLng !== null) {
      const R = 6371;
      const dLat = (lat - gpsLat) * Math.PI / 180;
      const dLon = (lng - gpsLng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(gpsLat*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLon/2)**2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      if (dist > 0.5) return false;
    }
    return true;
  }

  function requestGPSEnhanced() {
    if (!navigator.geolocation) { gpsStatus = 'error'; gpsMessage = 'GPS not supported.'; return; }
    gpsStatus = 'pending'; gpsAttempt = 0; bestAccuracy = null;
    gpsMessage = 'Requesting GPS... (attempt 1/' + maxGpsRetries + ')';
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (maxWatchTimeout !== null) { clearTimeout(maxWatchTimeout); maxWatchTimeout = null; }

    maxWatchTimeout = setTimeout(() => {
      if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
      if (gpsStatus === 'pending' || gpsStatus === 'optimizing') {
        gpsStatus = 'error'; gpsMessage = 'GPS timed out. Go outdoors and retry.';
      }
    }, 30000);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        const newAcc = Math.round(pos.coords.accuracy * 10) / 10;
        if (!isValidLocation(newLat, newLng, newAcc)) return;
        gpsLat = newLat; gpsLng = newLng; gpsAccuracy = newAcc;
        if (bestAccuracy === null || newAcc < bestAccuracy) bestAccuracy = newAcc;
        gpsAttempt++;

        if (gpsAccuracy <= 10) {
          gpsStatus = 'granted'; gpsMessage = `📍 Excellent! (±${gpsAccuracy}m)`;
          if (maxWatchTimeout) { clearTimeout(maxWatchTimeout); maxWatchTimeout = null; }
          if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
        } else if (gpsAccuracy <= 25 && gpsAttempt >= 2) {
          gpsStatus = 'granted'; gpsMessage = `✓ Location acquired (±${gpsAccuracy}m)`;
          if (maxWatchTimeout) { clearTimeout(maxWatchTimeout); maxWatchTimeout = null; }
          if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
        } else if (gpsAttempt >= maxGpsRetries) {
          gpsStatus = 'granted'; gpsMessage = `📍 Best effort (±${gpsAccuracy}m after ${gpsAttempt} attempts)`;
          if (maxWatchTimeout) { clearTimeout(maxWatchTimeout); maxWatchTimeout = null; }
          if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
        } else {
          gpsStatus = 'optimizing';
          gpsMessage = `Optimizing (±${gpsAccuracy}m) · ${maxGpsRetries - gpsAttempt} more attempts`;
        }
      },
      (err) => {
        if (maxWatchTimeout) { clearTimeout(maxWatchTimeout); maxWatchTimeout = null; }
        if (err.code === err.PERMISSION_DENIED) {
          gpsStatus = 'denied'; gpsMessage = 'Location denied. Enable in Settings.';
        } else {
          gpsStatus = 'error'; gpsMessage = 'GPS error: ' + err.message;
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  function retryGPS() {
    gpsAttempt = 0; bestAccuracy = null;
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (maxWatchTimeout !== null) { clearTimeout(maxWatchTimeout); maxWatchTimeout = null; }
    requestGPSEnhanced();
  }

  onMount(async () => {
    requestGPSEnhanced();
    try {
      const { auth } = await import('$lib/firebase');
      const { db }   = await import('$lib/firebase');
      const { onAuthStateChanged } = await import('firebase/auth');
      const { collection, query, where, getDocs, doc, getDoc } = await import('firebase/firestore');

      const unsubAuth = onAuthStateChanged(auth, async (user) => {
        if (!user) { window.location.href = '/'; return; }
        staffUid = user.uid;

        // Get staff name
        try {
          const uSnap = await getDoc(doc(db, 'users', user.uid));
          if (uSnap.exists()) staffName = uSnap.data().name ?? user.email ?? 'Staff';
        } catch (e) { console.warn('User profile error:', e); }

        // Load all households created by this staff
        try {
          const hhSnap = await getDocs(
            query(collection(db, 'households'), where('createdBy', '==', user.uid))
          );
          households = hhSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((/** @type {any} */ a, /** @type {any} */ b) => {
              const at = a.createdAt?.toMillis?.() ?? 0;
              const bt = b.createdAt?.toMillis?.() ?? 0;
              return bt - at;
            });
        } catch (e) { console.error('Households load error:', e); }
        householdLoading = false;
      });
      unsubs.push(unsubAuth);
    } catch (e) { console.error(e); householdLoading = false; }
    // Note: GPS cleanup is handled in onDestroy below
  });

  onDestroy(() => {
    unsubs.forEach(u => u());
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    if (maxWatchTimeout !== null) clearTimeout(maxWatchTimeout);
  });

  // ── Select household ───────────────────────────────────
  /** @param {any} hh */
  function selectHousehold(hh) {
    selectedHousehold   = hh;
    showHouseholdPicker = false;
    // Pre-fill address from household if available
    if (hh.houseNo) houseNo = hh.houseNo;
    if (hh.street)  street  = hh.street;
    if (hh.zone)    purok   = hh.zone;
  }

  // ── Photo handler ──────────────────────────────────────
  /** @param {Event} e */
  function handlePhotoChange(e) {
    photoError = '';
    const input = /** @type {HTMLInputElement} */ (e.target);
    const file  = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { photoError = 'Photo must be less than 5MB.'; return; }
    if (!file.type.startsWith('image/')) { photoError = 'Please select an image file.'; return; }
    housePhoto = file;
    const reader = new FileReader();
    reader.onload = (ev) => { housePhotoPreview = /** @type {string} */ (ev.target?.result ?? ''); };
    reader.readAsDataURL(file);
  }

  // ── Step navigation ────────────────────────────────────
  function validateStep1() {
    if (!firstName.trim()) { errorMsg = 'Please enter the first name.'; return false; }
    if (!lastName.trim())  { errorMsg = 'Please enter the last name.'; return false; }
    if (!birthdate)        { errorMsg = 'Please enter the birthdate.'; return false; }
    if (!sex)              { errorMsg = 'Please select sex.'; return false; }
    if (!civilStatus)      { errorMsg = 'Please select civil status.'; return false; }
    return true;
  }

  function nextStep() { errorMsg = ''; if (step === 1 && !validateStep1()) return; step++; }
  function prevStep() { errorMsg = ''; step--; }

  // ── Submit ─────────────────────────────────────────────
  async function handleSubmit() {
    errorMsg = '';
    if (!housePhoto) { errorMsg = 'Please take or upload a photo of the house.'; return; }
    loading = true;

    try {
      const { db } = await import('$lib/firebase');
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');

      // Compress photo
      let photoUrl = '';
      try {
        if (housePhoto) {
          photoUrl = await new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(/** @type {File} */ (housePhoto));
            img.onload = () => {
              const maxW = 800, maxH = 600;
              let w = img.width, h = img.height;
              if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
              if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
              const canvas = document.createElement('canvas');
              canvas.width = w; canvas.height = h;
              canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
              URL.revokeObjectURL(url);
              resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
            img.onerror = () => resolve('');
            img.src = url;
          });
        }
      } catch (photoErr) { console.warn('Photo compression failed:', photoErr); }

      await addDoc(collection(db, 'residents'), {
        // Household link
        householdId: selectedHousehold?.id ?? null,
        qrId:        selectedHousehold?.qrId ?? null,

        // Personal info
        firstName:   firstName.trim(),
        lastName:    lastName.trim(),
        middleName:  middleName.trim(),
        name:        `${firstName.trim()} ${lastName.trim()}`,
        birthdate,
        age:         age ?? 0,
        sex,
        civilStatus,
        contactNo:   contactNo.trim(),

        // Address
        houseNo:     houseNo.trim(),
        street,
        purok,
        zone:        selectedHousehold?.zone ?? purok,
        sector:      selectedHousehold?.zone ?? purok,
        barangay:    'Barangay Pag-Asa',
        city:        'Olongapo City',
        province:    'Zambales',
        region:      'Region III - Central Luzon',
        address:     fullAddress,

        // Categories
        isPWD,
        isSenior,
        isSingleParent,
        pwdType:     isPWD ? pwdType : '',

        // GPS
        lat:         gpsLat,
        lng:         gpsLng,
        gpsAccuracy,
        bestAccuracy,
        gpsAttempts: gpsAttempt,

        // Photo
        photoUrl,

        // Meta — encodedBy is set to staffUid (key difference from self-registration)
        status:      'pending',
        submittedAt: serverTimestamp(),
        encodedBy:   staffUid,   // ← THIS is what makes it "staff encoded"
      });

      submitted = true;
    } catch (e) {
      errorMsg = 'Submission failed. Please check your internet and try again.';
      console.error(e);
    } finally {
      loading = false;
    }
  }

  function resetForm() {
    firstName = ''; lastName = ''; middleName = ''; birthdate = '';
    sex = ''; civilStatus = ''; contactNo = '';
    houseNo = ''; street = ''; purok = '';
    isPWD = false; isSenior = false; isSingleParent = false; pwdType = '';
    housePhoto = null; housePhotoPreview = '';
    step = 1; errorMsg = ''; submitted = false;
    selectedHousehold = null; showHouseholdPicker = true;
  }
</script>

<div class="min-h-screen bg-slate-50 font-inter">

  <!-- Header -->
  <div class="sticky top-0 z-10 px-4 py-3 flex items-center gap-3 shadow-sm"
    style="background: linear-gradient(135deg, #064e3b, #065f46);">
    <div class="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-base shadow shrink-0">📍</div>
    <div>
      <p class="font-nunito font-black text-white text-base leading-none">Encode Registration</p>
      <p class="text-white/60 text-[0.65rem]">Staff: {staffName} · Barangay Pag-Asa</p>
    </div>
    <!-- GPS indicator -->
    <div class="ml-auto flex flex-col items-end gap-0.5">
      <div class="flex items-center gap-1.5">
        {#if gpsStatus === 'granted'}
          <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
          <span class="text-white/70 text-[0.65rem] font-semibold">GPS ✓</span>
        {:else if gpsStatus === 'optimizing'}
          <span class="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
          <span class="text-white/70 text-[0.65rem] font-semibold">Optimizing…</span>
        {:else if gpsStatus === 'pending'}
          <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
          <span class="text-white/70 text-[0.65rem] font-semibold">Getting GPS…</span>
        {:else}
          <span class="w-2 h-2 rounded-full bg-red-400"></span>
          <span class="text-white/70 text-[0.65rem] font-semibold">No GPS</span>
        {/if}
      </div>
      {#if gpsAccuracy !== null}
        <span class="text-white/50 text-[0.6rem] font-semibold">±{gpsAccuracy}m</span>
      {/if}
    </div>
  </div>

  <div class="px-4 py-5 max-w-lg mx-auto space-y-5">

    <!-- ══ SUCCESS STATE ══ -->
    {#if submitted}
      <div class="flex flex-col items-center text-center pt-8">
        <div class="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
          <svg class="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 class="font-nunito font-extrabold text-slate-800 text-2xl mb-2">Resident Encoded!</h2>
        <p class="text-slate-500 text-sm leading-relaxed max-w-xs mb-2">
          Registration submitted successfully. Admin will review and approve.
        </p>
        <p class="text-xs text-emerald-600 font-bold mb-6">Encoded by: {staffName}</p>

        <div class="w-full bg-slate-100 rounded-2xl p-4 text-left space-y-1 mb-6">
          <p class="text-xs text-slate-400 font-bold uppercase tracking-widest mb-2">Submitted Info</p>
          <p class="text-sm font-bold text-slate-700">{firstName} {lastName}</p>
          <p class="text-xs text-slate-500">{sex} · {age} yrs old · {civilStatus}</p>
          <p class="text-xs text-slate-500">{fullAddress}</p>
          <p class="text-xs text-slate-500">Household: {selectedHousehold?.qrId ?? '—'}</p>
          <div class="flex gap-1.5 flex-wrap mt-1">
            {#if isPWD}<span class="text-[0.65rem] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">PWD</span>{/if}
            {#if isSenior}<span class="text-[0.65rem] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Senior Citizen</span>{/if}
            {#if isSingleParent}<span class="text-[0.65rem] font-bold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">Single Parent</span>{/if}
            {#if !isPWD && !isSenior && !isSingleParent}<span class="text-[0.65rem] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Regular Resident</span>{/if}
          </div>
        </div>

        <div class="flex gap-3 w-full">
          <button type="button" on:click={resetForm}
            class="flex-1 py-3 rounded-2xl text-sm font-bold text-white transition-all active:scale-95"
            style="background:#059669;">
            + Encode Another Resident
          </button>
          <button type="button" on:click={() => { window.location.href = '/staff/dashboard'; }}
            class="flex-1 py-3 rounded-2xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all active:scale-95">
            Back to Dashboard
          </button>
        </div>
      </div>

    <!-- ══ HOUSEHOLD PICKER ══ -->
    {:else if showHouseholdPicker}
      <div>
        <h2 class="font-nunito text-xl font-extrabold text-slate-800">Select Household</h2>
        <p class="text-sm text-slate-500 mt-0.5">Choose which household QR this resident belongs to</p>
      </div>

      <!-- Staff badge -->
      <div class="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <svg class="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p class="text-xs text-emerald-700 leading-relaxed">
          You are encoding this registration <strong>on behalf of the resident</strong>. 
          It will be tagged as <strong>Staff encoded by {staffName}</strong>.
        </p>
      </div>

      {#if householdLoading}
        <div class="flex items-center justify-center py-12 text-slate-400">
          <svg class="w-6 h-6 animate-spin mr-2" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" d="M12 2a10 10 0 0 1 0 20"/>
          </svg>
          Loading your households…
        </div>

      {:else if households.length === 0}
        <div class="flex flex-col items-center text-center py-12 text-slate-400">
          <svg class="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
          </svg>
          <p class="text-sm font-semibold text-slate-600">No households found</p>
          <p class="text-xs text-slate-400 mt-1 mb-4">Generate a QR code first before encoding a registration</p>
          <button type="button" on:click={() => { window.location.href = '/staff/generateQR'; }}
            class="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
            style="background:#059669;">
            Generate QR Code
          </button>
        </div>

      {:else}
        <div class="space-y-2">
          {#each households as hh (hh.id)}
            <button type="button" on:click={() => selectHousehold(hh)}
              class="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50 transition-all text-left active:scale-[0.98]">
              <div class="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <svg class="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-nunito font-black text-slate-800 tracking-wider">{hh.qrId}</p>
                <p class="text-sm text-slate-600 mt-0.5">{hh.zone} · Barangay Pag-Asa</p>
                {#if hh.notes}
                  <p class="text-xs text-blue-500 mt-0.5">📝 {hh.notes}</p>
                {/if}
              </div>
              <svg class="w-5 h-5 text-slate-300 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          {/each}
        </div>
      {/if}

    <!-- ══ REGISTRATION FORM ══ -->
    {:else}

      <!-- Selected household banner -->
      <div class="flex items-center gap-3 bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-sm">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background:#064e3b;">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-nunito font-black text-slate-800 text-sm">{selectedHousehold?.qrId}</p>
          <p class="text-xs text-slate-500">{selectedHousehold?.zone} · Brgy. Pag-Asa</p>
        </div>
        <button type="button" on:click={() => { showHouseholdPicker = true; step = 1; }}
          class="text-xs font-bold text-blue-600 hover:underline shrink-0">
          Change
        </button>
      </div>

      <!-- GPS status banner -->
      {#if gpsStatus === 'pending' || gpsStatus === 'optimizing'}
        <div class="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <svg class="w-4 h-4 text-blue-500 mt-0.5 shrink-0 animate-spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M12 2a10 10 0 0 1 0 20"/>
          </svg>
          <div>
            <p class="text-xs font-bold text-blue-700">{gpsMessage}</p>
            {#if gpsStatus === 'optimizing'}
              <p class="text-xs text-blue-600 mt-1">Keep phone steady · Go outdoors for better signal</p>
            {/if}
          </div>
        </div>
      {:else if gpsStatus === 'granted'}
        <div class="flex items-start gap-2.5 rounded-xl px-4 py-3
          {gpsAccuracy !== null && gpsAccuracy > 50 ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}">
          <svg class="w-4 h-4 mt-0.5 shrink-0 {gpsAccuracy !== null && gpsAccuracy > 50 ? 'text-amber-500' : 'text-green-500'}"
            fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
          </svg>
          <div>
            <p class="text-xs font-bold {gpsAccuracy !== null && gpsAccuracy > 50 ? 'text-amber-700' : 'text-green-700'}">{gpsMessage}</p>
            <p class="text-xs mt-0.5 {gpsAccuracy !== null && gpsAccuracy > 50 ? 'text-amber-600' : 'text-green-600'}">{accuracyQuality}</p>
          </div>
        </div>
      {:else}
        <div class="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <svg class="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          <div>
            <p class="text-xs font-bold text-amber-700">{gpsMessage}</p>
            <button type="button" on:click={retryGPS} class="text-xs text-amber-600 underline font-bold mt-0.5">🔄 Retry GPS</button>
          </div>
        </div>
      {/if}

      <!-- Step indicator -->
      <div class="flex items-center gap-2">
        {#each [1,2,3] as s (s)}
          <div class="flex items-center gap-2 flex-1">
            <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold transition-all
                        {step === s ? 'text-white shadow-sm' : step > s ? 'text-white' : 'bg-slate-200 text-slate-400'}"
              style="{step === s ? 'background:#064e3b;' : step > s ? 'background:#059669;' : ''}">
              {#if step > s}
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              {:else}{s}{/if}
            </div>
            <span class="text-xs font-semibold {step === s ? 'text-slate-700' : 'text-slate-400'}">
              {s === 1 ? 'Personal' : s === 2 ? 'Categories' : 'Photo'}
            </span>
            {#if s < 3}<div class="flex-1 h-0.5 bg-slate-200 rounded-full mx-1"></div>{/if}
          </div>
        {/each}
      </div>

      {#if errorMsg}
        <div class="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold px-4 py-3 rounded-xl">
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          {errorMsg}
        </div>
      {/if}

      <!-- ══ STEP 1: Personal Info ══ -->
      {#if step === 1}
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 class="font-nunito font-extrabold text-slate-700">Resident's Personal Information</h3>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">First Name <span class="text-red-400">*</span></label>
              <input type="text" bind:value={firstName} placeholder="Juan"
                class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100 transition-all" />
            </div>
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Last Name <span class="text-red-400">*</span></label>
              <input type="text" bind:value={lastName} placeholder="Dela Cruz"
                class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100 transition-all" />
            </div>
          </div>

          <div>
            <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Middle Name</label>
            <input type="text" bind:value={middleName} placeholder="Santos (optional)"
              class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100 transition-all" />
          </div>

          <div>
            <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Birthdate <span class="text-red-400">*</span></label>
            <input type="date" bind:value={birthdate}
              class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100 transition-all" />
            {#if age !== null}
              <p class="text-xs text-slate-400 mt-1.5 ml-1">Age: <span class="font-bold text-slate-600">{age} years old</span>
                {#if age >= 60}<span class="ml-1 text-emerald-600 font-bold">· Senior Citizen ✓</span>{/if}
              </p>
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Sex <span class="text-red-400">*</span></label>
              <div class="relative">
                <select bind:value={sex}
                  class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100 transition-all appearance-none cursor-pointer">
                  <option value="" disabled selected>Select</option>
                  <option>Male</option><option>Female</option>
                </select>
                <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
                </svg>
              </div>
            </div>
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Civil Status <span class="text-red-400">*</span></label>
              <div class="relative">
                <select bind:value={civilStatus}
                  class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100 transition-all appearance-none cursor-pointer">
                  <option value="" disabled selected>Select</option>
                  <option>Single</option><option>Married</option>
                  <option>Widowed</option><option>Separated</option>
                </select>
                <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
                </svg>
              </div>
            </div>
          </div>

          <div>
            <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Contact Number</label>
            <input type="tel" bind:value={contactNo} placeholder="09XX-XXX-XXXX"
              class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100 transition-all" />
          </div>
        </div>

        <!-- Address -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 class="font-nunito font-extrabold text-slate-700">Address</h3>

          <div><label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Region</label>
            <div class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-100 text-slate-500 text-sm cursor-not-allowed">Region III — Central Luzon</div></div>

          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Province</label>
              <div class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-100 text-slate-500 text-sm cursor-not-allowed">Zambales</div></div>
            <div><label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">City</label>
              <div class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-100 text-slate-500 text-sm cursor-not-allowed">Olongapo City</div></div>
          </div>

          <div><label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Barangay</label>
            <div class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-100 text-slate-500 text-sm cursor-not-allowed">Barangay Pag-Asa</div></div>

          <div>
            <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Street</label>
            <div class="relative">
              <select bind:value={street}
                class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100 transition-all appearance-none cursor-pointer {street === '' ? 'text-slate-300' : 'text-slate-700'}">
                <option value="">Select street</option>
                {#each streets as s (s)}<option value={s}>{s}</option>{/each}
              </select>
              <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
              </svg>
            </div>
          </div>

          <div>
            <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">House No. / Unit / Block</label>
            <input type="text" bind:value={houseNo} placeholder="e.g. 47 or Unit 3B"
              class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100 transition-all" />
          </div>

          <div class="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
            <p class="text-[0.65rem] font-bold uppercase tracking-widest text-emerald-400 mb-1">Full Address Preview</p>
            <p class="text-xs text-emerald-700 font-semibold leading-relaxed">
              {fullAddress || 'Barangay Pag-Asa, Olongapo City, Zambales'}
            </p>
          </div>
        </div>

      <!-- ══ STEP 2: Categories ══ -->
      {:else if step === 2}
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div>
            <h3 class="font-nunito font-extrabold text-slate-700">Resident Categories</h3>
            <p class="text-xs text-slate-400 mt-0.5">Select all that apply</p>
          </div>

          <!-- PWD -->
          <button type="button" on:click={() => isPWD = !isPWD}
            class="w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all {isPWD ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-slate-50'}">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 {isPWD ? 'bg-amber-400' : 'bg-slate-200'}">
              <svg class="w-5 h-5 {isPWD ? 'text-white' : 'text-slate-400'}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </div>
            <div class="flex-1 text-left">
              <p class="font-bold text-slate-700 text-sm">Person with Disability (PWD)</p>
              <p class="text-xs text-slate-400">Physical, mental, or sensory disability</p>
            </div>
            <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 {isPWD ? 'border-amber-400 bg-amber-400' : 'border-slate-300'}">
              {#if isPWD}<svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>{/if}
            </div>
          </button>
          {#if isPWD}
            <div class="ml-4">
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Type of Disability</label>
              <div class="relative">
                <select bind:value={pwdType} class="w-full px-3 py-2.5 rounded-xl border-2 border-amber-200 bg-amber-50 text-slate-700 text-sm outline-none focus:border-amber-400 transition-all appearance-none cursor-pointer">
                  <option value="">Select type</option>
                  <option>Physical Disability</option><option>Visual Impairment</option>
                  <option>Hearing Impairment</option><option>Intellectual Disability</option>
                  <option>Psychosocial Disability</option><option>Learning Disability</option>
                  <option>Speech & Language Impairment</option><option>Multiple Disability</option>
                </select>
                <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
              </div>
            </div>
          {/if}

          <!-- Senior -->
          <button type="button" on:click={() => isSenior = !isSenior}
            class="w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all {isSenior ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50'}">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 {isSenior ? 'bg-emerald-500' : 'bg-slate-200'}">
              <svg class="w-5 h-5 {isSenior ? 'text-white' : 'text-slate-400'}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
            </div>
            <div class="flex-1 text-left">
              <p class="font-bold text-slate-700 text-sm">Senior Citizen</p>
              <p class="text-xs text-slate-400">60 years old and above {age !== null && age >= 60 ? '· Auto-detected ✓' : ''}</p>
            </div>
            <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 {isSenior ? 'border-emerald-400 bg-emerald-400' : 'border-slate-300'}">
              {#if isSenior}<svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>{/if}
            </div>
          </button>

          <!-- Single Parent -->
          <button type="button" on:click={() => isSingleParent = !isSingleParent}
            class="w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all {isSingleParent ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-slate-50'}">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 {isSingleParent ? 'bg-violet-500' : 'bg-slate-200'}">
              <svg class="w-5 h-5 {isSingleParent ? 'text-white' : 'text-slate-400'}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>
            <div class="flex-1 text-left">
              <p class="font-bold text-slate-700 text-sm">Single Parent</p>
              <p class="text-xs text-slate-400">Solo parent with child/children</p>
            </div>
            <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 {isSingleParent ? 'border-violet-400 bg-violet-400' : 'border-slate-300'}">
              {#if isSingleParent}<svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>{/if}
            </div>
          </button>

          {#if !isPWD && !isSenior && !isSingleParent}
            <div class="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <svg class="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <p class="text-xs text-blue-600">Will be registered as a <strong>Regular Resident</strong>.</p>
            </div>
          {/if}
        </div>

      <!-- ══ STEP 3: Photo + Confirm ══ -->
      {:else if step === 3}
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div>
            <h3 class="font-nunito font-extrabold text-slate-700">House Photo</h3>
            <p class="text-xs text-slate-400 mt-0.5">Required — take a clear photo of the front of the house</p>
          </div>

          {#if housePhotoPreview}
            <div class="relative rounded-xl overflow-hidden border-2 border-emerald-300">
              <img src={housePhotoPreview} alt="House" class="w-full h-48 object-cover" />
              <button type="button" on:click={() => { housePhoto = null; housePhotoPreview = ''; }}
                class="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shadow">
                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
              <div class="absolute bottom-2 left-2 bg-black/50 text-white text-xs font-bold px-2 py-1 rounded-lg">✓ Photo captured</div>
            </div>
          {:else}
            <label class="flex flex-col items-center justify-center gap-3 p-6 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-all bg-slate-50">
              <div class="w-14 h-14 rounded-2xl bg-slate-200 flex items-center justify-center">
                <svg class="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              </div>
              <div class="text-center">
                <p class="text-sm font-bold text-slate-700">Take Photo or Upload</p>
                <p class="text-xs text-slate-400 mt-0.5">Front view of the house · Max 5MB</p>
              </div>
              <input type="file" accept="image/*" capture="environment" on:change={handlePhotoChange} class="hidden" />
            </label>
          {/if}
          {#if photoError}<p class="text-xs text-red-500 font-semibold">{photoError}</p>{/if}

          <!-- Review summary -->
          <div class="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
            <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-2">Review Info</p>
            <p class="text-sm font-bold text-slate-700">{firstName} {lastName}</p>
            <p class="text-xs text-slate-500">{sex} · {age} yrs old · {civilStatus}</p>
            <p class="text-xs text-slate-500">{fullAddress || 'Barangay Pag-Asa, Olongapo City, Zambales'}</p>
            <p class="text-xs text-slate-500">Household: {selectedHousehold?.qrId}</p>
            <div class="flex gap-1.5 flex-wrap mt-1">
              {#if isPWD}<span class="text-[0.65rem] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">PWD</span>{/if}
              {#if isSenior}<span class="text-[0.65rem] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Senior Citizen</span>{/if}
              {#if isSingleParent}<span class="text-[0.65rem] font-bold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">Single Parent</span>{/if}
              {#if !isPWD && !isSenior && !isSingleParent}<span class="text-[0.65rem] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Regular Resident</span>{/if}
            </div>
            <!-- GPS -->
            <div class="border-t border-slate-200 pt-2 mt-2">
              <p class="text-[0.65rem] font-bold text-slate-600 uppercase tracking-widest">📍 GPS</p>
              {#if gpsStatus === 'granted' || gpsStatus === 'optimizing'}
                <p class="text-xs text-green-600 font-semibold mt-0.5">✓ Location captured (±{gpsAccuracy}m)</p>
                <p class="text-[0.7rem] text-slate-400 font-mono">{gpsLat?.toFixed(6)}, {gpsLng?.toFixed(6)}</p>
              {:else}
                <p class="text-xs text-amber-600 font-semibold mt-0.5">No GPS — submission allowed</p>
              {/if}
            </div>
            <!-- Staff tag -->
            <div class="border-t border-slate-200 pt-2 mt-1">
              <p class="text-[0.65rem] font-bold text-emerald-600">👤 Encoded by: {staffName}</p>
            </div>
          </div>
        </div>
      {/if}

      <!-- Nav buttons -->
      <div class="flex gap-3 pb-6">
        {#if step > 1}
          <button type="button" on:click={prevStep} disabled={loading}
            class="flex-1 py-3.5 rounded-2xl text-sm font-bold text-slate-600 bg-white border-2 border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition-all disabled:opacity-50">
            ← Back
          </button>
        {/if}
        {#if step < 3}
          <button type="button" on:click={nextStep}
            class="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white active:scale-[0.98] transition-all shadow-lg"
            style="background:#064e3b;">
            Next →
          </button>
        {:else}
          <button type="button" on:click={handleSubmit} disabled={loading}
            class="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white active:scale-[0.98] transition-all shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
            style="background:#059669;">
            {#if loading}
              <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              Submitting…
            {:else}
              ✓ Submit Registration
            {/if}
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>