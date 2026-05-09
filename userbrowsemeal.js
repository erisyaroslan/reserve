import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let allMeals = [];
let lastRenderedMeals = [];
let userLocation = null;

const GEMINI_MODEL = "gemini-1.5-flash";
const AI_MAX_MEALS = 40;

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
        const rawMeals = [];
        const vendorIds = new Set();

        console.log('Total documents found:', snapshot.size);

        snapshot.forEach((doc) => {
            const data = doc.data();
            console.log('Raw meal data:', data);

            let quantity = 0;
            if (typeof data.quantity === 'string') {
                quantity = parseInt(data.quantity) || 0;
            } else if (typeof data.quantity === 'number') {
                quantity = data.quantity;
            }

            console.log(`${data.foodName}: quantity = ${quantity} (type: ${typeof quantity})`);

            if (quantity > 0) {
                rawMeals.push({
                    id: doc.id,
                    ...data,
                    quantity: quantity
                });
                if (data.vendorId) {
                    vendorIds.add(data.vendorId);
                }
            } else {
                console.log(`Filtering out ${data.foodName} - quantity: ${quantity}`);
            }
        });

        const vendorInfoMap = new Map();
        await Promise.all(Array.from(vendorIds).map(async (vendorId) => {
            try {
                const vendorDoc = await getDoc(doc(db, "users", vendorId));
                if (vendorDoc.exists()) {
                    const vendorData = vendorDoc.data();
                    vendorInfoMap.set(vendorId, {
                        shopName: vendorData.shopName || 'Vendor',
                        location: vendorData.location || ''
                    });
                }
            } catch (error) {
                console.warn('Unable to load vendor info for', vendorId, error);
            }
        }));

        allMeals = rawMeals.map((meal) => {
            const vendorInfo = vendorInfoMap.get(meal.vendorId) || {};
            return {
                ...meal,
                vendorName: vendorInfo.shopName || meal.vendorName || 'Vendor',
                vendorLocation: vendorInfo.location || meal.vendorLocation || ''
            };
        });

        if (userLocation) {
            updateAllMealDistances();
        }

        console.log('Meals with stock > 0:', allMeals);
        window.allMeals = allMeals;

        // Validate cart against available meals
        let cart = JSON.parse(localStorage.getItem('userCart') || '[]');
        const originalCartLength = cart.length;
        cart = cart.filter(cartItem => {
            const meal = allMeals.find(m => m.id === cartItem.id);
            return meal && meal.quantity > 0;
        });
        if (cart.length < originalCartLength) {
            localStorage.setItem('userCart', JSON.stringify(cart));
            showNotification(`${originalCartLength - cart.length} item(s) removed from cart as they are no longer available.`, 'warning');
        }

        displayMeals(allMeals);
        if (window.refreshVendorMap) window.refreshVendorMap();
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
    const sortedMeals = sortMealsByDistance(meals);
    lastRenderedMeals = sortedMeals;

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

    container.innerHTML = sortedMeals.map(meal => `
        <div class="meal-card" data-category="${meal.category || 'Other'}">
            <div class="meal-photo" style="background-image: url('${meal.imageURL || 'image/placeholder.jpg'}')"></div>
            <div class="meal-info">
                <h3>${meal.foodName}</h3>
                <p class="price">
                    ${meal.originalPrice ? `<span class="old-price">RM ${parseFloat(meal.originalPrice).toFixed(2)}</span>` : ''}
                    RM ${parseFloat(meal.discountPrice).toFixed(2)}
                </p>
                <p class="meal-cat">${meal.category || 'Other'} • ${meal.quantity} left${meal.distance != null ? ` • ${formatDistance(meal.distance)}` : ''}</p>
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

function sortMealsByDistance(meals) {
    if (!userLocation) return meals;
    return [...meals].sort((a, b) => {
        const aDistance = a.distance != null ? a.distance : Number.MAX_VALUE;
        const bDistance = b.distance != null ? b.distance : Number.MAX_VALUE;
        return aDistance - bDistance;
    });
}

function computeMealDistance(meal) {
    const lat = parseFloat(meal.latitude);
    const lng = parseFloat(meal.longitude);
    if (!userLocation || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return distanceBetween(userLocation.lat, userLocation.lng, lat, lng);
}

function updateAllMealDistances() {
    if (!userLocation) return;
    allMeals.forEach((meal) => {
        meal.distance = computeMealDistance(meal);
    });
}

function distanceBetween(lat1, lng1, lat2, lng2) {
    const toRad = (value) => value * Math.PI / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function formatDistance(distance) {
    if (distance == null) return '';
    return distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`;
}

