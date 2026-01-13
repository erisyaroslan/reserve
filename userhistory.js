import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, orderBy, doc, updateDoc, getDoc, increment, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let timerInterval = null;

// CONFIGURATION: Pickup time limit in minutes
const PICKUP_TIME_LIMIT_MINUTES = 15; // 15 minutes

// Auth check
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loadOrders();
        
        // Check for expired orders every 10 seconds
        timerInterval = setInterval(() => {
            checkAndExpireOrders();
        }, 10000);
    } else {
        if (timerInterval) clearInterval(timerInterval);
        window.location.href = 'login.html';
    }
});

// Load user's orders from Firebase
async function loadOrders() {
    try {
        const ordersQuery = query(
            collection(db, "orders"),
            where("userId", "==", currentUser.uid)
            // orderBy("createdAt", "desc") // Uncomment after creating index
        );
        
        const snapshot = await getDocs(ordersQuery);
        const orders = [];

        snapshot.forEach((docSnap) => {
            orders.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        // Sort manually if orderBy is commented out
        orders.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
            return dateB - dateA;
        });

        // Check for expired orders before displaying
        await checkAndExpireOrders();

        displayOrders(orders);
    } catch (error) {
        console.error("Error loading orders:", error);
        const container = document.getElementById('ordersContainer');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: #d32f2f;">
                    <h3>Error loading orders</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }
}

// Check and auto-expire orders
async function checkAndExpireOrders() {
    if (!currentUser) return;

    try {
        const ordersQuery = query(
            collection(db, "orders"),
            where("userId", "==", currentUser.uid),
            where("status", "==", "pending")
        );
        
        const snapshot = await getDocs(ordersQuery);
        const now = new Date();

        for (const docSnap of snapshot.docs) {
            const order = docSnap.data();
            const orderId = docSnap.id;
            
            if (order.createdAt && order.createdAt.toDate) {
                const orderTime = order.createdAt.toDate();
                const expiryTime = new Date(orderTime.getTime() + PICKUP_TIME_LIMIT_MINUTES * 60 * 1000);
                
                // If order has expired
                if (now > expiryTime) {
                    console.log(`Auto-expiring order: ${orderId}`);
                    await expireOrder(orderId, order);
                }
            }
        }
        
        // Refresh display after checking
        const ordersQuery2 = query(
            collection(db, "orders"),
            where("userId", "==", currentUser.uid)
        );
        const snapshot2 = await getDocs(ordersQuery2);
        const orders = [];
        snapshot2.forEach((docSnap) => {
            orders.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });
        
        orders.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
            return dateB - dateA;
        });
        
        displayOrders(orders);
        
    } catch (error) {
        console.error('Error checking expired orders:', error);
    }
}

// Expire an order (auto-cancel with expired status)
async function expireOrder(orderId, orderData) {
    try {
        const orderRef = doc(db, "orders", orderId);
        
        // Update order status to expired
        await updateDoc(orderRef, {
            status: 'expired',
            expiredAt: Timestamp.now()
        });

        // Restore quantities
        if (orderData.items && orderData.items.length > 0) {
            for (const item of orderData.items) {
                if (item.foodId) {
                    try {
                        const foodRef = doc(db, "foodItems", item.foodId);
                        const foodDoc = await getDoc(foodRef);
                        
                        if (foodDoc.exists()) {
                            await updateDoc(foodRef, {
                                quantity: increment(item.quantity || 1)
                            });
                            console.log(`Restored ${item.quantity} units for ${item.foodName}`);
                        }
                    } catch (error) {
                        console.error(`Error restoring quantity for ${item.foodName}:`, error);
                    }
                }
            }
        }
        
        showNotification('Order pickup time expired. Order cancelled and items restored.', 'error');
    } catch (error) {
        console.error('Error expiring order:', error);
    }
}

// Calculate time remaining
function getTimeRemaining(orderDate) {
    const now = new Date();
    const expiryTime = new Date(orderDate.getTime() + PICKUP_TIME_LIMIT_MINUTES * 60 * 1000);
    const timeLeft = expiryTime - now;
    
    if (timeLeft <= 0) {
        return { expired: true, text: 'Expired', minutes: 0, seconds: 0 };
    }
    
    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);
    
    return {
        expired: false,
        text: `${minutes}m ${seconds}s`,
        minutes,
        seconds,
        total: timeLeft
    };
}

