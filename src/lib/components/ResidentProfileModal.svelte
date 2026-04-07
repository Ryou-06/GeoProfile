<!-- src/lib/components/ResidentProfileModal.svelte -->
<!-- Shared profile modal — used by both /admin/residents and /admin/mapView -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  // ── Props ──────────────────────────────────────────────
  interface Resident {
    id: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    name?: string;
    age?: number;
    sex?: string;
    civilStatus?: string;
    contactNo?: string;
    address?: string;
    houseNo?: string;
    street?: string;
    purok?: string;
    zone?: string;
    lat?: number;
    lng?: number;
    gpsAccuracy?: number;
    photoUrl?: string;
    birthdate?: string;
    status?: 'pending' | 'approved' | 'declined';
    isPWD?: boolean;
    pwdType?: string;
    pwdIdProof?: string;
    isSenior?: boolean;
    seniorIdProof?: string;
    isSingleParent?: boolean;
    singleParentIdProof?: string;
    submittedAt?: { toDate(): Date } | Date | string;
    encodedBy?: string;
  }

  /** The resident object to display. Pass null to hide the modal. */
  export let resident: Resident | null = null;

  const dispatch = createEventDispatcher<{
    close: void;
    statusChange: { id: string; status: 'approved' | 'declined' };
  }>();

  // ── Photo lightbox ─────────────────────────────────────
  let showPhotoLightbox = false;
  let lightboxSrc = '';
  let lightboxLabel = '';

  // ── Confirm modal ──────────────────────────────────────
  let confirmModal: {
    open: boolean;
    action: 'approve' | 'decline';
  } = { open: false, action: 'approve' };

  // ── Reactive: close lightbox when resident changes ─────
  $: if (resident) { showPhotoLightbox = false; lightboxSrc = ''; lightboxLabel = ''; }

  // ── Maps URLs ──────────────────────────────────────────
  $: mapSrc = (resident?.lat && resident?.lng)
    ? `https://maps.google.com/maps?q=${resident.lat},${resident.lng}&z=17&output=embed`
    : null;

  // ── Proof images list (only sectors resident belongs to) ──
  $: proofImages = (() => {
    if (!resident) return [];
    const list: { label: string; src: string; color: string; icon: string }[] = [];
    if (resident.isPWD)
      list.push({
        label: `PWD ID Proof${resident.pwdType ? ` — ${resident.pwdType}` : ''}`,
        src: resident.pwdIdProof ?? '',
        color: 'amber',
        icon: '♿',
      });
    if (resident.isSenior)
      list.push({
        label: 'Senior Citizen ID Proof',
        src: resident.seniorIdProof ?? '',
        color: 'emerald',
        icon: '🧓',
      });
    if (resident.isSingleParent)
      list.push({
        label: 'Single Parent ID Proof',
        src: resident.singleParentIdProof ?? '',
        color: 'violet',
        icon: '👤',
      });
    return list;
  })();

  // ── Keyboard handler ───────────────────────────────────
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (showPhotoLightbox) { showPhotoLightbox = false; lightboxSrc = ''; lightboxLabel = ''; return; }
      if (confirmModal.open) { confirmModal = { open: false, action: 'approve' }; return; }
      dispatch('close');
    }
  }

  // ── Open lightbox for any image ────────────────────────
  function openLightbox(src: string, label: string) {
    lightboxSrc = src;
    lightboxLabel = label;
    showPhotoLightbox = true;
  }

  // ── Approve / Decline ───────────────────────────────────
  function openConfirm(action: 'approve' | 'decline') {
    confirmModal = { open: true, action };
  }

  async function confirmAction() {
    if (!resident) return;
    try {
      const { db }             = await import('$lib/firebase');
      const { updateDoc, doc } = await import('firebase/firestore');
      const newStatus = confirmModal.action === 'approve' ? 'approved' : 'declined';
      await updateDoc(doc(db, 'residents', resident.id), { status: newStatus });
      // Update local copy so badge reflects change immediately
      resident = { ...resident, status: newStatus };
      dispatch('statusChange', { id: resident.id, status: newStatus });
    } catch (e) { console.error(e); }
    confirmModal = { open: false, action: 'approve' };
  }

  // ── Helpers ────────────────────────────────────────────
  function getInitials(r: Resident) {
    if (r?.firstName && r?.lastName) return `${r.firstName[0]}${r.lastName[0]}`.toUpperCase();
    return (r?.name ?? '??').split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase();
  }

  function formatDate(ts: { toDate(): Date } | Date | string | null | undefined) {
    if (!ts) return '—';
    const d = ts && typeof ts === 'object' && 'toDate' in ts ? ts.toDate() : new Date(ts as string | Date);
    return d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function buildAddress(r: Resident) {
    if (r?.address) return r.address;
    return [r?.houseNo, r?.street, r?.purok, 'Barangay Pag-Asa', 'Olongapo City', 'Zambales']
      .filter(Boolean).join(', ');
  }

  function getCategories(r: Resident) {
    const cats: { label: string; color: string }[] = [];
    if (r?.isPWD)          cats.push({ label: 'PWD',              color: 'amber'   });
    if (r?.isSenior)       cats.push({ label: 'Senior Citizen',   color: 'emerald' });
    if (r?.isSingleParent) cats.push({ label: 'Single Parent',    color: 'violet'  });
    if (!cats.length)      cats.push({ label: 'Regular Resident', color: 'blue'    });
    return cats;
  }

  const catColors: Record<string, string> = {
    amber:   'bg-amber-100 text-amber-700 border border-amber-200',
    emerald: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    violet:  'bg-violet-100 text-violet-700 border border-violet-200',
    blue:    'bg-blue-100 text-blue-700 border border-blue-200',
  };

  const proofBorder: Record<string, string> = {
    amber:   'border-amber-200 bg-amber-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    violet:  'border-violet-200 bg-violet-50',
  };

  const proofLabel: Record<string, string> = {
    amber:   'text-amber-700 bg-amber-100 border-amber-200',
    emerald: 'text-emerald-700 bg-emerald-100 border-emerald-200',
    violet:  'text-violet-700 bg-violet-100 border-violet-200',
  };

  const statusHero: Record<string, string> = {
    pending:  'bg-amber-400/20 text-amber-200 border border-amber-300/30',
    approved: 'bg-green-400/20 text-green-200 border border-green-300/30',
    declined: 'bg-red-400/20 text-red-200 border border-red-300/30',
  };
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- ══════════════════ PROFILE MODAL ══════════════════════════ -->
{#if resident}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
    on:click={() => dispatch('close')}></div>

  <!-- Modal -->
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
    <div class="w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto"
      style="max-height: 92vh;">

      <!-- Modal header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full bg-blue-600"></div>
          <p class="text-[0.65rem] font-extrabold tracking-widest text-slate-400 uppercase">Resident Profile</p>
        </div>
        <button type="button" on:click={() => dispatch('close')}
          class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-all">
          <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Body: two columns -->
      <div class="flex overflow-hidden flex-1 min-h-0">

        <!-- ── LEFT: scrollable details ── -->
        <div class="w-[52%] flex flex-col overflow-y-auto">

          <!-- Hero card -->
          <div class="shrink-0 p-6" style="background: linear-gradient(135deg, #0f2060 0%, #1a4fa0 100%);">
            <div class="flex items-start gap-4">
              <div class="w-16 h-16 rounded-2xl bg-white/20 border-2 border-white/30 flex items-center justify-center text-white font-extrabold text-xl shrink-0 shadow-inner">
                {getInitials(resident)}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <h2 class="text-white font-extrabold text-xl leading-tight">
                      {resident.firstName ?? ''} {resident.lastName ?? resident.name}
                    </h2>
                    {#if resident.middleName}
                      <p class="text-white/50 text-xs mt-0.5">{resident.middleName}</p>
                    {/if}
                  </div>
                  <span class="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full shrink-0 {statusHero[resident.status ?? 'pending']}">
                    {#if resident.status === 'approved'}✓{:else if resident.status === 'declined'}✗{:else}⏳{/if}
                    {(resident.status ?? 'pending').charAt(0).toUpperCase() + (resident.status ?? 'pending').slice(1)}
                  </span>
                </div>
                <div class="flex flex-wrap gap-1.5 mt-3">
                  {#each getCategories(resident) as cat (cat.label)}
                    <span class="text-[0.65rem] font-bold px-2.5 py-0.5 rounded-full bg-white/20 text-white border border-white/20">
                      {cat.label}
                    </span>
                  {/each}
                  {#if resident.isPWD && resident.pwdType}
                    <span class="text-[0.65rem] font-bold px-2.5 py-0.5 rounded-full bg-white/10 text-white/70 border border-white/10">
                      {resident.pwdType}
                    </span>
                  {/if}
                </div>
                <p class="text-white/50 text-xs mt-2">
                  {[resident.zone, resident.purok].filter(Boolean).join(' — ')}
                </p>
              </div>
            </div>

            <!-- Quick stats -->
            <div class="grid grid-cols-3 divide-x divide-white/10 mt-5 pt-4 border-t border-white/10">
              <div class="text-center px-2">
                <p class="text-white/40 text-[0.6rem] font-bold uppercase tracking-widest">Age</p>
                <p class="text-white font-extrabold text-lg leading-tight">{resident.age ?? '—'}</p>
              </div>
              <div class="text-center px-2">
                <p class="text-white/40 text-[0.6rem] font-bold uppercase tracking-widest">Sex</p>
                <p class="text-white font-extrabold text-base leading-tight">{resident.sex ?? '—'}</p>
              </div>
              <div class="text-center px-2">
                <p class="text-white/40 text-[0.6rem] font-bold uppercase tracking-widest">Civil Status</p>
                <p class="text-white font-extrabold text-sm leading-tight">{resident.civilStatus ?? '—'}</p>
              </div>
            </div>
          </div>

          <!-- Details list -->
          <div class="divide-y divide-slate-100 flex-1">

            <!-- Age -->
            <div class="flex items-center gap-4 px-6 py-4">
              <div class="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
              </div>
              <div>
                <p class="text-[0.6rem] font-bold uppercase tracking-widest text-slate-400">Age</p>
                <p class="text-sm font-bold text-slate-700">{resident.age} years old</p>
                {#if resident.birthdate}<p class="text-xs text-slate-400">{resident.birthdate}</p>{/if}
              </div>
            </div>

            <!-- Contact -->
            {#if resident.contactNo}
              <div class="flex items-center gap-4 px-6 py-4">
                <div class="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                  <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498A1 1 0 0121 15.72V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                  </svg>
                </div>
                <div>
                  <p class="text-[0.6rem] font-bold uppercase tracking-widest text-slate-400">Contact Number</p>
                  <p class="text-sm font-bold text-slate-700">{resident.contactNo}</p>
                </div>
              </div>
            {/if}

            <!-- Address -->
            <div class="flex items-start gap-4 px-6 py-4">
              <div class="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center shrink-0 mt-0.5">
                <svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[0.6rem] font-bold uppercase tracking-widest text-slate-400">Address</p>
                <p class="text-sm font-bold text-slate-700 leading-snug">{buildAddress(resident)}</p>
              </div>
            </div>

            <!-- GPS -->
            <div class="flex items-center gap-4 px-6 py-4">
              <div class="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                <svg class="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              </div>
              <div class="flex-1">
                <p class="text-[0.6rem] font-bold uppercase tracking-widest text-slate-400">GPS Coordinates</p>
                {#if resident.lat && resident.lng}
                  <p class="text-sm font-bold text-slate-700 font-mono">
                    {resident.lat.toFixed(4)}°N,  {resident.lng.toFixed(4)}°E
                  </p>
                  {#if resident.gpsAccuracy}
                    <p class="text-xs text-slate-400">±{Math.round(resident.gpsAccuracy)}m accuracy</p>
                  {/if}
                {:else}
                  <p class="text-xs text-slate-300 italic font-semibold">Not captured</p>
                {/if}
              </div>
            </div>

            <!-- Category -->
            <div class="flex items-center gap-4 px-6 py-4">
              <div class="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                <svg class="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
                </svg>
              </div>
              <div>
                <p class="text-[0.6rem] font-bold uppercase tracking-widest text-slate-400">Category</p>
                <div class="flex flex-wrap gap-1.5 mt-1">
                  {#each getCategories(resident) as cat (cat.label)}
                    <span class="text-xs font-bold px-2.5 py-0.5 rounded-full {catColors[cat.color]}">{cat.label}</span>
                  {/each}
                </div>
                {#if resident.isPWD && resident.pwdType}
                  <p class="text-xs text-slate-400 mt-1">Type: {resident.pwdType}</p>
                {/if}
              </div>
            </div>

            <!-- Date Registered -->
            <div class="flex items-center gap-4 px-6 py-4">
              <div class="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                </svg>
              </div>
              <div>
                <p class="text-[0.6rem] font-bold uppercase tracking-widest text-slate-400">Date Registered</p>
                <p class="text-sm font-bold text-slate-700">{formatDate(resident.submittedAt)}</p>
              </div>
            </div>

            <!-- Submitted By -->
            <div class="flex items-center gap-4 px-6 py-4">
              <div class="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
              </div>
              <div>
                <p class="text-[0.6rem] font-bold uppercase tracking-widest text-slate-400">Submitted By</p>
                <p class="text-sm font-bold text-slate-700">
                  {#if resident.encodedBy}
                    {resident.encodedBy} (Staff)
                  {:else}
                    <span class="text-slate-400 font-normal italic">Self-registered via QR</span>
                  {/if}
                </p>
              </div>
            </div>

            <!-- House Photo -->
            <div class="px-6 py-4">
              <p class="text-[0.6rem] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                House Photo
              </p>
              {#if resident.photoUrl}
                <button type="button"
                  on:click={() => openLightbox(resident!.photoUrl ?? '', `🏠 ${resident!.firstName ?? ''} ${resident!.lastName ?? resident!.name} — House Photo`)}
                  class="w-full relative rounded-xl overflow-hidden border border-slate-200 group cursor-zoom-in">
                  <img src={resident.photoUrl} alt="House" class="w-full h-44 object-cover group-hover:brightness-90 transition-all" />
                  <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                    <span class="bg-black/50 text-white text-xs font-bold px-4 py-2 rounded-full backdrop-blur-sm">🔍 Tap to enlarge</span>
                  </div>
                  <div class="absolute bottom-2 left-2 bg-black/50 text-white text-[0.65rem] font-bold px-2 py-1 rounded-lg">
                    📍 {resident.address?.split(',')[0] ?? 'House Photo'}
                  </div>
                </button>
              {:else}
                <div class="w-full h-32 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300">
                  <svg class="w-8 h-8 mb-1" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  <p class="text-xs font-semibold">No house photo submitted</p>
                </div>
              {/if}
            </div>

            <!-- ══ SECTOR ID PROOF IMAGES ══════════════════════════════ -->
            <!--
              Only renders when the resident belongs to at least one
              sector (PWD, Senior Citizen, Single Parent).
              Each proof card is colour-coded to match its category badge.
            -->
            {#if proofImages.length > 0}
              <div class="px-6 py-4 space-y-4">
                <!-- Section header -->
                <p class="text-[0.6rem] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"/>
                  </svg>
                  Sector ID Proofs
                </p>

                {#each proofImages as proof (proof.label)}
                  <div class="rounded-xl border {proofBorder[proof.color]} overflow-hidden">
                    <!-- Proof card label row -->
                    <div class="flex items-center gap-2 px-3 py-2 border-b {proofBorder[proof.color]}">
                      <span class="text-base leading-none">{proof.icon}</span>
                      <span class="text-[0.65rem] font-extrabold uppercase tracking-wider {proofLabel[proof.color]} px-2 py-0.5 rounded-full border">
                        {proof.label}
                      </span>
                    </div>

                    <!-- Image or placeholder -->
                    {#if proof.src}
                      <button type="button"
                        on:click={() => openLightbox(proof.src, `${proof.icon} ${proof.label}`)}
                        class="w-full relative group cursor-zoom-in block">
                        <img
                          src={proof.src}
                          alt={proof.label}
                          class="w-full h-36 object-cover group-hover:brightness-90 transition-all"
                        />
                        <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                          <span class="bg-black/50 text-white text-xs font-bold px-4 py-2 rounded-full backdrop-blur-sm">
                            🔍 Tap to enlarge
                          </span>
                        </div>
                      </button>
                    {:else}
                      <!-- Empty state: resident is in this sector but no proof uploaded -->
                      <div class="w-full h-28 flex flex-col items-center justify-center gap-1.5 text-slate-300 bg-slate-50">
                        <svg class="w-7 h-7" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                        <p class="text-xs font-semibold text-slate-400">No proof submitted</p>
                        <p class="text-[0.65rem] text-slate-300">Document was not uploaded</p>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
            <!-- ══ END SECTOR ID PROOF IMAGES ═════════════════════════ -->

          </div>
        </div>

        <!-- ── RIGHT: map + actions ── -->
        <div class="w-[48%] flex flex-col border-l border-slate-100 bg-slate-50">

          <!-- Map label -->
          <div class="px-5 py-4 border-b border-slate-100 bg-white shrink-0">
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z"/>
              </svg>
              <p class="text-[0.65rem] font-extrabold tracking-widest text-slate-400 uppercase">Location on Map</p>
            </div>
          </div>

          <!-- Map iframe -->
          <div class="flex-1 relative min-h-0">
            {#if mapSrc}
              <iframe src={mapSrc} title="Resident location"
                class="w-full h-full border-0" loading="lazy"
                referrerpolicy="no-referrer-when-downgrade"></iframe>
              <!-- Name overlay -->
              <div class="absolute top-3 left-1/2 -translate-x-1/2 bg-white shadow-lg rounded-full px-4 py-1.5 text-xs font-bold text-slate-700 border border-slate-200 pointer-events-none whitespace-nowrap">
                📍 {resident.firstName ?? resident.name?.split(' ')[0] ?? ''} {resident.lastName ?? ''}
              </div>
            {:else}
              <div class="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-3 p-8">
                <div class="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center">
                  <svg class="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                </div>
                <div class="text-center">
                  <p class="text-sm font-bold text-slate-400">No GPS data</p>
                  <p class="text-xs text-slate-300 mt-1">Location was not captured during registration</p>
                </div>
              </div>
            {/if}
          </div>

          <!-- Zone label -->
          {#if resident.zone || resident.purok}
            <div class="px-5 py-3 bg-white border-t border-slate-100 shrink-0">
              <span class="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full">
                <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
                </svg>
                {[resident.zone, resident.purok].filter(Boolean).join(' — ')}
              </span>
            </div>
          {/if}

          <!-- Action buttons -->
          <div class="px-5 py-4 border-t border-slate-100 bg-white shrink-0 space-y-2">

            <!-- Approve / Decline (pending only) -->
            {#if resident.status === 'pending'}
              <div class="flex gap-2">
                <button type="button" on:click={() => openConfirm('approve')}
                  class="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-green-500 hover:bg-green-600 transition-all active:scale-95 flex items-center justify-center gap-1.5">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                  </svg>
                  Approve
                </button>
                <button type="button" on:click={() => openConfirm('decline')}
                  class="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-all active:scale-95 flex items-center justify-center gap-1.5">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                  Decline
                </button>
              </div>
            {/if}

            <!-- Report · Print · Back -->
            <div class="flex gap-2">
              <button type="button"
                class="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 border-2 transition-all active:scale-95"
                style="color:#0f2060; border-color:#0f2060; background:white;">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                Report
              </button>
              <button type="button" on:click={() => window.print()}
                class="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 border-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all active:scale-95">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                </svg>
                Print
              </button>
              <button type="button" on:click={() => dispatch('close')}
                class="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 border-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all active:scale-95">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                </svg>
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}


<!-- ══════════════════ PHOTO LIGHTBOX ═════════════════════════ -->
<!--
  Now shared between house photo AND all sector proof images.
  lightboxSrc / lightboxLabel are set by openLightbox().
-->
{#if showPhotoLightbox && lightboxSrc}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm"
    on:click={() => { showPhotoLightbox = false; lightboxSrc = ''; lightboxLabel = ''; }}>
    <div class="relative max-w-lg w-full mx-4" on:click|stopPropagation>
      <img src={lightboxSrc} alt={lightboxLabel}
        class="w-full rounded-2xl shadow-2xl max-h-[80vh] object-cover" />
      <button
        on:click={() => { showPhotoLightbox = false; lightboxSrc = ''; lightboxLabel = ''; }}
        class="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-all">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
      {#if lightboxLabel}
        <div class="absolute bottom-3 left-3 bg-black/50 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
          {lightboxLabel}
        </div>
      {/if}
    </div>
  </div>
{/if}


<!-- ══════════════════ CONFIRM MODAL ══════════════════════════ -->
{#if confirmModal.open}
  <div class="fixed inset-0 z-[70] flex items-center justify-center px-4"
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
        {confirmModal.action === 'approve' ? 'Approve Resident?' : 'Decline Resident?'}
      </h3>
      <p class="text-sm text-slate-500 font-semibold mb-1">{resident?.name}</p>
      <p class="text-sm text-slate-400 mb-5">
        {confirmModal.action === 'approve'
          ? 'This resident will be marked as approved and added to the records.'
          : 'This submission will be declined and removed from the queue.'}
      </p>
      <div class="flex gap-3">
        <button type="button"
          on:click={() => confirmModal = { open: false, action: 'approve' }}
          class="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
          Cancel
        </button>
        <button type="button" on:click={confirmAction}
          class="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors
                 {confirmModal.action === 'approve' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}">
          {confirmModal.action === 'approve' ? 'Yes, Approve' : 'Yes, Decline'}
        </button>
      </div>
    </div>
  </div>
{/if}