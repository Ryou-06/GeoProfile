<!-- src/routes/staff/mapView/+page.svelte -->
<!-- HOUSEHOLD-BASED MAP VIEW — filtered by Street -->
<script>
  import { onMount, onDestroy } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';

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

  let searchQuery  = '';
  let filterStreet = 'All Streets';
  let loading      = true;
  /** @type {string|null} */
  let loadError    = null;

  /** @type {(() => void)[]} */
  let unsubs = [];

  const streets = [
    'All Streets',
    'Gordon Avenue',
    'Murphy Street',
    'Natividad Street',
    'Burgos Street',
    'Cladiola Street',
    'East 12th Street',
    'Perimeter Road',
    'Bonifacio Street',
  ];

  /** @type {Record<string, { avatarBg: string, badgeClass: string }>} */
  const categoryConfig = {
    'Regular':       { avatarBg: '#2563eb', badgeClass: 'bg-blue-100 text-blue-700' },
    'Senior':        { avatarBg: '#10b981', badgeClass: 'bg-emerald-100 text-emerald-700' },
    'PWD':           { avatarBg: '#f59e0b', badgeClass: 'bg-amber-100 text-amber-700' },
    'Single Parent': { avatarBg: '#8b5cf6', badgeClass: 'bg-violet-100 text-violet-700' },
  };

  /** @param {any} r */
  function getCategory(r) {
    if (r.isPWD)          return 'PWD';
    if (r.isSenior)       return 'Senior';
    if (r.isSingleParent) return 'Single Parent';
    return 'Regular';
  }

  /** @param {string} name */
  function getInitials(name) {
    return (name ?? '??').split(' ').slice(0, 2).map(/** @param {string} n */ n => n[0]).join('').toUpperCase();
  }

  // ── Filter by street instead of zone ──────────────────
  $: filteredHouseholds = households.filter(h => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q ||
      h.address?.toLowerCase().includes(q)  ||
      h.street?.toLowerCase().includes(q)   ||
      h.houseNo?.toLowerCase().includes(q)  ||
      h.residents?.some(/** @param {any} r */ r => r.name?.toLowerCase().includes(q));
    const matchStreet = filterStreet === 'All Streets' || h.street === filterStreet;
    return matchSearch && matchStreet;
  });

  $: if (leafletMap) updateMarkers(filteredHouseholds);

  $: residentsWithGPS    = allResidents.filter(r =>  r.lat && r.lng).length;
  $: residentsWithoutGPS = allResidents.filter(r => !r.lat || !r.lng).length;

  $: categoryCounts = selectedHouseholdResidents.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, /** @type {Record<string, number>} */ ({}));

  onMount(async () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    await new Promise(/** @param {(value: void) => void} resolve */ (resolve) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => resolve();
      document.head.appendChild(script);
    });

    const L = /** @type {any} */ (window).L;

    leafletMap = L.map(mapContainer, {
      center: [14.8270, 120.2867],
      zoom: 15,
      zoomControl: false,
      minZoom: 3,
      maxZoom: 19,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      subdomains: 'abcd', maxZoom: 20,
    }).addTo(leafletMap);

    const pagAsaBounds = L.latLngBounds([14.8240, 120.2835], [14.8305, 120.2900]);
    L.rectangle(pagAsaBounds, {
      color: '#059669', weight: 2, dashArray: '6 4',
      fillColor: '#059669', fillOpacity: 0.04,
    }).addTo(leafletMap);

    L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);

    try {
      const { auth } = await import('$lib/firebase');
      const { db }   = await import('$lib/firebase');
      const { onAuthStateChanged } = await import('firebase/auth');
      const { collection, query, where, onSnapshot } = await import('firebase/firestore');

      const unsubAuth = onAuthStateChanged(auth, (user) => {
        if (!user) { window.location.href = '/'; return; }
      });
      unsubs.push(unsubAuth);

      unsubs.push(onSnapshot(
        query(collection(db, 'residents'), where('status', '==', 'approved')),
        snap => {
          allResidents = snap.docs.map(d => {
            const data = d.data();
            return /** @type {any} */ ({ id: d.id, category: getCategory(data), ...data });
          });
          groupResidentsByHousehold();
          loading = false;
        },
        err => { loading = false; loadError = err.message; console.error(err); }
      ));
    } catch (err) {
      loading = false;
      loadError = /** @type {Error} */ (err).message;
    }
  });

  onDestroy(() => {
    unsubs.forEach(u => u());
    if (leafletMap) leafletMap.remove();
  });

  function groupResidentsByHousehold() {
    const householdMap = new SvelteMap();

    allResidents.forEach(resident => {
      const householdId = resident.householdId || resident.qrId || `standalone_${resident.id}`;
      const lat = resident.lat ?? resident.latitude ?? resident.gpsLat;
      const lng = resident.lng ?? resident.longitude ?? resident.gpsLng;

      if (!householdMap.has(householdId)) {
        householdMap.set(householdId, {
          id: householdId,
          qrId:    resident.qrId,
          houseNo: resident.houseNo  || '',
          street:  resident.street   || '',
          address: resident.address  || '',
          lat, lng,
          residents: [],
        });
      } else {
        const hh = householdMap.get(householdId);
        if (hh && !hh.lat && lat) hh.lat = lat;
        if (hh && !hh.lng && lng) hh.lng = lng;
        // Keep street from first resident that has it
        if (hh && !hh.street && resident.street) hh.street = resident.street;
      }
      householdMap.get(householdId)?.residents.push(resident);
    });

    households = Array.from(householdMap.values()).filter(h => h.lat && h.lng);
  }

  /** @param {string} houseNo @param {boolean} isSelected @param {number} count */
  function createHouseholdMarkerIcon(houseNo, isSelected = false, count = 0) {
    const L        = /** @type {any} */ (window).L;
    const label    = (houseNo ?? '').trim().slice(0, 6) || '?';
    const size     = isSelected ? 52 : 44;
    const pinColor = isSelected ? '#065f46' : '#059669';
    const textSize = label.length <= 2 ? 11 : label.length <= 4 ? 9 : 7;

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 14}" viewBox="0 0 44 58">
        <filter id="sh" x="-30%" y="-20%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="rgba(0,0,0,0.22)"/>
        </filter>
        <path d="M22 2C13.163 2 6 9.163 6 18c0 11.25 16 36 16 36s16-24.75 16-36C38 9.163 30.837 2 22 2z"
          fill="${pinColor}" filter="url(#sh)"
          ${isSelected ? 'stroke="white" stroke-width="2"' : ''}/>
        <circle cx="22" cy="18" r="11" fill="white" opacity="0.95"/>
        <text x="22" y="22" text-anchor="middle" dominant-baseline="central"
          fill="${pinColor}" font-size="${textSize}" font-weight="800"
          font-family="Inter,Arial,sans-serif">${label}</text>
        ${count > 1 ? `
          <circle cx="34" cy="8" r="8" fill="#dc2626" stroke="white" stroke-width="1.5"/>
          <text x="34" y="8" text-anchor="middle" dominant-baseline="central"
            fill="white" font-size="8" font-weight="800" font-family="Arial">${count}</text>
        ` : ''}
      </svg>`;

    return L.divIcon({
      html: svg, className: '',
      iconSize:    [size, size + 14],
      iconAnchor:  [size / 2, size + 14],
      popupAnchor: [0, -(size + 14)],
    });
  }

  /** @param {any[]} list */
  function updateMarkers(list) {
    const L = /** @type {any} */ (window).L;
    markers.forEach(m => m.remove());
    markers = [];

    list.forEach(h => {
      if (!h.lat || !h.lng) return;
      const isSelected = selectedHousehold?.id === h.id;
      const icon = createHouseholdMarkerIcon(h.houseNo, isSelected, h.residents.length);

      try {
        const marker = L.marker([h.lat, h.lng], { icon })
          .addTo(leafletMap)
          .on('click', () => selectHousehold(h));

        const tooltipText = `No. ${h.houseNo} ${h.street}`.trim() || 'Household';
        marker.bindTooltip(tooltipText, {
          permanent: false, direction: 'top', offset: [0, -10], className: 'map-label'
        });
        markers.push(marker);
      } catch (err) { console.error('Marker error:', h, err); }
    });
  }

  /** @param {any} h */
  function selectHousehold(h) {
    selectedHousehold          = h;
    selectedHouseholdResidents = h.residents;
    if (leafletMap) leafletMap.panTo([h.lat, h.lng], { animate: true, duration: 0.5 });
    updateMarkers(filteredHouseholds);
  }
</script>

<svelte:head>
  <style>
    .map-label {
      background: white !important; border: 1px solid #e2e8f0 !important;
      border-radius: 6px !important; padding: 2px 7px !important;
      font-family: 'Inter', sans-serif !important; font-size: 11px !important;
      font-weight: 700 !important; color: #334155 !important;
      box-shadow: 0 1px 4px rgba(0,0,0,0.10) !important; white-space: nowrap !important;
    }
    .map-label::before { display: none !important; }
    .leaflet-control-zoom { border: none !important; box-shadow: 0 2px 8px rgba(0,0,0,0.12) !important; }
    .leaflet-control-zoom a {
      width: 32px !important; height: 32px !important; line-height: 32px !important;
      font-size: 16px !important; border-radius: 8px !important;
      margin-bottom: 4px !important; color: #334155 !important;
    }
  </style>
</svelte:head>

<div class="flex flex-col h-full bg-slate-100 font-inter overflow-hidden" style="height: calc(100vh - 0px);">

  <!-- Header -->
  <div class="px-6 pt-5 pb-3 flex flex-col gap-3 bg-slate-100 z-10">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-nunito text-xl font-extrabold text-slate-800">Household Map</h1>
        <p class="text-xs text-slate-500">Barangay Pag-Asa · Approved Residents</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
          </svg>
          {households.length} Households · {allResidents.length} Residents
        </span>
        {#if residentsWithoutGPS > 0}
          <span class="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
            ⚠️ {residentsWithoutGPS} no GPS
          </span>
        {/if}
      </div>
    </div>

    <div class="flex gap-3 flex-wrap">
      <!-- Search -->
      <div class="relative flex-1 min-w-48">
        <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/>
        </svg>
        <input bind:value={searchQuery} type="text" placeholder="Search house no., street, or resident name..."
          class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all shadow-sm" />
      </div>
    </div>

    <!-- Street filter pills -->
    <div class="flex gap-2 flex-wrap">
      {#each streets as s (s)}
        <button type="button" on:click={() => filterStreet = s}
          class="text-xs font-bold px-3 py-1.5 rounded-full border transition-all
                 {filterStreet === s
                   ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                   : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-600'}">
          {s}
        </button>
      {/each}
    </div>
  </div>

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
        <div class="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div class="bg-amber-50 border-2 border-amber-300 rounded-2xl px-6 py-5 shadow-lg max-w-xs text-center">
            <p class="font-bold text-amber-900 mb-1">No GPS Coordinates Found</p>
            <p class="text-xs text-amber-700">{allResidents.length} resident(s) loaded but none have GPS. Make sure residents enable location when registering.</p>
          </div>
        </div>
      {/if}

      {#if !loading && allResidents.length === 0}
        <div class="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div class="bg-white/90 backdrop-blur-sm rounded-2xl px-6 py-5 shadow-lg border border-slate-200 max-w-xs text-center">
            <svg class="w-10 h-10 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/>
            </svg>
            <p class="font-nunito font-extrabold text-slate-600 text-sm">No approved residents yet</p>
            <p class="text-xs text-slate-400 mt-1">Approved residents with GPS will appear as pins on the map.</p>
          </div>
        </div>
      {/if}

      <div bind:this={mapContainer} class="absolute inset-0 z-0"></div>

      <!-- Legend -->
      <div class="absolute bottom-4 left-4 z-10 bg-white rounded-xl shadow-md border border-slate-100 px-4 py-3">
        <p class="text-[0.6rem] font-extrabold tracking-widest text-slate-400 uppercase mb-2">Legend</p>
        <div class="space-y-1.5">
          <div class="flex items-center gap-2">
            <div class="w-6 h-7 shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 44 58" class="w-4 h-5">
                <path d="M22 2C13.163 2 6 9.163 6 18c0 11.25 16 36 16 36s16-24.75 16-36C38 9.163 30.837 2 22 2z" fill="#059669"/>
                <circle cx="22" cy="18" r="11" fill="white" opacity="0.95"/>
                <text x="22" y="22" text-anchor="middle" dominant-baseline="central" fill="#059669" font-size="9" font-weight="800" font-family="Arial">47</text>
              </svg>
            </div>
            <span class="text-xs font-semibold text-slate-600">House no. on pin</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center shrink-0">
              <span class="text-white text-[0.5rem] font-bold">3</span>
            </div>
            <span class="text-xs font-semibold text-slate-600">Resident count</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-6 h-7 shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 44 58" class="w-4 h-5">
                <path d="M22 2C13.163 2 6 9.163 6 18c0 11.25 16 36 16 36s16-24.75 16-36C38 9.163 30.837 2 22 2z" fill="#065f46" stroke="white" stroke-width="2"/>
                <circle cx="22" cy="18" r="11" fill="white" opacity="0.95"/>
              </svg>
            </div>
            <span class="text-xs font-semibold text-slate-600">Selected</span>
          </div>
        </div>
      </div>

      <!-- Count badge -->
      <div class="absolute top-3 right-3 z-10 bg-white rounded-lg shadow-sm border border-slate-100 px-3 py-1.5 flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span class="text-xs font-bold text-slate-600">{filteredHouseholds.length} shown</span>
      </div>
    </div>

    <!-- Side panel -->
    <div class="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto">

      <!-- Selected household -->
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100">
          <p class="text-[0.6rem] font-extrabold tracking-widest text-slate-400 uppercase">Selected Household</p>
        </div>

        {#if selectedHousehold}
          <div class="p-4 flex flex-col gap-3">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-full flex items-center justify-center shrink-0 font-nunito font-black text-sm text-white shadow-sm"
                style="background:#059669;">
                {(selectedHousehold.houseNo ?? '?').trim().slice(0, 4) || '?'}
              </div>
              <div class="min-w-0">
                <p class="font-nunito font-extrabold text-slate-800 text-sm">No. {selectedHousehold.houseNo}</p>
                <p class="text-xs text-slate-500">{selectedHousehold.street || '—'}</p>
                <p class="text-xs text-slate-400">{selectedHouseholdResidents.length} resident{selectedHouseholdResidents.length !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {#if selectedHousehold.address}
              <div class="flex items-start gap-1.5">
                <svg class="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z"/>
                </svg>
                <span class="text-xs text-slate-500">{selectedHousehold.address}</span>
              </div>
            {/if}

            <!-- Category breakdown -->
            {#if Object.keys(categoryCounts).length > 0}
              <div class="bg-slate-50 rounded-xl px-3 py-2.5">
                <p class="text-[0.6rem] font-extrabold tracking-widest text-slate-400 uppercase mb-2">Composition</p>
                <div class="flex flex-wrap gap-1.5">
                  {#each Object.entries(categoryCounts) as [cat, count] (cat)}
                    {@const cfg = categoryConfig[cat] ?? categoryConfig['Regular']}
                    <span class="{cfg.badgeClass} text-[0.65rem] font-bold px-2 py-0.5 rounded-full">
                      {cat}: {count}
                    </span>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Resident list -->
            <div>
              <p class="text-[0.6rem] font-extrabold tracking-widest text-slate-400 uppercase mb-2">
                Residents · <span class="normal-case font-medium text-slate-400">{selectedHouseholdResidents.length} total</span>
              </p>
              <div class="space-y-2 max-h-64 overflow-y-auto">
                {#each selectedHouseholdResidents as r (r.id)}
                  {@const cfg = categoryConfig[r.category] ?? categoryConfig['Regular']}
                  <div class="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center font-nunito font-black text-xs text-white shrink-0"
                      style="background:{cfg.avatarBg};">
                      {getInitials(r.name)}
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="font-bold text-slate-700 text-xs truncate">{r.name}</p>
                      <div class="flex items-center gap-1 mt-0.5">
                        <span class="{cfg.badgeClass} text-[0.6rem] font-bold px-1 py-0.5 rounded-full">{r.category}</span>
                        <span class="text-[0.6rem] text-slate-400">· {r.age} yrs · {r.sex}</span>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {:else}
          <div class="p-6 flex flex-col items-center text-slate-300">
            <svg class="w-10 h-10 mb-2 opacity-50" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
            </svg>
            <p class="text-xs font-semibold text-center">Click a pin to view household residents</p>
          </div>
        {/if}
      </div>

      <!-- Street distribution -->
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100">
          <p class="text-[0.6rem] font-extrabold tracking-widest text-slate-400 uppercase">Street Distribution</p>
        </div>
        <div class="p-4 space-y-2">
          {#each streets.slice(1) as s (s)}
            {@const count = households.filter(h => h.street === s).length}
            {#if count > 0}
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-semibold text-slate-600 truncate flex-1">{s}</span>
                <div class="flex items-center gap-2 shrink-0">
                  <div class="h-1.5 rounded-full bg-emerald-100 w-16 overflow-hidden">
                    <div class="h-full rounded-full bg-emerald-500 transition-all"
                      style="width:{households.length ? (count / households.length * 100) : 0}%"></div>
                  </div>
                  <span class="text-xs font-bold text-slate-700 w-4 text-right">{count}</span>
                </div>
              </div>
            {/if}
          {/each}
          {#if households.length === 0}
            <p class="text-xs text-slate-400 text-center py-2">No data yet</p>
          {/if}
        </div>
      </div>

    </div>
  </div>
</div>