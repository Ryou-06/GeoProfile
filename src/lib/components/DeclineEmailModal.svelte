<!-- src/lib/components/DeclineEmailModal.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  // Define proper interfaces
  interface Resident {
    id: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    qrId?: string;
    householdId?: string;
  }
  
  export let resident: Resident | null = null;
  export let householdId: string = '';
  
  const dispatch = createEventDispatcher();
  
  let sending = false;
  let emailData = {
    to: '',
    subject: 'Your Resident Registration has been Declined',
    reason: '',
    includeQR: true
  };
  
  let qrCodeUrl: string | null = null;
  let loadedQrHouseholdId = '';
  
  $: if (resident?.email) {
    emailData.to = resident.email;
  }

  $: if (emailData.includeQR && householdId && loadedQrHouseholdId !== householdId) {
    loadedQrHouseholdId = householdId;
    fetchQRCode();
  }
  
  // Fetch QR code for the household
  async function fetchQRCode(): Promise<string | null> {
    if (!householdId) return null;
    
    try {
      const { db } = await import('$lib/firebase');
      const { doc, getDoc } = await import('firebase/firestore');
      
      const householdDoc = await getDoc(doc(db, 'households', householdId));
      if (householdDoc.exists()) {
        const data = householdDoc.data();
        // If you have a QR code image URL stored
        if (data.qrCodeUrl) {
          qrCodeUrl = data.qrCodeUrl;
          return data.qrCodeUrl;
        }
        // Otherwise generate a QR code URL using qrId
        const qrId = data.qrId;
        // You can use a QR code API service
        qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrId)}`;
        return qrCodeUrl;
      }
    } catch (error) {
      console.error('Error fetching QR code:', error);
    }
    return null;
  }
  
  async function sendDeclineEmail() {
    if (!emailData.reason.trim()) {
      alert('Please provide a reason for declining');
      return;
    }
    
    sending = true;
    
    try {
      // Fetch QR code if needed
      let qrImage = null;
      if (emailData.includeQR) {
        qrImage = await fetchQRCode();
      }
      
      // Call your API endpoint to send email
      const response = await fetch('/api/send-decline-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailData.to,
          subject: emailData.subject,
          reason: emailData.reason,
          residentName: resident?.name || `${resident?.firstName} ${resident?.lastName}`,
          qrCodeUrl: qrImage,
          qrId: resident?.qrId,
          householdId: householdId,
          includeQR: emailData.includeQR
        })
      });
      
      if (!response.ok) throw new Error('Failed to send email');
      
      dispatch('emailSent', { success: true });
      
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Failed to send email. Please try again.');
    } finally {
      sending = false;
    }
  }
  
  function closeModal() {
    dispatch('close');
  }
</script>

<div class="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-2 backdrop-blur-sm sm:p-4">
  <section class="grid max-h-[96dvh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl md:grid-cols-[320px_1fr]">
    <aside class="bg-red-50 p-4 sm:p-6">
      <div class="mb-5 flex items-center gap-3">
        <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100">
          <svg class="h-5 w-5 text-red-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
        </div>
        <div>
          <p class="text-xs font-extrabold uppercase tracking-widest text-red-500">Decline</p>
          <h3 class="font-nunito text-lg font-extrabold text-slate-800">Registration</h3>
        </div>
      </div>

      <div class="rounded-xl border border-red-100 bg-white p-4">
        <p class="text-xs font-bold uppercase tracking-widest text-slate-400">Resident</p>
        <p class="mt-1 font-bold text-slate-800">{resident?.name || `${resident?.firstName ?? ''} ${resident?.lastName ?? ''}`}</p>
        <p class="mt-1 break-all text-xs text-slate-500">ID: {resident?.id}</p>
      </div>

      <div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
        <p class="font-extrabold">This action will:</p>
        <ul class="mt-2 list-disc space-y-1 pl-4">
          <li>Send an email notification to the resident</li>
          <li>Mark this registration as declined</li>
          <li>Allow re-registration when QR is included</li>
        </ul>
      </div>

      {#if emailData.includeQR && qrCodeUrl}
        <div class="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-center">
          <img src={qrCodeUrl} alt="QR Code" class="mx-auto h-32 w-32" />
          <p class="mt-2 text-xs font-bold text-slate-500">QR preview</p>
        </div>
      {/if}
    </aside>

    <div class="flex min-h-0 flex-col">
      <header class="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-6">
        <div>
          <h3 class="font-nunito text-lg font-extrabold text-slate-800">Decline Email Details</h3>
          <p class="text-xs font-semibold text-slate-500">Review the recipient and reason before sending.</p>
        </div>
        <button type="button" on:click={closeModal}
          class="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
          aria-label="Close decline modal">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </header>

      <div class="grid gap-4 overflow-y-auto p-4 sm:p-6 lg:grid-cols-2">
        <label class="block">
          <span class="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">
            Recipient Email <span class="text-red-400">*</span>
          </span>
          <input type="email" bind:value={emailData.to}
            class="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-red-400"
            placeholder="resident@example.com" />
        </label>

        <label class="block">
          <span class="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">
            Subject <span class="text-red-400">*</span>
          </span>
          <input type="text" bind:value={emailData.subject}
            class="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-red-400" />
        </label>

        <label class="block lg:col-span-2">
          <span class="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">
            Reason for Declining <span class="text-red-400">*</span>
          </span>
          <textarea bind:value={emailData.reason}
            rows="7"
            placeholder="Please provide the reason why this registration is being declined..."
            class="w-full resize-none rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-red-400"></textarea>
        </label>

        <label class="flex cursor-pointer items-start gap-3 rounded-xl bg-blue-50 p-4 lg:col-span-2">
          <input type="checkbox" bind:checked={emailData.includeQR}
            class="mt-0.5 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
          <div class="flex-1">
            <p class="text-sm font-bold text-slate-700">Include QR Code</p>
            <p class="text-xs text-slate-500">Resident can re-register using the same QR code</p>
          </div>
        </label>
      </div>

      <footer class="mt-auto flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-4 py-4 sm:flex-row sm:px-6">
        <button type="button" on:click={closeModal}
          class="flex-1 rounded-xl bg-white py-2.5 text-sm font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100">
          Cancel
        </button>
        <button type="button" on:click={sendDeclineEmail} disabled={sending}
          class="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50">
          {sending ? 'Sending...' : 'Send & Decline'}
        </button>
      </footer>
    </div>
  </section>
</div>
