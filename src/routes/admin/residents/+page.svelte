<!-- src/routes/admin/residents/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  // ── Types ──────────────────────────────────────────────
  type Category = 'Regular' | 'PWD' | 'Senior' | 'Single Parent';
  type Status   = 'pending' | 'approved' | 'rejected';

  interface Resident {
    id: string;
    name: string;
    sector: string;
    zone: string;
    category: Category;
    isPWD: boolean;
    isSenior: boolean;
    isSingleParent: boolean;
    status: Status;
    lat?: number;
    lng?: number;
    submittedAt?: any;
    address?: string;
    age?: number;
    photoUrl?: string;
  }

  // ── State ──────────────────────────────────────────────
  let residents: Resident[] = [];
  let loading   = true;
  let loadError = '';

  let searchQuery    = '';
  let filterZone     = 'All Zones';
  let filterStatus   = 'All Status';
  let filterSector   = 'All Sectors';

  let selected      = new Set<string>();
  let selectAll     = false;

  let previewResident: Resident | null = null;
  let confirmModal: { open: boolean; action: 'approve' | 'reject'; resident: Resident | null } =
    { open: false, action: 'approve', resident: null };

  /** @type {(() => void)[]} */
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
            if (data.isPWD)          category = 'PWD';
            else if (data.isSenior)  category = 'Senior';
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
    } catch (e) {
      loadError = 'Firebase connection failed.';
      loading   = false;
    }
  });

  onDestroy(() => unsubs.forEach(u => u()));

  // ── Derived: filtered ──────────────────────────────────
  $: filtered = residents.filter(r => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || r.name?.toLowerCase().includes(q) || r.zone?.toLowerCase().includes(q) || r.category?.toLowerCase().includes(q);
    const matchZone   = filterZone   === 'All Zones'   || r.zone   === filterZone;
    const matchStatus = filterStatus === 'All Status'  || r.status === filterStatus.toLowerCase();
    const matchSector = filterSector === 'All Sectors' || r.sector === filterSector;
    return matchSearch && matchZone && matchStatus && matchSector;
  });

  // ── Select all ─────────────────────────────────────────
  function toggleSelectAll() {
    selectAll = !selectAll;
    if (selectAll) filtered.forEach(r => selected.add(r.id));
    else selected.clear();
    selected = selected; // trigger reactivity
  }

  function toggleSelect(id: string) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    selected = selected;
    selectAll = selected.size === filtered.length;
  }

  // ── Actions ────────────────────────────────────────────
  function openConfirm(action: 'approve' | 'reject', resident: Resident) {
    confirmModal = { open: true, action, resident };
  }

  async function confirmAction() {
    if (!confirmModal.resident) return;
    try {
      const { db }             = await import('$lib/firebase');
      const { updateDoc, doc } = await import('firebase/firestore');
      const status = confirmModal.action === 'approve' ? 'approved' : 'rejected';
      await updateDoc(doc(db, 'residents', confirmModal.resident.id), { status });
      if (previewResident?.id === confirmModal.resident.id) previewResident = null;
    } catch (e) { console.error(e); }
    confirmModal = { open: false, action: 'approve', resident: null };
  }

  // ── Helpers ────────────────────────────────────────────
  function getInitials(name: string) {
    return name?.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() ?? '??';
  }

  function formatDate(ts: any) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const categoryStyle: Record<Category, string> = {
    'PWD':          'bg-indigo-100 text-indigo-700',
    'Senior':       'bg-emerald-100 text-emerald-700',
    'Single Parent':'bg-violet-100 text-violet-700',
    'Regular':      'bg-slate-100 text-slate-500',
  };

  const statusStyle: Record<Status, string> = {
    pending:  'bg-amber-100 text-amber-600',
    approved: 'bg-green-100 text-green-600',
    rejected: 'bg-red-100 text-red-500',
  };
</script>

