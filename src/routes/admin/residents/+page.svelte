<!-- src/routes/admin/residents/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { logAuditEvent, pickChangedFields } from '$lib/audit';
  import ResidentProfileModal from '$lib/components/ResidentProfileModal.svelte';

  type Category = 'Regular' | 'PWD' | 'Senior' | 'Single Parent';
  type Status   = 'pending' | 'approved' | 'declined';
  type ResidentStatus = 'active' | 'inactive' | 'deceased' | 'abroad' | 'transferred';
  type AnyRecord = Record<string, unknown>;
  type EditTab = 'household' | 'members';
  type EditableMemberSource = 'father' | 'mother' | 'familyMembers' | 'occupantRecords' | 'head';

  interface EditableMember {
    key: string;
    source: EditableMemberSource;
    index: number;
    label: string;
    relationship: string;
    fullName: string;
    birthdate: string;
    sex: string;
    civilStatus: string;
    contactNo: string;
    email: string;
    occupation: string;
    status: string;
    isPWD: boolean;
    pwdType: string;
    isSenior: boolean;
    isSingleParent: boolean;
    original: AnyRecord;
  }

  interface Resident {
    id: string;
    name: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    sector: string;
    zone: string;
    street?: string;
    purok?: string;
    category: Category;
    isPWD: boolean;
    isSenior: boolean;
    isSingleParent: boolean;
    pwdType?: string;
    status: Status;
    lat?: number;
    lng?: number;
    gpsAccuracy?: number;
    submittedAt?: Date;
    address?: string;
    age?: number;
    birthdate?: string;
    sex?: string;
    civilStatus?: string;
    contactNo?: string;
    photoUrl?: string;
    encodedBy?: string;
    qrId?: string;
    houseNo?: string;
    householdType?: string;
    residentStatus?: ResidentStatus;
    familySetup?: string;
    parents?: {
      father?: AnyRecord;
      mother?: AnyRecord;
    };
    familyMembers?: AnyRecord[];
    occupantRecords?: AnyRecord[];
    email?: string;
    occupation?: string;
    singleParent?: boolean;
  }

  let residents: Resident[] = [];
  let loading   = true;
  let loadError = '';

  let searchQuery  = '';
  let filterStatus = 'All Status';
  let filterSector = 'All Sectors';

  let selected  = new SvelteSet<string>();
  let selectAll = false;

  let profileResident: Resident | null = null;
  let editResident: Resident | null = null;
  let editTab: EditTab = 'household';
  let editSaving = false;
  let editError = '';
  let editForm = {
    address: '',
    householdType: '',
    status: 'approved' as Status,
    residentStatus: 'active' as ResidentStatus
  };
  let editMemberForms: EditableMember[] = [];
  let unsubs: (() => void)[] = [];

  const statuses = ['All Status',  'Pending', 'Approved', 'Declined'];

  onMount(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const initFilter = urlParams.get('filter');
    if (initFilter === 'pending') filterStatus = 'Pending';

    try {
      const { db } = await import('$lib/firebase');
      const { collection, onSnapshot, query, orderBy } = await import('firebase/firestore');

      unsubs.push(onSnapshot(
        query(collection(db, 'residents'), orderBy('submittedAt', 'desc')),
        snap => {
          residents = snap.docs.map(d => {
            const data = d.data() as Omit<Resident, 'id' | 'category'>;
            let category: Category = 'Regular';
            if (data.isPWD)               category = 'PWD';
            else if (data.isSenior)       category = 'Senior';
            else if (data.isSingleParent) category = 'Single Parent';
            return { id: d.id, category, ...data };
          });
          loading = false;
        },
        err => {
          loadError = 'Could not load residents. Check Firestore rules.';
          loading   = false;
          console.error(err);
        }
      ));
    } catch {
      loadError = 'Firebase connection failed.';
      loading   = false;
    }
  });

  onDestroy(() => unsubs.forEach(u => u()));

  $: filtered = residents.filter(r => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q
      || r.name?.toLowerCase().includes(q)
      || r.street?.toLowerCase().includes(q)
      || r.category?.toLowerCase().includes(q)
      || r.address?.toLowerCase().includes(q)
      || r.householdType?.toLowerCase().includes(q);
    const matchStatus = filterStatus === 'All Status'  || r.status === filterStatus.toLowerCase();
    const matchSector = filterSector === 'All Sectors' || r.sector === filterSector;
    return matchSearch && matchStatus && matchSector;
  });

  function toggleSelectAll() {
    selectAll = !selectAll;
    if (selectAll) filtered.forEach(r => selected.add(r.id));
    else selected.clear();
    selected = selected;
  }
  function toggleSelect(id: string) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    selected = selected;
    selectAll = selected.size === filtered.length;
  }

  function handleStatusChange(e: CustomEvent<{ id: string; status: string }>) {
    const { id, status } = e.detail;
    residents = residents.map(r => r.id === id ? { ...r, status: status as Status } : r);
    if (profileResident?.id === id) profileResident = { ...profileResident, status: status as Status };
  }

  function openEdit(resident: Resident) {
    editResident = resident;
    editTab = 'household';
    editError = '';
    editForm = {
      address: displayAddress(resident),
      householdType: resident.householdType || '',
      status: resident.status,
      residentStatus: resident.residentStatus || 'active'
    };
    editMemberForms = buildEditableMembers(resident);
  }

  function closeEdit() {
    editResident = null;
    editError = '';
    editTab = 'household';
    editMemberForms = [];
  }

  function text(value: unknown) {
    return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
  }

  function cloneRecord(value: AnyRecord | undefined): AnyRecord {
    return value ? JSON.parse(JSON.stringify(value)) : {};
  }

  function calculateAge(birthdate: string) {
    if (!birthdate) return null;
    const birthMs = Date.parse(birthdate);
    if (Number.isNaN(birthMs)) return null;
    return Math.floor((Date.now() - birthMs) / (365.25 * 24 * 60 * 60 * 1000));
  }

  function buildEditableMember(source: EditableMemberSource, index: number, label: string, input: AnyRecord): EditableMember | null {
    const original = cloneRecord(input);
    const fullName = text(input.fullName || input.name || [input.firstName, input.middleName, input.lastName].filter(Boolean).join(' '));
    const status = text(input.status);
    if (!fullName && source !== 'head' && status !== 'deceased') return null;

    return {
      key: `${source}-${index}`,
      source,
      index,
      label,
      relationship: text(input.relationship),
      fullName,
      birthdate: text(input.birthdate),
      sex: text(input.sex),
      civilStatus: text(input.civilStatus),
      contactNo: text(input.contactNo || input.mobileNo || input.phone),
      email: text(input.email),
      occupation: text(input.occupation),
      status,
      isPWD: Boolean(input.isPWD),
      pwdType: text(input.pwdType),
      isSenior: Boolean(input.isSenior),
      isSingleParent: Boolean(input.isSingleParent || input.singleParent),
      original
    };
  }

  function buildEditableMembers(resident: Resident) {
    const members: EditableMember[] = [];
    const father = buildEditableMember('father', 0, 'Father / Head', resident.parents?.father ?? {});
    const mother = buildEditableMember('mother', 0, 'Mother / Head', resident.parents?.mother ?? {});
    if (father) members.push(father);
    if (mother) members.push(mother);

    const shouldUseOccupants = resident.householdType === 'boarding' && (resident.occupantRecords?.length ?? 0) > 0;
    const familySource = shouldUseOccupants ? [] : resident.familyMembers ?? [];

    for (const [index, member] of familySource.entries()) {
      const editable = buildEditableMember('familyMembers', index, `Family Member ${index + 1}`, member);
      if (editable) members.push(editable);
    }

    for (const [index, occupant] of (resident.occupantRecords ?? []).entries()) {
      const editable = buildEditableMember('occupantRecords', index, `Tenant / Boarder ${index + 1}`, occupant);
      if (editable) members.push(editable);
    }

    if (!members.length) {
      const head = buildEditableMember('head', 0, 'Household Head', {
        name: resident.name,
        fullName: resident.name,
        birthdate: resident.birthdate,
        sex: resident.sex,
        civilStatus: resident.civilStatus,
        contactNo: resident.contactNo,
        email: resident.email,
        occupation: resident.occupation,
        isPWD: resident.isPWD,
        pwdType: resident.pwdType,
        isSenior: resident.isSenior,
        isSingleParent: resident.isSingleParent || resident.singleParent
      });
      if (head) members.push(head);
    }

    return members;
  }

  function serializeEditableMember(member: EditableMember) {
    return {
      ...member.original,
      relationship: member.relationship.trim(),
      fullName: member.fullName.trim(),
      birthdate: member.birthdate,
      age: calculateAge(member.birthdate),
      sex: member.sex,
      civilStatus: member.civilStatus,
      contactNo: member.contactNo.trim(),
      email: member.email.trim().toLowerCase(),
      occupation: member.occupation.trim(),
      status: member.status || member.original.status || 'present',
      isPWD: member.isPWD,
      pwdType: member.isPWD ? member.pwdType : null,
      isSenior: member.isSenior,
      isSingleParent: member.isSingleParent
    };
  }

  function buildMemberUpdates() {
    const parents = cloneRecord(editResident?.parents);
    const familyMembers = [...(editResident?.familyMembers ?? []).map(cloneRecord)];
    const occupantRecords = [...(editResident?.occupantRecords ?? []).map(cloneRecord)];
    const rootUpdates: AnyRecord = {};

    for (const member of editMemberForms) {
      const serialized = serializeEditableMember(member);
      if (member.source === 'father') {
        parents.father = serialized;
      } else if (member.source === 'mother') {
        parents.mother = serialized;
      } else if (member.source === 'familyMembers') {
        familyMembers[member.index] = serialized;
      } else if (member.source === 'occupantRecords') {
        occupantRecords[member.index] = serialized;
      } else if (member.source === 'head') {
        rootUpdates.name = serialized.fullName;
        rootUpdates.birthdate = serialized.birthdate;
        rootUpdates.age = serialized.age ?? 0;
        rootUpdates.sex = serialized.sex;
        rootUpdates.civilStatus = serialized.civilStatus;
        rootUpdates.contactNo = serialized.contactNo;
        rootUpdates.email = serialized.email;
        rootUpdates.occupation = serialized.occupation;
        rootUpdates.isPWD = serialized.isPWD;
        rootUpdates.pwdType = serialized.pwdType;
        rootUpdates.isSenior = serialized.isSenior;
        rootUpdates.isSingleParent = serialized.isSingleParent;
      }
    }

    return {
      parents,
      familyMembers: editResident?.householdType === 'boarding' && occupantRecords.length ? occupantRecords : familyMembers,
      occupantRecords,
      ...rootUpdates
    };
  }

  async function saveEdit() {
    if (!editResident) return;
    if (!editForm.address.trim()) {
      editError = 'Address is required.';
      return;
    }
    const invalidMember = editMemberForms.find((member) => !member.fullName.trim() && member.status !== 'deceased');
    if (invalidMember) {
      editTab = 'members';
      editError = `${invalidMember.label} needs a full name.`;
      return;
    }

    editSaving = true;
    editError = '';

    try {
      const { db } = await import('$lib/firebase');
      const { doc, updateDoc } = await import('firebase/firestore');
      const memberUpdates = buildMemberUpdates();
      const updates = {
        address: editForm.address.trim(),
        householdType: editForm.householdType || null,
        status: editForm.status,
        residentStatus: editForm.residentStatus,
        ...memberUpdates
      };
      const before = {
        address: displayAddress(editResident),
        householdType: editResident.householdType || null,
        status: editResident.status,
        residentStatus: editResident.residentStatus || 'active',
        parents: editResident.parents ?? null,
        familyMembers: editResident.familyMembers ?? [],
        occupantRecords: editResident.occupantRecords ?? [],
        name: editResident.name ?? null,
        birthdate: editResident.birthdate ?? null,
        sex: editResident.sex ?? null,
        civilStatus: editResident.civilStatus ?? null,
        contactNo: editResident.contactNo ?? null,
        email: editResident.email ?? null,
        occupation: editResident.occupation ?? null,
        isPWD: editResident.isPWD ?? false,
        pwdType: editResident.pwdType ?? null,
        isSenior: editResident.isSenior ?? false,
        isSingleParent: editResident.isSingleParent ?? false
      };

      await updateDoc(doc(db, 'residents', editResident.id), updates);
      await logAuditEvent({
        action: 'update_resident',
        module: 'Residents',
        description: `Updated household record for ${editResident.name || editResident.address || editResident.id}`,
        targetId: editResident.id,
        targetLabel: editResident.name || editResident.address || editResident.id,
        changes: pickChangedFields(before, updates),
        metadata: { qrId: editResident.qrId }
      });

      residents = residents.map((resident) =>
        resident.id === editResident?.id
          ? { ...resident, ...updates, householdType: editForm.householdType || undefined } as Resident
          : resident
      );
      if (profileResident?.id === editResident.id) {
        profileResident = { ...profileResident, ...updates, householdType: editForm.householdType || undefined } as Resident;
      }
      closeEdit();
    } catch (error) {
      console.error(error);
      editError = 'Failed to save household changes. Please try again.';
    } finally {
      editSaving = false;
    }
  }

  function getInitials(r: Resident) {
    if (r.firstName && r.lastName) return `${r.firstName[0]}${r.lastName[0]}`.toUpperCase();
    return r.name?.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() ?? '??';
  }

  function displayAddress(r: Resident) {
    return r.address || [r.houseNo, r.street, r.zone ? `Zone ${r.zone}` : '', 'Barangay Pag-Asa'].filter(Boolean).join(', ') || '—';
  }

  function displayType(r: Resident) {
    if (r.householdType) {
      return r.householdType.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
    }
    return r.category;
  }

  const categoryStyle: Record<Category, string> = {
    'PWD':           'bg-amber-100 text-amber-700',
    'Senior':        'bg-emerald-100 text-emerald-700',
    'Single Parent': 'bg-violet-100 text-violet-700',
    'Regular':       'bg-slate-100 text-slate-500',
  };

  const statusStyle: Record<Status, string> = {
    pending:  'bg-amber-100 text-amber-600',
    approved: 'bg-green-100 text-green-700',
    declined: 'bg-red-100 text-red-500',
  };
