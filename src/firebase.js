import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

// TODO: Replace with your Firebase config from Firebase Console
// Go to: Firebase Console → Project Settings → Your apps → Web app → Config
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
export const db = getFirestore(app)
