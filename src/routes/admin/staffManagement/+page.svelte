<!-- src/routes/admin/staff-management/+page.svelte -->
<!-- src/routes/admin/staff-management/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  // Types
  interface StaffMember {
    id: string;
    username: string;
    name: string;
    email: string;
    position: string;
    role: string;
    createdAt?: {
      toDate: () => Date;
    } | null;
  }

  let staffList: StaffMember[] = [];
  let loading = true;

  let showAddModal = false;
  let showEditModal = false;
  let showDeleteModal = false;
  let selectedStaff: StaffMember | null = null;

  // Success toast
  let toastMessage = '';
  let toastVisible = false;
  let toastTimeout: ReturnType<typeof setTimeout> | undefined;

  function showToast(msg: string) {
    toastMessage = msg;
    toastVisible = true;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastVisible = false;
    }, 3500);
  }

  // Add staff form
  let newUsername = '';
  let newName = '';
  let newPosition = '';
  let newPassword = '';
  let newConfirm = '';
  let addLoading = false;
  let addError = '';
  let usernameChecking = false;
  let usernameAvailable: boolean | null = null;

  // Edit staff form
  let editName = '';
  let editPosition = '';
  let editPassword = '';
  let editConfirm = '';
  let editLoading = false;
  let editError = '';
  let resetPassword = false;

  const staffPositions = [
    'Barangay Kagawad',
    'Barangay Tanod',
    'Health Worker',
    'IT Officer / Encoder',
  ];

  onMount(async () => {
    try {
      const { auth, db } = await import('$lib/firebase');
      const { onAuthStateChanged } = await import('firebase/auth');
      const { doc, getDoc } = await import('firebase/firestore');

      onAuthStateChanged(auth, async (user) => {
        if (!user) { window.location.href = '/'; return; }
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists() || userDoc.data().role !== 'admin') {
          window.location.href = '/';
          return;
        }
        loadStaff();
      });
    } catch {
      console.error('Error in onMount');
      window.location.href = '/';
    }
  });

async function loadStaff() {
  loading = true;
  try {
    const { db } = await import('$lib/firebase');
    const { collection, query, where, getDocs } = await import('firebase/firestore');

    const q = query(
      collection(db, 'users'),
      where('role', '==', 'staff')
    );
    const snapshot = await getDocs(q);
    staffList = snapshot.docs.map(doc => {
      const data = doc.data();
      return { 
        id: doc.id,
        username: data.username || '',  // Ensure username exists
        name: data.name || '',
        email: data.email || '',
        position: data.position || '',
        role: data.role || '',
        createdAt: data.createdAt || null
      } as StaffMember;
    });
    
    // Sort on the client side
    staffList.sort((a, b) => {
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime();
    });
  } catch (e) {
    console.error('Error loading staff:', e);
  }
  loading = false;
}


  // ─── Username availability check ───────────────────────────────────────────

  async function checkUsername() {
    if (!newUsername.trim() || newUsername.length < 3) {
      usernameAvailable = null;
      return;
    }
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(newUsername)) {
      usernameAvailable = false;
      return;
    }
    usernameChecking = true;
    try {
      const { db } = await import('$lib/firebase');
      const { doc, getDoc } = await import('firebase/firestore');
      const snap = await getDoc(doc(db, 'usernames', newUsername.toLowerCase().trim()));
      usernameAvailable = !snap.exists();
    } catch {
      usernameAvailable = null;
    }
    usernameChecking = false;
  }

  let usernameTimeout: ReturnType<typeof setTimeout> | undefined;
  function onUsernameInput() {
    usernameAvailable = null;
    clearTimeout(usernameTimeout);
    usernameTimeout = setTimeout(checkUsername, 500);
  }

  // ─── Add Staff ─────────────────────────────────────────────────────────────

  function resetAddForm() {
    newUsername = '';
    newName = '';
    newPosition = '';
    newPassword = '';
    newConfirm = '';
    addError = '';
    usernameAvailable = null;
  }

