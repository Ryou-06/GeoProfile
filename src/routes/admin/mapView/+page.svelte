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
  let filterStreet = 'All Streets';
  let loading = true;
  /** @type {string | null} */
  let loadError = null;
  let showDebug = false;

  /** @type {(() => void)[]} */
  let unsubs = [];

  const streets = ['All Streets', 'Gordon Avenue', 'Murphy Street', 'Natividad Street', 'Burgos Street', 'East 12th Street', 'Perimeter Road', 'Bonifacio Street'];

  /** @type {Record<string, { markerColor: string, avatarBg: string, badgeClass: string }>} */
  const categoryConfig = {
    'Regular':       { markerColor: '#2563eb', avatarBg: '#2563eb', badgeClass: 'bg-blue-100 text-blue-700' },
    'Senior':        { markerColor: '#10b981', avatarBg: '#10b981', badgeClass: 'bg-emerald-100 text-emerald-700' },
    'PWD':           { markerColor: '#f59e0b', avatarBg: '#f59e0b', badgeClass: 'bg-amber-100 text-amber-700' },
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

  /** @param {any[]} residents */
  function getHouseholdMarkerColor(residents) {
    if (residents.some(r => r.isPWD)) return categoryConfig['PWD'].markerColor;
    if (residents.some(r => r.isSenior)) return categoryConfig['Senior'].markerColor;
    if (residents.some(r => r.isSingleParent)) return categoryConfig['Single Parent'].markerColor;
    return categoryConfig['Regular'].markerColor;
  }

  // ── Filtered households by street ─────────────────────
  $: filteredHouseholds = households.filter(h => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q ||
      h.address?.toLowerCase().includes(q) ||
      h.street?.toLowerCase().includes(q) ||
      h.residents.some(/** @param {any} r */ r => r.name?.toLowerCase().includes(q));
    const matchStreet = filterStreet === 'All Streets' || h.street === filterStreet;
    return matchSearch && matchStreet;
  });

  $: if (leafletMap) updateMarkers(filteredHouseholds);

  $: residentsWithGPS = allResidents.filter(r => r.lat && r.lng).length;
  $: residentsWithoutGPS = allResidents.filter(r => !r.lat || !r.lng).length;

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
const pagAsaCenter = [14.8279, 120.2884]; // updated center of traced boundary

const pagAsaBounds = L.latLngBounds(
  [14.8259, 120.2826],  // SW corner — bottom-left of your traced boundary
  [14.8300, 120.2909],  // NE corner — top-right of your traced boundary
);

leafletMap = L.map(mapContainer, {
  center: pagAsaCenter,
  zoom: 16,
  zoomControl: false,
  minZoom: 15,       // can't zoom out beyond this (locks to Pag-Asa level)
  maxZoom: 19,       // can still zoom in for detail
  maxBounds: pagAsaBounds,        // ← can't pan outside this box
  maxBoundsViscosity: 1.0,        // ← 1.0 = hard lock, map snaps back instantly
});

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(leafletMap);