window.updateMealDistances = updateAllMealDistances;

function addAIMessage(text, role = 'bot') {
    const box = document.getElementById('aiMessages');
    if (!box) return;

    const msg = document.createElement('div');
    msg.className = `ai-msg ${role}`;
    msg.textContent = text;
    box.appendChild(msg);
    box.scrollTop = box.scrollHeight;
}

function setAllCategoryActive() {
    categories.forEach(c => c.classList.remove("active"));
    const allCategory = Array.from(categories).find(c => c.dataset.category === "All");
    if (allCategory) allCategory.classList.add("active");
}

function applyMealIdsFilter(mealIds) {
    if (!Array.isArray(mealIds) || mealIds.length === 0) {
        displayMeals([]);
        return;
    }

    const idSet = new Set(mealIds);
    const filtered = allMeals.filter(meal => idSet.has(meal.id));
    displayMeals(filtered);
}

async function getOrderHistoryProfile() {
    if (!currentUser) return { summary: "No signed-in user history." };

    const ordersQuery = query(
        collection(db, "orders"),
        where("userId", "==", currentUser.uid)
    );
    const snapshot = await getDocs(ordersQuery);
    const itemCount = {};
    let totalOrders = 0;

    snapshot.forEach((docSnap) => {
        const order = docSnap.data();
        if (!order.items || !Array.isArray(order.items)) return;
        totalOrders += 1;

        order.items.forEach((item) => {
            const key = (item.foodName || '').trim();
            if (!key) return;
            itemCount[key] = (itemCount[key] || 0) + (item.quantity || 1);
        });
    });

    const topItems = Object.entries(itemCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, qty]) => `${name} (${qty})`);

    return {
        totalOrders,
        topItems,
        summary: totalOrders
            ? `Total orders: ${totalOrders}. Frequent meals: ${topItems.join(", ")}`
            : "No order history yet."
    };
}

function extractJsonFromText(text) {
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch (_) {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try {
            return JSON.parse(match[0]);
        } catch (error) {
            return null;
        }
    }
}

function normalizeAIResult(rawResult) {
    if (!rawResult || typeof rawResult !== 'object') return null;
    const action = String(rawResult.action || 'none').toLowerCase();
    const validAction = ['filter', 'recommend', 'reset', 'none'].includes(action) ? action : 'none';
    const mealIds = Array.isArray(rawResult.mealIds) ? rawResult.mealIds.filter(Boolean) : [];
    const mealNames = Array.isArray(rawResult.mealNames) ? rawResult.mealNames.filter(Boolean) : [];
    const reply = typeof rawResult.reply === 'string' ? rawResult.reply : '';
    return { action: validAction, mealIds, mealNames, reply };
}

function scoreMealByPrompt(meal, promptLower, historyKeywords = [], promptTokens = []) {
    let score = 0;
    const name = String(meal.foodName || '').toLowerCase();
    const category = String(meal.category || '').toLowerCase();
    const desc = String(meal.description || '').toLowerCase();
    const price = Number(meal.discountPrice || 0);
    const stock = Number(meal.quantity || 0);

    if (name.includes(promptLower) || category.includes(promptLower) || desc.includes(promptLower)) score += 8;

    promptTokens.forEach((token) => {
        if (token.length < 3) return;
        if (name.includes(token)) score += 3;
        if (category.includes(token)) score += 2;
        if (desc.includes(token)) score += 1;
    });

    if (promptLower.includes('cheap') || promptLower.includes('budget') || promptLower.includes('under rm') || promptLower.includes('under')) {
        if (price > 0 && price <= 10) score += 5;
        else if (price <= 15) score += 2;
    }
    if (promptLower.includes('protein')) {
        if (/chicken|beef|egg|fish|tofu|protein/.test(`${name} ${desc}`)) score += 5;
    }
    if (promptLower.includes('snack') && category.includes('snack')) score += 4;
    if (promptLower.includes('western') && category.includes('western')) score += 4;
    if (promptLower.includes('hot') && category.includes('hot')) score += 4;
    if (promptLower.includes('healthy') || promptLower.includes('low carb') || promptLower.includes('low-carb')) {
        if (/salad|grill|veggie|vegetable|steam|tofu/.test(`${name} ${desc}`)) score += 4;
    }

    historyKeywords.forEach((kw) => {
        if (kw && (name.includes(kw) || desc.includes(kw))) score += 3;
    });

    if (stock > 0) score += 1;
    return score;
}

