<!-- src/routes/staff/+layout.svelte -->
<script>
  import { page } from '$app/stores';

  let mobileOpen = false;

  /** @type {{ label: string, href: string, icon: string }[]} */
  const navItems = [
    {
      label: 'Dashboard',
      href: '/staff/dashboard',
      icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
    },
    {
      label: 'Generate QR',
      href: '/staff/generateQR',
      icon: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 4h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z'
    },
    {
      label: 'Encode Registration',
      href: '/staff/encodeRegistration',
      icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z'
    },
    {
      label: 'Map View',
      href: '/staff/mapView',
      icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7'
    },
    {
      label: 'Residents',
      href: '/staff/residents',
      icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z'
    }
  ];

  /** @param {string} href */
  function isActive(href) {
    return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
  }

  /** @param {string} destination */
  function navigate(destination) {
    window.location.href = destination;
  }

  async function handleLogout() {
    try {
      const { auth }    = await import('$lib/firebase');
      const { signOut } = await import('firebase/auth');
      await signOut(auth);
    } catch { /* non-critical */ }
    window.location.href = '/';
  }
</script>

<div class="flex h-screen overflow-hidden bg-slate-100">

  <!-- Mobile backdrop -->
  {#if mobileOpen}
    <div
      class="fixed inset-0 z-20 bg-black/40 lg:hidden"
      on:click={() => (mobileOpen = false)}
      role="presentation"
    ></div>
  {/if}

  <!-- Sidebar -->
  <aside
    class="fixed inset-y-0 left-0 z-30 w-56 flex flex-col transition-transform duration-300 ease-in-out
           lg:translate-x-0 lg:static lg:z-auto
           {mobileOpen ? 'translate-x-0' : '-translate-x-full'}"
    style="background: linear-gradient(180deg, #064e3b 0%, #065f46 100%);"
  >
    <!-- Brand -->
    <div class="flex items-center gap-2.5 px-5 py-5 border-b border-white/10">
      <div class="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-base shadow">
        📍
      </div>
      <span class="font-nunito font-black text-white text-lg tracking-tight">
        <span class="font-light opacity-75">Geo</span>Profile
      </span>
    </div>

    <!-- Staff badge -->
    <div class="mx-3 mt-3 mb-1 px-3 py-2 rounded-xl bg-white/10 border border-white/10">
      <p class="text-[0.65rem] font-bold tracking-widest uppercase text-white/50 mb-0.5">Logged in as</p>
      <p class="text-xs font-bold text-white">Staff Member</p>
    </div>

    <!-- Nav items -->
    <nav class="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
      {#each navItems as item (item.href)}
        <button
          type="button"
          on:click={() => { navigate(item.href); mobileOpen = false; }}
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150
                 {isActive(item.href)
                   ? 'bg-white/15 text-white'
                   : 'text-white/60 hover:bg-white/10 hover:text-white'}"
        >
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
          </svg>
          {item.label}
          {#if isActive(item.href)}
            <span class="ml-auto w-1 h-5 rounded-full bg-emerald-300"></span>
          {/if}
        </button>
      {/each}
    </nav>

    <!-- Bottom: Logout -->
    <div class="px-3 py-4 border-t border-white/10">
      <button
        type="button"
        on:click={handleLogout}
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold
               text-white/60 hover:bg-red-500/20 hover:text-red-300 transition-all duration-150"
      >
        <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Logout
      </button>
    </div>
  </aside>

  <!-- Main content -->
  <div class="flex-1 flex flex-col overflow-hidden">

    <!-- Mobile topbar -->
    <header class="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
      <button
        type="button"
        on:click={() => (mobileOpen = !mobileOpen)}
        class="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
        aria-label="Toggle menu"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <span class="font-nunito font-black text-slate-700 text-lg">
        <span class="font-light text-slate-400">Geo</span>Profile
      </span>
      <span class="ml-auto text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
        Staff
      </span>
    </header>

    <!-- Page slot -->
    <main class="flex-1 overflow-y-auto">
      <slot />
    </main>
  </div>
</div>