<!-- ─────────────────────────────────────────── PAGE ──── -->
<div class="min-h-screen bg-slate-100 font-inter p-6 flex flex-col gap-5">

  <!-- Header -->
  <div>
    <h1 class="font-nunito text-2xl font-extrabold text-slate-800">Approve / Reject Residents</h1>
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

  <!-- Search + filter row -->
  <div class="flex gap-3 flex-wrap items-center">
    <!-- Search -->
    <div class="relative flex-1 min-w-55 max-w-lg">
      <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/>
      </svg>
      <input
        bind:value={searchQuery}
        type="text"
        placeholder="Search by name, zone, or category..."
        class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm"
      />
    </div>

    <!-- Filter selects -->
    <select bind:value={filterStatus}
      class="text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm cursor-pointer">
      {#each statuses as s}<option>{s}</option>{/each}
    </select>

    <select bind:value={filterSector}
      class="text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm cursor-pointer">
      {#each sectors as s}<option>{s}</option>{/each}
    </select>

    <!-- Export button -->
    <button type="button"
      class="ml-auto flex items-center gap-1.5 text-sm font-bold text-white px-4 py-2.5 rounded-xl transition-all active:scale-95 shadow-sm"
      style="background:#2563eb;">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 8l-3-3m3 3l3-3"/>
      </svg>
      Export
    </button>
  </div>

  <!-- Zone tab pills -->
  <div class="flex gap-2 flex-wrap">
    {#each zones as z}
      <button type="button"
        on:click={() => filterZone = z}
        class="text-sm font-bold px-4 py-1.5 rounded-full border transition-all
          {filterZone === z
            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'}">
        {z}
      </button>
    {/each}
  </div>

  <!-- Main content: table + preview panel -->
  <div class="flex gap-4 items-start">

    <!-- ── Table card ── -->
    <div class="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

      <!-- Card header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z"/>
          </svg>
          <h2 class="font-nunito font-extrabold text-slate-700 text-base">Resident Records</h2>
        </div>
        <div class="flex items-center gap-2">
          {#if selected.size > 0}
            <button type="button"
              on:click={() => { /* bulk approve */ }}
              class="text-xs font-bold bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg transition-all active:scale-95">
              Approve {selected.size}
            </button>
            <button type="button"
              on:click={() => { /* bulk reject */ }}
              class="text-xs font-bold bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg transition-all active:scale-95">
              Reject {selected.size}
            </button>
          {/if}
          <span class="text-xs text-slate-400 font-semibold">{filtered.length} records</span>
        </div>
      </div>

      <!-- Table -->
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
              {#each [1,2,3,4] as i (i)}
                <tr class="animate-pulse">
                  <td class="px-5 py-4"><div class="w-4 h-4 bg-slate-200 rounded"></div></td>
                  <td class="px-3 py-4"><div class="h-3 bg-slate-200 rounded w-28"></div></td>
                  <td class="px-3 py-4"><div class="h-5 bg-slate-100 rounded-full w-16"></div></td>
                  <td class="px-3 py-4"><div class="h-3 bg-slate-200 rounded w-12"></div></td>
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
                <tr
                  class="hover:bg-blue-50/40 transition-colors cursor-pointer {previewResident?.id === r.id ? 'bg-blue-50' : ''}"
                  on:click={() => previewResident = r}
                >
                  <!-- Checkbox -->
                  <td class="px-5 py-3.5" on:click|stopPropagation>
                    <input type="checkbox"
                      checked={selected.has(r.id)}
                      on:change={() => toggleSelect(r.id)}
                      class="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer" />
                  </td>

                  <!-- Name -->
                  <td class="px-3 py-3.5">
                    <span class="font-bold text-slate-700">{r.name ?? '—'}</span>
                  </td>

                  <!-- Category badge -->
                  <td class="px-3 py-3.5">
                    <span class="text-xs font-bold px-2.5 py-1 rounded-full {categoryStyle[r.category] ?? 'bg-slate-100 text-slate-500'}">
                      {r.category}
                    </span>
                  </td>

                  <!-- Zone -->
                  <td class="px-3 py-3.5 text-slate-500 font-medium">{r.zone ?? '—'}</td>

                  <!-- Status -->
                  <td class="px-3 py-3.5">
                    <span class="text-xs font-bold px-2.5 py-1 rounded-full {statusStyle[r.status] ?? 'bg-slate-100 text-slate-500'} capitalize">
                      {r.status}
                    </span>
                  </td>

                  <!-- Action -->
                  <td class="px-3 py-3.5" on:click|stopPropagation>
                    {#if r.status === 'pending'}
                      <div class="flex items-center gap-1.5">
                        <button type="button"
                          on:click={() => openConfirm('approve', r)}
                          class="text-xs font-bold bg-green-500 hover:bg-green-600 active:scale-95 text-white px-3 py-1.5 rounded-lg transition-all">
                          Approve
                        </button>
                        <button type="button"
                          on:click={() => openConfirm('reject', r)}
                          class="text-xs font-bold bg-red-500 hover:bg-red-600 active:scale-95 text-white px-3 py-1.5 rounded-lg transition-all">
                          Reject
                        </button>
                      </div>
                    {:else}
                      <button type="button"
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

    <!-- ── Quick Preview Panel ── -->
    {#if previewResident}
      <div class="w-64 shrink-0 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div class="px-4 py-3 border-b border-slate-100">
          <p class="text-[0.65rem] font-extrabold tracking-widest text-slate-400 uppercase">Quick Preview</p>
        </div>

        <div class="p-4 flex flex-col items-center gap-3">
          <!-- Avatar -->
          <div class="w-14 h-14 rounded-full flex items-center justify-center font-nunito font-black text-xl text-white shadow-md"
            style="background:#2563eb;">
            {getInitials(previewResident.name ?? '??')}
          </div>

          <!-- Name + zone + category -->
          <div class="text-center">
            <p class="font-nunito font-extrabold text-slate-800 text-base leading-tight">{previewResident.name}</p>
            <p class="text-xs text-slate-400 mt-0.5">
              {previewResident.zone ?? '—'} ·
              <span class="font-semibold text-slate-500">{previewResident.category}</span>
            </p>
          </div>

          <!-- Status badge -->
          <span class="text-xs font-bold px-3 py-1 rounded-full {statusStyle[previewResident.status]} capitalize">
            {previewResident.status}
          </span>

          <!-- Info rows -->
          <div class="w-full space-y-2 text-sm">
            {#if previewResident.lat && previewResident.lng}
              <div class="flex items-center gap-2 text-slate-500">
                <svg class="w-3.5 h-3.5 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z"/>
                </svg>
                <span class="text-xs font-mono">{previewResident.lat.toFixed(4)}°N {previewResident.lng.toFixed(4)}°E</span>
              </div>
            {/if}
            <div class="flex items-center gap-2 text-slate-500">
              <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
              </svg>
              <span class="text-xs">{formatDate(previewResident.submittedAt)}</span>
            </div>
          </div>

          <!-- View Full Profile btn -->
          <button type="button"
            on:click={() => window.location.href = `/admin/residents/${previewResident?.id}`}
            class="w-full mt-1 flex items-center justify-center gap-1.5 text-sm font-bold text-white py-2.5 rounded-xl transition-all active:scale-95"
            style="background:#2563eb;">
            View Full Profile
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
            </svg>
          </button>

          <!-- Quick actions (if pending) -->
          {#if previewResident.status === 'pending'}
            <div class="flex w-full gap-2">
              <button type="button"
                on:click={() => { if(previewResident) openConfirm('approve', previewResident); }}
                class="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-green-500 hover:bg-green-600 transition-all active:scale-95">
                Approve
              </button>
              <button type="button"
                on:click={() => { if(previewResident) openConfirm('reject', previewResident); }}
                class="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-red-500 hover:bg-red-600 transition-all active:scale-95">
                Reject
              </button>
            </div>
          {/if}
        </div>

        <!-- Close button -->
        <button type="button"
          on:click={() => previewResident = null}
          class="mx-4 mb-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all">
          Close preview
        </button>
      </div>
    {/if}

  </div>
</div>

<!-- ── Confirm Modal ── -->
{#if confirmModal.open}
  <div class="fixed inset-0 z-50 flex items-center justify-center px-4"
    style="background:rgba(15,32,96,0.6);backdrop-filter:blur(4px);">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center">
      <div class="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4
                  {confirmModal.action === 'approve' ? 'bg-green-100' : 'bg-red-100'}">
        {#if confirmModal.action === 'approve'}
          <svg class="w-7 h-7 text-green-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
        {:else}
          <svg class="w-7 h-7 text-red-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        {/if}
      </div>
      <h3 class="font-nunito font-extrabold text-slate-700 text-lg mb-1">
        {confirmModal.action === 'approve' ? 'Approve Resident?' : 'Reject Resident?'}
      </h3>
      <p class="text-sm text-slate-400 mb-1 font-semibold">{confirmModal.resident?.name}</p>
      <p class="text-sm text-slate-400 mb-5">
        {confirmModal.action === 'approve'
          ? 'This resident will be marked as approved and added to the records.'
          : 'This submission will be rejected and removed from the queue.'}
      </p>
      <div class="flex gap-3">
        <button type="button"
          on:click={() => (confirmModal = { open: false, action: 'approve', resident: null })}
          class="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
          Cancel
        </button>
        <button type="button" on:click={confirmAction}
          class="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors
                 {confirmModal.action === 'approve' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}">
          {confirmModal.action === 'approve' ? 'Yes, Approve' : 'Yes, Reject'}
        </button>
      </div>
    </div>
  </div>
{/if}