// ✅ Accurate Pag-Asa boundary — hand-traced from geojson.io
const pagAsaBoundary = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [[
      [120.2908646750148, 14.827690586978036],
      [120.29085597315401, 14.827755601571155],
      [120.29069050116863, 14.82783041496981],
      [120.29011237674672, 14.828211310838938],
      [120.28909745272864, 14.828900309879074],
      [120.2874413461451, 14.829963954097437],
      [120.28723313270353, 14.829721574617594],
      [120.28648359113856, 14.82886520102575],
      [120.2857612302235, 14.828251580572243],
      [120.28529803045274, 14.827916846826128],
      [120.28482266259522, 14.827644933839267],
      [120.28445923676304, 14.82748607694036],
      [120.28437049435729, 14.827428360019027],
      [120.28406430720042, 14.827260773305085],
      [120.28384678222818, 14.827154972346278],
      [120.28355585494148, 14.826996021504257],
      [120.28343720609814, 14.82694505780924],
      [120.28262846290431, 14.826915133197488],
      [120.28262578267953, 14.826864069790432],
      [120.28261349152723, 14.826505127829648],
      [120.28259959467027, 14.825994133320094],
      [120.28263336456354, 14.825993045469488],
      [120.28345700739686, 14.825938223757305],
      [120.28367448787657, 14.825899743272274],
      [120.2837217524804, 14.825873360244884],
      [120.28429174533142, 14.825915573591601],
      [120.2846302355776, 14.825941291394841],
      [120.28497394735962, 14.826012136730654],
      [120.28499329638305, 14.826004236500665],
      [120.28507526528648, 14.826017271533473],
      [120.28507794874713, 14.826021368502694],
      [120.28508554182679, 14.826021368502694],
      [120.28508969335337, 14.826018694093733],
      [120.2851332008745, 14.826023065251306],
      [120.28567954602374, 14.826044774446373],
      [120.28661600608808, 14.826162570582682],
      [120.28672879499885, 14.826176627071547],
      [120.28673261880965, 14.826173403450554],
      [120.2868441862463, 14.826192133322039],
      [120.28700676361814, 14.826210379086703],
      [120.2871225312158, 14.826199936518279],
      [120.28724654737118, 14.826215111342876],
      [120.28733827102837, 14.826286773457866],
      [120.28742955048403, 14.826287777417505],
      [120.28743308122597, 14.826292071602566],
      [120.28743257609642, 14.826309508884677],
      [120.28750708805484, 14.82631003734582],
      [120.28761999817328, 14.826311187899535],
      [120.28762880316765, 14.826304459628943],
      [120.28767014511016, 14.826304794560698],
      [120.28767315736974, 14.826307815948724],
      [120.28767344625624, 14.826311864174798],
      [120.28768451893103, 14.826311525958843],
      [120.28768673778671, 14.826310005931404],
      [120.28775766398394, 14.826309837236224],
      [120.28776103277409, 14.826312710406256],
      [120.2877711682188, 14.826312743521314],
      [120.28787987464756, 14.82631338628353],
      [120.28797715972837, 14.826321470369194],
      [120.28806054639608, 14.826354785188784],
      [120.2880572856115, 14.826457049460885],
      [120.28808585299407, 14.826471424625112],
      [120.28809663005285, 14.826582831107672],
      [120.28816731640057, 14.82660864876496],
      [120.28820675672353, 14.826690950418211],
      [120.28820002170403, 14.826795600299945],
      [120.28816295245201, 14.82679793503317],
      [120.28816239838613, 14.82680972719578],
      [120.28815875273654, 14.826813056277402],
      [120.28816657358942, 14.8268577408937],
      [120.28825239795742, 14.827000043731573],
      [120.2883006650676, 14.826997025849863],
      [120.28833708878273, 14.827054208183952],
      [120.28835629752155, 14.827102893204852],
      [120.28839795685951, 14.827197956328376],
      [120.28844481053557, 14.827168733490993],
      [120.2884505623768, 14.827170033668438],
      [120.28845637019799, 14.827178914988679],
      [120.28852063099367, 14.827154017163508],
      [120.28859692797397, 14.827159416462436],
      [120.28865900126459, 14.827131101438312],
      [120.28871712492838, 14.82710495587338],
      [120.28873456543721, 14.82708418678611],
      [120.2887566143383, 14.82707871833783],
      [120.28876191885047, 14.82707871833783],
      [120.28876664000757, 14.827082572508104],
      [120.28884746675413, 14.827046404131792],
      [120.28914054214096, 14.827220226982561],
      [120.28917632356564, 14.827241051024245],
      [120.28924575897827, 14.82730090762476],
      [120.28931481204137, 14.827374448745488],
      [120.28938637206153, 14.827474347973848],
      [120.28942070934175, 14.8275645557449],
      [120.28950732757971, 14.82764392020647],
      [120.28953205191283, 14.827638099883885],
      [120.28957860339597, 14.827640480681538],
      [120.28962748557615, 14.827581077484822],
      [120.28965735837517, 14.827571497657047],
      [120.28977046252902, 14.827533984401867],
      [120.28992811215835, 14.82751672459959],
      [120.29002714102825, 14.827464292606066],
      [120.29035822961839, 14.827293386509481],
      [120.29046138377788, 14.82723804666415],
      [120.2905483891007, 14.827221979137164],
      [120.29060763159458, 14.82720288896266],
      [120.29064189504493, 14.82720313388171],
      [120.29067261379424, 14.827223960817037],
      [120.2907472100473, 14.827411721046559],
      [120.29078487319816, 14.827494457743072],
      [120.29083421538752, 14.827599196249082],
      [120.29086170749702, 14.827659015041917],
      [120.2908646750148, 14.827690586978036], // closes the polygon
    ]]
  }
};

