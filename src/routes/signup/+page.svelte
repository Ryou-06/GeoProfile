<!-- src/routes/signup/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  onMount(async () => {
    try {
      const { auth } = await import('$lib/firebase');
      const { db }   = await import('$lib/firebase');
      const { onAuthStateChanged } = await import('firebase/auth');
      const { doc, getDoc }        = await import('firebase/firestore');
      onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (snap.exists()) {
            const data = snap.data() as { role?: string };
            const r = data?.role;
            window.location.href = r === 'admin' ? '/admin/dashboard' : '/staff/dashboard';
          }
        } catch { /* non-critical */ }
      });
    } catch { /* non-critical */ }
  });

  let username: string = '';
  let name: string = '';
  let position: string = '';
  let password: string = '';
  let confirm: string = '';

  let showPass: boolean = false;
  let showConf: boolean = false;
  let loading: boolean = false;
  let errorMsg: string = '';
  let success: boolean = false;

  let usernameChecking: boolean = false;
  let usernameAvailable: boolean | null = null;

  let usernameTimeout: ReturnType<typeof setTimeout> | null = null;

  const adminPositions: string[] = [
    'Barangay Captain',
    'Barangay Secretary',
    'Barangay Treasurer',
    'IT Officer / Encoder'
  ];

  async function checkUsername(): Promise<void> {
    if (!username.trim() || username.length < 3) {
      usernameAvailable = null;
      return;
    }

    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username)) {
      usernameAvailable = false;
      return;
    }

    usernameChecking = true;
    try {
      const { db } = await import('$lib/firebase');
      const { doc, getDoc } = await import('firebase/firestore');
      
      const usernameDoc = await getDoc(doc(db, 'usernames', username.toLowerCase().trim()));
      usernameAvailable = !usernameDoc.exists();
    } catch {
      usernameAvailable = null;
    }
    usernameChecking = false;
  }

  $: if (username) {
    if (usernameTimeout) clearTimeout(usernameTimeout);
    usernameTimeout = setTimeout(() => {
      checkUsername();
    }, 500);
  }

  async function handleSignup() {
    errorMsg = '';
    
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!username.trim()) { errorMsg = 'Please enter a username.'; return; }
    if (username.length < 3) { errorMsg = 'Username must be at least 3 characters.'; return; }
    if (username.length > 20) { errorMsg = 'Username must be 20 characters or less.'; return; }
    if (!usernameRegex.test(username)) { errorMsg = 'Username can only contain letters, numbers, underscores, and dashes.'; return; }
    
    const reserved = ['admin', 'root', 'system', 'administrator', 'superuser', 'moderator'];
    if (reserved.includes(username.toLowerCase())) { errorMsg = 'This username is reserved. Please choose another.'; return; }
    
    if (!name.trim()) { errorMsg = 'Please enter your full name.'; return; }
    if (!position) { errorMsg = 'Please select your position.'; return; }
    if (!password) { errorMsg = 'Please enter a password.'; return; }
    if (password.length < 8) { errorMsg = 'Password must be at least 8 characters.'; return; }
    if (password !== confirm) { errorMsg = 'Passwords do not match.'; return; }
    
    loading = true;
    
    try {
      const { auth } = await import('$lib/firebase');
      const { db }   = await import('$lib/firebase');
      const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
      const { doc, setDoc, getDoc, serverTimestamp } = await import('firebase/firestore');
      
      const usernameDoc = await getDoc(doc(db, 'usernames', username.toLowerCase().trim()));
      if (usernameDoc.exists()) {
        errorMsg = 'This username is already taken. Please choose another.';
        loading = false;
        return;
      }
      
      const email = `${username.toLowerCase().trim()}@admin.geoprofile.local`;
      
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: name.trim() });
      
      await setDoc(doc(db, 'users', credential.user.uid), {
        username: username.toLowerCase().trim(),
        name: name.trim(),
        email: email,
        position,
        role: 'admin',
        createdAt: serverTimestamp(),
      });
      
      await setDoc(doc(db, 'usernames', username.toLowerCase().trim()), {
        email: email,
        uid: credential.user.uid,
      });
      
      success = true;
      setTimeout(() => {
        window.location.href = '/admin/dashboard';
      }, 2000);
    } catch (e) {
      const code = (e as { code?: string })?.code ?? '';
      switch (code) {
        case 'auth/email-already-in-use': errorMsg = 'This username is already registered.'; break;
        case 'auth/invalid-email':        errorMsg = 'Invalid username format.'; break;
        case 'auth/weak-password':        errorMsg = 'Password is too weak. Use at least 8 characters.'; break;
        default:                          errorMsg = 'Something went wrong. Please try again.';
      }
      loading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) { if (e.key === 'Enter') handleSignup(); }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Split Screen Layout - Left side bigger (60/40 ratio) - SAME AS LOGIN -->
