import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
// Notice we added ALL the missing functions in the line below:
import {
    doc,
    getDoc,
    collection,
    query,
    where,
    getDocs,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let itemIdToDelete = null;

// --- 1. INITIAL LOAD & AUTH ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            // Load Profile Name
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const vendorNameElement = document.getElementById('vendorNameDisplay');
                if (vendorNameElement) vendorNameElement.innerText = docSnap.data().shopName;
            }

            // Load the Menu
            loadVendorMenu(user.uid);
        } catch (error) {
            console.error("Error loading dashboard:", error);
        }
    } else {
        window.location.href = 'vendorlogin.html';
    }
});

// --- 2. LOAD MENU FROM FIRESTORE ---
async function loadVendorMenu(vendorId) {
    const menuGrid = document.getElementById('menuGrid');
    if (!menuGrid) return;

    try {
        const q = query(collection(db, "foodItems"), where("vendorId", "==", vendorId));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            menuGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
                <p style="color: #666; font-style: italic;">No surplus meals have been posted yet.</p>
            </div>
        `;
            return;
        }

        menuGrid.innerHTML = "";
        querySnapshot.forEach((doc) => {
            const item = doc.data();
            const id = doc.id;

            menuGrid.innerHTML += `
                <div class="menu-card" id="card-${id}">
                    <div class="menu-photo" style="background-image: url('${item.imageURL || 'image/nasilemak.jpg'}');">
                        <div class="category-badge">${item.category}</div>
                    </div>
                    <div class="menu-details">
                        <h3>${item.foodName}</h3>
                        <p class="menu-desc">${item.description}</p>
                        <div class="price-row">
                            <div>
                                <span class="old-price">RM ${parseFloat(item.originalPrice || 0).toFixed(2)}</span>
                                <span class="price-tag">RM ${parseFloat(item.discountPrice || 0).toFixed(2)}</span>
                            </div>
                            <span class="stock-tag">${item.quantity} Left</span>
                        </div>
                        <div class="card-actions">
                            <button class="btn-action edit-btn" onclick="window.location.href='vendor-editmeals.html?id=${id}'">Edit Details</button>
                            <button class="btn-action remove-btn" data-id="${id}">Remove</button>
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        console.error("Error loading menu:", error);
    }
}

// --- 3. DELETE LOGIC ---
const deleteModal = document.getElementById('deleteModal');

document.getElementById('menuGrid')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-btn')) {
        itemIdToDelete = e.target.getAttribute('data-id');
        if (deleteModal) deleteModal.style.display = 'flex';
    }
});

document.getElementById('cancelDelete')?.addEventListener('click', () => {
    if (deleteModal) deleteModal.style.display = 'none';
    itemIdToDelete = null;
});

document.getElementById('confirmDelete')?.addEventListener('click', async () => {
    if (itemIdToDelete) {
        try {
            await deleteDoc(doc(db, "foodItems", itemIdToDelete));
            const card = document.getElementById(`card-${itemIdToDelete}`);
            if (card) {
                card.classList.add('fade-out');
                setTimeout(() => {
                    card.remove();
                    if (deleteModal) deleteModal.style.display = 'none';
                }, 400);
            }
        } catch (error) {
            alert("Error deleting: " + error.message);
        }
    }
});