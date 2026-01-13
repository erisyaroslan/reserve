import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let userData = null;

// Auth check
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loadUserProfile();
    } else {
        window.location.href = 'login.html';
    }
});

// Load user profile from Firebase
async function loadUserProfile() {
    try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        
        if (userDoc.exists()) {
            userData = userDoc.data();
            displayProfile(userData);
        } else {
            showNotification('User profile not found', 'error');
        }
    } catch (error) {
        console.error("Error loading profile:", error);
        showNotification('Failed to load profile', 'error');
    }
}

// Display user profile
function displayProfile(data) {
    // Display name
    const nameText = document.getElementById('nameText');
    if (nameText) {
        nameText.textContent = data.name || 'No name set';
    }

    // Display email
    const emailText = document.getElementById('emailText');
    if (emailText) {
        emailText.textContent = `Email: ${data.email || currentUser.email || 'No email'}`;
    }

    // Display faculty
    const facultyText = document.getElementById('facultyText');
    if (facultyText) {
        facultyText.textContent = `Faculty: ${data.faculty || 'Not specified'}`;
    }

    // Display profile photo if exists
    const profilePhoto = document.getElementById('profilePhoto');
    if (profilePhoto && data.profilePhotoURL) {
        profilePhoto.style.backgroundImage = `url('${data.profilePhotoURL}')`;
    }
}

// Toggle edit mode for fields
window.toggleEdit = async function(field, button) {
    const textEl = document.getElementById(field + "Text");

    // EDIT MODE
    if (button.innerText === "Edit") {
        const currentText = textEl.textContent;
        let value = '';
        
        // Extract value based on field
        if (field === 'name') {
            value = currentText;
        } else if (field === 'email') {
            value = currentText.replace('Email: ', '');
        } else if (field === 'faculty') {
            value = currentText.replace('Faculty: ', '');
        }

        const input = document.createElement("input");
        input.value = value;
        input.id = field + "Text";
        input.className = "edit-input";
        textEl.replaceWith(input);
        button.innerText = "Save";
        input.focus();
    }
    // SAVE MODE
    else {
        const inputEl = document.getElementById(field + "Text");
        const newValue = inputEl.value.trim();

        if (!newValue) {
            showNotification('Field cannot be empty', 'error');
            return;
        }

        // Save to Firebase
        try {
            const userRef = doc(db, "users", currentUser.uid);
            await updateDoc(userRef, {
                [field]: newValue
            });

            // Update local data
            userData[field] = newValue;

            // Update display
            const span = document.createElement("span");
            span.id = field + "Text";
            
            if (field === 'name') {
                span.textContent = newValue;
            } else if (field === 'email') {
                span.textContent = `Email: ${newValue}`;
            } else if (field === 'faculty') {
                span.textContent = `Faculty: ${newValue}`;
            }

            inputEl.replaceWith(span);
            button.innerText = "Edit";

            showNotification('Profile updated successfully', 'success');
        } catch (error) {
            console.error('Error updating profile:', error);
            showNotification('Failed to update profile', 'error');
            
            // Revert to original value
            const span = document.createElement("span");
            span.id = field + "Text";
            
            if (field === 'name') {
                span.textContent = userData[field] || 'No name set';
            } else if (field === 'email') {
                span.textContent = `Email: ${userData[field] || currentUser.email}`;
            } else if (field === 'faculty') {
                span.textContent = `Faculty: ${userData[field] || 'Not specified'}`;
            }
            
            inputEl.replaceWith(span);
            button.innerText = "Edit";
        }
    }
}

// Upload photo function
window.uploadPhoto = function() {
    document.getElementById("photoInput").click();
}

// Handle photo upload
const photoInput = document.getElementById("photoInput");
if (photoInput) {
    photoInput.addEventListener("change", function() {
        const file = this.files[0];
        if (!file) return;

        // Check file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            showNotification('Image size must be less than 2MB', 'error');
            return;
        }

        // Check file type
        if (!file.type.startsWith('image/')) {
            showNotification('Please select an image file', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const profilePhoto = document.getElementById("profilePhoto");
            if (profilePhoto) {
                profilePhoto.style.backgroundImage = `url('${e.target.result}')`;
            }
            
            // TODO: Upload to Firebase Storage and save URL to Firestore
            // For now, just show preview
            showNotification('Photo preview updated (not saved to server)', 'success');
        };
        reader.readAsDataURL(file);
    });
}

// Logout function
window.logout = async function() {
    try {
        await signOut(auth);
        localStorage.removeItem('userCart');
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Error logging out:', error);
        showNotification('Failed to logout', 'error');
    }
}

// Notification function
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 90px;
        right: 20px;
        background: ${type === 'success' ? '#2E7D32' : '#d32f2f'};
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        font-weight: 600;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        z-index: 9999;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
    .edit-input {
        width: 100%;
        padding: 8px 12px;
        border-radius: 12px;
        border: 2px solid #2E7D32;
        font-size: 1rem;
        outline: none;
    }
`;
document.head.appendChild(style);