<div class="min-h-screen flex flex-col md:flex-row">
  
  <!-- Left Side - Image Section (60% width) - SAME AS LOGIN -->
  <div class="hidden md:flex md:w-[60%] relative overflow-hidden">
    <!-- Background Image -->
    <img 
      src="/brgyhall.jpg" 
      alt="Barangay Pag-Asa Hall" 
      class="absolute inset-0 w-full h-full object-cover"
    />
    
    <!-- Dark Gradient Overlay -->
    <div class="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/60 to-blue-900/70"></div>
    
    <!-- Pag-Asa Logo - Top Right Corner -->
    <div class="absolute top-6 right-6 z-20">
      <img 
        src="/pagasa-logo.jpg" 
        alt="Barangay Pag-Asa Logo" 
        class="w-16 h-16 object-contain bg-white/10 backdrop-blur-sm rounded-xl p-2 shadow-lg border border-white/20"
      />
    </div>
    
    <!-- Content overlay -->
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
      </div> 
      
      <!-- Bottom - Footer Info -->
      <div class="mt-6 pt-4 border-t border-white/20 text-xs text-white/50">
        <p>© 2026 GeoProfile System · Barangay Pag-Asa Digital Transformation Initiative</p>
        <p class="mt-1">Part of Olongapo City's Smart Barangay Program</p>
      </div>
    </div>
  </div>
  
  <!-- Right Side - Signup Form (40% width) - SAME STYLE AS LOGIN -->
  <div class="flex-1 flex items-center justify-center px-4 py-10 bg-gradient-to-br from-slate-50 to-slate-100 md:w-[40%] md:flex-none">
    <div class="w-full max-w-md">
      
      <!-- Mobile Brand (visible only on mobile) - SAME AS LOGIN -->
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

      <!-- Card - SAME STYLING AS LOGIN -->
      <div class="bg-white rounded-3xl shadow-2xl px-7 py-8">
        
        <!-- Header -->
        <div class="mb-6 text-center">
          <p class="text-[0.65rem] font-bold tracking-widest uppercase text-slate-400 mb-1">Barangay Pag-Asa</p>
          <h2 class="font-nunito text-2xl font-extrabold text-slate-700">Admin Registration</h2>
          <p class="text-sm text-slate-500 mt-2">Create administrator account</p>
        </div>

        <!-- Admin info badge - SAME AS LOGIN'S ROLE BADGE STYLE -->
        <div class="mb-5 flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <svg class="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="text-[0.68rem] text-blue-600 leading-relaxed">
            For <strong>Barangay Officials</strong> — Captain, Secretary, Treasurer, and IT Officers with full system access.
          </p>
        </div>

        <!-- Error banner - SAME AS LOGIN -->
        {#if errorMsg}
          <div class="mb-5 flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold px-4 py-3 rounded-xl">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
            <span>{errorMsg}</span>
          </div>
        {/if}

        <!-- Username - SAME AS LOGIN -->
        <div class="mb-4">
          <label for="username" class="block text-[0.68rem] font-bold tracking-widest uppercase text-slate-400 mb-2">
            Username
          </label>
          <div class="relative">
            <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <input 
              id="username" 
              type="text" 
              bind:value={username} 
              placeholder="admin1" 
              disabled={loading}
              class="w-full pl-10 pr-10 py-3 rounded-xl border-2 text-slate-700 text-sm placeholder-slate-300 outline-none focus:ring-4 focus:bg-white disabled:opacity-50 transition-all
                     {usernameAvailable === false ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-100' : usernameAvailable === true ? 'border-green-300 bg-green-50 focus:border-green-400 focus:ring-green-100' : 'border-slate-200 bg-slate-50 focus:border-blue-500 focus:ring-blue-100'}" />
            {#if usernameChecking}
              <svg class="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
            {:else if usernameAvailable === true}
              <svg class="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            {:else if usernameAvailable === false}
              <svg class="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            {/if}
          </div>
          {#if username.trim() && username.length < 3}
            <p class="text-[0.65rem] text-slate-400 mt-1.5 ml-1">Username must be at least 3 characters</p>
          {:else if usernameAvailable === false}
            <p class="text-[0.65rem] text-red-500 font-semibold mt-1.5 ml-1">✗ Username already taken</p>
          {:else if usernameAvailable === true}
            <p class="text-[0.65rem] text-green-500 font-semibold mt-1.5 ml-1">✓ Username available</p>
          {:else}
            <p class="text-[0.65rem] text-slate-400 mt-1.5 ml-1">3-20 characters, letters, numbers, _ and -</p>
          {/if}
        </div>

        <!-- Row 1: Full Name + Position - SAME GRID STYLE AS LOGIN -->
        <div class="grid grid-cols-2 gap-4 mb-4">
          <!-- Full name -->
          <div>
            <label for="name" class="block text-[0.68rem] font-bold tracking-widest uppercase text-slate-400 mb-2">
              Full Name
            </label>
            <div class="relative">
              <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <input 
                id="name" 
                type="text" 
                bind:value={name} 
                placeholder="Juan dela Cruz" 
                disabled={loading}
                class="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:opacity-50 transition-all" 
              />
            </div>
          </div>

          <!-- Position -->
          <div>
            <label for="position" class="block text-[0.68rem] font-bold tracking-widest uppercase text-slate-400 mb-2">
              Position
            </label>
            <div class="relative">
              <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <select 
                id="position" 
                bind:value={position} 
                disabled={loading}
                class="w-full pl-10 pr-8 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:opacity-50 transition-all appearance-none cursor-pointer
                       {position === '' ? 'text-slate-400' : 'text-slate-700'}">
                <option value="" disabled selected>Select position</option>
                {#each adminPositions as pos (pos)}
                  <option value={pos}>{pos}</option>
                {/each}
              </select>
              <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        <!-- Row 2: Password + Confirm - SAME GRID STYLE AS LOGIN -->
        <div class="grid grid-cols-2 gap-4 mb-6">
          <!-- Password -->
          <div>
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
                placeholder="Min. 8 chars" 
                autocomplete="new-password" 
                disabled={loading}
                class="w-full pl-10 pr-10 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:opacity-50 transition-all" 
              />
              <button 
                type="button" 
                on:click={() => showPass = !showPass}
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors p-0.5">
                {#if showPass}
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                {:else}
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                {/if}
              </button>
            </div>
          </div>

          <!-- Confirm Password -->
          <div>
            <label for="confirm" class="block text-[0.68rem] font-bold tracking-widest uppercase text-slate-400 mb-2">
              Confirm Password
            </label>
            <div class="relative">
              <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <input 
                id="confirm" 
                type={showConf ? 'text' : 'password'} 
                bind:value={confirm}
                placeholder="Re-enter password" 
                autocomplete="new-password" 
                disabled={loading}
                class="w-full pl-10 pr-10 py-3 rounded-xl border-2 text-slate-700 text-sm placeholder-slate-300 outline-none focus:ring-4 focus:bg-white disabled:opacity-50 transition-all
                       {confirm && password !== confirm ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-100' : confirm && password === confirm ? 'border-green-300 bg-green-50 focus:border-green-400 focus:ring-green-100' : 'border-slate-200 bg-slate-50 focus:border-blue-500 focus:ring-blue-100'}" />
              <button 
                type="button" 
                on:click={() => showConf = !showConf}
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors p-0.5">
                {#if showConf}
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                {:else}
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                {/if}
              </button>
            </div>
            {#if confirm && password !== confirm}
              <p class="text-[0.65rem] text-red-500 font-semibold mt-1.5 ml-1">✗ Passwords do not match</p>
            {:else if confirm && password === confirm}
              <p class="text-[0.65rem] text-green-500 font-semibold mt-1.5 ml-1">✓ Passwords match</p>
            {/if}
          </div>
        </div>

        <!-- Submit button - SAME STYLE AS LOGIN -->
        <button 
          type="button" 
          on:click={handleSignup} 
          disabled={loading || usernameAvailable === false}
          class="w-full flex items-center justify-center gap-2 py-3.5 active:scale-[0.98] text-white font-nunito font-extrabold text-base rounded-2xl shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          style="background: linear-gradient(to right, #1d4ed8, #3b82f6);">
          {#if loading}
            <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            <span>Creating account…</span>
          {:else}
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            <span>Create Admin Account</span>
          {/if}
        </button>

        <!-- Sign in link - SAME AS LOGIN -->
        <p class="text-center text-xs text-slate-400 mt-4">
          Already have an account?
          <button 
            type="button" 
            on:click={() => { window.location.href = '/'; }}
            class="text-blue-600 font-semibold hover:underline ml-1 bg-transparent border-none cursor-pointer">
            Sign in here
          </button>
        </p>
      </div>
    </div>
  </div>
</div>

<!-- Success overlay - SAME AS LOGIN -->
{#if success}
  <div class="fixed inset-0 z-50 backdrop-blur-sm flex items-center justify-center px-6"
    style="background: rgba(15,32,96,0.75);">
    <div class="bg-white rounded-3xl px-8 py-10 text-center max-w-xs w-full shadow-2xl animate-pop-in">
      <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-blue-100">
        <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h3 class="font-nunito text-xl font-extrabold text-slate-700 mb-1">Account Created!</h3>
      <p class="text-sm text-slate-500 mb-0.5">Welcome, {name}!</p>
      <p class="text-xs text-slate-400 mb-5">{position} · Barangay Pag-Asa</p>
      <div class="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div class="h-full rounded-full bg-blue-500" style="width: 100%; transition: width 2s ease;"></div>
      </div>
    </div>
  </div>
{/if}