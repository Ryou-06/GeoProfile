<!-- src/routes/admin/dashboard/+page.svelte -->
<script>
  import { onMount, onDestroy } from 'svelte';

  // ── Stats ──────────────────────────────────────────────
  let totalResidents = 0;
  let seniorCitizens = 0;
  let pwds           = 0;
  let singleParents  = 0;

  // ── Pending ────────────────────────────────────────────
  /** @type {any[]} */
  let pendingList    = [];
  let loading        = true;
  let loadError      = '';

  let filterCategory = 'All Residents';
  let filterSector   = 'All Sectors';

  const categories = ['All Residents', 'Senior Citizen', 'PWD', 'Single Parent'];
  const sectors    = ['All Sectors', 'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'];

  // ── Modal ──────────────────────────────────────────────
  let confirmModal = { open: false, action: '', resident: /** @type {any} */ (null) };

  // ── Unsub handles ──────────────────────────────────────
  /** @type {(() => void)[]} */
  let unsubs = [];

  // ── Only run Firebase on client (fixes SSR 500 error) ──
  onMount(async () => {
    try {
      const { db } = await import('$lib/firebase');
      const { collection, query, where, onSnapshot, limit } = await import('firebase/firestore');

      // Total approved
      unsubs.push(onSnapshot(
        query(collection(db, 'residents'), where('status', '==', 'approved')),
        snap => { totalResidents = snap.size; },
        err  => console.error('stats error:', err)
      ));

      // Senior citizens
      unsubs.push(onSnapshot(
        query(collection(db, 'residents'), where('status', '==', 'approved'), where('isSenior', '==', true)),
        snap => { seniorCitizens = snap.size; },
        err  => console.error('senior error:', err)
      ));

      // PWDs
      unsubs.push(onSnapshot(
        query(collection(db, 'residents'), where('status', '==', 'approved'), where('isPWD', '==', true)),
        snap => { pwds = snap.size; },
        err  => console.error('pwd error:', err)
      ));

      // Single parents
      unsubs.push(onSnapshot(
        query(collection(db, 'residents'), where('status', '==', 'approved'), where('isSingleParent', '==', true)),
        snap => { singleParents = snap.size; },
        err  => console.error('single error:', err)
      ));

      // Pending list
      unsubs.push(onSnapshot(
        query(collection(db, 'residents'), where('status', '==', 'pending'), limit(20)),
        snap => {
          pendingList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          loading = false;
        },
        err => {
          loadError = 'Could not load data. Check your Firestore rules.';
          loading   = false;
          console.error('pending error:', err);
        }
      ));

    } catch (e) {
      loadError = 'Firebase connection failed. Check your .env config.';
      loading   = false;
      console.error(e);
    }
  });

  onDestroy(() => unsubs.forEach(u => u()));

  // ── Filtered list ──────────────────────────────────────
  $: filtered = pendingList.filter(r => {
    const catMatch =
      filterCategory === 'All Residents'   ||
      (filterCategory === 'PWD'            && r.isPWD)          ||
      (filterCategory === 'Senior Citizen' && r.isSenior)       ||
      (filterCategory === 'Single Parent'  && r.isSingleParent);
    const secMatch =
      filterSector === 'All Sectors' || r.sector === filterSector;
    return catMatch && secMatch;
  });

  // ── Confirm modal ──────────────────────────────────────
  /** @param {'approve'|'reject'} action @param {any} resident */
  function openConfirm(action, resident) {
    confirmModal = { open: true, action, resident };
  }

  async function confirmAction() {
    if (!confirmModal.resident) return;
    try {
      const { db }          = await import('$lib/firebase');
      const { updateDoc, doc } = await import('firebase/firestore');
      const status = confirmModal.action === 'approve' ? 'approved' : 'rejected';
      await updateDoc(doc(db, 'residents', confirmModal.resident.id), { status });
    } catch (e) {
      console.error('Update error:', e);
    }
    confirmModal = { open: false, action: '', resident: null };
  }

  // ── Helpers ────────────────────────────────────────────
  /** @param {any} r */
  function getCategoryTags(r) {
    /** @type {{ label: string, color: string }[]} */
    const tags = [];
    if (r.isPWD)          tags.push({ label: 'PWD',           color: 'bg-amber-100 text-amber-700' });
    if (r.isSenior)       tags.push({ label: 'Senior',        color: 'bg-green-100 text-green-700' });
    if (r.isSingleParent) tags.push({ label: 'Single Parent', color: 'bg-purple-100 text-purple-700' });
    return tags;
  }

  /** @param {any} ts */
  function formatDate(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  }
</script>

