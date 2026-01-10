import { db } from './firebase-config.js';
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";

const container = document.getElementById('reservations-container');

//Start the Real-Time Listener
onSnapshot(collection(db, "reservations"), (snapshot) => {
    container.innerHTML = ""; // Clear the "Loading" text

    if (snapshot.empty) {
        container.innerHTML = "<p>No active reservations yet.</p>";
        return;
    }

    snapshot.forEach((orderDoc) => {
        const order = orderDoc.data();
        const id = orderDoc.id;

        //Create the HTML for the card
        const cardHTML = `
            <div class="res-card ${order.status !== 'active' ? 'is-history' : ''}" id="order-${id}">
                <div class="student-info">
                    <h4>${order.studentName}</h4>
                    <p>ID: ${order.studentID}</p>
                </div>
                <div class="order-details">
                    <strong>${order.foodItem}</strong>
                    <span class="pickup-time">Pickup: ${order.pickupTime}</span>
                </div>
                <div class="actions">
                    ${order.status === 'active' ? `
                        <button class="btn-collect" onclick="updateStatus('${id}', 'collected')">Collected</button>
                        <button class="btn-cancel" onclick="updateStatus('${id}', 'cancelled')">Cancel</button>
                    ` : `<span class="status-tag">${order.status}</span>`}
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHTML);
    });
});

//Function to update status in the database
window.updateStatus = async (id, newStatus) => {
    const orderRef = doc(db, "reservations", id);
    try {
        await updateDoc(orderRef, { status: newStatus });
        alert(`Order marked as ${newStatus}!`);
    } catch (error) {
        console.error("Error updating database:", error);
    }
};