// Display orders
function displayOrders(orders) {
    const container = document.getElementById('ordersContainer');
    
    if (!container) return;

    if (orders.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #777;">
                <div style="font-size: 3rem; margin-bottom: 15px;">📦</div>
                <h3 style="font-size: 1.3rem; color: #2f2f2f; margin-bottom: 8px;">No orders yet</h3>
                <p>Your order history will appear here once you make a purchase!</p>
                <a href="userbrowsemeal.html" style="display: inline-block; margin-top: 20px; background: #2E7D32; color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: 600;">Browse Meals</a>
            </div>
        `;
        return;
    }

    // Group orders by status (including expired)
    const pendingOrders = orders.filter(o => o.status === 'pending');
    const completedOrders = orders.filter(o => o.status === 'completed');
    const cancelledOrders = orders.filter(o => o.status === 'cancelled');
    const expiredOrders = orders.filter(o => o.status === 'expired');

    // Display orders: pending first, then completed, then cancelled, then expired
    container.innerHTML = [...pendingOrders, ...completedOrders, ...cancelledOrders, ...expiredOrders].map(order => 
        createOrderCardHTML(order)
    ).join('');
    
    // Start countdown timers for pending orders
    startCountdownTimers();
}

// Create order card HTML
function createOrderCardHTML(order) {
    const orderDate = order.createdAt?.toDate ? 
        order.createdAt.toDate().toLocaleDateString('en-GB', { 
            day: 'numeric', 
            month: 'short', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) : 
        'Unknown Date';

    const statusColors = {
        pending: { bg: '#FFF3E0', color: '#E65100', text: 'Pending Pickup' },
        completed: { bg: '#E8F5E9', color: '#2E7D32', text: 'Completed' },
        cancelled: { bg: '#FFEBEE', color: '#C62828', text: 'Cancelled' },
        expired: { bg: '#FFE0E0', color: '#B71C1C', text: 'Expired' }
    };
    
    const status = order.status || 'pending';
    const statusStyle = statusColors[status] || statusColors.pending;

    // Calculate time remaining for pending orders
    let timerHTML = '';
    if (status === 'pending' && order.createdAt?.toDate) {
        const timeInfo = getTimeRemaining(order.createdAt.toDate());
        
        if (!timeInfo.expired) {
            const urgentClass = timeInfo.minutes < 5 ? 'urgent-timer' : '';
            timerHTML = `
                <div class="pickup-timer ${urgentClass}" data-order-id="${order.id}" data-expiry="${order.createdAt.toDate().getTime() + PICKUP_TIME_LIMIT_MINUTES * 60 * 1000}">
                    <div style="font-size: 0.85rem; color: #666; margin-bottom: 4px;">⏰ Time to pickup:</div>
                    <div class="timer-display" style="font-size: 1.4rem; font-weight: 700; color: ${timeInfo.minutes < 5 ? '#d32f2f' : '#E65100'};">
                        ${timeInfo.text}
                    </div>
                    <div style="font-size: 0.75rem; color: #999; margin-top: 4px;">
                        Pick up before ${new Date(order.createdAt.toDate().getTime() + PICKUP_TIME_LIMIT_MINUTES * 60 * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            `;
        }
    }

    // Expired info
    let expiredInfoHTML = '';
    if (status === 'expired' && order.expiredAt) {
        const expiredDate = order.expiredAt.toDate ? 
            order.expiredAt.toDate().toLocaleString('en-GB', { 
                day: 'numeric', 
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            }) : 
            'Unknown';
        expiredInfoHTML = `
            <div style="background: #FFE0E0; padding: 12px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #d32f2f;">
                <p style="font-size: 0.9rem; color: #B71C1C; font-weight: 600; margin: 0;">
                    ⚠️ This order expired on ${expiredDate}
                </p>
                <p style="font-size: 0.85rem; color: #666; margin: 4px 0 0 0;">
                    Meals wasn't picked up in time and the order was automatically cancelled. Item quantities have been restored.
                </p>
            </div>
        `;
    }

    // Items list
    const itemsHTML = order.items && order.items.length > 0 ? 
        order.items.map(item => {
            const foodName = item.foodName || 'Unknown Item';
            const price = item.price || item.discountPrice || 0;
            const quantity = item.quantity || 1;
            
            return `
                <div class="meal-item">
                    <div>
                        <p style="margin-bottom: 2px;">${foodName} ${quantity > 1 ? `x${quantity}` : ''}</p>
                        <p style="font-size: 0.85rem; color: #999;">${item.category || ''}</p>
                    </div>
                    <span class="price">RM ${(parseFloat(price) * quantity).toFixed(2)}</span>
                </div>
            `;
        }).join('') : '<p>No items</p>';

    // Action buttons (only for pending orders)
    let actionHTML = '';
    if (status === 'pending') {
        actionHTML = `
            <button class="btn-action" style="background: #d32f2f;" onclick="cancelOrder('${order.id}')">
                Cancel Order
            </button>
        `;
    }

    // Cancel reason (for manually cancelled orders)
    let cancelReasonHTML = '';
    if (status === 'cancelled' && order.cancelReason) {
        cancelReasonHTML = `
            <p style="font-size: 0.85rem; color: #d32f2f; margin-top: 8px; font-style: italic;">
                ${order.cancelReason}
            </p>
        `;
    }

    return `
        <div class="order-card">
            <div class="order-header">
                <span>Order #${order.id.substring(0, 8)} - ${orderDate}</span>
                <span style="background: ${statusStyle.bg}; color: ${statusStyle.color}; padding: 6px 14px; border-radius: 8px; font-size: 0.9rem; font-weight: 600;">
                    ${statusStyle.text}
                </span>
            </div>
            
            ${timerHTML}
            ${expiredInfoHTML}
            
            <div class="order-meals">
                ${itemsHTML}
                
                <p style="font-size: 0.85rem; color: #777; margin-top: 12px; padding-top: 12px; border-top: 1px solid #f0f0f0;">
                    <strong>Vendor:</strong> ${order.vendorName || 'Unknown Vendor'}${order.vendorLocation ? ` • ${order.vendorLocation}` : ''}
                </p>
                
                <p style="font-size: 0.85rem; color: #777; margin-top: 4px;">
                    <strong>Payment:</strong> ${order.paymentMethod || 'N/A'}${order.paymentStatus ? ` (${order.paymentStatus})` : ''}
                </p>
                
                ${cancelReasonHTML}
            </div>
            
            <div class="order-footer">
                <div>Total: RM ${parseFloat(order.totalAmount || 0).toFixed(2)}</div>
                <div>${actionHTML}</div>
            </div>
        </div>
    `;
}

// Start countdown timers
function startCountdownTimers() {
    const timers = document.querySelectorAll('.pickup-timer');
    
    if (timers.length === 0) return;
    
    // Clear any existing interval
    if (window.countdownInterval) {
        clearInterval(window.countdownInterval);
    }
    
    // Update every second
    window.countdownInterval = setInterval(() => {
        timers.forEach(timer => {
            const expiryTime = parseInt(timer.dataset.expiry);
            const now = Date.now();
            const timeLeft = expiryTime - now;
            
            if (timeLeft <= 0) {
                timer.querySelector('.timer-display').textContent = 'Expiring...';
                timer.querySelector('.timer-display').style.color = '#d32f2f';
                // Trigger refresh to auto-expire
                setTimeout(() => loadOrders(), 1000);
            } else {
                const minutes = Math.floor(timeLeft / 60000);
                const seconds = Math.floor((timeLeft % 60000) / 1000);
                const display = timer.querySelector('.timer-display');
                
                display.textContent = `${minutes}m ${seconds}s`;
                
                // Change color when under 5 minutes (urgent for 15 min limit)
                if (minutes < 5) {
                    display.style.color = '#d32f2f';
                    timer.classList.add('urgent-timer');
                }
            }
        });
    }, 1000);
}

// Cancel order function (manual cancellation by user)
window.cancelOrder = async function(orderId) {
    if (!confirm('Are you sure you want to cancel this order?')) {
        return;
    }

    try {
        const orderRef = doc(db, "orders", orderId);
        const orderDoc = await getDoc(orderRef);
        
        if (!orderDoc.exists()) {
            showNotification('Order not found', 'error');
            return;
        }

        const orderData = orderDoc.data();

        // Update order status to cancelled
        await updateDoc(orderRef, {
            status: 'cancelled',
            cancelledAt: Timestamp.now(),
            cancelReason: 'Cancelled by user'
        });

        // Restore quantities
        if (orderData.items && orderData.items.length > 0) {
            for (const item of orderData.items) {
                if (item.foodId) {
                    try {
                        const foodRef = doc(db, "foodItems", item.foodId);
                        const foodDoc = await getDoc(foodRef);
                        
                        if (foodDoc.exists()) {
                            await updateDoc(foodRef, {
                                quantity: increment(item.quantity || 1)
                            });
                            console.log(`Restored ${item.quantity} units for ${item.foodName}`);
                        }
                    } catch (error) {
                        console.error(`Error restoring quantity for ${item.foodName}:`, error);
                    }
                }
            }
        }

        showNotification('Order cancelled successfully. Item quantities restored.', 'success');
        
        setTimeout(() => loadOrders(), 500);
        
    } catch (error) {
        console.error('Error cancelling order:', error);
        showNotification('Failed to cancel order. Please try again.', 'error');
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
    }, 3000);
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (timerInterval) clearInterval(timerInterval);
    if (window.countdownInterval) clearInterval(window.countdownInterval);
});

// Add animation and timer styles
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
    
    .pickup-timer {
        background: #FFF3E0;
        padding: 15px;
        border-radius: 12px;
        margin: 15px 0;
        text-align: center;
        border: 2px solid #FFE0B2;
    }
    
    .pickup-timer.urgent-timer {
        background: #FFEBEE;
        border-color: #FFCDD2;
        animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
        0%, 100% {
            opacity: 1;
        }
        50% {
            opacity: 0.85;
        }
    }
    
    .meal-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        gap: 15px;
    }
    
    .meal-item .price {
        font-weight: 700;
        color: #1B4332;
        white-space: nowrap;
    }
    
    .order-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        font-weight: 600;
        color: #1B4332;
        flex-wrap: wrap;
        gap: 10px;
    }
    
    .order-footer {
        margin-top: 15px;
        padding-top: 15px;
        border-top: 1px solid #f0f0f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
    }
    
    .order-footer > div:first-child {
        font-weight: 700;
        color: #2f2f2f;
        font-size: 1.1rem;
    }
    
    .btn-action {
        background: #2E7D32;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 12px;
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 600;
        transition: background 0.2s, transform 0.2s;
    }
    
    .btn-action:hover {
        background: #1B4332;
        transform: translateY(-1px);
    }
`;
document.head.appendChild(style);