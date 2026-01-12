import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;

// Auth check
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loadDashboardData();
    } else {
        window.location.href = 'login.html';
    }
});

// Load all dashboard data
async function loadDashboardData() {
    try {
        // Get user data for name
        const userDoc = await getDocs(query(collection(db, "users"), where("__name__", "==", currentUser.uid)));
        let userName = "User";
        if (!userDoc.empty) {
            userName = userDoc.docs[0].data().name || "User";
        }
        
        // Update welcome message
        const welcomeTitle = document.querySelector('.welcome-section h1');
        if (welcomeTitle) {
            welcomeTitle.textContent = `Welcome back, ${userName}!`;
        }

        // Get all orders for this user (remove orderBy temporarily if index not created)
        const ordersQuery = query(
            collection(db, "orders"),
            where("userId", "==", currentUser.uid)
            // orderBy("createdAt", "desc") // Uncomment after creating index
        );
        
        const snapshot = await getDocs(ordersQuery);
        const orders = [];

        snapshot.forEach((doc) => {
            orders.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Sort manually if orderBy is commented out
        orders.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
            return dateB - dateA; // Descending order
        });

        console.log('Total orders loaded:', orders.length);
        console.log('Orders:', orders);

        // Calculate stats
        calculateStats(orders);
        
        // Display recent orders (last 5)
        displayRecentOrders(orders.slice(0, 5));

    } catch (error) {
        console.error("Error loading dashboard:", error);
    }
}

// Calculate statistics
function calculateStats(orders) {
    // Filter completed orders only
    const completedOrders = orders.filter(order => order.status === 'completed');
    
    console.log('Completed orders:', completedOrders.length);
    
    // Calculate meals rescued (total completed orders)
    const mealsRescued = completedOrders.length;
    
    // Calculate money saved
    let totalSaved = 0;
    
    completedOrders.forEach((order, orderIndex) => {
        console.log(`\nOrder ${orderIndex + 1}:`, order.id);
        
        if (order.items && order.items.length > 0) {
            order.items.forEach((item, itemIndex) => {
                // FIXED: Use correct field names from your order structure
                // In your orders: item.price = discountPrice, item.originalPrice = original price
                const originalPrice = parseFloat(item.originalPrice || 0);
                const discountPrice = parseFloat(item.price || 0); // item.price is the discount price in your orders
                const quantity = item.quantity || 1;
                
                console.log(`  Item ${itemIndex + 1}: ${item.foodName}`);
                console.log(`    Original Price: RM ${originalPrice}`);
                console.log(`    Discount Price: RM ${discountPrice}`);
                console.log(`    Quantity: ${quantity}`);
                
                if (originalPrice > 0 && discountPrice > 0 && originalPrice > discountPrice) {
                    const savedPerItem = (originalPrice - discountPrice) * quantity;
                    totalSaved += savedPerItem;
                    console.log(`    Saved: RM ${savedPerItem.toFixed(2)}`);
                } else {
                    console.log(`    No savings (originalPrice: ${originalPrice}, discountPrice: ${discountPrice})`);
                }
            });
        }
    });

    console.log(`\nTotal Money Saved: RM ${totalSaved.toFixed(2)}`);

    // Update stats display
    const mealsRescuedEl = document.querySelector('.stat-card:nth-child(1) span');
    if (mealsRescuedEl) {
        mealsRescuedEl.textContent = mealsRescued;
    }

    const moneySavedEl = document.querySelector('.stat-card:nth-child(2) span');
    if (moneySavedEl) {
        moneySavedEl.textContent = `RM ${totalSaved.toFixed(2)}`;
    }
}

// Display recent orders
function displayRecentOrders(orders) {
    const ordersContainer = document.querySelector('.recent-orders-container');
    
    if (!ordersContainer) {
        console.error('Recent orders container not found');
        return;
    }

    if (orders.length === 0) {
        ordersContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #777;">
                <p>No orders yet. <a href="userbrowsemeal.html" style="color: #2E7D32; font-weight: 600;">Browse meals</a> to get started!</p>
            </div>
        `;
        return;
    }

    ordersContainer.innerHTML = orders.map(order => {
        // Format date
        const orderDate = order.createdAt?.toDate ? 
            formatDate(order.createdAt.toDate()) : 
            'Unknown Date';

        // Get first item name (or combine if multiple)
        let itemName = 'Order';
        if (order.items && order.items.length > 0) {
            itemName = order.items[0].foodName;
            if (order.items.length > 1) {
                itemName += ` +${order.items.length - 1} more`;
            }
        }

        // Get status styling
        const statusColors = {
            pending: { bg: '#FFF3E0', color: '#E65100', text: 'Pending' },
            completed: { bg: '#E8F5E9', color: '#2E7D32', text: 'Completed' },
            cancelled: { bg: '#FFEBEE', color: '#C62828', text: 'Cancelled' }
        };
        
        const status = order.status || 'pending';
        const statusStyle = statusColors[status] || statusColors.pending;

        return `
            <div class="order-card">
                <div class="order-info">
                    <h4>${itemName}</h4>
                    <p>${order.vendorName || 'Unknown Vendor'} • ${orderDate}</p>
                </div>
                <div style="text-align: right;">
                    <div class="order-price">RM ${parseFloat(order.totalAmount || 0).toFixed(2)}</div>
                    <div class="status" style="background: ${statusStyle.bg}; color: ${statusStyle.color};">
                        ${statusStyle.text}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Format date helper
function formatDate(date) {
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'short'
    });
}