<!-- ── Page ── -->
<div class="p-6 space-y-6 min-h-full bg-slate-100 font-inter">

  <!-- Header -->
  <div>
    <h1 class="font-nunito text-2xl font-extrabold text-slate-800">Admin Dashboard</h1>
    <p class="text-sm text-slate-500 mt-0.5">Barangay Pag-Asa — Overview</p>
  </div>

  <!-- Error banner -->
  {#if loadError}
    <div class="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-3 rounded-xl">
      <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      </svg>
      {loadError}
    </div>
  {/if}

  <!-- ── Stat Cards ── -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="rounded-2xl p-5 text-white shadow-md" style="background:#2563eb;">
      <p class="text-[0.65rem] font-bold tracking-widest uppercase opacity-80 mb-1">Total Residents</p>
      <p class="font-nunito text-3xl font-black">{totalResidents.toLocaleString()}</p>
    </div>
    <div class="rounded-2xl p-5 text-white shadow-md" style="background:#16a34a;">
      <p class="text-[0.65rem] font-bold tracking-widest uppercase opacity-80 mb-1">Senior Citizens</p>
      <p class="font-nunito text-3xl font-black">{seniorCitizens.toLocaleString()}</p>
    </div>
    <div class="rounded-2xl p-5 text-white shadow-md" style="background:#d97706;">
      <p class="text-[0.65rem] font-bold tracking-widest uppercase opacity-80 mb-1">PWDs</p>
      <p class="font-nunito text-3xl font-black">{pwds.toLocaleString()}</p>
    </div>
    <div class="rounded-2xl p-5 text-white shadow-md" style="background:#7c3aed;">
      <p class="text-[0.65rem] font-bold tracking-widest uppercase opacity-80 mb-1">Single Parents</p>
      <p class="font-nunito text-3xl font-black">{singleParents.toLocaleString()}</p>
    </div>
  </div>

  <!-- ── Pending Approvals ── -->
  <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

    <!-- Card header -->
    <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
      <div class="flex items-center gap-2">
        <span class="text-lg">⏳</span>
        <h2 class="font-nunito font-extrabold text-slate-700 text-base">Pending Approval</h2>
      </div>
      {#if pendingList.length > 0}
        <span class="text-xs font-bold bg-red-100 text-red-600 px-2.5 py-1 rounded-full">
          {pendingList.length} pending
        </span>
      {:else if !loading}
        <span class="text-xs font-bold bg-green-100 text-green-600 px-2.5 py-1 rounded-full">
          All clear
        </span>
      {/if}
    </div>

    <!-- Filters -->
    <div class="flex gap-2 px-5 py-3 border-b border-slate-100 flex-wrap">
      <select
        bind:value={filterCategory}
        class="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
      >
        {#each categories as cat (cat)}
          <option>{cat}</option>
        {/each}
      </select>
      <select
        bind:value={filterSector}
        class="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
      >
        {#each sectors as sec (sec)}
          <option>{sec}</option>
        {/each}
      </select>
    </div>

    <!-- List -->
    <div class="divide-y divide-slate-100">
      {#if loading}
        <!-- Skeleton loader -->
        {#each [1,2,3] as i (i)}
          <div class="flex items-center gap-3 px-5 py-4 animate-pulse">
            <div class="w-4 h-4 bg-slate-200 rounded"></div>
            <div class="flex-1 space-y-2">
              <div class="h-3 bg-slate-200 rounded w-1/3"></div>
              <div class="h-2 bg-slate-100 rounded w-1/4"></div>
            </div>
            <div class="h-6 w-16 bg-slate-200 rounded-full"></div>
            <div class="h-7 w-20 bg-slate-200 rounded-lg"></div>
            <div class="h-7 w-16 bg-slate-200 rounded-lg"></div>
          </div>
        {/each}
      {:else if filtered.length === 0}
        <div class="flex flex-col items-center justify-center py-12 text-slate-400">
          <svg class="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="text-sm font-semibold">No pending submissions</p>
          <p class="text-xs mt-1">All registrations have been reviewed</p>
        </div>
      {:else}
        {#each filtered as resident (resident.id)}
          <div class="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
            <input type="checkbox" class="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold text-slate-700 truncate">{resident.name ?? 'Unknown'}</p>
              <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span class="text-xs text-slate-400">{resident.sector ?? '—'}</span>
                {#each getCategoryTags(resident) as tag (tag.label)}
                  <span class="text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full {tag.color}">{tag.label}</span>
                {/each}
                <span class="text-xs text-slate-400">· {formatDate(resident.submittedAt)}</span>
              </div>
            </div>
            <span class="text-xs font-bold bg-amber-100 text-amber-600 px-2.5 py-1 rounded-full shrink-0">Pending</span>
            <div class="flex items-center gap-2 shrink-0">
              <button type="button" on:click={() => openConfirm('approve', resident)}
                class="text-xs font-bold bg-green-500 hover:bg-green-600 active:scale-95 text-white px-3 py-1.5 rounded-lg transition-all">
                Approve
              </button>
              <button type="button" on:click={() => openConfirm('reject', resident)}
                class="text-xs font-bold bg-red-500 hover:bg-red-600 active:scale-95 text-white px-3 py-1.5 rounded-lg transition-all">
                Reject
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Footer -->
    <div class="px-5 py-4 border-t border-slate-100">
      <button type="button"
        on:click={() => { window.location.href = '/admin/residents?filter=pending'; }}
        class="flex items-center gap-2 text-sm font-bold text-white px-4 py-2.5 rounded-xl transition-all active:scale-95"
        style="background:#2563eb;">
        Go to Approve / Reject
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </button>
    </div>
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
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        {:else}
          <svg class="w-7 h-7 text-red-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        {/if}
      </div>
      <h3 class="font-nunito font-extrabold text-slate-700 text-lg mb-1">
        {confirmModal.action === 'approve' ? 'Approve Resident?' : 'Reject Resident?'}
      </h3>
      <p class="text-sm text-slate-400 mb-5">
        {confirmModal.action === 'approve'
          ? 'This resident will be marked as approved and added to the records.'
          : 'This submission will be rejected and removed from the queue.'}
      </p>
      <div class="flex gap-3">
        <button type="button"
          on:click={() => (confirmModal = { open: false, action: '', resident: null })}
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