function localFallbackAI(userPrompt, historyProfile = { topItems: [] }) {
    const promptLower = String(userPrompt || '').toLowerCase().trim();
    const promptTokens = promptLower
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
        .filter(token => !['show', 'me', 'for', 'with', 'that', 'this', 'from', 'based', 'please', 'meal', 'meals'].includes(token));

    const historyKeywords = (historyProfile.topItems || [])
        .map(item => String(item).split(' (')[0].toLowerCase())
        .flatMap(name => name.split(/\s+/))
        .filter(Boolean)
        .slice(0, 12);

    if (!promptLower) {
        return {
            action: 'none',
            mealIds: [],
            reply: 'Please type what kind of meals you want.'
        };
    }

    if (/reset|clear|show all|remove filter/.test(promptLower)) {
        return {
            action: 'reset',
            mealIds: [],
            reply: 'Done. I reset the meal list to show everything available.'
        };
    }

    const scored = allMeals
        .map(meal => ({ id: meal.id, score: scoreMealByPrompt(meal, promptLower, historyKeywords, promptTokens) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

    const mealIds = scored.map(item => item.id);
    const recommendationIntent = /recommend|suggest|for me|history|favorite|favourite/.test(promptLower);
    const action = recommendationIntent ? 'recommend' : 'filter';

    if (!mealIds.length) {
        return {
            action: 'none',
            mealIds: [],
            reply: 'I could not find a close match for that prompt. Try adding category, price, or nutrition preference.'
        };
    }

    return {
        action,
        mealIds,
        reply: recommendationIntent
            ? 'Here are personalized picks based on your request and order history.'
            : 'I filtered meals based on your prompt.'
    };
}

function mapMealNamesToIds(mealNames = []) {
    if (!Array.isArray(mealNames) || !mealNames.length) return [];
    const normalizedMeals = allMeals.map((meal) => ({
        id: meal.id,
        name: String(meal.foodName || '').toLowerCase().trim()
    }));

    const ids = [];
    mealNames.forEach((rawName) => {
        const target = String(rawName || '').toLowerCase().trim();
        if (!target) return;

        const exact = normalizedMeals.find(item => item.name === target);
        if (exact) {
            ids.push(exact.id);
            return;
        }

        const partial = normalizedMeals.find(item => item.name.includes(target) || target.includes(item.name));
        if (partial) ids.push(partial.id);
    });

    return Array.from(new Set(ids));
}

function formatMealNames(mealIds = []) {
    const names = mealIds
        .map((id) => allMeals.find((meal) => meal.id === id)?.foodName)
        .filter(Boolean)
        .slice(0, 5);

    return names.length ? names.join(', ') : '';
}

async function askGeminiForMealAction(userPrompt) {
    const apiKey = (window.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
        throw new Error("Gemini API key missing.");
    }

    const historyProfile = await getOrderHistoryProfile();
    const mealsContext = allMeals.slice(0, AI_MAX_MEALS).map((meal) => ({
        id: meal.id,
        foodName: meal.foodName,
        category: meal.category || "Other",
        discountPrice: Number(meal.discountPrice || 0),
        description: meal.description || ""
    }));

    const prompt = `
You are an assistant for a food rescue app.
User request: "${userPrompt}"

Available meals JSON:
${JSON.stringify(mealsContext)}

Order history profile:
${JSON.stringify(historyProfile)}

Return ONLY JSON with shape:
{
  "action": "filter" | "recommend" | "reset" | "none",
  "mealIds": ["mealDocId1", "mealDocId2"],
  "mealNames": ["Exact Meal Name 1", "Exact Meal Name 2"],
  "reply": "short helpful reply for the user"
}

Rules:
- For filtering/recommending, choose from available mealIds only.
- Also include mealNames that match those ids.
- If user asks to clear/reset, set action to "reset".
- Keep reply concise, friendly, and practical.
`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        })
    });

    if (!response.ok) {
        const failText = await response.text();
        throw new Error(`Gemini request failed: ${failText}`);
    }

    const result = await response.json();
    const parts = result?.candidates?.[0]?.content?.parts || [];
    const combinedText = parts.map(p => p?.text || '').join('\n').trim();
    const parsed = extractJsonFromText(combinedText);
    if (!parsed) throw new Error("Gemini response was not valid JSON.");
    const normalized = normalizeAIResult(parsed);
    if (!normalized) throw new Error("Gemini response could not be normalized.");
    return normalized;
}

