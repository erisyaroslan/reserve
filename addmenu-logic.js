import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentVendorId = null;

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentVendorId = user.uid;
    } else {
        window.location.href = 'vendorlogin.html';
    }
});

const saveBtn = document.getElementById('saveMealBtn');

if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
        if (!currentVendorId) return;

        const mealName = document.getElementById('mealName').value;
        const newPrice = document.getElementById('newPrice').value;
        const qty = document.getElementById('qty').value;
        const fileInput = document.getElementById('mealImageInput');

        if (!mealName || !newPrice || !qty) {
            Swal.fire({
                title: 'Wait!',
                text: 'Please fill in Name, Price, and Quantity.',
                confirmButtonText: 'Got it',
                customClass: { popup: 'premium-popup', confirmButton: 'premium-confirm-btn' },
                buttonsStyling: false
            });
            return;
        }

        try {
            Swal.fire({
                title: 'Saving Meal...',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); },
                customClass: { popup: 'premium-popup' }
            });

            // --- SETTLE IMAGE ISSUE ---
            let finalImageUrl = 'image/nasilemak.jpg'; // Fallback

            // If user actually picked a file, convert it to Base64
            if (fileInput && fileInput.files[0]) {
                finalImageUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(fileInput.files[0]);
                });
            }

            await addDoc(collection(db, "foodItems"), {
                vendorId: currentVendorId,
                foodName: mealName,
                category: document.getElementById('category').value,
                description: document.getElementById('description').value,
                originalPrice: document.getElementById('oldPrice').value,
                discountPrice: newPrice,
                quantity: qty,
                createdAt: new Date(),
                imageURL: finalImageUrl // Saves the ACTUAL uploaded image data
            });

            // YOUR FANCY POPUP (UNTOUCHED)
            Swal.fire({
                icon: 'success',
                iconColor: '#2E7D32',
                title: 'Meal Added!',
                text: 'Successfully posted to your menu.',
                width: '360px',
                padding: '2rem',
                showCancelButton: true,
                confirmButtonText: 'Dashboard',
                cancelButtonText: 'Add More',
                reverseButtons: true,
                buttonsStyling: false,
                customClass: {
                    popup: 'premium-popup',
                    title: 'premium-title',
                    confirmButton: 'premium-confirm-btn',
                    cancelButton: 'premium-cancel-btn'
                },
                showClass: { popup: 'animate__animated animate__zoomIn animate__faster' },
                backdrop: `rgba(0,0,0,0.15)`
            }).then((result) => {
                if (result.isConfirmed) {
                    window.location.href = 'vendordashboard.html';
                } else {
                    document.getElementById('addMealForm').reset();
                    // Reset preview to default
                    const prevImg = document.getElementById('prevImg');
                    if (prevImg) prevImg.style.backgroundImage = "url('image/nasilemak.jpg')";
                }
            });

        } catch (error) {
            Swal.fire({ title: 'Error', text: error.message, icon: 'error', customClass: { popup: 'premium-popup' } });
        }
    });
}