<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { logAuditEvent } from '$lib/audit';

  type FirestoreTimestamp = { toDate: () => Date };
  type ReportTab =
    | 'summary'
    | 'age'
    | 'residentStatus'
    | 'sectors'
    | 'gender'
    | 'civil'
    | 'household'
    | 'location'
    | 'beneficiary'
    | 'export';
  type ReportRecord = {
    id: string;
    address?: string;
    street?: string;
    zone?: string;
    purok?: string;
    householdType?: string;
    status?: string;
    residentStatus?: string;
    isPWD?: boolean;
    isSenior?: boolean;
    isSingleParent?: boolean;
    sex?: string;
    gender?: string;
    civilStatus?: string;
    householdDetails?: {
      residential?: {
        monthlyIncomeRange?: string;
        ownershipStatus?: string;
        dwellingType?: string;
      } | null;
    };
    birthdate?: string | Date | FirestoreTimestamp;
    submittedAt?: string | number | Date | FirestoreTimestamp;
  };

  type SummaryRow = {
    label: string;
    count: number;
    note?: string;
    tone?: string;
  };

  type ExportRow = {
    report: string;
    category: string;
    count: number;
    percent: string;
  };

  let records: ReportRecord[] = [];
  let loading = true;
  let loadError = '';
  let activeTab: ReportTab = 'summary';
  let approvalFilter = 'approved';
  let residentFilter = 'all';
  let showExportOptions = false;
  let unsub: (() => void) | null = null;

  const tabs: { id: ReportTab; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'age', label: 'Age Bracket' },
    { id: 'residentStatus', label: 'Resident Status' },
    { id: 'sectors', label: 'Special Sectors' },
    { id: 'gender', label: 'Gender' },
    { id: 'civil', label: 'Civil Status' },
    { id: 'household', label: 'Household Type' },
    { id: 'location', label: 'Location / Zone' },
    { id: 'beneficiary', label: 'Beneficiary' }
  ];

  const ageLabels: Record<string, string> = {
    child: '0-12 Children',
    youth: '13-17 Youth',
    adult: '18-35 Adults',
    middleAge: '36-59 Working Age',
    senior: '60+ Senior Citizens',
    unknown: 'No Birthdate'
  };

  const residentStatusLabels: Record<string, string> = {
    active: 'Active',
    inactive: 'Inactive',
    deceased: 'Deceased',
    abroad: 'Abroad',
    transferred: 'Transferred / Moved Out',
    unknown: 'Not Set'
  };

  const civilStatusLabels: Record<string, string> = {
    single: 'Single',
    married: 'Married',
    widowed: 'Widowed',
    separated: 'Separated',
    annulled: 'Annulled',
    unknown: 'Not Set'
  };

  $: approved = records.filter((record) => record.status === 'approved');
  $: pending = records.filter((record) => record.status === 'pending').length;
  $: declined = records.filter((record) => record.status === 'declined').length;
  $: pwd = approved.filter((record) => record.isPWD).length;
  $: senior = approved.filter((record) => record.isSenior).length;
  $: soloParent = approved.filter((record) => record.isSingleParent).length;
  $: activeResidents = approved.filter((record) => normalizeResidentStatus(record) === 'active').length;
  $: inactiveResidents = approved.filter((record) => normalizeResidentStatus(record) !== 'active').length;
  $: reportBase = records.filter((record) => {
    const matchesApproval = approvalFilter === 'all' || record.status === approvalFilter;
    const normalizedResidentStatus = normalizeResidentStatus(record);
    const matchesResidentStatus = residentFilter === 'all' || normalizedResidentStatus === residentFilter;
    return matchesApproval && matchesResidentStatus;
  });
  $: filteredApproved = reportBase.filter((record) => record.status === 'approved').length;
  $: filteredPending = reportBase.filter((record) => record.status === 'pending').length;
  $: filteredDeclined = reportBase.filter((record) => record.status === 'declined').length;
  $: filteredActiveResidents = reportBase.filter((record) => normalizeResidentStatus(record) === 'active').length;
  $: filteredInactiveResidents = reportBase.filter((record) => normalizeResidentStatus(record) !== 'active').length;
  $: rows = getRows(
    activeTab,
    reportBase,
    filteredApproved,
    filteredPending,
    filteredDeclined,
    filteredActiveResidents,
    filteredInactiveResidents
  );
  $: totalForRows = rows.reduce((sum, row) => sum + safeCount(row.count), 0);
  $: maxRowCount = Math.max(1, ...rows.map((row) => safeCount(row.count)));
  $: exportPreviewRows = rowsForExport(
    activeTab,
    reportBase,
    filteredApproved,
    filteredPending,
    filteredDeclined,
    filteredActiveResidents,
    filteredInactiveResidents
  );

  function normalizeResidentStatus(record: ReportRecord) {
    const value = (record.residentStatus || 'active').trim().toLowerCase();
    if (['active', 'inactive', 'deceased', 'abroad', 'transferred'].includes(value)) return value;
    return 'unknown';
  }

  function normalizeType(record: ReportRecord) {
    const value = (record.householdType || 'residential').trim().toLowerCase();
    if (value === 'boarding') return 'Boarding / Rental';
    if (value === 'business') return 'Business';
    if (value === 'residential') return 'Residential';
    return value ? titleCase(value) : 'Not Set';
  }

  function normalizeLocation(record: ReportRecord) {
    if (record.purok) return `Purok ${record.purok}`;
    if (record.zone) return `Zone ${record.zone}`;
    if (record.street) return record.street;
    return 'No Location';
  }

  function normalizeGender(record: ReportRecord) {
    const value = (record.sex ?? record.gender ?? '').trim().toLowerCase();
    if (value === 'male' || value === 'm') return 'Male';
    if (value === 'female' || value === 'f') return 'Female';
    return 'Other / Not Set';
  }

  function normalizeCivilStatus(record: ReportRecord) {
    const value = (record.civilStatus || '').trim().toLowerCase();
    if (['single', 'married', 'widowed', 'separated', 'annulled'].includes(value)) return value;
    return 'unknown';
  }

  function normalizeIncome(record: ReportRecord) {
    return record.householdDetails?.residential?.monthlyIncomeRange || 'Not recorded';
  }

  function isLowIncome(record: ReportRecord) {
    const income = normalizeIncome(record).toLowerCase();
    return income.includes('below') || income.includes('10,000') || income.includes('10000');
  }

  function toDate(value: ReportRecord['birthdate'] | ReportRecord['submittedAt']) {
    if (!value) return null;
    const date = typeof value === 'object' && value !== null && 'toDate' in value ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getAgeGroup(record: ReportRecord) {
    const birthdate = toDate(record.birthdate);
    if (!birthdate) return 'unknown';
    const age = Math.floor((Date.now() - birthdate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (age < 13) return 'child';
    if (age < 18) return 'youth';
    if (age < 36) return 'adult';
    if (age < 60) return 'middleAge';
    return 'senior';
  }

  function countBy(items: ReportRecord[], getter: (record: ReportRecord) => string) {
    const counts: Record<string, number> = {};
    for (const item of items) {
      const key = getter(item);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  function safeCount(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getRows(
    tab: ReportTab,
    _base = reportBase,
    _approvedTotal = approved.length,
    _pendingTotal = pending,
    _declinedTotal = declined,
    _activeTotal = activeResidents,
    _inactiveTotal = inactiveResidents
  ): SummaryRow[] {
    if (tab === 'summary') {
      return [
        { label: 'Approved Profiles', count: _approvedTotal, note: 'Ready for official reports', tone: 'bg-emerald-500' },
        { label: 'Pending Review', count: _pendingTotal, note: 'Needs approval or decline', tone: 'bg-amber-500' },
        { label: 'Declined Profiles', count: _declinedTotal, note: 'Not included in approved totals', tone: 'bg-red-500' },
        { label: 'Active Approved Residents', count: _activeTotal, note: 'Approved and currently active', tone: 'bg-blue-500' },
        { label: 'Inactive / Special Status', count: _inactiveTotal, note: 'Inactive, deceased, abroad, or transferred', tone: 'bg-slate-500' }
      ];
    }

    if (tab === 'age') {
      const counts = countBy(_base, getAgeGroup);
      return Object.keys(ageLabels).map((key) => ({
        label: ageLabels[key],
        count: counts.find((row) => row.label === key)?.count ?? 0
      }));
    }

    if (tab === 'residentStatus') {
      const counts = countBy(_base, normalizeResidentStatus);
      return Object.keys(residentStatusLabels).map((key) => ({
        label: residentStatusLabels[key],
        count: counts.find((row) => row.label === key)?.count ?? 0
      }));
    }

    if (tab === 'sectors') {
      return [
        { label: 'PWD', count: _base.filter((record) => record.isPWD).length },
        { label: 'Senior Citizen', count: _base.filter((record) => record.isSenior).length },
        { label: 'Solo Parent', count: _base.filter((record) => record.isSingleParent).length },
        {
          label: 'PWD and Senior',
          count: _base.filter((record) => record.isPWD && record.isSenior).length
        },
        { label: 'Male', count: _base.filter((record) => normalizeGender(record) === 'Male').length },
        { label: 'Female', count: _base.filter((record) => normalizeGender(record) === 'Female').length }
      ];
    }

    if (tab === 'gender') return countBy(_base, normalizeGender);

    if (tab === 'civil') {
      const counts = countBy(_base, normalizeCivilStatus);
      return Object.keys(civilStatusLabels).map((key) => ({
        label: civilStatusLabels[key],
        count: counts.find((row) => row.label === key)?.count ?? 0
      }));
    }

    if (tab === 'household') return countBy(_base, normalizeType);

    if (tab === 'location') return countBy(_base, normalizeLocation);

    if (tab === 'beneficiary') {
      return [
        { label: 'Senior Citizens Needing Assistance', count: _base.filter((record) => record.isSenior).length },
        { label: 'PWD Beneficiaries', count: _base.filter((record) => record.isPWD).length },
        { label: 'Solo Parent Beneficiaries', count: _base.filter((record) => record.isSingleParent).length },
        { label: 'Low-Income Households', count: _base.filter(isLowIncome).length },
        {
          label: 'Multiple Assistance Categories',
          count: _base.filter(
            (record) =>
              [record.isSenior, record.isPWD, record.isSingleParent, isLowIncome(record)].filter(Boolean).length > 1
          ).length
        }
      ];
    }

    return [];
  }

  function rowsForExport(
    tabId: ReportTab = activeTab,
    _base = reportBase,
    _approvedTotal = approved.length,
    _pendingTotal = pending,
    _declinedTotal = declined,
    _activeTotal = activeResidents,
    _inactiveTotal = inactiveResidents
  ): ExportRow[] {
    const tab = tabs.find((item) => item.id === tabId) ?? tabs[0];
    const tabRows = getRows(
      tab.id,
      _base,
      _approvedTotal,
      _pendingTotal,
      _declinedTotal,
      _activeTotal,
      _inactiveTotal
    );

    return tabRows.map((row) => ({
      report: tab.label,
      category: row.label,
      count: row.count,
      percent: `${percentageFor(row.count, tabRows)}%`
    }));
  }

  function titleCase(value: string) {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function percentage(count: number) {
    if (totalForRows === 0) return 0;
    return Math.round((safeCount(count) / totalForRows) * 100);
  }

  function percentageFor(count: number, sourceRows: SummaryRow[]) {
    const total = sourceRows.reduce((sum, row) => sum + safeCount(row.count), 0);
    if (total === 0) return 0;
    return Math.round((safeCount(count) / total) * 100);
  }

  function reportTitle() {
    return tabs.find((tab) => tab.id === activeTab)?.label ?? 'Report';
  }

  function exportFilename(extension: string) {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const report = reportTitle().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `geoprofile-${report || 'report'}-${date}.${extension}`;
  }

  function filterLabel(value: string, labels: Record<string, string>) {
    if (value === 'all') return 'All';
    return labels[value] ?? titleCase(value);
  }

  function exportHeader() {
    return [
      'Report',
      'Category',
      'Count',
      'Percent',
      'Approval Filter',
      'Resident Status Filter'
    ];
  }

  function exportRows() {
    return exportPreviewRows.map((row) => [
      row.report,
      row.category,
      row.count,
      row.percent,
      filterLabel(approvalFilter, {
        approved: 'Approved Only',
        pending: 'Pending Only',
        declined: 'Declined Only'
      }),
      filterLabel(residentFilter, residentStatusLabels)
    ]);
  }

  async function auditReportExport(format: string) {
    await logAuditEvent({
      action: 'export_report',
      module: 'Reports',
      description: `Exported ${reportTitle()} report as ${format.toUpperCase()}`,
      targetLabel: reportTitle(),
      metadata: {
        format,
        report: reportTitle(),
        approvalFilter: filterLabel(approvalFilter, {
          approved: 'Approved Only',
          pending: 'Pending Only',
          declined: 'Declined Only'
        }),
        residentFilter: filterLabel(residentFilter, residentStatusLabels),
        recordsIncluded: reportBase.length,
        rowsExported: exportPreviewRows.length
      }
    });
  }

  function downloadBlob(content: BlobPart[], type: string, filename: string) {
    const blob = new Blob(content, { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(value: unknown) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function downloadCsv() {
    const header = ['Report', 'Category', 'Count', 'Percent', 'Approval Filter', 'Resident Status Filter'];
    const sourceRows = exportRows();
    const csv = [header, ...sourceRows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    downloadBlob(['\ufeff', csv], 'text/csv;charset=utf-8;', exportFilename('csv'));
    await auditReportExport('csv');
    showExportOptions = false;
  }

  function buildExportTable() {
    const headerCells = exportHeader().map((cell) => `<th>${escapeHtml(cell)}</th>`).join('');
    const bodyRows = exportRows()
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
      .join('');

    return `
      <table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    `;
  }

  async function downloadExcel() {
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
            th { background: #1d4ed8; color: #ffffff; font-weight: 700; }
            th, td { border: 1px solid #d7dee8; padding: 8px 10px; text-align: left; }
          </style>
        </head>
        <body>${buildExportTable()}</body>
      </html>
    `;
    downloadBlob(['\ufeff', html], 'application/vnd.ms-excel;charset=utf-8;', exportFilename('xls'));
    await auditReportExport('excel');
    showExportOptions = false;
  }

  async function downloadPdf() {
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      alert('Please allow popups so GeoProfile can open the PDF print preview.');
      return;
    }
    showExportOptions = false;

    printWindow.document.write(`
      <html>
        <head>
          <title>GeoProfile Reports</title>
          <style>
            body { color: #0f172a; font-family: Arial, sans-serif; margin: 32px; }
            h1 { font-size: 24px; margin: 0 0 6px; }
            p { color: #475569; font-size: 12px; margin: 0 0 18px; }
            table { border-collapse: collapse; font-size: 11px; width: 100%; }
            th { background: #1d4ed8; color: #ffffff; font-weight: 700; }
            th, td { border: 1px solid #d7dee8; padding: 8px; text-align: left; }
            tr:nth-child(even) td { background: #f8fafc; }
            @media print { body { margin: 18mm; } }
          </style>
        </head>
        <body>
          <h1>GeoProfile Reports</h1>
          <p>
            Report: ${escapeHtml(reportTitle())} |
            Approval: ${escapeHtml(filterLabel(approvalFilter, {
              approved: 'Approved Only',
              pending: 'Pending Only',
              declined: 'Declined Only'
            }))} |
            Resident Status: ${escapeHtml(filterLabel(residentFilter, residentStatusLabels))} |
            Records included: ${reportBase.length.toLocaleString()}
          </p>
          ${buildExportTable()}
          <script>
            window.addEventListener('load', () => {
              setTimeout(() => window.print(), 250);
            });
          </scr${'ipt'}>
        </body>
      </html>
    `);
    printWindow.document.close();
    await auditReportExport('pdf');
  }

  onMount(async () => {
    try {
      const { db } = await import('$lib/firebase');
      const { collection, onSnapshot } = await import('firebase/firestore');

      unsub = onSnapshot(
        collection(db, 'residents'),
        (snap) => {
          records = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          loading = false;
        },
        (error) => {
          console.error(error);
          loadError = 'Could not load report records.';
          loading = false;
        }
      );
    } catch (error) {
      console.error(error);
      loadError = 'Firebase connection failed.';
      loading = false;
    }
  });

  onDestroy(() => unsub?.());
</script>

<div class="min-h-screen bg-slate-100 p-6 font-inter">
  <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 class="font-nunito text-2xl font-extrabold text-slate-800">Reports</h1>
      <p class="mt-0.5 text-sm text-slate-500">Generate beneficiary and profiling summaries</p>
    </div>
    <div class="relative">
      <button
        type="button"
        on:click={() => (showExportOptions = !showExportOptions)}
        disabled={loading || exportPreviewRows.length === 0}
        class="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
      >
        Export Files
      </button>

      {#if showExportOptions}
        <div class="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-2 shadow-lg">
          <p class="px-4 pb-2 text-xs font-bold text-slate-400">{reportTitle()} export</p>
          <button
            type="button"
            on:click={downloadCsv}
            class="block w-full px-4 py-2 text-left text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            Download CSV
          </button>
          <button
            type="button"
            on:click={downloadExcel}
            class="block w-full px-4 py-2 text-left text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            Download Excel
          </button>
          <button
            type="button"
            on:click={downloadPdf}
            class="block w-full px-4 py-2 text-left text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            Print / Save PDF
          </button>
        </div>
      {/if}
    </div>
  </div>

  {#if loadError}
    <div class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
      {loadError}
    </div>
  {/if}

  <div class="grid gap-3 md:grid-cols-4">
    <div class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p class="text-xs font-bold uppercase tracking-widest text-slate-400">Approved</p>
      <p class="mt-2 font-nunito text-3xl font-extrabold text-slate-800">{approved.length.toLocaleString()}</p>
    </div>
    <div class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p class="text-xs font-bold uppercase tracking-widest text-slate-400">Active</p>
      <p class="mt-2 font-nunito text-3xl font-extrabold text-emerald-600">{activeResidents.toLocaleString()}</p>
    </div>
    <div class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p class="text-xs font-bold uppercase tracking-widest text-slate-400">PWD</p>
      <p class="mt-2 font-nunito text-3xl font-extrabold text-amber-600">{pwd.toLocaleString()}</p>
    </div>
    <div class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p class="text-xs font-bold uppercase tracking-widest text-slate-400">Senior / Solo Parent</p>
      <p class="mt-2 font-nunito text-3xl font-extrabold text-blue-600">{senior + soloParent}</p>
    </div>
  </div>

  <div class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div class="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-4">
      {#each tabs as tab (tab.id)}
        <button
          type="button"
          on:click={() => (activeTab = tab.id)}
          class="rounded-xl px-3.5 py-2 text-sm font-bold transition-all {activeTab === tab.id
            ? 'bg-blue-600 text-white shadow-sm'
            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}"
        >
          {tab.label}
        </button>
      {/each}
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-3">
      <select
        bind:value={approvalFilter}
        class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      >
        <option value="approved">Approved Only</option>
        <option value="pending">Pending Only</option>
        <option value="declined">Declined Only</option>
        <option value="all">All Approval Status</option>
      </select>
      <select
        bind:value={residentFilter}
        class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      >
        <option value="all">All Resident Status</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="deceased">Deceased</option>
        <option value="abroad">Abroad</option>
        <option value="transferred">Transferred</option>
      </select>
      <span class="text-xs font-bold text-slate-400">{reportBase.length} records included</span>
    </div>

    {#if activeTab === 'export'}
      <div class="mt-5">
        <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="font-nunito text-lg font-extrabold text-slate-800">Export Reports</h2>
            <p class="text-xs font-semibold text-slate-400">
              Files use the active filters and include every report section shown in this dashboard.
            </p>
          </div>
          <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
            {exportPreviewRows.length.toLocaleString()} export rows
          </span>
        </div>

        <div class="grid gap-4 lg:grid-cols-3">
          <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M8 13h8" />
                <path d="M8 17h5" />
              </svg>
            </div>
            <h3 class="mt-4 font-nunito text-base font-extrabold text-slate-800">CSV File</h3>
            <p class="mt-1 min-h-10 text-sm font-semibold text-slate-500">
              Best for uploading to systems, data cleanup, and simple spreadsheet imports.
            </p>
            <button
              type="button"
              on:click={downloadCsv}
              disabled={loading || exportPreviewRows.length === 0}
              class="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Download CSV
            </button>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 3h18v18H3z" />
                <path d="M3 9h18" />
                <path d="M9 9v12" />
              </svg>
            </div>
            <h3 class="mt-4 font-nunito text-base font-extrabold text-slate-800">Excel File</h3>
            <p class="mt-1 min-h-10 text-sm font-semibold text-slate-500">
              Opens directly in Microsoft Excel with table headings and readable columns.
            </p>
            <button
              type="button"
              on:click={downloadExcel}
              disabled={loading || exportPreviewRows.length === 0}
              class="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Download Excel
            </button>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9V2h12v7" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <path d="M6 14h12v8H6z" />
              </svg>
            </div>
            <h3 class="mt-4 font-nunito text-base font-extrabold text-slate-800">PDF Report</h3>
            <p class="mt-1 min-h-10 text-sm font-semibold text-slate-500">
              Opens a print-ready report that can be saved as PDF for official requests.
            </p>
            <button
              type="button"
              on:click={downloadPdf}
              disabled={loading || exportPreviewRows.length === 0}
              class="mt-5 w-full rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              Print / Save PDF
            </button>
          </div>
        </div>

        <div class="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <div class="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3">
            <div>
              <h3 class="font-nunito text-sm font-extrabold text-slate-800">Export Preview</h3>
              <p class="text-xs font-semibold text-slate-400">
                Showing the first 12 rows from the file.
              </p>
            </div>
            <span class="text-xs font-bold text-slate-400">
              Approval: {filterLabel(approvalFilter, {
                approved: 'Approved Only',
                pending: 'Pending Only',
                declined: 'Declined Only'
              })}
              · Resident: {filterLabel(residentFilter, residentStatusLabels)}
            </span>
          </div>

          {#if loading}
            <div class="space-y-3 p-4">
              {#each [1, 2, 3] as item (item)}
                <div class="h-12 animate-pulse rounded-xl bg-slate-100"></div>
              {/each}
            </div>
          {:else if exportPreviewRows.length === 0}
            <div class="py-10 text-center text-sm font-semibold text-slate-400">
              No report rows are available for the current filters.
            </div>
          {:else}
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead class="bg-white text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th class="px-4 py-3 font-extrabold">Report</th>
                    <th class="px-4 py-3 font-extrabold">Category</th>
                    <th class="px-4 py-3 text-right font-extrabold">Count</th>
                    <th class="px-4 py-3 text-right font-extrabold">Percent</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                  {#each exportPreviewRows.slice(0, 12) as row (`${row.report}-${row.category}`)}
                    <tr>
                      <td class="px-4 py-3 font-bold text-slate-700">{row.report}</td>
                      <td class="px-4 py-3 font-semibold text-slate-500">{row.category}</td>
                      <td class="px-4 py-3 text-right font-bold text-slate-700">{safeCount(row.count).toLocaleString()}</td>
                      <td class="px-4 py-3 text-right font-bold text-slate-500">{row.percent}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <div class="mt-5">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 class="font-nunito text-lg font-extrabold text-slate-800">{reportTitle()} Report</h2>
          <p class="text-xs font-semibold text-slate-400">Counts and percentages are based on the active filters.</p>
        </div>
        <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
          Total: {totalForRows.toLocaleString()}
        </span>
      </div>

      {#if loading}
        <div class="space-y-3">
          {#each [1, 2, 3, 4, 5] as item (item)}
            <div class="h-14 animate-pulse rounded-xl bg-slate-100"></div>
          {/each}
        </div>
      {:else if rows.length === 0 || totalForRows === 0}
        <div class="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm font-semibold text-slate-400">
          No records match this report filter
        </div>
      {:else}
        <div class="space-y-3">
          {#each rows as row (row.label)}
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-extrabold text-slate-700">{row.label}</p>
                  {#if row.note}
                    <p class="mt-0.5 text-xs font-semibold text-slate-400">{row.note}</p>
                  {/if}
                </div>
                <div class="text-right">
                  <p class="font-nunito text-2xl font-extrabold text-slate-800">{safeCount(row.count).toLocaleString()}</p>
                  <p class="text-xs font-bold text-slate-400">{percentage(row.count)}%</p>
                </div>
              </div>
              <div class="mt-3 h-2 overflow-hidden rounded-full bg-white">
                <div
                  class="h-full rounded-full {row.tone || 'bg-blue-600'}"
                  style="width:{Math.max(3, Math.round((safeCount(row.count) / maxRowCount) * 100))}%"
                ></div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      </div>
    {/if}
  </div>
</div>
