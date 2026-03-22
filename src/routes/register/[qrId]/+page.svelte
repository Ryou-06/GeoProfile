<!-- PUBLIC PWA form — no login required -->
<!-- src/routes/register/[qrId]/+page.svelte -->
<!-- ngrok http --domain=overlavishly-unsequential-janean.ngrok-free.dev 5173 - for running in online -->


<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  // ── QR / Household ─────────────────────────────────────
  $: qrId = $page.params.qrId;
  /** @type {any} */
  let household = null;
  let householdLoading = true;
  let householdError   = '';

  // ── GPS (Enhanced with Better Accuracy) ────────────────
  let gpsLat      = /** @type {number|null} */ (null);
  let gpsLng      = /** @type {number|null} */ (null);
  let gpsAccuracy = /** @type {number|null} */ (null); // in meters
  let gpsStatus   = 'pending'; // 'pending' | 'granted' | 'denied' | 'error' | 'optimizing'
  let gpsAttempt  = 0;
  let maxGpsRetries = 5;
  let watchId = /** @type {number|null} */ (null);
  let bestAccuracy = /** @type {number|null} */ (null);
  let gpsMessage = 'Requesting GPS location...';
  let maxWatchTimeout = /** @type {NodeJS.Timeout|null} */ (null);

  // ── Form fields ────────────────────────────────────────
  let firstName    = '';
  let lastName     = '';
  let middleName   = '';
  let birthdate    = '';
  let sex          = '';
  let civilStatus  = '';
  let contactNo    = '';

  // ── Address fields ─────────────────────────────────────
  let houseNo  = '';   // House number, unit, or block — user-entered
  let street   = '';   // Street — dropdown
  let purok    = '';   // Purok / Sitio — dropdown

  const streets = [
    'Gordon Avenue',
    'Murphy Street',
    'Natividad Street',
    'Burgos Street',
    'Cladiola Street',
    'East 12th Street',
    'Perimeter Road',
    'Bonifacio Street',
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
  let step      = 1; // 1=personal, 2=categories, 3=photo+confirm
  let loading   = false;
  let errorMsg  = '';
  let submitted = false;

  // ── Age computed from birthdate ────────────────────────
  $: age = birthdate
    ? Math.floor((Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;
  // Auto-check Senior if age >= 60
  $: if (age !== null && age >= 60) isSenior = true;

  // ── Full address preview ────────────────────────────────
  $: fullAddress = [houseNo.trim(), street, purok, 'Barangay Pag-Asa', 'Olongapo City', 'Zambales']
    .filter(Boolean)
    .join(', ');

  // ── Accuracy quality indicator ──────────────────────────
  $: accuracyQuality = gpsAccuracy === null 
    ? 'Unknown'
    : gpsAccuracy <= 10 
    ? '🟢 Excellent (±10m)'
    : gpsAccuracy <= 25 
    ? '🟡 Good (±25m)'
    : gpsAccuracy <= 50 
    ? '🟠 Fair (±50m)'
    : '🔴 Poor (>50m)';

  // ── Load household info on mount ───────────────────────
  onMount(async () => {
    // Get qrId directly from URL (reactive $: may not be ready in onMount)
    const currentQrId = window.location.pathname.split('/').pop() ?? '';

    requestGPSEnhanced();
    if (currentQrId) localStorage.setItem('last_qr_id', currentQrId);

    try {
      const { db } = await import('$lib/firebase');
      const { collection, query, where, getDocs } = await import('firebase/firestore');

      const snap = await getDocs(
        query(collection(db, 'households'), where('qrId', '==', currentQrId))
      );

      if (snap.empty) {
        householdError = 'This QR code is invalid or has expired. Please contact your Barangay staff.';
      } else {
        household = { id: snap.docs[0].id, ...snap.docs[0].data() };
        // Pre-fill from household if available
        if (household?.houseNo) houseNo = household.houseNo;
        if (household?.street)  street  = household.street;
        if (household?.zone)    purok   = household.zone;
      }
    } catch (e) {
      householdError = 'Could not load household info. Please check your internet connection.';
      console.error(e);
    } finally {
      householdLoading = false;
    }
  });

  // ── HELPER: Validate location is realistic ─────────────
  /**
   * @param {number} lat
   * @param {number} lng
   * @param {number} accuracy
   * @returns {boolean}
   */
  function isValidLocation(lat, lng, accuracy) {
    // Reject impossible coordinates
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.warn('❌ Invalid location: coordinates out of range', { lat, lng });
      return false;
    }

    // Reject unrealistic accuracy (>1000m usually means cellular triangulation only)
    if (accuracy > 1000) {
      console.warn('❌ Invalid location: accuracy too poor (>1000m)', { accuracy });
      return false;
    }

    // Reject if we have previous data and this is too far away (>500m jump)
    if (gpsLat !== null && gpsLng !== null) {
      const distance = calculateDistance(gpsLat, gpsLng, lat, lng);
      if (distance > 0.5) { // 0.5 km = 500m
        console.warn('❌ Invalid location: jumped >500m away', { distance });
        return false;
      }
    }

    return true;
  }

  // ── HELPER: Calculate distance between two coordinates ──
  /**
   * @param {number} lat1
   * @param {number} lon1
   * @param {number} lat2
   * @param {number} lon2
   * @returns {number} distance in km
   */
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ── Enhanced GPS Request with Better Accuracy ──────────
  function requestGPSEnhanced() {
    if (!navigator.geolocation) {
      gpsStatus = 'error';
      gpsMessage = 'Geolocation is not supported by your browser.';
      return;
    }

    gpsStatus = 'pending';
    gpsAttempt = 0;
    bestAccuracy = null;
    gpsMessage = 'Requesting GPS location... (attempt 1/' + maxGpsRetries + ')';

    // Clear any previous watch
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }

    // Clear any previous timeout
    if (maxWatchTimeout !== null) {
      clearTimeout(maxWatchTimeout);
      maxWatchTimeout = null;
    }

    // Set a maximum timeout to stop watching (30 seconds hard limit)
    maxWatchTimeout = setTimeout(() => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (gpsStatus === 'pending' || gpsStatus === 'optimizing') {
        gpsStatus = 'error';
        gpsMessage = 'GPS request timed out (30s). Please go outdoors and try again.';
      }
    }, 30000);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        const newAccuracy = Math.round(pos.coords.accuracy * 10) / 10;

        // ── VALIDATION: Reject bad positions ──
        if (!isValidLocation(newLat, newLng, newAccuracy)) {
          return; // Skip this bad reading silently
        }

        gpsLat = newLat;
        gpsLng = newLng;
        gpsAccuracy = newAccuracy;

        // Track best accuracy achieved
        if (bestAccuracy === null || gpsAccuracy < bestAccuracy) {
          bestAccuracy = gpsAccuracy;
        }

        gpsAttempt++;

        // Log for debugging
        console.log(`✓ GPS Update ${gpsAttempt}:`, {
          lat: gpsLat,
          lng: gpsLng,
          accuracy: gpsAccuracy,
          bestAccuracy: bestAccuracy,
          timestamp: new Date().toISOString()
        });

        // ── STOP CONDITIONS ──
        if (gpsAccuracy <= 10) {
          // Excellent accuracy (±10m) - stop immediately
          gpsStatus = 'granted';
          gpsMessage = `📍 Excellent! Location confirmed (±${gpsAccuracy}m accuracy)`;
          if (maxWatchTimeout !== null) {
            clearTimeout(maxWatchTimeout);
            maxWatchTimeout = null;
          }
          if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
          }
        } else if (gpsAccuracy <= 25) {
          // Good accuracy (±25m) - confirm with 2 readings
          if (gpsAttempt >= 2) {
            gpsStatus = 'granted';
            gpsMessage = `✓ Location acquired (±${gpsAccuracy}m accuracy)`;
            if (maxWatchTimeout !== null) {
              clearTimeout(maxWatchTimeout);
              maxWatchTimeout = null;
            }
            if (watchId !== null) {
              navigator.geolocation.clearWatch(watchId);
              watchId = null;
            }
          } else {
            gpsStatus = 'optimizing';
            gpsMessage = `Optimizing... (±${gpsAccuracy}m) • Getting 2nd reading for confirmation`;
          }
        } else if (gpsAttempt >= maxGpsRetries) {
          // Max retries reached - use best we have
          gpsStatus = 'granted';
          gpsMessage = `📍 Location locked (±${gpsAccuracy}m - Best effort after ${gpsAttempt} attempts)`;
          if (maxWatchTimeout !== null) {
            clearTimeout(maxWatchTimeout);
            maxWatchTimeout = null;
          }
          if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
          }
        } else {
          // Still optimizing
          gpsStatus = 'optimizing';
          const remainingRetries = maxGpsRetries - gpsAttempt;
          gpsMessage = `Optimizing accuracy (±${gpsAccuracy}m) • ${remainingRetries} more attempts • Keep phone steady`;
        }
      },
      (err) => {
        console.error('❌ GPS Error Code:', err.code, 'Message:', err.message);
        if (maxWatchTimeout !== null) {
          clearTimeout(maxWatchTimeout);
          maxWatchTimeout = null;
        }

        if (err.code === err.PERMISSION_DENIED) {
          gpsStatus = 'denied';
          gpsMessage = 'Location permission denied. Go to Settings > Location and grant "Always" access.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          gpsStatus = 'error';
          gpsMessage = 'GPS unavailable. Please go outdoors and ensure GPS is enabled in settings.';
        } else if (err.code === err.TIMEOUT) {
          gpsStatus = 'error';
          gpsMessage = 'GPS request timed out. Move outdoors, away from buildings, and try again.';
        } else {
          gpsStatus = 'error';
          gpsMessage = 'GPS error: ' + err.message;
        }
      },
      {
        enableHighAccuracy: true,      // ✓ Use actual GPS hardware
        timeout: 10000,                // ✓ Wait up to 10 seconds per attempt
        maximumAge: 0,                 // ✓ Always get fresh data (no cache)
      }
    );
  }

  // ── Manual GPS Retry ───────────────────────────────────
  function retryGPS() {
    gpsAttempt = 0;
    bestAccuracy = null;
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (maxWatchTimeout !== null) {
      clearTimeout(maxWatchTimeout);
      maxWatchTimeout = null;
    }
    requestGPSEnhanced();
  }

  // ── Cleanup GPS on component unmount ───────────────────
  onMount(() => {
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (maxWatchTimeout !== null) {
        clearTimeout(maxWatchTimeout);
        maxWatchTimeout = null;
      }
    };
  });

  // ── House photo handler ────────────────────────────────
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

  // ── Step validation ────────────────────────────────────
  function validateStep1() {
    if (!firstName.trim())  { errorMsg = 'Please enter your first name.'; return false; }
    if (!lastName.trim())   { errorMsg = 'Please enter your last name.'; return false; }
    if (!birthdate)         { errorMsg = 'Please enter your birthdate.'; return false; }
    if (!sex)               { errorMsg = 'Please select your sex.'; return false; }
    if (!civilStatus)       { errorMsg = 'Please select your civil status.'; return false; }
    return true;
  }

  function nextStep() {
    errorMsg = '';
    if (step === 1 && !validateStep1()) return;
    step++;
  }

  function prevStep() {
    errorMsg = '';
    step--;
  }

  // ── Submit ���────────────────────────────────────────────
  async function handleSubmit() {
    errorMsg = '';
    if (!housePhoto) { errorMsg = 'Please take or upload a photo of the house. This is required.'; return; }

    loading = true;
    try {
      const { db }   = await import('$lib/firebase');
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');

      // Compress photo before saving
      let photoUrl = '';
      try {
        if (housePhoto) {
          photoUrl = await new Promise((resolve) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(/** @type {File} */ (housePhoto));
            img.onload = () => {
              const maxW = 800, maxH = 600;
              let w = img.width, h = img.height;
              if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
              if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
              const canvas = document.createElement('canvas');
              canvas.width = w; canvas.height = h;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0, w, h);
              URL.revokeObjectURL(objectUrl);
              resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
            img.onerror = () => resolve('');
            img.src = objectUrl;
          });
        }
      } catch (photoErr) {
        console.warn('Photo compression failed, continuing without photo:', photoErr);
      }

      await addDoc(collection(db, 'residents'), {
        // Household link
        householdId: household?.id ?? null,
        qrId,

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

        // Full structured address
        houseNo:     houseNo.trim(),
        street:      street,
        purok,
        zone:        purok,
        sector:      purok,
        landmark:    household?.landmark ?? '',
        barangay:    'Barangay Pag-Asa',
        city:        'Olongapo City',
        province:    'Zambales',
        region:      'Region III - Central Luzon',
        address:     fullAddress,

        // Categories
        isPWD,
        isSenior,
        isSingleParent,
        pwdType: isPWD ? pwdType : '',

        // GPS (Enhanced with better accuracy)
        lat:         gpsLat,
        lng:         gpsLng,
        gpsAccuracy,
        bestAccuracy,
        gpsAttempts: gpsAttempt,

        // Photo
        photoUrl,

        // Meta
        status:      'pending',
        submittedAt: serverTimestamp(),
        encodedBy:   null,
      });

      submitted = true;
      localStorage.removeItem('last_qr_id');
    } catch (e) {
      errorMsg = 'Submission failed. Please check your internet and try again.';
      console.error(e);
    } finally {
      loading = false;
    }
  }
