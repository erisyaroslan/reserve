import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let allMeals = [];

// Auth check
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loadMeals();
    } else {
        window.location.href = 'login.html';
    }
});

// Load all available meals from Firebase
async function loadMeals() {
    try {
        const mealsQuery = collection(db, "foodItems");
        const snapshot = await getDocs(mealsQuery);
        allMeals = [];

        console.log('Total documents found:', snapshot.size);

        snapshot.forEach((doc) => {
            const data = doc.data();
            console.log('Raw meal data:', data);
            
            // Convert quantity to number - handle both string and number types
            let quantity = 0;
            if (typeof data.quantity === 'string') {
                quantity = parseInt(data.quantity) || 0;
            } else if (typeof data.quantity === 'number') {
                quantity = data.quantity;
            }
            
            console.log(`${data.foodName}: quantity = ${quantity} (type: ${typeof quantity})`);
            
            // Only add meals with stock > 0
            if (quantity > 0) {
                allMeals.push({
                    id: doc.id,
                    ...data,
                    quantity: quantity // Store as number
                });
            } else {
                console.log(`Filtering out ${data.foodName} - quantity: ${quantity}`);
            }
        });

        console.log('Meals with stock > 0:', allMeals);

        displayMeals(allMeals);
    } catch (error) {
        console.error("Error loading meals:", error);
        const container = document.getElementById('mealsContainer');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: #d32f2f;">
                    <h3>Error loading meals</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }
}

// Display meals in the UI
function displayMeals(meals) {
    const container = document.getElementById('mealsContainer');
    
    if (!container) {
        console.error('mealsContainer not found!');
        return;
    }

    if (meals.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #777;">
                <div style="font-size: 3rem; margin-bottom: 15px;">🍽️</div>
                <h3 style="font-size: 1.3rem; color: #2f2f2f; margin-bottom: 8px;">No meals available</h3>
                <p>Check back later for surplus meals from vendors!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = meals.map(meal => `
        <div class="meal-card" data-category="${meal.category || 'Other'}">
            <div class="meal-photo" style="background-image: url('${meal.imageURL || 'image/placeholder.jpg'}')"></div>
            <div class="meal-info">
                <h3>${meal.foodName}</h3>
                <p class="price">
                    ${meal.originalPrice ? `<span class="old-price">RM ${parseFloat(meal.originalPrice).toFixed(2)}</span>` : ''}
                    RM ${parseFloat(meal.discountPrice).toFixed(2)}
                </p>
                <p class="meal-cat">${meal.category || 'Other'} • ${meal.quantity} left</p>
                ${meal.description ? `<p class="meal-desc">${meal.description}</p>` : ''}
            </div>
            <button class="btn-add" onclick="addToCart('${meal.id}')">Add +</button>
        </div>
    `).join('');
}

// Category filtering
const categories = document.querySelectorAll(".category");

categories.forEach(category => {
    category.addEventListener("click", () => {
        // Remove active from all
        categories.forEach(c => c.classList.remove("active"));
        category.classList.add("active");

        const selectedCategory = category.dataset.category;

        if (selectedCategory === "All") {
            displayMeals(allMeals);
        } else {
            const filtered = allMeals.filter(meal => meal.category === selectedCategory);
            displayMeals(filtered);
        }
    });
});

// Search functionality
const searchBox = document.querySelector(".search-box");

if (searchBox) {
    searchBox.addEventListener("input", (e) => {
        const searchTerm = e.target.value.toLowerCase();
        
        const filtered = allMeals.filter(meal => 
            meal.foodName.toLowerCase().includes(searchTerm) ||
            (meal.description && meal.description.toLowerCase().includes(searchTerm)) ||
            (meal.category && meal.category.toLowerCase().includes(searchTerm))
        );

        displayMeals(filtered);
        
        // Reset to "All" category when searching
        if (searchTerm) {
            categories.forEach(c => c.classList.remove("active"));
        }
    });
}

// Add to cart function
window.addToCart = async function(mealId) {
    if (!currentUser) {
        alert('Please login first!');
        return;
    }

    try {
        // Verify current stock from database
        const foodRef = doc(db, "foodItems", mealId);
        const foodDoc = await getDoc(foodRef);
        
        if (!foodDoc.exists()) {
            alert('This meal is no longer available!');
            loadMeals(); // Refresh the list
            return;
        }
        
        const currentStock = parseInt(foodDoc.data().quantity) || 0;
        
        if (currentStock <= 0) {
            alert('This meal is out of stock!');
            loadMeals(); // Refresh the list
            return;
        }

        // Get existing cart from localStorage
        let cart = JSON.parse(localStorage.getItem('userCart') || '[]');
        
        // Find the meal
        const meal = allMeals.find(m => m.id === mealId);
        
        if (!meal) {
            alert('Meal not found!');
            return;
        }

        // Check if already in cart
        const existingItem = cart.find(item => item.id === mealId);
        
        if (existingItem) {
            // Check if we can increase quantity
            if (existingItem.quantity < currentStock) {
                existingItem.quantity += 1;
                existingItem.maxStock = currentStock; // Update max stock
            } else {
                alert('Maximum available stock reached!');
                return;
            }
        } else {
            // Fetch vendor info
            let vendorInfo = { shopName: 'Unknown Vendor', location: '' };
            if (meal.vendorId) {
                try {
                    const vendorDoc = await getDoc(doc(db, "users", meal.vendorId));
                    if (vendorDoc.exists()) {
                        const data = vendorDoc.data();
                        vendorInfo = {
                            shopName: data.shopName || 'Unknown Vendor',
                            location: data.location || ''
                        };
                    }
                } catch (error) {
                    console.error('Error fetching vendor:', error);
                }
            }

            // Add new item
            cart.push({
                id: mealId,
                foodName: meal.foodName,
                discountPrice: meal.discountPrice,
                originalPrice: meal.originalPrice,
                imageURL: meal.imageURL,
                category: meal.category,
                vendorId: meal.vendorId,
                vendorInfo: vendorInfo,
                maxStock: currentStock, // Use current stock from database
                quantity: 1
            });
        }

        // Save to localStorage
        localStorage.setItem('userCart', JSON.stringify(cart));

        // Show feedback
        showNotification('Added to cart!', 'success');
        
    } catch (error) {
        console.error('Error adding to cart:', error);
        alert('Failed to add to cart. Please try again.');
    }
}

// Simple notification function
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
    }, 2000);
}

// Add animation styles
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
    .old-price {
        text-decoration: line-through;
        color: #bbb;
        font-size: 0.85rem;
        margin-right: 6px;
    }
    .meal-desc {
        font-size: 0.85rem;
        color: #999;
        margin-top: 4px;
    }
`;
document.head.appendChild(style);