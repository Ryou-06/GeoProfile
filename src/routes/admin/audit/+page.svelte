<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  type FirestoreTimestamp = { toDate: () => Date };
  type AuditChange = { oldValue: unknown; newValue: unknown };
  type AuditRecord = {
    id: string;
    action?: string;
    module?: string;
    description?: string;
    targetId?: string | null;
    targetLabel?: string | null;
    status?: string;
    severity?: string;
    actorName?: string;
    actorRole?: string;
    changes?: Record<string, AuditChange> | null;
    metadata?: Record<string, unknown> | null;
    createdAt?: FirestoreTimestamp | Date | string | number;
  };

  let records: AuditRecord[] = [];
  let loading = true;
  let loadError = '';
  let searchQuery = '';
  let moduleFilter = 'All Modules';
  let unsub: (() => void) | null = null;

  const modules = ['All Modules', 'Authentication', 'Residents', 'Households', 'Staff Management', 'Reports'];

  $: filtered = records.filter((record) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      record.description?.toLowerCase().includes(q) ||
      record.actorName?.toLowerCase().includes(q) ||
      record.targetLabel?.toLowerCase().includes(q) ||
      record.action?.toLowerCase().includes(q);
    const matchesModule = moduleFilter === 'All Modules' || record.module === moduleFilter;
    return matchesSearch && matchesModule;
  });

  function formatTime(value: AuditRecord['createdAt']) {
    if (!value) return 'No timestamp';
    const date =
      typeof value === 'object' && value !== null && 'toDate' in value ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Invalid timestamp';
    return date.toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function actionTone(action = '') {
    if (action.includes('delete') || action.includes('decline') || action.includes('failed')) {
      return 'bg-rose-100 text-rose-700';
    }
    if (action.includes('create') || action.includes('approve') || action.includes('login')) {
      return 'bg-emerald-100 text-emerald-700';
    }
    if (action.includes('update') || action.includes('edit') || action.includes('export')) return 'bg-blue-100 text-blue-700';
    return 'bg-slate-100 text-slate-600';
  }

  function changeSummary(changes: AuditRecord['changes']) {
    if (!changes) return [];
    return Object.entries(changes).slice(0, 4);
  }

  function displayValue(value: unknown) {
    if (value === null || value === undefined || value === '') return 'blank';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  onMount(async () => {
    try {
      const { db } = await import('$lib/firebase');
      const { collection, limit, onSnapshot, orderBy, query } = await import('firebase/firestore');

      unsub = onSnapshot(
        query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(100)),
        (snap) => {
          records = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          loading = false;
        },
        (error) => {
          console.error(error);
          loadError = 'Could not load audit trail records.';
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

<div class="min-h-screen bg-slate-100 p-3 font-inter sm:p-6">
  <div class="mb-5">
    <h1 class="font-nunito text-2xl font-extrabold text-slate-800">Audit Trails</h1>
    <p class="mt-0.5 text-sm text-slate-500">Transaction history of important system actions</p>
  </div>

  {#if loadError}
    <div class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
      {loadError}
    </div>
  {/if}

  <div class="mb-4 flex flex-wrap items-center gap-3">
    <div class="relative min-w-0 flex-1 basis-full sm:basis-64 max-w-xl">
      <svg class="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8" /><path stroke-linecap="round" d="M21 21l-4.35-4.35" />
      </svg>
      <input
        bind:value={searchQuery}
        type="text"
        placeholder="Search action, user, or record..."
        class="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 shadow-sm outline-none transition-all placeholder-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
    </div>
    <select
      bind:value={moduleFilter}
      class="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 shadow-sm outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:w-auto sm:min-w-44"
    >
      {#each modules as module (module)}
        <option>{module}</option>
      {/each}
    </select>
    <span class="text-xs font-bold text-slate-400">{filtered.length} events</span>
  </div>

  <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div class="flex flex-col gap-1 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <h2 class="font-nunito font-extrabold text-slate-700">Recent Transactions</h2>
      <span class="text-xs font-semibold text-slate-400">Newest first</span>
    </div>

    {#if loading}
      <div class="space-y-3 p-5">
        {#each [1, 2, 3, 4, 5] as item (item)}
          <div class="h-20 animate-pulse rounded-xl bg-slate-100"></div>
        {/each}
      </div>
    {:else if filtered.length === 0}
      <div class="px-5 py-14 text-center text-sm font-semibold text-slate-400">
        No audit trail records yet
      </div>
    {:else}
      <div class="divide-y divide-slate-100">
        {#each filtered as record (record.id)}
          <article class="px-4 py-4 sm:px-5">
            <div class="flex flex-wrap items-start gap-3">
              <span class="rounded-full px-2.5 py-1 text-xs font-bold capitalize {actionTone(record.action)}">
                {(record.action ?? 'event').replace(/_/g, ' ')}
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p class="text-sm font-bold text-slate-800">{record.description || 'System event'}</p>
                  <span class="text-xs font-semibold text-slate-400">{record.module || 'System'}</span>
                </div>
                <p class="mt-0.5 text-xs text-slate-400">
                  {formatTime(record.createdAt)} · {record.actorName || 'Unknown user'} · {record.actorRole || 'user'}
                </p>

                {#if record.targetLabel || record.targetId}
                  <p class="mt-2 text-xs font-semibold text-slate-500">
                    Record: {record.targetLabel || record.targetId}
                  </p>
                {/if}

                {#if changeSummary(record.changes).length}
                  <div class="mt-3 grid gap-2 md:grid-cols-2">
                    {#each changeSummary(record.changes) as [field, change] (field)}
                      <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p class="text-[0.65rem] font-extrabold uppercase tracking-wider text-slate-400">{field}</p>
                        <p class="mt-1 break-words text-xs font-semibold text-slate-600">
                          {displayValue(change.oldValue)} -> {displayValue(change.newValue)}
                        </p>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </div>
</div>
