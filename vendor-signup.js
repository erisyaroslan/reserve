import { auth, db } from './firebase-config.js'; 
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const signupForm = document.getElementById('vendorSignupForm');

// Custom Notification Function
function notify(title, msg, type = 'success') {
    const toast = document.getElementById('customToast');
    const icon = document.getElementById('toastIcon');
    if (!toast) return;

    document.getElementById('toastTitle').innerText = title;
    document.getElementById('toastMsg').innerText = msg;
    
    if (type === 'error') {
        toast.style.borderLeftColor = '#d32f2f';
        if(icon) { icon.style.color = '#d32f2f'; icon.innerHTML = '✕'; }
    } else {
        toast.style.borderLeftColor = '#2E7D32';
        if(icon) { icon.style.color = '#2E7D32'; icon.innerHTML = '✓'; }
    }

    toast.style.top = '20px';
    setTimeout(() => { toast.style.top = '-100px'; }, 3000);
}

if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Get values from vendor fields
        const shopName = document.getElementById('shopName').value;
        const location = document.getElementById('location').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirm = document.getElementById('confirmPassword').value;

        // Validation
        if (password !== confirm) {
            notify('Wait!', 'Passwords do not match.', 'error');
            return;
        }

        try {
            // 1. Create Auth Account
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 2. Save Vendor Data to Firestore
            await setDoc(doc(db, "users", user.uid), {
                shopName: shopName,
                location: location,
                email: email,
                role: 'vendor', // Critical for login logic later
                createdAt: new Date().toISOString()
            });

            notify('Welcome!', 'Vendor account created! Opening Dashboard...');
            
            setTimeout(() => {
                window.location.href = 'vendordashboard.html';
            }, 2000);

        } catch (error) {
            let friendlyMsg = error.message;
            if (error.code === 'auth/email-already-in-use') friendlyMsg = "This email is already used.";
            notify('Error', friendlyMsg, 'error');
        }
    });
}