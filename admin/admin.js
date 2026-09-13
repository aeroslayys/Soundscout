const API_BASE = "http://localhost:4000/api";


// ============================================================
// AUTH
// ============================================================

const token =
    localStorage.getItem("soundscout_token");

const storedUser =
    localStorage.getItem("soundscout_user");


if (!token || !storedUser) {

    window.location.href = "../index.html";

}


let user;

try {

    user = JSON.parse(storedUser);

} catch (err) {

    localStorage.removeItem("soundscout_token");
    localStorage.removeItem("soundscout_user");

    window.location.href = "../index.html";
}


if (!user || user.admin !== true) {

    window.location.href = "../home/home.html";

}


// ============================================================
// DOM
// ============================================================

const venueList =
    document.getElementById("venueList");

const venueCount =
    document.getElementById("venueCount");

const adminEmail =
    document.getElementById("adminEmail");

const logoutBtn =
    document.getElementById("logoutBtn");


// ============================================================
// ADMIN INFO
// ============================================================

adminEmail.textContent =
    user.email || "";


// ============================================================
// MAP
// ============================================================

const map = L.map("map")
    .setView(
        [12.0022, 79.8100],
        14
    );


L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
    }
).addTo(map);


// ============================================================
// MARKERS
// ============================================================

const markerLayer =
    L.layerGroup().addTo(map);


// Keep venues in memory
let venues = [];


// ============================================================
// LOGOUT
// ============================================================

logoutBtn.addEventListener(
    "click",
    () => {

        localStorage.removeItem(
            "soundscout_token"
        );

        localStorage.removeItem(
            "soundscout_user"
        );

        window.location.href =
            "../index.html";

    }
);


// ============================================================
// LOAD VENUES
// ============================================================

async function loadVenues() {

    venueList.innerHTML = `
        <p class="loading">
            Loading venues...
        </p>
    `;

    try {

        const response = await fetch(
            `${API_BASE}/admin/venues`,
            {
                headers: {
                    "Authorization":
                        `Bearer ${token}`
                }
            }
        );


        if (response.status === 401) {

            localStorage.removeItem(
                "soundscout_token"
            );

            localStorage.removeItem(
                "soundscout_user"
            );

            window.location.href =
                "../index.html";

            return;
        }


        if (response.status === 403) {

            window.location.href =
                "../home/home.html";

            return;
        }


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Failed to load venues."
            );

        }


        venues = data;

        renderVenues();

        renderMarkers();

    } catch (err) {

        console.error(err);

        venueList.innerHTML = `
            <p class="loading">
                Failed to load venues.
            </p>
        `;

    }
}


// ============================================================
// RENDER VENUE LIST
// ============================================================

function renderVenues() {

    venueCount.textContent =
        venues.length;


    if (!venues.length) {

        venueList.innerHTML = `
            <p class="loading">
                No venues found.
            </p>
        `;

        return;
    }


    venueList.innerHTML =
        venues.map(
            venue => {

                const average =
                    venue.averageScore !== null
                        ? Number(
                            venue.averageScore
                        ).toFixed(1)
                        : "—";


                return `
                    <div
                        class="venue-card"
                        data-id="${venue.id}"
                    >

                        <h3>
                            ${escapeHtml(
                                venue.name
                            )}
                        </h3>

                        <p>
                            Category:
                            ${escapeHtml(
                                venue.category ||
                                "Unknown"
                            )}
                        </p>

                        <p>
                            Ratings:
                            ${venue.ratingCount || 0}
                        </p>

                        <p>
                            Average:
                            ${average}
                        </p>

                        <button
                            class="delete-btn"
                            data-id="${venue.id}"
                        >
                            Delete venue
                        </button>

                    </div>
                `;

            }
        ).join("");


    // --------------------------------------------------------
    // Card click
    // --------------------------------------------------------

    document
        .querySelectorAll(".venue-card")
        .forEach(card => {

            card.addEventListener(
                "click",
                event => {

                    // Don't trigger when delete button
                    // was clicked.
                    if (
                        event.target
                            .classList
                            .contains("delete-btn")
                    ) {
                        return;
                    }


                    const id =
                        card.dataset.id;


                    const venue =
                        venues.find(
                            v => v.id === id
                        );


                    if (!venue) return;


                    focusVenue(venue);

                }
            );

        });


    // --------------------------------------------------------
    // Delete buttons
    // --------------------------------------------------------

    document
        .querySelectorAll(".delete-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                event => {

                    event.stopPropagation();

                    deleteVenue(
                        button.dataset.id
                    );

                }
            );

        });
}


