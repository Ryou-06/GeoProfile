import 'dotenv/config';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { isInsidePagAsa } from '../src/lib/pagasaBoundary.js';

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  throw new Error('Missing FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, or FIREBASE_ADMIN_PRIVATE_KEY in .env.');
}

const app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore(app);
const auth = getAuth(app);

const accounts = [
  { username: 'demo_admin', name: 'Maria Santos', position: 'Barangay Secretary', role: 'admin', password: 'PagAsaDemo2026!' },
  { username: 'demo_encoder', name: 'Jose Ramirez', position: 'Data Encoder', role: 'staff', password: 'PagAsaDemo2026!' }
];

async function ensureAccount(account) {
  const email = `${account.username}@${account.role === 'admin' ? 'admin' : 'staff'}.geoprofile.local`;
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    user = await auth.createUser({ email, password: account.password, displayName: account.name });
  }

  await db.doc(`users/${user.uid}`).set({
    username: account.username,
    name: account.name,
    email,
    position: account.position,
    role: account.role,
    isDemo: true,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await db.doc(`usernames/${account.username}`).set({ email, uid: user.uid, isDemo: true }, { merge: true });
  return user;
}

const householdSeeds = [
  ['01', '12', 'Gordon Avenue', 14.82635, 120.28500, 'Residential household'],
  ['02', '18', 'Murphy Street', 14.82660, 120.28500, 'Residential household'],
  ['03', '24', 'Natividad Street', 14.82685, 120.28500, 'Residential household'],
  ['04', '31', 'Burgos Street', 14.82710, 120.28575, 'Residential household'],
  ['05', '7', 'East 12th Street', 14.82735, 120.28650, 'Residential household'],
  ['06', '45', 'Perimeter Road', 14.82760, 120.28650, 'Residential household'],
  ['07', '9', 'Bonifacio Street', 14.82785, 120.28650, 'Residential household'],
  ['08', '16', 'Gordon Avenue', 14.82810, 120.28750, 'Residential household'],
  ['09', '22', 'Murphy Street', 14.82835, 120.28750, 'Residential household'],
  ['10', '38', 'Natividad Street', 14.82860, 120.28725, 'Residential household'],
  ['11', '5', 'Burgos Street', 14.82885, 120.28750, 'Residential household'],
  ['12', '27', 'East 12th Street', 14.82910, 120.28700, 'Residential household']
];

const people = [
  ['Rosa Dela Cruz', '1953-04-12', 'Female', 'Senior', true, false, false],
  ['Mark Dela Cruz', '1987-09-21', 'Male', 'Regular', false, false, false],
  ['Liza Dela Cruz', '1990-02-18', 'Female', 'Regular', false, false, false],
  ['Antonio Reyes', '1958-11-03', 'Male', 'Senior', true, false, false],
  ['Grace Reyes', '1985-07-15', 'Female', 'Single Parent', false, false, true],
  ['Paolo Reyes', '2010-06-02', 'Male', 'Regular', false, false, false],
  ['Elena Garcia', '1976-01-29', 'Female', 'PWD', false, true, false],
  ['Ramon Garcia', '1971-03-08', 'Male', 'Regular', false, false, false],
  ['Mika Garcia', '2005-08-17', 'Female', 'Regular', false, false, false],
  ['Carmen Villanueva', '1960-05-25', 'Female', 'Senior', true, false, false],
  ['Joel Villanueva', '1981-12-10', 'Male', 'Regular', false, false, false],
  ['Aira Villanueva', '2002-10-04', 'Female', 'Regular', false, false, false],
  ['Nestor Bautista', '1955-02-14', 'Male', 'Senior', true, false, false],
  ['Ruby Bautista', '1982-04-28', 'Female', 'Regular', false, false, false],
  ['Carlo Bautista', '2013-09-09', 'Male', 'Regular', false, false, false],
  ['Teresa Mendoza', '1979-06-30', 'Female', 'Single Parent', false, false, true],
  ['Angel Mendoza', '2008-11-22', 'Female', 'Regular', false, false, false],
  ['Benito Flores', '1962-03-19', 'Male', 'Senior', true, false, false],
  ['Nina Flores', '1988-12-07', 'Female', 'Regular', false, false, false],
  ['Dennis Flores', '1991-05-14', 'Male', 'PWD', false, true, false],
  ['Maribel Aquino', '1974-08-08', 'Female', 'Regular', false, false, false],
  ['Rico Aquino', '1972-01-26', 'Male', 'Regular', false, false, false],
  ['Janelle Aquino', '2006-07-11', 'Female', 'Regular', false, false, false],
  ['Lourdes Mercado', '1957-10-30', 'Female', 'Senior', true, false, false],
  ['Erwin Mercado', '1984-02-01', 'Male', 'Regular', false, false, false],
  ['Mae Mercado', '1986-06-16', 'Female', 'Single Parent', false, false, true],
  ['Felix Ramos', '1965-09-24', 'Male', 'Senior', true, false, false],
  ['Daisy Ramos', '1993-01-13', 'Female', 'Regular', false, false, false],
  ['Ivan Ramos', '2001-04-20', 'Male', 'Regular', false, false, false],
  ['Cristina Salazar', '1980-11-18', 'Female', 'PWD', false, true, false],
  ['Marco Salazar', '1978-07-27', 'Male', 'Regular', false, false, false],
  ['Sofia Salazar', '2012-03-05', 'Female', 'Regular', false, false, false],
  ['Noel Domingo', '1961-12-02', 'Male', 'Senior', true, false, false],
  ['Irene Domingo', '1989-08-14', 'Female', 'Regular', false, false, false],
  ['Kyle Domingo', '2004-05-21', 'Male', 'Regular', false, false, false],
  ['Patricia Lim', '1983-09-06', 'Female', 'Single Parent', false, false, true]
];

const demoAssets = {
  house: '/demo-assets/demo-house.svg',
  pwd: '/demo-assets/pwd-proof-demo.svg',
  senior: '/demo-assets/senior-proof-demo.svg',
  singleParent: '/demo-assets/single-parent-proof-demo.svg'
};

function age(birthdate) {
  const today = new Date();
  const birth = new Date(`${birthdate}T00:00:00`);
  let value = today.getFullYear() - birth.getFullYear();
  if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) value--;
  return value;
}

