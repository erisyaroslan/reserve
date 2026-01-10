import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Notification Function
function notify(title, msg, type = 'success') {
    const toast = document.getElementById('customToast');
    const icon = document.getElementById('toastIcon');
    const titleEl = document.getElementById('toastTitle');
    const msgEl = document.getElementById('toastMsg');

    titleEl.innerText = title;
    msgEl.innerText = msg;
    
    if (type === 'error') {
        // ERROR STATE (Red)
        toast.style.borderLeftColor = '#d32f2f'; // Dark Red Border
        if(icon) {
            icon.style.color = '#d32f2f';       // Force Icon Red
            icon.innerHTML = '✕';              // Use the X symbol
        }
    } else {
        // SUCCESS STATE (Green)
        toast.style.borderLeftColor = '#2E7D32'; // Dark Green Border
        if(icon) {
            icon.style.color = '#2E7D32';       // Force Icon Green
            icon.innerHTML = '✓';              // Use the Check symbol
        }
    }

    toast.style.top = '20px';
    setTimeout(() => { 
        toast.style.top = '-100px'; 
    }, 3000);
}

const loginForm = document.querySelector('form');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        // 1. Firebase Login
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Role Verification
        const userDoc = await getDoc(doc(db, "users", user.uid));

        if (userDoc.exists() && userDoc.data().role === 'vendor') {
            notify('Success', 'Welcome back to your stall!');
            setTimeout(() => { window.location.href = 'vendordashboard.html'; }, 1500);
        } else {
            notify('Access Denied', 'This is not a vendor account.', 'error');
            await auth.signOut();
        }
    } catch (error) {
        notify('Login Failed', 'Invalid email or password.', 'error');
    }
});