L.geoJSON(pagAsaBoundary, {
  style: {
    color: '#2563eb',
    weight: 2.5,
    dashArray: '6 4',
    fillColor: '#2563eb',
    fillOpacity: 0.07,
    opacity: 0.9,
  }
}).addTo(leafletMap);


    L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);

    try {
      const { db } = await import('$lib/firebase');
      const { collection, query, where, onSnapshot } = await import('firebase/firestore');

      unsubs.push(onSnapshot(
        query(collection(db, 'residents'), where('status', '==', 'approved')),
        snap => {
          allResidents = snap.docs.map(d => {
            const data = d.data();
            return /** @type {any} */ ({ id: d.id, category: getCategory(data), ...data });
          });

          console.log('📊 Total residents loaded:', allResidents.length);
          console.log('📍 Residents with GPS:', allResidents.filter(r => r.lat && r.lng).length);
          console.log('❌ Residents without GPS:', allResidents.filter(r => !r.lat && !r.lng).length);
          if (allResidents.length > 0) console.log('Sample resident data:', allResidents[0]);

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
          lat, lng,
          residents: [],
        });
      } else {
        const household = householdMap.get(householdId);
        if (household && !household.lat && lat) household.lat = lat;
        if (household && !household.lng && lng) household.lng = lng;
      }

      householdMap.get(householdId)?.residents.push(resident);
    });

    const allHouseholds = Array.from(householdMap.values());
    households = allHouseholds.filter(h => h.lat && h.lng);

    console.log('🏠 Total households:', allHouseholds.length);
    console.log('📍 Households with GPS:', households.length);
    console.log('❌ Households without GPS:', allHouseholds.filter(h => !h.lat || !h.lng).length);
  }

  /** @param {string} houseNo @param {boolean} isSelected @param {number} count */
  function createHouseholdMarkerIcon(houseNo, isSelected = false, count = 0) {
    const L = /** @type {any} */ (window).L;
    const label = houseNo?.trim().slice(0, 6) || '?';
    const size = isSelected ? 52 : 44;
    const pinColor = isSelected ? '#1d4ed8' : '#2563eb';
    const textSize = label.length <= 3 ? 10 : label.length <= 5 ? 8 : 7;

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 14}" viewBox="0 0 44 58">
        <filter id="sh" x="-30%" y="-20%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="rgba(0,0,0,0.22)"/>
        </filter>
        <path d="M22 2C13.163 2 6 9.163 6 18c0 11.25 16 36 16 36s16-24.75 16-36C38 9.163 30.837 2 22 2z"
          fill="${pinColor}" filter="url(#sh)"
          ${isSelected ? 'stroke="white" stroke-width="2"' : ''}/>
        <circle cx="22" cy="18" r="11" fill="white" opacity="0.95"/>
        <text x="22" y="22" text-anchor="middle"
          fill="${pinColor}" font-size="${textSize}" font-weight="800"
          font-family="Inter,Arial,sans-serif">${label}</text>
        ${count > 1 ? `
          <circle cx="34" cy="8" r="8" fill="#dc2626" stroke="white" stroke-width="1.5"/>
          <text x="34" y="11.5" text-anchor="middle" fill="white" font-size="8" font-weight="800" font-family="Arial">${count}</text>
        ` : ''}
      </svg>`;

    return L.divIcon({
      html: svg, className: '',
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

    list.forEach(h => {
      if (!h.lat || !h.lng) return;
      const isSelected = selectedHousehold?.id === h.id;
      const icon = createHouseholdMarkerIcon(h.houseNo, isSelected, h.residents.length);

      try {
        const marker = L.marker([h.lat, h.lng], { icon })
          .addTo(leafletMap)
          .on('click', () => selectHousehold(h));

        const tooltipText = `${h.houseNo || ''} ${h.street || h.address}`.trim() || 'Household';
        marker.bindTooltip(tooltipText, {
          permanent: false, direction: 'top', offset: [0, -10], className: 'map-label'
        });
        markers.push(marker);
      } catch (err) {
        console.error('Error creating marker:', h, err);
      }
    });
  }

  /** @param {any} h */
  function selectHousehold(h) {
    selectedHousehold = h;
    selectedHouseholdResidents = h.residents;
    if (leafletMap) leafletMap.panTo([h.lat, h.lng], { animate: true, duration: 0.5 });
    updateMarkers(filteredHouseholds);
  }

  /** @param {any} r */
  function openProfile(r) { profileResident = r; }

  /** @param {{ detail: { id: string, status: string } }} e */
  function handleStatusChange(e) {
    const { id, status } = e.detail;
    allResidents = allResidents.map(r => r.id === id ? { ...r, status } : r);
    if (selectedHouseholdResidents.some(r => r.id === id)) {
      selectedHouseholdResidents = selectedHouseholdResidents.map(r => r.id === id ? { ...r, status } : r);
    }
    groupResidentsByHousehold();
  }

  $: categoryCounts = selectedHouseholdResidents.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, /** @type {Record<string, number>} */ ({}));
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
              ⚠️ {residentsWithoutGPS} residents don't have GPS coordinates.
            </p>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Search + Street filter -->
    <div class="flex gap-3 flex-wrap">
      <div class="relative flex-1 min-w-48">
        <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/>
        </svg>
        <input bind:value={searchQuery} type="text" placeholder="Search household or resident..."
          class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm" />
      </div>
      <div class="flex gap-2 flex-wrap">
        {#each streets as s (s)}
          <button type="button" on:click={() => filterStreet = s}
            class="text-sm font-bold px-4 py-1.5 rounded-full border transition-all
                   {filterStreet === s
                     ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                     : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'}">
            {s}
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
                <p class="text-sm text-amber-800 mb-3">{allResidents.length} resident(s) loaded but none have GPS coordinates.</p>
                <p class="text-xs text-amber-700"><strong>To fix:</strong> Residents must enable location permissions during registration.</p>
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
            <div class="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
              <span class="text-white text-[0.5rem] font-bold">3</span>
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
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-full flex items-center justify-center shrink-0 shadow-sm"
                style="background:{getHouseholdMarkerColor(selectedHouseholdResidents)};">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
                </svg>
              </div>
              <div class="min-w-0">
                <p class="font-nunito font-extrabold text-slate-800 text-sm leading-tight">{selectedHousehold.houseNo} {selectedHousehold.street}</p>
                <p class="text-xs text-slate-400 mt-0.5">{selectedHousehold.street} · {selectedHouseholdResidents.length} resident{selectedHouseholdResidents.length !== 1 ? 's' : ''}</p>
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

      <!-- Street Distribution (was Zone Distribution) -->
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100">
          <p class="text-[0.6rem] font-extrabold tracking-widest text-slate-400 uppercase">Street Distribution</p>
        </div>
        <div class="p-4 space-y-2">
          {#each streets.slice(1) as s (s)}
            {@const count = households.filter(h => h.street === s).length}
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-600 truncate max-w-32">{s}</span>
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