</script>

<!-- PWA meta -->
<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="theme-color" content="#0f2060" />
  <title>GeoProfile — Resident Registration</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 font-inter">

  <!-- Header -->
  <div class="sticky top-0 z-10 px-4 py-3 flex items-center gap-3 shadow-sm"
    style="background: linear-gradient(135deg, #0f2060, #1a4fa0);">
    <div class="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-base shadow shrink-0">📍</div>
    <div>
      <p class="font-nunito font-black text-white text-base leading-none">GeoProfile</p>
      <p class="text-white/60 text-[0.65rem]">Barangay Pag-Asa · Resident Registration</p>
    </div>
    <!-- GPS indicator (Enhanced) -->
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
        {:else if gpsStatus === 'denied'}
          <span class="w-2 h-2 rounded-full bg-red-400"></span>
          <span class="text-white/70 text-[0.65rem] font-semibold">GPS blocked</span>
        {:else}
          <span class="w-2 h-2 rounded-full bg-slate-400"></span>
          <span class="text-white/70 text-[0.65rem] font-semibold">No GPS</span>
        {/if}
      </div>
      {#if gpsAccuracy !== null}
        <span class="text-white/50 text-[0.6rem] font-semibold">±{gpsAccuracy}m</span>
      {/if}
    </div>
  </div>

  <!-- Loading household -->
  {#if householdLoading}
    <div class="flex flex-col items-center justify-center py-20 text-slate-400">
      <svg class="w-8 h-8 animate-spin mb-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" d="M12 2a10 10 0 0 1 0 20"/>
      </svg>
      <p class="text-sm font-semibold">Loading…</p>
    </div>

  <!-- Invalid QR -->
  {:else if householdError}
    <div class="p-6 flex flex-col items-center text-center">
      <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h2 class="font-nunito font-extrabold text-slate-700 text-lg mb-2">Invalid QR Code</h2>
      <p class="text-sm text-slate-500">{householdError}</p>
    </div>

  <!-- Success screen -->
  {:else if submitted}
    <div class="p-6 flex flex-col items-center text-center">
      <div class="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-5 mt-8">
        <svg class="w-10 h-10 text-green-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 class="font-nunito font-extrabold text-slate-800 text-2xl mb-2">Registered!</h2>
      <p class="text-slate-500 text-sm leading-relaxed max-w-xs mb-6">
        Your registration has been submitted successfully. The Barangay Admin will review and approve your submission.
      </p>
      <div class="w-full max-w-xs bg-slate-100 rounded-2xl p-4 text-left space-y-2">
        <p class="text-xs text-slate-400 font-bold uppercase tracking-widest mb-2">Submitted Info</p>
        <p class="text-sm font-bold text-slate-700">{firstName} {lastName}</p>
        <p class="text-xs text-slate-500">{fullAddress}</p>
        <div class="flex gap-1.5 flex-wrap mt-1">
          {#if isPWD}<span class="text-[0.65rem] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">PWD</span>{/if}
          {#if isSenior}<span class="text-[0.65rem] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Senior Citizen</span>{/if}
          {#if isSingleParent}<span class="text-[0.65rem] font-bold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">Single Parent</span>{/if}
          {#if !isPWD && !isSenior && !isSingleParent}<span class="text-[0.65rem] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Regular Resident</span>{/if}
        </div>
        <!-- GPS Info in success screen -->
        <div class="border-t border-slate-300 pt-2 mt-2">
          <p class="text-xs font-semibold text-slate-600">📍 Location Data</p>
          <p class="text-[0.7rem] text-slate-500 mt-1">Accuracy: ±{gpsAccuracy ?? 'N/A'}m</p>
          {#if gpsLat && gpsLng}
            <p class="text-[0.7rem] text-slate-500 font-mono">{gpsLat.toFixed(6)}, {gpsLng.toFixed(6)}</p>
          {/if}
        </div>
      </div>
    </div>

  <!-- Registration form -->
  {:else}
    <div class="px-4 py-5 max-w-lg mx-auto space-y-5">

      <!-- Household info banner -->
      <div class="flex items-center gap-3 bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-sm">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background:#0f2060;">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
        <div class="min-w-0">
          <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">Household</p>
          <p class="font-bold text-slate-700 text-sm truncate">{household?.houseNo} {household?.street}</p>
          <p class="text-xs text-slate-500">{household?.zone}, Brgy. Pag-Asa · {qrId}</p>
        </div>
      </div>

      <!-- Enhanced GPS Status Banner -->
      {#if gpsStatus === 'pending' || gpsStatus === 'optimizing'}
        <div class="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 animate-pulse">
          <svg class="w-4 h-4 text-blue-500 mt-0.5 shrink-0 animate-spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" opacity="0.3"/>
            <path d="M12 2a10 10 0 0 1 0 20" stroke="currentColor" stroke-width="2"/>
          </svg>
          <div class="flex-1">
            <p class="text-xs font-bold text-blue-700">{gpsMessage}</p>
            {#if gpsStatus === 'optimizing'}
              <p class="text-xs text-blue-600 mt-1">📍 Tips: Go outdoors, away from buildings · Keep phone steady</p>
            {/if}
          </div>
        </div>
 {:else if gpsStatus === 'granted'}
  <div class="flex items-start gap-2.5 rounded-xl px-4 py-3
    {gpsAccuracy !== null && gpsAccuracy > 50
      ? 'bg-amber-50 border border-amber-200'
      : 'bg-green-50 border border-green-200'}">
    <svg class="w-4 h-4 mt-0.5 shrink-0
      {gpsAccuracy !== null && gpsAccuracy > 50 ? 'text-amber-500' : 'text-green-500'}"
      fill="currentColor" viewBox="0 0 24 24">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
    </svg>
    <div class="flex-1">
      <p class="text-xs font-bold
        {gpsAccuracy !== null && gpsAccuracy > 50 ? 'text-amber-700' : 'text-green-700'}">
        {gpsMessage}
      </p>
      <p class="text-xs mt-0.5
        {gpsAccuracy !== null && gpsAccuracy > 50 ? 'text-amber-600' : 'text-green-600'}">
        {accuracyQuality}
      </p>
      {#if gpsAccuracy !== null && gpsAccuracy > 50}
        <p class="text-xs text-amber-600 mt-1">
          Poor accuracy detected after {gpsAttempt} attempts. Go outdoors and
          <button type="button" on:click={retryGPS}
            class="underline font-bold hover:text-amber-800">
            🔄 retry for better signal
          </button>
          — or continue with current location.
        </p>
      {/if}
    </div>
  </div>
      {:else if gpsStatus === 'denied' || gpsStatus === 'error'}
        <div class="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <svg class="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          <div class="flex-1">
            <p class="text-xs font-bold text-amber-700">{gpsMessage}</p>
            <p class="text-xs text-amber-600 mt-0.5">
              <button type="button" on:click={retryGPS} class="underline font-bold hover:text-amber-800">
                🔄 Retry GPS
              </button>
              · You can still submit without precise GPS.
            </p>
          </div>
        </div>
      {/if}

      <!-- Step indicator -->
      <div class="flex items-center gap-2">
        {#each [1,2,3] as s (s)}
          <div class="flex items-center gap-2 flex-1">
            <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold transition-all
                        {step === s ? 'text-white shadow-sm' : step > s ? 'text-white' : 'bg-slate-200 text-slate-400'}"
              style="{step === s ? 'background:#0f2060;' : step > s ? 'background:#059669;' : ''}">
              {#if step > s}
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              {:else}
                {s}
              {/if}
            </div>
            <span class="text-xs font-semibold {step === s ? 'text-slate-700' : 'text-slate-400'}">
              {s === 1 ? 'Personal' : s === 2 ? 'Categories' : 'Photo'}
            </span>
            {#if s < 3}<div class="flex-1 h-0.5 bg-slate-200 rounded-full mx-1"></div>{/if}
          </div>
        {/each}
      </div>

      <!-- Error banner -->
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
          <h3 class="font-nunito font-extrabold text-slate-700">Personal Information</h3>

          <!-- Name row -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">First Name <span class="text-red-400">*</span></label>
              <input type="text" bind:value={firstName} placeholder="Juan"
                class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all" />
            </div>
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Last Name <span class="text-red-400">*</span></label>
              <input type="text" bind:value={lastName} placeholder="Dela Cruz"
                class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all" />
            </div>
          </div>

          <div>
            <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Middle Name</label>
            <input type="text" bind:value={middleName} placeholder="Santos (optional)"
              class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all" />
          </div>

          <div>
            <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Birthdate <span class="text-red-400">*</span></label>
            <input type="date" bind:value={birthdate}
              class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all" />
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
                  class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all appearance-none cursor-pointer
                         {sex === '' ? 'text-slate-300' : ''}">
                  <option value="" disabled selected>Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Civil Status <span class="text-red-400">*</span></label>
              <div class="relative">
                <select bind:value={civilStatus}
                  class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all appearance-none cursor-pointer
                         {civilStatus === '' ? 'text-slate-300' : ''}">
                  <option value="" disabled selected>Select</option>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Widowed">Widowed</option>
                  <option value="Separated">Separated</option>
                </select>
                <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <div>
            <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Contact Number</label>
            <input type="tel" bind:value={contactNo} placeholder="09XX-XXX-XXXX"
              class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all" />
          </div>
        </div>

        <!-- ── Address section ── -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div class="flex items-center gap-1.5">
            <h3 class="font-nunito font-extrabold text-slate-700">Address</h3>
            <span class="text-[0.65rem] text-slate-400 font-normal"></span>
          </div>

          <!-- Region (locked) -->
          <div>
            <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Region</label>
            <div class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-100 text-slate-500 text-sm cursor-not-allowed select-none">
              Region III — Central Luzon
            </div>
          </div>

          <!-- Province + City (locked) -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Province</label>
              <div class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-100 text-slate-500 text-sm cursor-not-allowed select-none">
                Zambales
              </div>
            </div>
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">City / Municipality</label>
              <div class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-100 text-slate-500 text-sm cursor-not-allowed select-none">
                Olongapo City
              </div>
            </div>
          </div>

          <!-- Barangay (locked) -->
          <div>
            <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Barangay</label>
            <div class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-100 text-slate-500 text-sm cursor-not-allowed select-none">
              Barangay Pag-Asa
            </div>
          </div>

          <!-- Street dropdown -->
          <div>
            <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Street</label>
            <div class="relative">
              <select bind:value={street}
                class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all appearance-none cursor-pointer
                       {street === '' ? 'text-slate-300' : 'text-slate-700'}">
                <option value="">Select street </option>
                {#each streets as s (s)}
                  <option value={s}>{s}</option>
                {/each}
              </select>
              <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
              </svg>
            </div>
          </div>

          <!-- House No / Unit / Block -->
          <div>
            <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              House No. / Unit / Block
            </label>
            <input
              type="text"
              bind:value={houseNo}
              placeholder="e.g. 47  or  Unit 3B  or  Blk 2 Lot 5"
              class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all"
            />
            <!-- Quick-fill hint chips -->
            <div class="flex flex-wrap gap-1.5 mt-2">
              {#each ['47', 'Unit 3B', 'Blk 2 Lot 5', 'Room 1'] as ex (ex)}
                <button
                  type="button"
                  on:click={() => houseNo = ex}
                  class="text-[0.65rem] font-bold px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
                  {ex}
                </button>
              {/each}
            </div>
          </div>

          <!-- Address preview -->
          <div class="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
            <p class="text-[0.65rem] font-bold uppercase tracking-widest text-blue-400 mb-1">Full Address Preview</p>
            <p class="text-xs text-blue-700 font-semibold leading-relaxed">
              {fullAddress || 'Barangay Pag-Asa, Olongapo City, Zambales'}
            </p>
            {#if !houseNo && !street && !purok}
              <p class="text-[0.65rem] text-blue-300 mt-1 italic">
                e.g. 47 Murphy Street, Purok 3, Barangay Pag-Asa, Olongapo City, Zambales
              </p>
            {/if}
          </div>
        </div>

      <!-- ══ STEP 2: Categories ══ -->
      {:else if step === 2}
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div>
            <h3 class="font-nunito font-extrabold text-slate-700">Resident Categories</h3>
            <p class="text-xs text-slate-400 mt-0.5">Select all that apply to you</p>
          </div>

          <!-- PWD toggle -->
          <button type="button" on:click={() => isPWD = !isPWD}
            class="w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all
                   {isPWD ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                        {isPWD ? 'bg-amber-400' : 'bg-slate-200'}">
              <svg class="w-5 h-5 {isPWD ? 'text-white' : 'text-slate-400'}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </div>
            <div class="flex-1 text-left">
              <p class="font-bold text-slate-700 text-sm">Person with Disability (PWD)</p>
              <p class="text-xs text-slate-400">Physical, mental, or sensory disability</p>
            </div>
            <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0
                        {isPWD ? 'border-amber-400 bg-amber-400' : 'border-slate-300'}">
              {#if isPWD}
                <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              {/if}
            </div>
          </button>

          {#if isPWD}
            <div class="ml-4">
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Type of Disability</label>
              <div class="relative">
                <select bind:value={pwdType}
                  class="w-full px-3 py-2.5 rounded-xl border-2 border-amber-200 bg-amber-50 text-slate-700 text-sm outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100 transition-all appearance-none cursor-pointer">
                  <option value="">Select type</option>
                  <option>Physical Disability</option>
                  <option>Visual Impairment</option>
                  <option>Hearing Impairment</option>
                  <option>Intellectual Disability</option>
                  <option>Psychosocial Disability</option>
                  <option>Learning Disability</option>
                  <option>Speech & Language Impairment</option>
                  <option>Multiple Disability</option>
                </select>
                <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
                </svg>
              </div>
            </div>
          {/if}

          <!-- Senior toggle -->
          <button type="button" on:click={() => isSenior = !isSenior}
            class="w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all
                   {isSenior ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                        {isSenior ? 'bg-emerald-500' : 'bg-slate-200'}">
              <svg class="w-5 h-5 {isSenior ? 'text-white' : 'text-slate-400'}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
            </div>
            <div class="flex-1 text-left">
              <p class="font-bold text-slate-700 text-sm">Senior Citizen</p>
              <p class="text-xs text-slate-400">60 years old and above {age !== null && age >= 60 ? '· Auto-detected ✓' : ''}</p>
            </div>
            <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0
                        {isSenior ? 'border-emerald-400 bg-emerald-400' : 'border-slate-300'}">
              {#if isSenior}
                <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              {/if}
            </div>
          </button>

          <!-- Single Parent toggle -->
          <button type="button" on:click={() => isSingleParent = !isSingleParent}
            class="w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all
                   {isSingleParent ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                        {isSingleParent ? 'bg-violet-500' : 'bg-slate-200'}">
              <svg class="w-5 h-5 {isSingleParent ? 'text-white' : 'text-slate-400'}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>
            <div class="flex-1 text-left">
              <p class="font-bold text-slate-700 text-sm">Single Parent</p>
              <p class="text-xs text-slate-400">Solo parent with child/children</p>
            </div>
            <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0
                        {isSingleParent ? 'border-violet-400 bg-violet-400' : 'border-slate-300'}">
              {#if isSingleParent}
                <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              {/if}
            </div>
          </button>

          {#if !isPWD && !isSenior && !isSingleParent}
            <div class="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <svg class="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <p class="text-xs text-blue-600">You will be registered as a <strong>Regular Resident</strong>.</p>
            </div>
          {/if}
        </div>

      <!-- ══ STEP 3: House Photo + Confirm ══ -->
      {:else if step === 3}
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div>
            <h3 class="font-nunito font-extrabold text-slate-700">House Photo</h3>
            <p class="text-xs text-slate-400 mt-0.5">Required — take a clear photo of the front of your house</p>
          </div>

          <!-- Photo upload -->
          {#if housePhotoPreview}
            <div class="relative rounded-xl overflow-hidden border-2 border-emerald-300">
              <img src={housePhotoPreview} alt="House" class="w-full h-48 object-cover" />
              <button type="button"
                on:click={() => { housePhoto = null; housePhotoPreview = ''; }}
                class="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shadow">
                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
              <div class="absolute bottom-2 left-2 bg-black/50 text-white text-xs font-bold px-2 py-1 rounded-lg">
                ✓ Photo captured
              </div>
            </div>
          {:else}
            <label class="flex flex-col items-center justify-center gap-3 p-6 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all bg-slate-50">
              <div class="w-14 h-14 rounded-2xl bg-slate-200 flex items-center justify-center">
                <svg class="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0118.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              </div>
              <div class="text-center">
                <p class="text-sm font-bold text-slate-700">Take Photo or Upload</p>
                <p class="text-xs text-slate-400 mt-0.5">Front view of your house · Max 5MB</p>
              </div>
              <input type="file" accept="image/*" capture="environment" on:change={handlePhotoChange} class="hidden" />
            </label>
          {/if}

          {#if photoError}
            <p class="text-xs text-red-500 font-semibold">{photoError}</p>
          {/if}

          <!-- Summary -->
          <div class="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
            <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-2">Review Your Info</p>
            <p class="text-sm font-bold text-slate-700">{firstName} {lastName}</p>
            <p class="text-xs text-slate-500">{sex} · {age} yrs old · {civilStatus}</p>
            <p class="text-xs text-slate-500">{fullAddress || 'Barangay Pag-Asa, Olongapo City, Zambales'}</p>
            <div class="flex gap-1.5 flex-wrap mt-1">
              {#if isPWD}<span class="text-[0.65rem] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">PWD</span>{/if}
              {#if isSenior}<span class="text-[0.65rem] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Senior Citizen</span>{/if}
              {#if isSingleParent}<span class="text-[0.65rem] font-bold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">Single Parent</span>{/if}
              {#if !isPWD && !isSenior && !isSingleParent}<span class="text-[0.65rem] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Regular Resident</span>{/if}
            </div>
            <!-- GPS status -->
            <div class="border-t border-slate-200 pt-2 mt-2 space-y-1">
              <p class="text-[0.65rem] font-bold text-slate-600 uppercase tracking-widest">📍 GPS Location</p>
              {#if gpsStatus === 'granted' || gpsStatus === 'optimizing'}
                <div class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-green-400"></span>
                  <span class="text-xs text-green-600 font-semibold">Location captured ✓</span>
                </div>
                <p class="text-[0.7rem] text-slate-500 font-mono">Lat: {gpsLat?.toFixed(6)}</p>
                <p class="text-[0.7rem] text-slate-500 font-mono">Lng: {gpsLng?.toFixed(6)}</p>
                <p class="text-[0.7rem] text-slate-500">Accuracy: ±{gpsAccuracy ?? 'N/A'}m {accuracyQuality}</p>
              {:else}
                <div class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span class="text-xs text-amber-600 font-semibold">No GPS location</span>
                </div>
                <p class="text-[0.7rem] text-amber-500">Submission allowed without GPS</p>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <!-- Navigation buttons -->
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
            style="background: #0f2060;">
            Next →
          </button>
        {:else}
          <button type="button" on:click={handleSubmit} disabled={loading}
            class="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white active:scale-[0.98] transition-all shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
            style="background: #059669;">
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
    </div>
  {/if}
</div>