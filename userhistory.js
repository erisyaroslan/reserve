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
        );
        
        const snapshot = await getDocs(ordersQuery);
        const orders = [];

        snapshot.forEach((docSnap) => {
            orders.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        // Sort manually: Newest first
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
                
                if (now > expiryTime) {
                    await expireOrder(orderId, order);
                }
            }
        }
    } catch (error) {
        console.error('Error checking expired orders:', error);
    }
}

async function expireOrder(orderId, orderData) {
    try {
        const orderRef = doc(db, "orders", orderId);
        await updateDoc(orderRef, {
            status: 'expired',
            expiredAt: Timestamp.now()
        });

        if (orderData.items) {
            for (const item of orderData.items) {
                if (item.foodId) {
                    const foodRef = doc(db, "foodItems", item.foodId);
                    await updateDoc(foodRef, { quantity: increment(item.quantity || 1) });
                }
            }
        }
        showNotification('Order pickup time expired.', 'error');
    } catch (error) {
        console.error('Error expiring order:', error);
    }
}

function getTimeRemaining(orderDate) {
    const now = new Date();
    const expiryTime = new Date(orderDate.getTime() + PICKUP_TIME_LIMIT_MINUTES * 60 * 1000);
    const timeLeft = expiryTime - now;
    
    if (timeLeft <= 0) return { expired: true, text: 'Expired' };
    
    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);
    return { expired: false, text: `${minutes}m ${seconds}s`, minutes };
}

