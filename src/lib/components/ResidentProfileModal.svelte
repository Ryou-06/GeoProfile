<!-- src/lib/components/ResidentProfileModal.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { logAuditEvent } from '$lib/audit';
  import DeclineEmailModal from './DeclineEmailModal.svelte';

  type Status = 'pending' | 'approved' | 'declined';

  interface AnyRecord {
    [key: string]: unknown;
  }

  interface Resident {
    id: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    extensionName?: string;
    name?: string;
    age?: number;
    sex?: string;
    civilStatus?: string;
    contactNo?: string;
    email?: string;
    address?: string;
    houseNo?: string;
    street?: string;
    purok?: string;
    zone?: string;
    landmark?: string;
    lat?: number;
    lng?: number;
    gpsAccuracy?: number;
    photoUrl?: string;
    birthdate?: string;
    status?: Status;
    isPWD?: boolean;
    pwdType?: string;
    pwdProof?: string;
    pwdIdProof?: string;
    isSenior?: boolean;
    seniorProof?: string;
    seniorIdProof?: string;
    isSingleParent?: boolean;
    singleParent?: boolean;
    singleParentProof?: string;
    singleParentIdProof?: string;
    submittedAt?: { toDate(): Date } | Date | string;
    encodedBy?: string;
    householdId?: string;
    qrId?: string;
    occupation?: string;
    householdType?: string;
    profileKind?: string;
    householdDetails?: AnyRecord;
    parents?: {
      father?: AnyRecord;
      mother?: AnyRecord;
    };
    familyMembers?: AnyRecord[];
    occupantRecords?: AnyRecord[];
    memberCount?: number;
    termsAccepted?: boolean;
  }

  interface HouseholdMember {
    id: string;
    sourceIndex: number;
    role: string;
    relationship?: string;
    fullName: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    age?: number;
    birthdate?: string;
    sex?: string;
    civilStatus?: string;
    contactNo?: string;
    email?: string;
    occupation?: string;
    status?: string;
    isPWD?: boolean;
    pwdType?: string;
    pwdProof?: string;
    pwdIdProof?: string;
    isSenior?: boolean;
    seniorProof?: string;
    seniorIdProof?: string;
    isSingleParent?: boolean;
    singleParent?: boolean;
    singleParentProof?: string;
    singleParentIdProof?: string;
    vaccinationStatus?: string;
    bloodType?: string;
    medicalNotes?: string;
  }

  interface ProofImage {
    label: string;
    src?: string;
    tone: 'amber' | 'emerald' | 'violet';
    submitted: boolean;
  }

  interface HouseholdInfo {
    id?: string;
    createdByName?: string;
    createdBy?: string;
    houseNo?: string;
    qrId?: string;
    [key: string]: unknown;
  }

  export let resident: Resident | null = null;

  const dispatch = createEventDispatcher<{
    close: void;
    statusChange: { id: string; status: Status };
  }>();

  let qrStaffName = '';
  let householdInfo: HouseholdInfo | null = null;
  let loadingStaff = false;
  let loadedHouseholdId = '';

  let showPhotoLightbox = false;
  let lightboxSrc = '';
  let lightboxLabel = '';

  let showDeclineEmailModal = false;
  let currentResidentForDecline: Resident | null = null;

  let confirmModal: {
    open: boolean;
    action: 'approve' | 'decline';
  } = { open: false, action: 'approve' };

  let selectedMemberIndex: number | null = null;
  let memberPage = 0;
  let lastResidentId = '';

  const memberPageSize = 5;

  const statusStyles: Record<Status, string> = {
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
    approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    declined: 'bg-rose-100 text-rose-700 border-rose-200'
  };

  const proofStyles: Record<ProofImage['tone'], string> = {
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-700'
  };

  $: if (resident?.id && resident.id !== lastResidentId) {
    lastResidentId = resident.id;
    selectedMemberIndex = null;
    memberPage = 0;
    showPhotoLightbox = false;
    lightboxSrc = '';
    lightboxLabel = '';
  }

  $: if (resident?.householdId && resident.householdId !== loadedHouseholdId) {
    fetchStaffFromHousehold(resident.householdId);
  }

  $: householdMembers = buildHouseholdMembers(resident);
  $: selectedMember =
    selectedMemberIndex !== null ? householdMembers[selectedMemberIndex] ?? null : null;
  $: pageCount = Math.max(1, Math.ceil(householdMembers.length / memberPageSize));
  $: if (memberPage > pageCount - 1) memberPage = pageCount - 1;
  $: visibleMembers = householdMembers
    .map((member, index) => ({ member, index }))
    .slice(memberPage * memberPageSize, memberPage * memberPageSize + memberPageSize);
  $: mapSrc =
    typeof resident?.lat === 'number' && typeof resident?.lng === 'number'
      ? `https://maps.google.com/maps?q=${resident.lat},${resident.lng}&z=17&output=embed`
      : null;
  $: selectedProofImages = getProofItems(selectedMember);

  async function fetchStaffFromHousehold(householdId: string) {
    loadedHouseholdId = householdId;
    loadingStaff = true;
    qrStaffName = '';
    householdInfo = null;

    try {
      const { db } = await import('$lib/firebase');
      const { doc, getDoc } = await import('firebase/firestore');
      const householdDoc = await getDoc(doc(db, 'households', householdId));

      if (householdDoc.exists()) {
        householdInfo = { id: householdDoc.id, ...householdDoc.data() };

        if (typeof householdInfo.createdByName === 'string') {
          qrStaffName = householdInfo.createdByName;
        } else if (typeof householdInfo.createdBy === 'string') {
          const userDoc = await getDoc(doc(db, 'users', householdInfo.createdBy));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            qrStaffName =
              userData.name || userData.displayName || userData.email || householdInfo.createdBy;
          } else {
            qrStaffName = householdInfo.createdBy;
          }
        }
      }
    } catch (error) {
      console.error('Error fetching household staff info:', error);
      qrStaffName = 'Unknown';
    } finally {
      loadingStaff = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (showPhotoLightbox) {
      closeLightbox();
      return;
    }
    if (confirmModal.open) {
      confirmModal = { open: false, action: 'approve' };
      return;
    }
    dispatch('close');
  }

  function openLightbox(src: string, label: string) {
    lightboxSrc = src;
    lightboxLabel = label;
    showPhotoLightbox = true;
  }

  function closeLightbox() {
    showPhotoLightbox = false;
    lightboxSrc = '';
    lightboxLabel = '';
  }

  function handleLightboxBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) closeLightbox();
  }

  function openConfirm(action: 'approve' | 'decline') {
    if (action === 'decline') {
      if (!resident) return;
      currentResidentForDecline = { ...resident };
      showDeclineEmailModal = true;
      return;
    }

    confirmModal = { open: true, action };
  }

  async function handleDeclineEmailSent() {
    showDeclineEmailModal = false;

    if (!resident || !currentResidentForDecline) return;

    try {
      const { db } = await import('$lib/firebase');
      const { updateDoc, doc } = await import('firebase/firestore');
      const oldStatus = resident.status ?? 'pending';
      await updateDoc(doc(db, 'residents', resident.id), { status: 'declined' });
      resident = { ...resident, status: 'declined' };
      await logAuditEvent({
        action: 'decline_resident',
        module: 'Residents',
        description: `Declined household profile for ${getResidentName(resident)}`,
        targetId: resident.id,
        targetLabel: getResidentName(resident),
        changes: { status: { oldValue: oldStatus, newValue: 'declined' } },
        metadata: { qrId: resident.qrId, emailNotification: true }
      });
      dispatch('statusChange', { id: resident.id, status: 'declined' });
      alert('Resident has been declined and email notification sent.');
    } catch (error) {
      console.error('Error updating resident status:', error);
      alert('Failed to update resident status. Please try again.');
    }
  }

  async function confirmAction() {
    if (!resident) return;

    try {
      const { db } = await import('$lib/firebase');
      const { updateDoc, doc } = await import('firebase/firestore');
      const newStatus = confirmModal.action === 'approve' ? 'approved' : 'declined';
      const oldStatus = resident.status ?? 'pending';
      await updateDoc(doc(db, 'residents', resident.id), { status: newStatus });
      resident = { ...resident, status: newStatus };
      await logAuditEvent({
        action: confirmModal.action === 'approve' ? 'approve_resident' : 'decline_resident',
        module: 'Residents',
        description: `${capitalize(newStatus)} household profile for ${getResidentName(resident)}`,
        targetId: resident.id,
        targetLabel: getResidentName(resident),
        changes: { status: { oldValue: oldStatus, newValue: newStatus } },
        metadata: { qrId: resident.qrId }
      });
      dispatch('statusChange', { id: resident.id, status: newStatus });
    } catch (error) {
      console.error(error);
      alert('Failed to update status. Please try again.');
    }

    confirmModal = { open: false, action: 'approve' };
  }

  function buildHouseholdMembers(record: Resident | null): HouseholdMember[] {
    if (!record) return [];

    const members: HouseholdMember[] = [];
    const householdSingleParentProof = getProofValue(record, 'singleParent');
    const father = normalizeMember(record.parents?.father, 'Father / Head', members.length);
    const mother = normalizeMember(record.parents?.mother, 'Mother / Head', members.length);

    if (record.singleParent || record.isSingleParent) {
      if (father && record.parents?.father?.status === 'present') {
        father.isSingleParent = true;
        father.singleParentProof = father.singleParentProof || householdSingleParentProof;
        father.singleParentIdProof = father.singleParentIdProof || householdSingleParentProof;
      }
      if (mother && record.parents?.mother?.status === 'present') {
        mother.isSingleParent = true;
        mother.singleParentProof = mother.singleParentProof || householdSingleParentProof;
        mother.singleParentIdProof = mother.singleParentIdProof || householdSingleParentProof;
      }
    }

    if (father) members.push(father);
    if (mother) members.push(mother);

    for (const member of record.familyMembers ?? []) {
      const normalized = normalizeMember(member, 'Family Member', members.length);
      if (normalized) members.push(normalized);
    }

    for (const occupant of record.occupantRecords ?? []) {
      const normalized = normalizeMember(occupant, 'Tenant / Boarder', members.length);
      if (normalized) members.push(normalized);
    }

    if (!members.length) {
      members.push({
        id: record.id,
        sourceIndex: 0,
        role: 'Resident',
        relationship: 'Household Head',
        fullName: getResidentName(record),
        firstName: record.firstName,
        middleName: record.middleName,
        lastName: record.lastName,
        age: record.age,
        birthdate: record.birthdate,
        sex: record.sex,
        civilStatus: record.civilStatus,
        contactNo: record.contactNo,
        email: record.email,
        occupation: record.occupation,
        isPWD: record.isPWD,
        pwdType: record.pwdType,
        pwdProof: record.pwdProof,
        pwdIdProof: getProofValue(record, 'pwd'),
        isSenior: record.isSenior,
        seniorProof: record.seniorProof,
        seniorIdProof: getProofValue(record, 'senior'),
        isSingleParent: record.isSingleParent || record.singleParent,
        singleParentProof: getProofValue(record, 'singleParent'),
        singleParentIdProof: getProofValue(record, 'singleParent')
      });
    }

    return members.map((member, index) => ({ ...member, sourceIndex: index }));
  }

  function normalizeMember(input: AnyRecord | undefined, fallbackRole: string, index: number) {
    if (!input) return null;

    const status = text(input.status);
    const firstName = text(input.firstName);
    const middleName = text(input.middleName);
    const lastName = text(input.lastName);
    const fullName = text(input.fullName) || [firstName, middleName, lastName].filter(Boolean).join(' ');

    if (!fullName && status !== 'deceased') return null;

    return {
      id: text(input.id) || `${fallbackRole}-${index}`,
      sourceIndex: index,
      role: text(input.role) || fallbackRole,
      relationship: text(input.relationship),
      fullName: fullName || `${fallbackRole} (${capitalize(status)})`,
      firstName,
      middleName,
      lastName,
      age: numberValue(input.age),
      birthdate: text(input.birthdate),
      sex: text(input.sex),
      civilStatus: text(input.civilStatus),
      contactNo: text(input.contactNo || input.mobileNo || input.phone),
      email: text(input.email),
      occupation: text(input.occupation),
      status,
      isPWD: Boolean(input.isPWD),
      pwdType: text(input.pwdType),
      pwdProof: getProofValue(input, 'pwd'),
      pwdIdProof: getProofValue(input, 'pwd'),
      isSenior: Boolean(input.isSenior),
      seniorProof: getProofValue(input, 'senior'),
      seniorIdProof: getProofValue(input, 'senior'),
      isSingleParent: Boolean(input.isSingleParent || input.singleParent),
      singleParentProof: getProofValue(input, 'singleParent'),
      singleParentIdProof: getProofValue(input, 'singleParent'),
      vaccinationStatus: text(input.vaccinationStatus),
      bloodType: text(input.bloodType),
      medicalNotes: text(input.medicalNotes)
    };
  }

  function getProofItems(member: HouseholdMember | null): ProofImage[] {
    if (!member) return [];

    const proofs: ProofImage[] = [];
    if (member.isPWD) {
      proofs.push({
        label: member.pwdType ? `PWD Proof - ${member.pwdType}` : 'PWD Proof',
        src: member.pwdIdProof,
        tone: 'amber',
        submitted: Boolean(member.pwdIdProof)
      });
    }
    if (member.isSenior) {
      proofs.push({
        label: 'Senior Citizen Proof',
        src: member.seniorIdProof,
        tone: 'emerald',
        submitted: Boolean(member.seniorIdProof)
      });
    }
    if (member.isSingleParent) {
      proofs.push({
        label: 'Single Parent Proof',
        src: member.singleParentIdProof,
        tone: 'violet',
        submitted: Boolean(member.singleParentIdProof)
      });
    }

    return proofs;
  }

  function getProofValue(value: unknown, type: 'pwd' | 'senior' | 'singleParent') {
    const input = value && typeof value === 'object' ? (value as AnyRecord) : {};
    const proofs = input.proofs && typeof input.proofs === 'object' ? (input.proofs as AnyRecord) : {};

    if (type === 'pwd') {
      return text(input.pwdIdProof || input.pwdProof || proofs.pwdIdProof || proofs.pwdProof);
    }
    if (type === 'senior') {
      return text(input.seniorIdProof || input.seniorProof || proofs.seniorIdProof || proofs.seniorProof);
    }
    return text(
      input.singleParentIdProof ||
        input.singleParentProof ||
        proofs.singleParentIdProof ||
        proofs.singleParentProof
    );
  }

  function getResidentName(record: Resident) {
    return (
      record.name ||
      [record.firstName, record.middleName, record.lastName, record.extensionName]
        .filter(Boolean)
        .join(' ') ||
      'Unnamed Resident'
    );
  }

  function getProfileType(record: Resident) {
    const type = record.householdType || record.profileKind || 'residential';
    if (type === 'business') return 'Business / Establishment';
    if (type === 'boarding') return 'Rental / Boarding';
    return 'Residential Household';
  }

  function getPrimaryDetails(record: Resident) {
    const details = record.householdDetails ?? {};
    const type = record.householdType || record.profileKind;

    if (type === 'business') {
      const business = (details.business as AnyRecord | undefined) ?? details;
      return [
        ['Business Name', text(business.businessName || business.name)],
        ['Owner', text(business.ownerName || business.owner)],
        ['Business Type', text(business.businessType || business.type)],
        ['Contact No.', text(business.contactNo || business.phone)]
      ];
    }

    if (type === 'boarding') {
      const boarding = (details.boarding as AnyRecord | undefined) ?? details;
      return [
        ['Property Name', text(boarding.propertyName || boarding.name)],
        ['Owner / Manager', text(boarding.ownerName || boarding.managerName)],
        ['Units / Rooms', text(boarding.unitCount || boarding.roomCount)],
        ['Occupants', String(record.occupantRecords?.length || record.memberCount || 0)]
      ];
    }

    const residential = (details.residential as AnyRecord | undefined) ?? details;
    return [
      ['Household Head', getResidentName(record)],
      ['Household Members', String(householdMembers.length)],
      ['Ownership', text(residential.ownershipStatus || residential.ownership)],
      ['Years in Barangay', text(residential.yearsInBarangay)]
    ];
  }

  function buildAddress(record: Resident) {
    if (record.address) return record.address;
    return [record.houseNo, record.street, record.purok, record.zone, 'Barangay Pag-Asa']
      .filter(Boolean)
      .join(', ');
  }

  function formatDate(ts: { toDate(): Date } | Date | string | null | undefined) {
    if (!ts) return 'Not provided';
    const date = typeof ts === 'object' && 'toDate' in ts ? ts.toDate() : new Date(ts);
    if (Number.isNaN(date.getTime())) return 'Not provided';
    return date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function text(value: unknown) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function numberValue(value: unknown) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  function display(value: unknown) {
    const clean = text(value);
    return clean || 'Not provided';
  }

  function yesNo(value: boolean | undefined) {
    return value ? 'Yes' : 'No';
  }

  function capitalize(value: string) {
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function selectMember(index: number) {
    selectedMemberIndex = index;
  }

  function backToHousehold() {
    selectedMemberIndex = null;
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if resident}
  <div class="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-sm"></div>

  <div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
    <section
      class="pointer-events-auto flex h-[96dvh] w-[98vw] max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:h-[94vh] sm:rounded-[1.75rem]"
      aria-label="Resident profile modal"
    >
      <header class="flex shrink-0 flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-xs font-extrabold uppercase tracking-[0.24em] text-blue-700">
              Household Profile
            </p>
            <span
              class="rounded-full border px-2.5 py-1 text-xs font-bold {statusStyles[
                resident.status ?? 'pending'
              ]}"
            >
              {capitalize(resident.status ?? 'pending')}
            </span>
          </div>
          <h2 class="mt-1 truncate text-xl font-extrabold text-slate-900">
            {getResidentName(resident)}
          </h2>
        </div>

        <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {#if resident.status === 'pending'}
            <button
              type="button"
              on:click={() => openConfirm('approve')}
              class="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 sm:flex-none"
            >
              Approve
            </button>
            <button
              type="button"
              on:click={() => openConfirm('decline')}
              class="flex-1 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-700 sm:flex-none"
            >
              Decline
            </button>
          {/if}
          <button
            type="button"
            on:click={() => dispatch('close')}
            class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
            aria-label="Close resident profile"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      {#if selectedMember}
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
          <div class="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[1fr_390px]">
            <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <button
                type="button"
                on:click={backToHousehold}
                class="mb-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Household
              </button>

              <div class="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <p class="text-xs font-extrabold uppercase tracking-[0.2em] text-slate-400">
                    Member Information
                  </p>
                  <h3 class="mt-1 text-2xl font-extrabold text-slate-900">{selectedMember.fullName}</h3>
                  <p class="mt-1 text-sm font-semibold text-slate-500">
                    {selectedMember.role}
                    {#if selectedMember.relationship}
                      - {selectedMember.relationship}
                    {/if}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  {#if selectedMember.isPWD}
                    <span class="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                      PWD{selectedMember.pwdType ? ` - ${selectedMember.pwdType}` : ''}
                    </span>
                  {/if}
                  {#if selectedMember.isSenior}
                    <span class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                      Senior Citizen
                    </span>
                  {/if}
                  {#if selectedMember.isSingleParent}
                    <span class="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">
                      Single Parent
                    </span>
                  {/if}
                </div>
              </div>

              <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div class="rounded-xl border border-slate-200 p-3">
                  <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Age</p>
                  <p class="mt-1 text-sm font-bold text-slate-800">{display(selectedMember.age)}</p>
                </div>
                <div class="rounded-xl border border-slate-200 p-3">
                  <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Birthdate</p>
                  <p class="mt-1 text-sm font-bold text-slate-800">{display(selectedMember.birthdate)}</p>
                </div>
                <div class="rounded-xl border border-slate-200 p-3">
                  <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Sex</p>
                  <p class="mt-1 text-sm font-bold text-slate-800">{display(selectedMember.sex)}</p>
                </div>
                <div class="rounded-xl border border-slate-200 p-3">
                  <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Civil Status</p>
                  <p class="mt-1 text-sm font-bold text-slate-800">{display(selectedMember.civilStatus)}</p>
                </div>
                <div class="rounded-xl border border-slate-200 p-3">
                  <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Contact No.</p>
                  <p class="mt-1 text-sm font-bold text-slate-800">{display(selectedMember.contactNo)}</p>
                </div>
                <div class="rounded-xl border border-slate-200 p-3">
                  <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Email</p>
                  <p class="mt-1 break-words text-sm font-bold text-slate-800">{display(selectedMember.email)}</p>
                </div>
                <div class="rounded-xl border border-slate-200 p-3">
                  <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Occupation</p>
                  <p class="mt-1 text-sm font-bold text-slate-800">{display(selectedMember.occupation)}</p>
                </div>
                <div class="rounded-xl border border-slate-200 p-3">
                  <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Vaccination</p>
                  <p class="mt-1 text-sm font-bold text-slate-800">
                    {display(selectedMember.vaccinationStatus)}
                  </p>
                </div>
                <div class="rounded-xl border border-slate-200 p-3">
                  <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Blood Type</p>
                  <p class="mt-1 text-sm font-bold text-slate-800">{display(selectedMember.bloodType)}</p>
                </div>
              </div>

              <div class="mt-4 rounded-xl border border-slate-200 p-3">
                <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Health Notes</p>
                <p class="mt-1 text-sm font-semibold text-slate-700">{display(selectedMember.medicalNotes)}</p>
              </div>

              {#if selectedProofImages.length}
                <div class="mt-5">
                  <p class="text-xs font-extrabold uppercase tracking-[0.2em] text-slate-400">
                    Submitted Proofs
                  </p>
                  <div class="mt-3 grid gap-3 sm:grid-cols-2">
                    {#each selectedProofImages as proof (proof.label)}
                      {#if proof.submitted && proof.src}
                        <button
                          type="button"
                          on:click={() => openLightbox(proof.src ?? '', proof.label)}
                          class="overflow-hidden rounded-xl border text-left {proofStyles[proof.tone]}"
                        >
                          <div class="flex items-center justify-between gap-2 px-3 py-2 text-xs font-extrabold uppercase tracking-wider">
                            <span>{proof.label}</span>
                            <span class="rounded-full bg-white/80 px-2 py-0.5 text-[0.6rem]">View</span>
                          </div>
                          <img src={proof.src} alt={proof.label} class="h-36 w-full object-cover" />
                        </button>
                      {:else}
                        <div class="rounded-xl border p-4 {proofStyles[proof.tone]}">
                          <p class="text-xs font-extrabold uppercase tracking-wider">{proof.label}</p>
                          <div class="mt-4 flex h-24 items-center justify-center rounded-lg border border-dashed border-current/30 bg-white/55 text-center">
                            <p class="text-xs font-bold">No proof image submitted</p>
                          </div>
                        </div>
                      {/if}
                    {/each}
                  </div>
                </div>
              {:else}
                <div class="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-xs font-extrabold uppercase tracking-[0.2em] text-slate-400">
                    Submitted Proofs
                  </p>
                  <p class="mt-2 text-sm font-semibold text-slate-500">
                    This member has no PWD, Senior Citizen, or Single Parent proof requirement recorded.
                  </p>
                </div>
              {/if}
            </section>

            <aside class="flex min-h-[360px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div class="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <p class="text-xs font-extrabold uppercase tracking-[0.2em] text-slate-400">
                    Members
                  </p>
                  <p class="text-sm font-bold text-slate-800">
                    Showing {visibleMembers.length} of {householdMembers.length}
                  </p>
                </div>
                <div class="flex gap-1">
                  <button
                    type="button"
                    on:click={() => (memberPage = Math.max(0, memberPage - 1))}
                    disabled={memberPage === 0}
                    class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-35"
                    aria-label="Previous members"
                  >
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    on:click={() => (memberPage = Math.min(pageCount - 1, memberPage + 1))}
                    disabled={memberPage >= pageCount - 1}
                    class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-35"
                    aria-label="Next members"
                  >
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              <div class="mt-3 space-y-2">
                {#each visibleMembers as item (item.index)}
                  <button
                    type="button"
                    on:click={() => selectMember(item.index)}
                    class="w-full rounded-xl border p-3 text-left transition {selectedMemberIndex === item.index
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'}"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-extrabold text-slate-800">{item.member.fullName}</p>
                        <p class="text-xs font-semibold text-slate-500">{item.member.role}</p>
                      </div>
                      <span class="rounded-full bg-slate-100 px-2 py-1 text-[0.65rem] font-bold text-slate-500">
                        #{item.index + 1}
                      </span>
                    </div>
                  </button>
                {/each}
              </div>

              <div class="mt-auto pt-4 text-center text-xs font-semibold text-slate-400">
                Page {memberPage + 1} of {pageCount}
              </div>
            </aside>
          </div>

          <section class="shrink-0 border-t border-slate-200 bg-white p-4">
            <div class="grid gap-4 lg:grid-cols-[1fr_300px]">
              <div class="h-64 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                {#if mapSrc}
                  <iframe
                    src={mapSrc}
                    title="Household location"
                    class="h-full w-full border-0"
                    loading="lazy"
                    referrerpolicy="no-referrer-when-downgrade"
                  ></iframe>
                {:else}
                  <div class="flex h-full items-center justify-center text-sm font-bold text-slate-400">
                    No GPS location captured
                  </div>
                {/if}
              </div>

              <div class="rounded-2xl border border-slate-200 p-4">
                <p class="text-xs font-extrabold uppercase tracking-[0.2em] text-slate-400">
                  Location
                </p>
                <p class="mt-2 text-sm font-bold text-slate-800">{display(buildAddress(resident))}</p>
                <p class="mt-2 text-xs font-semibold text-slate-500">
                  Lat: {display(resident.lat)} / Lng: {display(resident.lng)}
                </p>
              </div>
            </div>
          </section>
        </div>
      {:else}
        <div class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[470px_1fr]">
          <section class="flex min-h-0 flex-col border-r border-slate-200 bg-white">
            <div class="overflow-y-auto p-5">
              <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p class="text-xs font-extrabold uppercase tracking-[0.2em] text-blue-700">
                  1. House Profile Info
                </p>
                <div class="mt-4 grid gap-3">
                  <div>
                    <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Type</p>
                    <p class="text-sm font-extrabold text-slate-800">{getProfileType(resident)}</p>
                  </div>
                  <div>
                    <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Address</p>
                    <p class="text-sm font-bold text-slate-700">{display(buildAddress(resident))}</p>
                  </div>
                  <div class="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Purok</p>
                      <p class="text-sm font-bold text-slate-700">{display(resident.purok)}</p>
                    </div>
                    <div>
                      <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Zone</p>
                      <p class="text-sm font-bold text-slate-700">{display(resident.zone)}</p>
                    </div>
                  </div>
                  <div>
                    <p class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Landmark</p>
                    <p class="text-sm font-bold text-slate-700">{display(resident.landmark)}</p>
                  </div>
                </div>

                <div class="mt-4 grid gap-2 border-t border-slate-200 pt-4">
                  {#each getPrimaryDetails(resident) as detail (`${detail[0]}-${detail[1]}`)}
                    <div class="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                      <span class="text-xs font-bold uppercase tracking-wider text-slate-400">
                        {detail[0]}
                      </span>
                      <span class="text-right text-sm font-extrabold text-slate-700">{display(detail[1])}</span>
                    </div>
                  {/each}
                </div>

                <div class="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                  <div class="rounded-xl bg-white p-3">
                    <p class="font-bold uppercase tracking-wider text-slate-400">Terms</p>
                    <p class="mt-1 font-extrabold text-slate-700">{yesNo(resident.termsAccepted)}</p>
                  </div>
                  <div class="rounded-xl bg-white p-3">
                    <p class="font-bold uppercase tracking-wider text-slate-400">Submitted</p>
                    <p class="mt-1 font-extrabold text-slate-700">{formatDate(resident.submittedAt)}</p>
                  </div>
                </div>

                {#if resident.householdId}
                  <div class="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3">
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <p class="text-[0.65rem] font-bold uppercase tracking-widest text-blue-600">
                          QR Created By
                        </p>
                        {#if loadingStaff}
                          <p class="mt-1 text-sm font-extrabold text-slate-500">Loading staff info...</p>
                        {:else}
                          <p class="mt-1 text-sm font-extrabold text-slate-800">
                            {display(qrStaffName)}
                          </p>
                        {/if}
                      </div>
                      {#if householdInfo?.qrId || resident.qrId}
                        <span class="rounded-lg bg-white px-2.5 py-1 text-[0.65rem] font-extrabold text-blue-700">
                          {householdInfo?.qrId || resident.qrId}
                        </span>
                      {/if}
                    </div>
                    {#if householdInfo?.houseNo}
                      <p class="mt-2 text-xs font-semibold text-blue-700/70">
                        Household record: House No. {householdInfo.houseNo}
                      </p>
                    {/if}
                  </div>
                {/if}

                {#if resident.photoUrl}
                  <button
                    type="button"
                    on:click={() => openLightbox(resident!.photoUrl ?? '', 'House Photo')}
                    class="mt-4 block w-full overflow-hidden rounded-2xl border border-slate-200"
                  >
                    <img src={resident.photoUrl} alt="House" class="h-40 w-full object-cover" />
                  </button>
                {/if}
              </div>

              <div class="mt-4 rounded-2xl border border-slate-200 bg-white">
                <div class="border-b border-slate-100 px-4 py-3">
                  <p class="text-xs font-extrabold uppercase tracking-[0.2em] text-slate-400">
                    Member List
                  </p>
                  <p class="text-sm font-bold text-slate-800">
                    Family head and members ({householdMembers.length})
                  </p>
                </div>

                <div class="divide-y divide-slate-100">
                  {#each householdMembers as member, index (member.id)}
                    <button
                      type="button"
                      on:click={() => selectMember(index)}
                      class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-blue-50"
                    >
                      <div class="min-w-0">
                        <p class="truncate text-sm font-extrabold text-slate-800">{member.fullName}</p>
                        <p class="text-xs font-semibold text-slate-500">
                          {member.role}{member.age ? ` - ${member.age} yrs old` : ''}
                        </p>
                      </div>
                      <svg class="h-4 w-4 shrink-0 text-slate-300" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          </section>

          <section class="flex min-h-[280px] flex-col bg-slate-50 p-4 sm:p-5 lg:min-h-0">
            <div
              class="flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white/70 p-8 text-center"
            >
              <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <svg class="h-8 w-8" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m6-6a4 4 0 11-8 0 4 4 0 018 0zm6 2a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 class="mt-4 text-lg font-extrabold text-slate-700">Member detail panel</h3>
              <p class="mt-2 max-w-md text-sm font-semibold text-slate-400">
                Select a household member from the list to show their information. Other modal tools are disabled for now.
              </p>
            </div>
          </section>
        </div>
      {/if}
    </section>
  </div>
{/if}

{#if showDeclineEmailModal && currentResidentForDecline}
  <DeclineEmailModal
    resident={currentResidentForDecline}
    householdId={currentResidentForDecline.householdId || ''}
    on:close={() => {
      showDeclineEmailModal = false;
      currentResidentForDecline = null;
    }}
    on:emailSent={handleDeclineEmailSent}
  />
{/if}

{#if showPhotoLightbox && lightboxSrc}
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
    role="button"
    tabindex="0"
    on:click={handleLightboxBackdrop}
    on:keydown={(event) => event.key === 'Escape' && closeLightbox()}
  >
    <div class="relative max-h-[88vh] w-full max-w-3xl">
      <img src={lightboxSrc} alt={lightboxLabel} class="max-h-[88vh] w-full rounded-2xl object-contain shadow-2xl" />
      <button
        type="button"
        on:click={closeLightbox}
        class="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
        aria-label="Close image preview"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      {#if lightboxLabel}
        <div class="absolute bottom-3 left-3 rounded-xl bg-black/60 px-3 py-2 text-xs font-bold text-white">
          {lightboxLabel}
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if confirmModal.open}
  <div class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
    <div class="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
      <div
        class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full {confirmModal.action ===
        'approve'
          ? 'bg-emerald-100 text-emerald-600'
          : 'bg-rose-100 text-rose-600'}"
      >
        {#if confirmModal.action === 'approve'}
          <svg class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        {:else}
          <svg class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        {/if}
      </div>
      <h3 class="text-lg font-extrabold text-slate-800">
        {confirmModal.action === 'approve' ? 'Approve Resident?' : 'Decline Resident?'}
      </h3>
      <p class="mt-1 text-sm font-semibold text-slate-500">{resident?.name || resident?.firstName}</p>
      <p class="mt-3 text-sm text-slate-400">
        {confirmModal.action === 'approve'
          ? 'This registration will be marked as approved.'
          : 'This registration will be marked as declined.'}
      </p>
      <div class="mt-5 flex gap-3">
        <button
          type="button"
          on:click={() => (confirmModal = { open: false, action: 'approve' })}
          class="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-200"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={confirmAction}
          class="flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition {confirmModal.action ===
          'approve'
            ? 'bg-emerald-600 hover:bg-emerald-700'
            : 'bg-rose-600 hover:bg-rose-700'}"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
{/if}
