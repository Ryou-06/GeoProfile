<!-- src/routes/staff/mapView/+page.svelte -->
<!-- HOUSEHOLD-BASED MAP VIEW — filtered by Street -->
<script>
  import { onMount, onDestroy } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import ResidentProfileModal from '$lib/components/ResidentProfileModal.svelte';

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

  let searchQuery  = '';
  let filterStreet = 'All Streets';
  let loading      = true;
  /** @type {string|null} */
  let loadError    = null;
  let showDebug = false;

  /** @type {(() => void)[]} */
  let unsubs = [];

  const streets = [
    'All Streets',
    'Gordon Avenue',
    'Murphy Street',
    'Natividad Street',
    'Burgos Street',
    'East 12th Street',
    'Perimeter Road',
    'Bonifacio Street',
  ];

  /** @type {Record<string, { markerColor: string, avatarBg: string, badgeClass: string }>} */
  const categoryConfig = {
    'Regular':       { markerColor: '#2563eb', avatarBg: '#2563eb', badgeClass: 'bg-blue-100 text-blue-700' },
    'Senior':        { markerColor: '#10b981', avatarBg: '#10b981', badgeClass: 'bg-emerald-100 text-emerald-700' },
    'PWD':           { markerColor: '#f59e0b', avatarBg: '#f59e0b', badgeClass: 'bg-amber-100 text-amber-700' },
    'Single Parent': { markerColor: '#8b5cf6', avatarBg: '#8b5cf6', badgeClass: 'bg-violet-100 text-violet-700' },
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

  /** @param {any[]} residents */
  function getHouseholdMarkerColor(residents) {
    if (residents.some(r => r.isPWD)) return categoryConfig['PWD'].markerColor;
    if (residents.some(r => r.isSenior)) return categoryConfig['Senior'].markerColor;
    if (residents.some(r => r.isSingleParent)) return categoryConfig['Single Parent'].markerColor;
    return categoryConfig['Regular'].markerColor;
  }

  // ── Filter by street ──────────────────────────────────
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
    const pagAsaCenter = [14.8279, 120.2884];

    const pagAsaBounds = L.latLngBounds(
      [14.8259, 120.2826],
      [14.8300, 120.2909],
    );

    leafletMap = L.map(mapContainer, {
      center: pagAsaCenter,
      zoom: 16,
      zoomControl: false,
      minZoom: 15,
      maxZoom: 19,
      maxBounds: pagAsaBounds,
      maxBoundsViscosity: 1.0,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      subdomains: 'abcd', maxZoom: 20,
    }).addTo(leafletMap);

    // Accurate Pag-Asa boundary — hand-traced from geojson.io
    const pagAsaBoundary = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[
            [
              120.2908646750148,
              14.827690586978036
            ],
            [
              120.29085597315401,
              14.827755601571155
            ],
            [
              120.29069050116863,
              14.82783041496981
            ],
            [
              120.29011237674672,
              14.828211310838938
            ],
            [
              120.28909745272864,
              14.828900309879074
            ],
            [
              120.2874413461451,
              14.829963954097437
            ],
            [
              120.28723313270353,
              14.829721574617594
            ],
            [
              120.28648041329564,
              14.828852913010863
            ],
            [
              120.28693917190898,
              14.828396247312902
            ],
            [
              120.28563269088767,
              14.827390899458663
            ],
            [
              120.28528997233957,
              14.827929829773382
            ],
            [
              120.28481092794976,
              14.827669242155636
            ],
            [
              120.28445923676304,
              14.82748607694036
            ],
            [
              120.28437049435729,
              14.827428360019027
            ],
            [
              120.28406430720042,
              14.827260773305085
            ],
            [
              120.28384678222818,
              14.827154972346278
            ],
            [
              120.28355585494148,
              14.826996021504257
            ],
            [
              120.28343720609814,
              14.82694505780924
            ],
            [
              120.28262846290431,
              14.826915133197488
            ],
            [
              120.28262578267953,
              14.826864069790432
            ],
            [
              120.28261349152723,
              14.826505127829648
            ],
            [
              120.28259959467027,
              14.825994133320094
            ],
            [
              120.28263336456354,
              14.825993045469488
            ],
            [
              120.28345700739686,
              14.825938223757305
            ],
            [
              120.28367448787657,
              14.825899743272274
            ],
            [
              120.2837217524804,
              14.825873360244884
            ],
            [
              120.28429174533142,
              14.825915573591601
            ],
            [
              120.2846302355776,
              14.825941291394841
            ],
            [
              120.28497394735962,
              14.826012136730654
            ],
            [
              120.28499329638305,
              14.826004236500665
            ],
            [
              120.28507526528648,
              14.826017271533473
            ],
            [
              120.28507794874713,
              14.826021368502694
            ],
            [
              120.28508554182679,
              14.826021368502694
            ],
            [
              120.28508969335337,
              14.826018694093733
            ],
            [
              120.2851332008745,
              14.826023065251306
            ],
            [
              120.28567954602374,
              14.826044774446373
            ],
            [
              120.28661600608808,
              14.826162570582682
            ],
            [
              120.28672879499885,
              14.826176627071547
            ],
            [
              120.28673261880965,
              14.826173403450554
            ],
            [
              120.2868441862463,
              14.826192133322039
            ],
            [
              120.28700676361814,
              14.826210379086703
            ],
            [
              120.2871225312158,
              14.826199936518279
            ],
            [
              120.28724654737118,
              14.826215111342876
            ],
            [
              120.28733827102837,
              14.826286773457866
            ],
            [
              120.28742955048403,
              14.826287777417505
            ],
            [
              120.28743308122597,
              14.826292071602566
            ],
            [
              120.28743257609642,
              14.826309508884677
            ],
            [
              120.28750708805484,
              14.82631003734582
            ],
            [
              120.28761999817328,
              14.826311187899535
            ],
            [
              120.28762880316765,
              14.826304459628943
            ],
            [
              120.28767014511016,
              14.826304794560698
            ],
            [
              120.28767315736974,
              14.826307815948724
            ],
            [
              120.28767344625624,
              14.826311864174798
            ],
            [
              120.28768451893103,
              14.826311525958843
            ],
            [
              120.28768673778671,
              14.826310005931404
            ],
            [
              120.28775766398394,
              14.826309837236224
            ],
            [
              120.28776103277409,
              14.826312710406256
            ],
            [
              120.2877711682188,
              14.826312743521314
            ],
            [
              120.28787987464756,
              14.82631338628353
            ],
            [
              120.28797715972837,
              14.826321470369194
            ],
            [
              120.28806054639608,
              14.826354785188784
            ],
            [
              120.2880572856115,
              14.826457049460885
            ],
            [
              120.28808585299407,
              14.826471424625112
            ],
            [
              120.28809663005285,
              14.826582831107672
            ],
            [
              120.28816731640057,
              14.82660864876496
            ],
            [
              120.28820675672353,
              14.826690950418211
            ],
            [
              120.28820002170403,
              14.826795600299945
            ],
            [
              120.28816295245201,
              14.82679793503317
            ],
            [
              120.28816239838613,
              14.82680972719578
            ],
            [
              120.28815875273654,
              14.826813056277402
            ],
            [
              120.28816657358942,
              14.8268577408937
            ],
            [
              120.28825239795742,
              14.827000043731573
            ],
            [
              120.2883006650676,
              14.826997025849863
            ],
            [
              120.28833708878273,
              14.827054208183952
            ],
            [
              120.28835629752155,
              14.827102893204852
            ],
            [
              120.28839795685951,
              14.827197956328376
            ],
            [
              120.28844481053557,
              14.827168733490993
            ],
            [
              120.2884505623768,
              14.827170033668438
            ],
            [
              120.28845637019799,
              14.827178914988679
            ],
            [
              120.28852063099367,
              14.827154017163508
            ],
            [
              120.28859692797397,
              14.827159416462436
            ],
            [
              120.28865900126459,
              14.827131101438312
            ],
            [
              120.28871712492838,
              14.82710495587338
            ],
            [
              120.28873456543721,
              14.82708418678611
            ],
            [
              120.2887566143383,
              14.82707871833783
            ],
            [
              120.28876191885047,
              14.82707871833783
            ],
            [
              120.28876664000757,
              14.827082572508104
            ],
            [
              120.28884746675413,
              14.827046404131792
            ],
            [
              120.28914054214096,
              14.827220226982561
            ],
            [
              120.28917632356564,
              14.827241051024245
            ],
            [
              120.28924575897827,
              14.82730090762476
            ],
            [
              120.28931481204137,
              14.827374448745488
            ],
            [
              120.28938637206153,
              14.827474347973848
            ],
            [
              120.28942070934175,
              14.8275645557449
            ],
            [
              120.28950732757971,
              14.82764392020647
            ],
            [
              120.28953205191283,
              14.827638099883885
            ],
            [
              120.28957860339597,
              14.827640480681538
            ],
            [
              120.28962748557615,
              14.827581077484822
            ],
            [
              120.28965735837517,
              14.827571497657047
            ],
            [
              120.28977046252902,
              14.827533984401867
            ],
            [
              120.28992811215835,
              14.82751672459959
            ],
            [
              120.29002714102825,
              14.827464292606066
            ],
            [
              120.29035822961839,
              14.827293386509481
            ],
            [
              120.29046138377788,
              14.82723804666415
            ],
            [
              120.2905483891007,
              14.827221979137164
            ],
            [
              120.29060763159458,
              14.82720288896266
            ],
            [
              120.29064189504493,
              14.82720313388171
            ],
            [
              120.29067261379424,
              14.827223960817037
            ],
            [
              120.2907472100473,
              14.827411721046559
            ],
            [
              120.29078487319816,
              14.827494457743072
            ],
            [
              120.29083421538752,
              14.827599196249082
            ],
            [
              120.29086170749702,
              14.827659015041917
            ],
            [
              120.2908646750148,
              14.827690586978036
            ]
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
          landmark: resident.landmark || '',
          lat, lng,
          residents: [],
        });
      } else {
        const hh = householdMap.get(householdId);
        if (hh && !hh.lat && lat) hh.lat = lat;
        if (hh && !hh.lng && lng) hh.lng = lng;
        if (hh && !hh.street && resident.street) hh.street = resident.street;
      }
      householdMap.get(householdId)?.residents.push(resident);
    });

    households = Array.from(householdMap.values()).filter(h => h.lat && h.lng);
  }

  /** @param {string} houseNo @param {boolean} isSelected @param {number} count @param {string} markerColor */
  function createHouseholdMarkerIcon(houseNo, isSelected = false, count = 0, markerColor = '#2563eb') {
    const L        = /** @type {any} */ (window).L;
    const label    = (houseNo ?? '').trim().slice(0, 6) || '?';
    const size     = isSelected ? 52 : 44;
    const pinColor = isSelected ? '#1d4ed8' : markerColor;
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
      const markerColor = getHouseholdMarkerColor(h.residents);
      const icon = createHouseholdMarkerIcon(h.houseNo, isSelected, h.residents.length, markerColor);

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
        <p class="text-xs text-slate-500">Barangay Pag-Asa · Staff View</p>
      </div>
      <div class="flex items-center gap-2">
        <button on:click={() => showDebug = !showDebug}
          class="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-colors {showDebug ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:bg-slate-200'}">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Debug
        </button>
        <span class="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
          </svg>
          {households.length} Households · {allResidents.length} Residents
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

<!-- Legend - Hidden by default, shows on hover -->
<div class="absolute bottom-4 left-4 z-10 group">
  <!-- Small icon when collapsed -->
  <div class="bg-white rounded-full shadow-md border border-slate-200 p-2 cursor-pointer group-hover:opacity-0 transition-opacity duration-200">
    <svg class="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l5 5a2 2 0 01.586 1.414V19a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z"/>
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 7h5"/>
    </svg>
  </div>
  
  <!-- Full legend - shows on hover -->
  <div class="absolute bottom-0 left-0 bg-white rounded-xl shadow-md border border-slate-100 px-4 py-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 min-w-[180px]">
    <p class="text-[0.6rem] font-extrabold tracking-widest text-slate-400 uppercase mb-2">Map Legend</p>
    <div class="space-y-1.5">
      <div class="flex items-center gap-2">
        <div class="w-6 h-7 shrink-0 flex items-center justify-center">
          <svg viewBox="0 0 44 58" class="w-4 h-5">
            <path d="M22 2C13.163 2 6 9.163 6 18c0 11.25 16 36 16 36s16-24.75 16-36C38 9.163 30.837 2 22 2z" fill="#2563eb"/>
            <circle cx="22" cy="18" r="11" fill="white" opacity="0.95"/>
            <text x="22" y="22" text-anchor="middle" dominant-baseline="central" fill="#2563eb" font-size="9" font-weight="800" font-family="Arial">47</text>
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
            <path d="M22 2C13.163 2 6 9.163 6 18c0 11.25 16 36 16 36s16-24.75 16-36C38 9.163 30.837 2 22 2z" fill="#1d4ed8" stroke="white" stroke-width="2"/>
            <circle cx="22" cy="18" r="11" fill="white" opacity="0.95"/>
          </svg>
        </div>
        <span class="text-xs font-semibold text-slate-600">Selected</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 rounded-full bg-amber-400 shrink-0"></div>
        <span class="text-xs font-semibold text-slate-600">PWD Household</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 rounded-full bg-emerald-500 shrink-0"></div>
        <span class="text-xs font-semibold text-slate-600">Senior Household</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 rounded-full bg-violet-500 shrink-0"></div>
        <span class="text-xs font-semibold text-slate-600">Single Parent</span>
      </div>
      <div class="border-t border-slate-100 pt-1.5 mt-1">
        <div class="flex items-center gap-2">
          <div class="w-4 h-4 border-2 border-blue-500 bg-blue-50 shrink-0 rounded"></div>
          <span class="text-xs font-semibold text-slate-600">Pag-Asa Boundary</span>
        </div>
      </div>
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
                  <button type="button" on:click={() => openProfile(r)}
                    class="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left">
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

<!-- Resident Profile Modal -->
<ResidentProfileModal
  resident={profileResident}
  on:close={() => profileResident = null}
  on:statusChange={handleStatusChange}
/>