import { initializeApp } from 'firebase/app'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyDfQvdVb9BPMRQ1AlJmGL-xmNS2SB15Oq0",
  authDomain: "jv-lineup.firebaseapp.com",
  projectId: "jv-lineup",
  storageBucket: "jv-lineup.firebasestorage.app",
  messagingSenderId: "378813855159",
  appId: "1:378813855159:web:8143d2db89d742dcb4e432",
  measurementId: "G-06F3BF9RT5"
};

const app = initializeApp(firebaseConfig)
// Offline-first: cache Firestore data in IndexedDB so the lineup loads and edits
// keep working with no signal at the field; writes sync when back online.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
})
export const auth = getAuth(app)
