<!-- src/routes/admin/map/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  // ── Types ──────────────────────────────────────────────
  type Category = 'Regular' | 'PWD' | 'Senior' | 'Single Parent';
  type Status   = 'pending' | 'approved' | 'rejected';

  interface Resident {
    id: string;
    name: string;
    zone: string;
    sector: string;
    category: Category;
    isPWD: boolean;
    isSenior: boolean;
    isSingleParent: boolean;
    status: Status;
    lat: number;
    lng: number;
    address?: string;
    submittedAt?: any;
  }

  // ── State ──────────────────────────────────────────────
  let mapContainer: HTMLDivElement;
  let leafletMap: any   = null;
  let markers: any[]    = [];

  let residents: Resident[]      = [];
  let selectedResident: Resident | null = null;
  let nearbyResidents: Resident[] = [];

  let searchQuery = '';
  let filterZone  = 'All Zones';
  let loading     = true;
  let loadError   = '';

  let unsubs: (() => void)[] = [];

  const zones = ['All Zones', 'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'];

  // ── Category config ────────────────────────────────────
  const categoryConfig: Record<Category, { color: string; markerColor: string; avatarBg: string }> = {
    'Regular':      { color: 'bg-blue-100 text-blue-700',   markerColor: '#2563eb', avatarBg: '#2563eb' },
    'Senior':       { color: 'bg-emerald-100 text-emerald-700', markerColor: '#10b981', avatarBg: '#10b981' },
    'PWD':          { color: 'bg-amber-100 text-amber-700', markerColor: '#f59e0b', avatarBg: '#f59e0b' },
    'Single Parent':{ color: 'bg-violet-100 text-violet-700', markerColor: '#8b5cf6', avatarBg: '#8b5cf6' },
  };

  // ── Helpers ────────────────────────────────────────────
  function getCategory(r: any): Category {
    if (r.isPWD)          return 'PWD';
    if (r.isSenior)       return 'Senior';
    if (r.isSingleParent) return 'Single Parent';
    return 'Regular';
  }

  function getInitials(name: string) {
    return (name ?? '??').split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase();
  }

  // ── Filtered residents ─────────────────────────────────
  $: filteredResidents = residents.filter(r => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || r.name?.toLowerCase().includes(q) || r.zone?.toLowerCase().includes(q) || r.category?.toLowerCase().includes(q);
    const matchZone   = filterZone === 'All Zones' || r.zone === filterZone;
    return matchSearch && matchZone;
  });

  // ── Update markers when filter changes ─────────────────
  $: if (leafletMap) updateMarkers(filteredResidents);

  // ── Firebase + Leaflet init ────────────────────────────
  onMount(async () => {
    // Load Leaflet CSS
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    // Load Leaflet JS
    await new Promise<void>((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => resolve();
      document.head.appendChild(script);
    });

    // Init map — locked to Brgy. Pag-asa, Olongapo City
    // Boundaries: 12th St (N), Magsaysay Dr (S), Kalaklan Channel (E), Gordon Ave (W)
    const L = (window as any).L;

    const pagAsaCenter = [14.8270, 120.2867];
    const pagAsaBounds = L.latLngBounds(
      [14.8240, 120.2835], // SW corner (Magsaysay Dr / Gordon Ave)
      [14.8305, 120.2900]  // NE corner (12th St / Kalaklan Channel)
    );

    leafletMap = L.map(mapContainer, {
      center: pagAsaCenter,
      zoom: 17,
      zoomControl: false,
      minZoom: 16,
      maxZoom: 19,
      maxBounds: pagAsaBounds,
      maxBoundsViscosity: 1.0, // fully restrict panning outside bounds
    });

    // Tile layer — light CartoDB style
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(leafletMap);

    // Draw barangay boundary highlight
    L.rectangle(pagAsaBounds, {
      color: '#2563eb',
      weight: 2,
      dashArray: '6 4',
      fillColor: '#2563eb',
      fillOpacity: 0.04,
    }).addTo(leafletMap);

    // Move zoom controls to bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);

    // Load residents from Firebase
    try {
      const { db } = await import('$lib/firebase');
      const { collection, query, where, onSnapshot } = await import('firebase/firestore');

      unsubs.push(onSnapshot(
        query(collection(db, 'residents'), where('status', '==', 'approved')),
        snap => {
          residents = snap.docs
            .map(d => {
              const data = d.data();
              const category = getCategory(data);
              return { id: d.id, category, ...data } as Resident;
            })
            .filter(r => r.lat && r.lng); // only those with GPS
          loading = false;
        },
        err => {
          loadError = 'Could not load map data.';
          loading   = false;
          console.error(err);
          // Load demo data for preview
          loadDemoData();
        }
      ));
    } catch (e) {
      loadError = '';
      loading   = false;
      loadDemoData();
    }
  });

  onDestroy(() => {
    unsubs.forEach(u => u());
    if (leafletMap) leafletMap.remove();
  });

  // ── Demo data (fallback) ───────────────────────────────
  function loadDemoData() {
    residents = [
      { id: '1', name: 'Juan Dela Cruz',   zone: 'Zone 2', sector: 'Zone 2', category: 'PWD',          isPWD: true,  isSenior: false, isSingleParent: false, status: 'approved', lat: 14.8278, lng: 120.2860, address: 'Purok Rosal, Brgy. Pag-asa' },
      { id: '2', name: 'Maria Santos',     zone: 'Zone 2', sector: 'Zone 2', category: 'Senior',        isPWD: false, isSenior: true,  isSingleParent: false, status: 'approved', lat: 14.8265, lng: 120.2875, address: 'Purok Ilang-Ilang, Brgy. Pag-asa' },
      { id: '3', name: 'Roberto Reyes',    zone: 'Zone 1', sector: 'Zone 1', category: 'Regular',       isPWD: false, isSenior: false, isSingleParent: false, status: 'approved', lat: 14.8290, lng: 120.2848, address: 'Purok Sampaguita, Brgy. Pag-asa' },
      { id: '4', name: 'Ana Reyes',        zone: 'Zone 4', sector: 'Zone 4', category: 'Single Parent', isPWD: false, isSenior: false, isSingleParent: true,  status: 'approved', lat: 14.8252, lng: 120.2882, address: 'Purok Gumamela, Brgy. Pag-asa' },
      { id: '5', name: 'Pedro Lim',        zone: 'Zone 3', sector: 'Zone 3', category: 'Senior',        isPWD: false, isSenior: true,  isSingleParent: false, status: 'approved', lat: 14.8260, lng: 120.2855, address: 'Purok Rosas, Brgy. Pag-asa' },
    ];
    loading = false;
  }

  // ── Create custom SVG pin marker ──────────────────────
  function createMarkerIcon(color: string, isSelected = false) {
    const L = (window as any).L;
    const size = isSelected ? 44 : 36;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 40 50">
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.25)"/>
        </filter>
        <path d="M20 2C12.268 2 6 8.268 6 16c0 10 14 30 14 30s14-20 14-30C34 8.268 27.732 2 20 2z"
          fill="${color}" filter="url(#shadow)" ${isSelected ? 'stroke="white" stroke-width="2"' : ''}/>
        <circle cx="20" cy="16" r="6" fill="white" opacity="0.9"/>
      </svg>`;
    return L.divIcon({
      html: svg,
      className: '',
      iconSize:   [size, size + 10],
      iconAnchor: [size / 2, size + 10],
      popupAnchor:[0, -(size + 10)],
    });
  }

  // ── Render markers ─────────────────────────────────────
  function updateMarkers(list: Resident[]) {
    const L = (window as any).L;
    // Clear old markers
    markers.forEach(m => m.remove());
    markers = [];

    list.forEach(r => {
      const cfg    = categoryConfig[r.category] ?? categoryConfig['Regular'];
      const isSelected = selectedResident?.id === r.id;
      const icon   = createMarkerIcon(cfg.markerColor, isSelected);
      const marker = L.marker([r.lat, r.lng], { icon })
        .addTo(leafletMap)
        .on('click', () => selectResident(r));

      // Name label tooltip
      marker.bindTooltip(r.name.split(' ').slice(0, 2).map((n: string, i: number) => i === 0 ? n[0] + '.' : n).join(' '), {
        permanent: true,
        direction: 'top',
        offset: [0, -10],
        className: 'map-label',
      });

      markers.push(marker);
    });
  }

  // ── Select a resident ──────────────────────────────────
  function selectResident(r: Resident) {
    selectedResident = r;
    // Nearby: same zone, excluding self
    nearbyResidents = residents
      .filter(x => x.id !== r.id && x.zone === r.zone)
      .slice(0, 3);
    // Pan to selected
    if (leafletMap) leafletMap.panTo([r.lat, r.lng], { animate: true, duration: 0.5 });
    // Re-render markers to update selected state
    updateMarkers(filteredResidents);
  }
</script>

<!-- ── Leaflet label style ─────────────────────────────── -->
<svelte:head>
  <style>
    .map-label {
      background: white !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 6px !important;
      padding: 2px 7px !important;
      font-family: 'Inter', sans-serif !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      color: #334155 !important;
      box-shadow: 0 1px 4px rgba(0,0,0,0.10) !important;
      white-space: nowrap !important;
    }
    .map-label::before { display: none !important; }
    .leaflet-control-zoom {
      border: none !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.12) !important;
    }
    .leaflet-control-zoom a {
      width: 32px !important;
      height: 32px !important;
      line-height: 32px !important;
      font-size: 16px !important;
      border-radius: 8px !important;
      margin-bottom: 4px !important;
      color: #334155 !important;
    }
  </style>
</svelte:head>

<!-- ── PAGE ───────────────────────────────────────────── -->
<div class="flex flex-col h-full bg-slate-100 font-inter overflow-hidden" style="height: calc(100vh - 0px);">

  <!-- Top bar -->
  <div class="px-6 pt-5 pb-3 flex flex-col gap-3 bg-slate-100 z-10">

    <!-- Search -->
    <div class="relative max-w-lg">
      <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/>
      </svg>
      <input
        bind:value={searchQuery}
        type="text"
        placeholder="Search resident on map..."
        class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm"
      />
    </div>

    <!-- Zone pills -->
    <div class="flex gap-2">
      {#each zones as z}
        <button type="button"
          on:click={() => filterZone = z}
          class="text-sm font-bold px-4 py-1.5 rounded-full border transition-all
            {filterZone === z
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'}">
          {z}
        </button>
      {/each}
    </div>
  </div>

  <!-- Map + Side panel row -->
  <div class="flex flex-1 gap-4 px-6 pb-6 overflow-hidden min-h-0">

    <!-- ── Map ── -->
    <div class="flex-1 relative rounded-2xl overflow-hidden shadow-sm border border-slate-200 bg-slate-200">
      {#if loading}
        <div class="absolute inset-0 z-20 flex items-center justify-center bg-slate-100">
          <div class="flex flex-col items-center gap-3 text-slate-400">
            <svg class="w-8 h-8 animate-spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" d="M12 2a10 10 0 0 1 0 20"/>
            </svg>
            <p class="text-sm font-semibold">Loading map…</p>
          </div>
        </div>
      {/if}

      <!-- Leaflet mount -->
      <div bind:this={mapContainer} class="absolute inset-0 z-0"></div>

      <!-- Legend overlay -->
      <div class="absolute bottom-4 left-4 z-10 bg-white rounded-xl shadow-md border border-slate-100 px-4 py-3">
        <p class="text-[0.6rem] font-extrabold tracking-widest text-slate-400 uppercase mb-2">Legend</p>
        <div class="space-y-1.5">
          {#each Object.entries(categoryConfig) as [cat, cfg]}
            <div class="flex items-center gap-2">
              <svg class="w-3 h-3 shrink-0" viewBox="0 0 12 14" fill={cfg.markerColor}>
                <path d="M6 0C3.24 0 1 2.24 1 5c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5z"/>
              </svg>
              <span class="text-xs font-semibold text-slate-600">{cat}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Resident count badge -->
      <div class="absolute top-3 right-3 z-10 bg-white rounded-lg shadow-sm border border-slate-100 px-3 py-1.5 flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
        <span class="text-xs font-bold text-slate-600">{filteredResidents.length} residents</span>
      </div>
    </div>

    <!-- ── Side panel ── -->
    <div class="w-64 shrink-0 flex flex-col gap-3 overflow-y-auto">

      <!-- Selected card -->
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100">
          <p class="text-[0.6rem] font-extrabold tracking-widest text-slate-400 uppercase">Selected</p>
        </div>

        {#if selectedResident}
          {@const cfg = categoryConfig[selectedResident.category] ?? categoryConfig['Regular']}
          <div class="p-4 flex flex-col gap-3">
            <!-- Avatar + info -->
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-full flex items-center justify-center font-nunito font-black text-base text-white shrink-0 shadow-sm"
                style="background:{cfg.avatarBg};">
                {getInitials(selectedResident.name)}
              </div>
              <div class="min-w-0">
                <p class="font-nunito font-extrabold text-slate-800 text-sm leading-tight truncate">{selectedResident.name}</p>
                <p class="text-xs text-slate-400 mt-0.5">
                  <span class="{cfg.color} text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full">{selectedResident.category}</span>
                  · {selectedResident.zone}
                </p>
              </div>
            </div>

            <!-- Address -->
            {#if selectedResident.address}
              <div class="flex items-start gap-1.5 text-slate-500">
                <svg class="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z"/>
                </svg>
                <span class="text-xs">{selectedResident.address}</span>
              </div>
            {/if}

            <!-- View button -->
            <button type="button"
              on:click={() => window.location.href = `/admin/residents/${selectedResident?.id}`}
              class="w-full flex items-center justify-center gap-1.5 text-sm font-bold text-white py-2.5 rounded-xl transition-all active:scale-95"
              style="background:#2563eb;">
              View Resident →
            </button>
          </div>
        {:else}
          <div class="p-6 flex flex-col items-center text-slate-300">
            <svg class="w-10 h-10 mb-2 opacity-50" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/>
            </svg>
            <p class="text-xs font-semibold text-center">Click a pin on the map to view resident details</p>
          </div>
        {/if}
      </div>

      <!-- Nearby card -->
      {#if selectedResident && nearbyResidents.length > 0}
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-100">
            <p class="text-[0.6rem] font-extrabold tracking-widest text-slate-400 uppercase">Nearby</p>
          </div>
          <div class="divide-y divide-slate-50">
            {#each nearbyResidents as nr (nr.id)}
              {@const cfg = categoryConfig[nr.category] ?? categoryConfig['Regular']}
              <button type="button"
                on:click={() => selectResident(nr)}
                class="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
                <div class="w-9 h-9 rounded-full flex items-center justify-center font-nunito font-black text-sm text-white shrink-0"
                  style="background:{cfg.avatarBg};">
                  {getInitials(nr.name)}
                </div>
                <div class="min-w-0">
                  <p class="font-bold text-slate-700 text-sm truncate">{nr.name}</p>
                  <p class="text-xs text-slate-400">{nr.category} · {nr.zone}</p>
                </div>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Zone summary card -->
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100">
          <p class="text-[0.6rem] font-extrabold tracking-widest text-slate-400 uppercase">Zone Summary</p>
        </div>
        <div class="p-4 space-y-2">
          {#each zones.slice(1) as z}
            {@const count = residents.filter(r => r.zone === z).length}
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-600">{z}</span>
              <div class="flex items-center gap-2">
                <div class="h-1.5 rounded-full bg-blue-100 w-20 overflow-hidden">
                  <div class="h-full rounded-full bg-blue-500 transition-all"
                    style="width:{residents.length ? (count / residents.length * 100) : 0}%">
                  </div>
                </div>
                <span class="text-xs font-bold text-slate-700 w-4 text-right">{count}</span>
              </div>
            </div>
          {/each}
        </div>
      </div>

    </div>
  </div>
</div>