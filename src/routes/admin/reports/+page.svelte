<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type ReportRecord = {
    id: string;
    address?: string;
    householdType?: string;
    status?: string;
    isPWD?: boolean;
    isSenior?: boolean;
    isSingleParent?: boolean;
    sex?: string;
    gender?: string;
  };

  let records: ReportRecord[] = [];
  let loading = true;
  let loadError = '';
  let unsub: (() => void) | null = null;

  $: approved = records.filter((record) => record.status === 'approved');
  $: pending = records.filter((record) => record.status === 'pending').length;
  $: declined = records.filter((record) => record.status === 'declined').length;
  $: pwd = approved.filter((record) => record.isPWD).length;
  $: senior = approved.filter((record) => record.isSenior).length;
  $: soloParent = approved.filter((record) => record.isSingleParent).length;
  $: male = approved.filter((record) => normalizeGender(record) === 'male').length;
  $: female = approved.filter((record) => normalizeGender(record) === 'female').length;

  function normalizeGender(record: ReportRecord) {
    const value = (record.sex ?? record.gender ?? '').trim().toLowerCase();
    if (value === 'male' || value === 'm') return 'male';
    if (value === 'female' || value === 'f') return 'female';
    return 'other';
  }

  function downloadCsv() {
    const header = ['Address', 'Type', 'Status', 'PWD', 'Senior', 'Solo Parent', 'Gender'];
    const rows = records.map((record) => [
      record.address ?? '',
      record.householdType ?? '',
      record.status ?? '',
      record.isPWD ? 'Yes' : 'No',
      record.isSenior ? 'Yes' : 'No',
      record.isSingleParent ? 'Yes' : 'No',
      record.sex ?? record.gender ?? ''
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'household-report.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  onMount(async () => {
    try {
      const { db } = await import('$lib/firebase');
      const { collection, onSnapshot, orderBy, query } = await import('firebase/firestore');

      unsub = onSnapshot(
        query(collection(db, 'residents'), orderBy('submittedAt', 'desc')),
        (snap) => {
          records = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          loading = false;
        },
        (error) => {
          console.error(error);
          loadError = 'Could not load report records.';
          loading = false;
        }
      );
    } catch (error) {
      console.error(error);
      loadError = 'Firebase connection failed.';
      loading = false;
    }
  });

  onDestroy(() => unsub?.());
</script>

<div class="min-h-screen bg-slate-100 p-6 font-inter">
  <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 class="font-nunito text-2xl font-extrabold text-slate-800">Report</h1>
      <p class="mt-0.5 text-sm text-slate-500">Household profiling summary and export</p>
    </div>
    <button type="button" on:click={downloadCsv} disabled={loading || records.length === 0}
      class="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
      Export CSV
    </button>
  </div>

  {#if loadError}
    <div class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
      {loadError}
    </div>
  {/if}

  <div class="grid gap-3 md:grid-cols-3">
    <div class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p class="text-xs font-bold uppercase tracking-widest text-slate-400">Approved</p>
      <p class="mt-2 font-nunito text-3xl font-extrabold text-slate-800">{approved.length.toLocaleString()}</p>
    </div>
    <div class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p class="text-xs font-bold uppercase tracking-widest text-slate-400">Pending</p>
      <p class="mt-2 font-nunito text-3xl font-extrabold text-amber-600">{pending.toLocaleString()}</p>
    </div>
    <div class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p class="text-xs font-bold uppercase tracking-widest text-slate-400">Declined</p>
      <p class="mt-2 font-nunito text-3xl font-extrabold text-red-600">{declined.toLocaleString()}</p>
    </div>
  </div>

  <div class="mt-3 grid gap-3 md:grid-cols-2">
    <div class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 class="mb-4 font-nunito font-extrabold text-slate-700">Special Sectors</h2>
      <div class="space-y-3 text-sm">
        <div class="flex justify-between"><span class="font-semibold text-slate-500">PWD</span><span class="font-bold text-slate-800">{pwd}</span></div>
        <div class="flex justify-between"><span class="font-semibold text-slate-500">Senior Citizen</span><span class="font-bold text-slate-800">{senior}</span></div>
        <div class="flex justify-between"><span class="font-semibold text-slate-500">Solo Parent</span><span class="font-bold text-slate-800">{soloParent}</span></div>
      </div>
    </div>

    <div class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 class="mb-4 font-nunito font-extrabold text-slate-700">Gender</h2>
      <div class="space-y-3 text-sm">
        <div class="flex justify-between"><span class="font-semibold text-slate-500">Male</span><span class="font-bold text-slate-800">{male}</span></div>
        <div class="flex justify-between"><span class="font-semibold text-slate-500">Female</span><span class="font-bold text-slate-800">{female}</span></div>
      </div>
    </div>
  </div>
</div>