// ============================================================
// RENDER MAP MARKERS
// ============================================================

function renderMarkers() {

    markerLayer.clearLayers();


    venues.forEach(venue => {

        if (
            venue.lat === null ||
            venue.lng === null
        ) {
            return;
        }


        const lat =
            Number(venue.lat);

        const lng =
            Number(venue.lng);


        const marker =
            L.marker([lat, lng]);


        const average =
            venue.averageScore !== null
                ? Number(
                    venue.averageScore
                ).toFixed(1)
                : "—";


        marker.bindPopup(`
            <div class="admin-popup">

                <h3>
                    ${escapeHtml(
                        venue.name
                    )}
                </h3>

                <p>
                    <strong>
                        Category:
                    </strong>
                    ${escapeHtml(
                        venue.category ||
                        "Unknown"
                    )}
                </p>

                <p>
                    <strong>
                        Ratings:
                    </strong>
                    ${venue.ratingCount || 0}
                </p>

                <p>
                    <strong>
                        Average:
                    </strong>
                    ${average}
                </p>

                <button
                    class="popup-delete"
                    onclick="deleteVenue('${venue.id}')"
                >
                    Delete venue
                </button>

            </div>
        `);


        markerLayer.addLayer(marker);

    });


    // --------------------------------------------------------
    // Fit map to venues
    // --------------------------------------------------------

    if (venues.length > 0) {

        const validVenues =
            venues.filter(
                venue =>
                    venue.lat !== null &&
                    venue.lng !== null
            );


        if (validVenues.length > 0) {

            const bounds =
                L.latLngBounds(
                    validVenues.map(
                        venue => [
                            Number(venue.lat),
                            Number(venue.lng)
                        ]
                    )
                );


            map.fitBounds(
                bounds,
                {
                    padding: [40, 40]
                }
            );

        }

    }
}


// ============================================================
// FOCUS VENUE
// ============================================================

function focusVenue(venue) {

    const lat =
        Number(venue.lat);

    const lng =
        Number(venue.lng);


    map.setView(
        [lat, lng],
        17
    );


    // Find the corresponding marker
    markerLayer.eachLayer(
        marker => {

            const position =
                marker.getLatLng();


            if (
                Math.abs(
                    position.lat - lat
                ) < 0.000001 &&
                Math.abs(
                    position.lng - lng
                ) < 0.000001
            ) {

                marker.openPopup();

            }

        }
    );
}


// ============================================================
// DELETE VENUE
// ============================================================

async function deleteVenue(id) {

    const venue =
        venues.find(
            v => v.id === id
        );


    if (!venue) return;


    const confirmed =
        confirm(
            `Are you sure you want to delete "${venue.name}"?`
        );


    if (!confirmed) {
        return;
    }


    try {

        const response =
            await fetch(
                `${API_BASE}/admin/venues/${id}`,
                {
                    method: "DELETE",

                    headers: {
                        "Authorization":
                            `Bearer ${token}`
                    }
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Failed to delete venue."
            );

        }


        // Remove from local array
        venues =
            venues.filter(
                v => v.id !== id
            );


        // Refresh UI
        renderVenues();
        renderMarkers();


    } catch (err) {

        console.error(err);

        alert(
            `Failed to delete venue: ${err.message}`
        );

    }
}


// ============================================================
// HTML ESCAPING
// ============================================================

function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// ============================================================
// INITIAL LOAD
// ============================================================

loadVenues();