<!-- src/routes/+layout.svelte -->


<script>
  import { page } from '$app/stores';

  let mobileOpen = false;

  

  /** @type {{ label: string, href: string, icon: string }[]} */
  const navItems = [
    {
      label: 'Dashboard',
      href: '/admin/dashboard',
      icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
    },
    {
      label: 'Residents',
      href: '/admin/residents',
      icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z'
    },
    {
      label: 'Map View',
      href: '/admin/mapView',
      icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7'
    },
    {
      label: 'Reports',
      href: '/admin/reports',
      icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
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
</script>

{#if $page.url.pathname.startsWith('/admin')}
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
      class="fixed inset-y-0 left-0 z-30 w-56 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto {mobileOpen ? 'translate-x-0' : '-translate-x-full'}"
      style="background: linear-gradient(180deg, #0f2060 0%, #1a3a80 100%);"
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

      <!-- Nav items -->
      <nav class="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
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
              <span class="ml-auto w-1 h-5 rounded-full bg-blue-300"></span>
            {/if}
          </button>
        {/each}
      </nav>

      <!-- Bottom: Settings + Logout -->
      <div class="px-3 py-4 border-t border-white/10 space-y-1">
        <button
          type="button"
          on:click={() => navigate('/admin/settings')}
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150
                 {isActive('/admin/settings')
                   ? 'bg-white/15 text-white'
                   : 'text-white/60 hover:bg-white/10 hover:text-white'}"
        >
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>

        <button
          type="button"
          on:click={() => navigate('/')}
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-white/60 hover:bg-red-500/20 hover:text-red-300 transition-all duration-150"
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
      </header>

      <!-- Page slot -->
      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>

  </div>

{:else}
  <slot />
{/if}