function proofFields({ isPWD = false, isSenior = false, isSingleParent = false }) {
  return {
    pwdProof: isPWD ? demoAssets.pwd : null,
    pwdIdProof: isPWD ? demoAssets.pwd : null,
    seniorProof: isSenior ? demoAssets.senior : null,
    seniorIdProof: isSenior ? demoAssets.senior : null,
    singleParentProof: isSingleParent ? demoAssets.singleParent : null,
    singleParentIdProof: isSingleParent ? demoAssets.singleParent : null
  };
}

function createDemoMember(fullName, relationship, birthdate, sex, flags = {}) {
  return {
    fullName,
    relationship,
    birthdate,
    age: age(birthdate),
    sex,
    civilStatus: flags.isSingleParent ? 'Single' : 'Single',
    citizenship: 'Filipino',
    occupation: flags.isSenior ? 'Retired' : 'Student / Community Resident',
    contactNo: '',
    status: 'present',
    isPWD: Boolean(flags.isPWD),
    pwdType: flags.isPWD ? 'Physical Disability' : '',
    isSenior: Boolean(flags.isSenior),
    isSingleParent: Boolean(flags.isSingleParent),
    ...proofFields(flags),
    isDemo: true
  };
}

function createDemoFamily(householdIndex, surname) {
  const sequence = householdIndex + 1;
  const hasSenior = householdIndex % 3 === 0;
  const hasPWD = householdIndex % 3 === 1;
  const hasSingleParent = householdIndex % 3 === 2;
  return {
    parents: {
      father: createDemoMember(`Rogelio ${surname}`, 'Father / Household Head', '1958-04-12', 'Male', { isSenior: hasSenior }),
      mother: createDemoMember(`Mila ${surname}`, 'Mother', '1978-09-19', 'Female', { isPWD: hasPWD })
    },
    familyMembers: [
      createDemoMember(`Alyssa ${surname}`, 'Daughter', `200${sequence % 9}-06-15`, 'Female'),
      createDemoMember(`Joshua ${surname}`, 'Son', `201${sequence % 6}-11-08`, 'Male'),
      createDemoMember(`Leah ${surname}`, hasSingleParent ? 'Relative / Single Parent' : 'Relative', '1989-03-24', 'Female', { isSingleParent: hasSingleParent })
    ]
  };
}

