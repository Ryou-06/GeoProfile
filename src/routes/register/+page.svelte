<!-- src/routes/register/+page.svelte -->
<!-- PWA landing page — redirects to last QR form or shows scan instructions -->
<script>
  import { onMount } from 'svelte';

  let installing = false;
  let installDone = false;
  /** @type {any} */
  let deferredPrompt = null;

  onMount(() => {
    // Redirect to last QR form if saved
    const lastQrId = localStorage.getItem('last_qr_id');
    if (lastQrId) {
      window.location.replace(`/register/${lastQrId}`);
      return;
    }

    // Capture install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
    });

    window.addEventListener('appinstalled', () => {
      installing = false;
      installDone = true;
    });
  });

  async function handleInstall() {
    if (!deferredPrompt) return;
    installing = true;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') {
      // installDone will be set by appinstalled event
    } else {
      installing = false;
    }
  }
</script>

<svelte:head>
  <title>GeoProfile — Resident Registration</title>
</svelte:head>

<!-- Installing overlay -->
{#if installing}
  <div class="fixed inset-0 z-50 flex flex-col items-center justify-center font-inter"
    style="background: linear-gradient(135deg, #0f2060, #1a4fa0);">
    <img src="/icon-512.png" alt="GeoProfile" class="w-20 h-20 rounded-3xl shadow-2xl mb-6" />
    <div class="flex items-center gap-3 mb-4">
      <svg class="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
      </svg>
      <p class="text-white font-bold text-lg">Installing GeoProfile…</p>
    </div>
    <p class="text-white/60 text-sm">Please wait</p>
  </div>

<!-- Install done overlay -->
{:else if installDone}
  <div class="fixed inset-0 z-50 flex flex-col items-center justify-center font-inter"
    style="background: linear-gradient(135deg, #064e3b, #059669);">
    <div class="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-6 shadow-2xl">
      <svg class="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
      </svg>
    </div>
    <p class="font-nunito font-black text-white text-2xl mb-2">Installed!</p>
    <p class="text-white/70 text-sm mb-8">GeoProfile is now on your home screen</p>
    <button type="button"
      on:click={() => window.history.back()}
      class="bg-white text-emerald-700 font-bold px-8 py-3 rounded-2xl text-sm shadow-lg active:scale-95 transition-all">
      Go Back
    </button>
  </div>

<!-- Main screen -->
{:else}
  <div class="min-h-screen flex flex-col items-center justify-center px-6 text-center font-inter"
    style="background: linear-gradient(135deg, #0f2060, #1a4fa0, #1e6fc8);">

    <div class="w-24 h-24 bg-white rounded-3xl flex items-center justify-center shadow-2xl mb-6">
      <img src="/icon-512.png" alt="GeoProfile" class="w-16 h-16 rounded-2xl" />
    </div>

    <h1 class="font-nunito font-black text-white text-3xl mb-2">GeoProfile</h1>
    <p class="text-white/70 text-sm mb-10">Barangay Pag-Asa · Resident Profiling System</p>

    <div class="bg-white rounded-3xl p-6 max-w-xs w-full shadow-2xl space-y-5">

      <div class="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto">
        <svg class="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 4h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
        </svg>
      </div>

      <div>
        <h2 class="font-nunito font-extrabold text-slate-800 text-lg">Scan QR Code to Register</h2>
        <p class="text-slate-500 text-sm mt-1 leading-relaxed">
          Get a QR code from your Barangay Pag-Asa staff to register.
        </p>
      </div>

      <div class="space-y-3 text-left">
        <div class="flex items-start gap-3">
          <div class="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">1</div>
          <p class="text-sm text-slate-600">Get a <strong>QR code</strong> from your Barangay Staff</p>
        </div>
        <div class="flex items-start gap-3">
          <div class="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">2</div>
          <p class="text-sm text-slate-600">Open your <strong>camera app</strong> and scan the QR</p>
        </div>
        <div class="flex items-start gap-3">
          <div class="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">3</div>
          <p class="text-sm text-slate-600">Fill out the <strong>registration form</strong></p>
        </div>
      </div>

      <!-- Install button — only shows if installable -->
      {#if deferredPrompt}
        <button type="button" on:click={handleInstall}
          class="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white shadow-lg active:scale-95 transition-all"
          style="background:#0f2060;">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          Install App
        </button>
      {/if}

      <div class="bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
        <p class="text-xs text-slate-500 leading-relaxed">
          📍 <strong>Barangay Pag-Asa</strong><br/>
          Olongapo City, Zambales<br/>
          Region III — Central Luzon
        </p>
      </div>
    </div>

    <p class="text-white/40 text-xs mt-8">GeoProfile Resident Profiling System</p>
  </div>
{/if}