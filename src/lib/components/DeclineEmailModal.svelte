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
  
  $: if (resident?.email) {
    emailData.to = resident.email;
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

<!-- Backdrop - REMOVED the on:click handler -->
<div class="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
  <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" on:click|stopPropagation>
    
    <!-- Header -->
    <div class="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
          <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
        </div>
        <h3 class="font-nunito font-extrabold text-slate-700">Decline Registration</h3>
      </div>
      <button on:click={closeModal}
        class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
        <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
    
    <!-- Form Body -->
    <div class="p-6 space-y-4">
      <!-- Resident Info -->
      <div class="bg-slate-50 rounded-xl p-3">
        <p class="text-xs text-slate-500">Resident</p>
        <p class="font-bold text-slate-700">{resident?.name || `${resident?.firstName} ${resident?.lastName}`}</p>
        <p class="text-xs text-slate-500 mt-1">ID: {resident?.id}</p>
      </div>
      
      <!-- Email Field (auto-filled, can edit) -->
      <div>
        <label class="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
          Recipient Email <span class="text-red-400">*</span>
        </label>
        <input type="email" bind:value={emailData.to}
          class="w-full px-3 py-2 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm focus:border-red-400 focus:outline-none"
          placeholder="resident@example.com" />
      </div>
      
      <!-- Subject Field -->
      <div>
        <label class="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
          Subject <span class="text-red-400">*</span>
        </label>
        <input type="text" bind:value={emailData.subject}
          class="w-full px-3 py-2 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm focus:border-red-400 focus:outline-none" />
      </div>
      
      <!-- Reason Field -->
      <div>
        <label class="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
          Reason for Declining <span class="text-red-400">*</span>
        </label>
        <textarea bind:value={emailData.reason}
          rows="4"
          placeholder="Please provide the reason why this registration is being declined..."
          class="w-full px-3 py-2 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm focus:border-red-400 focus:outline-none resize-none"></textarea>
      </div>
      
      <!-- Include QR Code Checkbox -->
      <label class="flex items-start gap-3 p-3 bg-blue-50 rounded-xl cursor-pointer">
        <input type="checkbox" bind:checked={emailData.includeQR}
          class="mt-0.5 w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
        <div class="flex-1">
          <p class="text-sm font-bold text-slate-700">Include QR Code</p>
          <p class="text-xs text-slate-500">Resident can re-register using the same QR code</p>
        </div>
      </label>
      
      <!-- QR Code Preview (if included) -->
      {#if emailData.includeQR && qrCodeUrl}
        <div class="flex justify-center p-3 bg-slate-50 rounded-xl">
          <img src={qrCodeUrl} alt="QR Code" class="w-32 h-32" />
        </div>
      {/if}
      
      <!-- Warning Message -->
      <div class="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
        <svg class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
        <div class="text-xs text-amber-700">
          <p class="font-bold">This action will:</p>
          <ul class="list-disc list-inside mt-1">
            <li>Send an email notification to the resident</li>
            <li>Mark their registration as "Declined"</li>
            <li>Allow them to re-register using the QR code</li>
          </ul>
        </div>
      </div>
    </div>
    
    <!-- Footer Buttons -->
    <div class="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex gap-3">
      <button on:click={closeModal}
        class="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
        Cancel
      </button>
      <button on:click={sendDeclineEmail} disabled={sending}
        class="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
        {#if sending}
          <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          Sending...
        {:else}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          Send & Decline
        {/if}
      </button>
    </div>
  </div>
</div>