const demoAdmin = await ensureAccount(accounts[0]);
const demoStaff = await ensureAccount(accounts[1]);
const batch = db.batch();

for (let i = 0; i < householdSeeds.length; i++) {
  const [number, houseNo, street, lat, lng, notes] = householdSeeds[i];
  const householdId = `demo-household-${number}`;
  batch.set(db.doc(`households/${householdId}`), {
    qrId: `DEMO-HH-${number}`,
    houseNo,
    street,
    notes,
    barangay: 'Barangay Pag-Asa',
    city: 'Olongapo City',
    createdBy: demoStaff.uid,
    createdByName: 'Jose Ramirez',
    status: 'active',
    isDemo: true,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

for (let i = 0; i < people.length; i++) {
  if (i % 3 !== 0) {
    // Earlier demo versions wrote multiple registration documents per household.
    // Keep only the QR household profile; its members are embedded in that document.
    batch.delete(db.doc(`residents/demo-resident-${String(i + 1).padStart(2, '0')}`));
    continue;
  }
  const [name, birthdate, sex, category, isSenior, isPWD, isSingleParent] = people[i];
  const householdIndex = Math.floor(i / 3);
  const [number, houseNo, street, lat, lng] = householdSeeds[householdIndex];
  const status = householdIndex >= householdSeeds.length - 3 ? 'pending' : 'approved';
  const coordinateOffset = ((i % 3) - 1) * 0.00002;
  const residentLat = lat + coordinateOffset;
  const residentLng = lng + coordinateOffset;
  if (!isInsidePagAsa(residentLat, residentLng)) {
    throw new Error(`Demo resident ${i + 1} falls outside the Barangay Pag-Asa boundary.`);
  }
  const primaryProfile = i % 3 === 0;
  const surname = name.split(' ').slice(-1)[0];
  const householdFamily = primaryProfile ? createDemoFamily(householdIndex, surname) : { parents: {}, familyMembers: [] };
  const rootProofs = proofFields({ isPWD, isSenior, isSingleParent });

  batch.set(db.doc(`residents/demo-resident-${String(i + 1).padStart(2, '0')}`), {
    householdId: `demo-household-${number}`,
    qrId: `DEMO-HH-${number}`,
    profileKind: 'household-profiling',
    householdType: 'residential',
    houseNo,
    street,
    barangay: 'Barangay Pag-Asa',
    city: 'Olongapo City',
    province: 'Zambales',
    region: 'Region III - Central Luzon',
    address: `${houseNo} ${street}, Barangay Pag-Asa, Olongapo City`,
    name,
    firstName: name.split(' ')[0],
    lastName: name.split(' ').slice(-1)[0],
    birthdate,
    age: age(birthdate),
    sex,
    civilStatus: isSingleParent ? 'Single' : 'Married',
    citizenship: 'Filipino',
    occupation: isSenior ? 'Retired' : 'Community Resident',
    contactNo: `0917${String(1000000 + i).slice(-7)}`,
    category,
    sector: category,
    zone: `Purok ${householdIndex + 1}`,
    purok: `Purok ${householdIndex + 1}`,
    isSenior,
    isPWD,
    isSingleParent,
    singleParent: isSingleParent,
    pwdType: isPWD ? 'Physical Disability' : '',
    ...rootProofs,
    residentStatus: 'active',
    lat: residentLat,
    lng: residentLng,
    gpsAccuracy: 8,
    status,
    encodedBy: demoStaff.uid,
    encodedByName: 'Jose Ramirez',
    photoUrl: demoAssets.house,
    housePhotoUrl: demoAssets.house,
    householdDetails: {
      residential: {
        ownershipStatus: householdIndex % 3 === 0 ? 'Owned' : 'Rented',
        yearsInBarangay: String(5 + householdIndex),
        housePhotoUrl: demoAssets.house,
        housePhotoLabel: 'Demo household exterior — illustration only'
      }
    },
    parents: householdFamily.parents,
    familyMembers: householdFamily.familyMembers,
    occupantRecords: [],
    memberCount: primaryProfile ? 5 : 1,
    isDemo: true,
    submittedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

await batch.commit();
console.log(`Demo data ready: ${householdSeeds.length} households, 60 recorded household members (9 approved, 3 pending profiles).`);
console.log('Demo admin: demo_admin / PagAsaDemo2026!');
console.log('Demo staff: demo_encoder / PagAsaDemo2026!');
