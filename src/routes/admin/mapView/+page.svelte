<!-- src/routes/admin/mapView/+page.svelte -->
<!-- ADMIN HOUSEHOLD-BASED MAP VIEW — Click households to see all residents -->
<script>
  import { onMount, onDestroy } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import ResidentProfileModal from '$lib/components/ResidentProfileModal.svelte';

  // ── State ──────────────────────────────────────────────
  /** @type {HTMLDivElement} */
  let mapContainer;
  /** @type {any} */
  let leafletMap = null;
  /** @type {any[]} */
  let markers = [];

  /** @type {any[]} */
  let households = [];
  /** @type {any[]} */
  let allResidents = [];
  /** @type {any} */
  let selectedHousehold = null;
  /** @type {any[]} */
  let selectedHouseholdResidents = [];
  /** @type {any} */
  let profileResident = null;

  let searchQuery = '';
  let filterZone = 'All Zones';
  let loading = true;
  /** @type {string | null} */
  let loadError = null;
  let showDebug = false;

  /** @type {(() => void)[]} */
  let unsubs = [];

  const zones = ['All Zones', 'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'];

  /** @type {Record<string, { markerColor: string, avatarBg: string, badgeClass: string }>} */
  const categoryConfig = {
    'Regular': { markerColor: '#2563eb', avatarBg: '#2563eb', badgeClass: 'bg-blue-100 text-blue-700' },
    'Senior': { markerColor: '#10b981', avatarBg: '#10b981', badgeClass: 'bg-emerald-100 text-emerald-700' },
    'PWD': { markerColor: '#f59e0b', avatarBg: '#f59e0b', badgeClass: 'bg-amber-100 text-amber-700' },
    'Single Parent': { markerColor: '#8b5cf6', avatarBg: '#8b5cf6', badgeClass: 'bg-violet-100 text-violet-700' },
  };

  /** @param {any} r */
  function getCategory(r) {
    if (r.isPWD) return 'PWD';
    if (r.isSenior) return 'Senior';
    if (r.isSingleParent) return 'Single Parent';
    return 'Regular';
  }

  /** @param {string} name */
  function getInitials(name) {
    return (name ?? '??').split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
  }

  // ── Get household marker color based on residents ──────
  /** @param {any[]} residents */
  function getHouseholdMarkerColor(residents) {
    if (residents.some(r => r.isPWD)) return categoryConfig['PWD'].markerColor;
    if (residents.some(r => r.isSenior)) return categoryConfig['Senior'].markerColor;
    if (residents.some(r => r.isSingleParent)) return categoryConfig['Single Parent'].markerColor;
    return categoryConfig['Regular'].markerColor;
  }

  // ── Filtered households ────────────────────────────────
  $: filteredHouseholds = households.filter(h => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || 
      h.address?.toLowerCase().includes(q) || 
      h.zone?.toLowerCase().includes(q) ||
      h.residents.some(/** @param {any} r */ r => r.name?.toLowerCase().includes(q));
    const matchZone = filterZone === 'All Zones' || h.zone === filterZone;
    return matchSearch && matchZone;
  });

  $: if (leafletMap) updateMarkers(filteredHouseholds);

  // Debug info
  $: residentsWithGPS = allResidents.filter(r => r.lat && r.lng).length;
  $: residentsWithoutGPS = allResidents.filter(r => !r.lat || !r.lng).length;

  onMount(async () => {
    // Load Leaflet CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    // Load Leaflet JS
    await new Promise(/** @param {(value: void) => void} resolve */ (resolve) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => resolve();
      document.head.appendChild(script);
    });

    const L = /** @type {any} */ (window).L;

    const pagAsaCenter = [14.8270, 120.2867];

    leafletMap = L.map(mapContainer, {
      center: pagAsaCenter,
      zoom: 15,
      zoomControl: false,
      minZoom: 3,
      maxZoom: 19,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(leafletMap);

    const pagAsaBounds = L.latLngBounds([14.8240, 120.2835], [14.8305, 120.2900]);
    L.rectangle(pagAsaBounds, {
      color: '#2563eb',
      weight: 2,
      dashArray: '6 4',
      fillColor: '#2563eb',
      fillOpacity: 0.04,
    }).addTo(leafletMap);

    L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);

    // Load households and residents
    try {
      const { db } = await import('$lib/firebase');
      const { collection, query, where, onSnapshot } = await import('firebase/firestore');

      // Load all approved residents
      unsubs.push(onSnapshot(
        query(collection(db, 'residents'), where('status', '==', 'approved')),
        snap => {
          allResidents = snap.docs.map(d => {
            const data = d.data();
            return /** @type {any} */ ({ 
              id: d.id, 
              category: getCategory(data), 
              ...data 
            });
          });
          
          console.log('📊 Total residents loaded:', allResidents.length);
          console.log('📍 Residents with GPS:', allResidents.filter(r => r.lat && r.lng).length);
          console.log('❌ Residents without GPS:', allResidents.filter(r => !r.lat && !r.lng).length);
          
          if (allResidents.length > 0) {
            console.log('Sample resident data:', allResidents[0]);
          }
          
          groupResidentsByHousehold();
          loading = false;
        },
        err => {
          loading = false;
          loadError = err.message;
          console.error('Error loading residents:', err);
        }
      ));
    } catch (err) {
      loading = false;
      loadError = /** @type {Error} */ (err).message;
      console.error('Error in onMount:', err);
    }
  });

  onDestroy(() => {
    unsubs.forEach(u => u());
    if (leafletMap) leafletMap.remove();
  });

  // ── Group residents by household ───────────────────────
  function groupResidentsByHousehold() {
    const householdMap = new SvelteMap();

    allResidents.forEach(resident => {
      const householdId = resident.householdId || resident.qrId || `standalone_${resident.id}`;
      
      const lat = resident.lat ?? resident.latitude ?? resident.gpsLat;
      const lng = resident.lng ?? resident.longitude ?? resident.gpsLng;
      
      if (!householdMap.has(householdId)) {
        householdMap.set(householdId, {
          id: householdId,
          qrId: resident.qrId,
          houseNo: resident.houseNo || '',
          street: resident.street || '',
          zone: resident.zone || resident.purok || '',
          address: resident.address || '',
          landmark: resident.landmark || '',
          lat: lat,
          lng: lng,
          residents: [],
        });
      } else {
        const household = householdMap.get(householdId);
        if (household && !household.lat && lat) {
          household.lat = lat;
        }
        if (household && !household.lng && lng) {
          household.lng = lng;
        }
      }

      householdMap.get(householdId)?.residents.push(resident);
    });

    const allHouseholds = Array.from(householdMap.values());
    households = allHouseholds.filter(h => h.lat && h.lng);
    
    console.log('🏠 Total households:', allHouseholds.length);
    console.log('📍 Households with GPS:', households.length);
    console.log('❌ Households without GPS:', allHouseholds.filter(h => !h.lat || !h.lng).length);
    
    const noGPS = allHouseholds.filter(h => !h.lat || !h.lng);
    if (noGPS.length > 0) {
      console.log('Households missing GPS:', noGPS);
    }
  }

