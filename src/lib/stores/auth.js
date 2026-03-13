// src/lib/stores/auth.js
import { writable } from 'svelte/store';
import { auth } from '$lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

/** @type {import('svelte/store').Writable<import('firebase/auth').User | null>} */
export const user = writable(null);

/** @type {import('svelte/store').Writable<boolean>} */
export const authLoading = writable(true);

// Listen to Firebase auth state changes globally
onAuthStateChanged(auth, (firebaseUser) => {
  user.set(firebaseUser);
  authLoading.set(false);
});