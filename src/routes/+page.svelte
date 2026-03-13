<!-- src/routes/+page.svelte -->
<script>
  // NO top-level firebase import — use dynamic import inside the function

  let email    = '';
  let password = '';
  let showPass = false;
  let loading  = false;
  let errorMsg = '';
  let success  = false;

  async function handleLogin() {
    errorMsg = '';

    if (!email.trim()) { errorMsg = 'Please enter your email address.'; return; }
    if (!password)     { errorMsg = 'Please enter your password.'; return; }

    loading = true;

    try {
      // ✅ Dynamic import — only runs in browser, never on server
      const { auth }                      = await import('$lib/firebase');
      const { signInWithEmailAndPassword } = await import('firebase/auth');

      await signInWithEmailAndPassword(auth, email.trim(), password);
      success = true;
      setTimeout(() => { window.location.href = '/admin/dashboard'; }, 2000);

    } catch (e) {
      const code = /** @type {any} */ (e)?.code ?? '';
      switch (code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errorMsg = 'Incorrect email or password. Please try again.';
          break;
        case 'auth/too-many-requests':
          errorMsg = 'Too many failed attempts. Please try again later.';
          break;
        case 'auth/user-disabled':
          errorMsg = 'This account has been disabled. Contact support.';
          break;
        default:
          errorMsg = 'Something went wrong. Please try again.';
      }
    } finally {
      loading = false;
    }
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    if (e.key === 'Enter') handleLogin();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Page -->
<div class="dot-grid min-h-screen flex items-center justify-center px-4 py-10 overflow-hidden relative" style="background: linear-gradient(135deg, #0f2060 0%, #1a4fa0 50%, #1e6fc8 100%);">

  <!-- Animated blobs -->
  <div class="absolute -top-28 -left-24 w-96 h-96 rounded-full bg-blue-400 opacity-[0.15] blur-3xl animate-drift-1 pointer-events-none"></div>
  <div class="absolute -bottom-20 -right-16 w-80 h-80 rounded-full bg-blue-300 opacity-[0.15] blur-3xl animate-drift-2 pointer-events-none"></div>
  <div class="absolute top-1/2 left-2/3 w-52 h-52 rounded-full bg-blue-200 opacity-[0.10] blur-3xl animate-drift-3 pointer-events-none"></div>

  <!-- Main wrapper -->
  <div class="relative z-10 w-full max-w-sm flex flex-col items-center gap-7">

    <!-- Brand -->
    <div class="animate-fade-up text-center text-white">
      <div class="flex items-center justify-center gap-3 mb-2">
        <div class="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-2xl shadow-lg">
          📍
        </div>
        <h1 class="font-nunito text-4xl font-black tracking-tight leading-none">
          <span class="font-light opacity-75">Geo</span>Profile
        </h1>
      </div>
      <p class="text-sm text-white/60 leading-relaxed">
        Barangay Pag-Asa<br />Resident Profiling System
      </p>
    </div>

    <!-- Card -->
    <div class="animate-fade-up-d w-full bg-white rounded-3xl shadow-2xl px-7 py-8">

      <!-- Card header -->
      <div class="mb-6">
        <p class="text-[0.65rem] font-bold tracking-widest uppercase text-slate-400 mb-0.5">
          Welcome back
        </p>
        <h2 class="font-nunito text-xl font-extrabold text-slate-700">Admin Sign In</h2>
      </div>

      <!-- Error banner -->
      {#if errorMsg}
        <div class="mb-5 flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold px-4 py-3 rounded-xl">
          <span>⚠️</span>
          <span>{errorMsg}</span>
        </div>
      {/if}

      <!-- Email -->
      <div class="mb-4">
        <label for="email" class="block text-[0.68rem] font-bold tracking-widest uppercase text-slate-400 mb-2">
          Username / Email
        </label>
        <div class="relative">
          <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] pointer-events-none select-none">👤</span>
          <input
            id="email"
            type="email"
            bind:value={email}
            placeholder="admin@pag-asa.gov.ph"
            autocomplete="username"
            disabled={loading}
            class="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm placeholder-slate-300 outline-none
                   focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100
                   disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          />
        </div>
      </div>

      <!-- Password -->
      <div class="mb-6">
        <label for="password" class="block text-[0.68rem] font-bold tracking-widest uppercase text-slate-400 mb-2">
          Password
        </label>
        <div class="relative">
          <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] pointer-events-none select-none">🔒</span>
          <input
            id="password"
            type={showPass ? 'text' : 'password'}
            bind:value={password}
            placeholder="Enter your password"
            autocomplete="current-password"
            disabled={loading}
            class="w-full pl-10 pr-11 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm placeholder-slate-300 outline-none
                   focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100
                   disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          />
          <button
            type="button"
            on:click={() => showPass = !showPass}
            class="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors p-1 select-none"
            aria-label="Toggle password visibility"
          >
            {#if showPass}
              <!-- Eye off (hide password) -->
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            {:else}
              <!-- Eye (show password) -->
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            {/if}
          </button>
        </div>
      </div>

      <!-- Admin badge -->
      <div class="mb-6 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <span class="text-xl">🛡️</span>
        <div>
          <p class="text-xs font-bold text-blue-700">Administrator Access</p>
          <p class="text-[0.68rem] text-blue-400 leading-tight">Full dashboard &amp; management privileges</p>
        </div>
      </div>

      <!-- Login button -->
      <button
        type="button"
        on:click={handleLogin}
        disabled={loading}
        class="w-full flex items-center justify-center gap-2 py-3.5 active:scale-[0.98] text-white font-nunito font-extrabold text-base rounded-2xl shadow-lg disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 transition-all duration-200 cursor-pointer"
        style="background: linear-gradient(to right, #1d4ed8, #3b82f6);"
      >
        {#if loading}
          <svg class="w-5 h-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          <span>Signing in…</span>
        {:else}
          <span>🔐 Login</span>
        {/if}
      </button>

      <!-- Forgot password -->
      <p class="text-center text-xs text-slate-400 mt-4">
        Forgot your password?
        <button
          type="button"
          on:click={() => { window.location.href = '/reset-password'; }}
          class="text-blue-600 font-semibold hover:underline ml-1 bg-transparent border-none cursor-pointer"
        >
          Reset here
        </button>
      </p>
    </div>

    <!-- Footer -->
    <p class="text-white/35 text-xs text-center pb-2">
      GeoProfile v1.0 &nbsp;•&nbsp; Barangay Pag-Asa &nbsp;•&nbsp; 2025
    </p>
  </div>

  <!-- Success overlay -->
  {#if success}
    <div class="fixed inset-0 z-50 backdrop-blur-sm flex items-center justify-center px-6" style="background: rgba(15,32,96,0.75);">
      <div class="bg-white rounded-3xl px-8 py-10 text-center max-w-xs w-full shadow-2xl animate-pop-in">
        <div class="text-5xl mb-4">🛡️</div>
        <h3 class="font-nunito text-xl font-extrabold text-slate-700 mb-1">Welcome, Admin!</h3>
        <p class="text-sm text-slate-400 mb-5">Redirecting to your dashboard…</p>
        <div class="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div class="h-full bg-blue-500 rounded-full" style="width: 100%; transition: width 2s ease;"></div>
        </div>
      </div>
    </div>
  {/if}
</div>