/** @param {string} houseNo @param {boolean} isSelected @param {number} count */
function createHouseholdMarkerIcon(houseNo, isSelected = false, count = 0) {
  const L = /** @type {any} */ (window).L;
  const label = houseNo?.trim().slice(0, 6) || '?'; // max 6 chars to fit
  const size  = isSelected ? 52 : 44;
  const pinColor  = isSelected ? '#1d4ed8' : '#2563eb';
  const textSize  = label.length <= 3 ? 10 : label.length <= 5 ? 8 : 7;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 14}" viewBox="0 0 44 58">
      <filter id="sh" x="-30%" y="-20%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="rgba(0,0,0,0.22)"/>
      </filter>
      <!-- Pin body -->
      <path d="M22 2C13.163 2 6 9.163 6 18c0 11.25 16 36 16 36s16-24.75 16-36C38 9.163 30.837 2 22 2z"
        fill="${pinColor}" filter="url(#sh)"
        ${isSelected ? 'stroke="white" stroke-width="2"' : ''}/>
      <!-- White circle background for label -->
      <circle cx="22" cy="18" r="11" fill="white" opacity="0.95"/>
      <!-- House number text -->
      <text x="22" y="22" text-anchor="middle"
        fill="${pinColor}" font-size="${textSize}" font-weight="800"
        font-family="Inter,Arial,sans-serif">${label}</text>
      <!-- Resident count badge -->
      ${count > 1 ? `
        <circle cx="34" cy="8" r="8" fill="#dc2626" stroke="white" stroke-width="1.5"/>
        <text x="34" y="11.5" text-anchor="middle" fill="white" font-size="8" font-weight="800" font-family="Arial">${count}</text>
      ` : ''}
    </svg>`;

  return L.divIcon({
    html: svg,
    className: '',
    iconSize:   [size, size + 14],
    iconAnchor: [size / 2, size + 14],
    popupAnchor: [0, -(size + 14)],
  });
}

  /** @param {any[]} list */
  function updateMarkers(list) {
    const L = /** @type {any} */ (window).L;
    markers.forEach(m => m.remove());
    markers = [];

    console.log('🗺️ Updating markers for', list.length, 'households');

    list.forEach(h => {
      if (!h.lat || !h.lng) {
        console.warn('Household missing coordinates:', h);
        return;
      }

const isSelected = selectedHousehold?.id === h.id;
const icon       = createHouseholdMarkerIcon(h.houseNo, isSelected, h.residents.length);
      
      try {
        const marker = L.marker([h.lat, h.lng], { icon })
          .addTo(leafletMap)
          .on('click', () => selectHousehold(h));

        const tooltipText = `${h.houseNo || ''} ${h.street || h.address}`.trim() || 'Household';
        marker.bindTooltip(tooltipText, {
          permanent: false,
          direction: 'top',
          offset: [0, -10],
          className: 'map-label'
        });

        markers.push(marker);
      } catch (err) {
        console.error('Error creating marker for household:', h, err);
      }
    });

    console.log('✅ Created', markers.length, 'markers');
  }

  /** @param {any} h */
  function selectHousehold(h) {
    selectedHousehold = h;
    selectedHouseholdResidents = h.residents;
    if (leafletMap) leafletMap.panTo([h.lat, h.lng], { animate: true, duration: 0.5 });
    updateMarkers(filteredHouseholds);
  }

  /** @param {any} r */
  function openProfile(r) {
    profileResident = r;
  }

  /** @param {{ detail: { id: string, status: string } }} e */
  function handleStatusChange(e) {
    const { id, status } = e.detail;
    allResidents = allResidents.map(r => r.id === id ? { ...r, status } : r);
    if (selectedHouseholdResidents.some(r => r.id === id)) {
      selectedHouseholdResidents = selectedHouseholdResidents.map(r => r.id === id ? { ...r, status } : r);
    }
    groupResidentsByHousehold();
  }

  // ── Category counts for selected household ────────────
  $: categoryCounts = selectedHouseholdResidents.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, /** @type {Record<string, number>} */ ({}));
</script>

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
      width: 32px !important; height: 32px !important;
      line-height: 32px !important; font-size: 16px !important;
      border-radius: 8px !important; margin-bottom: 4px !important;
      color: #334155 !important;
    }
  </style>
</svelte:head>

<div class="flex flex-col h-full bg-slate-100 font-inter overflow-hidden" style="height: calc(100vh - 0px);">

  <!-- Header -->
  <div class="px-6 pt-5 pb-3 flex flex-col gap-3 bg-slate-100 z-10">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-nunito text-xl font-extrabold text-slate-800">Household Map</h1>
        <p class="text-xs text-slate-500">Barangay Pag-Asa · Admin View</p>
      </div>
      <div class="flex items-center gap-2">
        <button on:click={() => showDebug = !showDebug}
          class="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-colors {showDebug ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:bg-slate-200'}">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Debug
        </button>
        <span class="flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
          </svg>
          {households.length} Households
        </span>
      </div>
    </div>

    <!-- Debug Panel -->
    {#if showDebug}
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p class="text-xs font-bold text-blue-900 mb-2">🐛 Debug Information</p>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div class="bg-white rounded-lg px-3 py-2">
            <p class="text-slate-500 text-[0.65rem] font-bold uppercase tracking-wide">Total Residents</p>
            <p class="text-blue-700 font-bold text-lg">{allResidents.length}</p>
          </div>
          <div class="bg-white rounded-lg px-3 py-2">
            <p class="text-slate-500 text-[0.65rem] font-bold uppercase tracking-wide">Total Households</p>
            <p class="text-blue-700 font-bold text-lg">{households.length}</p>
          </div>
          <div class="bg-white rounded-lg px-3 py-2">
            <p class="text-slate-500 text-[0.65rem] font-bold uppercase tracking-wide">With GPS</p>
            <p class="text-emerald-600 font-bold text-lg">{residentsWithGPS}</p>
          </div>
          <div class="bg-white rounded-lg px-3 py-2">
            <p class="text-slate-500 text-[0.65rem] font-bold uppercase tracking-wide">Without GPS</p>
            <p class="text-red-600 font-bold text-lg">{residentsWithoutGPS}</p>
          </div>
        </div>
        {#if residentsWithoutGPS > 0}
          <div class="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p class="text-amber-800 text-xs font-semibold">
              ⚠️ {residentsWithoutGPS} residents don't have GPS coordinates. Make sure residents enable location permissions when taking house photos.
            </p>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Search + Zone filter -->
    <div class="flex gap-3 flex-wrap">
      <div class="relative flex-1 min-w-48">
        <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/>
        </svg>
        <input bind:value={searchQuery} type="text" placeholder="Search household or resident..."
          class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm" />
      </div>

      <div class="flex gap-2">
        {#each zones as z (z)}
          <button type="button" on:click={() => filterZone = z}
            class="text-sm font-bold px-4 py-1.5 rounded-full border transition-all
                   {filterZone === z
                     ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                     : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'}">
            {z}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Map + Side panel -->
  <div class="flex flex-1 gap-4 px-6 pb-6 overflow-hidden min-h-0">

    <!-- Map -->
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

      {#if loadError}
        <div class="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold px-4 py-2 rounded-xl shadow-sm">
          ⚠️ {loadError}
        </div>
      {/if}

      {#if !loading && households.length === 0 && allResidents.length > 0}
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 max-w-md">
          <div class="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 shadow-lg">
            <div class="flex items-start gap-3">
              <svg class="w-6 h-6 text-amber-500 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              </svg>
              <div>
                <p class="font-bold text-amber-900 mb-2">No GPS Coordinates Found</p>
                <p class="text-sm text-amber-800 mb-3">
                  {allResidents.length} resident(s) loaded but none have GPS coordinates.
                </p>
                <p class="text-xs text-amber-700">
                  <strong>To fix this:</strong> Make sure residents enable location permissions when taking house photos during registration.
                </p>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <div bind:this={mapContainer} class="absolute inset-0 z-0"></div>

<!-- Legend -->
<div class="absolute bottom-4 left-4 z-10 bg-white rounded-xl shadow-md border border-slate-100 px-4 py-3">
  <p class="text-[0.6rem] font-extrabold tracking-widest text-slate-400 uppercase mb-2">Map Legend</p>
  <div class="space-y-1.5">
    <div class="flex items-center gap-2">
      <svg class="w-4 h-5 shrink-0" viewBox="0 0 44 58">
        <path d="M22 2C13.163 2 6 9.163 6 18c0 11.25 16 36 16 36s16-24.75 16-36C38 9.163 30.837 2 22 2z" fill="#2563eb"/>
        <circle cx="22" cy="18" r="11" fill="white" opacity="0.95"/>
        <text x="22" y="22" text-anchor="middle" fill="#2563eb" font-size="9" font-weight="800" font-family="Arial">48</text>
      </svg>
      <span class="text-xs font-semibold text-slate-600">House number on pin</span>
    </div>
    <div class="flex items-center gap-2">
      <div class="relative w-4 h-4">
        <div class="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
          <span class="text-white text-[0.5rem] font-bold">3</span>
        </div>
      </div>
      <span class="text-xs font-semibold text-slate-600">Badge = resident count</span>
    </div>
    <div class="flex items-center gap-2">
      <div class="w-4 h-5 flex items-center justify-center">
        <div class="w-3.5 h-3.5 rounded-full bg-blue-700 ring-2 ring-white ring-offset-1"></div>
      </div>
      <span class="text-xs font-semibold text-slate-600">Darker = selected</span>
    </div>
  </div>
</div>

      <!-- Count badge -->
      <div class="absolute top-3 right-3 z-10 bg-white rounded-lg shadow-sm border border-slate-100 px-3 py-1.5 flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
        <span class="text-xs font-bold text-slate-600">{filteredHouseholds.length} households · {allResidents.length} residents</span>
      </div>
    </div>

    <!-- Side panel -->
    <div class="w-80 shrink-0 flex flex-col gap-3 overflow-y-auto">

      <!-- Selected household -->
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100">
          <p class="text-[0.6rem] font-extrabold tracking-widest text-slate-400 uppercase">Selected Household</p>
        </div>

        {#if selectedHousehold}
          <div class="p-4 flex flex-col gap-3">
            <!-- Household info -->
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-full flex items-center justify-center shrink-0 shadow-sm"
                style="background:{getHouseholdMarkerColor(selectedHouseholdResidents)};">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
                </svg>
              </div>
              <div class="min-w-0">
                <p class="font-nunito font-extrabold text-slate-800 text-sm leading-tight">{selectedHousehold.houseNo} {selectedHousehold.street}</p>
                <p class="text-xs text-slate-400 mt-0.5">{selectedHousehold.zone} · {selectedHouseholdResidents.length} resident{selectedHouseholdResidents.length !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {#if selectedHousehold.address}
              <div class="flex items-start gap-1.5 text-slate-500">
                <svg class="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z"/>
                </svg>
                <span class="text-xs">{selectedHousehold.address}</span>
              </div>
            {/if}

            <!-- Category breakdown -->
            <div class="bg-slate-50 rounded-xl px-3 py-2">
              <p class="text-[0.6rem] font-extrabold tracking-widest text-slate-400 uppercase mb-2">Household Composition</p>
              <div class="space-y-1">
                {#each Object.entries(categoryCounts) as [cat, count] (cat)}
                  {@const cfg = categoryConfig[cat] ?? categoryConfig['Regular']}
                  <div class="flex items-center justify-between">
                    <span class="{cfg.badgeClass} text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full">{cat}</span>
                    <span class="text-xs font-bold text-slate-600">{count}</span>
                  </div>
                {/each}
              </div>
            </div>

            <!-- Residents list -->
            <div class="border-t border-slate-100 pt-3">
              <p class="text-[0.6rem] font-extrabold tracking-widest text-slate-400 uppercase mb-2">Residents ({selectedHouseholdResidents.length})</p>
              <div class="space-y-2 max-h-64 overflow-y-auto">
                {#each selectedHouseholdResidents as resident (resident.id)}
                  {@const cfg = categoryConfig[resident.category] ?? categoryConfig['Regular']}
                  <button type="button" on:click={() => openProfile(resident)}
                    class="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center font-nunito font-black text-xs text-white shrink-0"
                      style="background:{cfg.avatarBg};">
                      {getInitials(resident.name)}
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="font-bold text-slate-700 text-xs truncate">{resident.name}</p>
                      <div class="flex items-center gap-1 mt-0.5">
                        <span class="{cfg.badgeClass} text-[0.6rem] font-bold px-1 py-0.5 rounded-full">{resident.category}</span>
                        <span class="text-[0.6rem] text-slate-400">· {resident.age} yrs</span>
                      </div>
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          </div>
        {:else}
          <div class="p-6 flex flex-col items-center text-slate-300">
            <svg class="w-10 h-10 mb-2 opacity-50" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
            </svg>
            <p class="text-xs font-semibold text-center">Click a household marker to view residents</p>
          </div>
        {/if}
      </div>

      <!-- Zone summary -->
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100">
          <p class="text-[0.6rem] font-extrabold tracking-widest text-slate-400 uppercase">Zone Distribution</p>
        </div>
        <div class="p-4 space-y-2">
          {#each zones.slice(1) as z (z)}
            {@const count = households.filter(h => h.zone === z).length}
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-600">{z}</span>
              <div class="flex items-center gap-2">
                <div class="h-1.5 rounded-full bg-blue-100 w-20 overflow-hidden">
                  <div class="h-full rounded-full bg-blue-500 transition-all"
                    style="width:{households.length ? (count / households.length * 100) : 0}%">
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

<!-- Resident Profile Modal -->
<ResidentProfileModal
  resident={profileResident}
  on:close={() => profileResident = null}
  on:statusChange={handleStatusChange}
/>