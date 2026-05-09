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

    console.log('=== DISPLAY ORDER SUMMARY ===');
    console.log('Cart items:', cart);
    cart.forEach((item, idx) => {
        console.log(`Item ${idx}: ${item.foodName}, vendorId: ${item.vendorId}, vendorInfo: ${item.vendorInfo?.shopName}`);
    });

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

    console.log('=== CHECKOUT START ===');
    console.log('Full cart:', cart);
    console.log('Cart items with vendorIds:', cart.map(item => ({ foodName: item.foodName, vendorId: item.vendorId })));

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

        // Group cart items by vendorId for multi-vendor support
        const vendorGroups = {};
        cart.forEach(item => {
            const vendorId = item.vendorId;
            if (!vendorGroups[vendorId]) {
                vendorGroups[vendorId] = [];
            }
            vendorGroups[vendorId].push(item);
        });

        console.log('Vendor Groups:', vendorGroups);
        console.log('Number of vendors:', Object.keys(vendorGroups).length);

        // Create separate order for each vendor
        const orderRefs = [];
        for (const vendorId in vendorGroups) {
            const vendorItems = vendorGroups[vendorId];
            const vendorTotalItems = vendorItems.reduce((sum, item) => sum + item.quantity, 0);
            const vendorTotalPrice = vendorItems.reduce((sum, item) => sum + (parseFloat(item.discountPrice) * item.quantity), 0);

            const orderData = {
                userId: currentUser.uid,
                userName: userName,
                userEmail: currentUser.email,
                vendorId: vendorId,
                vendorName: vendorItems[0].vendorInfo ? vendorItems[0].vendorInfo.shopName : 'Unknown Vendor',
                vendorLocation: vendorItems[0].vendorInfo ? vendorItems[0].vendorInfo.location : '',
                items: vendorItems.map(item => ({
                    foodId: item.id,
                    foodName: item.foodName,
                    quantity: item.quantity,
                    price: parseFloat(item.discountPrice),
                    originalPrice: parseFloat(item.originalPrice || 0),
                    imageURL: item.imageURL,
                    category: item.category
                })),
                totalAmount: vendorTotalPrice,
                totalItems: vendorTotalItems,
                paymentMethod: selectedPaymentMethod,
                status: 'pending',
                paymentStatus: 'paid',
                createdAt: new Date(),
                pickupTime: 'Before 6:00 PM'
            };

            const orderRef = await addDoc(collection(db, "orders"), orderData);
            orderRefs.push(orderRef);
            console.log(`Created order for vendor ${vendorId}:`, orderRef.id);
        }

        console.log('Total orders created:', orderRefs.length);

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