<script>
  import '../app.css';
  import { onMount } from 'svelte';

  // ── Public routes — no auth needed ─────────────────────
  const PUBLIC_ROUTES = ['/', '/signup', '/reset-password'];

  onMount(async () => {
    const path = window.location.pathname;

    // Allow all /register/* routes (resident PWA form)
    if (path.startsWith('/register')) return;

    // Allow exact public routes
    if (PUBLIC_ROUTES.includes(path)) {
      // If already logged in, redirect away from login page
      try {
        const { auth } = await import('$lib/firebase');
        const { onAuthStateChanged } = await import('firebase/auth');

        onAuthStateChanged(auth, async (user) => {
          if (!user) return; // not logged in, stay on login

          // Already logged in — redirect to their dashboard
          const { db } = await import('$lib/firebase');
          const { doc, getDoc } = await import('firebase/firestore');
          const snap = await getDoc(doc(db, 'users', user.uid));
          const role = snap.exists() ? snap.data().role : 'staff';

          if (role === 'admin') {
            window.location.replace('/admin/dashboard');
          } else {
            window.location.replace('/staff/dashboard');
          }
        });
      } catch (e) {
        console.error(e);
      }
      return;
    }

    // ── Protected routes — must be logged in ───────────────
    try {
      const { auth } = await import('$lib/firebase');
      const { onAuthStateChanged } = await import('firebase/auth');

      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          // Not logged in → redirect to login
          window.location.replace('/');
          return;
        }

        // Check role matches the route
        try {
          const { db } = await import('$lib/firebase');
          const { doc, getDoc } = await import('firebase/firestore');
          const snap = await getDoc(doc(db, 'users', user.uid));
          const role = snap.exists() ? snap.data().role : 'staff';

          // Staff trying to access admin routes → redirect to staff
          if (path.startsWith('/admin') && role !== 'admin') {
            window.location.replace('/staff/dashboard');
            return;
          }

          // Admin trying to access staff routes → redirect to admin
          if (path.startsWith('/staff') && role !== 'staff') {
            window.location.replace('/admin/dashboard');
            return;
          }
        } catch (e) {
          console.error('Role check failed:', e);
        }
      });
    } catch (e) {
      console.error('Auth guard error:', e);
      window.location.replace('/');
    }
  });
</script>

<slot />
