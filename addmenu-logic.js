/**
 * GOOGLE MAP CALLBACK
 */
window.initVendorLocationMap = async function () {
    console.log("Google Maps callback triggered.");

    window.mapReadyToInit = true;

    if (typeof startMapInitialization === "function") {
        await startMapInitialization();
    }
};

import { auth, db } from './firebase-config.js';

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
    collection,
    addDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let googleMap = null;
let mapMarker = null;
let currentVendorId = null;

let selectedLocation = {
    latitude: 3.1390,
    longitude: 101.6869
};

/**
 * AUTH CHECK
 */
onAuthStateChanged(auth, (user) => {

    if (user) {
        currentVendorId = user.uid;
    } else {
        window.location.href = 'vendorlogin.html';
    }

});

/**
 * INITIALIZE GOOGLE MAP
 */
async function startMapInitialization() {

    const mapContainer = document.getElementById('vendorLocationMap');

    if (!mapContainer || googleMap) return;

    try {

        const { Map } = await google.maps.importLibrary("maps");

        googleMap = new Map(mapContainer, {
            center: {
                lat: selectedLocation.latitude,
                lng: selectedLocation.longitude
            },
            zoom: 15,
            mapTypeControl: false,
        });

        /**
         * NORMAL MARKER
         */
        mapMarker = new google.maps.Marker({
            position: {
                lat: selectedLocation.latitude,
                lng: selectedLocation.longitude
            },
            map: googleMap,
            draggable: true,
            title: "Your Stall Location"
        });

        /**
         * DRAG MARKER EVENT
         */
        mapMarker.addListener("dragend", () => {

            const pos = mapMarker.getPosition();

            updateLocationState(
                pos.lat(),
                pos.lng()
            );

        });

        /**
         * CLICK MAP EVENT
         */
        googleMap.addListener("click", (e) => {

            mapMarker.setPosition(e.latLng);

            updateLocationState(
                e.latLng.lat(),
                e.latLng.lng()
            );

        });

        console.log("Google Map initialized successfully.");

    } catch (error) {

        console.error("Map failed to load:", error);

        Swal.fire({
            icon: 'error',
            title: 'Google Map Error',
            text: 'Check your API key and Google Cloud configuration.'
        });
    }
}

/**
 * UPDATE LOCATION STATE
 */
function updateLocationState(lat, lng) {

    selectedLocation.latitude = lat;
    selectedLocation.longitude = lng;

    const preview = document.getElementById('locationPreview');

    if (preview) {

        preview.innerHTML = `
            <strong>Pinned:</strong>
            ${lat.toFixed(5)},
            ${lng.toFixed(5)}
        `;
    }
}

/**
 * HANDLE MAP READY
 */
if (window.mapReadyToInit) {
    startMapInitialization();
}

/**
 * GPS BUTTON
 */
document.getElementById('useCurrentLocationBtn')
?.addEventListener('click', () => {

    if (!googleMap || !mapMarker) {

        Swal.fire({
            icon: 'error',
            title: 'Map Not Ready',
            text: 'Ensure your API key is valid.'
        });

        return;
    }

    if (navigator.geolocation) {

        Swal.fire({
            title: 'Finding your location...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        navigator.geolocation.getCurrentPosition(

            (pos) => {

                Swal.close();

                const newPos = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                };

                googleMap.setCenter(newPos);

                mapMarker.setPosition(newPos);

                updateLocationState(
                    newPos.lat,
                    newPos.lng
                );
            },

            () => {

                Swal.close();

                Swal.fire({
                    icon: 'error',
                    title: 'Location Error',
                    text: 'Location access denied.'
                });
            }
        );
    }
});

/**
 * SAVE MEAL
 */
const saveBtn = document.getElementById('saveMealBtn');

if (saveBtn) {

    saveBtn.addEventListener('click', async () => {

        if (!currentVendorId) {

            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Please log in first.'
            });

            return;
        }

        const mealName =
            document.getElementById('mealName').value;

        const newPrice =
            document.getElementById('newPrice').value;

        const qty =
            document.getElementById('qty').value;

        const description =
            document.getElementById('description').value;

        const category =
            document.getElementById('category').value;

        const oldPrice =
            document.getElementById('oldPrice').value;

        const stallAddress =
            document.getElementById('stallAddress').value;

        if (!mealName || !newPrice || !qty) {

            Swal.fire({
                icon: 'warning',
                title: 'Missing Information',
                text: 'Please fill all required fields.'
            });

            return;
        }

        try {

            Swal.fire({
                title: 'Saving Meal...',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            await addDoc(collection(db, "foodItems"), {

                vendorId: currentVendorId,

                foodName: mealName,

                category: category,

                description: description,

                originalPrice: oldPrice,

                discountPrice: newPrice,

                quantity: qty,

                stallAddress: stallAddress,

                latitude: selectedLocation.latitude,

                longitude: selectedLocation.longitude,

                createdAt: new Date()
            });

            Swal.fire({
                icon: 'success',
                title: 'Meal Added Successfully!'
            }).then(() => {

                window.location.href = 'vendordashboard.html';

            });

        } catch (error) {

            Swal.fire({
                icon: 'error',
                title: 'Save Failed',
                text: error.message
            });

            console.error(error);
        }
    });
}