<!-- PUBLIC PWA form — no login required -->
<!-- src/routes/register/[qrId]/+page.svelte -->

<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { isInsidePagAsa } from '$lib/pagasaBoundary.js';

  // === DEMO BYPASS: Enable ?demo=true to bypass GPS outside
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const DEMO_BYPASS = urlParams.get('demo') === 'true';
  // ===========================================

  // ── QR / Household ─────────────────────────────────────
  $: qrId = $page.params.qrId;

  interface Household {
    id: string;
    qrId: string;
    houseNo: string;
    notes?: string;
    createdAt: unknown;
    createdBy: string;
    createdByName?: string;
    status?: string;
    street?: string;
    zone?: string;
    landmark?: string;
  }

  let household: Household | null = null;
  let householdLoading = true;
  let householdError = '';

  // ── GPS (Enhanced with Better Accuracy) ────────────────
  let gpsLat: number | null = null;
  let gpsLng: number | null = null;
  let gpsAccuracy: number | null = null;
  let gpsStatus = 'pending'; // pending, optimizing, granted, denied, error, outside
  let gpsAttempt = 0;
  let maxGpsRetries = 8;
  let watchId: number | null = null;
  let bestAccuracy: number | null = null;
  let gpsMessage = 'Requesting GPS location...';
  let maxWatchTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastLocation: { lat: number; lng: number; accuracy: number } | null = null;
  let gpsRetryCount = 0;

  // ── Form fields ────────────────────────────────────────
  let firstName = '';
  let lastName = '';
  let middleName = '';
  let extensionName = '';
  let birthdate = '';
  let placeOfBirth = '';
  let sex = '';
  let civilStatus = '';
  let citizenship = 'Filipino';
  let occupation = '';
  let contactNo = '';
  let email = '';

  // ── Address fields ─────────────────────────────────────
  let houseNo = '';
  let street = '';

  const streets = [
    'Gordon Avenue',
    'Murphy Street',
    'Natividad Street',
    'Burgos Street',
    'East 12th Street',
    'Perimeter Road',
    'Bonifacio Street',
  ];

  // ── Categories ─────────────────────────────────────────
  let isPWD = false;
  let isSenior = false;
  let isSingleParent = false;
  let pwdType = '';

  // ── Category ID Uploads ────────────────────────────────
  let pwdIdFile: File | null = null;
  let pwdIdPreview = '';
  let seniorIdFile: File | null = null;
  let seniorIdPreview = '';
  let singleParentIdFile: File | null = null;
  let singleParentIdPreview = '';

  // ── House photo ────────────────────────────────────────
  let housePhoto: File | null = null;
  let housePhotoPreview = '';

  // ── Form state ─────────────────────────────────────────
  let step = 1;
  let loading = false;
  let errorMsg = '';
  let submitted = false;

  // ── Validation state ───────────────────────────────────
  let fieldErrors = {
    firstName: '',
    lastName: '',
    middleName: '',
    extensionName: '',
    birthdate: '',
    placeOfBirth: '',
    sex: '',
    civilStatus: '',
    citizenship: '',
    occupation: '',
    contactNo: '',
    email: '',
    houseNo: '',
    street: '',
    pwdType: '',
    pwdIdFile: '',
    seniorIdFile: '',
    singleParentIdFile: '',
    housePhoto: ''
  };

  let touchedFields = {
    firstName: false,
    lastName: false,
    middleName: false,
    extensionName: false,
    birthdate: false,
    placeOfBirth: false,
    sex: false,
    civilStatus: false,
    citizenship: false,
    occupation: false,
    contactNo: false,
    email: false,
    houseNo: false,
    street: false,
    pwdType: false,
    pwdIdFile: false,
    seniorIdFile: false,
    singleParentIdFile: false,
    housePhoto: false
  };

  // ── Age computed from birthdate ────────────────────────
  $: age = birthdate
    ? Math.floor((Date.now() - Date.parse(birthdate)) / (365.25 * 24 * 60 * 60 * 1000))
    : null;
  
  $: ageInDays = birthdate
    ? Math.floor((Date.now() - Date.parse(birthdate)) / (24 * 60 * 60 * 1000))
    : null;
  
  $: if (age !== null && age >= 60) isSenior = true;

  // Real-time validation triggers
  $: if (touchedFields.firstName) validateFirstName();
  $: if (touchedFields.lastName) validateLastName();
  $: if (touchedFields.middleName) validateMiddleName();
  $: if (touchedFields.birthdate) validateBirthdate();
  $: if (touchedFields.placeOfBirth) validatePlaceOfBirth();
  $: if (touchedFields.sex) validateSex();
  $: if (touchedFields.civilStatus) validateCivilStatus();
  $: if (touchedFields.citizenship) validateCitizenship();
  $: if (touchedFields.occupation) validateOccupation();
  $: if (touchedFields.contactNo) validateContactNo();
  $: if (touchedFields.email) validateEmail();
  $: if (touchedFields.houseNo) validateHouseNo();
  $: if (touchedFields.street) validateStreet();
  $: if (touchedFields.pwdType && isPWD) validatePwdType();
  $: if (touchedFields.pwdIdFile && isPWD) validatePwdIdFile();
  $: if (touchedFields.seniorIdFile && isSenior) validateSeniorIdFile();
  $: if (touchedFields.singleParentIdFile && isSingleParent) validateSingleParentIdFile();
  $: if (touchedFields.housePhoto) validateHousePhoto();

  // ── Full address preview ────────────────────────────────
  $: fullAddress = [houseNo.trim(), street, 'Barangay Pag-Asa', 'Olongapo City', 'Zambales']
    .filter(Boolean)
    .join(', ');

  // ── Full name with extension ────────────────────────────
  $: fullName = [firstName.trim(), middleName.trim(), lastName.trim(), extensionName]
    .filter(Boolean)
    .join(' ');

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

  // ── Senior button disabled state ────────────────────────
  $: isSeniorDisabled = age === null || age < 60;

  // ── VALIDATION FUNCTIONS ────────────────────────────────
  function validateFirstName(): boolean {
    if (!firstName.trim()) {
      fieldErrors.firstName = 'First name is required';
      return false;
    }
    if (firstName.trim().length < 2) {
      fieldErrors.firstName = 'First name must be at least 2 characters';
      return false;
    }
    if (!/^[a-zA-Z\s\-ñÑ]+$/.test(firstName.trim())) {
      fieldErrors.firstName = 'First name should only contain letters';
      return false;
    }
    fieldErrors.firstName = '';
    return true;
  }

  function validateLastName(): boolean {
    if (!lastName.trim()) {
      fieldErrors.lastName = 'Last name is required';
      return false;
    }
    if (lastName.trim().length < 2) {
      fieldErrors.lastName = 'Last name must be at least 2 characters';
      return false;
    }
    if (!/^[a-zA-Z\s\-ñÑ]+$/.test(lastName.trim())) {
      fieldErrors.lastName = 'Last name should only contain letters';
      return false;
    }
    fieldErrors.lastName = '';
    return true;
  }

  function validateMiddleName(): boolean {
    if (middleName.trim() && !/^[a-zA-Z\s\-ñÑ]*$/.test(middleName.trim())) {
      fieldErrors.middleName = 'Middle name should only contain letters';
      return false;
    }
    fieldErrors.middleName = '';
    return true;
  }

  function validateBirthdate(): boolean {
    if (!birthdate) {
      fieldErrors.birthdate = 'Birthdate is required';
      return false;
    }
    const birthDateMs = Date.parse(birthdate);
    if (Number.isNaN(birthDateMs)) {
      fieldErrors.birthdate = 'Invalid birthdate';
      return false;
    }
    const nowMs = Date.now();
    if (birthDateMs > nowMs) {
      fieldErrors.birthdate = 'Birthdate cannot be in the future';
      return false;
    }
    const calculatedAge = Math.floor((nowMs - birthDateMs) / (365.25 * 24 * 60 * 60 * 1000));
    const ageInDaysLocal = Math.floor((nowMs - birthDateMs) / (24 * 60 * 60 * 1000));
    if (calculatedAge < 0) {
      fieldErrors.birthdate = 'Invalid birthdate';
      return false;
    }
    if (ageInDaysLocal < 30) {
      fieldErrors.birthdate = 'Resident must be at least 1 month old';
      return false;
    }
    if (calculatedAge > 120) {
      fieldErrors.birthdate = 'Please verify birthdate (age exceeds 120)';
      return false;
    }
    fieldErrors.birthdate = '';
    return true;
  }

  function validatePlaceOfBirth(): boolean {
    if (!placeOfBirth.trim()) {
      fieldErrors.placeOfBirth = 'Place of birth is required';
      return false;
    }
    if (placeOfBirth.trim().length < 3) {
      fieldErrors.placeOfBirth = 'Place of birth must be at least 3 characters';
      return false;
    }
    if (!/^[a-zA-Z\s\-ñÑ,.]+$/.test(placeOfBirth.trim())) {      
      fieldErrors.placeOfBirth = 'Place of birth should only contain letters, commas, and periods';
      return false;
    }
    fieldErrors.placeOfBirth = '';
    return true;
  }

  function validateSex(): boolean {
    if (!sex) {
      fieldErrors.sex = 'Please select your sex';
      return false;
    }
    fieldErrors.sex = '';
    return true;
  }

  function validateCivilStatus(): boolean {
    if (!civilStatus) {
      fieldErrors.civilStatus = 'Please select your civil status';
      return false;
    }
    fieldErrors.civilStatus = '';
    return true;
  }

  function validateCitizenship(): boolean {
    if (!citizenship.trim()) {
      fieldErrors.citizenship = 'Citizenship is required';
      return false;
    }
    if (citizenship.trim().length < 2) {
      fieldErrors.citizenship = 'Citizenship must be at least 2 characters';
      return false;
    }
    if (!/^[a-zA-Z\s-]+$/.test(citizenship.trim())) {
      fieldErrors.citizenship = 'Citizenship should only contain letters';
      return false;
    }
    fieldErrors.citizenship = '';
    return true;
  }

  function validateOccupation(): boolean {
    if (!occupation.trim()) {
      fieldErrors.occupation = 'Occupation is required';
      return false;
    }
    if (occupation.trim().length < 2) {
      fieldErrors.occupation = 'Occupation must be at least 2 characters';
      return false;
    }
    if (!/^[a-zA-Z0-9\s\-.&'/]+$/.test(occupation.trim())) {
      fieldErrors.occupation = 'Occupation contains invalid characters';
      return false;
    }
    fieldErrors.occupation = '';
    return true;
  }

  function validateContactNo(): boolean {
    const cleaned = contactNo.trim().replace(/\s/g, '');
    if (cleaned && !/^09\d{9}$/.test(cleaned)) {
      fieldErrors.contactNo = 'Enter valid 11-digit PH number (e.g., 09123456789)';
      return false;
    }
    if (cleaned && cleaned.length !== 11) {
      fieldErrors.contactNo = 'Contact number must be exactly 11 digits';
      return false;
    }
    fieldErrors.contactNo = '';
    return true;
  }

  function validateEmail(): boolean {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    if (!email.trim()) {
      fieldErrors.email = 'Email address is required';
      return false;
    }
    
    if (!emailRegex.test(email.trim())) {
      fieldErrors.email = 'Please enter a valid email address (e.g., name@example.com)';
      return false;
    }
    
    if (email.trim().length > 100) {
      fieldErrors.email = 'Email address must be less than 100 characters';
      return false;
    }
    
    fieldErrors.email = '';
    return true;
  }

  function validateHouseNo(): boolean {
    if (!houseNo.trim()) {
      fieldErrors.houseNo = 'House/Unit number is required';
      return false;
    }
    if (!/^[a-zA-Z0-9\s\-#./]+$/.test(houseNo.trim())) {      
      fieldErrors.houseNo = 'House number contains invalid characters';
      return false;
    }
    fieldErrors.houseNo = '';
    return true;
  }

  function validateStreet(): boolean {
    if (!street) {
      fieldErrors.street = 'Please select a street';
      return false;
    }
    fieldErrors.street = '';
    return true;
  }

  function validatePwdType(): boolean {
    if (isPWD && !pwdType) {
      fieldErrors.pwdType = 'Please select type of disability';
      return false;
    }
    fieldErrors.pwdType = '';
    return true;
  }

  function validatePwdIdFile(): boolean {
    if (isPWD && !pwdIdFile) {
      fieldErrors.pwdIdFile = 'Please upload your PWD ID as proof';
      return false;
    }
    fieldErrors.pwdIdFile = '';
    return true;
  }

  function validateSeniorIdFile(): boolean {
    if (isSenior && !seniorIdFile) {
      fieldErrors.seniorIdFile = 'Please upload your Senior Citizen ID as proof';
      return false;
    }
    fieldErrors.seniorIdFile = '';
    return true;
  }

  function validateSingleParentIdFile(): boolean {
    if (isSingleParent && !singleParentIdFile) {
      fieldErrors.singleParentIdFile = 'Please upload your Solo Parent ID as proof';
      return false;
    }
    fieldErrors.singleParentIdFile = '';
    return true;
  }

  function validateHousePhoto(): boolean {
    if (!housePhoto) {
      fieldErrors.housePhoto = 'House photo is required';
      return false;
    }
    fieldErrors.housePhoto = '';
    return true;
  }

  function validateStep1(): boolean {
    const isFirstNameValid = validateFirstName();
    const isLastNameValid = validateLastName();
    const isMiddleNameValid = validateMiddleName();
    const isBirthdateValid = validateBirthdate();
    const isPlaceOfBirthValid = validatePlaceOfBirth();
    const isSexValid = validateSex();
    const isCivilStatusValid = validateCivilStatus();
    const isCitizenshipValid = validateCitizenship();
    const isOccupationValid = validateOccupation();
    const isContactNoValid = validateContactNo();
    const isEmailValid = validateEmail();
    const isHouseNoValid = validateHouseNo();
    const isStreetValid = validateStreet();
    
    touchedFields.firstName = true;
    touchedFields.lastName = true;
    touchedFields.middleName = true;
    touchedFields.birthdate = true;
    touchedFields.placeOfBirth = true;
    touchedFields.sex = true;
    touchedFields.civilStatus = true;
    touchedFields.citizenship = true;
    touchedFields.occupation = true;
    touchedFields.houseNo = true;
    touchedFields.street = true;
    touchedFields.email = true;
    if (contactNo.trim()) touchedFields.contactNo = true;

    return isFirstNameValid && isLastNameValid && isMiddleNameValid &&
          isBirthdateValid && isPlaceOfBirthValid && isSexValid && 
          isCivilStatusValid && isCitizenshipValid && isOccupationValid && 
          isContactNoValid && isEmailValid && isHouseNoValid && isStreetValid;
  }

  function validateStep2(): boolean {
    const isPwdTypeValid = validatePwdType();
    const isPwdIdValid = validatePwdIdFile();
    const isSeniorIdValid = validateSeniorIdFile();
    const isSingleParentIdValid = validateSingleParentIdFile();
    
    if (isPWD) touchedFields.pwdType = true;
    if (isPWD) touchedFields.pwdIdFile = true;
    if (isSenior) touchedFields.seniorIdFile = true;
    if (isSingleParent) touchedFields.singleParentIdFile = true;
    
    return isPwdTypeValid && isPwdIdValid && isSeniorIdValid && isSingleParentIdValid;
  }

  function validateStep3(): boolean {
    const isHousePhotoValid = validateHousePhoto();
    touchedFields.housePhoto = true;
    return isHousePhotoValid;
  }

  // ── Scroll to first error function ──────────────────────
  function scrollToFirstError() {
    const errorSelectors = [
      { condition: fieldErrors.firstName, id: 'firstNameInput' },
      { condition: fieldErrors.lastName, id: 'lastNameInput' },
      { condition: fieldErrors.middleName, id: 'middleNameInput' },
      { condition: fieldErrors.birthdate, id: 'birthdateInput' },
      { condition: fieldErrors.placeOfBirth, id: 'placeOfBirthInput' },
      { condition: fieldErrors.sex, id: 'sexSelect' },
      { condition: fieldErrors.civilStatus, id: 'civilStatusSelect' },
      { condition: fieldErrors.citizenship, id: 'citizenshipInput' },
      { condition: fieldErrors.occupation, id: 'occupationInput' },
      { condition: fieldErrors.contactNo, id: 'contactNoInput' },
      { condition: fieldErrors.email, id: 'emailInput' },
      { condition: fieldErrors.houseNo, id: 'houseNoInput' },
      { condition: fieldErrors.street, id: 'streetSelect' },
      { condition: fieldErrors.pwdType, id: 'pwdTypeSelect' },
      { condition: fieldErrors.pwdIdFile, id: 'pwdIdUpload' },
      { condition: fieldErrors.seniorIdFile, id: 'seniorIdUpload' },
      { condition: fieldErrors.singleParentIdFile, id: 'singleParentIdUpload' },
      { condition: fieldErrors.housePhoto, id: 'housePhotoInput' }
    ];
    
    for (const selector of errorSelectors) {
      if (selector.condition) {
        const element = document.getElementById(selector.id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (element as HTMLElement).focus();
          element.classList.add('shake-error');
          setTimeout(() => element.classList.remove('shake-error'), 500);
          break;
        }
      }
    }
  }

  // ── Limit contact number to 11 digits ───────────────────
  function handleContactNoInput(e: Event) {
    const input = e.target as HTMLInputElement;
    let value = input.value.replace(/\D/g, '');
    if (value.length > 11) {
      value = value.slice(0, 11);
    }
    contactNo = value;
    touchedFields.contactNo = true;
    validateContactNo();
  }

  // ── Read file as base64 (no compression) ────────────────
  function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve((ev.target?.result as string) ?? '');
      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsDataURL(file);
    });
  }

  // ── ID file handlers ────────────────────────────────
  function handlePwdIdChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      setTimeout(() => {
        const retry = document.getElementById('pwdIdFileInput') as HTMLInputElement;
        if (retry?.files?.[0]) processPwdFile(retry.files[0]);
      }, 100);
      return;
    }
    processPwdFile(file);
  }

  function processPwdFile(file: File) {
    if (file.size > 15 * 1024 * 1024) {
      fieldErrors.pwdIdFile = 'File must be less than 15MB';
      return;
    }
    if (!file.type.startsWith('image/')) {
      fieldErrors.pwdIdFile = 'Please select an image file';
      return;
    }
    pwdIdFile = file;
    fieldErrors.pwdIdFile = '';
    const reader = new FileReader();
    reader.onload = (ev) => { pwdIdPreview = (ev.target?.result as string) ?? ''; };
    reader.readAsDataURL(file);
  }

  function handleSeniorIdChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      setTimeout(() => {
        const retry = document.getElementById('seniorIdFileInput') as HTMLInputElement;
        if (retry?.files?.[0]) processSeniorFile(retry.files[0]);
      }, 100);
      return;
    }
    processSeniorFile(file);
  }

  function processSeniorFile(file: File) {
    if (file.size > 15 * 1024 * 1024) {
      fieldErrors.seniorIdFile = 'File must be less than 15MB';
      return;
    }
    if (!file.type.startsWith('image/')) {
      fieldErrors.seniorIdFile = 'Please select an image file';
      return;
    }
    seniorIdFile = file;
    fieldErrors.seniorIdFile = '';
    const reader = new FileReader();
    reader.onload = (ev) => { seniorIdPreview = (ev.target?.result as string) ?? ''; };
    reader.readAsDataURL(file);
  }

  function handleSingleParentIdChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      setTimeout(() => {
        const retry = document.getElementById('singleParentIdFileInput') as HTMLInputElement;
        if (retry?.files?.[0]) processSingleParentFile(retry.files[0]);
      }, 100);
      return;
    }
    processSingleParentFile(file);
  }

  function processSingleParentFile(file: File) {
    if (file.size > 15 * 1024 * 1024) {
      fieldErrors.singleParentIdFile = 'File must be less than 15MB';
      return;
    }
    if (!file.type.startsWith('image/')) {
      fieldErrors.singleParentIdFile = 'Please select an image file';
      return;
    }
    singleParentIdFile = file;
    fieldErrors.singleParentIdFile = '';
    const reader = new FileReader();
    reader.onload = (ev) => { singleParentIdPreview = (ev.target?.result as string) ?? ''; };
    reader.readAsDataURL(file);
  }

  // ── GPS Functions ─────────────────────────────────────
  function isValidLocation(lat: number, lng: number, accuracy: number): boolean {
    if (isNaN(lat) || isNaN(lng)) return false;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
    if (accuracy > 1000) return false;
    if (lastLocation) {
      const distance = calculateDistance(lastLocation.lat, lastLocation.lng, lat, lng);
      if (distance > 0.5) return false;
    }
    return true;
  }

  function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function stopGPS() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (maxWatchTimeout !== null) {
      clearTimeout(maxWatchTimeout);
      maxWatchTimeout = null;
    }
  }

  function requestGPSEnhanced() {
    if (!navigator.geolocation) {
      gpsStatus = 'error';
      gpsMessage = 'Geolocation is not supported by your browser.';
      return;
    }

    stopGPS();
    gpsStatus = 'pending';
    gpsAttempt = 0;
    gpsRetryCount = 0;
    bestAccuracy = null;
    lastLocation = null;
    gpsMessage = 'Requesting GPS location... (attempt 1/' + maxGpsRetries + ')';

    maxWatchTimeout = setTimeout(() => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (gpsStatus === 'pending' || gpsStatus === 'optimizing') {
        gpsStatus = 'error';
        gpsMessage = 'GPS request timed out (45s). Please go outdoors and try again.';
      }
    }, 45000);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        const newAccuracy = Math.round(pos.coords.accuracy * 10) / 10;

        if (!isValidLocation(newLat, newLng, newAccuracy)) return;

        lastLocation = { lat: newLat, lng: newLng, accuracy: newAccuracy };
        gpsLat = newLat;
        gpsLng = newLng;
        gpsAccuracy = newAccuracy;

        if (bestAccuracy === null || newAccuracy < bestAccuracy) {
          bestAccuracy = newAccuracy;
        }

        gpsAttempt++;

        const shouldFinalize = newAccuracy <= 15 || (newAccuracy <= 30 && gpsAttempt >= 2) || gpsAttempt >= maxGpsRetries;

        if (shouldFinalize) {
          stopGPS();
          
          // === DEMO BYPASS: Skip outside check if ?demo=true ===
          if (!DEMO_BYPASS && !isInsidePagAsa(newLat, newLng)) {
            gpsStatus = 'outside';
            gpsMessage = '❌ You are outside Barangay Pag-Asa.';
          } else if (DEMO_BYPASS && !isInsidePagAsa(newLat, newLng)) {
            // Demo mode: warn but allow
            gpsStatus = 'granted';
            gpsMessage = `⚠️ DEMO MODE: Location outside Pag-Asa (bypass active). Accuracy: ±${newAccuracy}m`;
          } else {
            gpsStatus = 'granted';
            if (newAccuracy <= 15) {
              gpsMessage = `📍 Excellent! Location confirmed (±${newAccuracy}m accuracy)`;
            } else {
              gpsMessage = `✓ Location acquired (±${newAccuracy}m accuracy)`;
            }
          }
        } else {
          gpsStatus = 'optimizing';
          const remainingRetries = maxGpsRetries - gpsAttempt;
          gpsMessage = `Optimizing accuracy (±${newAccuracy}m) • ${remainingRetries} more attempts • Keep phone steady`;
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          gpsStatus = 'denied';
          gpsMessage = 'Location permission denied. Please enable location access in your browser settings.';
          stopGPS();
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          gpsRetryCount++;
          if (gpsRetryCount < 3) {
            gpsMessage = `GPS unavailable (attempt ${gpsRetryCount}/3). Please go outdoors.`;
          } else {
            gpsStatus = 'error';
            gpsMessage = 'GPS unavailable. Please go outdoors and ensure GPS is enabled.';
            stopGPS();
          }
        } else if (err.code === err.TIMEOUT) {
          gpsRetryCount++;
          if (gpsRetryCount < 3) {
            gpsMessage = `GPS timeout (attempt ${gpsRetryCount}/3). Moving outdoors may help.`;
          } else {
            gpsStatus = 'error';
            gpsMessage = 'GPS request timed out. Move to an open area and try again.';
            stopGPS();
          }
        } else {
          gpsStatus = 'error';
          gpsMessage = 'GPS error: ' + err.message;
          stopGPS();
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function retryGPS() {
    stopGPS();
    gpsLat = null;
    gpsLng = null;
    gpsAccuracy = null;
    requestGPSEnhanced();
  }

  // ── SINGLE onMount ────
  onMount(() => {
    const currentQrId = window.location.pathname.split('/').pop() ?? '';

    requestGPSEnhanced();
    
    if (currentQrId) localStorage.setItem('last_qr_id', currentQrId);

    (async () => {
      try {
        const { db } = await import('$lib/firebase');
        const { collection, query, where, getDocs } = await import('firebase/firestore');

        const snap = await getDocs(
          query(collection(db, 'households'), where('qrId', '==', currentQrId))
        );

        if (snap.empty) {
          householdError = 'This QR code is invalid or has expired. Please contact your Barangay staff.';
        } else {
          const docData = snap.docs[0].data();
          household = { id: snap.docs[0].id, ...docData } as Household;
          if (household?.houseNo) houseNo = household.houseNo;
          if (household?.street) street = household.street;
        }
      } catch (e) {
        householdError = 'Could not load household info. Please check your internet connection.';
        console.error(e);
      } finally {
        householdLoading = false;
      }
    })();

    return () => { stopGPS(); };
  });

  // ── House photo handler ──────────────────────────────────
  function handlePhotoChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      fieldErrors.housePhoto = 'Photo must be less than 15MB';
      return;
    }
    if (!file.type.startsWith('image/')) {
      fieldErrors.housePhoto = 'Please select an image file';
      return;
    }
    housePhoto = file;
    fieldErrors.housePhoto = '';
    const reader = new FileReader();
    reader.onload = (ev) => { housePhotoPreview = (ev.target?.result as string) ?? ''; };
    reader.readAsDataURL(file);
  }

  // ── Compress only the house photo ───────────────────────
  async function compressImage(file: File): Promise<string | null> {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const maxW = 1200, maxH = 900;
        let w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(objectUrl);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => resolve(null);
      img.src = objectUrl;
    });
  }

  // ── Step navigation with validation ────────────────────
  function nextStep() {
    errorMsg = '';
    
    if (step === 1) {
      // === DEMO BYPASS: Skip outside check if ?demo=true ===
      if (!DEMO_BYPASS && gpsStatus === 'outside') {
        errorMsg = '❌ You must be inside Barangay Pag-Asa to register.';
        scrollToFirstError();
        return;
      }
      
      if (gpsLat === null || gpsLng === null) {
        errorMsg = '❌ Please wait for GPS to lock your location before proceeding.';
        scrollToFirstError();
        return;
      }
      
      if (!validateStep1()) {
        errorMsg = 'Please fill in all required fields correctly';
        scrollToFirstError();
        return;
      }
      step++;
    } else if (step === 2) {
      if (!validateStep2()) {
        errorMsg = 'Please complete all required fields';
        scrollToFirstError();
        return;
      }
      step++;
    }
  }

  function prevStep() {
    errorMsg = '';
    step--;
  }

  // ── Submit ────────────────────────────────────────────
  async function handleSubmit() {
    errorMsg = '';

    if (gpsLat === null || gpsLng === null) {
      errorMsg = '❌ Location required. Please enable GPS and wait for it to lock before submitting.';
      return;
    }

    // === DEMO BYPASS: Skip location restriction if ?demo=true ===
    if (!DEMO_BYPASS && !isInsidePagAsa(gpsLat, gpsLng)) {
      errorMsg = '❌ Registration blocked. Your current location is outside Barangay Pag-Asa, Olongapo City.';
      return;
    }

    const isStep1Valid = validateStep1();
    const isStep2Valid = validateStep2();
    const isStep3Valid = validateStep3();
    
    if (!isStep1Valid || !isStep2Valid || !isStep3Valid) {
      errorMsg = 'Please complete all required fields correctly before submitting';
      if (!isStep1Valid) { step = 1; setTimeout(() => scrollToFirstError(), 100); }
      else if (!isStep2Valid) { step = 2; setTimeout(() => scrollToFirstError(), 100); }
      else if (!isStep3Valid) { step = 3; setTimeout(() => scrollToFirstError(), 100); }
      return;
    }

    loading = true;
    try {
      const { db } = await import('$lib/firebase');
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');

      const housePhotoUrl = housePhoto ? await compressImage(housePhoto) : null;
      const pwdIdUrl      = pwdIdFile        ? await readFileAsBase64(pwdIdFile)        : null;
      const seniorIdUrl   = seniorIdFile     ? await readFileAsBase64(seniorIdFile)     : null;
      const singleParentUrl = singleParentIdFile ? await readFileAsBase64(singleParentIdFile) : null;

      const residentData = {
        householdId: household?.id ?? null,
        qrId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        middleName: middleName.trim(),
        extensionName: extensionName,
        name: fullName,
        email: email.trim().toLowerCase(),
        birthdate,
        placeOfBirth: placeOfBirth.trim(),
        age: age ?? 0,
        sex,
        civilStatus,
        citizenship: citizenship.trim(),
        occupation: occupation.trim(),
        contactNo: contactNo.trim(),
        houseNo: houseNo.trim(),
        street,
        landmark: household?.landmark ?? '',
        barangay: 'Barangay Pag-Asa',
        city: 'Olongapo City',
        province: 'Zambales',
        region: 'Region III - Central Luzon',
        address: fullAddress,
        isPWD,
        isSenior,
        isSingleParent,
        pwdType: isPWD ? pwdType : null,
        pwdIdProof: pwdIdUrl,
        seniorIdProof: seniorIdUrl,
        singleParentIdProof: singleParentUrl,
        lat: gpsLat,
        lng: gpsLng,
        gpsAccuracy,
        bestAccuracy,
        gpsAttempts: gpsAttempt,
        photoUrl: housePhotoUrl,
        status: 'pending',
        submittedAt: serverTimestamp(),
        encodedBy: null,
      };

      await addDoc(collection(db, 'residents'), residentData);

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
  <style>
    .shake-error { animation: shake 0.3s ease-in-out; }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25%       { transform: translateX(-5px); }
      75%       { transform: translateX(5px); }
    }
    .error-border  { border-color: #ef4444 !important; background-color: #fef2f2 !important; }
    .valid-border  { border-color: #10b981 !important; }
    .disabled-button { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
  </style>
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
    <div class="ml-auto flex flex-col items-end gap-0.5">
      <div class="flex items-center gap-1.5">
        {#if DEMO_BYPASS}
          <span class="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
          <span class="text-yellow-200 text-[0.65rem] font-semibold">⚠️ DEMO MODE</span>
        {:else if gpsStatus === 'granted'}
          <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
          <span class="text-white/70 text-[0.65rem] font-semibold">GPS ✓</span>
        {:else if gpsStatus === 'outside'}
          <span class="w-2 h-2 rounded-full bg-red-400"></span>
          <span class="text-white/70 text-[0.65rem] font-semibold">Outside Area</span>
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

  <!-- ══ OUTSIDE PAGASA — HARD BLOCK (unless DEMO_BYPASS is active) ══ -->
  {:else if !DEMO_BYPASS && gpsStatus === 'outside'}
    <div class="p-6 flex flex-col items-center text-center mt-8">
      <div class="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-5">
        <svg class="w-10 h-10 text-red-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 5.636A9 9 0 115.636 18.364 9 9 0 0118.364 5.636z"/>
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01"/>
        </svg>
      </div>
      <h2 class="font-nunito font-extrabold text-slate-800 text-2xl mb-2">Outside Pag-Asa</h2>
      <p class="text-slate-500 text-sm leading-relaxed max-w-xs mb-2">
        Your GPS location shows you are <strong>outside Barangay Pag-Asa</strong>, Olongapo City.
      </p>
      <p class="text-slate-400 text-xs leading-relaxed max-w-xs mb-6">
        You must be physically inside the barangay to register. If you believe this is an error, move to an open area and retry your GPS.
      </p>
      <div class="w-full max-w-xs bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 text-left">
        <p class="text-xs font-bold text-red-500 uppercase tracking-widest mb-1">Your Detected Location</p>
        {#if gpsLat && gpsLng}
          <p class="text-xs font-mono text-red-700">{gpsLat.toFixed(6)}, {gpsLng.toFixed(6)}</p>
          <p class="text-xs text-red-500 mt-1">Accuracy: ±{gpsAccuracy ?? 'N/A'}m</p>
        {/if}
      </div>
      <button type="button" on:click={retryGPS}
        class="w-full max-w-xs py-3.5 rounded-2xl text-sm font-bold text-white shadow-lg active:scale-[0.98] transition-all"
        style="background: #0f2060;">
        🔄 Retry GPS
      </button>
      <p class="text-xs text-slate-400 mt-4 max-w-xs">
        Tip: Go outdoors, away from tall buildings, and wait a moment before retrying.
      </p>
    </div>

  <!-- DEMO MODE WARNING BANNER (only when bypass is active) -->
  {:else if DEMO_BYPASS && gpsStatus !== 'denied' && gpsStatus !== 'error'}
    <div class="mx-4 mt-4">
      <div class="flex items-center gap-2 bg-yellow-100 border border-yellow-300 rounded-xl px-4 py-3">
        <svg class="w-5 h-5 text-yellow-600 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
        <p class="text-xs text-yellow-700">
          <strong>⚠️ DEMO MODE ACTIVE</strong> — Location restriction is bypassed for testing. Remove <code class="bg-yellow-200 px-1 rounded">?demo=true</code> from URL to restore.
        </p>
      </div>
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
        <p class="text-sm font-bold text-slate-700">{fullName}</p>
        <p class="text-xs text-slate-500">{email}</p>
        <p class="text-xs text-slate-500">{placeOfBirth ? `Born in ${placeOfBirth}` : ''}</p>
        <p class="text-xs text-slate-500">{fullAddress}</p>
        {#if occupation}<p class="text-xs text-slate-500">Occupation: {occupation}</p>{/if}
        <div class="flex gap-1.5 flex-wrap mt-1">
          {#if isPWD}<span class="text-[0.65rem] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">PWD</span>{/if}
          {#if isSenior}<span class="text-[0.65rem] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Senior Citizen</span>{/if}
          {#if isSingleParent}<span class="text-[0.65rem] font-bold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">Single Parent</span>{/if}
          {#if !isPWD && !isSenior && !isSingleParent}<span class="text-[0.65rem] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Regular Resident</span>{/if}
        </div>
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
          <p class="text-xs text-slate-500">Brgy. Pag-Asa · {qrId}</p>
        </div>
      </div>

      <!-- GPS Status Banner -->
      {#if gpsStatus === 'pending'}
        <div class="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <svg class="w-4 h-4 text-blue-500 mt-0.5 shrink-0 animate-spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" opacity="0.3"/>
            <path d="M12 2a10 10 0 0 1 0 20" stroke="currentColor" stroke-width="2"/>
          </svg>
          <div class="flex-1">
            <p class="text-xs font-bold text-blue-700">📡 {gpsMessage}</p>
            <p class="text-xs text-blue-600 mt-1">Please allow location access when prompted</p>
          </div>
        </div>
      {:else if gpsStatus === 'optimizing'}
        <div class="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <svg class="w-4 h-4 text-blue-500 mt-0.5 shrink-0 animate-spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" opacity="0.3"/>
            <path d="M12 2a10 10 0 0 1 0 20" stroke="currentColor" stroke-width="2"/>
          </svg>
          <div class="flex-1">
            <p class="text-xs font-bold text-blue-700">{gpsMessage}</p>
            <p class="text-xs text-blue-600 mt-1">📍 Keep phone steady · Move to open area for better signal</p>
          </div>
        </div>
      {:else if gpsStatus === 'granted'}
        <div class="flex items-start gap-2.5 rounded-xl px-4 py-3
          {gpsAccuracy !== null && gpsAccuracy > 50 && !DEMO_BYPASS
            ? 'bg-amber-50 border border-amber-200'
            : 'bg-green-50 border border-green-200'}">
          <svg class="w-4 h-4 mt-0.5 shrink-0
            {gpsAccuracy !== null && gpsAccuracy > 50 && !DEMO_BYPASS ? 'text-amber-500' : 'text-green-500'}"
            fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
          </svg>
          <div class="flex-1">
            <p class="text-xs font-bold
              {gpsAccuracy !== null && gpsAccuracy > 50 && !DEMO_BYPASS ? 'text-amber-700' : 'text-green-700'}">
              {gpsMessage}
            </p>
            <p class="text-xs mt-0.5
              {gpsAccuracy !== null && gpsAccuracy > 50 && !DEMO_BYPASS ? 'text-amber-600' : 'text-green-600'}">
              {accuracyQuality}
            </p>
          </div>
        </div>
        
      {:else if gpsStatus === 'denied' || gpsStatus === 'error'}
        <div class="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <svg class="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          <div class="flex-1">
            <p class="text-xs font-bold text-amber-700">{gpsMessage}</p>
            <button type="button" on:click={retryGPS}
              class="text-xs font-bold text-amber-700 underline hover:text-amber-800 mt-1">
              🔄 Tap to retry GPS
            </button>
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

          <!-- Last Name + Extension Name -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Last Name <span class="text-red-400">*</span></label>
              <input id="lastNameInput" type="text" bind:value={lastName}
                on:blur={() => { touchedFields.lastName = true; validateLastName(); }}
                placeholder="Dela Cruz"
                class="w-full px-3 py-2.5 rounded-xl border-2 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all
                {fieldErrors.lastName ? 'error-border' : (touchedFields.lastName && !fieldErrors.lastName && lastName ? 'valid-border' : 'border-slate-200')}" />
              {#if fieldErrors.lastName}
                <p class="text-xs text-red-500 mt-1 ml-1">{fieldErrors.lastName}</p>
              {:else if touchedFields.lastName && lastName && !fieldErrors.lastName}
                <p class="text-xs text-green-500 mt-1 ml-1">✓ Valid</p>
              {/if}
            </div>
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Extension Name</label>
              <div class="relative">
                <select bind:value={extensionName}
                  class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all appearance-none cursor-pointer">
                  <option value="">None</option>
                  <option>Jr.</option>
                  <option>Sr.</option>
                  <option>II</option>
                  <option>III</option>
                  <option>IV</option>
                </select>
                <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <!-- First Name + Middle Name -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">First Name <span class="text-red-400">*</span></label>
              <input id="firstNameInput" type="text" bind:value={firstName}
                on:blur={() => { touchedFields.firstName = true; validateFirstName(); }}
                placeholder="Juan"
                class="w-full px-3 py-2.5 rounded-xl border-2 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all
                {fieldErrors.firstName ? 'error-border' : (touchedFields.firstName && !fieldErrors.firstName && firstName ? 'valid-border' : 'border-slate-200')}" />
              {#if fieldErrors.firstName}
                <p class="text-xs text-red-500 mt-1 ml-1">{fieldErrors.firstName}</p>
              {:else if touchedFields.firstName && firstName && !fieldErrors.firstName}
                <p class="text-xs text-green-500 mt-1 ml-1">✓ Valid</p>
              {/if}
            </div>
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Middle Name</label>
              <input id="middleNameInput" type="text" bind:value={middleName} 
                on:blur={() => { touchedFields.middleName = true; validateMiddleName(); }}
                placeholder="Santos"
                class="w-full px-3 py-2.5 rounded-xl border-2 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all
                {fieldErrors.middleName ? 'error-border' : (touchedFields.middleName && middleName && !fieldErrors.middleName ? 'valid-border' : 'border-slate-200')}" />
              {#if fieldErrors.middleName}
                <p class="text-xs text-red-500 mt-1 ml-1">{fieldErrors.middleName}</p>
              {:else if touchedFields.middleName && middleName && !fieldErrors.middleName}
                <p class="text-xs text-green-500 mt-1 ml-1">✓ Valid</p>
              {/if}
            </div>
          </div>

          <!-- Birthdate + Place of Birth -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Birthdate <span class="text-red-400">*</span></label>
              <input id="birthdateInput" type="date" bind:value={birthdate}
                on:blur={() => { touchedFields.birthdate = true; validateBirthdate(); }}
                class="w-full px-3 py-2.5 rounded-xl border-2 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all
                {fieldErrors.birthdate ? 'error-border' : (touchedFields.birthdate && !fieldErrors.birthdate && birthdate ? 'valid-border' : 'border-slate-200')}" />
              {#if fieldErrors.birthdate}
                <p class="text-xs text-red-500 mt-1 ml-1">{fieldErrors.birthdate}</p>
              {:else if touchedFields.birthdate && birthdate && !fieldErrors.birthdate}
                <p class="text-xs text-green-500 mt-1 ml-1">✓ Valid</p>
              {/if}
            </div>
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Place of Birth <span class="text-red-400">*</span></label>
              <input id="placeOfBirthInput" type="text" bind:value={placeOfBirth}
                on:blur={() => { touchedFields.placeOfBirth = true; validatePlaceOfBirth(); }}
                placeholder="e.g. Olongapo City"
                class="w-full px-3 py-2.5 rounded-xl border-2 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all
                {fieldErrors.placeOfBirth ? 'error-border' : (touchedFields.placeOfBirth && placeOfBirth && !fieldErrors.placeOfBirth ? 'valid-border' : 'border-slate-200')}" />
              {#if fieldErrors.placeOfBirth}
                <p class="text-xs text-red-500 mt-1 ml-1">{fieldErrors.placeOfBirth}</p>
              {:else if touchedFields.placeOfBirth && placeOfBirth && !fieldErrors.placeOfBirth}
                <p class="text-xs text-green-500 mt-1 ml-1">✓ Valid</p>
              {/if}
            </div>
          </div>

          {#if age !== null && !fieldErrors.birthdate && ageInDays !== null && ageInDays >= 30}
            <p class="text-xs text-slate-400 -mt-2 ml-1">Age: <span class="font-bold text-slate-600">{age} years old</span>
              {#if age >= 60}<span class="ml-1 text-emerald-600 font-bold">· Senior Citizen ✓</span>{/if}
            </p>
          {/if}

          <!-- Sex + Civil Status -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Sex <span class="text-red-400">*</span></label>
              <div class="relative">
                <select id="sexSelect" bind:value={sex}
                  on:change={() => { touchedFields.sex = true; validateSex(); }}
                  class="w-full px-3 py-2.5 rounded-xl border-2 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all appearance-none cursor-pointer
                         {fieldErrors.sex ? 'error-border' : (touchedFields.sex && !fieldErrors.sex && sex ? 'valid-border' : 'border-slate-200')}">
                  <option value="" disabled selected>Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {#if fieldErrors.sex}
                <p class="text-xs text-red-500 mt-1 ml-1">{fieldErrors.sex}</p>
              {/if}
            </div>
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Civil Status <span class="text-red-400">*</span></label>
              <div class="relative">
                <select id="civilStatusSelect" bind:value={civilStatus}
                  on:change={() => { touchedFields.civilStatus = true; validateCivilStatus(); }}
                  class="w-full px-3 py-2.5 rounded-xl border-2 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all appearance-none cursor-pointer
                         {fieldErrors.civilStatus ? 'error-border' : (touchedFields.civilStatus && !fieldErrors.civilStatus && civilStatus ? 'valid-border' : 'border-slate-200')}">
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
              {#if fieldErrors.civilStatus}
                <p class="text-xs text-red-500 mt-1 ml-1">{fieldErrors.civilStatus}</p>
              {/if}
            </div>
          </div>

          <!-- Citizenship + Contact Number -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Citizenship <span class="text-red-400">*</span></label>
              <input id="citizenshipInput" type="text" bind:value={citizenship}
                on:blur={() => { touchedFields.citizenship = true; validateCitizenship(); }}
                placeholder="Filipino"
                class="w-full px-3 py-2.5 rounded-xl border-2 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all
                {fieldErrors.citizenship ? 'error-border' : (touchedFields.citizenship && citizenship && !fieldErrors.citizenship ? 'valid-border' : 'border-slate-200')}" />
              {#if fieldErrors.citizenship}
                <p class="text-xs text-red-500 mt-1 ml-1">{fieldErrors.citizenship}</p>
              {:else if touchedFields.citizenship && citizenship && !fieldErrors.citizenship}
                <p class="text-xs text-green-500 mt-1 ml-1">✓ Valid</p>
              {/if}
            </div>
            <div>
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Contact Number</label>
              <input id="contactNoInput" type="tel" bind:value={contactNo}
                on:input={handleContactNoInput}
                on:blur={() => { touchedFields.contactNo = true; validateContactNo(); }}
                placeholder="09123456789" maxlength="11"
                class="w-full px-3 py-2.5 rounded-xl border-2 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all
                {fieldErrors.contactNo ? 'error-border' : (touchedFields.contactNo && contactNo && !fieldErrors.contactNo ? 'valid-border' : 'border-slate-200')}" />
              {#if fieldErrors.contactNo}
                <p class="text-xs text-red-500 mt-1 ml-1">{fieldErrors.contactNo}</p>
              {:else if touchedFields.contactNo && contactNo && !fieldErrors.contactNo}
                <p class="text-xs text-green-500 mt-1 ml-1">✓ Valid</p>
              {/if}
            </div>
          </div>

          <!-- Email Address -->
          <div>
            <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Email Address <span class="text-red-400">*</span></label>
            <input id="emailInput" type="email" bind:value={email}
              on:blur={() => { touchedFields.email = true; validateEmail(); }}
              placeholder="resident@example.com"
              class="w-full px-3 py-2.5 rounded-xl border-2 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all
              {fieldErrors.email ? 'error-border' : (touchedFields.email && email && !fieldErrors.email ? 'valid-border' : 'border-slate-200')}" />
            {#if fieldErrors.email}
              <p class="text-xs text-red-500 mt-1 ml-1">{fieldErrors.email}</p>
            {:else if touchedFields.email && email && !fieldErrors.email}
              <p class="text-xs text-green-500 mt-1 ml-1">✓ Valid</p>
            {/if}
            <p class="text-[0.6rem] text-slate-400 mt-1 ml-1">We'll send updates and notifications to this email</p>
          </div>

          <!-- Occupation -->
          <div>
            <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Profession / Occupation <span class="text-red-400">*</span></label>
            <input id="occupationInput" type="text" bind:value={occupation}
              on:blur={() => { touchedFields.occupation = true; validateOccupation(); }}
              placeholder="e.g. Government Employee, Student, Nurse"
              class="w-full px-3 py-2.5 rounded-xl border-2 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all
              {fieldErrors.occupation ? 'error-border' : (touchedFields.occupation && occupation && !fieldErrors.occupation ? 'valid-border' : 'border-slate-200')}" />
            {#if fieldErrors.occupation}
              <p class="text-xs text-red-500 mt-1 ml-1">{fieldErrors.occupation}</p>
            {:else if touchedFields.occupation && occupation && !fieldErrors.occupation}
              <p class="text-xs text-green-500 mt-1 ml-1">✓ Valid</p>
            {/if}
          </div>
        </div>

<!-- Address section -->
<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
  <h3 class="font-nunito font-extrabold text-slate-700">Address</h3>

  <div>
    <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Region</label>
    <div class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-100 text-slate-500 text-sm cursor-not-allowed select-none">
      Region III — Central Luzon
    </div>
  </div>

  <div class="grid grid-cols-2 gap-3">
    <div>
      <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Province</label>
      <div class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-100 text-slate-500 text-sm cursor-not-allowed select-none">
        Zambales
      </div>
    </div>
    <div>
      <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">City</label>
      <div class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-100 text-slate-500 text-sm cursor-not-allowed select-none">
        Olongapo City
      </div>
    </div>
  </div>

  <div>
    <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Barangay</label>
    <div class="w-full px-3 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-100 text-slate-500 text-sm cursor-not-allowed select-none">
      Barangay Pag-Asa
    </div>
  </div>

  <div>
    <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Street <span class="text-red-400">*</span></label>
    <div class="relative">
      <select id="streetSelect" bind:value={street}
        on:change={() => { touchedFields.street = true; validateStreet(); }}
        class="w-full px-3 py-2.5 rounded-xl border-2 bg-slate-50 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all appearance-none cursor-pointer
              {street === '' ? 'text-slate-300' : 'text-slate-700'}
              {fieldErrors.street ? 'error-border' : (touchedFields.street && street ? 'valid-border' : 'border-slate-200')}">
        <option value="">Select street</option>
        {#each streets as s (s)}
          <option value={s}>{s}</option>
        {/each}
      </select>
      <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
      </svg>
    </div>
    {#if fieldErrors.street}
      <p class="text-xs text-red-500 mt-1 ml-1">{fieldErrors.street}</p>
    {/if}
  </div>

  <div>
    <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">House No. / Unit / Block <span class="text-red-400">*</span></label>
    <input id="houseNoInput" type="text" bind:value={houseNo} 
      on:blur={() => { touchedFields.houseNo = true; validateHouseNo(); }}
      placeholder="e.g. 47 or Unit 3B or Blk 2 Lot 5"
      class="w-full px-3 py-2.5 rounded-xl border-2 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all
      {fieldErrors.houseNo ? 'error-border' : (touchedFields.houseNo && houseNo && !fieldErrors.houseNo ? 'valid-border' : 'border-slate-200')}" />
    {#if fieldErrors.houseNo}
      <p class="text-xs text-red-500 mt-1 ml-1">{fieldErrors.houseNo}</p>
    {:else if touchedFields.houseNo && houseNo && !fieldErrors.houseNo}
      <p class="text-xs text-green-500 mt-1 ml-1">✓ Valid</p>
    {/if}
    <div class="flex flex-wrap gap-1.5 mt-2">
      {#each ['47', 'Unit 3B', 'Blk 2 Lot 5', 'Room 1'] as ex (ex)}
        <button type="button" on:click={() => houseNo = ex}
          class="text-[0.65rem] font-bold px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
          {ex}
        </button>
      {/each}
    </div>
  </div>

  <div class="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
    <p class="text-[0.65rem] font-bold uppercase tracking-widest text-blue-400 mb-1">Full Address Preview</p>
    <p class="text-xs text-blue-700 font-semibold leading-relaxed">
      {fullAddress || 'Barangay Pag-Asa, Olongapo City, Zambales'}
    </p>
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
          <button type="button" on:click={() => { isPWD = !isPWD; if (!isPWD) { pwdType = ''; pwdIdFile = null; pwdIdPreview = ''; fieldErrors.pwdIdFile = ''; fieldErrors.pwdType = ''; } }}
            class="w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all
                   {isPWD ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}">
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
              {#if isPWD}
                <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              {/if}
            </div>
          </button>

          {#if isPWD}
            <div class="ml-4 space-y-3">
              <div>
                <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Type of Disability <span class="text-red-400">*</span></label>
                <div class="relative">
                  <select id="pwdTypeSelect" bind:value={pwdType}
                    on:change={() => { touchedFields.pwdType = true; validatePwdType(); }}
                    class="w-full px-3 py-2.5 rounded-xl border-2 bg-amber-50 text-slate-700 text-sm outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100 transition-all appearance-none cursor-pointer
                    {fieldErrors.pwdType ? 'error-border' : (touchedFields.pwdType && pwdType ? 'valid-border' : 'border-amber-200')}">
                    <option value="">Select type</option>
                    <option>Physical Disability</option>
                    <option>Visual Impairment</option>
                    <option>Hearing Impairment</option>
                    <option>Intellectual Disability</option>
                    <option>Psychosocial Disability</option>
                    <option>Learning Disability</option>
                    <option>Speech &amp; Language Impairment</option>
                    <option>Multiple Disability</option>
                  </select>
                  <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
                  </svg>
                </div>
                {#if fieldErrors.pwdType}
                  <p class="text-xs text-red-500 mt-1 ml-1">{fieldErrors.pwdType}</p>
                {/if}
              </div>

              <div id="pwdIdUpload">
                <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">PWD ID Proof <span class="text-red-400">*</span></label>
                {#if pwdIdPreview}
                  <div class="relative rounded-xl overflow-hidden border-2 border-emerald-300">
                    <img src={pwdIdPreview} alt="PWD ID" class="w-full h-32 object-cover" />
                    <button type="button" on:click={() => { pwdIdFile = null; pwdIdPreview = ''; fieldErrors.pwdIdFile = ''; }}
                      class="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shadow">
                      <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                {:else}
                  <label class="flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed rounded-xl cursor-pointer hover:border-amber-400 hover:bg-amber-50 transition-all bg-slate-50
                    {fieldErrors.pwdIdFile ? 'border-red-400 bg-red-50' : 'border-slate-300'}">
                    <div class="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center">
                      <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0118.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                      </svg>
                    </div>
                    <p class="text-xs text-center text-slate-600">Upload PWD ID or medical certificate</p>
                    <p class="text-[0.65rem] text-slate-400">Max 15MB</p>
                    <input id="pwdIdFileInput" type="file" accept="image/*" on:change={handlePwdIdChange} class="hidden" />
                  </label>
                {/if}
                {#if fieldErrors.pwdIdFile}
                  <p class="text-xs text-red-500 mt-1">{fieldErrors.pwdIdFile}</p>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Senior toggle -->
          <button type="button" on:click={() => { if (!isSeniorDisabled) isSenior = !isSenior; }}
            class="w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all
                   {isSenior ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}
                   {isSeniorDisabled ? 'opacity-50 cursor-not-allowed' : ''}">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 {isSenior ? 'bg-emerald-500' : 'bg-slate-200'}">
              <svg class="w-5 h-5 {isSenior ? 'text-white' : 'text-slate-400'}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
            </div>
            <div class="flex-1 text-left">
              <p class="font-bold text-slate-700 text-sm">Senior Citizen</p>
              <p class="text-xs text-slate-400">
                60 years old and above
                {#if age !== null && age >= 60}· Auto-detected ✓
                {:else if isSeniorDisabled && age !== null}· Need to be 60+ (currently {age})
                {/if}
              </p>
            </div>
            <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 {isSenior ? 'border-emerald-400 bg-emerald-400' : 'border-slate-300'}">
              {#if isSenior}
                <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              {/if}
            </div>
          </button>

          {#if isSenior && !isSeniorDisabled}
            <div id="seniorIdUpload" class="ml-4">
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Senior Citizen ID Proof <span class="text-red-400">*</span></label>
              {#if seniorIdPreview}
                <div class="relative rounded-xl overflow-hidden border-2 border-emerald-300">
                  <img src={seniorIdPreview} alt="Senior ID" class="w-full h-32 object-cover" />
                  <button type="button" on:click={() => { seniorIdFile = null; seniorIdPreview = ''; fieldErrors.seniorIdFile = ''; }}
                    class="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shadow">
                    <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              {:else}
                <label class="flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed rounded-xl cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-all bg-slate-50
                  {fieldErrors.seniorIdFile ? 'border-red-400 bg-red-50' : 'border-slate-300'}">
                  <div class="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center">
                    <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0118.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                  </div>
                  <p class="text-xs text-center text-slate-600">Upload Senior Citizen ID</p>
                  <p class="text-[0.65rem] text-slate-400">Max 15MB</p>
                  <input id="seniorIdFileInput" type="file" accept="image/*" on:change={handleSeniorIdChange} class="hidden" />
                </label>
              {/if}
              {#if fieldErrors.seniorIdFile}
                <p class="text-xs text-red-500 mt-1">{fieldErrors.seniorIdFile}</p>
              {/if}
            </div>
          {/if}

          <!-- Single Parent toggle -->
          <button type="button" on:click={() => { isSingleParent = !isSingleParent; if (!isSingleParent) { singleParentIdFile = null; singleParentIdPreview = ''; fieldErrors.singleParentIdFile = ''; } }}
            class="w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all
                   {isSingleParent ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}">
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
              {#if isSingleParent}
                <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              {/if}
            </div>
          </button>

          {#if isSingleParent}
            <div id="singleParentIdUpload" class="ml-4">
              <label class="block text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Solo Parent ID Proof <span class="text-red-400">*</span></label>
              {#if singleParentIdPreview}
                <div class="relative rounded-xl overflow-hidden border-2 border-emerald-300">
                  <img src={singleParentIdPreview} alt="Single Parent ID" class="w-full h-32 object-cover" />
                  <button type="button" on:click={() => { singleParentIdFile = null; singleParentIdPreview = ''; fieldErrors.singleParentIdFile = ''; }}
                    class="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shadow">
                    <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              {:else}
                <label class="flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed rounded-xl cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition-all bg-slate-50
                  {fieldErrors.singleParentIdFile ? 'border-red-400 bg-red-50' : 'border-slate-300'}">
                  <div class="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center">
                    <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0118.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                  </div>
                  <p class="text-xs text-center text-slate-600">Upload Solo Parent ID</p>
                  <p class="text-[0.65rem] text-slate-400">Max 15MB</p>
                  <input id="singleParentIdFileInput" type="file" accept="image/*" on:change={handleSingleParentIdChange} class="hidden" />
                </label>
              {/if}
              {#if fieldErrors.singleParentIdFile}
                <p class="text-xs text-red-500 mt-1">{fieldErrors.singleParentIdFile}</p>
              {/if}
            </div>
          {/if}

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

          <div id="housePhotoInput">
            {#if housePhotoPreview}
              <div class="relative rounded-xl overflow-hidden border-2 border-emerald-300">
                <img src={housePhotoPreview} alt="House" class="w-full h-48 object-cover" />
                <button type="button"
                  on:click={() => { housePhoto = null; housePhotoPreview = ''; fieldErrors.housePhoto = ''; }}
                  class="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shadow">
                  <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            {:else}
              <label class="flex flex-col items-center justify-center gap-3 p-6 border-2 border-dashed rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all bg-slate-50
                {fieldErrors.housePhoto ? 'border-red-400 bg-red-50' : 'border-slate-300'}">
                <div class="w-14 h-14 rounded-2xl bg-slate-200 flex items-center justify-center">
                  <svg class="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0118.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                </div>
                <div class="text-center">
                  <p class="text-sm font-bold text-slate-700">Take Photo or Upload</p>
                  <p class="text-xs text-slate-400 mt-0.5">Front view of your house · Max 15MB</p>
                </div>
                <input type="file" accept="image/*" capture="environment" on:change={handlePhotoChange} class="hidden" />
              </label>
            {/if}
            {#if fieldErrors.housePhoto}
              <p class="text-xs text-red-500 font-semibold mt-2">{fieldErrors.housePhoto}</p>
            {/if}
          </div>

          <!-- Review Summary -->
          <div class="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
            <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mb-2">Review Your Info</p>
            <p class="text-sm font-bold text-slate-700">{fullName}</p>
            <p class="text-xs text-slate-500">{email}</p>
            <p class="text-xs text-slate-500">{sex} · {age} yrs old · {civilStatus}</p>
            {#if placeOfBirth}<p class="text-xs text-slate-500">Born in: {placeOfBirth}</p>{/if}
            {#if citizenship && citizenship !== 'Filipino'}<p class="text-xs text-slate-500">Citizenship: {citizenship}</p>{/if}
            {#if occupation}<p class="text-xs text-slate-500">Occupation: {occupation}</p>{/if}
            <p class="text-xs text-slate-500">{fullAddress || 'Barangay Pag-Asa, Olongapo City, Zambales'}</p>
            <div class="flex gap-1.5 flex-wrap mt-1">
              {#if isPWD}<span class="text-[0.65rem] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">PWD</span>{/if}
              {#if isSenior}<span class="text-[0.65rem] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Senior Citizen</span>{/if}
              {#if isSingleParent}<span class="text-[0.65rem] font-bold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">Single Parent</span>{/if}
              {#if !isPWD && !isSenior && !isSingleParent}<span class="text-[0.65rem] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Regular Resident</span>{/if}
            </div>
            <div class="border-t border-slate-200 pt-2 mt-2 space-y-1">
              <p class="text-[0.65rem] font-bold text-slate-600 uppercase tracking-widest">📍 GPS Location</p>
              {#if gpsStatus === 'granted'}
                <div class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-green-400"></span>
                  <span class="text-xs text-green-600 font-semibold">Location captured · Inside Pag-Asa ✓</span>
                </div>
                <p class="text-[0.7rem] text-slate-500 font-mono">Lat: {gpsLat?.toFixed(6)}</p>
                <p class="text-[0.7rem] text-slate-500 font-mono">Lng: {gpsLng?.toFixed(6)}</p>
                <p class="text-[0.7rem] text-slate-500">Accuracy: ±{gpsAccuracy ?? 'N/A'}m {accuracyQuality}</p>
              {:else}
                <div class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span class="text-xs text-amber-600 font-semibold">No GPS location</span>
                </div>
                <p class="text-[0.7rem] text-red-500 font-bold">⚠️ GPS required to submit</p>
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
            disabled={step === 1 && !DEMO_BYPASS && (gpsStatus === 'outside' || gpsLat === null)}
            class="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white active:scale-[0.98] transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
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