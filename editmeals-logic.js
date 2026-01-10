import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 1. Get the Meal ID from the URL (e.g., edit-menu.html?id=ABC123)
const urlParams = new URLSearchParams(window.location.search);
const mealId = urlParams.get('id');

// If no ID is found, send them back to dashboard
if (!mealId) {
    window.location.href = 'vendordashboard.html';
}

// 2. Load the existing data into the form
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const docRef = doc(db, "foodItems", mealId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();

                // Fill the input fields
                document.getElementById('mealName').value = data.foodName || '';
                document.getElementById('category').value = data.category || 'Hot Meal';
                document.getElementById('description').value = data.description || '';
                document.getElementById('oldPrice').value = data.originalPrice || '';
                document.getElementById('newPrice').value = data.discountPrice || '';
                document.getElementById('qty').value = data.quantity || '';

                // Set the preview image if it exists
                if (data.imageURL) {
                    document.getElementById('prevImg').style.backgroundImage = `url(${data.imageURL})`;
                }

                // Trigger the preview function to update the text on the card
                if (typeof updatePreview === "function") {
                    updatePreview();
                }
            } else {
                console.error("No such meal found!");
            }
        } catch (error) {
            console.error("Error fetching meal:", error);
        }
    } else {
        window.location.href = 'vendorlogin.html';
    }
});

// 3. Handle the "Update Meal Details" Button Click
const saveBtn = document.getElementById('saveMealBtn');
if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
        const fileInput = document.getElementById('mealImageInput');

        try {
            // Show a "Loading" popup
            Swal.fire({
                title: 'Updating Meal...',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); },
                customClass: { popup: 'premium-popup' }
            });

            const updateData = {
                foodName: document.getElementById('mealName').value,
                category: document.getElementById('category').value,
                description: document.getElementById('description').value,
                originalPrice: document.getElementById('oldPrice').value,
                discountPrice: document.getElementById('newPrice').value,
                quantity: document.getElementById('qty').value,
                updatedAt: new Date()
            };

            // Convert new image to Base64 only if a new file was selected
            if (fileInput && fileInput.files[0]) {
                updateData.imageURL = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(fileInput.files[0]);
                });
            }

            // Save changes to Firestore
            const docRef = doc(db, "foodItems", mealId);
            await updateDoc(docRef, updateData);

            // Success Popup (Premium Design)
            Swal.fire({
                icon: 'success',
                iconColor: '#2E7D32',
                title: 'Changes Saved!',
                text: 'Your meal has been updated successfully.',
                confirmButtonText: 'Back to Dashboard',
                buttonsStyling: false,
                customClass: {
                    popup: 'premium-popup',
                    title: 'premium-title',
                    confirmButton: 'premium-confirm-btn'
                },
                backdrop: `rgba(0,0,0,0.15)`
            }).then(() => {
                window.location.href = 'vendordashboard.html';
            });

        } catch (error) {
            Swal.fire({
                title: 'Error',
                text: error.message,
                icon: 'error',
                customClass: { popup: 'premium-popup' }
            });
        }
    });
}