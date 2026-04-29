<!-- Public QR household profiling form -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { isInsidePagAsa } from '$lib/pagasaBoundary.js';

  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const DEMO_BYPASS = urlParams.get('demo') === 'true';
  const TOTAL_STEPS = 6;

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
    sex: string;
    civilStatus: string;
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

  let householdType: HouseholdType | '' = '';
  let agreedToTerms = false;

  let houseNo = '';
  let street = '';
  let zone = '';
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

  $: fullAddress = [houseNo.trim(), street, zone ? `Zone ${zone}` : '', 'Barangay Pag-Asa', 'Olongapo City', 'Zambales'].filter(Boolean).join(', ');
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
      sex: '',
      civilStatus: '',
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

  function personIsValid(person: PersonProfile, label: string) {
    if (!person.fullName.trim()) return `${label}: full name is required.`;
    if (!person.birthdate) return `${label}: birthdate is required.`;
    if (!person.sex) return `${label}: sex is required.`;
    if (person.isPWD && !person.pwdType) return `${label}: PWD type is required.`;
    if (person.isPWD && !person.pwdProof) return `${label}: PWD proof is required.`;
    if (isSenior(person) && !person.seniorProof) return `${label}: senior proof is required.`;
    return '';
  }

  function validateStep() {
    if (step === 1) {
      if (!DEMO_BYPASS && gpsStatus === 'outside') return 'You must be inside Barangay Pag-Asa to register.';
      if (gpsLat === null || gpsLng === null) return 'Please wait for GPS to lock your location.';
      if (!householdType) return 'Please choose a household/profile type.';
      if (!agreedToTerms) return 'Please agree to submit your information to the system.';
    }

    if (step === 2) {
      if (!houseNo.trim()) return 'House No. / Unit is required.';
      if (!street) return 'Street is required.';
      if (householdType === 'residential' && (!residentialInfo.dwellingType || !residentialInfo.ownershipStatus)) return 'Dwelling type and ownership status are required.';
      if (householdType === 'business' && (!businessInfo.businessName.trim() || !businessInfo.ownerName.trim() || !businessInfo.businessType.trim())) return 'Business name, owner, and type are required.';
      if (householdType === 'boarding' && (!boardingInfo.propertyName.trim() || !boardingInfo.ownerName.trim() || !boardingInfo.roomsCount)) return 'Property name, owner, and room count are required.';
    }

    if (step === 3 && householdType === 'residential') {
      if (fatherStatus === 'present') {
        const fatherError = personIsValid(father, 'Father/head');
        if (fatherError) return fatherError;
      }
      if (motherStatus === 'present') {
        const motherError = personIsValid(mother, 'Mother/head');
        if (motherError) return motherError;
      }
      if (fatherStatus !== 'present' && motherStatus !== 'present') return 'At least one parent, head, or guardian must be present.';
      if (isSingleParentHousehold && !singleParentProof) return 'Solo parent/guardian proof is required.';
    }

    if (step === 4 && (householdType === 'residential' || householdType === 'boarding')) {
      for (let i = 0; i < members.length; i++) {
        const personLabel = householdType === 'boarding' ? `Tenant/boarder ${i + 1}` : `Family member ${i + 1}`;
        const memberError = personIsValid(members[i], personLabel);
        if (memberError) return memberError;
        if (!members[i].relationship.trim()) return `${personLabel}: relationship/room is required.`;
      }
    }

    if (step === 5 && !housePhoto) return 'House or establishment photo is required.';
    return '';
  }

  function nextStep() {
    errorMsg = validateStep();
    if (errorMsg) return;
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
      sex: person.sex,
      civilStatus: person.civilStatus,
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
    for (let checkStep = 1; checkStep <= 5; checkStep++) {
      step = checkStep;
      errorMsg = validateStep();
      if (errorMsg) return;
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

      await addDoc(collection(db, 'residents'), {
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
        zone: zone.trim(),
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
        age: calculateAge(primary.birthdate) ?? 0,
        sex: primary.sex,
        civilStatus: primary.civilStatus,
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
        {gpsStatus === 'granted' || DEMO_BYPASS ? 'GPS locked' : gpsStatus === 'outside' ? 'Outside area' : gpsStatus === 'optimizing' ? 'Optimizing GPS' : 'Getting GPS'}
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
  {:else if !DEMO_BYPASS && gpsStatus === 'outside'}
    <div class="p-6 flex flex-col items-center text-center mt-8">
      <div class="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-5 text-red-500 font-black">GPS</div>
      <h2 class="font-nunito font-extrabold text-slate-800 text-2xl mb-2">Outside Pag-Asa</h2>
      <p class="text-slate-500 text-sm leading-relaxed max-w-xs mb-6">You must be physically inside Barangay Pag-Asa to submit this profiling form.</p>
      <button type="button" on:click={retryGPS} class="w-full max-w-xs py-3.5 rounded-2xl text-sm font-bold text-white shadow-lg" style="background:#0f2060;">Retry GPS</button>
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

      <div class="rounded-2xl border px-4 py-3 {gpsStatus === 'granted' || DEMO_BYPASS ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}">
        <p class="text-xs font-bold {gpsStatus === 'granted' || DEMO_BYPASS ? 'text-green-700' : 'text-blue-700'}">{gpsMessage}</p>
        <p class="text-xs mt-1 {gpsStatus === 'granted' || DEMO_BYPASS ? 'text-green-600' : 'text-blue-600'}">Geo-tagging starts automatically when the QR form opens.</p>
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
          <div class="grid md:grid-cols-3 gap-3">
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
          <label class="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 cursor-pointer">
            <input type="checkbox" bind:checked={agreedToTerms} class="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700" />
            <span class="text-xs text-slate-600 leading-relaxed">I agree to voluntarily submit this information to the GeoProfile system of Barangay Pag-Asa for profiling, records, mapping, and verification.</span>
          </label>
        </section>
      {:else if step === 2}
        <section class="panel">
          <div>
            <p class="eyebrow">Part 2</p>
            <h2 class="title">Profile Details</h2>
            <p class="sub">The fields below change based on the selected profile type.</p>
          </div>
          <div class="grid md:grid-cols-2 gap-3">
            <div><label class="label">House No. / Unit / Block <span class="text-red-400">*</span></label><input class="input" bind:value={houseNo} /></div>
            <div><label class="label">Street <span class="text-red-400">*</span></label><select class="input" bind:value={street}><option value="">Select street</option>{#each streets as item (item)}<option value={item}>{item}</option>{/each}</select></div>
            <div><label class="label">Zone</label><input class="input" bind:value={zone} /></div>
            <div><label class="label">Landmark</label><input class="input" bind:value={landmark} /></div>
          </div>
          <div class="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
            <p class="text-[0.65rem] font-bold uppercase tracking-widest text-blue-400 mb-1">Address Preview</p>
            <p class="text-xs text-blue-700 font-semibold leading-relaxed">{fullAddress || 'Barangay Pag-Asa, Olongapo City, Zambales'}</p>
          </div>

          {#if householdType === 'residential'}
            <div class="grid md:grid-cols-2 gap-3">
              <div><label class="label">Dwelling Type <span class="text-red-400">*</span></label><select class="input" bind:value={residentialInfo.dwellingType}><option value="">Select</option><option>Single house</option><option>Duplex</option><option>Apartment</option><option>Room</option><option>Informal dwelling</option></select></div>
              <div><label class="label">Ownership Status <span class="text-red-400">*</span></label><select class="input" bind:value={residentialInfo.ownershipStatus}><option value="">Select</option><option>Owned</option><option>Rented</option><option>Living with relatives</option><option>Caretaker</option><option>Other</option></select></div>
              <div><label class="label">Years of Stay</label><input class="input" type="number" bind:value={residentialInfo.yearsOfStay} /></div>
              <div><label class="label">Monthly Income Range</label><select class="input" bind:value={residentialInfo.monthlyIncomeRange}><option value="">Select</option><option>Below 10,000</option><option>10,000 - 20,000</option><option>20,001 - 40,000</option><option>Above 40,000</option><option>Prefer not to say</option></select></div>
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
              <div><label class="label">Business Name <span class="text-red-400">*</span></label><input class="input" bind:value={businessInfo.businessName} /></div>
              <div><label class="label">Owner Name <span class="text-red-400">*</span></label><input class="input" bind:value={businessInfo.ownerName} /></div>
              <div><label class="label">Business Type <span class="text-red-400">*</span></label><input class="input" bind:value={businessInfo.businessType} placeholder="e.g. Sari-sari store, eatery" /></div>
              <div><label class="label">Permit Number</label><input class="input" bind:value={businessInfo.permitNo} /></div>
              <div><label class="label">Contact Number</label><input class="input" bind:value={businessInfo.contactNo} /></div>
              <div><label class="label">No. of Employees</label><input class="input" type="number" bind:value={businessInfo.employeesCount} /></div>
              <div><label class="label">Years Operating</label><input class="input" type="number" bind:value={businessInfo.operatingYears} /></div>
            </div>
          {:else if householdType === 'boarding'}
            <div class="grid md:grid-cols-2 gap-3">
              <div><label class="label">Property Name <span class="text-red-400">*</span></label><input class="input" bind:value={boardingInfo.propertyName} /></div>
              <div><label class="label">Owner / Manager <span class="text-red-400">*</span></label><input class="input" bind:value={boardingInfo.ownerName} /></div>
              <div><label class="label">Number of Rooms <span class="text-red-400">*</span></label><input class="input" type="number" bind:value={boardingInfo.roomsCount} /></div>
              <div><label class="label">Tenant Capacity</label><input class="input" type="number" bind:value={boardingInfo.tenantCapacity} /></div>
              <div><label class="label">Current Tenants</label><input class="input" type="number" bind:value={boardingInfo.currentTenants} /></div>
              <div><label class="label">Contact Number</label><input class="input" bind:value={boardingInfo.contactNo} /></div>
              <div><label class="label">Years Operating</label><input class="input" type="number" bind:value={boardingInfo.operatingYears} /></div>
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
              <div><label class="label">Family Status <span class="text-red-400">*</span></label><select class="input" bind:value={familySetup} on:change={syncFamilySetup}><option value="both">Both parents present</option><option value="mother_only">Mother only</option><option value="father_only">Father only</option><option value="guardian">Guardian only</option></select></div>
              <div><label class="label">Father Status <span class="text-red-400">*</span></label><select class="input" bind:value={fatherStatus}><option value="present">Present</option><option value="deceased">Deceased</option><option value="absent">Absent</option></select></div>
              <div><label class="label">Mother Status <span class="text-red-400">*</span></label><select class="input" bind:value={motherStatus}><option value="present">Present</option><option value="deceased">Deceased</option><option value="absent">Absent</option></select></div>
            </div>

            {#if fatherStatus === 'present'}
              {@render PersonFields('Father / Male Head', father)}
            {/if}
            {#if motherStatus === 'present'}
              {@render PersonFields('Mother / Female Head', mother)}
            {/if}

            {#if isSingleParentHousehold}
              <div class="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-3">
                <p class="text-sm font-bold text-violet-700">Single parent / guardian detected</p>
                <p class="text-xs text-violet-600">Upload solo parent ID, death certificate, barangay certification, or supporting document.</p>
                {#if singleParentProofPreview}<img src={singleParentProofPreview} alt="Single parent proof" class="w-full h-36 object-cover rounded-xl border-2 border-emerald-300" />{:else}<label class="upload">Upload Single Parent Proof<input type="file" accept="image/*" on:change={handleSingleParentProofChange} class="hidden" /></label>{/if}
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
            <div><label class="label">{householdType === 'boarding' ? 'Number of Tenants / Boarders' : 'Number of Family Members'}</label><input class="input" type="number" min="0" max="20" bind:value={memberCount} on:change={setMemberCount} /></div>
            {#if members.length === 0}<div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">{householdType === 'boarding' ? 'No tenants or boarders added yet.' : 'No additional family members added.'}</div>{/if}
            {#each members as member, index (member.id)}
              {@render PersonFields(householdType === 'boarding' ? `Tenant / Boarder ${index + 1}` : `Family Member ${index + 1}`, member, true)}
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
            <label class="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all bg-slate-50 border-slate-300">
              <div class="w-14 h-14 rounded-2xl bg-slate-200 flex items-center justify-center text-slate-500 font-bold">CAM</div>
              <div class="text-center"><p class="text-sm font-bold text-slate-700">Take Photo or Upload</p><p class="text-xs text-slate-400 mt-0.5">Front view, max 15MB</p></div>
              <input type="file" accept="image/*" capture="environment" on:change={handlePhotoChange} class="hidden" />
            </label>
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
                {@render ReviewItem('Zone', zone || '-')}
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
          <button type="button" on:click={nextStep} disabled={loading || (step === 1 && !DEMO_BYPASS && (gpsStatus === 'outside' || gpsLat === null))} class="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white shadow-lg disabled:opacity-50" style="background:#0f2060;">Next</button>
        {:else}
          <button type="button" on:click={handleSubmit} disabled={loading} class="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white shadow-lg disabled:opacity-60" style="background:#059669;">{loading ? 'Submitting...' : 'Submit Profile'}</button>
        {/if}
      </div>
    </div>
  {/if}
</div>

{#snippet PersonFields(title: string, person: PersonProfile | FamilyMember, showRelationship = false)}
  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
    <h3 class="font-nunito font-extrabold text-slate-700">{title}</h3>
    <div class="grid md:grid-cols-2 gap-3">
      {#if showRelationship}<div><label class="label">Relationship <span class="text-red-400">*</span></label><input class="input" bind:value={(person as FamilyMember).relationship} /></div>{/if}
      <div><label class="label">Full Name <span class="text-red-400">*</span></label><input class="input" bind:value={person.fullName} /></div>
      <div><label class="label">Birthdate <span class="text-red-400">*</span></label><input class="input" type="date" bind:value={person.birthdate} /></div>
      <div><label class="label">Sex <span class="text-red-400">*</span></label><select class="input" bind:value={person.sex}><option value="">Select</option><option>Male</option><option>Female</option></select></div>
      <div><label class="label">Civil Status</label><select class="input" bind:value={person.civilStatus}><option value="">Select</option><option>Single</option><option>Married</option><option>Widowed</option><option>Separated</option><option>Annulled</option></select></div>
      <div><label class="label">Occupation</label><input class="input" bind:value={person.occupation} /></div>
      <div><label class="label">Contact No.</label><input class="input" bind:value={person.contactNo} /></div>
      <div><label class="label">Email</label><input class="input" type="email" bind:value={person.email} /></div>
      <div><label class="label">Vaccination Status</label><select class="input" bind:value={person.vaccinationStatus}><option value="">Select</option><option>Fully vaccinated</option><option>Partially vaccinated</option><option>Unvaccinated</option><option>Unknown</option></select></div>
      <div><label class="label">Blood Type</label><select class="input" bind:value={person.bloodType}><option value="">Select</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option><option>O+</option><option>O-</option><option>Unknown</option></select></div>
      <div class="md:col-span-2"><label class="label">Medical Notes</label><input class="input" bind:value={person.medicalNotes} /></div>
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
        <div><label class="label">PWD Sector / Type <span class="text-red-400">*</span></label><select class="input" bind:value={person.pwdType} on:change={() => refreshPerson(person)}><option value="">Select sector</option><option>Physical Disability</option><option>Visual Impairment</option><option>Hearing Impairment</option><option>Intellectual Disability</option><option>Psychosocial Disability</option><option>Learning Disability</option><option>Speech and Language Impairment</option><option>Multiple Disability</option></select></div>
        {#if person.pwdProofPreview}<img src={person.pwdProofPreview} alt="PWD proof" class="w-full h-36 object-cover rounded-xl border-2 border-emerald-300" />{:else}<label class="upload">{pwdProofLabel(person)}<input type="file" accept="image/*" on:change={(event) => handlePersonProofChange(event, person, 'pwd')} class="hidden" /></label>{/if}
      </div>
    {/if}
    {#if isSenior(person)}
      {#if person.seniorProofPreview}<img src={person.seniorProofPreview} alt="Senior proof" class="w-full h-36 object-cover rounded-xl border-2 border-emerald-300" />{:else}<label class="upload">Upload Senior Citizen Proof<input type="file" accept="image/*" on:change={(event) => handlePersonProofChange(event, person, 'senior')} class="hidden" /></label>{/if}
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
      {@render ReviewItem('Sex', person.sex || '-')}
      {@render ReviewItem('Civil Status', person.civilStatus || '-')}
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
  .type-card { display:flex; flex-direction:column; gap:.3rem; text-align:left; border:2px solid #e2e8f0; background:#f8fafc; border-radius:.9rem; padding:1rem; color:#475569; }
  .type-card-active { border-color:#2563eb; background:#eff6ff; color:#1d4ed8; }
  .choice { border:1px solid #e2e8f0; background:white; color:#64748b; border-radius:999px; padding:.55rem .75rem; font-size:.75rem; font-weight:700; }
  .choice-active { border-color:#059669; background:#d1fae5; color:#047857; }
  .upload { display:flex; align-items:center; justify-content:center; min-height:5rem; border:2px dashed #cbd5e1; border-radius:.75rem; background:white; color:#475569; font-size:.8rem; font-weight:800; cursor:pointer; }
  .review-tabs { display:flex; gap:.5rem; overflow-x:auto; padding-bottom:.25rem; }
  .review-tab { flex:0 0 auto; border:1px solid #e2e8f0; background:#f8fafc; color:#64748b; border-radius:999px; padding:.5rem .75rem; font-size:.72rem; font-weight:800; }
  .review-tab-active { border-color:#2563eb; background:#dbeafe; color:#1d4ed8; }
  .review-nav { border:1px solid #e2e8f0; background:#f8fafc; color:#475569; border-radius:.7rem; padding:.5rem .75rem; font-size:.75rem; font-weight:800; }
  .review-nav:disabled { opacity:.4; cursor:not-allowed; }
  .review-grid { display:grid; grid-template-columns:repeat(1,minmax(0,1fr)); gap:.75rem; }
  @media (min-width:768px) { .review-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