async function handleAIPrompt(userPrompt) {
    addAIMessage(userPrompt, 'user');

    if (!allMeals.length) {
        addAIMessage("Meals are still loading. Please try again in a moment.");
        return;
    }

    try {
        addAIMessage("Thinking...", 'bot');
        const thinkingEl = document.querySelector('#aiMessages .ai-msg.bot:last-child');
        const historyProfile = await getOrderHistoryProfile();
        let aiResult;

        try {
            aiResult = await askGeminiForMealAction(userPrompt);
        } catch (geminiError) {
            console.warn('Gemini failed, using local fallback:', geminiError);
            aiResult = localFallbackAI(userPrompt, historyProfile);
        }

        const action = aiResult.action || "none";
        let mealIds = Array.isArray(aiResult.mealIds) ? aiResult.mealIds : [];
        if (!mealIds.length && Array.isArray(aiResult.mealNames) && aiResult.mealNames.length) {
            mealIds = mapMealNamesToIds(aiResult.mealNames);
        }
        if ((action === 'filter' || action === 'recommend') && !mealIds.length) {
            const fallback = localFallbackAI(userPrompt, historyProfile);
            mealIds = fallback.mealIds || [];
        }

        if (action === "reset") {
            setAllCategoryActive();
            displayMeals(allMeals);
        } else if (action === "filter" || action === "recommend") {
            setAllCategoryActive();
            applyMealIdsFilter(mealIds);
        }

        if (thinkingEl) thinkingEl.remove();
        if (action === "filter" || action === "recommend") {
            const shownNames = formatMealNames(mealIds);
            const baseReply = aiResult.reply || "Done. I updated your meals list.";
            const finalReply = shownNames ? `${baseReply} Showing: ${shownNames}.` : baseReply;
            addAIMessage(finalReply);
        } else {
            addAIMessage(aiResult.reply || "Done. I updated your meals list.");
        }
    } catch (error) {
        console.error('AI assistant error:', error);
        const thinkingEl = document.querySelector('#aiMessages .ai-msg.bot:last-child');
        if (thinkingEl && thinkingEl.textContent === "Thinking...") thinkingEl.remove();
        addAIMessage("I couldn't process that right now. Check Gemini API key/config and try again.");
    }
}

function initAIAssistant() {
    const toggle = document.getElementById('aiAssistantToggle');
    const panel = document.getElementById('aiAssistantPanel');
    const form = document.getElementById('aiAssistantForm');
    const input = document.getElementById('aiAssistantInput');
    const chips = document.querySelectorAll('.ai-chip');

    if (!toggle || !panel || !form || !input) return;

    toggle.addEventListener('click', () => {
        panel.classList.toggle('open');
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const prompt = input.value.trim();
        if (!prompt) return;
        input.value = '';
        await handleAIPrompt(prompt);
    });

    chips.forEach((chip) => {
        chip.addEventListener('click', async () => {
            const prompt = chip.dataset.aiPrompt || '';
            if (!prompt) return;
            await handleAIPrompt(prompt);
        });
    });
}

// Add to cart function
window.addToCart = async function (mealId) {
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
                imageURL: meal.imageURL || null,
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAIAssistant);
} else {
    initAIAssistant();
}