async function handleAddStaff() {
  addError = '';

  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  const reserved = ['admin', 'root', 'system', 'administrator', 'superuser', 'moderator'];

  if (!newUsername.trim()) { addError = 'Please enter a username.'; return; }
  if (newUsername.length < 3) { addError = 'Username must be at least 3 characters.'; return; }
  if (newUsername.length > 20) { addError = 'Username must be 20 characters or less.'; return; }
  if (!usernameRegex.test(newUsername)) { addError = 'Username can only contain letters, numbers, underscores, and dashes.'; return; }
  if (reserved.includes(newUsername.toLowerCase())) { addError = 'This username is reserved.'; return; }
  if (!newName.trim()) { addError = 'Please enter staff name.'; return; }
  if (!newPosition) { addError = 'Please select a position.'; return; }
  if (!newPassword) { addError = 'Please enter a password.'; return; }
  if (newPassword.length < 8) { addError = 'Password must be at least 8 characters.'; return; }
  if (newPassword !== newConfirm) { addError = 'Passwords do not match.'; return; }

  addLoading = true;

  try {
    // Import Firebase modules
    const { initializeApp, getApps } = await import('firebase/app');
    const { getAuth, createUserWithEmailAndPassword, updateProfile, signOut } = await import('firebase/auth');
    const { doc, setDoc, getDoc, serverTimestamp } = await import('firebase/firestore');
    
    // Get main db and auth
    const { db } = await import('$lib/firebase');
    
    // Get the existing app config
    const existingApps = getApps();
    if (existingApps.length === 0) {
      throw new Error('Firebase not initialized');
    }
    
    const mainApp = existingApps[0];
    const firebaseConfig = {
      apiKey: mainApp.options.apiKey,
      authDomain: mainApp.options.authDomain,
      projectId: mainApp.options.projectId,
      storageBucket: mainApp.options.storageBucket,
      messagingSenderId: mainApp.options.messagingSenderId,
      appId: mainApp.options.appId
    };
    
    // Check if username is already taken
    const usernameDoc = await getDoc(doc(db, 'usernames', newUsername.toLowerCase().trim()));
    if (usernameDoc.exists()) {
      addError = 'This username is already taken. Please choose another.';
      addLoading = false;
      return;
    }
    
    // Create a temporary independent app instance for staff creation
    const tempAppName = 'temp-staff-app';
    let tempApp = getApps().find(app => app.name === tempAppName);
    if (!tempApp) {
      tempApp = initializeApp(firebaseConfig, tempAppName);
    }
    
    // Auto-generate email from username
    const email = `${newUsername.toLowerCase().trim()}@staff.geoprofile.local`;
    
    // Use the temporary auth instance (won't affect main admin session)
    const tempAuth = getAuth(tempApp);
    const credential = await createUserWithEmailAndPassword(tempAuth, email, newPassword);
    await updateProfile(credential.user, { displayName: newName.trim() });
    
    // Write to Firestore using the main db
    await setDoc(doc(db, 'users', credential.user.uid), {
      username: newUsername.toLowerCase().trim(),
      name: newName.trim(),
      email: email,
      position: newPosition,
      role: 'staff',
      createdAt: serverTimestamp(),
    });
    
    await setDoc(doc(db, 'usernames', newUsername.toLowerCase().trim()), {
      email: email,
      uid: credential.user.uid,
    });
    
    // Sign out from temporary auth only
    await signOut(tempAuth);
    
    addLoading = false;
    showAddModal = false;
    resetAddForm();
    await loadStaff(); // Reload the staff list
    showToast('Staff member added successfully!');

  } catch (e: unknown) {
    console.error('Error creating staff:', e);
    const error = e as { code?: string; message?: string };
    const code = error?.code ?? '';
    switch (code) {
      case 'auth/email-already-in-use': 
        addError = 'This username is already registered.'; 
        break;
      case 'auth/invalid-email':        
        addError = 'Invalid username format.'; 
        break;
      case 'auth/weak-password':        
        addError = 'Password is too weak. Use at least 8 characters.'; 
        break;
      default:                          
        addError = error?.message || 'Something went wrong. Please try again.';
    }
    addLoading = false;
  }
}

  // ─── Edit Staff ────────────────────────────────────────────────────────────

  function openEditModal(staff: StaffMember) {
    selectedStaff = staff;
    editName     = staff.name;
    editPosition = staff.position;
    editPassword = '';
    editConfirm  = '';
    resetPassword = false;
    editError    = '';
    showEditModal = true;
  }

  async function handleEditStaff() {
    editError = '';

    if (!editName.trim())  { editError = 'Please enter staff name.'; return; }
    if (!editPosition)     { editError = 'Please select a position.'; return; }

    if (resetPassword) {
      if (!editPassword)              { editError = 'Please enter new password.'; return; }
      if (editPassword.length < 8)    { editError = 'Password must be at least 8 characters.'; return; }
      if (editPassword !== editConfirm) { editError = 'Passwords do not match.'; return; }
    }

    editLoading = true;

    try {
      const { db } = await import('$lib/firebase');
      const { doc, updateDoc } = await import('firebase/firestore');

      if (!selectedStaff) throw new Error('No staff selected');

      await updateDoc(doc(db, 'users', selectedStaff.id), {
        name: editName.trim(),
        position: editPosition,
      });

      // Password reset - simplified (just show info message)
      if (resetPassword && editPassword) {
        editError = 'Profile updated, but password reset requires Firebase Admin SDK. Use the Firebase Console to reset passwords.';
        editLoading = false;
        showEditModal = false;
        await loadStaff();
        showToast('Staff member updated successfully!');
        return;
      }

      editLoading = false;
      showEditModal = false;
      await loadStaff();
      showToast('Staff member updated successfully!');

} catch (e) {
  console.error('Error updating staff:', e);  // Log the error
  editError = 'Failed to update staff.';
  editLoading = false;
}
  }

  // ─── Delete Staff ──────────────────────────────────────────────────────────

  function openDeleteModal(staff: StaffMember) {
    selectedStaff = staff;
    showDeleteModal = true;
  }

  let deleteLoading = false;

  async function handleDeleteStaff() {
    if (!selectedStaff) return;
    
    deleteLoading = true;
    try {
      const { db } = await import('$lib/firebase');
      const { doc, deleteDoc } = await import('firebase/firestore');

      // Remove Firestore records
      await deleteDoc(doc(db, 'users', selectedStaff.id));
      await deleteDoc(doc(db, 'usernames', selectedStaff.username));

      showDeleteModal = false;
      deleteLoading = false;
      const deletedName = selectedStaff.name;
      selectedStaff = null;
      await loadStaff();
      showToast(`${deletedName} has been removed.`);

    } catch (e) {
      console.error('Error deleting staff:', e);
      deleteLoading = false;
      alert('Failed to delete staff member.');
    }
  }

  function formatDate(timestamp: { toDate: () => Date } | null | undefined) {
    if (!timestamp) return 'N/A';
    try {
      return timestamp.toDate().toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch { return 'N/A'; }
  }
</script>

<!-- The rest of your template remains exactly the same -->
<!-- ═══════════════════════════════════════════════════════ SUCCESS TOAST ══ -->
{#if toastVisible}
  <div class="fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-4 bg-emerald-600 text-white rounded-2xl shadow-2xl animate-slide-in">
    <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
    </svg>
    <span class="text-sm font-bold">{toastMessage}</span>
    <button on:click={() => toastVisible = false} class="ml-2 opacity-70 hover:opacity-100 transition-opacity">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════ PAGE ══ -->
<div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
  <div class="max-w-7xl mx-auto">

    <!-- Header -->
    <div class="mb-8">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="font-nunito text-3xl font-extrabold text-slate-800">Staff Management</h1>
          <p class="text-sm text-slate-500 mt-1">Manage barangay staff accounts</p>
        </div>
        <button
          on:click={() => { resetAddForm(); showAddModal = true; }}
          class="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-95"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Staff
        </button>
      </div>

      <button
        on:click={() => window.location.href = '/admin/dashboard'}
        class="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </button>
    </div>

    <!-- Staff Table -->
    <div class="bg-white rounded-2xl shadow-lg overflow-hidden">
      {#if loading}
        <div class="flex items-center justify-center py-20">
          <svg class="w-8 h-8 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
        </div>
      {:else if staffList.length === 0}
        <div class="text-center py-20">
          <svg class="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
          <h3 class="font-nunito text-xl font-bold text-slate-700 mb-2">No Staff Members</h3>
          <p class="text-slate-500 text-sm">Click "Add Staff" to create the first account</p>
        </div>
      {:else}
        <table class="w-full">
          <thead class="bg-slate-50 border-b border-slate-200">
            <tr>
              <th class="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Username</th>
              <th class="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Name</th>
              <th class="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Position</th>
              <th class="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Created</th>
              <th class="px-6 py-4 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            {#each staffList as staff (staff.id)}
              <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {staff.name.charAt(0).toUpperCase()}
                    </div>
                    <span class="font-mono text-sm font-semibold text-slate-700">{staff.username}</span>
                  </div>
                </td>
                <td class="px-6 py-4 text-sm font-medium text-slate-700">{staff.name}</td>
                <td class="px-6 py-4">
                  <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                    {staff.position}
                  </span>
                </td>
                <td class="px-6 py-4 text-sm text-slate-500">{formatDate(staff.createdAt)}</td>
                <td class="px-6 py-4 text-right">
                  <div class="flex items-center justify-end gap-2">
                    <button
                      on:click={() => openEditModal(staff)}
                      class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      on:click={() => openDeleteModal(staff)}
                      class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════ ADD STAFF MODAL ══ -->
{#if showAddModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm">
    <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between mb-6">
        <h2 class="font-nunito text-2xl font-extrabold text-slate-800">Add Staff Member</h2>
        <button on:click={() => showAddModal = false} disabled={addLoading} class="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {#if addError}
        <div class="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold px-4 py-3 rounded-xl">
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          <span>{addError}</span>
        </div>
      {/if}

      <!-- Username -->
      <div class="mb-4">
        <label for="new-username" class="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Username</label>
        <div class="relative">
          <input
            id="new-username"
            type="text"
            bind:value={newUsername}
            on:input={onUsernameInput}
            placeholder="staff1"
            disabled={addLoading}
            class="w-full px-4 py-3 rounded-xl border-2 text-sm outline-none focus:ring-4 disabled:opacity-50 transition-all
                   {usernameAvailable === false ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-100'
                   : usernameAvailable === true  ? 'border-green-300 bg-green-50 focus:border-green-400 focus:ring-green-100'
                   : 'border-slate-200 bg-slate-50 focus:border-blue-500 focus:ring-blue-100'}"
          />
          {#if usernameChecking}
            <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
          {:else if usernameAvailable === true}
            <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          {:else if usernameAvailable === false}
            <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          {/if}
        </div>
        {#if usernameAvailable === false}
          <p class="text-xs text-red-500 font-semibold mt-1.5">✗ Username not available</p>
        {:else if usernameAvailable === true}
          <p class="text-xs text-green-500 font-semibold mt-1.5">✓ Username available</p>
        {:else}
          <p class="text-xs text-slate-400 mt-1.5">3–20 characters, letters, numbers, _ and -</p>
        {/if}
      </div>

      <!-- Name -->
      <div class="mb-4">
        <label for="new-name" class="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Full Name</label>
        <input
          id="new-name"
          type="text"
          bind:value={newName}
          placeholder="Juan dela Cruz"
          disabled={addLoading}
          class="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:opacity-50 transition-all"
        />
      </div>

      <!-- Position -->
      <div class="mb-4">
        <label for="new-position" class="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Position</label>
        <select
          id="new-position"
          bind:value={newPosition}
          disabled={addLoading}
          class="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:opacity-50 transition-all appearance-none cursor-pointer {newPosition === '' ? 'text-slate-400' : 'text-slate-700'}"
        >
          <option value="" disabled selected>Select position</option>
          {#each staffPositions as pos (pos)}
            <option value={pos}>{pos}</option>
          {/each}
        </select>
      </div>

      <!-- Password -->
      <div class="mb-4">
        <label for="new-password" class="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Password</label>
        <input
          id="new-password"
          type="password"
          bind:value={newPassword}
          placeholder="Min. 8 characters"
          disabled={addLoading}
          class="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:opacity-50 transition-all"
        />
      </div>

      <!-- Confirm Password -->
      <div class="mb-6">
        <label for="new-confirm" class="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Confirm Password</label>
        <input
          id="new-confirm"
          type="password"
          bind:value={newConfirm}
          placeholder="Re-enter password"
          disabled={addLoading}
          class="w-full px-4 py-3 rounded-xl border-2 text-sm outline-none focus:ring-4 disabled:opacity-50 transition-all
                 {newConfirm && newPassword !== newConfirm ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-100'
                 : newConfirm && newPassword === newConfirm ? 'border-green-300 bg-green-50 focus:border-green-400 focus:ring-green-100'
                 : 'border-slate-200 bg-slate-50 focus:border-blue-500 focus:ring-blue-100'}"
        />
        {#if newConfirm && newPassword !== newConfirm}
          <p class="text-xs text-red-500 font-semibold mt-1.5">✗ Passwords do not match</p>
        {:else if newConfirm && newPassword === newConfirm}
          <p class="text-xs text-green-500 font-semibold mt-1.5">✓ Passwords match</p>
        {/if}
      </div>

      <!-- Buttons -->
      <div class="flex gap-3">
        <button
          type="button"
          on:click={() => showAddModal = false}
          disabled={addLoading}
          class="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-all disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={handleAddStaff}
          disabled={addLoading || usernameAvailable !== true}
          class="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {#if addLoading}
            <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            Creating...
          {:else}
            Create Staff
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ══════════════════════════════════════════════════════ EDIT STAFF MODAL ══ -->
{#if showEditModal && selectedStaff}
  <div class="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm">
    <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between mb-6">
        <h2 class="font-nunito text-2xl font-extrabold text-slate-800">Edit Staff Member</h2>
        <button on:click={() => showEditModal = false} disabled={editLoading} class="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {#if editError}
        <div class="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold px-4 py-3 rounded-xl">
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          <span>{editError}</span>
        </div>
      {/if}

      <!-- Username (readonly) -->
      <div class="mb-4">
        <label class="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Username</label>
        <div class="px-4 py-3 rounded-xl bg-slate-100 border-2 border-slate-200 text-sm text-slate-500 font-mono">
          {selectedStaff.username}
        </div>
      </div>

      <!-- Name -->
      <div class="mb-4">
        <label for="edit-name" class="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Full Name</label>
        <input
          id="edit-name"
          type="text"
          bind:value={editName}
          disabled={editLoading}
          class="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:opacity-50 transition-all"
        />
      </div>

      <!-- Position -->
      <div class="mb-4">
        <label for="edit-position" class="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Position</label>
        <select
          id="edit-position"
          bind:value={editPosition}
          disabled={editLoading}
          class="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm text-slate-700 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:opacity-50 transition-all appearance-none cursor-pointer"
        >
          {#each staffPositions as pos (pos)}
            <option value={pos}>{pos}</option>
          {/each}
        </select>
      </div>

      <!-- Reset Password -->
      <div class="mb-4">
        <label class="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            bind:checked={resetPassword}
            class="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-2 focus:ring-blue-500"
          />
          <span class="text-sm font-semibold text-slate-700">Reset password</span>
        </label>
        {#if resetPassword}
          <p class="text-xs text-amber-600 font-medium mt-2 ml-8">
            ⚠️ Password reset from the client requires the staff member's current password. For a true admin reset, use the Firebase Console or a Cloud Function.
          </p>
        {/if}
      </div>

      {#if resetPassword}
        <div class="mb-4">
          <label for="edit-password" class="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">New Password</label>
          <input
            id="edit-password"
            type="password"
            bind:value={editPassword}
            placeholder="Min. 8 characters"
            disabled={editLoading}
            class="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:opacity-50 transition-all"
          />
        </div>
        <div class="mb-6">
          <label for="edit-confirm" class="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Confirm New Password</label>
          <input
            id="edit-confirm"
            type="password"
            bind:value={editConfirm}
            placeholder="Re-enter password"
            disabled={editLoading}
            class="w-full px-4 py-3 rounded-xl border-2 text-sm outline-none focus:ring-4 disabled:opacity-50 transition-all
                   {editConfirm && editPassword !== editConfirm ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-100'
                   : editConfirm && editPassword === editConfirm ? 'border-green-300 bg-green-50 focus:border-green-400 focus:ring-green-100'
                   : 'border-slate-200 bg-slate-50 focus:border-blue-500 focus:ring-blue-100'}"
          />
          {#if editConfirm && editPassword !== editConfirm}
            <p class="text-xs text-red-500 font-semibold mt-1.5">✗ Passwords do not match</p>
          {:else if editConfirm && editPassword === editConfirm}
            <p class="text-xs text-green-500 font-semibold mt-1.5">✓ Passwords match</p>
          {/if}
        </div>
      {/if}

      <!-- Buttons -->
      <div class="flex gap-3">
        <button
          type="button"
          on:click={() => showEditModal = false}
          disabled={editLoading}
          class="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-all disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={handleEditStaff}
          disabled={editLoading}
          class="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {#if editLoading}
            <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            Updating...
          {:else}
            Update Staff
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ════════════════════════════════════════════════ DELETE CONFIRM MODAL ══ -->
{#if showDeleteModal && selectedStaff}
  <div class="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm">
    <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
      <div class="flex items-center gap-4 mb-4">
        <div class="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
          <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
        </div>
        <div>
          <h2 class="font-nunito text-xl font-extrabold text-slate-800">Delete Staff Member?</h2>
          <p class="text-sm text-slate-500">This action cannot be undone.</p>
        </div>
      </div>

      <div class="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <p class="text-sm text-slate-700">
          <strong class="font-semibold">Username:</strong> {selectedStaff.username}<br>
          <strong class="font-semibold">Name:</strong> {selectedStaff.name}<br>
          <strong class="font-semibold">Position:</strong> {selectedStaff.position}
        </p>
      </div>

      <div class="flex gap-3">
        <button
          type="button"
          on:click={() => { showDeleteModal = false; selectedStaff = null; }}
          disabled={deleteLoading}
          class="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-all disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={handleDeleteStaff}
          disabled={deleteLoading}
          class="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white font-bold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {#if deleteLoading}
            <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            Deleting...
          {:else}
            Delete
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes slide-in {
    from { opacity: 0; transform: translateX(2rem); }
    to   { opacity: 1; transform: translateX(0); }
  }
  .animate-slide-in {
    animation: slide-in 0.25s ease-out;
  }
</style>