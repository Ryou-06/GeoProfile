<!-- Public QR household profiling form -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { logAuditEvent } from '$lib/audit';
  import { isInsidePagAsa } from '$lib/pagasaBoundary.js';

  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const DEMO_BYPASS = urlParams.get('demo') === 'true';
  const TOTAL_STEPS = 6;
  const todayDate = new Date().toISOString().slice(0, 10);

  $: qrId = $page.params.qrId;

  type HouseholdType = 'residential' | 'business' | 'boarding';
  type ParentStatus = 'present' | 'deceased' | 'absent';

  interface Household {
    id: string;
    qrId: string;
    houseNo?: string;
    street?: string;
    landmark?: string;
  }

  interface PersonProfile {
    fullName: string;
    birthdate: string;
    placeOfBirth: string;
    sex: string;
    civilStatus: string;
    citizenship: string;
    occupation: string;
    contactNo: string;
    email: string;
    isPWD: boolean;
    pwdType: string;
    pwdProof: File | null;
    pwdProofPreview: string;
    seniorProof: File | null;
    seniorProofPreview: string;
    vaccinationStatus: string;
    bloodType: string;
    medicalNotes: string;
  }

  interface FamilyMember extends PersonProfile {
    id: number;
    relationship: string;
  }

  let household: Household | null = null;
  let householdLoading = true;
  let householdError = '';
  let submitted = false;
  let loading = false;
  let errorMsg = '';
  let invalidField = '';
  let fieldErrors: Record<string, string> = {};
  let step = 1;

  let gpsLat: number | null = null;
  let gpsLng: number | null = null;
  let gpsAccuracy: number | null = null;
  let gpsStatus = 'pending';
  let gpsMessage = 'Requesting GPS location...';
  let gpsAttempt = 0;
  let maxGpsRetries = 8;
  let watchId: number | null = null;
  let bestAccuracy: number | null = null;
  let maxWatchTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastLocation: { lat: number; lng: number; accuracy: number } | null = null;
  let gpsRetryCount = 0;
  let canRegister = false;

  let householdType: HouseholdType | '' = '';
  let agreedToTerms = false;

  let houseNo = '';
  let street = '';
  let landmark = '';

  let residentialInfo = {
    dwellingType: '',
    ownershipStatus: '',
    yearsOfStay: '',
    monthlyIncomeRange: '',
    utilities: [] as string[]
  };

  let businessInfo = {
    businessName: '',
    ownerName: '',
    businessType: '',
    permitNo: '',
    contactNo: '',
    employeesCount: '',
    operatingYears: ''
  };

  let boardingInfo = {
    propertyName: '',
    ownerName: '',
    roomsCount: '',
    tenantCapacity: '',
    currentTenants: '',
    contactNo: '',
    operatingYears: ''
  };

  let familySetup = 'both';
  let fatherStatus: ParentStatus = 'present';
  let motherStatus: ParentStatus = 'present';
  let singleParentProof: File | null = null;
  let singleParentProofPreview = '';

  let father = createPerson();
  let mother = createPerson();
  let members: FamilyMember[] = [];
  let memberCount = 0;

  let housePhoto: File | null = null;
  let housePhotoPreview = '';
  let reviewPage = 0;

  const streets = ['Gordon Avenue', 'Murphy Street', 'Natividad Street', 'Burgos Street', 'East 12th Street', 'Perimeter Road', 'Bonifacio Street'];
  const stepLabels = ['Type', 'Details', 'Parents', 'Members', 'Photo', 'Review'];
  const reviewLabels = ['Profile', 'Address', 'Details', 'Parents', 'Members', 'Photo'];

  $: fullAddress = [houseNo.trim(), street, 'Barangay Pag-Asa', 'Olongapo City', 'Zambales'].filter(Boolean).join(', ');
  $: canRegister = DEMO_BYPASS || gpsStatus === 'granted';
  $: isSingleParentHousehold = householdType === 'residential' && (familySetup === 'mother_only' || familySetup === 'father_only' || fatherStatus !== 'present' || motherStatus !== 'present');
  $: headOfFamily =
    fatherStatus === 'present' && father.fullName.trim()
      ? father
      : motherStatus === 'present' && mother.fullName.trim()
        ? mother
        : null;
  $: primaryAge = headOfFamily ? calculateAge(headOfFamily.birthdate) : null;
  $: primaryIsSenior = primaryAge !== null && primaryAge >= 60;

  function createPerson(): PersonProfile {
    return {
      fullName: '',
      birthdate: '',
      placeOfBirth: '',
      sex: '',
      civilStatus: '',
      citizenship: 'Filipino',
      occupation: '',
      contactNo: '',
      email: '',
      isPWD: false,
      pwdType: '',
      pwdProof: null,
      pwdProofPreview: '',
      seniorProof: null,
      seniorProofPreview: '',
      vaccinationStatus: '',
      bloodType: '',
      medicalNotes: ''
    };
  }

  function createMember(id: number): FamilyMember {
    return { id, relationship: '', ...createPerson() };
  }

  function calculateAge(birthdate: string) {
    if (!birthdate) return null;
    const birthMs = Date.parse(birthdate);
    if (Number.isNaN(birthMs)) return null;
    return Math.floor((Date.now() - birthMs) / (365.25 * 24 * 60 * 60 * 1000));
  }

  function isSenior(person: PersonProfile) {
    const age = calculateAge(person.birthdate);
    return age !== null && age >= 60;
  }

  function markInvalid(field: string, message: string) {
    invalidField = field;
    setFieldError(field, message);
    return message;
  }

  function setFieldError(field: string, message: string) {
    if (message) {
      fieldErrors = { ...fieldErrors, [field]: message };
      invalidField = field;
      errorMsg = '';
      return;
    }
    if (!(field in fieldErrors)) return;
    const nextErrors = { ...fieldErrors };
    delete nextErrors[field];
    fieldErrors = nextErrors;
    if (invalidField === field) {
      invalidField = '';
      errorMsg = '';
    }
  }

  function fieldInvalid(field: string) {
    return invalidField === field || Boolean(fieldErrors[field]);
  }

  function fieldError(field: string) {
    return fieldErrors[field] || (invalidField === field ? errorMsg : '');
  }

  function scrollToInvalidField() {
    if (!invalidField) return;
    setTimeout(() => {
      const selector = `[data-field="${CSS.escape(invalidField)}"]`;
      const target = document.querySelector<HTMLElement>(selector);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.focus?.({ preventScroll: true });
    }, 80);
  }

  function isValidEmail(value: string) {
    if (!value.trim()) return true;
    return /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(value.trim());
  }

  function isValidContactNo(value: string) {
    if (!value.trim()) return true;
    const digits = value.replace(/[^\d]/g, '');
    return digits.length === 11;
  }

  function isValidPersonName(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (/\d/.test(trimmed)) return false;
    if (!/[a-zA-Z]/.test(trimmed)) return false;
    return /^[a-zA-ZÀ-ÿÑñ\s.'-]+$/.test(trimmed);
  }

  function isValidRequiredText(value: string) {
    const trimmed = value.trim();
    return trimmed.length > 1 && /[a-zA-Z0-9]/.test(trimmed);
  }

  function isValidBirthdate(value: string) {
    if (!value) return false;
    const date = new Date(value);
    const age = calculateAge(value);
    return !Number.isNaN(date.getTime()) && date <= new Date() && age !== null && age >= 0 && age <= 120;
  }

  function isNonNegativeNumber(value: string) {
    if (!String(value).trim()) return true;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0;
  }

  function personLabelFromPrefix(fieldPrefix: string) {
    if (fieldPrefix === 'father') return 'Father/head';
    if (fieldPrefix === 'mother') return 'Mother/head';
    if (fieldPrefix.startsWith('member-')) {
      const index = Number(fieldPrefix.replace('member-', ''));
      const label = householdType === 'boarding' ? 'Tenant/boarder' : 'Family member';
      return `${label} ${Number.isFinite(index) ? index + 1 : ''}`.trim();
    }
    return 'Resident';
  }

  function validatePersonField(person: PersonProfile | FamilyMember, fieldPrefix: string, key: string, force = false, valueOverride?: string) {
    const field = `${fieldPrefix}.${key}`;
    let message = '';
    const label = personLabelFromPrefix(fieldPrefix);
    const value = valueOverride ?? '';
    const relationship = 'relationship' in person && valueOverride !== undefined ? value : 'relationship' in person ? person.relationship : '';
    const fullName = key === 'fullName' && valueOverride !== undefined ? value : person.fullName;
    const birthdate = key === 'birthdate' && valueOverride !== undefined ? value : person.birthdate;
    const placeOfBirth = key === 'placeOfBirth' && valueOverride !== undefined ? value : person.placeOfBirth;
    const sex = key === 'sex' && valueOverride !== undefined ? value : person.sex;
    const citizenship = key === 'citizenship' && valueOverride !== undefined ? value : person.citizenship;
    const occupation = key === 'occupation' && valueOverride !== undefined ? value : person.occupation;
    const contactNo = key === 'contactNo' && valueOverride !== undefined ? value : person.contactNo;
    const email = key === 'email' && valueOverride !== undefined ? value : person.email;
    const pwdType = key === 'pwdType' && valueOverride !== undefined ? value : person.pwdType;

    if (key === 'relationship' && 'relationship' in person && (force || relationship.trim()) && !relationship.trim()) {
      message = 'Relationship / room is required.';
    }
    if (key === 'fullName' && (force || fullName.trim())) {
      if (!fullName.trim()) message = 'Full name is required.';
      else if (!isValidPersonName(fullName)) message = 'Full name must use letters only, not numbers.';
    }
    if (key === 'birthdate' && (force || birthdate)) {
      if (!birthdate) message = 'Birthdate is required.';
      else if (birthdate > todayDate) message = 'Future dates are not allowed.';
      else if (!isValidBirthdate(birthdate)) message = 'Enter a valid birthdate.';
    }
    if (key === 'placeOfBirth' && (force || placeOfBirth.trim()) && !placeOfBirth.trim()) message = 'Place of birth is required.';
    if (key === 'sex' && (force || sex) && !sex) message = 'Sex is required.';
    if (key === 'citizenship' && (force || citizenship.trim()) && !citizenship.trim()) message = 'Citizenship is required.';
    if (key === 'occupation' && (force || occupation.trim()) && !occupation.trim()) {
      message = 'Occupation is required. Enter N/A if none.';
    }
    if (key === 'contactNo' && contactNo.trim() && !isValidContactNo(contactNo)) {
      message = 'Contact number must be exactly 11 digits.';
    }
    if (key === 'email' && email.trim() && !isValidEmail(email)) {
      message = 'Email must be a valid Gmail address, like name@gmail.com.';
    }
    if (key === 'pwdType' && person.isPWD && (force || pwdType) && !pwdType) {
      message = 'PWD type is required.';
    }

    setFieldError(field, message);
  }

  function seniorStatusText(person: PersonProfile) {
    const age = calculateAge(person.birthdate);
    if (age === null) return 'Enter birthdate to check senior status.';
    if (age >= 60) return `Auto-detected as Senior Citizen, age ${age}. Proof is required.`;
    return `Disabled, age ${age}. Senior Citizen applies at 60 years old and above.`;
  }

  function pwdProofLabel(person: PersonProfile) {
    return person.pwdType ? `Upload ${person.pwdType} Proof` : 'Upload PWD Proof';
  }

  function getFirstName(fullName: string) {
    return fullName.trim().split(/\s+/)[0] ?? '';
  }

  function getLastName(fullName: string) {
    const parts = fullName.trim().split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }

  function syncFamilySetup() {
    if (familySetup === 'both') {
      fatherStatus = 'present';
      motherStatus = 'present';
    } else if (familySetup === 'mother_only') {
      fatherStatus = 'absent';
      motherStatus = 'present';
    } else if (familySetup === 'father_only') {
      fatherStatus = 'present';
      motherStatus = 'absent';
    } else {
      fatherStatus = 'absent';
      motherStatus = 'absent';
    }
  }

  function setMemberCount() {
    const safeCount = Math.max(0, Math.min(20, Number(memberCount) || 0));
    memberCount = safeCount;
    if (members.length < safeCount) {
      const next = [...members];
      for (let i = members.length; i < safeCount; i++) next.push(createMember(Date.now() + i));
      members = next;
    } else {
      members = members.slice(0, safeCount);
    }
  }

  function refreshPerson(person: PersonProfile | FamilyMember) {
    if ('id' in person) {
      members = members.map((member) => (member.id === person.id ? { ...person } as FamilyMember : member));
    } else if (person === father) {
      father = { ...father };
    } else if (person === mother) {
      mother = { ...mother };
    }
  }

  function handlePwdToggle(event: Event, person: PersonProfile | FamilyMember) {
    const input = event.target as HTMLInputElement;
    person.isPWD = input.checked;
    if (!person.isPWD) {
      person.pwdType = '';
      person.pwdProof = null;
      person.pwdProofPreview = '';
    }
    refreshPerson(person);
  }

  function toggleUtility(value: string) {
    residentialInfo.utilities = residentialInfo.utilities.includes(value)
      ? residentialInfo.utilities.filter((item) => item !== value)
      : [...residentialInfo.utilities, value];
  }

  function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
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

  function isValidLocation(lat: number, lng: number, accuracy: number) {
    if (Number.isNaN(lat) || Number.isNaN(lng)) return false;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
    if (accuracy > 1000) return false;
    if (lastLocation && calculateDistance(lastLocation.lat, lastLocation.lng, lat, lng) > 0.5) return false;
    return true;
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
    gpsMessage = `Requesting GPS location... (attempt 1/${maxGpsRetries})`;

    maxWatchTimeout = setTimeout(() => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (gpsStatus === 'pending' || gpsStatus === 'optimizing') {
        gpsStatus = 'error';
        gpsMessage = 'GPS request timed out. Please go outdoors and try again.';
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
        if (bestAccuracy === null || newAccuracy < bestAccuracy) bestAccuracy = newAccuracy;
        gpsAttempt++;

        const shouldFinalize = newAccuracy <= 15 || (newAccuracy <= 30 && gpsAttempt >= 2) || gpsAttempt >= maxGpsRetries;
        if (!shouldFinalize) {
          gpsStatus = 'optimizing';
          gpsMessage = `Optimizing accuracy (+/-${newAccuracy}m). Keep phone steady.`;
          return;
        }

        stopGPS();
        if (DEMO_BYPASS) {
          gpsStatus = 'granted';
          gpsMessage = `Demo mode: location check bypassed (+/-${newAccuracy}m).`;
        } else if (!isInsidePagAsa(newLat, newLng)) {
          gpsStatus = 'outside';
          gpsMessage = 'You are outside Barangay Pag-Asa.';
        } else {
          gpsStatus = 'granted';
          gpsMessage = `Location confirmed (+/-${newAccuracy}m accuracy).`;
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          gpsStatus = 'denied';
          gpsMessage = 'Location permission denied. Please enable location access.';
          stopGPS();
          return;
        }
        gpsRetryCount++;
        if (gpsRetryCount < 3) {
          gpsMessage = `GPS unavailable. Retrying (${gpsRetryCount}/3).`;
        } else {
          gpsStatus = 'error';
          gpsMessage = 'GPS unavailable. Please go outdoors and retry.';
          stopGPS();
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function retryGPS() {
    gpsLat = null;
    gpsLng = null;
    gpsAccuracy = null;
    requestGPSEnhanced();
  }

  function locationGateTitle() {
    if (gpsStatus === 'outside') return 'Outside Pag-Asa';
    if (gpsStatus === 'denied') return 'Location Access Needed';
    if (gpsStatus === 'error') return 'GPS Not Ready';
    if (gpsStatus === 'optimizing') return 'Confirming Location';
    return 'Checking Your Location';
  }

  function locationGateMessage() {
    if (gpsStatus === 'outside') return 'Your location is outside the Barangay Pag-Asa boundary, so this QR registration cannot continue.';
    if (gpsStatus === 'denied') return 'Please enable location permission for your browser, then retry the GPS check.';
    if (gpsStatus === 'error') return 'GPS could not confirm your location. Please go outdoors or near a window, then retry.';
    if (gpsStatus === 'optimizing') return 'Please keep your phone steady while GeoProfile confirms that you are inside Barangay Pag-Asa.';
    return 'GeoProfile is checking if you are inside Barangay Pag-Asa before opening the form.';
  }

  function validateImage(file: File) {
    if (file.size > 15 * 1024 * 1024) return 'File must be less than 15MB.';
    if (!file.type.startsWith('image/')) return 'Please select an image file.';
    return '';
  }

  function fileToPreview(file: File, callback: (preview: string) => void) {
    const reader = new FileReader();
    reader.onload = (event) => callback((event.target?.result as string) ?? '');
    reader.readAsDataURL(file);
  }

  function handlePersonProofChange(event: Event, person: PersonProfile, field: 'pwd' | 'senior') {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const error = validateImage(file);
    if (error) {
      errorMsg = error;
      return;
    }
    if (field === 'pwd') {
      person.pwdProof = file;
      fileToPreview(file, (preview) => {
        person.pwdProofPreview = preview;
        refreshPerson(person);
      });
    } else {
      person.seniorProof = file;
      fileToPreview(file, (preview) => {
        person.seniorProofPreview = preview;
        refreshPerson(person);
      });
    }
    errorMsg = '';
  }

  function handleSingleParentProofChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const error = validateImage(file);
    if (error) {
      errorMsg = error;
      return;
    }
    singleParentProof = file;
    fileToPreview(file, (preview) => (singleParentProofPreview = preview));
  }

  function handlePhotoChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const error = validateImage(file);
    if (error) {
      errorMsg = error;
      return;
    }
    housePhoto = file;
    fileToPreview(file, (preview) => (housePhotoPreview = preview));
    errorMsg = '';
  }

  function readFileAsBase64(file: File | null): Promise<string | null> {
    if (!file) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function compressImage(file: File, maxW = 1200, maxH = 900, quality = 0.8): Promise<string | null> {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          h = Math.round((h * maxW) / w);
          w = maxW;
        }
        if (h > maxH) {
          w = Math.round((w * maxH) / h);
          h = maxH;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(objectUrl);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
      };
      img.src = objectUrl;
    });
  }

  async function readProofImage(file: File | null) {
    if (!file) return null;
    const compressed = await compressImage(file, 720, 720, 0.62);
    if (compressed) return compressed;

    const fallback = await readFileAsBase64(file);
    if (fallback && fallback.length > 850_000) {
      throw new Error('Proof image is too large for upload. Please use a screenshot or smaller photo.');
    }
    return fallback;
  }

  function personIsValid(person: PersonProfile, label: string, fieldPrefix: string) {
    if (!person.fullName.trim()) return markInvalid(`${fieldPrefix}.fullName`, `${label}: full name is required.`);
    if (!isValidPersonName(person.fullName)) return markInvalid(`${fieldPrefix}.fullName`, `${label}: full name must use letters only, not numbers.`);
    if (!person.birthdate) return markInvalid(`${fieldPrefix}.birthdate`, `${label}: birthdate is required.`);
    if (!isValidBirthdate(person.birthdate)) return markInvalid(`${fieldPrefix}.birthdate`, `${label}: enter a valid birthdate.`);
    if (!person.placeOfBirth.trim()) return markInvalid(`${fieldPrefix}.placeOfBirth`, `${label}: place of birth is required.`);
    if (!person.sex) return markInvalid(`${fieldPrefix}.sex`, `${label}: sex is required.`);
    if (!person.citizenship.trim()) return markInvalid(`${fieldPrefix}.citizenship`, `${label}: citizenship is required.`);
    if (!person.occupation.trim()) return markInvalid(`${fieldPrefix}.occupation`, `${label}: occupation is required. Enter N/A if none.`);
    if (!isValidContactNo(person.contactNo)) return markInvalid(`${fieldPrefix}.contactNo`, `${label}: contact number must be exactly 11 digits.`);
    if (!isValidEmail(person.email)) return markInvalid(`${fieldPrefix}.email`, `${label}: email must be a valid Gmail address, like name@gmail.com.`);
    if (person.isPWD && !person.pwdType) return markInvalid(`${fieldPrefix}.pwdType`, `${label}: PWD type is required.`);
    if (person.isPWD && !person.pwdProof) return markInvalid(`${fieldPrefix}.pwdProof`, `${label}: PWD proof is required.`);
    if (isSenior(person) && !person.seniorProof) return markInvalid(`${fieldPrefix}.seniorProof`, `${label}: senior proof is required.`);
    return '';
  }

  function validateStep() {
    invalidField = '';
    if (!canRegister) return 'You must be inside Barangay Pag-Asa before filling out this form.';
    if (step === 1) {
      if (gpsLat === null || gpsLng === null) return 'Please wait for GPS to lock your location.';
      if (!householdType) return markInvalid('householdType', 'Please choose a household/profile type.');
      if (!agreedToTerms) return markInvalid('agreedToTerms', 'Please agree to submit your information to the system.');
    }

    if (step === 2) {
      if (!houseNo.trim()) return markInvalid('houseNo', 'House No. / Unit is required.');
      if (!street) return markInvalid('street', 'Street is required.');
      if (householdType === 'residential') {
        if (!residentialInfo.dwellingType) return markInvalid('residential.dwellingType', 'Dwelling type is required.');
        if (!residentialInfo.ownershipStatus) return markInvalid('residential.ownershipStatus', 'Ownership status is required.');
        if (!isNonNegativeNumber(residentialInfo.yearsOfStay)) return markInvalid('residential.yearsOfStay', 'Years of stay must be a valid number.');
      }
      if (householdType === 'business') {
        if (!isValidRequiredText(businessInfo.businessName)) return markInvalid('business.businessName', 'Business name is required.');
        if (!businessInfo.ownerName.trim()) return markInvalid('business.ownerName', 'Owner name is required.');
        if (!isValidPersonName(businessInfo.ownerName)) return markInvalid('business.ownerName', 'Owner name must use letters only, not numbers.');
        if (!isValidRequiredText(businessInfo.businessType)) return markInvalid('business.businessType', 'Business type is required.');
        if (!isValidContactNo(businessInfo.contactNo)) return markInvalid('business.contactNo', 'Contact number must be exactly 11 digits.');
        if (!isNonNegativeNumber(businessInfo.employeesCount)) return markInvalid('business.employeesCount', 'Number of employees must be a valid number.');
        if (!isNonNegativeNumber(businessInfo.operatingYears)) return markInvalid('business.operatingYears', 'Years operating must be a valid number.');
      }
      if (householdType === 'boarding') {
        if (!isValidRequiredText(boardingInfo.propertyName)) return markInvalid('boarding.propertyName', 'Property name is required.');
        if (!boardingInfo.ownerName.trim()) return markInvalid('boarding.ownerName', 'Owner or manager is required.');
        if (!isValidPersonName(boardingInfo.ownerName)) return markInvalid('boarding.ownerName', 'Owner or manager name must use letters only, not numbers.');
        if (!boardingInfo.roomsCount || Number(boardingInfo.roomsCount) <= 0) return markInvalid('boarding.roomsCount', 'Number of rooms is required.');
        if (!isNonNegativeNumber(boardingInfo.tenantCapacity)) return markInvalid('boarding.tenantCapacity', 'Tenant capacity must be a valid number.');
        if (!isNonNegativeNumber(boardingInfo.currentTenants)) return markInvalid('boarding.currentTenants', 'Current tenants must be a valid number.');
        if (!isValidContactNo(boardingInfo.contactNo)) return markInvalid('boarding.contactNo', 'Contact number must be exactly 11 digits.');
        if (!isNonNegativeNumber(boardingInfo.operatingYears)) return markInvalid('boarding.operatingYears', 'Years operating must be a valid number.');
      }
    }

    if (step === 3 && householdType === 'residential') {
      if (fatherStatus === 'present') {
        const fatherError = personIsValid(father, 'Father/head', 'father');
        if (fatherError) return fatherError;
      }
      if (motherStatus === 'present') {
        const motherError = personIsValid(mother, 'Mother/head', 'mother');
        if (motherError) return motherError;
      }
      if (fatherStatus !== 'present' && motherStatus !== 'present') return markInvalid('familySetup', 'At least one parent, head, or guardian must be present.');
      if (isSingleParentHousehold && !singleParentProof) return markInvalid('singleParentProof', 'Solo parent/guardian proof is required.');
    }

    if (step === 4 && (householdType === 'residential' || householdType === 'boarding')) {
      for (let i = 0; i < members.length; i++) {
        const personLabel = householdType === 'boarding' ? `Tenant/boarder ${i + 1}` : `Family member ${i + 1}`;
        const memberError = personIsValid(members[i], personLabel, `member-${i}`);
        if (memberError) return memberError;
        if (!members[i].relationship.trim()) return markInvalid(`member-${i}.relationship`, `${personLabel}: relationship/room is required.`);
      }
    }

    if (step === 5 && !housePhoto) return markInvalid('housePhoto', 'House or establishment photo is required.');
    return '';
  }

  function nextStep() {
    errorMsg = validateStep();
    if (errorMsg) {
      scrollToInvalidField();
      return;
    }
    step = Math.min(TOTAL_STEPS, step + 1);
    if (step === 6) reviewPage = 0;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function prevStep() {
    errorMsg = '';
    step = Math.max(1, step - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function nextReviewPage() {
    reviewPage = Math.min(reviewLabels.length - 1, reviewPage + 1);
  }

  function prevReviewPage() {
    reviewPage = Math.max(0, reviewPage - 1);
  }

  function serializePerson(person: PersonProfile) {
    return {
      fullName: person.fullName.trim(),
      birthdate: person.birthdate,
      age: calculateAge(person.birthdate),
      placeOfBirth: person.placeOfBirth.trim(),
      sex: person.sex,
      civilStatus: person.civilStatus,
      citizenship: person.citizenship.trim(),
      occupation: person.occupation.trim(),
      contactNo: person.contactNo.trim(),
      email: person.email.trim().toLowerCase(),
      isPWD: person.isPWD,
      pwdType: person.isPWD ? person.pwdType : null,
      isSenior: isSenior(person),
      vaccinationStatus: person.vaccinationStatus,
      bloodType: person.bloodType,
      medicalNotes: person.medicalNotes.trim()
    };
  }

  async function serializeProofs(person: PersonProfile) {
    const pwdProof = person.isPWD ? await readProofImage(person.pwdProof) : null;
    const seniorProof = isSenior(person) ? await readProofImage(person.seniorProof) : null;

    return {
      pwdProof,
      pwdIdProof: pwdProof,
      seniorProof,
      seniorIdProof: seniorProof
    };
  }

  async function handleSubmit() {
    if (!canRegister) {
      errorMsg = 'Registration blocked because your location is not confirmed inside Barangay Pag-Asa.';
      return;
    }
      for (let checkStep = 1; checkStep <= 5; checkStep++) {
      step = checkStep;
      errorMsg = validateStep();
      if (errorMsg) {
        scrollToInvalidField();
        return;
      }
    }
    step = 6;

    if (gpsLat === null || gpsLng === null) {
      errorMsg = 'Location is required before submitting.';
      return;
    }
    if (!DEMO_BYPASS && !isInsidePagAsa(gpsLat, gpsLng)) {
      errorMsg = 'Registration blocked because your location is outside Barangay Pag-Asa.';
      return;
    }

    loading = true;
    try {
      const { db } = await import('$lib/firebase');
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');

      const photoUrl = housePhoto ? await compressImage(housePhoto) : null;
      const fatherProofs = await serializeProofs(father);
      const motherProofs = await serializeProofs(mother);
      const memberProfiles = [];
      for (const member of members) {
        const memberProofs = await serializeProofs(member);
        memberProfiles.push({
          ...serializePerson(member),
          ...memberProofs,
          relationship: member.relationship.trim(),
          proofs: memberProofs
        });
      }

      const primary = headOfFamily ?? createPerson();
      const primaryName = primary.fullName.trim() || businessInfo.ownerName.trim() || boardingInfo.ownerName.trim() || 'Household Profile';
      const primaryProofs = await serializeProofs(primary);
      const soloParentProofValue = isSingleParentHousehold ? await readProofImage(singleParentProof) : null;

      const residentRef = await addDoc(collection(db, 'residents'), {
        householdId: household?.id ?? null,
        qrId,
        profileKind: 'household-profiling',
        householdType,
        householdDetails: {
          residential: householdType === 'residential' ? residentialInfo : null,
          business: householdType === 'business' ? businessInfo : null,
          boarding: householdType === 'boarding' ? boardingInfo : null
        },
        houseNo: houseNo.trim(),
        street,
        landmark: landmark.trim() || household?.landmark || '',
        barangay: 'Barangay Pag-Asa',
        city: 'Olongapo City',
        province: 'Zambales',
        region: 'Region III - Central Luzon',
        address: fullAddress,
        familySetup,
        parents: {
          father: fatherStatus === 'present' ? { ...serializePerson(father), ...fatherProofs, status: fatherStatus, proofs: fatherProofs } : { status: fatherStatus },
          mother: motherStatus === 'present' ? { ...serializePerson(mother), ...motherProofs, status: motherStatus, proofs: motherProofs } : { status: motherStatus }
        },
        familyMembers: memberProfiles,
        occupantRecords: householdType === 'boarding' ? memberProfiles : [],
        memberCount: members.length,
        singleParent: isSingleParentHousehold,
        singleParentProof: soloParentProofValue,
        singleParentIdProof: soloParentProofValue,
        firstName: getFirstName(primaryName),
        lastName: getLastName(primaryName),
        name: primaryName,
        email: primary.email.trim().toLowerCase(),
        birthdate: primary.birthdate,
        placeOfBirth: primary.placeOfBirth.trim(),
        age: calculateAge(primary.birthdate) ?? 0,
        sex: primary.sex,
        civilStatus: primary.civilStatus,
        citizenship: primary.citizenship.trim(),
        occupation: primary.occupation.trim(),
        contactNo: primary.contactNo.trim(),
        isPWD: primary.isPWD || members.some((member) => member.isPWD),
        pwdProof: primaryProofs.pwdProof,
        pwdIdProof: primaryProofs.pwdIdProof,
        isSenior: primaryIsSenior || members.some((member) => isSenior(member)),
        seniorProof: primaryProofs.seniorProof,
        seniorIdProof: primaryProofs.seniorIdProof,
        isSingleParent: isSingleParentHousehold,
        lat: gpsLat,
        lng: gpsLng,
        gpsAccuracy,
        bestAccuracy,
        gpsAttempts: gpsAttempt,
        photoUrl,
        termsAccepted: agreedToTerms,
        status: 'pending',
        submittedAt: serverTimestamp(),
        encodedBy: null
      });
      await logAuditEvent({
        action: 'submit_resident_profile',
        module: 'Residents',
        description: `Submitted household profile for ${primaryName}`,
        targetId: residentRef.id,
        targetLabel: primaryName,
        actorName: primaryName,
        actorRole: 'resident',
        changes: {
          status: { oldValue: null, newValue: 'pending' }
        },
        metadata: {
          qrId,
          householdId: household?.id ?? null,
          householdType,
          address: fullAddress,
          memberCount: members.length
        }
      });

      submitted = true;
      localStorage.removeItem('last_qr_id');
    } catch (error) {
      console.error(error);
      errorMsg = error instanceof Error ? error.message : 'Submission failed. Please check your internet and try again.';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    const currentQrId = window.location.pathname.split('/').pop() ?? '';
    requestGPSEnhanced();
    if (currentQrId) localStorage.setItem('last_qr_id', currentQrId);

    (async () => {
      try {
        const { db } = await import('$lib/firebase');
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const snap = await getDocs(query(collection(db, 'households'), where('qrId', '==', currentQrId)));
        if (snap.empty) {
          householdError = 'This QR code is invalid or has expired. Please contact your Barangay staff.';
        } else {
          household = { id: snap.docs[0].id, ...snap.docs[0].data() } as Household;
          houseNo = household.houseNo ?? '';
          street = household.street ?? '';
          landmark = household.landmark ?? '';
        }
      } catch (error) {
        console.error(error);
        householdError = 'Could not load household info. Please check your internet connection.';
      } finally {
        householdLoading = false;
      }
    })();

    return () => stopGPS();
  });
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="theme-color" content="#0f2060" />
  <title>GeoProfile - Household Profiling</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 font-inter">
  <div class="sticky top-0 z-20 px-4 py-3 flex items-center gap-3 shadow-sm" style="background: linear-gradient(135deg, #0f2060, #1a4fa0);">
    <div class="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-base shadow shrink-0 font-black text-blue-900">G</div>
    <div>
      <p class="font-nunito font-black text-white text-base leading-none">GeoProfile</p>
      <p class="text-white/60 text-[0.65rem]">Barangay Pag-Asa Household Profiling</p>
    </div>
    <div class="ml-auto text-right">
      <p class="text-white/70 text-[0.65rem] font-semibold">
        {canRegister ? 'GPS locked' : gpsStatus === 'outside' ? 'Outside area' : gpsStatus === 'optimizing' ? 'Optimizing GPS' : 'Getting GPS'}
      </p>
      {#if gpsAccuracy !== null}<p class="text-white/50 text-[0.6rem]">+/-{gpsAccuracy}m</p>{/if}
    </div>
  </div>

  {#if householdLoading}
    <div class="flex flex-col items-center justify-center py-20 text-slate-400">
      <svg class="w-8 h-8 animate-spin mb-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" d="M12 2a10 10 0 0 1 0 20" />
      </svg>
      <p class="text-sm font-semibold">Loading QR session...</p>
    </div>
  {:else if householdError}
    <div class="p-6 flex flex-col items-center text-center">
      <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4 text-red-500 font-black">!</div>
      <h2 class="font-nunito font-extrabold text-slate-700 text-lg mb-2">Invalid QR Code</h2>
      <p class="text-sm text-slate-500">{householdError}</p>
    </div>
  {:else if !canRegister}
    <div class="p-6 flex flex-col items-center text-center mt-8">
      {#if gpsStatus === 'outside'}
        <div class="w-full max-w-sm rounded-3xl border-2 border-red-200 bg-red-50 px-5 py-6 shadow-sm">
          <div class="w-20 h-20 rounded-full bg-red-600 text-white flex items-center justify-center mx-auto mb-5 font-black text-sm shadow-lg">BLOCKED</div>
          <p class="text-[0.68rem] font-black tracking-[0.2em] uppercase text-red-500 mb-2">Location Restricted</p>
          <h2 class="font-nunito font-extrabold text-red-700 text-2xl mb-3">{locationGateTitle()}</h2>
          <p class="text-red-700 text-sm font-semibold leading-relaxed mb-3">{locationGateMessage()}</p>
          <p class="text-xs text-red-500 leading-relaxed mb-5">{gpsMessage}</p>
          <div class="rounded-2xl bg-white border border-red-100 px-4 py-3 mb-5 text-left">
            <p class="text-xs font-bold text-red-700">The profiling form is locked.</p>
            <p class="text-xs text-red-500 mt-1 leading-relaxed">If this household is a Pag-Asa resident, contact barangay staff for verification.</p>
          </div>
          <button type="button" on:click={retryGPS} class="w-full py-3.5 rounded-2xl text-sm font-bold text-white shadow-lg bg-red-600">Retry GPS</button>
        </div>
      {:else}
        <div class="w-20 h-20 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-5 font-black">GPS</div>
        <h2 class="font-nunito font-extrabold text-slate-800 text-2xl mb-2">{locationGateTitle()}</h2>
        <p class="text-slate-500 text-sm leading-relaxed max-w-xs mb-3">{locationGateMessage()}</p>
        <p class="text-xs text-slate-400 leading-relaxed max-w-xs mb-6">{gpsMessage}</p>
        <button type="button" on:click={retryGPS} class="w-full max-w-xs py-3.5 rounded-2xl text-sm font-bold text-white shadow-lg" style="background:#0f2060;">Retry GPS</button>
      {/if}
    </div>
  {:else if submitted}
    <div class="p-6 flex flex-col items-center text-center">
      <div class="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-5 mt-8 text-green-600 font-black">OK</div>
      <h2 class="font-nunito font-extrabold text-slate-800 text-2xl mb-2">Profile Submitted</h2>
      <p class="text-slate-500 text-sm leading-relaxed max-w-xs mb-6">Your household profile was submitted successfully and is pending barangay review.</p>
      <div class="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-4 text-left space-y-2">
        <p class="text-xs text-slate-400 font-bold uppercase tracking-widest">Submitted Profile</p>
        <p class="text-sm font-bold text-slate-700">{headOfFamily?.fullName || businessInfo.ownerName || boardingInfo.ownerName || 'Household Profile'}</p>
        <p class="text-xs text-slate-500 capitalize">{householdType}</p>
        <p class="text-xs text-slate-500">{fullAddress}</p>
        {#if gpsLat && gpsLng}<p class="text-[0.7rem] text-slate-500 font-mono">{gpsLat.toFixed(6)}, {gpsLng.toFixed(6)}</p>{/if}
      </div>
    </div>
  {:else}
    <div class="px-4 py-5 max-w-3xl mx-auto space-y-5">
      <div class="flex items-center gap-3 bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-sm">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white font-bold" style="background:#0f2060;">QR</div>
        <div class="min-w-0">
          <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">Profiling Session</p>
          <p class="font-bold text-slate-700 text-sm truncate">{houseNo || household?.houseNo || 'Household'} {street || household?.street}</p>
          <p class="text-xs text-slate-500">Brgy. Pag-Asa - {qrId}</p>
        </div>
      </div>

      <div class="rounded-2xl border px-4 py-3 {canRegister ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}">
        <p class="text-xs font-bold {canRegister ? 'text-green-700' : 'text-blue-700'}">{gpsMessage}</p>
        <p class="text-xs mt-1 {canRegister ? 'text-green-600' : 'text-blue-600'}">Geo-tagging starts automatically when the QR form opens.</p>
      </div>

      <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm overflow-x-auto">
        <div class="flex min-w-[680px] items-center gap-2">
          {#each stepLabels as label, i (label)}
            <div class="flex items-center gap-2 flex-1">
              <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold {step === i + 1 ? 'text-white' : step > i + 1 ? 'text-white' : 'bg-slate-200 text-slate-400'}"
                style="{step === i + 1 ? 'background:#0f2060;' : step > i + 1 ? 'background:#059669;' : ''}">
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span class="text-xs font-semibold {step === i + 1 ? 'text-slate-700' : 'text-slate-400'}">{label}</span>
              {#if i < stepLabels.length - 1}<div class="flex-1 h-0.5 bg-slate-200 rounded-full"></div>{/if}
            </div>
          {/each}
        </div>
      </div>

      {#if errorMsg}
        <div class="bg-red-50 border border-red-200 text-red-600 text-xs font-semibold px-4 py-3 rounded-xl">{errorMsg}</div>
      {/if}

      {#if step === 1}
        <section class="panel">
          <div>
            <p class="eyebrow">Part 1</p>
            <h2 class="title">Household Type and Consent</h2>
            <p class="sub">Choose what kind of profile this QR session is for.</p>
          </div>
          <div class="grid md:grid-cols-3 gap-3 rounded-xl {fieldInvalid('householdType') ? 'group-error p-2' : ''}" data-field="householdType" tabindex="-1">
            <button type="button" on:click={() => (householdType = 'residential')} class="type-card {householdType === 'residential' ? 'type-card-active' : ''}">
              <span class="font-bold text-sm">Residential</span><span class="text-xs opacity-70">Family or individual living household</span>
            </button>
            <button type="button" on:click={() => (householdType = 'business')} class="type-card {householdType === 'business' ? 'type-card-active' : ''}">
              <span class="font-bold text-sm">Business Establishment</span><span class="text-xs opacity-70">Store, office, shop, or enterprise</span>
            </button>
            <button type="button" on:click={() => (householdType = 'boarding')} class="type-card {householdType === 'boarding' ? 'type-card-active' : ''}">
              <span class="font-bold text-sm">Boarding / Rental</span><span class="text-xs opacity-70">Rental room, apartment, or boarding house</span>
            </button>
          </div>
          {@render FieldError('householdType')}
          <label class="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 cursor-pointer {fieldInvalid('agreedToTerms') ? 'group-error' : ''}">
            <input type="checkbox" bind:checked={agreedToTerms} data-field="agreedToTerms" class="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700" />
            <span class="text-xs text-slate-600 leading-relaxed">I agree to voluntarily submit this information to the GeoProfile system of Barangay Pag-Asa for profiling, records, mapping, and verification.</span>
          </label>
          {@render FieldError('agreedToTerms')}
        </section>
      {:else if step === 2}
        <section class="panel">
          <div>
            <p class="eyebrow">Part 2</p>
            <h2 class="title">Profile Details</h2>
            <p class="sub">The fields below change based on the selected profile type.</p>
          </div>
          <div class="grid md:grid-cols-2 gap-3">
            <div class="field-block"><label class="label" for="houseNo">House No. / Unit / Block <span class="text-red-400">*</span></label><input id="houseNo" data-field="houseNo" class="input {fieldInvalid('houseNo') ? 'input-error' : ''}" bind:value={houseNo} />{@render FieldError('houseNo')}<p class="tip">Use the number or unit shown at the house, gate, or building.</p></div>
            <div class="field-block"><label class="label" for="street">Street <span class="text-red-400">*</span></label><select id="street" data-field="street" class="input {fieldInvalid('street') ? 'input-error' : ''}" bind:value={street}><option value="">Select street</option>{#each streets as item (item)}<option value={item}>{item}</option>{/each}</select>{@render FieldError('street')}<p class="tip">Choose the street where the household is located.</p></div>
            <div class="field-block md:col-span-2"><label class="label" for="landmark">Landmark <span class="text-slate-300 normal-case">(optional)</span></label><input id="landmark" data-field="landmark" class="input" bind:value={landmark} placeholder="e.g. near chapel, beside store, blue gate" /><p class="tip">Optional, but helpful if the house is hard to find or has no clear number.</p></div>
          </div>
          <div class="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
            <p class="text-[0.65rem] font-bold uppercase tracking-widest text-blue-400 mb-1">Address Preview</p>
            <p class="text-xs text-blue-700 font-semibold leading-relaxed">{fullAddress || 'Barangay Pag-Asa, Olongapo City, Zambales'}</p>
          </div>

          {#if householdType === 'residential'}
            <div class="grid md:grid-cols-2 gap-3">
              <div class="field-block"><label class="label" for="dwellingType">Dwelling Type <span class="text-red-400">*</span></label><select id="dwellingType" data-field="residential.dwellingType" class="input {fieldInvalid('residential.dwellingType') ? 'input-error' : ''}" bind:value={residentialInfo.dwellingType}><option value="">Select</option><option>Single house</option><option>Duplex</option><option>Informal dwelling</option><option>Other residential dwelling</option></select>{@render FieldError('residential.dwellingType')}<p class="tip">For apartment, room, or boarding house, go back and choose Boarding / Rental.</p></div>
              <div class="field-block"><label class="label" for="ownershipStatus">Ownership Status <span class="text-red-400">*</span></label><select id="ownershipStatus" data-field="residential.ownershipStatus" class="input {fieldInvalid('residential.ownershipStatus') ? 'input-error' : ''}" bind:value={residentialInfo.ownershipStatus}><option value="">Select</option><option>Owned</option><option>Rented</option><option>Living with relatives</option><option>Caretaker</option><option>Other</option></select>{@render FieldError('residential.ownershipStatus')}<p class="tip">Select the arrangement that best describes who uses the home.</p></div>
              <div class="field-block"><label class="label" for="yearsOfStay">Years of Stay <span class="text-slate-300 normal-case">(optional)</span></label><input id="yearsOfStay" data-field="residential.yearsOfStay" class="input {fieldInvalid('residential.yearsOfStay') ? 'input-error' : ''}" type="number" min="0" bind:value={residentialInfo.yearsOfStay} />{@render FieldError('residential.yearsOfStay')}<p class="tip">Approximate number is okay.</p></div>
              <div class="field-block"><label class="label" for="incomeRange">Monthly Income Range <span class="text-slate-300 normal-case">(optional)</span></label><select id="incomeRange" class="input" bind:value={residentialInfo.monthlyIncomeRange}><option value="">Select</option><option>Below 10,000</option><option>10,000 - 20,000</option><option>20,001 - 40,000</option><option>Above 40,000</option><option>Prefer not to say</option></select><p class="tip">This helps with barangay planning and assistance, but may be skipped.</p></div>
            </div>
            <div>
              <p class="label">Utilities Available</p>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                {#each ['Water', 'Electricity', 'Internet', 'Septic/Drainage'] as utility (utility)}
                  <button type="button" on:click={() => toggleUtility(utility)} class="choice {residentialInfo.utilities.includes(utility) ? 'choice-active' : ''}">{utility}</button>
                {/each}
              </div>
            </div>
          {:else if householdType === 'business'}
            <div class="grid md:grid-cols-2 gap-3">
              <div class="field-block"><label class="label">Business Name <span class="text-red-400">*</span></label><input data-field="business.businessName" class="input {fieldInvalid('business.businessName') ? 'input-error' : ''}" bind:value={businessInfo.businessName} />{@render FieldError('business.businessName')}<p class="tip">Use the store or establishment name.</p></div>
              <div class="field-block"><label class="label">Owner Name <span class="text-red-400">*</span></label><input data-field="business.ownerName" class="input {fieldInvalid('business.ownerName') ? 'input-error' : ''}" bind:value={businessInfo.ownerName} />{@render FieldError('business.ownerName')}<p class="tip">Name of owner or person in charge.</p></div>
              <div class="field-block"><label class="label">Business Type <span class="text-red-400">*</span></label><input data-field="business.businessType" class="input {fieldInvalid('business.businessType') ? 'input-error' : ''}" bind:value={businessInfo.businessType} placeholder="e.g. Sari-sari store, eatery" />{@render FieldError('business.businessType')}<p class="tip">Describe what kind of business operates here.</p></div>
              <div class="field-block"><label class="label">Permit Number <span class="text-slate-300 normal-case">(optional)</span></label><input class="input" bind:value={businessInfo.permitNo} /><p class="tip">Leave blank if not available.</p></div>
              <div class="field-block"><label class="label">Contact Number <span class="text-slate-300 normal-case">(optional)</span></label><input data-field="business.contactNo" class="input {fieldInvalid('business.contactNo') ? 'input-error' : ''}" inputmode="numeric" maxlength="11" bind:value={businessInfo.contactNo} placeholder="09XXXXXXXXX" />{@render FieldError('business.contactNo')}<p class="tip">If provided, enter exactly 11 digits.</p></div>
              <div class="field-block"><label class="label">No. of Employees <span class="text-slate-300 normal-case">(optional)</span></label><input data-field="business.employeesCount" class="input {fieldInvalid('business.employeesCount') ? 'input-error' : ''}" type="number" min="0" bind:value={businessInfo.employeesCount} />{@render FieldError('business.employeesCount')}</div>
              <div class="field-block"><label class="label">Years Operating <span class="text-slate-300 normal-case">(optional)</span></label><input data-field="business.operatingYears" class="input {fieldInvalid('business.operatingYears') ? 'input-error' : ''}" type="number" min="0" bind:value={businessInfo.operatingYears} />{@render FieldError('business.operatingYears')}</div>
            </div>
          {:else if householdType === 'boarding'}
            <div class="grid md:grid-cols-2 gap-3">
              <div class="field-block"><label class="label">Property Name <span class="text-red-400">*</span></label><input data-field="boarding.propertyName" class="input {fieldInvalid('boarding.propertyName') ? 'input-error' : ''}" bind:value={boardingInfo.propertyName} />{@render FieldError('boarding.propertyName')}<p class="tip">Apartment, room rental, or boarding house name.</p></div>
              <div class="field-block"><label class="label">Owner / Manager <span class="text-red-400">*</span></label><input data-field="boarding.ownerName" class="input {fieldInvalid('boarding.ownerName') ? 'input-error' : ''}" bind:value={boardingInfo.ownerName} />{@render FieldError('boarding.ownerName')}</div>
              <div class="field-block"><label class="label">Number of Rooms <span class="text-red-400">*</span></label><input data-field="boarding.roomsCount" class="input {fieldInvalid('boarding.roomsCount') ? 'input-error' : ''}" type="number" min="1" bind:value={boardingInfo.roomsCount} />{@render FieldError('boarding.roomsCount')}</div>
              <div class="field-block"><label class="label">Tenant Capacity <span class="text-slate-300 normal-case">(optional)</span></label><input data-field="boarding.tenantCapacity" class="input {fieldInvalid('boarding.tenantCapacity') ? 'input-error' : ''}" type="number" min="0" bind:value={boardingInfo.tenantCapacity} />{@render FieldError('boarding.tenantCapacity')}</div>
              <div class="field-block"><label class="label">Current Tenants <span class="text-slate-300 normal-case">(optional)</span></label><input data-field="boarding.currentTenants" class="input {fieldInvalid('boarding.currentTenants') ? 'input-error' : ''}" type="number" min="0" bind:value={boardingInfo.currentTenants} />{@render FieldError('boarding.currentTenants')}</div>
              <div class="field-block"><label class="label">Contact Number <span class="text-slate-300 normal-case">(optional)</span></label><input data-field="boarding.contactNo" class="input {fieldInvalid('boarding.contactNo') ? 'input-error' : ''}" inputmode="numeric" maxlength="11" bind:value={boardingInfo.contactNo} placeholder="09XXXXXXXXX" />{@render FieldError('boarding.contactNo')}<p class="tip">If provided, enter exactly 11 digits.</p></div>
              <div class="field-block"><label class="label">Years Operating <span class="text-slate-300 normal-case">(optional)</span></label><input data-field="boarding.operatingYears" class="input {fieldInvalid('boarding.operatingYears') ? 'input-error' : ''}" type="number" min="0" bind:value={boardingInfo.operatingYears} />{@render FieldError('boarding.operatingYears')}</div>
            </div>
          {/if}
        </section>
      {:else if step === 3}
        <section class="panel">
          <div><p class="eyebrow">Part 3</p><h2 class="title">Parents / Head of Family</h2><p class="sub">Parent, head, guardian, senior, PWD, and health details.</p></div>
          {#if householdType !== 'residential'}
            <div class="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">This profile type does not require parent/head details. Continue to the next part.</div>
          {:else}
            <div class="grid md:grid-cols-3 gap-3">
              <div class="field-block"><label class="label">Family Status <span class="text-red-400">*</span></label><select data-field="familySetup" class="input {fieldInvalid('familySetup') ? 'input-error' : ''}" bind:value={familySetup} on:change={syncFamilySetup}><option value="both">Both parents present</option><option value="mother_only">Mother only</option><option value="father_only">Father only</option><option value="guardian">Guardian only</option></select>{@render FieldError('familySetup')}<p class="tip">Choose who acts as the household head or guardian.</p></div>
              <div class="field-block"><label class="label">Father Status <span class="text-red-400">*</span></label><select class="input" bind:value={fatherStatus}><option value="present">Present</option><option value="deceased">Deceased</option><option value="absent">Absent</option></select></div>
              <div class="field-block"><label class="label">Mother Status <span class="text-red-400">*</span></label><select class="input" bind:value={motherStatus}><option value="present">Present</option><option value="deceased">Deceased</option><option value="absent">Absent</option></select></div>
            </div>

            {#if fatherStatus === 'present'}
              {@render PersonFields('Father / Male Head', father, false, 'father')}
            {/if}
            {#if motherStatus === 'present'}
              {@render PersonFields('Mother / Female Head', mother, false, 'mother')}
            {/if}

            {#if isSingleParentHousehold}
              <div class="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-3">
                <p class="text-sm font-bold text-violet-700">Single parent / guardian detected</p>
                <p class="text-xs text-violet-600">Upload solo parent ID, death certificate, barangay certification, or supporting document.</p>
                {#if singleParentProofPreview}<img src={singleParentProofPreview} alt="Single parent proof" class="w-full h-36 object-cover rounded-xl border-2 border-emerald-300" />{:else}<label class="upload {fieldInvalid('singleParentProof') ? 'upload-error' : ''}" data-field="singleParentProof" tabindex="-1">Upload Single Parent Proof<input type="file" accept="image/*" on:change={handleSingleParentProofChange} class="hidden" /></label>{@render FieldError('singleParentProof')}{/if}
              </div>
            {/if}
          {/if}
        </section>
      {:else if step === 4}
        <section class="panel">
          <div>
            <p class="eyebrow">Part 4</p>
            <h2 class="title">{householdType === 'boarding' ? 'Tenants / Boarders' : 'Family Members'}</h2>
            <p class="sub">{householdType === 'boarding' ? 'Add the people currently living in the rental, apartment, or boarding house.' : 'Type a count and fields will be added automatically.'}</p>
          </div>
          {#if householdType === 'business'}
            <div class="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">For business establishments, resident details are only needed if someone lives at this address. Use Residential or Boarding/Rental when profiling people who live here.</div>
          {:else}
            <div class="field-block"><label class="label">{householdType === 'boarding' ? 'Number of Tenants / Boarders' : 'Number of Family Members'} <span class="text-slate-300 normal-case">(optional)</span></label><input class="input" type="number" min="0" max="20" bind:value={memberCount} on:change={setMemberCount} /><p class="tip">Enter 0 if there are no additional people to list.</p></div>
            {#if members.length === 0}<div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">{householdType === 'boarding' ? 'No tenants or boarders added yet.' : 'No additional family members added.'}</div>{/if}
            {#each members as member, index (member.id)}
              {@render PersonFields(householdType === 'boarding' ? `Tenant / Boarder ${index + 1}` : `Family Member ${index + 1}`, member, true, `member-${index}`)}
            {/each}
          {/if}
        </section>
      {:else if step === 5}
        <section class="panel">
          <div><p class="eyebrow">Part 5</p><h2 class="title">House / Establishment Photo</h2><p class="sub">Capture a clear front photo for verification and mapping.</p></div>
          {#if housePhotoPreview}
            <div class="relative rounded-xl overflow-hidden border-2 border-emerald-300">
              <img src={housePhotoPreview} alt="House or establishment" class="w-full h-64 object-cover" />
              <button type="button" aria-label="Remove photo" on:click={() => { housePhoto = null; housePhotoPreview = ''; }} class="absolute top-2 right-2 rounded-full bg-red-500 text-white w-8 h-8 font-bold">x</button>
            </div>
          {:else}
            <label data-field="housePhoto" tabindex="-1" class="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all {fieldInvalid('housePhoto') ? 'upload-error' : 'bg-slate-50 border-slate-300'}">
              <div class="w-14 h-14 rounded-2xl bg-slate-200 flex items-center justify-center text-slate-500 font-bold">CAM</div>
              <div class="text-center"><p class="text-sm font-bold text-slate-700">Take Photo or Upload</p><p class="text-xs text-slate-400 mt-0.5">Front view, max 15MB</p></div>
              <input type="file" accept="image/*" capture="environment" on:change={handlePhotoChange} class="hidden" />
            </label>
            {@render FieldError('housePhoto')}
          {/if}
        </section>
      {:else if step === 6}
        <section class="panel">
          <div><p class="eyebrow">Part 6</p><h2 class="title">Review Before Submitting</h2><p class="sub">Use the section controls to review every part of the form.</p></div>

          <div class="review-tabs">
            {#each reviewLabels as label, index (label)}
              <button type="button" on:click={() => (reviewPage = index)} class="review-tab {reviewPage === index ? 'review-tab-active' : ''}">
                {index + 1}. {label}
              </button>
            {/each}
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-4">
            <div class="flex items-center justify-between gap-3 mb-4">
              <button type="button" on:click={prevReviewPage} disabled={reviewPage === 0} class="review-nav" aria-label="Previous review section">Back</button>
              <p class="text-sm font-extrabold text-slate-700">{reviewLabels[reviewPage]}</p>
              <button type="button" on:click={nextReviewPage} disabled={reviewPage === reviewLabels.length - 1} class="review-nav" aria-label="Next review section">Next</button>
            </div>

            {#if reviewPage === 0}
              <div class="review-grid">
                {@render ReviewItem('Profile Type', householdType || '-')}
                {@render ReviewItem('Terms Accepted', agreedToTerms ? 'Yes' : 'No')}
                {@render ReviewItem('QR ID', qrId ?? '-')}
                {@render ReviewItem('Status', 'Pending review')}
              </div>
            {:else if reviewPage === 1}
              <div class="review-grid">
                {@render ReviewItem('House / Unit', houseNo || '-')}
                {@render ReviewItem('Street', street || '-')}
                {@render ReviewItem('Landmark', landmark || '-')}
                {@render ReviewItem('Full Address', fullAddress || '-')}
                {@render ReviewItem('GPS', gpsLat && gpsLng ? `${gpsLat.toFixed(6)}, ${gpsLng.toFixed(6)} (+/-${gpsAccuracy ?? 'N/A'}m)` : 'Waiting for GPS')}
              </div>
            {:else if reviewPage === 2}
              <div class="review-grid">
                {#if householdType === 'residential'}
                  {@render ReviewItem('Dwelling Type', residentialInfo.dwellingType || '-')}
                  {@render ReviewItem('Ownership Status', residentialInfo.ownershipStatus || '-')}
                  {@render ReviewItem('Years of Stay', residentialInfo.yearsOfStay || '-')}
                  {@render ReviewItem('Income Range', residentialInfo.monthlyIncomeRange || '-')}
                  {@render ReviewItem('Utilities', residentialInfo.utilities.join(', ') || '-')}
                {:else if householdType === 'business'}
                  {@render ReviewItem('Business Name', businessInfo.businessName || '-')}
                  {@render ReviewItem('Owner', businessInfo.ownerName || '-')}
                  {@render ReviewItem('Business Type', businessInfo.businessType || '-')}
                  {@render ReviewItem('Permit Number', businessInfo.permitNo || '-')}
                  {@render ReviewItem('Contact Number', businessInfo.contactNo || '-')}
                  {@render ReviewItem('Employees', businessInfo.employeesCount || '-')}
                  {@render ReviewItem('Years Operating', businessInfo.operatingYears || '-')}
                {:else}
                  {@render ReviewItem('Property Name', boardingInfo.propertyName || '-')}
                  {@render ReviewItem('Owner / Manager', boardingInfo.ownerName || '-')}
                  {@render ReviewItem('Rooms', boardingInfo.roomsCount || '-')}
                  {@render ReviewItem('Tenant Capacity', boardingInfo.tenantCapacity || '-')}
                  {@render ReviewItem('Current Tenants', boardingInfo.currentTenants || '-')}
                  {@render ReviewItem('Contact Number', boardingInfo.contactNo || '-')}
                  {@render ReviewItem('Years Operating', boardingInfo.operatingYears || '-')}
                {/if}
              </div>
            {:else if reviewPage === 3}
              {#if householdType !== 'residential'}
                <p class="text-sm text-slate-500">No parent or household-head details required for this profile type.</p>
              {:else}
                <div class="space-y-3">
                  {@render ReviewItem('Family Setup', familySetup.replaceAll('_', ' '))}
                  {@render ReviewItem('Father Status', fatherStatus)}
                  {@render ReviewItem('Mother Status', motherStatus)}
                  {#if fatherStatus === 'present'}{@render PersonReview('Father / Male Head', father)}{/if}
                  {#if motherStatus === 'present'}{@render PersonReview('Mother / Female Head', mother)}{/if}
                  {@render ReviewItem('Single Parent / Guardian', isSingleParentHousehold ? 'Yes, proof uploaded' : 'No')}
                </div>
              {/if}
            {:else if reviewPage === 4}
              {#if householdType === 'business'}
                <p class="text-sm text-slate-500">No resident/member records were required for this business-only profile.</p>
              {:else if members.length === 0}
                <p class="text-sm text-slate-500">{householdType === 'boarding' ? 'No tenants or boarders were added.' : 'No additional family members were added.'}</p>
              {:else}
                <div class="space-y-3">
                  {#each members as member, index (member.id)}
                    {@render PersonReview(`${householdType === 'boarding' ? 'Tenant / Boarder' : 'Family Member'} ${index + 1} - ${member.relationship || 'Relationship not set'}`, member)}
                  {/each}
                </div>
              {/if}
            {:else}
              <div class="space-y-3">
                {@render ReviewItem('Photo Captured', housePhotoPreview ? 'Yes' : 'No')}
                {#if housePhotoPreview}<img src={housePhotoPreview} alt="Preview" class="w-full h-48 object-cover rounded-xl border border-slate-200" />{/if}
              </div>
            {/if}
          </div>
        </section>
      {/if}

      <div class="flex gap-3 pb-8">
        {#if step > 1}<button type="button" on:click={prevStep} disabled={loading} class="flex-1 py-3.5 rounded-2xl text-sm font-bold text-slate-600 bg-white border-2 border-slate-200">Back</button>{/if}
        {#if step < TOTAL_STEPS}
          <button type="button" on:click={nextStep} disabled={loading || !canRegister || (step === 1 && !DEMO_BYPASS && gpsLat === null)} class="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white shadow-lg disabled:opacity-50" style="background:#0f2060;">Next</button>
        {:else}
          <button type="button" on:click={handleSubmit} disabled={loading || !canRegister} class="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white shadow-lg disabled:opacity-60" style="background:#059669;">{loading ? 'Submitting...' : 'Submit Profile'}</button>
        {/if}
      </div>
    </div>
  {/if}
</div>

{#snippet FieldError(field: string)}
  {#if fieldError(field)}
    <p class="field-error">{fieldError(field)}</p>
  {/if}
{/snippet}

{#snippet PersonFields(title: string, person: PersonProfile | FamilyMember, showRelationship = false, fieldPrefix = title)}
  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
    <h3 class="font-nunito font-extrabold text-slate-700">{title}</h3>
    <div class="grid md:grid-cols-2 gap-3">
      {#if showRelationship}<div class="field-block"><label class="label">Relationship / Room <span class="text-red-400">*</span></label><input data-field="{fieldPrefix}.relationship" class="input {fieldInvalid(`${fieldPrefix}.relationship`) ? 'input-error' : ''}" bind:value={(person as FamilyMember).relationship} on:input={(event) => validatePersonField(person, fieldPrefix, 'relationship', false, event.currentTarget.value)} on:blur={(event) => validatePersonField(person, fieldPrefix, 'relationship', true, event.currentTarget.value)} />{@render FieldError(`${fieldPrefix}.relationship`)}<p class="tip">{title.includes('Tenant') ? 'Use room number or tenant relationship to the owner.' : 'Example: son, daughter, sibling, grandparent.'}</p></div>{/if}
      <div class="field-block"><label class="label">Full Name <span class="text-red-400">*</span></label><input data-field="{fieldPrefix}.fullName" class="input {fieldInvalid(`${fieldPrefix}.fullName`) ? 'input-error' : ''}" bind:value={person.fullName} on:input={(event) => validatePersonField(person, fieldPrefix, 'fullName', false, event.currentTarget.value)} on:blur={(event) => validatePersonField(person, fieldPrefix, 'fullName', true, event.currentTarget.value)} />{@render FieldError(`${fieldPrefix}.fullName`)}<p class="tip">Letters only. Enter complete name as used in IDs or barangay records.</p></div>
      <div class="field-block"><label class="label">Birthdate <span class="text-red-400">*</span></label><input data-field="{fieldPrefix}.birthdate" class="input {fieldInvalid(`${fieldPrefix}.birthdate`) ? 'input-error' : ''}" type="date" max={todayDate} bind:value={person.birthdate} on:change={(event) => validatePersonField(person, fieldPrefix, 'birthdate', true, event.currentTarget.value)} />{@render FieldError(`${fieldPrefix}.birthdate`)}<p class="tip">Future dates are disabled. Used to compute age and senior citizen status.</p></div>
      <div class="field-block"><label class="label">Place of Birth <span class="text-red-400">*</span></label><input data-field="{fieldPrefix}.placeOfBirth" class="input {fieldInvalid(`${fieldPrefix}.placeOfBirth`) ? 'input-error' : ''}" bind:value={person.placeOfBirth} on:input={(event) => validatePersonField(person, fieldPrefix, 'placeOfBirth', false, event.currentTarget.value)} on:blur={(event) => validatePersonField(person, fieldPrefix, 'placeOfBirth', true, event.currentTarget.value)} placeholder="City / Municipality / Province" />{@render FieldError(`${fieldPrefix}.placeOfBirth`)}<p class="tip">Required by the RBI individual record.</p></div>
      <div class="field-block"><label class="label">Sex <span class="text-red-400">*</span></label><select data-field="{fieldPrefix}.sex" class="input {fieldInvalid(`${fieldPrefix}.sex`) ? 'input-error' : ''}" bind:value={person.sex} on:change={(event) => validatePersonField(person, fieldPrefix, 'sex', true, event.currentTarget.value)}><option value="">Select</option><option>Male</option><option>Female</option></select>{@render FieldError(`${fieldPrefix}.sex`)}</div>
      <div class="field-block"><label class="label">Civil Status <span class="text-slate-300 normal-case">(optional)</span></label><select class="input" bind:value={person.civilStatus}><option value="">Select</option><option>Single</option><option>Married</option><option>Widowed</option><option>Separated</option><option>Annulled</option></select></div>
      <div class="field-block"><label class="label">Citizenship <span class="text-red-400">*</span></label><input data-field="{fieldPrefix}.citizenship" class="input {fieldInvalid(`${fieldPrefix}.citizenship`) ? 'input-error' : ''}" bind:value={person.citizenship} on:input={(event) => validatePersonField(person, fieldPrefix, 'citizenship', false, event.currentTarget.value)} on:blur={(event) => validatePersonField(person, fieldPrefix, 'citizenship', true, event.currentTarget.value)} placeholder="e.g. Filipino" />{@render FieldError(`${fieldPrefix}.citizenship`)}<p class="tip">Required by the RBI individual record.</p></div>
      <div class="field-block"><label class="label">Occupation <span class="text-red-400">*</span></label><input data-field="{fieldPrefix}.occupation" class="input {fieldInvalid(`${fieldPrefix}.occupation`) ? 'input-error' : ''}" bind:value={person.occupation} on:input={(event) => validatePersonField(person, fieldPrefix, 'occupation', false, event.currentTarget.value)} on:blur={(event) => validatePersonField(person, fieldPrefix, 'occupation', true, event.currentTarget.value)} placeholder="e.g. Teacher, Vendor, N/A" />{@render FieldError(`${fieldPrefix}.occupation`)}<p class="tip">Required. If no occupation, enter N/A.</p></div>
      <div class="field-block"><label class="label">Contact No. <span class="text-slate-300 normal-case">(optional)</span></label><input data-field="{fieldPrefix}.contactNo" class="input {fieldInvalid(`${fieldPrefix}.contactNo`) ? 'input-error' : ''}" inputmode="numeric" maxlength="11" bind:value={person.contactNo} placeholder="09XXXXXXXXX" on:input={(event) => validatePersonField(person, fieldPrefix, 'contactNo', false, event.currentTarget.value)} />{@render FieldError(`${fieldPrefix}.contactNo`)}<p class="tip">Optional. If provided, enter exactly 11 digits.</p></div>
      <div class="field-block"><label class="label">Email <span class="text-slate-300 normal-case">(optional)</span></label><input data-field="{fieldPrefix}.email" class="input {fieldInvalid(`${fieldPrefix}.email`) ? 'input-error' : ''}" type="email" bind:value={person.email} placeholder="name@gmail.com" on:input={(event) => validatePersonField(person, fieldPrefix, 'email', false, event.currentTarget.value)} />{@render FieldError(`${fieldPrefix}.email`)}<p class="tip">Optional. Gmail address only.</p></div>
      <div class="field-block"><label class="label">Vaccination Status <span class="text-slate-300 normal-case">(optional)</span></label><select class="input" bind:value={person.vaccinationStatus}><option value="">Select</option><option>Fully vaccinated</option><option>Partially vaccinated</option><option>Unvaccinated</option><option>Unknown</option></select><p class="tip">Optional health information for barangay planning.</p></div>
      <div class="field-block"><label class="label">Blood Type <span class="text-slate-300 normal-case">(optional)</span></label><select class="input" bind:value={person.bloodType}><option value="">Select</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option><option>O+</option><option>O-</option><option>Unknown</option></select></div>
      <div class="field-block md:col-span-2"><label class="label">Medical Notes <span class="text-slate-300 normal-case">(optional)</span></label><input class="input" bind:value={person.medicalNotes} placeholder="e.g. allergies, maintenance medicine, leave blank if none" /><p class="tip">Optional. Add only details you want barangay staff to know for assistance.</p></div>
    </div>
    <div class="grid md:grid-cols-2 gap-3">
      <label class="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 cursor-pointer"><input type="checkbox" checked={person.isPWD} on:change={(event) => handlePwdToggle(event, person)} class="mt-1" /><span><span class="block text-sm font-bold text-slate-700">PWD</span><span class="block text-xs text-slate-400">Requires sector/type and proof.</span></span></label>
      <div class="rounded-xl border p-3 {isSenior(person) ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-100 opacity-70'}">
        <p class="text-sm font-bold {isSenior(person) ? 'text-emerald-700' : 'text-slate-500'}">Senior Citizen</p>
        <p class="text-xs {isSenior(person) ? 'text-emerald-600' : 'text-slate-400'}">{seniorStatusText(person)}</p>
      </div>
    </div>
    {#if person.isPWD}
      <div class="space-y-3">
        <div><label class="label">PWD Sector / Type <span class="text-red-400">*</span></label><select data-field="{fieldPrefix}.pwdType" class="input {fieldInvalid(`${fieldPrefix}.pwdType`) ? 'input-error' : ''}" bind:value={person.pwdType} on:change={(event) => { refreshPerson(person); validatePersonField(person, fieldPrefix, 'pwdType', true, event.currentTarget.value); }}><option value="">Select sector</option><option>Physical Disability</option><option>Visual Impairment</option><option>Hearing Impairment</option><option>Intellectual Disability</option><option>Psychosocial Disability</option><option>Learning Disability</option><option>Speech and Language Impairment</option><option>Multiple Disability</option></select>{@render FieldError(`${fieldPrefix}.pwdType`)}</div>
        {#if person.pwdProofPreview}<img src={person.pwdProofPreview} alt="PWD proof" class="w-full h-36 object-cover rounded-xl border-2 border-emerald-300" />{:else}<label class="upload {fieldInvalid(`${fieldPrefix}.pwdProof`) ? 'upload-error' : ''}" data-field="{fieldPrefix}.pwdProof" tabindex="-1">{pwdProofLabel(person)}<input type="file" accept="image/*" on:change={(event) => handlePersonProofChange(event, person, 'pwd')} class="hidden" /></label>{@render FieldError(`${fieldPrefix}.pwdProof`)}{/if}
      </div>
    {/if}
    {#if isSenior(person)}
      {#if person.seniorProofPreview}<img src={person.seniorProofPreview} alt="Senior proof" class="w-full h-36 object-cover rounded-xl border-2 border-emerald-300" />{:else}<label class="upload {fieldInvalid(`${fieldPrefix}.seniorProof`) ? 'upload-error' : ''}" data-field="{fieldPrefix}.seniorProof" tabindex="-1">Upload Senior Citizen Proof<input type="file" accept="image/*" on:change={(event) => handlePersonProofChange(event, person, 'senior')} class="hidden" /></label>{@render FieldError(`${fieldPrefix}.seniorProof`)}{/if}
    {/if}
  </div>
{/snippet}

{#snippet ReviewItem(label: string, value: string)}
  <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">{label}</p>
    <p class="text-sm font-semibold text-slate-700 mt-1 capitalize">{value}</p>
  </div>
{/snippet}

{#snippet PersonReview(title: string, person: PersonProfile | FamilyMember)}
  <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
    <p class="text-sm font-extrabold text-slate-700">{title}</p>
    <div class="review-grid">
      {@render ReviewItem('Full Name', person.fullName || '-')}
      {#if 'relationship' in person}
        {@render ReviewItem('Relationship', person.relationship || '-')}
      {/if}
      {@render ReviewItem('Birthdate / Age', person.birthdate ? `${person.birthdate} / ${calculateAge(person.birthdate) ?? '-'} yrs` : '-')}
      {@render ReviewItem('Place of Birth', person.placeOfBirth || '-')}
      {@render ReviewItem('Sex', person.sex || '-')}
      {@render ReviewItem('Civil Status', person.civilStatus || '-')}
      {@render ReviewItem('Citizenship', person.citizenship || '-')}
      {@render ReviewItem('Occupation', person.occupation || '-')}
      {@render ReviewItem('Contact No.', person.contactNo || '-')}
      {@render ReviewItem('Email', person.email || '-')}
      {@render ReviewItem('PWD', person.isPWD ? `${person.pwdType || 'Selected'} with proof` : 'No')}
      {@render ReviewItem('Senior Citizen', isSenior(person) ? 'Yes, proof uploaded' : 'No')}
      {@render ReviewItem('Vaccination Status', person.vaccinationStatus || '-')}
      {@render ReviewItem('Blood Type', person.bloodType || '-')}
      {@render ReviewItem('Medical Notes', person.medicalNotes || '-')}
    </div>
  </div>
{/snippet}

<style>
  .panel { background:white; border:1px solid #e2e8f0; border-radius:1rem; box-shadow:0 1px 2px rgba(15,23,42,.05); padding:1.25rem; display:flex; flex-direction:column; gap:1rem; }
  .eyebrow { font-size:.65rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:#2563eb; }
  .title { font-family:Nunito,sans-serif; font-weight:900; color:#334155; font-size:1.15rem; }
  .sub { color:#64748b; font-size:.8rem; margin-top:.125rem; }
  .label { display:block; font-size:.65rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; margin-bottom:.375rem; }
  .input { width:100%; border:2px solid #e2e8f0; background:#f8fafc; border-radius:.75rem; padding:.7rem .8rem; color:#334155; font-size:.875rem; outline:none; }
  .input:focus { border-color:#2563eb; background:white; box-shadow:0 0 0 4px #dbeafe; }
  .input-error { border-color:#ef4444; background:#fff1f2; color:#991b1b; }
  .input-error:focus { border-color:#dc2626; box-shadow:0 0 0 4px #fee2e2; background:white; }
  .field-block { min-width:0; }
  .tip { color:#94a3b8; font-size:.68rem; line-height:1.35; margin-top:.35rem; }
  .field-error { color:#dc2626; font-size:.72rem; font-weight:800; line-height:1.35; margin-top:.35rem; }
  [data-field]:focus { outline:2px solid #2563eb; outline-offset:3px; }
  .group-error { border-color:#ef4444 !important; background:#fff1f2 !important; }
  .type-card { display:flex; flex-direction:column; gap:.3rem; text-align:left; border:2px solid #e2e8f0; background:#f8fafc; border-radius:.9rem; padding:1rem; color:#475569; }
  .type-card-active { border-color:#2563eb; background:#eff6ff; color:#1d4ed8; }
  .choice { border:1px solid #e2e8f0; background:white; color:#64748b; border-radius:999px; padding:.55rem .75rem; font-size:.75rem; font-weight:700; }
  .choice-active { border-color:#059669; background:#d1fae5; color:#047857; }
  .upload { display:flex; align-items:center; justify-content:center; min-height:5rem; border:2px dashed #cbd5e1; border-radius:.75rem; background:white; color:#475569; font-size:.8rem; font-weight:800; cursor:pointer; }
  .upload-error { border-color:#ef4444; background:#fff1f2; color:#991b1b; }
  .review-tabs { display:flex; gap:.5rem; overflow-x:auto; padding-bottom:.25rem; }
  .review-tab { flex:0 0 auto; border:1px solid #e2e8f0; background:#f8fafc; color:#64748b; border-radius:999px; padding:.5rem .75rem; font-size:.72rem; font-weight:800; }
  .review-tab-active { border-color:#2563eb; background:#dbeafe; color:#1d4ed8; }
  .review-nav { border:1px solid #e2e8f0; background:#f8fafc; color:#475569; border-radius:.7rem; padding:.5rem .75rem; font-size:.75rem; font-weight:800; }
  .review-nav:disabled { opacity:.4; cursor:not-allowed; }
  .review-grid { display:grid; grid-template-columns:repeat(1,minmax(0,1fr)); gap:.75rem; }
  @media (max-width:520px) {
    .panel { padding:1rem; border-radius:.9rem; gap:.9rem; }
    .title { font-size:1.05rem; }
    .input { font-size:1rem; padding:.72rem .8rem; }
    .tip { font-size:.7rem; }
    .type-card { padding:.9rem; }
    .choice { border-radius:.75rem; }
  }
  @media (min-width:768px) { .review-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
