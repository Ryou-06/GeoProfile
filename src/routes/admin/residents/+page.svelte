<!-- src/routes/admin/residents/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import ResidentProfileModal from '$lib/components/ResidentProfileModal.svelte';

  type Category = 'Regular' | 'PWD' | 'Senior' | 'Single Parent';
  type Status   = 'pending' | 'approved' | 'declined';

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
  let editSaving = false;
  let editError = '';
  let editForm = {
    address: '',
    householdType: '',
    status: 'approved' as Status
  };
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
    editError = '';
    editForm = {
      address: displayAddress(resident),
      householdType: resident.householdType || '',
      status: resident.status
    };
  }

  function closeEdit() {
    editResident = null;
    editError = '';
  }

  async function saveEdit() {
    if (!editResident) return;
    if (!editForm.address.trim()) {
      editError = 'Address is required.';
      return;
    }

    editSaving = true;
    editError = '';

    try {
      const { db } = await import('$lib/firebase');
      const { doc, updateDoc } = await import('firebase/firestore');
      const updates = {
        address: editForm.address.trim(),
        householdType: editForm.householdType || null,
        status: editForm.status
      };

      await updateDoc(doc(db, 'residents', editResident.id), updates);

      residents = residents.map((resident) =>
        resident.id === editResident?.id
          ? { ...resident, ...updates, householdType: editForm.householdType || undefined }
          : resident
      );
      if (profileResident?.id === editResident.id) {
        profileResident = { ...profileResident, ...updates, householdType: editForm.householdType || undefined };
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

<div class="min-h-screen bg-slate-100 font-inter p-6 flex flex-col gap-5">

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
    <div class="relative flex-1 min-w-55 max-w-lg">
      <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/>
      </svg>
      <input bind:value={searchQuery} type="text" placeholder="Search by address, type, or resident name..."
        class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm" />
    </div>
    <!-- Made the select wider with min-width -->
    <select bind:value={filterStatus}
      class="text-sm border border-slate-200 rounded-xl px-4 py-2.5 bg-white text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm cursor-pointer min-w-32">
      {#each statuses as s (s)}<option>{s}</option>{/each}
    </select>
    <!-- REMOVED: Sector dropdown and Export button -->
  </div>

  <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
    <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
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

    <div class="overflow-x-auto">
      <table class="w-full text-sm">
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
  </div>
</div>

<ResidentProfileModal
  resident={profileResident}
  on:close={() => profileResident = null}
  on:statusChange={handleStatusChange}
/>

{#if editResident}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
    <div class="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
      <div class="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div>
          <h2 class="font-nunito text-lg font-extrabold text-slate-800">Edit Household</h2>
          <p class="text-xs text-slate-500">Update approved household record details</p>
        </div>
        <button type="button" on:click={closeEdit} disabled={editSaving}
          class="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-500 hover:bg-slate-200 disabled:opacity-50">
          Close
        </button>
      </div>

      <div class="space-y-4 px-6 py-5">
        {#if editError}
          <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {editError}
          </div>
        {/if}

        <label class="block">
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
      </div>

      <div class="flex gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
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
