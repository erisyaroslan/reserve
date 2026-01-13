import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, addDoc, doc, getDoc, updateDoc, increment, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let cart = [];
let selectedPaymentMethod = 'Cash on Pickup';

// Auth check
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loadCheckoutData();
    } else {
        window.location.href = 'login.html';
    }
});

// Load cart data
function loadCheckoutData() {
    cart = JSON.parse(localStorage.getItem('userCart') || '[]');
    
    if (cart.length === 0) {
        alert('Your cart is empty!');
        window.location.href = 'userbrowsemeal.html';
        return;
    }

    displayOrderSummary();
}

// Display order summary
function displayOrderSummary() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cart.reduce((sum, item) => sum + (parseFloat(item.discountPrice) * item.quantity), 0);

    document.getElementById('totalItems').innerText = totalItems;
    document.getElementById('totalPrice').innerText = totalPrice.toFixed(2);
}

// Track payment method selection
const paymentRadios = document.querySelectorAll('input[name="payment"]');
paymentRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        if (e.target.checked) {
            selectedPaymentMethod = e.target.parentElement.textContent.trim();
        }
    });
});

// Confirm payment and create order
window.confirmPayment = async function() {
    if (!currentUser) {
        alert('Please login first!');
        return;
    }

    if (cart.length === 0) {
        alert('Your cart is empty!');
        return;
    }

    try {
        // Disable button to prevent double-click
        const payBtn = document.querySelector('.btn-pay');
        payBtn.disabled = true;
        payBtn.textContent = 'Processing...';

        // Get user name from users collection
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        const userName = userDoc.exists() ? userDoc.data().name || 'Unknown User' : 'Unknown User';

        // Verify stock availability before creating order
        for (const item of cart) {
            const foodRef = doc(db, "foodItems", item.id);
            const foodDoc = await getDoc(foodRef);
            
            if (!foodDoc.exists()) {
                throw new Error(`Item "${item.foodName}" no longer exists`);
            }
            
            const currentStock = parseInt(foodDoc.data().quantity) || 0;
            
            if (currentStock < item.quantity) {
                throw new Error(`Not enough stock for "${item.foodName}". Available: ${currentStock}, Requested: ${item.quantity}`);
            }
        }

        // Calculate totals
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        const totalPrice = cart.reduce((sum, item) => sum + (parseFloat(item.discountPrice) * item.quantity), 0);

        // Create order in Firebase
        // ⭐ KEY CHANGE: Added userName, vendorId, vendorName, vendorLocation, and originalPrice
        const orderData = {
            userId: currentUser.uid,
            userName: userName,  // ✅ Added user name
            userEmail: currentUser.email,
            vendorId: cart[0].vendorId,  // ✅ Added vendor ID (assuming single vendor per order)
            vendorName: cart[0].vendorInfo ? cart[0].vendorInfo.shopName : 'Unknown Vendor',  // ✅ Added vendor name
            vendorLocation: cart[0].vendorInfo ? cart[0].vendorInfo.location : '',  // ✅ Added vendor location
            items: cart.map(item => ({
                foodId: item.id,
                foodName: item.foodName,
                quantity: item.quantity,
                price: parseFloat(item.discountPrice),  // The discounted price customer pays
                originalPrice: parseFloat(item.originalPrice || 0),  // ✅ FIXED: Directly use originalPrice from cart (which comes from foodItems)
                imageURL: item.imageURL,
                category: item.category
            })),
            totalAmount: totalPrice,
            totalItems: totalItems,
            paymentMethod: selectedPaymentMethod,
            status: 'pending',
            paymentStatus: 'paid',
            createdAt: new Date(),
            pickupTime: 'Before 6:00 PM'  // ✅ Added pickup time
        };

        const orderRef = await addDoc(collection(db, "orders"), orderData);

        // Update quantities in foodItems collection with transaction to prevent negative values
        for (const item of cart) {
            const foodRef = doc(db, "foodItems", item.id);
            
            await runTransaction(db, async (transaction) => {
                const foodDoc = await transaction.get(foodRef);
                
                if (!foodDoc.exists()) {
                    throw new Error("Item no longer exists!");
                }
                
                const currentQty = parseInt(foodDoc.data().quantity) || 0;
                const newQty = currentQty - item.quantity;
                
                // Prevent negative quantities
                if (newQty < 0) {
                    throw new Error(`Not enough stock for ${item.foodName}`);
                }
                
                transaction.update(foodRef, {
                    quantity: newQty
                });
            });
        }

        // Update user points
        let currentPoints = localStorage.getItem("points");
        currentPoints = currentPoints ? parseInt(currentPoints) : 0;
        let newPoints = currentPoints + totalItems;
        localStorage.setItem("points", newPoints);

        // Clear cart
        localStorage.removeItem('userCart');

        // Show success popup
        document.getElementById("successPopup").style.display = "flex";

    } catch (error) {
        console.error('Payment error:', error);
        alert(error.message || 'Failed to process payment. Please try again.');
        
        const payBtn = document.querySelector('.btn-pay');
        if (payBtn) {
            payBtn.disabled = false;
            payBtn.textContent = 'Confirm';
        }
    }
}

// Go to orders page
window.goToOrders = function() {
    window.location.href = "userhistory.html";
}