// FIXED: Removed status grouping to keep chronological order
function displayOrders(orders) {
    const container = document.getElementById('ordersContainer');
    if (!container) return;

    if (orders.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #777;">
                <div style="font-size: 3rem; margin-bottom: 15px;">📦</div>
                <h3 style="font-size: 1.3rem; color: #2f2f2f; margin-bottom: 8px;">No orders yet</h3>
                <a href="userbrowsemeal.html" style="display: inline-block; margin-top: 20px; background: #2E7D32; color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: 600;">Browse Meals</a>
            </div>`;
        return;
    }

    // Directly map sorted orders to keep them in date order
    container.innerHTML = orders.map(order => createOrderCardHTML(order)).join('');
    
    startCountdownTimers();
}

function createOrderCardHTML(order) {
    const status = order.status || 'pending';
    const statusColors = {
        pending: { bg: '#FFF3E0', color: '#E65100', text: 'Pending Pickup' },
        completed: { bg: '#E8F5E9', color: '#2E7D32', text: 'Completed' },
        cancelled: { bg: '#FFEBEE', color: '#C62828', text: 'Cancelled' },
        expired: { bg: '#FFE0E0', color: '#B71C1C', text: 'Expired' }
    };
    
    const statusStyle = statusColors[status] || statusColors.pending;

    let timerHTML = '';
    if (status === 'pending' && order.createdAt?.toDate) {
        const timeInfo = getTimeRemaining(order.createdAt.toDate());
        if (!timeInfo.expired) {
            timerHTML = `
                <div class="pickup-timer" data-order-id="${order.id}" data-expiry="${order.createdAt.toDate().getTime() + PICKUP_TIME_LIMIT_MINUTES * 60 * 1000}">
                    <div style="font-size: 0.85rem; color: #666; margin-bottom: 4px;">⏰ Time to pickup:</div>
                    <div class="timer-display" style="font-size: 1.4rem; font-weight: 700; color: ${timeInfo.minutes < 5 ? '#d32f2f' : '#E65100'};">${timeInfo.text}</div>
                </div>`;
        }
    }

    // ADDED: Green banner for Completed status
    let alertBannerHTML = '';
    if (status === 'expired') {
        alertBannerHTML = `<div class="alert-banner status-expired"><p>⚠️ Order Expired</p><small>Time limit exceeded. Stock restored.</small></div>`;
    } else if (status === 'cancelled') {
        alertBannerHTML = `<div class="alert-banner status-cancelled"><p>🚫 Order Cancelled</p><small>This order was cancelled. Stock restored.</small></div>`;
    } else if (status === 'completed') {
        alertBannerHTML = `<div class="alert-banner status-completed"><p>✅ Order Completed</p><small>Thank you for rescuing this meal!</small></div>`;
    }

    const itemsHTML = order.items?.map(item => `
        <div class="meal-item">
            <div><p>${item.foodName} ${item.quantity > 1 ? `x${item.quantity}` : ''}</p></div>
            <span class="price">RM ${(parseFloat(item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
        </div>`).join('') || '';

    let actionHTML = '';
    if (status === 'pending') {
        actionHTML = `<button class="btn-action" style="background: #d32f2f;" onclick="cancelOrder('${order.id}')">Cancel Order</button>`;
    }

    return `
        <div class="order-card">
            <div class="order-header">
                <span>Order #${order.id.substring(0, 8)}</span>
                <span style="background: ${statusStyle.bg}; color: ${statusStyle.color}; padding: 6px 14px; border-radius: 8px;">${statusStyle.text}</span>
            </div>
            ${timerHTML}
            ${alertBannerHTML}
            <div class="order-meals">${itemsHTML}</div>
            <div class="order-footer">
                <div>Total: RM ${parseFloat(order.totalAmount || 0).toFixed(2)}</div>
                <div>${actionHTML}</div>
            </div>
        </div>`;
}

function startCountdownTimers() {
    const timers = document.querySelectorAll('.pickup-timer');
    if (timers.length === 0) return;
    if (window.countdownInterval) clearInterval(window.countdownInterval);
    
    window.countdownInterval = setInterval(() => {
        timers.forEach(timer => {
            const expiryTime = parseInt(timer.dataset.expiry);
            const timeLeft = expiryTime - Date.now();
            if (timeLeft <= 0) {
                setTimeout(() => loadOrders(), 1000);
            } else {
                const minutes = Math.floor(timeLeft / 60000);
                const seconds = Math.floor((timeLeft % 60000) / 1000);
                timer.querySelector('.timer-display').textContent = `${minutes}m ${seconds}s`;
            }
        });
    }, 1000);
}

window.cancelOrder = function(orderId) {
    const modal = document.getElementById('cancelModal');
    if(modal) {
        modal.style.display = 'flex';
        document.getElementById('confirmCancelBtn').onclick = async () => {
            closeCancelModal();
            await executeOrderCancellation(orderId);
        };
    }
};

window.closeCancelModal = function() {
    const modal = document.getElementById('cancelModal');
    if(modal) modal.style.display = 'none';
};

async function executeOrderCancellation(orderId) {
    try {
        const orderRef = doc(db, "orders", orderId);
        const orderDoc = await getDoc(orderRef);
        if (!orderDoc.exists()) return;

        const orderData = orderDoc.data();
        await updateDoc(orderRef, {
            status: 'cancelled',
            cancelledAt: Timestamp.now(),
            cancelReason: 'Cancelled by user'
        });

        if (orderData.items) {
            for (const item of orderData.items) {
                if (item.foodId) {
                    const foodRef = doc(db, "foodItems", item.foodId);
                    await updateDoc(foodRef, { quantity: increment(item.quantity || 1) });
                }
            }
        }
        showNotification('Order cancelled.', 'success');
        setTimeout(() => loadOrders(), 500);
    } catch (error) {
        showNotification('Failed to cancel.', 'error');
    }
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `position: fixed; top: 90px; right: 20px; background: ${type === 'success' ? '#2E7D32' : '#d32f2f'}; color: white; padding: 16px 24px; border-radius: 12px; font-weight: 600; z-index: 9999;`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

window.addEventListener('beforeunload', () => {
    if (timerInterval) clearInterval(timerInterval);
    if (window.countdownInterval) clearInterval(window.countdownInterval);
});

const style = document.createElement('style');
style.textContent = `
    .pickup-timer { background: #FFF3E0; padding: 15px; border-radius: 12px; margin: 15px 0; text-align: center; border: 2px solid #FFE0B2; }
    .meal-item { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .order-card { background: white; padding: 20px; border-radius: 16px; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .btn-action { color: white; border: none; padding: 8px 16px; border-radius: 12px; cursor: pointer; font-weight: 600; }
    
    .alert-banner { padding: 12px 16px; border-radius: 12px; margin: 15px 0; border-left: 5px solid; }
    .alert-banner p { font-weight: 700; margin: 0; font-size: 0.95rem; }
    .alert-banner small { color: #666; font-size: 0.85rem; }
    
    .status-expired { background: #FFE0E0; border-color: #B71C1C; }
    .status-expired p { color: #B71C1C; }
    
    .status-cancelled { background: #FFEBEE; border-color: #C62828; }
    .status-cancelled p { color: #C62828; }
    
    .status-completed { background: #E8F5E9; border-color: #2E7D32; }
    .status-completed p { color: #2E7D32; }
`;
document.head.appendChild(style);
