<!-- src/routes/+page.svelte -->
<script>
  import { onMount } from 'svelte';

  // Redirect already logged-in users to their dashboard
  onMount(async () => {
    try {
      const { auth } = await import('$lib/firebase');
      const { db }   = await import('$lib/firebase');
      const { onAuthStateChanged } = await import('firebase/auth');
      const { doc, getDoc }        = await import('firebase/firestore');

      onAuthStateChanged(auth, async (user) => {
        if (!user) return; // not logged in, stay on login page
        try {
          const userSnap = await getDoc(doc(db, 'users', user.uid));
          if (userSnap.exists()) {
            const r = userSnap.data().role;
            window.location.href = r === 'admin' ? '/admin/dashboard' : '/staff/dashboard';
          }
        } catch { /* non-critical */ }
      });
    } catch { /* non-critical */ }
  });

  let username = '';
  let password = '';
  let role     = 'staff'; // 'staff' | 'admin'
  let showPass = false;
  let loading  = false;
  let errorMsg = '';
  let success  = false;
  let successName = '';

  async function handleLogin() {
    errorMsg = '';

    if (!username.trim()) { errorMsg = 'Please enter your username.'; return; }
    if (!password)        { errorMsg = 'Please enter your password.'; return; }

    loading = true;

    try {
      // ✅ Dynamic imports — browser only, never SSR
      const { auth }                       = await import('$lib/firebase');
      const { db }                         = await import('$lib/firebase');
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      const { doc, getDoc }                = await import('firebase/firestore');

      // 1. Look up username to get email
      const usernameDoc = await getDoc(doc(db, 'usernames', username.toLowerCase().trim()));
      
      if (!usernameDoc.exists()) {
        errorMsg = 'Username not found. Please check your username.';
        loading = false;
        return;
      }

      const { email } = usernameDoc.data();

      // 2. Sign in with Firebase Auth using email
      const credential = await signInWithEmailAndPassword(auth, email, password);

      // 3. Read user role from Firestore users collection
      const userSnap = await getDoc(doc(db, 'users', credential.user.uid));

      if (!userSnap.exists()) {
        errorMsg = 'Account not found in system. Contact your administrator.';
        const { signOut } = await import('firebase/auth');
        await signOut(auth);
        loading = false;
        return;
      }

      const userData = userSnap.data();
      const firestoreRole = userData.role;

      // 4. Validate selected role matches Firestore role
      if (firestoreRole !== role) {
        errorMsg = `This account is registered as ${firestoreRole === 'admin' ? 'Admin' : 'Staff'}. Please select the correct role.`;
        const { signOut } = await import('firebase/auth');
        await signOut(auth);
        loading = false;
        return;
      }

      // 5. Success — show overlay then redirect
      successName = userData.name ?? username;
      success = true;

      setTimeout(() => {
        window.location.href = firestoreRole === 'admin'
          ? '/admin/dashboard'
          : '/staff/dashboard';
      }, 2000);

    } catch (e) {
      const code = /** @type {any} */ (e)?.code ?? '';
      switch (code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errorMsg = 'Incorrect username or password. Please try again.';
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
      loading = false;
    }
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    if (e.key === 'Enter') handleLogin();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Split Screen Layout - Left side bigger (60/40 ratio) -->
<div class="min-h-screen flex flex-col md:flex-row">
  
  <!-- Left Side - Image Section (60% width) -->
  <div class="hidden md:flex md:w-[60%] relative overflow-hidden">
    <!-- Background Image -->
    <img 
      src="/brgyhall.jpg" 
      alt="Barangay Pag-Asa Hall" 
      class="absolute inset-0 w-full h-full object-cover"
    />
    
    <!-- Dark Gradient Overlay for better text readability -->
    <div class="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/60 to-blue-900/70"></div>
    
    <!-- Pag-Asa Logo - Top Right Corner -->
    <div class="absolute top-6 right-6 z-20">
      <img 
        src="/pagasa-logo.jpg" 
        alt="Barangay Pag-Asa Logo" 
        class="w-16 h-16 object-contain bg-white/10 backdrop-blur-sm rounded-xl p-2 shadow-lg border border-white/20"
      />
    </div>
    
    <!-- Content overlay on image -->
    <div class="relative z-10 flex flex-col justify-between w-full h-full p-8 lg:p-12 text-white overflow-y-auto">
      
      <!-- Top - Title -->
      <div>
        <div class="flex items-center gap-3 mb-6">
          <div class="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-2xl shadow-lg">
            📍
          </div>
          <div>
            <h1 class="font-nunito text-2xl font-black tracking-tight">
              <span class="font-light">Geo</span>Profile
            </h1>
            <p class="text-xs text-white/80">Barangay Pag-Asa · Olongapo City</p>
          </div>
        </div>
        
        <!-- Welcome Message -->
        <div class="mb-8">
          <h2 class="text-3xl font-bold mb-2">Barangay Pag-Asa</h2>
          <p class="text-white/80 text-sm leading-relaxed">
            "Serving the Community with Digital Excellence"
          </p>
        </div>
      </div>
      
      <!-- Center - Barangay Information -->
      <div class="flex-1">
        <div class="backdrop-blur-md bg-white/10 rounded-2xl p-6 border border-white/20">
          <!-- Population and Location Stats -->
          <div class="grid grid-cols-2 gap-4 mb-6">
            <div class="text-center">
              <div class="text-2xl font-bold">6,593</div>
              <div class="text-xs text-white/70 mt-1">Population (2020)</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold">126 km</div>
              <div class="text-xs text-white/70 mt-1">from Manila</div>
            </div>
          </div>
          
          <!-- Description -->
          <p class="text-sm text-white/90 leading-relaxed mb-4">
            Pag-asa is a barangay in Olongapo City, situated on tidal flatland at the northeastern shore of Subic Bay, 
            with the Zambales Mountains on three sides. The area is known for its proximity to the 
            <span class="font-semibold">Subic Bay Freeport Zone</span> — once the largest American naval installation in Asia.
          </p>
          
          <p class="text-sm text-white/90 leading-relaxed mb-4">
            Today, the local economy thrives on commerce, manufacturing, logistics, tourism, and retail, 
            driven by its adjacency to the Freeport Zone.
          </p>
          
          <!-- Features -->
          <div class="flex flex-wrap gap-2 mt-4">
            <span class="text-xs bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full">🏭 Manufacturing Hub</span>
            <span class="text-xs bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full">🚢 Subic Bay Freeport</span>
            <span class="text-xs bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full">🌴 Tropical Climate</span>
            <span class="text-xs bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full">🏔️ Zambales Mountains</span>
          </div>
        </div>
        
        <!-- Mission Statement -->
        <!-- <div class="mt-6 backdrop-blur-sm bg-white/5 rounded-xl p-4 border border-white/10">
          <svg class="w-6 h-6 text-white/60 mb-2" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <p class="text-sm text-white/80 italic">
            "Modernizing Barangay Services Through Digital Innovation — 
            Bringing efficient resident profiling and management to the heart of Pag-Asa."
          </p>
        </div>-->
      </div> 
      
      <!-- Bottom - Footer Info -->
      <div class="mt-6 pt-4 border-t border-white/20 text-xs text-white/50">
        <p>© 2026 GeoProfile System · Barangay Pag-Asa Digital Transformation Initiative</p>
        <p class="mt-1">Part of Olongapo City's Smart Barangay Program</p>
      </div>
    </div>
  </div>
  
  <!-- Right Side - Login Form (40% width) -->
  <div class="flex-1 flex items-center justify-center px-4 py-10 bg-gradient-to-br from-slate-50 to-slate-100 md:w-[40%] md:flex-none">
    <div class="w-full max-w-md">
      
      <!-- Mobile Brand (visible only on mobile) -->
      <div class="md:hidden text-center mb-8">
        <div class="flex items-center justify-center gap-3 mb-2">
          <img 
            src="/pagasa-logo.jpg" 
            alt="Barangay Pag-Asa Logo" 
            class="w-12 h-12 object-contain"
          />
          <h1 class="font-nunito text-3xl font-black tracking-tight text-slate-800">
            <span class="font-light">Geo</span>Profile
          </h1>
        </div>
        <p class="text-sm text-slate-500">Barangay Pag-Asa · Olongapo City</p>
        <p class="text-xs text-slate-400 mt-1">Resident Profiling System</p>
      </div>

      <!-- Card -->
      <div class="bg-white rounded-3xl shadow-2xl px-7 py-8">
        
        <!-- Header -->
        <div class="mb-6 text-center">
          <p class="text-[0.65rem] font-bold tracking-widest uppercase text-slate-400 mb-1">Welcome back</p>
          <h2 class="font-nunito text-2xl font-extrabold text-slate-700">Sign In to Your Account</h2>
          <p class="text-sm text-slate-500 mt-2">Access the Barangay Pag-Asa Portal</p>
        </div>

        <!-- Role toggle -->
        <div class="flex gap-2 mb-6 p-1 bg-slate-100 rounded-2xl">
          <button
            type="button"
            on:click={() => role = 'staff'}
            class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all duration-200
                   {role === 'staff'
                     ? 'bg-white text-blue-700 shadow-sm'
                     : 'text-slate-400 hover:text-slate-600'}"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Staff
          </button>
          <button
            type="button"
            on:click={() => role = 'admin'}
            class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all duration-200
                   {role === 'admin'
                     ? 'bg-white text-blue-700 shadow-sm'
                     : 'text-slate-400 hover:text-slate-600'}"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Admin
          </button>
        </div>

        <!-- Role badge -->
        {#if role === 'admin'}
          <div class="mb-5 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <svg class="w-5 h-5 text-blue-600 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <div>
              <p class="text-xs font-bold text-blue-700">Administrator Access</p>
              <p class="text-[0.68rem] text-blue-500 leading-tight">Full dashboard &amp; management privileges</p>
            </div>
          </div>
        {:else}
          <div class="mb-5 flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <svg class="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <div>
              <p class="text-xs font-bold text-emerald-700">Staff Access</p>
              <p class="text-[0.68rem] text-emerald-500 leading-tight">QR generation, registration &amp; resident lookup</p>
            </div>
          </div>
        {/if}

        <!-- Error banner -->
        {#if errorMsg}
          <div class="mb-5 flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold px-4 py-3 rounded-xl">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
            <span>{errorMsg}</span>
          </div>
        {/if}

        <!-- Username -->
        <div class="mb-4">
          <label for="username" class="block text-[0.68rem] font-bold tracking-widest uppercase text-slate-400 mb-2">
            Username
          </label>
          <div class="relative">
            <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <input
              id="username"
              type="text"
              bind:value={username}
              placeholder="{role === 'admin' ? 'admin1' : 'staff1'}"
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
            <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
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
              class="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors p-1"
              aria-label="Toggle password visibility"
            >
              {#if showPass}
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              {:else}
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              {/if}
            </button>
          </div>
        </div>

        <!-- Login button -->
        <button
          type="button"
          on:click={handleLogin}
          disabled={loading}
          class="w-full flex items-center justify-center gap-2 py-3.5
                 active:scale-[0.98] text-white font-nunito font-extrabold text-base rounded-2xl shadow-lg
                 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100
                 transition-all duration-200 cursor-pointer"
          style="background: linear-gradient(to right, #1d4ed8, #3b82f6);"
        >
          {#if loading}
            <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            <span>Signing in…</span>
          {:else}
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            <span>Login</span>
          {/if}
        </button>

        <!-- Sign up link -->
        <p class="text-center text-xs text-slate-400 mt-4">
          Admin registration?
          <button type="button" on:click={() => { window.location.href = '/signup'; }}
            class="text-blue-600 font-semibold hover:underline ml-1 bg-transparent border-none cursor-pointer">
            Sign up here
          </button>
        </p>

        <!-- Forgot password -->
        <!-- <p class="text-center text-xs text-slate-400 mt-4">
          Forgot your password?
          <button
            type="button"
            on:click={() => { window.location.href = '/reset-password'; }}
            class="text-blue-600 font-semibold hover:underline ml-1 bg-transparent border-none cursor-pointer"
          >
            Reset here
          </button>
        </p> -->
      </div>
    </div>
  </div>
</div>

<!-- Success overlay -->
{#if success}
  <div class="fixed inset-0 z-50 backdrop-blur-sm flex items-center justify-center px-6"
    style="background: rgba(15,32,96,0.75);">
    <div class="bg-white rounded-3xl px-8 py-10 text-center max-w-xs w-full shadow-2xl animate-pop-in">
      <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4
                  {role === 'admin' ? 'bg-blue-100' : 'bg-emerald-100'}">
        {#if role === 'admin'}
          <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        {:else}
          <svg class="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        {/if}
      </div>
      <h3 class="font-nunito text-xl font-extrabold text-slate-700 mb-1">
        Welcome, {successName}!
      </h3>
      <p class="text-sm text-slate-400 mb-5">
        Redirecting to {role === 'admin' ? 'Admin' : 'Staff'} dashboard…
      </p>
      <div class="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div class="h-full rounded-full {role === 'admin' ? 'bg-blue-500' : 'bg-emerald-500'}"
          style="width: 100%; transition: width 2s ease;"></div>
      </div>
    </div>
  </div>
{/if}