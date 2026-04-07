<!-- src/routes/admin/dashboard/+page.svelte -->
<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import Chart from 'chart.js/auto';

  // ── Stats ──────────────────────────────────────────────
  let totalResidents  = 0;
  let seniorCitizens  = 0;
  let pwds            = 0;
  let singleParents   = 0;
  let pendingCount    = 0;
  let declinedCount   = 0;

  // ── Age groups (computed from birthdate) ──────────────
  let ageGroups = { child: 0, youth: 0, adult: 0, middleAge: 0, senior: 0 };

  // ── Civil status ──────────────────────────────────────
  let civilStatusMap = /** @type {Record<string, number>} */ ({});

  // ── Gender ────────────────────────────────────────────
  let genderMap = /** @type {Record<string, number>} */ ({});

  // ── Monthly registrations (last 6 months) ────────────
  /** @type {string[]} */ let monthLabels   = [];
  /** @type {number[]} */ let monthlyTotals = [];

  // ── All approved residents ─────────────────────────────
  /** @type {any[]} */ let allResidents = [];

  // ── Recent activity (last 8 status changes) ───────────
  /** @type {any[]} */ let recentActivity = [];

  let loading   = true;
  let loadError = '';

  /** @type {(() => void)[]} */ let unsubs = [];

  // ── Charts ────────────────────────────────────────────
  /** @type {Chart|null} */ let regChart    = null;
  /** @type {Chart|null} */ let genderChart = null;

  // ── Month helpers ─────────────────────────────────────
  function getLast6Months() {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { label: d.toLocaleString('en-PH', { month: 'short' }), year: d.getFullYear(), month: d.getMonth() };
    });
  }

  /** @param {Date} birthdate */
  function getAgeGroup(birthdate) {
    const age = Math.floor((Date.now() - birthdate.getTime()) / (365.25 * 24 * 3600 * 1000));
    if (age < 13)  return 'child';
    if (age < 18)  return 'youth';
    if (age < 36)  return 'adult';
    if (age < 60)  return 'middleAge';
    return 'senior';
  }

  /** @param {any[]} residents */
  function computeDerived(residents) {
    const ag = { child: 0, youth: 0, adult: 0, middleAge: 0, senior: 0 };
    const cs = /** @type {Record<string, number>} */ ({});
    const gm = /** @type {Record<string, number>} */ ({});
    const months = getLast6Months();
    const mc = new Array(6).fill(0);

    for (const r of residents) {
      if (r.birthdate) {
        const bd = new Date(r.birthdate);
        if (!isNaN(bd.getTime())) ag[getAgeGroup(bd)]++;
      }
      if (r.civilStatus) {
        const key = r.civilStatus.toLowerCase();
        cs[key] = (cs[key] ?? 0) + 1;
      }
      const sexVal = r.sex ?? r.gender;
      if (sexVal) {
        const key = sexVal.toLowerCase();
        gm[key] = (gm[key] ?? 0) + 1;
      }
      const ts = r.submittedAt?.toDate ? r.submittedAt.toDate() : (r.submittedAt ? new Date(r.submittedAt) : null);
      if (ts) {
        const idx = months.findIndex(m => m.year === ts.getFullYear() && m.month === ts.getMonth());
        if (idx !== -1) mc[idx]++;
      }
    }

    ageGroups      = ag;
    civilStatusMap = cs;
    genderMap      = gm;
    monthLabels    = months.map(m => m.label);
    monthlyTotals  = mc;

    updateRegChart();
    updateGenderChart();
  }

  function updateRegChart() {
    if (!regChart) return;
    regChart.data.labels = monthLabels;
    regChart.data.datasets[0].data = monthlyTotals;
    regChart.update();
  }

  function updateGenderChart() {
    if (!genderChart) return;
    const male   = (genderMap['male']   ?? 0) + (genderMap['Male']   ?? 0);
    const female = (genderMap['female'] ?? 0) + (genderMap['Female'] ?? 0);
    const other  = Object.entries(genderMap)
      .filter(([k]) => !['male','female','Male','Female'].includes(k))
      .reduce((a, [, v]) => a + v, 0);
    genderChart.data.datasets[0].data = [male, female, other];
    genderChart.update();
  }

  async function initCharts() {
    await tick();
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const gridC  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const txtC   = '#888780';

    const regCtx    = /** @type {HTMLCanvasElement|null} */ (document.getElementById('regChart'));
    const genderCtx = /** @type {HTMLCanvasElement|null} */ (document.getElementById('genderChart'));

    if (regCtx && !regChart) {
      regChart = new Chart(regCtx, {
        type: 'bar',
        data: {
          labels: monthLabels,
          datasets: [{
            label: 'Registrations',
            data: monthlyTotals,
            backgroundColor: '#2563eb',
            borderRadius: 5,
            borderSkipped: false,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: txtC, font: { size: 11 }, autoSkip: false } },
            y: { grid: { color: gridC }, ticks: { color: txtC, font: { size: 11 } }, beginAtZero: true }
          }
        }
      });
    }

    if (genderCtx && !genderChart) {
      genderChart = new Chart(genderCtx, {
        type: 'doughnut',
        data: {
          datasets: [{
            data: [0, 0, 0],
            backgroundColor: ['#2563eb', '#db2777', '#7c3aed'],
            borderWidth: 0,
            hoverOffset: 3,
          }]
        },
        options: {
          responsive: true,
          cutout: '70%',
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (/** @type {any} */ c) => {
              const labels = ['Male', 'Female', 'Other / N/A'];
              return ` ${labels[c.dataIndex]}: ${c.parsed.toLocaleString()}`;
            }}}
          }
        }
      });
    }

    updateRegChart();
    updateGenderChart();
  }

  onMount(async () => {
    monthLabels   = getLast6Months().map(m => m.label);
    monthlyTotals = new Array(6).fill(0);

    try {
      const { auth } = await import('$lib/firebase');
      const { db }   = await import('$lib/firebase');
      const { onAuthStateChanged }  = await import('firebase/auth');
      const {
        collection, query, where, orderBy,
        onSnapshot, limit, doc, getDoc
      } = await import('firebase/firestore');

      const unsubAuth = onAuthStateChanged(auth, async (user) => {
        if (!user) { window.location.href = '/'; return; }

        try {
          const uSnap = await getDoc(doc(db, 'users', user.uid));
          if (uSnap.exists() && uSnap.data().role !== 'admin') {
            window.location.href = '/staff/dashboard';
            return;
          }
        } catch { /* non-critical */ }

        // Approved residents
        unsubs.push(onSnapshot(
          query(collection(db, 'residents'), where('status', '==', 'approved')),
          async snap => {
            allResidents   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            totalResidents = snap.size;
            seniorCitizens = allResidents.filter(r => r.isSenior).length;
            pwds           = allResidents.filter(r => r.isPWD).length;
            singleParents  = allResidents.filter(r => r.isSingleParent).length;
            const wasLoading = loading;
            loading = false;
            if (wasLoading) await initCharts();
            computeDerived(allResidents);
          },
          err => {
            loadError = 'Could not load residents. Check Firestore rules.';
            loading   = false;
            console.error('residents error:', err);
          }
        ));

        // Pending count
        unsubs.push(onSnapshot(
          query(collection(db, 'residents'), where('status', '==', 'pending')),
          async snap => { pendingCount = snap.size; }
        ));

        // Declined count
        unsubs.push(onSnapshot(
          query(collection(db, 'residents'), where('status', '==', 'declined')),
          async snap => { declinedCount = snap.size; }
        ));

        // Recent activity feed
        unsubs.push(onSnapshot(
          query(collection(db, 'residents'), orderBy('submittedAt', 'desc'), limit(8)),
          async snap => { recentActivity = snap.docs.map(d => ({ id: d.id, ...d.data() })); }
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
    regChart?.destroy();
    genderChart?.destroy();
  });

  // ── Derived ────────────────────────────────────────────
  $: totalAll    = totalResidents + pendingCount + declinedCount;
  $: approvalPct = totalAll > 0 ? Math.round((totalResidents / totalAll) * 100) : 0;

  $: maxAge   = Math.max(1, ...Object.values(ageGroups));
  $: maxCivil = Math.max(1, ...Object.values(civilStatusMap));

  $: genderMale   = (genderMap['male']   ?? 0) + (genderMap['Male']   ?? 0);
  $: genderFemale = (genderMap['female'] ?? 0) + (genderMap['Female'] ?? 0);
  $: genderOther  = totalResidents - genderMale - genderFemale;

  const ageLabels = /** @type {Record<string, string>} */ ({
    child: '0–12 yrs', youth: '13–17 yrs', adult: '18–35 yrs',
    middleAge: '36–59 yrs', senior: '60+ yrs',
  });
  const ageColors = /** @type {Record<string, string>} */ ({
    child: '#2563eb', youth: '#7c3aed', adult: '#059669',
    middleAge: '#d97706', senior: '#dc2626',
  });
  const civilLabels = /** @type {Record<string, string>} */ ({
    single: 'Single', married: 'Married', widowed: 'Widowed',
    separated: 'Separated', annulled: 'Annulled',
  });

  /** @param {any} ts */
  function formatTime(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  /** @param {string} status */
  function activityDotColor(status) {
    if (status === 'approved') return '#059669';
    if (status === 'declined') return '#dc2626';
    return '#d97706';
  }

  /** @param {string} status */
  function activityLabel(status) {
    if (status === 'approved') return 'Approved';
    if (status === 'declined') return 'Declined';
    return 'Pending review';
  }

  /** @param {any} r */
  function displayName(r) {
    if (r.name) return r.name;
    if (r.firstName) return r.firstName;
    return 'Unknown';
  }
</script>

<div class="page">

  <!-- ── Header ── -->
  <div class="page-header">
    <div>
      <h1 class="page-title">Admin Dashboard</h1>
      <p class="page-sub">Barangay Pag-Asa · Resident Profiling Overview</p>
    </div>
    {#if pendingCount > 0}
      <button class="btn-pending" on:click={() => { window.location.href = '/admin/residents?filter=pending'; }}>
        <svg class="ico" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
        {pendingCount} pending approval{pendingCount !== 1 ? 's' : ''}
      </button>
    {/if}
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

  <!-- ── Top stat cards (5 cards) ── -->
  <div class="g5">
    <!-- NEW: Total Residents (all submissions) -->
    <div class="stat-card stat-slate">
      <p class="stat-label">Total Residents</p>
      <p class="stat-val">{totalAll.toLocaleString()}</p>
      <p class="stat-sub">All submissions combined</p>
    </div>
    <!-- EXISTING: Approved Residents -->
    <div class="stat-card stat-blue">
      <p class="stat-label">Approved Residents</p>
      <p class="stat-val">{totalResidents.toLocaleString()}</p>
      <p class="stat-sub">{approvalPct}% approval rate</p>
    </div>
    <div class="stat-card stat-green">
      <p class="stat-label">Senior Citizens</p>
      <p class="stat-val">{seniorCitizens.toLocaleString()}</p>
      <p class="stat-sub">{totalResidents ? Math.round((seniorCitizens/totalResidents)*100) : 0}% of approved</p>
    </div>
    <div class="stat-card stat-amber">
      <p class="stat-label">PWDs</p>
      <p class="stat-val">{pwds.toLocaleString()}</p>
      <p class="stat-sub">{totalResidents ? Math.round((pwds/totalResidents)*100) : 0}% of approved</p>
    </div>
    <div class="stat-card stat-purple">
      <p class="stat-label">Single Parents</p>
      <p class="stat-val">{singleParents.toLocaleString()}</p>
      <p class="stat-sub">{totalResidents ? Math.round((singleParents/totalResidents)*100) : 0}% of approved</p>
    </div>
  </div>

  <!-- ── Sub-stats row ── -->
  <div class="g3-sub">
    <div class="metric-card">
      <p class="mlabel">Total submissions</p>
      <p class="mval">{totalAll.toLocaleString()}</p>
    </div>
    <div class="metric-card">
      <p class="mlabel">Pending</p>
      <p class="mval mval-warn">{pendingCount}</p>
    </div>
    <div class="metric-card">
      <p class="mlabel">Declined</p>
      <p class="mval mval-danger">{declinedCount}</p>
    </div>
  </div>

  <!-- ── Middle row ── -->
  <div class="g3-mid">
    <div class="card chart-card">
      <div class="card-hd">
        <span class="sec-title">Monthly approved registrations</span>
        <span class="badge b-info">Last 6 months</span>
      </div>
      {#if loading}
        <div class="chart-skeleton"></div>
      {:else}
        <div style="position:relative;height:170px;">
          <canvas id="regChart"></canvas>
        </div>
      {/if}
    </div>

    <div class="card">
      <p class="sec-title" style="margin-bottom:14px;">Age distribution</p>
      {#if loading}
        {#each [1,2,3,4,5] as i (i)}
          <div class="sk-row"><div class="sk-lbl"></div><div class="sk-bar"></div><div class="sk-num"></div></div>
        {/each}
      {:else}
        {#each Object.entries(ageGroups) as [key, count] (key)}
          <div class="age-row">
            <span class="age-label">{ageLabels[key]}</span>
            <div class="prog-wrap">
              <div class="prog" style="width:{Math.round((count/maxAge)*100)}%;background:{ageColors[key]};"></div>
            </div>
            <span class="age-count">{count}</span>
          </div>
        {/each}
      {/if}
    </div>

    <div class="card">
      <p class="sec-title" style="margin-bottom:12px;">Gender</p>
      {#if loading}
        <div class="donut-sk"></div>
      {:else}
        <div style="text-align:center;margin-bottom:10px;">
          <canvas id="genderChart" style="max-width:100px;max-height:100px;display:block;margin:0 auto;"></canvas>
        </div>
        <div class="gender-legend">
          <div class="gleg"><span class="gdot" style="background:#2563eb;"></span><span class="glabel">Male</span><span class="gval">{genderMale.toLocaleString()}</span></div>
          <div class="gleg"><span class="gdot" style="background:#db2777;"></span><span class="glabel">Female</span><span class="gval">{genderFemale.toLocaleString()}</span></div>
          <div class="gleg"><span class="gdot" style="background:#7c3aed;"></span><span class="glabel">Other / N/A</span><span class="gval">{Math.max(0, genderOther).toLocaleString()}</span></div>
        </div>
        {#if Object.keys(civilStatusMap).length > 0}
          <div style="border-top:0.5px solid #f1f5f9;margin:12px 0 10px;"></div>
          <p class="sec-title" style="margin-bottom:10px;">Civil status</p>
          {#each Object.entries(civilStatusMap) as [key, count] (key)}
            <div class="cs-row">
              <span class="cs-label">{civilLabels[key] ?? key}</span>
              <div class="prog-wrap"><div class="prog" style="width:{Math.round((count/maxCivil)*100)}%;background:#2563eb;opacity:.7;"></div></div>
              <span class="cs-count">{count}</span>
            </div>
          {/each}
        {/if}
      {/if}
    </div>
  </div>

  <!-- ── Bottom row ── -->
  <div class="g2-bot">
    <div class="card">
      <p class="sec-title" style="margin-bottom:16px;">Special sector breakdown</p>
      <div class="sector-grid">
        <div class="sector-item">
          <div class="sector-icon si-green">
            <svg class="ico" fill="none" stroke="#059669" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
          </div>
          <div>
            <p class="si-val">{seniorCitizens}</p>
            <p class="si-label">Senior Citizens</p>
            <p class="si-pct">{totalResidents ? Math.round((seniorCitizens/totalResidents)*100) : 0}%</p>
          </div>
        </div>
        <div class="sector-item">
          <div class="sector-icon si-amber">
            <svg class="ico" fill="none" stroke="#d97706" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
          </div>
          <div>
            <p class="si-val">{pwds}</p>
            <p class="si-label">PWDs</p>
            <p class="si-pct">{totalResidents ? Math.round((pwds/totalResidents)*100) : 0}%</p>
          </div>
        </div>
        <div class="sector-item">
          <div class="sector-icon si-purple">
            <svg class="ico" fill="none" stroke="#7c3aed" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
            </svg>
          </div>
          <div>
            <p class="si-val">{singleParents}</p>
            <p class="si-label">Single Parents</p>
            <p class="si-pct">{totalResidents ? Math.round((singleParents/totalResidents)*100) : 0}%</p>
          </div>
        </div>
        <div class="sector-item">
          <div class="sector-icon si-blue">
            <svg class="ico" fill="none" stroke="#2563eb" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
            </svg>
          </div>
          <div>
            <p class="si-val">{totalResidents.toLocaleString()}</p>
            <p class="si-label">Total Approved</p>
            <p class="si-pct">{approvalPct}% rate</p>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-hd">
        <span class="sec-title">Recent activity</span>
        <button class="link-btn" on:click={() => { window.location.href = '/admin/residents'; }}>View all →</button>
      </div>
      {#if loading}
        {#each [1,2,3,4] as i (i)}
          <div class="act-sk"><div class="sk-dot"></div><div class="sk-act-lines"><div class="sk-line sk-lg"></div><div class="sk-line sk-sm"></div></div></div>
        {/each}
      {:else if recentActivity.length === 0}
        <div class="empty-state"><p class="empty-title">No activity yet</p></div>
      {:else}
        {#each recentActivity as r (r.id)}
          <div class="act-row">
            <div class="act-dot" style="background:{activityDotColor(r.status ?? 'pending')};"></div>
            <div class="act-info">
              <p class="act-name">{displayName(r)}</p>
              <p class="act-meta">
                <span class="act-status" style="color:{activityDotColor(r.status ?? 'pending')};">{activityLabel(r.status ?? 'pending')}</span>
                · {formatTime(r.submittedAt)}
              </p>
            </div>
          </div>
        {/each}
      {/if}
      <div style="margin-top:14px;">
        <button class="go-btn" on:click={() => { window.location.href = '/admin/residents?filter=pending'; }}>
          Go to Approve / Decline
          <svg class="ico" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .page { padding:1.5rem; display:flex; flex-direction:column; gap:14px; min-height:100%; background:#f1f5f9; font-family:'Inter',sans-serif; }
  .page-header { display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:10px; }
  .page-title  { font-size:1.4rem; font-weight:800; color:#1e293b; font-family:'Nunito',sans-serif; }
  .page-sub    { font-size:0.8rem; color:#64748b; margin-top:2px; }
  .btn-pending { display:flex; align-items:center; gap:6px; padding:8px 14px; border-radius:10px; background:#fef3c7; border:1px solid #fcd34d; color:#92400e; font-size:0.78rem; font-weight:700; cursor:pointer; transition:background .15s; }
  .btn-pending:hover { background:#fde68a; }
  .error-banner { display:flex; align-items:center; gap:8px; background:#fef2f2; border:1px solid #fecaca; color:#dc2626; font-size:0.8rem; font-weight:600; padding:10px 14px; border-radius:10px; }

  /* 5-column grid for stat cards */
  .g5      { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; }
  .g3-sub  { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
  .g3-mid  { display:grid; grid-template-columns:2fr 1.2fr 1fr; gap:10px; }
  .g2-bot  { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }

  @media (max-width:1200px) { .g5 { grid-template-columns:repeat(3,minmax(0,1fr)); } }
  @media (max-width:1100px) { .g3-mid { grid-template-columns:1fr 1fr; } .g3-mid .chart-card { grid-column:span 2; } }
  @media (max-width:800px)  { .g5 { grid-template-columns:repeat(2,minmax(0,1fr)); } .g3-sub { grid-template-columns:repeat(3,minmax(0,1fr)); } .g3-mid { grid-template-columns:1fr; } .g3-mid .chart-card { grid-column:span 1; } .g2-bot { grid-template-columns:1fr; } }

  .stat-card   { border-radius:14px; padding:16px 18px; color:#fff; }
  .stat-label  { font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:.07em; opacity:.85; margin-bottom:4px; }
  .stat-val    { font-size:2rem; font-weight:800; font-family:'Nunito',sans-serif; }
  .stat-sub    { font-size:0.7rem; opacity:.8; margin-top:2px; }
  .stat-slate  { background:#475569; }
  .stat-blue   { background:#2563eb; }
  .stat-green  { background:#059669; }
  .stat-amber  { background:#d97706; }
  .stat-purple { background:#7c3aed; }

  .metric-card { background:#fff; border:0.5px solid #e2e8f0; border-radius:12px; padding:14px 16px; }
  .mlabel { font-size:0.65rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; margin-bottom:4px; }
  .mval   { font-size:1.6rem; font-weight:800; color:#1e293b; font-family:'Nunito',sans-serif; }
  .mval-warn   { color:#d97706; }
  .mval-danger { color:#dc2626; }

  .card { background:#fff; border:0.5px solid #e2e8f0; border-radius:14px; padding:16px 18px; }
  .card-hd { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
  .sec-title { font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#64748b; }
  .chart-card { display:flex; flex-direction:column; }
  .chart-skeleton { height:170px; background:#f1f5f9; border-radius:8px; }
  .badge { font-size:0.65rem; font-weight:700; padding:3px 8px; border-radius:99px; }
  .b-info { background:#dbeafe; color:#1e40af; }

  .age-row   { display:flex; align-items:center; gap:8px; margin-bottom:9px; }
  .age-row:last-child { margin-bottom:0; }
  .age-label { font-size:0.72rem; color:#64748b; min-width:68px; }
  .age-count { font-size:0.72rem; font-weight:700; color:#1e293b; min-width:22px; text-align:right; }
  .prog-wrap { flex:1; height:6px; border-radius:99px; background:#f1f5f9; overflow:hidden; }
  .prog      { height:100%; border-radius:99px; transition:width .5s ease; }

  .donut-sk { width:100px; height:100px; border-radius:50%; background:#f1f5f9; margin:0 auto 12px; }
  .gender-legend { display:flex; flex-direction:column; gap:7px; }
  .gleg  { display:flex; align-items:center; gap:6px; }
  .gdot  { width:8px; height:8px; border-radius:2px; flex-shrink:0; }
  .glabel { flex:1; font-size:0.73rem; color:#64748b; }
  .gval  { font-size:0.73rem; font-weight:700; color:#1e293b; }

  .cs-row   { display:flex; align-items:center; gap:8px; margin-bottom:7px; }
  .cs-row:last-child { margin-bottom:0; }
  .cs-label { font-size:0.72rem; color:#64748b; min-width:70px; }
  .cs-count { font-size:0.72rem; font-weight:700; color:#1e293b; min-width:22px; text-align:right; }

  .sk-row  { display:flex; align-items:center; gap:8px; margin-bottom:9px; }
  .sk-lbl  { width:68px; height:10px; background:#e2e8f0; border-radius:4px; }
  .sk-bar  { flex:1; height:6px; background:#e2e8f0; border-radius:99px; }
  .sk-num  { width:20px; height:10px; background:#e2e8f0; border-radius:4px; }

  .sector-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:14px; }
  .sector-item { display:flex; align-items:center; gap:12px; }
  .sector-icon { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .si-green  { background:#d1fae5; }
  .si-amber  { background:#fef3c7; }
  .si-purple { background:#ede9fe; }
  .si-blue   { background:#dbeafe; }
  .si-val   { font-size:1.3rem; font-weight:800; color:#1e293b; font-family:'Nunito',sans-serif; }
  .si-label { font-size:0.72rem; color:#64748b; margin-top:1px; }
  .si-pct   { font-size:0.68rem; color:#94a3b8; margin-top:1px; }

  .act-row  { display:flex; align-items:flex-start; gap:10px; padding:8px 0; border-bottom:0.5px solid #f8fafc; }
  .act-row:last-child { border-bottom:none; }
  .act-dot  { width:7px; height:7px; border-radius:50%; flex-shrink:0; margin-top:5px; }
  .act-info { flex:1; min-width:0; }
  .act-name { font-size:0.8rem; font-weight:700; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .act-meta { font-size:0.7rem; color:#94a3b8; margin-top:2px; }
  .act-status { font-weight:600; }
  .act-sk { display:flex; align-items:flex-start; gap:10px; padding:8px 0; }
  .sk-dot { width:7px; height:7px; border-radius:50%; background:#e2e8f0; margin-top:5px; flex-shrink:0; }
  .sk-act-lines { flex:1; display:flex; flex-direction:column; gap:5px; }
  .sk-line { height:10px; background:#e2e8f0; border-radius:4px; }
  .sk-lg { width:60%; }
  .sk-sm { width:40%; }

  .link-btn { font-size:0.75rem; font-weight:700; color:#2563eb; background:none; border:none; cursor:pointer; padding:0; }
  .link-btn:hover { text-decoration:underline; }
  .go-btn { display:flex; align-items:center; gap:6px; width:100%; padding:9px 14px; border-radius:10px; background:#2563eb; color:#fff; font-size:0.8rem; font-weight:700; border:none; cursor:pointer; transition:background .15s,transform .1s; justify-content:center; }
  .go-btn:hover  { background:#1d4ed8; }
  .go-btn:active { transform:scale(.98); }
  .empty-state { padding:2rem 0; text-align:center; }
  .empty-title { font-size:0.85rem; font-weight:700; color:#94a3b8; }
  .ico { width:16px; height:16px; flex-shrink:0; }
</style>