import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let vendorCache = {}; // Cache vendor info to avoid multiple fetches

// Auth check
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loadCart();
    } else {
        window.location.href = 'login.html';
    }
});

// Fetch vendor info
async function getVendorInfo(vendorId) {
    if (vendorCache[vendorId]) {
        return vendorCache[vendorId];
    }

    try {
        const vendorDoc = await getDoc(doc(db, "users", vendorId));
        if (vendorDoc.exists()) {
            const data = vendorDoc.data();
            vendorCache[vendorId] = {
                shopName: data.shopName || 'Unknown Vendor',
                location: data.location || ''
            };
            return vendorCache[vendorId];
        }
    } catch (error) {
        console.error('Error fetching vendor:', error);
    }
    
    return { shopName: 'Unknown Vendor', location: '' };
}

// Load cart from localStorage
async function loadCart() {
    const cart = JSON.parse(localStorage.getItem('userCart') || '[]');
    
    for (let item of cart) {
        if (item.vendorId && !item.vendorInfo) {
            item.vendorInfo = await getVendorInfo(item.vendorId);
        }
    }
    
    localStorage.setItem('userCart', JSON.stringify(cart));
    displayCart(cart);
}

// Display cart items
function displayCart(cart) {
    const container = document.getElementById('cartContainer');
    const totalBox = document.getElementById('totalBox');
    
    if (!container) return;

    if (cart.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #777;">
                <div style="font-size: 3rem; margin-bottom: 15px;">🛒</div>
                <h3 style="font-size: 1.3rem; color: #1A1A1A; margin-bottom: 8px;">Your cart is empty</h3>
                <p>Browse meals and add items to get started!</p>
                <a href="userbrowsemeal.html" style="display: inline-block; margin-top: 20px; background: #2E7D32; color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: 600;">Browse Meals</a>
            </div>
        `;
        if (totalBox) totalBox.style.display = 'none';
        return;
    }

    const total = cart.reduce((sum, item) => sum + (parseFloat(item.discountPrice) * item.quantity), 0);

    container.innerHTML = cart.map((item, index) => {
        const vendorName = item.vendorInfo ? item.vendorInfo.shopName : 'Loading...';
        const vendorLocation = item.vendorInfo && item.vendorInfo.location ? ` • ${item.vendorInfo.location}` : '';
        
        return `
        <div class="cart-item" data-index="${index}">
            <div class="cart-photo" style="background-image: url('${item.imageURL || 'image/placeholder.jpg'}'); background-size: cover; background-position: center;"></div>

            <div class="cart-info">
                <h4>${item.foodName}</h4>
                <p>${item.category || 'Food'} • ${vendorName}${vendorLocation}</p>
            </div>

            <div class="qty-control">
                <button onclick="updateQuantity(${index}, -1)">-</button>
                <span>${item.quantity}</span>
                <button onclick="updateQuantity(${index}, 1)">+</button>
            </div>

            <span class="price">RM ${(parseFloat(item.discountPrice) * item.quantity).toFixed(2)}</span>
            <span class="remove" onclick="removeItem(${index})" style="cursor: pointer;">Remove</span>
        </div>
        `;
    }).join('');

    if (totalBox) {
        totalBox.style.display = 'block';
        totalBox.innerHTML = `
            <p style="font-size: 1.1rem; margin-bottom: 8px;"><strong>Subtotal:</strong> RM ${total.toFixed(2)}</p>
            <p style="font-size: 0.9rem; color: #777; margin-bottom: 15px;">${cart.reduce((sum, item) => sum + item.quantity, 0)} item(s)</p>
            <button class="btn-checkout" onclick="proceedToCheckout()">Proceed to Checkout</button>
        `;
    }
}

// Update quantity
window.updateQuantity = function(index, change) {
    let cart = JSON.parse(localStorage.getItem('userCart') || '[]');
    if (!cart[index]) return;

    const newQuantity = cart[index].quantity + change;

    if (newQuantity < 1) {
        removeItem(index);
        return;
    }

    if (newQuantity > cart[index].maxStock) {
        showNotification('Maximum stock reached!', 'error');
        return;
    }

    cart[index].quantity = newQuantity;
    localStorage.setItem('userCart', JSON.stringify(cart));
    displayCart(cart);
}

// Remove item
window.removeItem = function(index) {
    let cart = JSON.parse(localStorage.getItem('userCart') || '[]');
    cart.splice(index, 1);
    localStorage.setItem('userCart', JSON.stringify(cart));
    displayCart(cart);
    showNotification('Item removed from cart', 'success');
}

// Proceed to checkout
window.proceedToCheckout = function() {
    if (!currentUser) {
        alert('Please login first!');
        return;
    }
    const cart = JSON.parse(localStorage.getItem('userCart') || '[]');
    if (cart.length === 0) {
        alert('Your cart is empty!');
        return;
    }
    window.location.href = 'checkout.html';
}

// Notification function
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = 'cart-notification';
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
        notification.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

// Styles for Animations and Custom Checkout Button
const style = document.createElement('style');
style.textContent = `
    .remove {
        cursor: pointer;
        transition: color 0.2s;
    }
    .remove:hover {
        color: #d32f2f;
        text-decoration: underline;
    }
    
    /* Updated Checkout Button Design */
    .btn-checkout {
        width: 100%;
        padding: 14px;
        border-radius: 14px;
        cursor: pointer;
        font-weight: 700;
        font-size: 1rem;
        transition: all 0.3s ease;
        
        /* White fill, black text, green stroke */
        background: #ffffff;
        color: #000000;
        border: 2px solid #2E7D32;
    }

    .btn-checkout:hover {
        background: #f0fdf4; /* Very light green tint on hover */
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(46, 125, 50, 0.1);
    }

    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
`;
document.head.appendChild(style);