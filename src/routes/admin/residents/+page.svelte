<!-- src/routes/admin/residents/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import ResidentProfileModal from '$lib/components/ResidentProfileModal.svelte';

  // ── Types ──────────────────────────────────────────────
  type Category = 'Regular' | 'PWD' | 'Senior' | 'Single Parent';
  type Status   = 'pending' | 'approved' | 'rejected';

  interface Resident {
    id: string;
    name: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    sector: string;
    zone: string;
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
    street?: string;
  }

  // ── State ──────────────────────────────────────────────
  let residents: Resident[] = [];
  let loading   = true;
  let loadError = '';

  let searchQuery  = '';
  let filterZone   = 'All Zones';
  let filterStatus = 'All Status';
  let filterSector = 'All Sectors';

  let selected  = new SvelteSet<string>();
  let selectAll = false;

  let profileResident: Resident | null = null;  // ← drives the modal

  let unsubs: (() => void)[] = [];

  const zones    = ['All Zones',   'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'];
  const statuses = ['All Status',  'Pending', 'Approved', 'Rejected'];
  const sectors  = ['All Sectors', 'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'];

  // ── Firebase ───────────────────────────────────────────
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

  // ── Filtered list ─────────────────────────────────────
  $: filtered = residents.filter(r => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q
      || r.name?.toLowerCase().includes(q)
      || r.zone?.toLowerCase().includes(q)
      || r.category?.toLowerCase().includes(q)
      || r.address?.toLowerCase().includes(q);
    const matchZone   = filterZone   === 'All Zones'   || r.zone   === filterZone;
    const matchStatus = filterStatus === 'All Status'  || r.status === filterStatus.toLowerCase();
    const matchSector = filterSector === 'All Sectors' || r.sector === filterSector;
    return matchSearch && matchZone && matchStatus && matchSector;
  });

  // ── Select ─────────────────────────────────────────────
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

  // ── When modal fires statusChange, sync to the list ───
  function handleStatusChange(e: CustomEvent<{ id: string; status: string }>) {
    const { id, status } = e.detail;
    residents = residents.map(r => r.id === id ? { ...r, status: status as Status } : r);
    // Also update the open modal so badge reflects change immediately
    if (profileResident?.id === id) profileResident = { ...profileResident, status: status as Status };
  }

  // ── Helpers ───────────────────────────────────────────
  function getInitials(r: Resident) {
    if (r.firstName && r.lastName) return `${r.firstName[0]}${r.lastName[0]}`.toUpperCase();
    return r.name?.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() ?? '??';
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
    rejected: 'bg-red-100 text-red-500',
  };
</script>

<!-- ═══════════════════════════ PAGE ═══════════════════════════ -->
<div class="min-h-screen bg-slate-100 font-inter p-6 flex flex-col gap-5">

  <!-- Header -->
  <div>
    <h1 class="font-nunito text-2xl font-extrabold text-slate-800">Residents</h1>
    <p class="text-sm text-slate-500 mt-0.5">Review all records submitted by staff</p>
  </div>

  <!-- Error -->
  {#if loadError}
    <div class="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-3 rounded-xl">
      <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      </svg>
      {loadError}
    </div>
  {/if}

  <!-- Search + filters -->
  <div class="flex gap-3 flex-wrap items-center">
    <div class="relative flex-1 min-w-55 max-w-lg">
      <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/>
      </svg>
      <input bind:value={searchQuery} type="text" placeholder="Search by name, zone, or category..."
        class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm" />
    </div>
<select bind:value={filterStatus}
  class="text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm cursor-pointer">
  {#each statuses as s (s)}<option>{s}</option>{/each}
</select>
    <select bind:value={filterSector}
      class="text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm cursor-pointer">
      {#each sectors as s (s)}<option>{s}</option>{/each}
    </select>
    <button type="button"
      class="ml-auto flex items-center gap-1.5 text-sm font-bold text-white px-4 py-2.5 rounded-xl transition-all active:scale-95 shadow-sm"
      style="background:#2563eb;">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 8l-3-3m3 3l3-3"/>
      </svg>
      Export
    </button>
  </div>

  <!-- Zone tabs -->
  <div class="flex gap-2 flex-wrap">
    {#each zones as z (z)}
      <button type="button" on:click={() => filterZone = z}
        class="text-sm font-bold px-4 py-1.5 rounded-full border transition-all
          {filterZone === z ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'}">
        {z}
      </button>
    {/each}
  </div>

  <!-- Table -->
  <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
    <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z"/>
        </svg>
        <h2 class="font-nunito font-extrabold text-slate-700 text-base">Resident Records</h2>
      </div>
      <div class="flex items-center gap-2">
        {#if selected.size > 0}
          <button type="button" class="text-xs font-bold bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg transition-all active:scale-95">
            Approve {selected.size}
          </button>
          <button type="button" class="text-xs font-bold bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg transition-all active:scale-95">
            Reject {selected.size}
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
            <th class="px-3 py-3 text-left text-[0.65rem] font-extrabold tracking-widest text-slate-400 uppercase">Name</th>
            <th class="px-3 py-3 text-left text-[0.65rem] font-extrabold tracking-widest text-slate-400 uppercase">Category</th>
            <th class="px-3 py-3 text-left text-[0.65rem] font-extrabold tracking-widest text-slate-400 uppercase">Zone</th>
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
                <td class="px-3 py-4"><div class="h-3 bg-slate-200 rounded w-14"></div></td>
                <td class="px-3 py-4"><div class="h-5 bg-slate-100 rounded-full w-16"></div></td>
                <td class="px-3 py-4"><div class="h-7 bg-slate-200 rounded-lg w-20"></div></td>
              </tr>
            {/each}
          {:else if filtered.length === 0}
            <tr>
              <td colspan="6" class="px-5 py-14 text-center text-slate-400">
                <svg class="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p class="font-semibold text-sm">No residents found</p>
                <p class="text-xs mt-1">Try adjusting your filters</p>
              </td>
            </tr>
          {:else}
            {#each filtered as r (r.id)}
              <tr class="hover:bg-blue-50/40 transition-colors cursor-pointer"
                on:click={() => profileResident = r}>
                <td class="px-5 py-3.5" on:click|stopPropagation>
                  <input type="checkbox" checked={selected.has(r.id)} on:change={() => toggleSelect(r.id)}
                    class="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer" />
                </td>
                <td class="px-3 py-3.5">
                  <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold text-white shrink-0"
                      style="background:#0f2060;">{getInitials(r)}</div>
                    <span class="font-bold text-slate-700">{r.name ?? '—'}</span>
                  </div>
                </td>
                <td class="px-3 py-3.5">
                  <span class="text-xs font-bold px-2.5 py-1 rounded-full {categoryStyle[r.category] ?? 'bg-slate-100 text-slate-500'}">
                    {r.category}
                  </span>
                </td>
                <td class="px-3 py-3.5 text-slate-500 font-medium">{r.zone ?? '—'}</td>
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

<!-- ── Shared profile modal ── -->
<ResidentProfileModal
  resident={profileResident}
  on:close={() => profileResident = null}
  on:statusChange={handleStatusChange}
/>