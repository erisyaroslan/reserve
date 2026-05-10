// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCRvUZugxCx0fd5gTSSFKhgaSp_aEKw2FU",
  authDomain: "reserve-app-5a570.firebaseapp.com",
  projectId: "reserve-app-5a570",
  storageBucket: "reserve-app-5a570.firebasestorage.app",
  messagingSenderId: "1039794373234",
  appId: "1:1039794373234:web:2e490d78551a010b34f8eb",
  measurementId: "G-KQM9GCCEW4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export these so your other files (like auth-signup.js) can use them
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);