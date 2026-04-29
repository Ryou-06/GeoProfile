<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type FirestoreTimestamp = { toDate: () => Date };
  type AuditRecord = {
    id: string;
    name?: string;
    address?: string;
    householdType?: string;
    status?: string;
    submittedAt?: FirestoreTimestamp | Date | string | number;
    encodedBy?: string | null;
    qrId?: string;
  };

  let records: AuditRecord[] = [];
  let loading = true;
  let loadError = '';
  let unsub: (() => void) | null = null;

  function formatTime(value: AuditRecord['submittedAt']) {
    if (!value) return 'No timestamp';
    const date = typeof value === 'object' && value !== null && 'toDate' in value
      ? value.toDate()
      : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Invalid timestamp';
    return date.toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function statusTone(status = 'pending') {
    if (status === 'approved') return 'bg-emerald-100 text-emerald-700';
    if (status === 'declined') return 'bg-red-100 text-red-700';
    return 'bg-amber-100 text-amber-700';
  }

  onMount(async () => {
    try {
      const { db } = await import('$lib/firebase');
      const { collection, limit, onSnapshot, orderBy, query } = await import('firebase/firestore');

      unsub = onSnapshot(
        query(collection(db, 'residents'), orderBy('submittedAt', 'desc'), limit(50)),
        (snap) => {
          records = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          loading = false;
        },
        (error) => {
          console.error(error);
          loadError = 'Could not load audit records.';
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
  <div class="mb-5">
    <h1 class="font-nunito text-2xl font-extrabold text-slate-800">Audit</h1>
    <p class="mt-0.5 text-sm text-slate-500">Latest household record submissions and status trail</p>
  </div>

  {#if loadError}
    <div class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
      {loadError}
    </div>
  {/if}

  <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div class="border-b border-slate-100 px-5 py-4">
      <h2 class="font-nunito font-extrabold text-slate-700">Recent Activity</h2>
    </div>

    {#if loading}
      <div class="space-y-3 p-5">
        {#each [1, 2, 3, 4, 5] as item (item)}
          <div class="h-14 animate-pulse rounded-xl bg-slate-100"></div>
        {/each}
      </div>
    {:else if records.length === 0}
      <div class="px-5 py-14 text-center text-sm font-semibold text-slate-400">No audit records yet</div>
    {:else}
      <div class="divide-y divide-slate-100">
        {#each records as record (record.id)}
          <div class="flex flex-wrap items-center gap-3 px-5 py-4">
            <span class="rounded-full px-2.5 py-1 text-xs font-bold capitalize {statusTone(record.status)}">
              {record.status ?? 'pending'}
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-bold text-slate-700">{record.address || record.name || 'Household Record'}</p>
              <p class="mt-0.5 text-xs text-slate-400">
                {formatTime(record.submittedAt)} · {record.qrId || 'No QR'} · {record.encodedBy ? 'Staff encoded' : 'Self registered'}
              </p>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
