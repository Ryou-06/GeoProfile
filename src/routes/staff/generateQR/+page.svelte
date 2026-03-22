<!-- src/routes/staff/households/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  const BASE_URL = 'https://overlavishly-unsequential-janean.ngrok-free.dev';

  interface Household {
    id: string;
    qrId: string;
    houseNo: string;
    notes?: string;
    createdAt: number;
    createdBy: string;
    registrationUrl?: string;
  }

  let households: Household[] = [];
  let loading = true;
  let creating = false;
  let errorMsg = '';

  // Form fields — zone removed
  let houseNo = '';
  let notes   = '';

  // QR Display
  let generatedHousehold: Household | null = null;
  let qrDataUrl = '';

  let unsubs: (() => void)[] = [];


  onMount(async () => {
    loadHouseholds();
  });

  onDestroy(() => unsubs.forEach(u => u()));

  async function loadHouseholds() {
    try {
      const { db, auth } = await import('$lib/firebase');
      const { collection, onSnapshot, query, where } = await import('firebase/firestore');
      const { onAuthStateChanged } = await import('firebase/auth');

      const unsubAuth = onAuthStateChanged(auth, async (user) => {
        if (!user) { window.location.href = '/'; return; }
        
        const unsubHouseholds = onSnapshot(
          query(collection(db, 'households'), where('createdBy', '==', user.uid)),
          snap => {
            households = snap.docs
              .map(d => ({ id: d.id, ...d.data() } as Household))
              .sort((a, b) => {
                const aTime = typeof a.createdAt === 'number' ? a.createdAt : ((a.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0);
                const bTime = typeof b.createdAt === 'number' ? b.createdAt : ((b.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0);
                return bTime - aTime;
              });
            loading = false;
          },
          err => { console.error('Households error:', err); loading = false; }
        );
        unsubs.push(unsubHouseholds);
      });
      unsubs.push(unsubAuth);
    } catch (e) {
      console.error(e);
      loading = false;
    }
  }

  async function createHousehold() {
    if (!houseNo.trim()) { errorMsg = 'Please enter the House No.'; return; }

    errorMsg = '';
    creating = true;
    try {
      const { db, auth } = await import('$lib/firebase');
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');

      const user = auth.currentUser;
      if (!user) { window.location.href = '/'; return; }

      const qrId = `HH-${Date.now().toString(36).toUpperCase()}`;
      const registrationUrl = `${BASE_URL}/register/${qrId}`;

      const docRef = await addDoc(collection(db, 'households'), {
        qrId,
        houseNo: houseNo.trim(),
        notes: notes.trim(),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        status: 'active',
      });

      qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(registrationUrl)}&margin=10&bgcolor=ffffff&color=0f2060`;

      generatedHousehold = {
        id: docRef.id,
        qrId,
        houseNo: houseNo.trim(),
        notes: notes.trim(),
        createdAt: Date.now(),
        createdBy: user.uid,
        registrationUrl,
      };

      houseNo = '';
      notes   = '';

    } catch (e) {
      errorMsg = 'Failed to create household. Please try again.';
      console.error(e);
    } finally {
      creating = false;
    }
  }

  function showExistingQR(hh: Household) {
    const registrationUrl = `${BASE_URL}/register/${hh.qrId}`;
    qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(registrationUrl)}&margin=10&bgcolor=ffffff&color=0f2060`;
    generatedHousehold = { ...hh, registrationUrl };
  }

  function handlePrint() {
    if (!generatedHousehold) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>QR Code - ${generatedHousehold.qrId}</title>
      <style>
        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: white; }
        .card { border: 2px solid #0f2060; border-radius: 16px; padding: 28px 24px; max-width: 320px; text-align: center; }
        .logo { font-size: 22px; font-weight: 900; color: #0f2060; margin-bottom: 2px; }
        .subtitle { font-size: 11px; color: #64748b; margin-bottom: 16px; }
        .qr { width: 220px; height: 220px; margin: 0 auto 16px; display: block; }
        .qr-id { font-size: 15px; font-weight: 700; color: #0f2060; margin-bottom: 6px; letter-spacing: 2px; }
        .house { font-size: 13px; color: #334155; font-weight: 600; margin-bottom: 2px; }
        .street { font-size: 12px; color: #334155; font-weight: 600; margin-bottom: 4px; }
        .divider { border: none; border-top: 1px solid #e2e8f0; margin: 12px 0; }
        .instruction-title { font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 4px; }
        .instruction { font-size: 10px; color: #64748b; line-height: 1.5; }
        .brgy { font-size: 11px; color: #2563eb; font-weight: 600; margin-top: 8px; }
      </style></head><body>
      <div class="card">
        <div class="logo">📍 GeoProfile</div>
        <div class="subtitle">Barangay Pag-Asa · Resident Profiling System</div>
        <img class="qr" src="${qrDataUrl}" alt="QR Code" />
        <div class="qr-id">${generatedHousehold.qrId}</div>
        <div class="house">House No. ${generatedHousehold.houseNo}</div>
        <div class="street">Barangay Pag-Asa</div>
        <hr class="divider" />
        <div class="instruction-title">HOW TO REGISTER:</div>
        <div class="instruction">
          1. Open your phone camera<br/>
          2. Scan this QR code<br/>
          3. Fill out your personal information<br/>
          4. Provide your street address<br/>
          5. Take a photo of your house<br/>
          6. Submit the form
        </div>
        <div class="brgy">Olongapo City, Zambales</div>
      </div></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  function handleDownload() {
    if (!qrDataUrl || !generatedHousehold) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${generatedHousehold.qrId}.png`;
    a.click();
  }
</script>

<div class="p-6 space-y-6 min-h-full bg-slate-100 font-inter">

  <div>
    <h1 class="font-nunito text-2xl font-extrabold text-slate-800">Generate QR Code</h1>
    <p class="text-sm text-slate-500 mt-0.5">Create a household registration QR for Barangay Pag-Asa</p>
  </div>

  <!-- URL Configuration Notice -->
  <div class="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
    <div class="flex items-start gap-2">
      <svg class="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <div>
        <p class="text-xs font-bold text-blue-900">Development Mode</p>
        <p class="text-xs text-blue-700 mt-0.5">
          Current URL: <code class="bg-blue-100 px-1 rounded font-mono">{BASE_URL}</code>
        </p>
        <p class="text-xs text-blue-600 mt-1">
          ⚠️ Change <code class="bg-blue-100 px-1 rounded font-mono">BASE_URL</code> in the code before deploying to production!
        </p>
      </div>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

    <!-- Form -->
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">

      <div class="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <svg class="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p class="text-xs text-blue-600 leading-relaxed">
          The QR code links to a registration form. <strong>Residents will fill in their street address and personal information</strong> when they scan it.
        </p>
      </div>

      {#if errorMsg}
        <div class="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold px-4 py-3 rounded-xl">
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          {errorMsg}
        </div>
      {/if}

      <!-- House No -->
      <div>
        <label class="block text-[0.68rem] font-bold tracking-widest uppercase text-slate-400 mb-2">
          House No. / Unit <span class="text-red-400">*</span>
        </label>
        <input type="text" bind:value={houseNo} disabled={creating}
          placeholder="e.g. 47 or Unit 3B"
          class="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm placeholder-slate-300 outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100 disabled:opacity-50 transition-all" />
      </div>

      <!-- Staff notes -->
      <div>
        <label class="block text-[0.68rem] font-bold tracking-widest uppercase text-slate-400 mb-2">
          Staff Notes
          <span class="text-slate-300 font-normal normal-case ml-1">(optional · internal only, not shown to resident)</span>
        </label>
        <textarea bind:value={notes} disabled={creating} rows="2"
          placeholder="e.g. Corner house near the basketball court"
          class="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm placeholder-slate-300 outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100 disabled:opacity-50 transition-all resize-none">
        </textarea>
      </div>

      <!-- Generate button -->
      <button type="button" on:click={createHousehold} disabled={creating}
        class="w-full flex items-center justify-center gap-2 py-3.5 text-white font-nunito font-extrabold text-base rounded-2xl shadow-lg active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
        style="background:#059669;">
        {#if creating}
          <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          Generating…
        {:else}
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 4h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
          </svg>
          Generate QR Code
        {/if}
      </button>
    </div>

    <!-- QR Display -->
    <div class="space-y-4">
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100">
          <h2 class="font-nunito font-extrabold text-slate-700 text-base">Generated QR Code</h2>
        </div>

        {#if generatedHousehold && qrDataUrl}
          <div class="p-5 flex flex-col items-center gap-4">
            <div class="border-4 border-slate-100 rounded-2xl p-2 bg-white shadow-inner">
              <img src={qrDataUrl} alt="QR Code" class="w-52 h-52 rounded-xl" />
            </div>
            <div class="text-center">
              <p class="font-nunito font-black text-slate-800 text-xl tracking-widest">{generatedHousehold.qrId}</p>
              <p class="text-sm text-slate-600 font-semibold mt-1">House No. {generatedHousehold.houseNo}</p>
              <p class="text-sm text-slate-500 mt-0.5">Barangay Pag-Asa</p>
              <p class="text-xs text-slate-400 mt-0.5">Olongapo City, Zambales</p>
              {#if generatedHousehold.notes}
                <p class="text-xs text-blue-500 mt-1.5 bg-blue-50 px-3 py-1 rounded-full inline-block">
                  📝 {generatedHousehold.notes}
                </p>
              {/if}
            </div>
            <div class="w-full bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-200">
              <p class="text-[0.62rem] font-bold text-slate-400 uppercase tracking-widest mb-1">Registration Link</p>
              <p class="text-xs text-blue-600 font-medium break-all">{generatedHousehold.registrationUrl}</p>
            </div>
            <div class="flex gap-3 w-full">
              <button type="button" on:click={handlePrint}
                class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
                style="background:#2563eb;">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                </svg>
                Print
              </button>
              <button type="button" on:click={handleDownload}
                class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all active:scale-95">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Download
              </button>
            </div>
          </div>
        {:else}
          <div class="p-10 flex flex-col items-center text-slate-300">
            <svg class="w-16 h-16 mb-3 opacity-40" fill="none" stroke="currentColor" stroke-width="1.2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 4h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
            </svg>
            <p class="text-sm font-semibold text-slate-400 text-center">Fill in the form and click<br/>Generate QR Code</p>
          </div>
        {/if}
      </div>

      <!-- Recent QRs -->
      {#if !loading && households.length > 0}
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100">
            <h2 class="font-nunito font-extrabold text-slate-700 text-sm">Recently Generated</h2>
          </div>
          <div class="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
            {#each households.slice(0, 10) as hh (hh.id)}
              <button type="button" on:click={() => showExistingQR(hh)}
                class="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left">
                <div class="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 4h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-bold text-slate-700">{hh.qrId}</p>
                  <p class="text-xs text-slate-500">House No. {hh.houseNo} · Brgy. Pag-Asa</p>
                  {#if hh.notes}
                    <p class="text-xs text-blue-500 truncate">{hh.notes}</p>
                  {/if}
                </div>
                <svg class="w-4 h-4 text-slate-300 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>