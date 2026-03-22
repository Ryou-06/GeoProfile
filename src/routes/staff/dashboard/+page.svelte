<!-- src/routes/staff/dashboard/+page.svelte -->
<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import Chart from 'chart.js/auto';

  // ── User info ──────────────────────────────────────────
  let staffName     = 'Staff';
  let staffPosition = '';
  let staffUid      = '';

  // ── My stats ──────────────────────────────────────────
  let totalQRs         = 0;
  let totalSubmissions = 0;
  let pendingCount     = 0;
  let approvedCount    = 0;
  let rejectedCount    = 0;

  // ── Breakdown by source ───────────────────────────────
  let selfRegistered = 0;
  let staffEncoded   = 0;

  // ── Special tags ──────────────────────────────────────
  let pwdCount          = 0;
  let seniorCount       = 0;
  let singleParentCount = 0;

  // ── Monthly chart data ────────────────────────────────
  /** @type {number[]} */ let monthlyApproved = [0, 0, 0];
  /** @type {number[]} */ let monthlyPending  = [0, 0, 0];
  /** @type {number[]} */ let monthlyRejected = [0, 0, 0];
  /** @type {string[]} */ let monthLabels     = [];

  // ── Data ──────────────────────────────────────────────
  /** @type {any[]} */ let mySubmissions    = [];
  /** @type {string[]} */ let myHouseholdIds = [];
  let loading   = true;
  let loadError = '';

  /** @type {(() => void)[]} */ let unsubs = [];

  // ── Charts ────────────────────────────────────────────
  /** @type {Chart|null} */ let histChart  = null;
  /** @type {Chart|null} */ let donutChart = null;

  const isDark = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
  const gridC = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const txtC  = '#888780';

  // ── Init charts — called AFTER loading = false so canvas is in DOM ──
  async function initCharts() {
    await tick(); // wait for Svelte to render the canvas elements

    const histCtx  = /** @type {HTMLCanvasElement|null} */ (document.getElementById('histChart'));
    const donutCtx = /** @type {HTMLCanvasElement|null} */ (document.getElementById('donutChart'));

    if (histCtx && !histChart) {
      histChart = new Chart(histCtx, {
        type: 'bar',
        data: {
          labels: monthLabels,
          datasets: [
            { label: 'Approved', data: monthlyApproved, backgroundColor: '#059669', borderRadius: 4, borderSkipped: false },
            { label: 'Pending',  data: monthlyPending,  backgroundColor: '#d97706', borderRadius: 4, borderSkipped: false },
            { label: 'Rejected', data: monthlyRejected, backgroundColor: '#e24b4a', borderRadius: 4, borderSkipped: false },
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { mode: 'index' } },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: txtC, font: { size: 11 }, autoSkip: false } },
            y: { stacked: true, grid: { color: gridC }, ticks: { color: txtC, font: { size: 11 }, stepSize: 5 }, beginAtZero: true }
          }
        }
      });
    }

    if (donutCtx && !donutChart) {
      donutChart = new Chart(donutCtx, {
        type: 'doughnut',
        data: {
          datasets: [{ data: [approvedCount, pendingCount, rejectedCount], backgroundColor: ['#059669','#d97706','#e24b4a'], borderWidth: 0, hoverOffset: 3 }]
        },
        options: {
          responsive: true,
          cutout: '70%',
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (/** @type {any} */ c) => ` ${c.parsed}` } }
          }
        }
      });
    }

  }

  // ── Months helper ─────────────────────────────────────
  function getLast3Months() {
    const now = new Date();
    return Array.from({ length: 3 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (2 - i), 1);
      return { label: d.toLocaleString('en-PH', { month: 'short' }), year: d.getFullYear(), month: d.getMonth() };
    });
  }

  /** @param {any[]} subs */
  function buildMonthlyData(subs) {
    const months = getLast3Months();
    monthLabels     = months.map(m => m.label);
    monthlyApproved = [0, 0, 0];
    monthlyPending  = [0, 0, 0];
    monthlyRejected = [0, 0, 0];

    for (const r of subs) {
      const ts = r.submittedAt?.toDate ? r.submittedAt.toDate() : (r.submittedAt ? new Date(r.submittedAt) : null);
      if (!ts) continue;
      const idx = months.findIndex(m => m.year === ts.getFullYear() && m.month === ts.getMonth());
      if (idx === -1) continue;
      if (r.status === 'approved')      monthlyApproved[idx]++;
      else if (r.status === 'rejected') monthlyRejected[idx]++;
      else                              monthlyPending[idx]++;
    }

    updateHistChart();
    updateDonutChart();
  }

  function updateHistChart() {
    if (!histChart) return;
    histChart.data.labels           = monthLabels;
    histChart.data.datasets[0].data = monthlyApproved;
    histChart.data.datasets[1].data = monthlyPending;
    histChart.data.datasets[2].data = monthlyRejected;
    histChart.update();
  }

  function updateDonutChart() {
    if (!donutChart) return;
    donutChart.data.datasets[0].data = [approvedCount, pendingCount, rejectedCount];
    donutChart.update();
  }

  /** @param {any[]} subs */
  async function recomputeStats(subs) {
    totalSubmissions  = subs.length;
    pendingCount      = subs.filter(r => r.status === 'pending').length;
    approvedCount     = subs.filter(r => r.status === 'approved').length;
    rejectedCount     = subs.filter(r => r.status === 'rejected').length;
    pwdCount          = subs.filter(r => r.isPWD).length;
    seniorCount       = subs.filter(r => r.isSenior).length;
    singleParentCount = subs.filter(r => r.isSingleParent).length;
    staffEncoded      = subs.filter(r => r.encodedBy === staffUid).length;
    selfRegistered    = subs.filter(r => !r.encodedBy).length;

    const wasLoading = loading;
    loading = false;

    // If this is the first data load, init charts now that canvas is in DOM
    if (wasLoading) {
      await initCharts();
    } else {
      buildMonthlyData(subs);
    }
  }

  onMount(async () => {
    monthLabels = getLast3Months().map(m => m.label);

    try {
      const { auth } = await import('$lib/firebase');
      const { db }   = await import('$lib/firebase');
      const { onAuthStateChanged }   = await import('firebase/auth');
      const {
        collection, query, where, onSnapshot,
        limit, doc, getDoc, getDocs
      } = await import('firebase/firestore');

      const unsubAuth = onAuthStateChanged(auth, async (user) => {
        if (!user) { window.location.href = '/'; return; }
        staffUid = user.uid;

        try {
          const uSnap = await getDoc(doc(db, 'users', user.uid));
          if (uSnap.exists()) {
            const d       = uSnap.data();
            staffName     = d.name ?? user.email ?? 'Staff';
            staffPosition = d.position ?? '';
          }
        } catch { /* non-critical */ }

        // ── Step 1: My households ──────────────────────
        unsubs.push(onSnapshot(
          query(collection(db, 'households'), where('createdBy', '==', user.uid)),
          async (hhSnap) => {
            totalQRs       = hhSnap.size;
            myHouseholdIds = hhSnap.docs.map(d => d.id);

            /** @type {SvelteMap<string, any>} */
            const residentMap = new SvelteMap();

            // 2a. Residents I directly encoded
            try {
              const encodedSnap = await getDocs(
                query(collection(db, 'residents'), where('encodedBy', '==', user.uid), limit(200))
              );
              encodedSnap.docs.forEach(d => residentMap.set(d.id, { id: d.id, ...d.data() }));
            } catch (e) { console.error('encodedBy query error:', e); }

            // 2b. Self-registered via my QR codes — batched (Firestore 'in' max 30)
            if (myHouseholdIds.length > 0) {
              for (let i = 0; i < myHouseholdIds.length; i += 30) {
                const batch = myHouseholdIds.slice(i, i + 30);
                try {
                  const hhResSnap = await getDocs(
                    query(collection(db, 'residents'), where('householdId', 'in', batch), limit(200))
                  );
                  hhResSnap.docs.forEach(d => residentMap.set(d.id, { id: d.id, ...d.data() }));
                } catch (e) { console.error('householdId query error:', e); }
              }
            }

            mySubmissions = Array.from(residentMap.values());
            await recomputeStats(mySubmissions);
          },
          (err) => {
            loadError = 'Could not load data. Check Firestore rules.';
            loading   = false;
            console.error('households error:', err);
          }
        ));

        // ── Step 2: Live listener for status changes ───
        unsubs.push(onSnapshot(
          query(collection(db, 'residents'), where('encodedBy', '==', user.uid), limit(200)),
          async (snap) => {
            /** @type {SvelteMap<string, any>} */
            const currentMap = new SvelteMap(mySubmissions.map(r => [r.id, r]));
            snap.docs.forEach(d => currentMap.set(d.id, { id: d.id, ...d.data() }));
            mySubmissions = Array.from(currentMap.values());
            await recomputeStats(mySubmissions);
          }
        ));

      });

      unsubs.push(unsubAuth);
    } catch (e) {
      loadError = 'Firebase connection failed. Check your .env config.';
      loading   = false;
      console.error(e);
    }
  });

  onDestroy(() => {
    unsubs.forEach(u => u());
    histChart?.destroy();
    donutChart?.destroy();
  });

  // ── Derived ────────────────────────────────────────────
  $: approvalRate = totalSubmissions > 0 ? Math.round((approvedCount / totalSubmissions) * 100) : 0;
  $: recentSubs   = mySubmissions
    .slice()
    .sort((a, b) => {
      const ta = a.submittedAt?.toDate ? a.submittedAt.toDate() : new Date(a.submittedAt ?? 0);
      const tb = b.submittedAt?.toDate ? b.submittedAt.toDate() : new Date(b.submittedAt ?? 0);
      return tb - ta;
    })
    .slice(0, 5);

  // ── Helpers ────────────────────────────────────────────
  /** @param {any} ts */
  function formatDate(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  }

  /** @param {string} s */
  function statusCls(s) {
    if (s === 'approved') return 'badge-success';
    if (s === 'rejected') return 'badge-danger';
    return 'badge-warning';
  }

  /** @param {any} r */
  function getInitials(r) {
    const name = r.name ?? (r.firstName ? r.firstName + (r.lastName ? ' ' + r.lastName : '') : '');
    const parts = name.trim().split(' ').filter(Boolean);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase() || '?';
  }

  /** @param {string} s */
  function avatarCls(s) {
    if (s === 'approved') return 'avatar-success';
    if (s === 'rejected') return 'avatar-danger';
    return 'avatar-warning';
  }

  /** @param {any} r */
  function displayName(r) {
    if (r.name) return r.name;
    const fn = r.firstName ?? '';
    const ln = r.lastName  ?? '';
    return (fn + ' ' + ln).trim() || 'Unknown';
  }

  /** @param {any} r */
  function sourceLabel(r) {
    return r.encodedBy ? 'Staff encoded' : 'Self-registered';
  }

  /** @param {any} r */
  function getCategoryTags(r) {
    /** @type {string[]} */ const tags = [];
    if (r.isPWD)          tags.push('PWD');
    if (r.isSenior)       tags.push('Senior');
    if (r.isSingleParent) tags.push('Single Parent');
    return tags;
  }
