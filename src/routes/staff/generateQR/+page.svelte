<!-- src/routes/staff/households/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { logAuditEvent } from '$lib/audit';

  // UPDATED: Your permanent Vercel URL
  const BASE_URL = 'https://geo-profile-bice.vercel.app';

  interface Household {
    id: string;
    qrId: string;
    houseNo: string;
    notes?: string;
    createdAt: number;
    createdBy: string;
    createdByName?: string;
    registrationUrl?: string;
  }

  let households: Household[] = [];
  let loading = true;
  let creating = false;
  let errorMsg = '';

  // Form fields
  let houseNo = '';
  let notes   = '';

  // QR Display
  let generatedHousehold: Household | null = null;
  let qrDataUrl = '';
  
  // Print modal
  let showPrintModal = false;
  let printContent = '';
  
  // Download state
  let downloading = false;

  let unsubs: (() => void)[] = [];

  // Helper function to get staff name
  async function getCurrentStaffName(userId: string): Promise<string> {
    try {
      const { db } = await import('$lib/firebase');
      const { doc, getDoc } = await import('firebase/firestore');
      const userDoc = await getDoc(doc(db, 'users', userId));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        return userData.name || userData.displayName || userData.email || userId;
      }
      return userId;
    } catch (error) {
      console.error('Error fetching staff name:', error);
      return userId;
    }
  }

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

      // Get the staff's full name
      const staffName = await getCurrentStaffName(user.uid);

      const qrId = `HH-${Date.now().toString(36).toUpperCase()}`;
      const registrationUrl = `${BASE_URL}/register/${qrId}`;

      const docRef = await addDoc(collection(db, 'households'), {
        qrId,
        houseNo: houseNo.trim(),
        notes: notes.trim(),
        createdBy: user.uid,
        createdByName: staffName,
        createdAt: serverTimestamp(),
        status: 'active',
      });
      await logAuditEvent({
        action: 'create_qr',
        module: 'Households',
        description: `Generated QR code ${qrId} for House No. ${houseNo.trim()}`,
        targetId: docRef.id,
        targetLabel: qrId,
        metadata: { houseNo: houseNo.trim(), notes: notes.trim(), registrationUrl }
      });

      qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(registrationUrl)}&margin=10&bgcolor=ffffff&color=0f2060`;

      generatedHousehold = {
        id: docRef.id,
        qrId,
        houseNo: houseNo.trim(),
        notes: notes.trim(),
        createdAt: Date.now(),
        createdBy: user.uid,
        createdByName: staffName,
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

  // Fixed: Auto-download that actually works instantly
  async function handleDownload() {
    if (!qrDataUrl || !generatedHousehold || downloading) return;
    
    downloading = true;
    
    try {
      // Fetch the image as a blob
      const response = await fetch(qrDataUrl);
      const blob = await response.blob();
      
      // Create object URL and trigger download
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${generatedHousehold.qrId}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Clean up the object URL
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    } catch (error) {
      console.error('Download failed:', error);
      errorMsg = 'Failed to download QR code. Please try again.';
      setTimeout(() => { if (errorMsg === 'Failed to download QR code. Please try again.') errorMsg = ''; }, 3000);
    } finally {
      downloading = false;
    }
  }

  // Print modal instead of new window
  function handlePrint() {
    if (!generatedHousehold) return;
    
    // Generate print content
    printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Code - ${generatedHousehold.qrId}</title>
          <meta charset="UTF-8">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: white;
              padding: 20px;
            }
            .card {
              border: 2px solid #0f2060;
              border-radius: 14px;
              padding: 18px;
              width: 640px;
              max-width: 100%;
              min-height: 220px;
              display: grid;
              grid-template-columns: 270px 1fr;
              gap: 16px;
              align-items: start;
              background: white;
            }
            .qr-panel {
              grid-column: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
              border-right: 1px solid #e2e8f0;
              padding-right: 18px;
            }
            .info-panel {
              grid-column: 2;
              text-align: left;
            }
            .logo,
            .subtitle,
            .qr,
            .qr-id,
            .house,
            .street {
              grid-column: 1;
              text-align: center;
            }
            .instruction-title,
            .instruction {
              grid-column: 2;
              text-align: left;
            }
            .logo {
              font-size: 22px;
              font-weight: 900;
              color: #0f2060;
              margin-bottom: 2px;
            }
            .subtitle {
              font-size: 11px;
              color: #64748b;
              margin-bottom: 10px;
            }
            .qr {
              width: 135px;
              height: 135px;
              margin: 6px auto 8px;
              display: block;
            }
            .qr-id {
              font-size: 15px;
              font-weight: 700;
              color: #0f2060;
              margin-bottom: 4px;
              letter-spacing: 2px;
            }
            .house {
              font-size: 12px;
              color: #334155;
              font-weight: 700;
              margin-bottom: 2px;
            }
            .street {
              font-size: 11px;
              color: #334155;
              font-weight: 600;
              margin-bottom: 0;
            }
            .divider {
              display: none;
            }
            .instruction-title {
              font-size: 12px;
              font-weight: 700;
              color: #334155;
              margin-bottom: 8px;
            }
            .instruction {
              font-size: 12px;
              color: #64748b;
              line-height: 1.7;
            }
            .brgy {
              display: none;
            }
            .vercel-badge {
              display: none;
            }
            @media print {
              @page {
                size: landscape;
                margin: 12mm;
              }
              body {
                padding: 0;
                margin: 0;
              }
              .card {
                border: 2px solid #0f2060;
                page-break-inside: avoid;
              }
            }
            @media (max-width: 700px) {
              .card {
                grid-template-columns: 1fr;
              }
              .logo,
              .subtitle,
              .qr,
              .qr-id,
              .house,
              .street,
              .instruction-title,
              .instruction {
                grid-column: 1;
                text-align: center;
              }
              .qr-panel {
                border-right: none;
                border-bottom: 1px solid #e2e8f0;
                padding-right: 0;
                padding-bottom: 18px;
              }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="qr-panel">
            <div class="logo">📍 GeoProfile</div>
            <div class="subtitle">Barangay Pag-Asa · Resident Profiling System</div>
            <img class="qr" src="${qrDataUrl}" alt="QR Code" />
            <div class="qr-id">${generatedHousehold.qrId}</div>
            <div class="house">House No. ${generatedHousehold.houseNo}</div>
            <div class="street">Barangay Pag-Asa</div>
            </div>
            <hr class="divider" />
            <div class="info-panel">
            <div class="instruction-title">HOW TO REGISTER:</div>
            <div class="instruction">
              1. Open your phone camera<br/>
              2. Scan this QR code<br/>
              3. Fill out your personal information<br/>
              4. Provide your street address<br/>
              5. Take a photo of your house<br/>
              6. Submit the form
            </div>
            </div>
            <div class="brgy">Olongapo City, Zambales</div>
            <div class="vercel-badge">Permanent QR Code · Live 24/7</div>
          </div>
        </body>
      </html>
    `;
    
    showPrintModal = true;
  }

  // Execute print from modal
  function executePrint() {
    const printFrame = document.getElementById('print-frame') as HTMLIFrameElement;
    if (printFrame) {
      const doc = printFrame.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(printContent);
        doc.close();
        
        // Wait for content to load then print
        printFrame.onload = () => {
          printFrame.contentWindow?.print();
          // Close modal after print dialog is closed
          setTimeout(() => {
            showPrintModal = false;
          }, 100);
        };
      }
    }
  }
