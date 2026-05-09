import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    updateDoc,
    getDoc,
    orderBy,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentVendor = null;
let allOrders = [];
let pendingAction = null;
let html5QrScanner = null;
let scannedOrderId = null;

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

        updateStats();

        const activeTab = document.querySelector('.tab-btn.active').id;
        showTab(activeTab === 'tab-active' ? 'active' : 'history');

    } catch (error) {
        console.error("Error loading reservations:", error);
        showAppToast("Error loading reservations: " + error.message, "cancelled");

        const container = document.getElementById('order-container');

        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #d32f2f;">
                    <p><strong>Error loading reservations</strong></p>
                    <p style="font-size: 0.9rem; margin-top: 10px;">${error.message}</p>
                    <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #2E7D32; color: white; border: none; border-radius: 10px; cursor: pointer;">
                        Retry
                    </button>
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
};

// Display active orders
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

// Display history orders
function displayHistoryOrders() {
    const container = document.getElementById('order-container');

    const historyOrders = allOrders.filter(order =>
        order.status === 'completed' ||
        order.status === 'cancelled' ||
        order.status === 'expired'
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
    const userName = order.userName || 'Unknown User';
    const userId = order.userId || 'N/A';

    let foodName = 'Order';
    let totalQty = 0;

    if (order.items && order.items.length > 0) {
        foodName = order.items[0].foodName || 'Order';

        if (order.items.length > 1) {
            foodName += ` +${order.items.length - 1} more`;
        }

        order.items.forEach(item => {
            totalQty += item.quantity || 1;
        });
    } else {
        totalQty = order.totalItems || 1;
    }

    const isHistory = viewType === 'history';
    const historyClass = isHistory ? 'is-history' : '';

    let actionHTML = '';

    if (isHistory) {
        let labelClass = 'label-cancelled';
        let statusText = 'CANCELLED';

        if (order.status === 'completed') {
            labelClass = 'label-collected';
            statusText = 'COLLECTED';
        } else if (order.status === 'expired') {
            labelClass = 'label-cancelled';
            statusText = 'EXPIRED';
        }

        actionHTML = `<span class="status-label ${labelClass}">${statusText}</span>`;
    } else {
        actionHTML = `
            <button class="btn-action btn-cancel" onclick="openAppModal('${order.id}', 'cancelled')">
                Cancel
            </button>
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
                <small style="display:block; color:#777; margin-top:5px;">
                    Order #${order.id.substring(0, 8)}
                </small>
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

// Global QR Scanner
window.openGlobalScanner = async function() {
    const modal = document.getElementById('scanner-modal');
    const scannerBox = document.getElementById('qr-reader');

    if (!modal || !scannerBox) {
        showAppToast("Scanner modal not found in HTML.", "cancelled");
        return;
    }

    modal.style.display = 'flex';
    scannerBox.innerHTML = "";

    html5QrScanner = new Html5Qrcode("qr-reader");

    try {
        await html5QrScanner.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: {
                    width: 250,
                    height: 250
                }
            },
            async (decodedText) => {
                await handleScannedQR(decodedText);
            },
            () => {}
        );
    } catch (error) {
        console.error("Scanner start error:", error);
        showAppToast("Camera permission failed or scanner cannot start.", "cancelled");
    }
};

async function handleScannedQR(decodedText) {
    try {
        const orderId = decodedText.trim();
        console.log('Scanned order ID:', orderId);

        // Play beep sound
        playBeep();

        // Vibrate (mobile)
        if (navigator.vibrate) {
            navigator.vibrate(200);
        }

        // Stop scanner
        if (html5QrScanner) {
            await html5QrScanner.stop();
            html5QrScanner.clear();
            html5QrScanner = null;
        }

        // Show loading
        document.getElementById('scanner-loading').classList.add('show');

        // Fetch and validate order
        await fetchAndValidateOrder(orderId);

    } catch (error) {
        console.error("QR scan error:", error);
        showAppToast("Error processing QR code.", "cancelled");
        closeGlobalScanner();
    }
}

async function fetchAndValidateOrder(orderId) {
    try {
        const orderRef = doc(db, "orders", orderId);
        const orderSnap = await getDoc(orderRef);

        if (!orderSnap.exists()) {
            throw new Error("Order not found");
        }

        const orderData = orderSnap.data();

        // Validate vendor
        if (orderData.vendorId !== currentVendor.uid) {
            throw new Error("This order does not belong to your stall");
        }

        // Validate status
        if (orderData.status !== 'pending') {
            throw new Error("This order is no longer active");
        }

        // Store order data and show confirmation
        scannedOrderId = orderId;
        showConfirmationModal(orderData);

    } catch (error) {
        console.error("Order validation error:", error);
        showAppToast(error.message, "cancelled");

        // Hide loading and stop scanner for invalid QR
        document.getElementById('scanner-loading').classList.remove('show');
        closeGlobalScanner();
    }
}

function showConfirmationModal(orderData) {
    document.getElementById('scanner-loading').classList.remove('show');
    document.getElementById('scanner-modal').style.display = 'none';

    const detailsDiv = document.getElementById('order-details');
    const totalItems = orderData.totalItems || (orderData.items ? orderData.items.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0);
    const customerName = orderData.userName || orderData.customerName || orderData.name || 'N/A';
    const totalAmount = typeof orderData.totalAmount === 'number' ? orderData.totalAmount : (typeof orderData.total === 'number' ? orderData.total : 0);

    detailsDiv.innerHTML = `
        <p><strong>Customer:</strong> ${customerName}</p>
        <p><strong>Order ID:</strong> ${scannedOrderId.substring(0, 8)}</p>
        <p><strong>Items:</strong> ${totalItems} item${totalItems !== 1 ? 's' : ''}</p>
        <p><strong>Total:</strong> RM ${totalAmount.toFixed(2)}</p>
    `;

    document.getElementById('confirmation-modal').style.display = 'flex';
}

window.closeConfirmationModal = function() {
    document.getElementById('confirmation-modal').style.display = 'none';
    scannedOrderId = null;
};

window.confirmCollection = async function() {
    if (!scannedOrderId) return;

    try {
        // Update order status
        const orderRef = doc(db, "orders", scannedOrderId);
        await updateDoc(orderRef, {
            status: 'completed',
            completedAt: Timestamp.now(),
            verifiedByQR: true
        });

        // Close modal
        document.getElementById('confirmation-modal').style.display = 'none';

        // Update local data
        const orderIndex = allOrders.findIndex(o => o.id === scannedOrderId);
        if (orderIndex !== -1) {
            allOrders[orderIndex].status = 'completed';
            allOrders[orderIndex].verifiedByQR = true;
        }

        // Update stats and refresh display
        updateStats();
        const activeTab = document.querySelector('.tab-btn.active').id;
        showTab(activeTab === 'tab-active' ? 'active' : 'history');

        // Show success message
        showAppToast("Order collected successfully!", "collected");

        scannedOrderId = null;

    } catch (error) {
        console.error("Collection confirmation error:", error);
        showAppToast("Error confirming collection: " + error.message, "cancelled");
    }
};

window.closeGlobalScanner = async function() {
    const modal = document.getElementById('scanner-modal');

    if (html5QrScanner) {
        try {
            await html5QrScanner.stop();
            html5QrScanner.clear();
        } catch (error) {
            console.log("Scanner already stopped.");
        }
        html5QrScanner = null;
    }

    if (modal) {
        modal.style.display = 'none';
    }
};

// Play beep sound
function playBeep() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
        console.log("Beep sound not supported");
    }
}



// Open confirmation modal for cancel only
window.openAppModal = function(orderId, action) {
    pendingAction = { orderId, action };

    const confirmBtn = document.getElementById('modal-confirm-btn');

    document.getElementById('modal-msg').innerText =
        `Are you sure you want to cancel this reservation?`;

    confirmBtn.classList.add('is-cancel-type');
    confirmBtn.innerText = "Yes, Cancel Order";

    document.getElementById('custom-modal').style.display = 'flex';
};

// Close modal
window.closeAppModal = function(confirmed) {
    document.getElementById('custom-modal').style.display = 'none';

    if (confirmed && pendingAction) {
        processOrder(pendingAction.orderId, pendingAction.action);
    }

    pendingAction = null;
};

// Process order cancellation
async function processOrder(orderId, action) {
    try {
        const newStatus = action === 'cancelled' ? 'cancelled' : 'completed';
        const timestampField = action === 'cancelled' ? 'cancelledAt' : 'completedAt';

        const orderRef = doc(db, "orders", orderId);

        await updateDoc(orderRef, {
            status: newStatus,
            [timestampField]: Timestamp.now()
        });

        const orderIndex = allOrders.findIndex(o => o.id === orderId);

        if (orderIndex !== -1) {
            allOrders[orderIndex].status = newStatus;
        }

        updateStats();

        if (action === 'cancelled') {
            showAppToast("Order has been cancelled.", "cancelled");
        } else {
            showAppToast("Order marked as collected!", "collected");
        }

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

    if (!container) {
        alert(message);
        return;
    }

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
};

// Optional: close scanner when leaving page
window.addEventListener('beforeunload', async () => {
    if (html5QrScanner) {
        try {
            await html5QrScanner.stop();
        } catch (error) {}
    }
});