import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, updateDoc, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentVendor = null;
let allOrders = [];
let pendingAction = null;

// Auth check - ensure vendor is logged in
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentVendor = user;
        console.log('Vendor logged in:', currentVendor.uid);
        loadReservations();
    } else {
        console.log('No user logged in, redirecting...');
        window.location.href = 'vendor-login.html';
    }
});

// Load all reservations for this vendor
async function loadReservations() {
    try {
        console.log('Loading reservations for vendor:', currentVendor.uid);
        
        // Query orders for this vendor
        const ordersQuery = query(
            collection(db, "orders"),
            where("vendorId", "==", currentVendor.uid),
            orderBy("createdAt", "desc")
        );
        
        const snapshot = await getDocs(ordersQuery);
        allOrders = [];

        snapshot.forEach((docSnap) => {
            allOrders.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        console.log('Loaded orders:', allOrders.length);

        // Calculate and display stats
        updateStats();
        
        // Display orders based on current tab
        const activeTab = document.querySelector('.tab-btn.active').id;
        showTab(activeTab === 'tab-active' ? 'active' : 'history');

    } catch (error) {
        console.error("Error loading reservations:", error);
        showAppToast("Error loading reservations: " + error.message, "cancelled");
        
        // Show error in UI
        const container = document.getElementById('order-container');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #d32f2f;">
                    <p><strong>Error loading reservations</strong></p>
                    <p style="font-size: 0.9rem; margin-top: 10px;">${error.message}</p>
                    <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #2E7D32; color: white; border: none; border-radius: 10px; cursor: pointer;">Retry</button>
                </div>
            `;
        }
    }
}

// Calculate statistics
function updateStats() {
    const pending = allOrders.filter(order => order.status === 'pending').length;
    const completed = allOrders.filter(order => order.status === 'completed').length;
    const cancelled = allOrders.filter(order => order.status === 'cancelled').length;

    document.getElementById('stat-active').textContent = pending;
    document.getElementById('stat-completed').textContent = completed;
    document.getElementById('stat-cancelled').textContent = cancelled;
}

// Show active or history tab
window.showTab = function(type) {
    document.getElementById('tab-active').classList.toggle('active', type === 'active');
    document.getElementById('tab-history').classList.toggle('active', type === 'history');
    
    if (type === 'active') {
        displayActiveOrders();
    } else {
        displayHistoryOrders();
    }
}

// Display active (pending) orders
function displayActiveOrders() {
    const container = document.getElementById('order-container');
    const activeOrders = allOrders.filter(order => order.status === 'pending');
    
    if (activeOrders.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #777;">
                <p>No active orders at the moment.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = activeOrders.map(order => createOrderCard(order, 'active')).join('');
}

// Display history (completed + cancelled) orders
function displayHistoryOrders() {
    const container = document.getElementById('order-container');
    const historyOrders = allOrders.filter(order => 
        order.status === 'completed' || order.status === 'cancelled'
    );
    
    if (historyOrders.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #777;">
                <p>No order history yet.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = historyOrders.map(order => createOrderCard(order, 'history')).join('');
}

// Create order card HTML
function createOrderCard(order, viewType) {
    // Get user name and ID
    const userName = order.userName || 'Unknown User';
    const userId = order.userId || 'N/A';
    
    // Get first item details (or combine multiple items)
    let foodName = 'Order';
    let totalQty = 0;
    
    if (order.items && order.items.length > 0) {
        foodName = order.items[0].foodName || 'Order';
        if (order.items.length > 1) {
            foodName += ` +${order.items.length - 1} more`;
        }
        
        // Calculate total quantity
        order.items.forEach(item => {
            totalQty += item.quantity || 1;
        });
    } else {
        totalQty = order.totalItems || 1;
    }
    

    
    // Determine if this is a history card
    const isHistory = viewType === 'history';
    const historyClass = isHistory ? 'is-history' : '';
    
    // Create action buttons or status label
    let actionHTML = '';
    if (isHistory) {
        const labelClass = order.status === 'completed' ? 'label-collected' : 'label-cancelled';
        const statusText = order.status === 'completed' ? 'COLLECTED' : 'CANCELLED';
        actionHTML = `<span class="status-label ${labelClass}">${statusText}</span>`;
    } else {
        actionHTML = `
            <button class="btn-action btn-collect" onclick="openAppModal('${order.id}', 'collected')">Collected</button>
            <button class="btn-action btn-cancel" onclick="openAppModal('${order.id}', 'cancelled')">Cancel</button>
        `;
    }
    
    return `
        <div class="res-card ${historyClass}" data-view="${viewType}" id="order-${order.id}">
            <div class="student-info">
                <h4>${userName}</h4>
                <p>ID: ${userId.substring(0, 10)}</p>
            </div>
            <div class="order-details">
                <strong>${foodName}</strong>
            </div>
            <div class="qty-column">
                <div class="qty-label">Qty</div>
                <div class="qty-value">${totalQty}</div>
            </div>
            <div class="actions">
                ${actionHTML}
            </div>
        </div>
    `;
}

// Format pickup time
function formatPickupTime(date) {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    
    return `Before ${displayHours}:${displayMinutes} ${ampm}`;
}

// Open confirmation modal
window.openAppModal = function(orderId, action) {
    pendingAction = { orderId, action };
    const confirmBtn = document.getElementById('modal-confirm-btn');
    
    const actionText = action === 'collected' ? 'collected' : 'cancelled';
    document.getElementById('modal-msg').innerText = 
        `Are you sure you want to mark this reservation as ${actionText}?`;

    // Update modal styling based on action
    if (action === 'cancelled') {
        confirmBtn.classList.add('is-cancel-type');
        confirmBtn.innerText = "Yes, Cancel Order";
    } else {
        confirmBtn.classList.remove('is-cancel-type');
        confirmBtn.innerText = "Yes, Collected";
    }

    document.getElementById('custom-modal').style.display = 'flex';
}

// Close modal
window.closeAppModal = function(confirmed) {
    document.getElementById('custom-modal').style.display = 'none';
    
    if (confirmed && pendingAction) {
        processOrder(pendingAction.orderId, pendingAction.action);
    }
    
    pendingAction = null;
}

// Process order (mark as collected or cancelled)
async function processOrder(orderId, action) {
    try {
        const newStatus = action === 'collected' ? 'completed' : 'cancelled';
        const timestampField = action === 'collected' ? 'completedAt' : 'cancelledAt';
        
        console.log('Processing order:', orderId, 'Action:', action);
        
        // Update in Firebase
        const orderRef = doc(db, "orders", orderId);
        await updateDoc(orderRef, {
            status: newStatus,
            [timestampField]: Timestamp.now()
        });
        
        console.log('Order updated successfully');
        
        // Update local data
        const orderIndex = allOrders.findIndex(o => o.id === orderId);
        if (orderIndex !== -1) {
            allOrders[orderIndex].status = newStatus;
        }
        
        // Update UI
        updateStats();
        
        // Show notification
        if (action === 'collected') {
            showAppToast("Order marked as collected!", "collected");
        } else {
            showAppToast("Order has been cancelled.", "cancelled");
        }
        
        // Refresh the current view
        const activeTab = document.querySelector('.tab-btn.active').id;
        showTab(activeTab === 'tab-active' ? 'active' : 'history');
        
    } catch (error) {
        console.error("Error updating order:", error);
        showAppToast("Error: " + error.message, "cancelled");
    }
}

// Show toast notification
window.showAppToast = function(message, type) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'cancelled' ? 'toast-cancelled' : ''}`;

    const icon = type === 'collected' ? 'ph-check-circle' : 'ph-x-circle';
    toast.innerHTML = `<i class="${icon}" style="font-size:1.2rem"></i> ${message}`;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = '0.5s';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}