</script>

<div class="page">

  <!-- ── Header ── -->
  <div class="header">
    <div>
      <h1 class="welcome">Welcome back, {staffName}!</h1>
      <p class="sub">{staffPosition ? staffPosition + ' · ' : ''}Barangay Pag-Asa Staff Portal</p>
    </div>
    <div class="actions">
      <button class="btn btn-green" on:click={() => { window.location.href = '/staff/qr'; }}>
        <svg class="ico" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 4h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
        </svg>
        Generate QR
      </button>
      <button class="btn btn-blue" on:click={() => { window.location.href = '/staff/register'; }}>
        <svg class="ico" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Encode Registration
      </button>
    </div>
  </div>

  <!-- ── Error ── -->
  {#if loadError}
    <div class="error-banner">
      <svg class="ico" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      </svg>
      {loadError}
    </div>
  {/if}

  <!-- ── Stat cards ── -->
  <div class="g4">
    <div class="metric-card">
      <p class="mlabel">QRs Generated</p>
      <p class="mval">{totalQRs}</p>
      <p class="msub">households registered</p>
    </div>
    <div class="metric-card">
      <p class="mlabel">Total Residents</p>
      <p class="mval">{totalSubmissions}</p>
      <div class="msub-row">
        <span class="src-pill src-staff">{staffEncoded} encoded</span>
        <span class="src-pill src-self">{selfRegistered} self-reg</span>
      </div>
    </div>
    <div class="metric-card">
      <p class="mlabel">Pending</p>
      <p class="mval mval-warn">{pendingCount}</p>
      <p class="msub">awaiting admin review</p>
    </div>
    <div class="metric-card">
      <p class="mlabel">Approved</p>
      <p class="mval mval-success">{approvedCount}</p>
      <p class="msub">{approvalRate}% approval rate</p>
    </div>
  </div>

  <!-- ── Chart row ── -->
  <div class="g3">

    <div class="card chart-card">
      <div class="card-header">
        <span class="sec-title">My submission history</span>
        <div class="legend">
          <span class="leg-dot" style="background:#059669;"></span><span class="leg-txt">Approved</span>
          <span class="leg-dot" style="background:#d97706;margin-left:10px;"></span><span class="leg-txt">Pending</span>
          <span class="leg-dot" style="background:#e24b4a;margin-left:10px;"></span><span class="leg-txt">Rejected</span>
        </div>
      </div>
      {#if loading}
        <div class="chart-skeleton"></div>
      {:else}
        <div class="chart-wrap" style="height:160px;">
          <canvas id="histChart"></canvas>
        </div>
      {/if}
    </div>

    <div class="card donut-card">
      <p class="sec-title">Status breakdown</p>
      {#if loading}
        <div class="donut-skeleton"></div>
      {:else}
        <div class="donut-center">
          <canvas id="donutChart" style="max-width:110px;max-height:110px;display:block;margin:0 auto 12px;"></canvas>
        </div>
      {/if}
      <div class="donut-legend">
        <div class="dleg-row">
          <span class="dleg-dot" style="background:#059669;"></span>
          <span class="dleg-label">Approved</span>
          <span class="dleg-val">{approvedCount}</span>
        </div>
        <div class="dleg-row">
          <span class="dleg-dot" style="background:#d97706;"></span>
          <span class="dleg-label">Pending</span>
          <span class="dleg-val">{pendingCount}</span>
        </div>
        <div class="dleg-row">
          <span class="dleg-dot" style="background:#e24b4a;"></span>
          <span class="dleg-label">Rejected</span>
          <span class="dleg-val">{rejectedCount}</span>
        </div>
      </div>
    </div>

  </div>

  <!-- ── Bottom row ── -->
  <div class="g2">

    <div class="card">
      <div class="card-header">
        <span class="sec-title">Recent residents</span>
        {#if pendingCount > 0}
          <span class="badge badge-warning">{pendingCount} pending</span>
        {/if}
      </div>

      {#if loading}
        {#each [1, 2, 3] as i (i)}
          <div class="row-skeleton animate-pulse">
            <div class="sk-avatar"></div>
            <div class="sk-lines">
              <div class="sk-line sk-line-lg"></div>
              <div class="sk-line sk-line-sm"></div>
            </div>
            <div class="sk-badge"></div>
          </div>
        {/each}
      {:else if recentSubs.length === 0}
        <div class="empty-state">
          <svg class="empty-ico" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p class="empty-title">No residents yet</p>
          <p class="empty-sub">Residents you encode or who scan your QR will appear here</p>
        </div>
      {:else}
        {#each recentSubs as r (r.id)}
          <div class="sub-row">
            <div class="avatar {avatarCls(r.status ?? 'pending')}">{getInitials(r)}</div>
            <div class="sub-info">
              <p class="sub-name">{displayName(r)}</p>
              <div class="sub-meta">
                <span>{formatDate(r.submittedAt)}</span>
                <span class="src-tag {r.encodedBy ? 'src-tag-staff' : 'src-tag-self'}">
                  {sourceLabel(r)}
                </span>
                {#each getCategoryTags(r) as tag (tag)}
                  <span class="tag">{tag}</span>
                {/each}
              </div>
            </div>
            <span class="badge {statusCls(r.status ?? 'pending')}">{r.status ?? 'pending'}</span>
          </div>
        {/each}
      {/if}
    </div>

    <div class="right-col">

      <div class="card">
        <p class="sec-title" style="margin-bottom:14px;">Registration source</p>
        <div class="source-grid">
          <div class="source-item">
            <div class="source-icon si-blue">
              <svg class="ico" fill="none" stroke="#2563eb" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
            </div>
            <div>
              <p class="source-val">{staffEncoded}</p>
              <p class="source-label">Staff encoded</p>
              <p class="source-sub">you filled the form</p>
            </div>
          </div>
          <div class="source-item">
            <div class="source-icon si-green">
              <svg class="ico" fill="none" stroke="#059669" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 4h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
              </svg>
            </div>
            <div>
              <p class="source-val">{selfRegistered}</p>
              <p class="source-label">Self-registered</p>
              <p class="source-sub">scanned your QR code</p>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <p class="sec-title" style="margin-bottom:12px;">Special tags in my residents</p>
        <div class="tag-list">
          <div class="tag-row">
            <span class="tag-label">PWD</span>
            <div class="prog-wrap">
              <div class="prog" style="width:{totalSubmissions ? Math.round((pwdCount/totalSubmissions)*100) : 0}%;background:#2563eb;"></div>
            </div>
            <span class="tag-count">{pwdCount}</span>
          </div>
          <div class="tag-row">
            <span class="tag-label">Senior</span>
            <div class="prog-wrap">
              <div class="prog" style="width:{totalSubmissions ? Math.round((seniorCount/totalSubmissions)*100) : 0}%;background:#059669;"></div>
            </div>
            <span class="tag-count">{seniorCount}</span>
          </div>
          <div class="tag-row">
            <span class="tag-label">Single Parent</span>
            <div class="prog-wrap">
              <div class="prog" style="width:{totalSubmissions ? Math.round((singleParentCount/totalSubmissions)*100) : 0}%;background:#7c3aed;"></div>
            </div>
            <span class="tag-count">{singleParentCount}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <p class="sec-title" style="margin-bottom:10px;">Quick actions</p>
        <div class="qa-list">
          <button class="qa-btn" on:click={() => { window.location.href = '/staff/qr'; }}>
            <div class="qa-icon qa-icon-green">
              <svg class="ico" fill="none" stroke="#059669" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 4h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <div class="qa-text">
              <p class="qa-title">Generate QR code</p>
              <p class="qa-sub">Create a household registration QR</p>
            </div>
          </button>
          <button class="qa-btn" on:click={() => { window.location.href = '/staff/register'; }}>
            <div class="qa-icon qa-icon-blue">
              <svg class="ico" fill="none" stroke="#2563eb" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div class="qa-text">
              <p class="qa-title">Encode registration</p>
              <p class="qa-sub">Assist a resident with registration</p>
            </div>
          </button>
        </div>
      </div>

    </div>
  </div>

</div>

<style>
  .page { padding:1.5rem; display:flex; flex-direction:column; gap:14px; min-height:100%; background:#f1f5f9; font-family:'Inter',sans-serif; }
  .header { display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:10px; }
  .welcome { font-size:1.35rem; font-weight:800; color:#1e293b; font-family:'Nunito',sans-serif; }
  .sub { font-size:0.8rem; color:#64748b; margin-top:2px; }
  .actions { display:flex; gap:8px; flex-wrap:wrap; }
  .btn { display:flex; align-items:center; gap:6px; padding:8px 14px; border-radius:10px; font-size:0.8rem; font-weight:700; color:#fff; border:none; cursor:pointer; transition:opacity .15s,transform .1s; }
  .btn:active { transform:scale(.97); }
  .btn-green { background:#059669; }
  .btn-blue  { background:#2563eb; }
  .error-banner { display:flex; align-items:center; gap:8px; background:#fef2f2; border:1px solid #fecaca; color:#dc2626; font-size:0.8rem; font-weight:600; padding:10px 14px; border-radius:10px; }
  .g4 { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
  .g3 { display:grid; grid-template-columns:2fr 1fr; gap:10px; }
  .g2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
  @media(max-width:900px){ .g4{grid-template-columns:repeat(2,minmax(0,1fr));} .g3{grid-template-columns:1fr;} .g2{grid-template-columns:1fr;} }
  .metric-card { background:#fff; border:0.5px solid #e2e8f0; border-radius:12px; padding:14px 16px; }
  .mlabel { font-size:0.65rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; margin-bottom:4px; }
  .mval { font-size:1.6rem; font-weight:800; color:#1e293b; font-family:'Nunito',sans-serif; }
  .mval-warn { color:#d97706; }
  .mval-success { color:#059669; }
  .msub { font-size:0.7rem; color:#94a3b8; margin-top:2px; }
  .msub-row { display:flex; align-items:center; gap:4px; margin-top:5px; flex-wrap:wrap; }
  .src-pill { font-size:0.62rem; font-weight:700; padding:2px 6px; border-radius:99px; }
  .src-staff { background:#dbeafe; color:#1e40af; }
  .src-self  { background:#d1fae5; color:#065f46; }
  .card { background:#fff; border:0.5px solid #e2e8f0; border-radius:14px; padding:16px 18px; }
  .card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
  .sec-title { font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#64748b; }
  .chart-card { display:flex; flex-direction:column; }
  .chart-wrap { position:relative; width:100%; }
  .chart-skeleton { height:160px; background:#f1f5f9; border-radius:8px; }
  .donut-skeleton { width:110px; height:110px; border-radius:50%; background:#f1f5f9; margin:0 auto 12px; }
  .legend { display:flex; align-items:center; flex-wrap:wrap; gap:4px; }
  .leg-dot { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }
  .leg-txt { font-size:0.7rem; color:#94a3b8; }
  .donut-card { display:flex; flex-direction:column; }
  .donut-center { text-align:center; }
  .donut-legend { display:flex; flex-direction:column; gap:6px; }
  .dleg-row { display:flex; align-items:center; gap:6px; }
  .dleg-dot { width:8px; height:8px; border-radius:2px; flex-shrink:0; }
  .dleg-label { flex:1; font-size:0.75rem; color:#64748b; }
  .dleg-val { font-size:0.75rem; font-weight:700; color:#1e293b; }
  .sub-row { display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:0.5px solid #f1f5f9; }
  .sub-row:last-child { border-bottom:none; }
  .avatar { width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:700; flex-shrink:0; }
  .avatar-success { background:#d1fae5; color:#065f46; }
  .avatar-warning { background:#fef3c7; color:#92400e; }
  .avatar-danger  { background:#fee2e2; color:#991b1b; }
  .sub-info { flex:1; min-width:0; }
  .sub-name { font-size:0.8rem; font-weight:700; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .sub-meta { display:flex; align-items:center; gap:5px; flex-wrap:wrap; margin-top:2px; font-size:0.7rem; color:#94a3b8; }
  .src-tag { font-size:0.6rem; font-weight:700; padding:1px 5px; border-radius:99px; }
  .src-tag-staff { background:#dbeafe; color:#1e40af; }
  .src-tag-self  { background:#d1fae5; color:#065f46; }
  .tag { font-size:0.6rem; font-weight:700; padding:1px 6px; border-radius:99px; background:#ede9fe; color:#5b21b6; }
  .badge { font-size:0.65rem; font-weight:700; padding:3px 8px; border-radius:99px; white-space:nowrap; }
  .badge-success { background:#d1fae5; color:#065f46; }
  .badge-warning { background:#fef3c7; color:#92400e; }
  .badge-danger  { background:#fee2e2; color:#991b1b; }
  .row-skeleton { display:flex; align-items:center; gap:10px; padding:9px 0; }
  .sk-avatar { width:32px; height:32px; border-radius:50%; background:#e2e8f0; flex-shrink:0; }
  .sk-lines { flex:1; display:flex; flex-direction:column; gap:6px; }
  .sk-line { height:10px; border-radius:4px; background:#e2e8f0; }
  .sk-line-lg { width:55%; }
  .sk-line-sm { width:35%; }
  .sk-badge { width:54px; height:20px; border-radius:99px; background:#e2e8f0; }
  .animate-pulse { animation:pulse 1.5s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
  .empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:2rem 1rem; text-align:center; color:#94a3b8; }
  .empty-ico { width:36px; height:36px; margin-bottom:8px; opacity:.4; }
  .empty-title { font-size:0.85rem; font-weight:700; }
  .empty-sub { font-size:0.75rem; margin-top:3px; }
  .right-col { display:flex; flex-direction:column; gap:10px; }
  .source-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .source-item { display:flex; align-items:flex-start; gap:10px; }
  .source-icon { width:36px; height:36px; border-radius:9px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .si-blue  { background:#dbeafe; }
  .si-green { background:#d1fae5; }
  .source-val   { font-size:1.3rem; font-weight:800; color:#1e293b; font-family:'Nunito',sans-serif; }
  .source-label { font-size:0.72rem; font-weight:700; color:#374151; margin-top:1px; }
  .source-sub   { font-size:0.65rem; color:#94a3b8; margin-top:1px; }
  .tag-list { display:flex; flex-direction:column; gap:10px; }
  .tag-row { display:flex; align-items:center; gap:8px; }
  .tag-label { font-size:0.75rem; color:#64748b; min-width:80px; }
  .prog-wrap { flex:1; height:6px; border-radius:99px; background:#f1f5f9; overflow:hidden; }
  .prog { height:100%; border-radius:99px; transition:width .4s ease; }
  .tag-count { font-size:0.75rem; font-weight:700; color:#1e293b; min-width:20px; text-align:right; }
  .qa-list { display:flex; flex-direction:column; gap:8px; }
  .qa-btn { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; border:1px dashed #e2e8f0; background:transparent; cursor:pointer; width:100%; transition:border-color .15s,background .15s; text-align:left; }
  .qa-btn:hover { border-color:#94a3b8; background:#f8fafc; }
  .qa-icon { width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .qa-icon-green { background:#d1fae5; }
  .qa-icon-blue  { background:#dbeafe; }
  .qa-title { font-size:0.8rem; font-weight:700; color:#1e293b; }
  .qa-sub { font-size:0.7rem; color:#94a3b8; margin-top:1px; }
  .ico { width:16px; height:16px; flex-shrink:0; }
</style>