</script>

<div class="p-3 sm:p-6 space-y-6 min-h-full bg-slate-100 font-inter">

  <div>
    <h1 class="font-nunito text-2xl font-extrabold text-slate-800">Generate QR Code</h1>
    <p class="text-sm text-slate-500 mt-0.5">Create a household registration QR for Barangay Pag-Asa</p>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

    <!-- Form -->
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 space-y-5">

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
        <label for="house-no" class="block text-[0.68rem] font-bold tracking-widest uppercase text-slate-400 mb-2">
          House No. / Unit <span class="text-red-400">*</span>
        </label>
        <input id="house-no" type="text" bind:value={houseNo} disabled={creating}
          placeholder="e.g. 47 or Unit 3B"
          class="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm placeholder-slate-300 outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100 disabled:opacity-50 transition-all" />
      </div>

      <!-- Staff notes -->
      <div>
        <label for="staff-notes" class="block text-[0.68rem] font-bold tracking-widest uppercase text-slate-400 mb-2">
          Staff Notes
          <span class="text-slate-300 font-normal normal-case ml-1">(optional · internal only, not shown to resident)</span>
        </label>
        <textarea id="staff-notes" bind:value={notes} disabled={creating} rows="2"
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
          <div class="p-4 sm:p-5 flex flex-col items-center gap-4">
            <div class="border-4 border-slate-100 rounded-2xl p-2 bg-white shadow-inner">
              <img src={qrDataUrl} alt="QR Code" class="h-44 w-44 rounded-xl sm:h-52 sm:w-52" />
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

            <div class="flex w-full flex-col gap-3 sm:flex-row">
              <button type="button" on:click={handlePrint}
                class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
                style="background:#2563eb;">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                </svg>
                Print
              </button>
              <button type="button" on:click={handleDownload} disabled={downloading}
                class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                {#if downloading}
                  <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                  Downloading...
                {:else}
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                  </svg>
                  Download
                {/if}
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

<!-- Print Modal -->
{#if showPrintModal}
  <div
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4"
    role="button"
    tabindex="0"
    aria-label="Close print preview"
    on:click={() => showPrintModal = false}
    on:keydown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') showPrintModal = false;
    }}
  >
    <div
      class="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[96dvh] overflow-hidden flex flex-col"
      role="presentation"
      on:click|stopPropagation
    >
      <div class="flex items-center justify-between px-4 py-4 border-b border-slate-200 sm:px-6">
        <h3 class="font-nunito font-extrabold text-slate-800">Print Preview</h3>
        <button type="button" aria-label="Close print preview" on:click={() => showPrintModal = false} class="text-slate-400 hover:text-slate-600 transition-colors">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      
      <div class="flex-1 overflow-auto p-3 bg-slate-100 sm:p-6">
        <div class="bg-white rounded-xl shadow-lg mx-auto" style="max-width: 700px;">
          <iframe id="print-frame" class="w-full h-[320px] border-0" title="QR print preview" srcdoc={printContent}></iframe>
        </div>
      </div>
      
      <div class="flex flex-col gap-3 px-4 py-4 border-t border-slate-200 bg-slate-50 sm:flex-row sm:px-6">
        <button type="button" on:click={() => showPrintModal = false}
          class="flex-1 px-4 py-2 rounded-xl text-sm font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 transition-all">
          Cancel
        </button>
        <button type="button" on:click={executePrint}
          class="flex-1 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
          style="background:#2563eb;">
          <svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
          </svg>
          Print
        </button>
      </div>
    </div>
  </div>
{/if}
