import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 1. Identify the Form
const signupForm = document.getElementById('studentSignupForm');

// 2. Custom Notification Function
function notify(title, msg, type = 'success') {
  const toast = document.getElementById('customToast');
  const icon = document.getElementById('toastIcon');
  const titleEl = document.getElementById('toastTitle');
  const msgEl = document.getElementById('toastMsg');

  console.log("Notifying type:", type); // Check your console (F12) for this!

  titleEl.innerText = title;
  msgEl.innerText = msg;

  if (type === 'error') {
    toast.style.borderLeftColor = '#d32f2f';
    if (icon) {
      icon.style.color = '#d32f2f';
      icon.innerHTML = '&#10006;'; // This is a formal "X" symbol
    }
  } else {
    toast.style.borderLeftColor = '#2E7D32';
    if (icon) {
      icon.style.color = '#2E7D32';
      icon.innerHTML = '&#10004;'; // This is a formal "Check" symbol
    }
  }

  toast.style.top = '20px';
  setTimeout(() => { toast.style.top = '-100px'; }, 3000);
}

// 3. Main Signup Logic
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Get values from input fields
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirmPassword').value;
    const faculty = document.getElementById('faculty').value;

    // Validation 1: Passwords must match
    if (password !== confirm) {
      notify('Wait a minute!', 'Your passwords do not match.', 'error');
      return;
    }

    // Validation 2: Faculty must be selected
    if (!faculty) {
      notify('Missing Info', 'Please select your faculty.', 'error');
      return;
    }

    try {
      // A. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // B. Save additional details to Firestore
      await setDoc(doc(db, "users", user.uid), {
        email: email,
        faculty: faculty,
        role: 'student',
        createdAt: new Date().toISOString()
      });

      // C. Show success and redirect
      notify('Success!', 'Account created! Redirecting to login...');

      setTimeout(() => {
        window.location.href = 'login.html';
      }, 2500);

    } catch (error) {
      console.error("Firebase Error:", error.code);
      // Translate Firebase errors into user-friendly messages
      let friendlyMsg = error.message;
      if (error.code === 'auth/email-already-in-use') friendlyMsg = "This email is already registered.";
      if (error.code === 'auth/weak-password') friendlyMsg = "Password should be at least 6 characters.";

      notify('Registration Failed', friendlyMsg, 'error');
    }
  });
} else {
  console.error("Critical Error: Form 'studentSignupForm' not found in HTML.");
}