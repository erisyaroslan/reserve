import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Notification Function
function notify(title, msg, type = 'success') {
    const toast = document.getElementById('customToast');
    const icon = document.getElementById('toastIcon');
    const titleEl = document.getElementById('toastTitle');
    const msgEl = document.getElementById('toastMsg');

    if (!toast || !titleEl || !msgEl) return;

    titleEl.innerText = title;
    msgEl.innerText = msg;
    
    if (type === 'error') {
        // ERROR STATE (Red)
        toast.style.borderLeftColor = '#d32f2f';
        if(icon) {
            icon.style.color = '#d32f2f';
            icon.innerHTML = '✕';
        }
    } else {
        // SUCCESS STATE (Green)
        toast.style.borderLeftColor = '#2E7D32';
        if(icon) {
            icon.style.color = '#2E7D32';
            icon.innerHTML = '✓';
        }
    }

    toast.style.top = '20px';
    setTimeout(() => { 
        toast.style.top = '-100px'; 
    }, 3000);
}

const loginForm = document.querySelector('form');

if (loginForm) {
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

            if (userDoc.exists() && userDoc.data().role === 'student') {
                notify('Success', 'Welcome back! Let\'s find you some meals.');
                setTimeout(() => { 
                    window.location.href = 'userdashboard.html'; 
                }, 1500);
            } else {
                notify('Access Denied', 'This is not a student account.', 'error');
                await auth.signOut();
            }
        } catch (error) {
            console.error('Login error:', error);
            notify('Login Failed', 'Invalid email or password.', 'error');
        }
    });
}