</script>

<div class="min-h-screen bg-slate-100 font-inter p-3 sm:p-6 flex flex-col gap-5">

  <div>
    <h1 class="font-nunito text-2xl font-extrabold text-slate-800">Household</h1>
    <p class="text-sm text-slate-500 mt-0.5">Review all household records submitted by staff</p>
  </div>

  {#if loadError}
    <div class="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-3 rounded-xl">
      <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      </svg>
      {loadError}
    </div>
  {/if}

  <div class="flex gap-3 flex-wrap items-center">
    <div class="relative min-w-0 flex-1 basis-full max-w-lg sm:basis-72">
      <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/>
      </svg>
      <input bind:value={searchQuery} type="text" placeholder="Search by address, type, or resident name..."
        class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm" />
    </div>
    <!-- Made the select wider with min-width -->
    <select bind:value={filterStatus}
      class="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 bg-white text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm cursor-pointer sm:w-auto sm:min-w-32">
      {#each statuses as s (s)}<option>{s}</option>{/each}
    </select>
    <!-- REMOVED: Sector dropdown and Export button -->
  </div>

  <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
    <div class="flex flex-col gap-3 px-4 py-4 border-b border-slate-100 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z"/>
        </svg>
        <h2 class="font-nunito font-extrabold text-slate-700 text-base">Household Records</h2>
      </div>
      <div class="flex items-center gap-2">
        {#if selected.size > 0}
          <button type="button" class="text-xs font-bold bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg transition-all active:scale-95">
            Approve {selected.size}
          </button>
          <button type="button" class="text-xs font-bold bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg transition-all active:scale-95">
            Decline {selected.size}
          </button>
        {/if}
        <span class="text-xs text-slate-400 font-semibold">{filtered.length} records</span>
      </div>
    </div>

    <div class="hidden overflow-x-auto md:block">
      <table class="min-w-[760px] w-full text-sm">
        <thead>
          <tr class="bg-slate-50 border-b border-slate-100">
            <th class="w-10 px-5 py-3 text-left">
              <input type="checkbox" checked={selectAll} on:change={toggleSelectAll}
                class="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer" />
            </th>
            <th class="px-3 py-3 text-left text-[0.65rem] font-extrabold tracking-widest text-slate-400 uppercase">Address</th>
            <th class="px-3 py-3 text-left text-[0.65rem] font-extrabold tracking-widest text-slate-400 uppercase">Type</th>
            <th class="px-3 py-3 text-left text-[0.65rem] font-extrabold tracking-widest text-slate-400 uppercase">Status</th>
            <th class="px-3 py-3 text-left text-[0.65rem] font-extrabold tracking-widest text-slate-400 uppercase">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-50">
          {#if loading}
            {#each [1,2,3,4,5] as i (i)}
              <tr class="animate-pulse">
                <td class="px-5 py-4"><div class="w-4 h-4 bg-slate-200 rounded"></div></td>
                <td class="px-3 py-4"><div class="h-3 bg-slate-200 rounded w-32"></div></td>
                <td class="px-3 py-4"><div class="h-5 bg-slate-100 rounded-full w-16"></div></td>
                <td class="px-3 py-4"><div class="h-5 bg-slate-100 rounded-full w-16"></div></td>
                <td class="px-3 py-4"><div class="h-7 bg-slate-200 rounded-lg w-20"></div></td>
              </tr>
            {/each}
          {:else if filtered.length === 0}
            <tr>
              <td colspan="5" class="px-5 py-14 text-center text-slate-400">
                <svg class="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p class="font-semibold text-sm">No household records found</p>
                <p class="text-xs mt-1">Try adjusting your filters</p>
              </td>
            </tr>
          {:else}
            {#each filtered as r (r.id)}
              <tr class="hover:bg-blue-50/40 transition-colors cursor-pointer" on:click={() => profileResident = r}>
                <td class="px-5 py-3.5" on:click|stopPropagation>
                  <input type="checkbox" checked={selected.has(r.id)} on:change={() => toggleSelect(r.id)}
                    class="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer" />
                </td>
                <td class="px-3 py-3.5">
                  <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold text-white shrink-0"
                      style="background:#0f2060;">{getInitials(r)}</div>
                    <div>
                      <p class="font-bold text-slate-700">{displayAddress(r)}</p>
                      <p class="text-[0.68rem] text-slate-400 mt-0.5">{r.name ?? '—'}</p>
                    </div>
                  </div>
                </td>
                <td class="px-3 py-3.5">
                  <span class="text-xs font-bold px-2.5 py-1 rounded-full {categoryStyle[r.category] ?? 'bg-slate-100 text-slate-500'}">
                    {displayType(r)}
                  </span>
                </td>
                <td class="px-3 py-3.5">
                  <span class="text-xs font-bold px-2.5 py-1 rounded-full {statusStyle[r.status] ?? 'bg-slate-100 text-slate-500'} capitalize">
                    {r.status}
                  </span>
                </td>
                <td class="px-3 py-3.5" on:click|stopPropagation>
                  {#if r.status === 'pending'}
                    <div class="flex items-center gap-1.5">
                      <button type="button" on:click={() => profileResident = r}
                        class="text-xs font-bold bg-green-500 hover:bg-green-600 active:scale-95 text-white px-3 py-1.5 rounded-lg transition-all">
                        Review
                      </button>
                    </div>
                  {:else if r.status === 'approved'}
                    <div class="flex items-center gap-1.5">
                      <button type="button" on:click={() => profileResident = r}
                        class="text-xs font-bold bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-600 px-3 py-1.5 rounded-lg transition-all">
                        View
                      </button>
                      <button type="button" on:click={() => openEdit(r)}
                        class="text-xs font-bold bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-3 py-1.5 rounded-lg transition-all">
                        Edit
                      </button>
                    </div>
                  {:else}
                    <button type="button" on:click={() => profileResident = r}
                      class="text-xs font-bold bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-600 px-3 py-1.5 rounded-lg transition-all">
                      View
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <div class="space-y-3 p-3 md:hidden">
      {#if loading}
        {#each [1,2,3,4] as i (i)}
          <div class="animate-pulse rounded-2xl border border-slate-200 bg-white p-4">
            <div class="mb-3 flex items-center gap-3">
              <div class="h-10 w-10 rounded-full bg-slate-200"></div>
              <div class="min-w-0 flex-1 space-y-2">
                <div class="h-3 w-3/4 rounded bg-slate-200"></div>
                <div class="h-2.5 w-1/2 rounded bg-slate-100"></div>
              </div>
            </div>
            <div class="flex gap-2">
              <div class="h-6 w-20 rounded-full bg-slate-100"></div>
              <div class="h-6 w-16 rounded-full bg-slate-100"></div>
            </div>
          </div>
        {/each}
      {:else if filtered.length === 0}
        <div class="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-slate-400">
          <svg class="mx-auto mb-3 h-10 w-10 opacity-40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p class="text-sm font-semibold">No household records found</p>
          <p class="mt-1 text-xs">Try adjusting your filters</p>
        </div>
      {:else}
        {#each filtered as r (r.id)}
          <article class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <button type="button" class="w-full text-left" on:click={() => profileResident = r}>
              <div class="flex items-start gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white"
                  style="background:#0f2060;">{getInitials(r)}</div>
                <div class="min-w-0 flex-1">
                  <p class="break-words font-bold leading-snug text-slate-700">{displayAddress(r)}</p>
                  <p class="mt-1 text-xs text-slate-400">{r.name ?? 'No resident name'}</p>
                </div>
              </div>
            </button>

            <div class="mt-3 flex flex-wrap gap-2">
              <span class="rounded-full px-2.5 py-1 text-xs font-bold {categoryStyle[r.category] ?? 'bg-slate-100 text-slate-500'}">
                {displayType(r)}
              </span>
              <span class="rounded-full px-2.5 py-1 text-xs font-bold capitalize {statusStyle[r.status] ?? 'bg-slate-100 text-slate-500'}">
                {r.status}
              </span>
            </div>

            <div class="mt-4 flex flex-col gap-2">
              {#if r.status === 'pending'}
                <button type="button" on:click={() => profileResident = r}
                  class="w-full rounded-xl bg-green-500 px-3 py-2 text-xs font-bold text-white transition-all active:scale-95">
                  Review
                </button>
              {:else if r.status === 'approved'}
                <div class="grid grid-cols-2 gap-2">
                  <button type="button" on:click={() => profileResident = r}
                    class="rounded-xl bg-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition-all active:scale-95">
                    View
                  </button>
                  <button type="button" on:click={() => openEdit(r)}
                    class="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-all active:scale-95">
                    Edit
                  </button>
                </div>
              {:else}
                <button type="button" on:click={() => profileResident = r}
                  class="w-full rounded-xl bg-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition-all active:scale-95">
                  View
                </button>
              {/if}
            </div>
          </article>
        {/each}
      {/if}
    </div>
  </div>
</div>

<ResidentProfileModal
  resident={profileResident}
  on:close={() => profileResident = null}
  on:statusChange={handleStatusChange}
/>

{#if editResident}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-2 sm:p-4">
    <div class="flex max-h-[96dvh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
      <div class="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-6">
        <div>
          <h2 class="font-nunito text-lg font-extrabold text-slate-800">Edit Household</h2>
          <p class="text-xs text-slate-500">Update household details and residents in this household</p>
        </div>
      </div>

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        {#if editError}
          <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {editError}
          </div>
        {/if}

        <div class="flex flex-wrap gap-2 border-b border-slate-100 pb-3">
          <button
            type="button"
            on:click={() => (editTab = 'household')}
            class="rounded-xl px-3.5 py-2 text-sm font-bold transition-all {editTab === 'household'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}"
          >
            Household Info
          </button>
          <button
            type="button"
            on:click={() => (editTab = 'members')}
            class="rounded-xl px-3.5 py-2 text-sm font-bold transition-all {editTab === 'members'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}"
          >
            Residents / Members ({editMemberForms.length})
          </button>
        </div>

        {#if editTab === 'household'}
          <div class="grid gap-4 md:grid-cols-2">
            <label class="block md:col-span-2">
              <span class="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Address</span>
              <textarea bind:value={editForm.address} rows="3"
                class="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"></textarea>
            </label>

            <label class="block">
              <span class="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Type</span>
              <select bind:value={editForm.householdType}
                class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="">Use existing category</option>
                <option value="residential">Residential</option>
                <option value="business">Business</option>
                <option value="boarding">Boarding</option>
              </select>
            </label>

            <label class="block">
              <span class="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Status</span>
              <select bind:value={editForm.status}
                class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="declined">Declined</option>
              </select>
            </label>

            <label class="block">
              <span class="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Resident Status</span>
              <select bind:value={editForm.residentStatus}
                class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="deceased">Deceased</option>
                <option value="abroad">Abroad</option>
                <option value="transferred">Transferred / Moved Out</option>
              </select>
            </label>
          </div>
        {:else}
          {#if editMemberForms.length === 0}
            <div class="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm font-semibold text-slate-400">
              No resident members are available for this household.
            </div>
          {:else}
            <div class="space-y-4">
              {#each editMemberForms as member (member.key)}
                <section class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 class="font-nunito text-sm font-extrabold text-slate-800">{member.label}</h3>
                      <p class="text-xs font-semibold text-slate-400">{member.fullName || 'Unnamed resident'}</p>
                    </div>
                    {#if member.status}
                      <span class="rounded-full bg-white px-2.5 py-1 text-xs font-bold capitalize text-slate-500 ring-1 ring-slate-200">
                        {member.status}
                      </span>
                    {/if}
                  </div>

                  <div class="grid gap-3 md:grid-cols-2">
                    {#if member.source === 'familyMembers' || member.source === 'occupantRecords' || member.source === 'head'}
                      <label class="block">
                        <span class="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">
                          {member.source === 'occupantRecords' ? 'Room / Relationship' : 'Relationship'}
                        </span>
                        <input bind:value={member.relationship}
                          class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                      </label>
                    {/if}

                    <label class="block {member.source === 'father' || member.source === 'mother' ? 'md:col-span-2' : ''}">
                      <span class="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Full Name</span>
                      <input bind:value={member.fullName}
                        class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                    </label>

                    <label class="block">
                      <span class="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Birthdate</span>
                      <input type="date" bind:value={member.birthdate}
                        class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                    </label>

                    <label class="block">
                      <span class="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Sex</span>
                      <select bind:value={member.sex}
                        class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                        <option value="">Not set</option>
                        <option>Male</option>
                        <option>Female</option>
                      </select>
                    </label>

                    <label class="block">
                      <span class="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Civil Status</span>
                      <select bind:value={member.civilStatus}
                        class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                        <option value="">Not set</option>
                        <option>Single</option>
                        <option>Married</option>
                        <option>Widowed</option>
                        <option>Separated</option>
                        <option>Annulled</option>
                      </select>
                    </label>

                    <label class="block">
                      <span class="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Contact No.</span>
                      <input bind:value={member.contactNo}
                        class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                    </label>

                    <label class="block">
                      <span class="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Email</span>
                      <input type="email" bind:value={member.email}
                        class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                    </label>

                    <label class="block">
                      <span class="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Occupation</span>
                      <input bind:value={member.occupation}
                        class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                    </label>

                    <label class="block">
                      <span class="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Member Status</span>
                      <select bind:value={member.status}
                        class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="deceased">Deceased</option>
                      </select>
                    </label>

                    <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-3 md:col-span-2">
                      <label class="flex items-center gap-2 text-sm font-bold text-slate-600">
                        <input type="checkbox" bind:checked={member.isPWD} class="h-4 w-4 rounded border-slate-300 text-blue-600" />
                        PWD
                      </label>
                      {#if member.isPWD}
                        <input bind:value={member.pwdType} placeholder="PWD type"
                          class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                      {/if}
                      <div class="flex flex-wrap gap-4">
                        <label class="flex items-center gap-2 text-sm font-bold text-slate-600">
                          <input type="checkbox" bind:checked={member.isSenior} class="h-4 w-4 rounded border-slate-300 text-blue-600" />
                          Senior
                        </label>
                        <label class="flex items-center gap-2 text-sm font-bold text-slate-600">
                          <input type="checkbox" bind:checked={member.isSingleParent} class="h-4 w-4 rounded border-slate-300 text-blue-600" />
                          Single Parent
                        </label>
                      </div>
                    </div>
                  </div>
                </section>
              {/each}
            </div>
          {/if}
        {/if}
      </div>

      <div class="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-4 py-4 sm:flex-row sm:px-6">
        <button type="button" on:click={closeEdit} disabled={editSaving}
          class="flex-1 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-50">
          Cancel
        </button>
        <button type="button" on:click={saveEdit} disabled={editSaving}
          class="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
          {editSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  </div>
{/if}
