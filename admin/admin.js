const API_BASE = "http://localhost:4000/api";
const token = localStorage.getItem("soundscout_token");
const storedUser = localStorage.getItem("soundscout_user");
let user = null;

try { user = storedUser ? JSON.parse(storedUser) : null; } catch (_) {}
if (!token || !user) window.location.href = "../index.html";
if (user && user.admin !== true) window.location.href = "../home/home.html";

const PAGE_SIZE = 25;
const pages = { venues: 1, reviews: 1, users: 1, audit: 1 };
const totals = { venues: 0, reviews: 0, users: 0, audit: 0 };
let venues = [];
let markerLayer = null;
let map = null;
let toastTimer = null;

document.getElementById("adminEmail").textContent = user && user.email ? user.email : "";

document.getElementById("logoutBtn").addEventListener("click", function () {
  localStorage.removeItem("soundscout_token");
  localStorage.removeItem("soundscout_user");
  window.location.href = "../index.html";
});

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}
function showToast(message, isError) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.toggle("error", Boolean(isError));
  el.classList.add("visible");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove("visible"); }, 3500);
}
async function api(path, options) {
  const opts = options || {};
  opts.headers = Object.assign({}, opts.headers || {}, { Authorization: "Bearer " + token });
  if (opts.body && typeof opts.body !== "string") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const response = await fetch(API_BASE + path, opts);
  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (response.status === 401) {
    localStorage.removeItem("soundscout_token");
    localStorage.removeItem("soundscout_user");
    window.location.href = "../index.html";
    throw new Error("Your session expired. Please sign in again.");
  }
  if (response.status === 403) {
    if (user && user.admin !== true) window.location.href = "../home/home.html";
    throw new Error(data.error || "You do not have permission to perform this action.");
  }
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function showLoading(id, message) {
  document.getElementById(id).innerHTML = '<p class="loading">' + escapeHtml(message || "Loading…") + '</p>';
}
function showEmpty(id, message) {
  document.getElementById(id).innerHTML = '<p class="empty-state">' + escapeHtml(message) + '</p>';
}
function setPageInfo(key, data) {
  totals[key] = Number(data.total) || 0;
  const uiKey = ({ venues: "venue", reviews: "review", users: "user", audit: "audit" })[key] || key;
  const label = document.getElementById(uiKey + "PageLabel");
  if (label) label.textContent = "Page " + pages[key] + " of " + Math.max(1, Math.ceil(totals[key] / PAGE_SIZE));
  const prev = document.getElementById(uiKey + "Prev");
  const next = document.getElementById(uiKey + "Next");
  if (prev) prev.disabled = pages[key] <= 1;
  if (next) next.disabled = pages[key] >= Math.max(1, Math.ceil(totals[key] / PAGE_SIZE));
}
function queryString(values) {
  return Object.keys(values).map(function (key) {
    return encodeURIComponent(key) + "=" + encodeURIComponent(values[key]);
  }).join("&");
}
function reasonPrompt(label) {
  const value = window.prompt(label);
  if (value === null) return null;
  const reason = value.trim();
  if (reason.length < 3) {
    showToast("Please enter a reason of at least 3 characters.", true);
    return null;
  }
  return reason;
}

function initMap() {
  if (!window.L || map) return;
  map = L.map("map").setView([12.0022, 79.8100], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}
function renderMarkers() {
  if (!map || !markerLayer) return;
  markerLayer.clearLayers();
  const valid = venues.filter(function (v) { return v.lat !== null && v.lng !== null && Number.isFinite(Number(v.lat)) && Number.isFinite(Number(v.lng)); });
  valid.forEach(function (venue) {
    const marker = L.marker([Number(venue.lat), Number(venue.lng)]);
    const average = venue.averageScore == null ? "—" : Number(venue.averageScore).toFixed(1);
    marker.bindPopup(
      '<div class="admin-popup"><h3>' + escapeHtml(venue.name) + '</h3><p>' +
      escapeHtml(venue.category || "Unknown") + '</p><p>Ratings: ' + escapeHtml(venue.ratingCount || 0) +
      ' · Average: ' + escapeHtml(average) + '</p></div>'
    );
    marker.addTo(markerLayer);
  });
  if (valid.length === 1) map.setView([Number(valid[0].lat), Number(valid[0].lng)], 15);
  else if (valid.length > 1) map.fitBounds(L.latLngBounds(valid.map(function (v) { return [Number(v.lat), Number(v.lng)]; })), { padding: [25, 25] });
}
function focusVenue(venue) {
  if (!map || venue.lat == null || venue.lng == null) return;
  map.setView([Number(venue.lat), Number(venue.lng)], 16);
  markerLayer.eachLayer(function (marker) {
    const p = marker.getLatLng();
    if (Math.abs(p.lat - Number(venue.lat)) < 0.000001 && Math.abs(p.lng - Number(venue.lng)) < 0.000001) marker.openPopup();
  });
}

async function loadDashboard() {
  showLoading("dashboardMetrics", "Loading dashboard…");
  showLoading("recentActivity", "Loading recent activity…");
  try {
    const data = await api("/admin/dashboard");
    const m = data.metrics || {};
    const cards = [
      ["Active venues", m.venues], ["Pending venues", m.pending_venues],
      ["Active ratings", m.active_ratings], ["Removed ratings", m.deleted_ratings],
      ["Pending flags", m.pending_flags], ["Registered users", m.users],
      ["Suspended users", m.suspended_users]
    ];
    document.getElementById("dashboardMetrics").innerHTML = cards.map(function (card) {
      return '<article class="metric-card"><span>' + escapeHtml(card[0]) + '</span><strong>' + escapeHtml(card[1] == null ? 0 : card[1]) + '</strong></article>';
    }).join("");
    document.getElementById("pendingFlagBadge").textContent = m.pending_flags || 0;
    const recent = data.recentActivity || [];
    if (!recent.length) return showEmpty("recentActivity", "No admin actions have been recorded yet.");
    document.getElementById("recentActivity").innerHTML = recent.map(function (item) {
      return '<article class="record-row compact"><div class="record-main"><strong>' + escapeHtml(item.action.replace(/_/g, " ")) +
        '</strong><p>' + escapeHtml(item.entity_type) + ' · ' + escapeHtml(item.entity_id || "—") + '</p><p>' +
        escapeHtml(item.reason || "No reason supplied") + '</p></div><div class="record-meta">' +
        escapeHtml(item.admin_email) + '<br>' + escapeHtml(formatDate(item.created_at)) + '</div></article>';
    }).join("");
  } catch (err) {
    showEmpty("dashboardMetrics", err.message);
    showEmpty("recentActivity", "Could not load recent activity.");
  }
}

async function loadVenues() {
  initMap();
  showLoading("venueList", "Loading venues…");
  const status = document.getElementById("venueStatus").value;
  const search = document.getElementById("venueSearch").value.trim();
  try {
    const data = await api("/admin/venues?" + queryString({ status: status, search: search, page: pages.venues, limit: PAGE_SIZE }));
    venues = data.items || [];
    document.getElementById("venueCount").textContent = data.total || 0;
    setPageInfo("venues", data);
    renderVenues();
    renderMarkers();
  } catch (err) { showEmpty("venueList", err.message); }
}
function renderVenues() {
  if (!venues.length) return showEmpty("venueList", "No venues match these filters.");
  document.getElementById("venueList").innerHTML = venues.map(function (venue) {
    const deleted = Boolean(venue.deleted_at);
    const status = deleted ? "deleted" : (venue.status || "approved");
    const average = venue.averageScore == null ? "—" : Number(venue.averageScore).toFixed(1);
    let actions = "";
    if (deleted) {
      actions = '<button class="secondary-btn" data-action="restore-venue" data-id="' + escapeHtml(venue.id) + '">Restore</button>';
    } else {
      if (status === "pending") actions += '<button class="success-btn" data-action="approve-venue" data-id="' + escapeHtml(venue.id) + '">Approve</button>';
      if (status !== "rejected") actions += '<button class="secondary-btn" data-action="reject-venue" data-id="' + escapeHtml(venue.id) + '">Reject</button>';
      actions += '<button class="secondary-btn" data-action="edit-venue" data-id="' + escapeHtml(venue.id) + '">Edit</button>';
      actions += '<button class="danger-btn" data-action="delete-venue" data-id="' + escapeHtml(venue.id) + '">Remove</button>';
    }
    return '<article class="record-row venue-record" data-id="' + escapeHtml(venue.id) + '">' +
      '<div class="record-main"><button class="record-title link-button" data-action="focus-venue" data-id="' + escapeHtml(venue.id) + '">' + escapeHtml(venue.name) + '</button>' +
      '<p>' + escapeHtml(venue.category || "Uncategorized") + ' · ' + escapeHtml(venue.ratingCount || 0) + ' ratings · average ' + escapeHtml(average) + '</p>' +
      '<p><span class="status-pill status-' + escapeHtml(status) + '">' + escapeHtml(status) + '</span> · ' + escapeHtml(venue.id) + '</p></div>' +
      '<div class="record-actions">' + actions + '</div></article>';
  }).join("");
}
async function updateVenue(id, body, successMessage) {
  await api("/admin/venues/" + encodeURIComponent(id), { method: "PATCH", body: body });
  showToast(successMessage || "Venue updated.");
  await loadVenues();
  await loadDashboard();
}
async function editVenue(id) {
  const venue = venues.find(function (v) { return String(v.id) === String(id); });
  if (!venue) return;
  const name = window.prompt("Venue name:", venue.name || "");
  if (name === null) return;
  const category = window.prompt("Category:", venue.category || "");
  if (category === null) return;
  const latValue = window.prompt("Latitude:", venue.lat == null ? "" : venue.lat);
  if (latValue === null) return;
  const lngValue = window.prompt("Longitude:", venue.lng == null ? "" : venue.lng);
  if (lngValue === null) return;
  const accessValue = window.prompt("Wheelchair/accessibility tag? Enter true or false:", String(Boolean(venue.access)));
  if (accessValue === null) return;
  const toiletValue = window.prompt("Gender-neutral toilet tag? Enter true or false:", String(Boolean(venue.toilet)));
  if (toiletValue === null) return;
  const lat = Number(latValue), lng = Number(lngValue);
  if (!name.trim() || !category.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return showToast("Enter a name, category and valid coordinates.", true);
  }
  if (!["true", "false"].includes(accessValue.trim().toLowerCase()) || !["true", "false"].includes(toiletValue.trim().toLowerCase())) {
    return showToast("Accessibility values must be true or false.", true);
  }
  try {
    await updateVenue(id, { name: name.trim(), category: category.trim(), lat: lat, lng: lng, access: accessValue.trim().toLowerCase() === "true", toilet: toiletValue.trim().toLowerCase() === "true", reason: "Venue details edited by admin" }, "Venue details saved.");
  } catch (err) { showToast(err.message, true); }
}
async function deleteVenue(id) {
  const venue = venues.find(function (v) { return String(v.id) === String(id); });
  if (!venue || !window.confirm('Remove "' + venue.name + '"? This is a soft delete and can be restored.')) return;
  const reason = reasonPrompt("Reason for removing this venue:");
  if (reason === null) return;
  try {
    await api("/admin/venues/" + encodeURIComponent(id), { method: "DELETE", body: { reason: reason } });
    showToast("Venue removed; its history was preserved.");
    await loadVenues(); await loadDashboard();
  } catch (err) { showToast(err.message, true); }
}
async function restoreVenue(id) {
  const reason = reasonPrompt("Reason for restoring this venue:");
  if (reason === null) return;
  try {
    await api("/admin/venues/" + encodeURIComponent(id) + "/restore", { method: "POST", body: { reason: reason } });
    showToast("Venue restored."); await loadVenues(); await loadDashboard();
  } catch (err) { showToast(err.message, true); }
}
async function changeVenueStatus(id, status) {
  let reason = "";
  if (status === "rejected") {
    reason = reasonPrompt("Reason for rejecting this venue:");
    if (reason === null) return;
  }
  try { await updateVenue(id, { status: status, reason: reason }, status === "approved" ? "Venue approved." : "Venue rejected."); }
  catch (err) { showToast(err.message, true); }
}
async function loadDuplicates() {
  const target = document.getElementById("duplicateResults");
  showLoading("duplicateResults", "Scanning for same-name venues and venues within 150 metres…");
  try {
    const data = await api("/admin/venues/duplicates");
    const items = data.items || [];
    if (!items.length) return showEmpty("duplicateResults", "No likely duplicates found.");
    target.innerHTML = '<div class="section-card"><div class="section-card-heading"><h3>Possible duplicate pairs</h3><button class="secondary-btn" id="hideDuplicates">Hide</button></div>' +
      items.map(function (item) {
        return '<article class="record-row compact"><div class="record-main"><strong>' + escapeHtml(item.venueName) + '</strong><p>Possible duplicate of <strong>' +
          escapeHtml(item.duplicateName) + '</strong></p><p>Approx. ' + escapeHtml(item.distanceMeters == null ? "unknown" : item.distanceMeters + " m") + ' apart</p></div></article>';
      }).join("") + '</div>';
    document.getElementById("hideDuplicates").addEventListener("click", function () { target.innerHTML = ""; });
  } catch (err) { showEmpty("duplicateResults", err.message); }
}

async function loadReviews() {
  showLoading("reviewList", "Loading ratings…");
  const status = document.getElementById("reviewStatus").value;
  const search = document.getElementById("reviewSearch").value.trim();
  try {
    const data = await api("/admin/reviews?" + queryString({ status: status, search: search, page: pages.reviews, limit: PAGE_SIZE }));
    setPageInfo("reviews", data);
    const items = data.items || [];
    if (!items.length) return showEmpty("reviewList", "No ratings match these filters.");
    document.getElementById("reviewList").innerHTML = items.map(function (r) {
      const deleted = Boolean(r.deleted_at);
      const action = deleted
        ? '<button class="success-btn" data-action="restore-review" data-id="' + escapeHtml(r.id) + '">Restore</button>'
        : '<button class="danger-btn" data-action="delete-review" data-id="' + escapeHtml(r.id) + '">Remove rating</button>';
      return '<article class="record-row"><div class="record-main"><strong>' + escapeHtml(r.venueName || "Deleted venue") + ' · ' + escapeHtml(r.score) + '/5</strong>' +
        '<p>By ' + escapeHtml(r.userName || "Unknown user") + ' (' + escapeHtml(r.userEmail || "no email") + ')</p>' +
        '<p>Time: ' + escapeHtml(r.time_of_day || "—") + ' · measured dBFS: ' + escapeHtml(r.measured_db == null ? "—" : Number(r.measured_db).toFixed(1)) +
        ' · audio analysed: ' + escapeHtml(r.had_audio_clip ? "yes" : "no") + '</p><p>Submitted: ' + escapeHtml(formatDate(r.submitted_at)) +
        (deleted ? ' · <span class="status-pill status-deleted">removed</span><br>Reason: ' + escapeHtml(r.deletion_reason || "—") : '') +
        '</p><small>ID: ' + escapeHtml(r.id) + '</small></div><div class="record-actions">' + action + '</div></article>';
    }).join("");
  } catch (err) { showEmpty("reviewList", err.message); }
}
async function deleteReview(id) {
  const reason = reasonPrompt("Reason for removing this rating/report:");
  if (reason === null) return;
  try {
    await api("/admin/reviews/" + encodeURIComponent(id), { method: "DELETE", body: { reason: reason } });
    showToast("Rating removed from public results.");
    await loadReviews(); await loadDashboard();
  } catch (err) { showToast(err.message, true); }
}
async function restoreReview(id) {
  const reason = reasonPrompt("Reason for restoring this rating:");
  if (reason === null) return;
  try {
    await api("/admin/reviews/" + encodeURIComponent(id) + "/restore", { method: "POST", body: { reason: reason } });
    showToast("Rating restored."); await loadReviews(); await loadDashboard();
  } catch (err) { showToast(err.message, true); }
}

async function loadFlags() {
  showLoading("flagList", "Loading moderation queue…");
  const status = document.getElementById("flagStatus").value;
  try {
    const data = await api("/admin/flags?" + queryString({ status: status, page: 1, limit: 100 }));
    const items = data.items || [];
    document.getElementById("pendingFlagBadge").textContent = status === "pending" ? data.total || 0 : document.getElementById("pendingFlagBadge").textContent;
    if (!items.length) return showEmpty("flagList", "No flags in this queue.");
    document.getElementById("flagList").innerHTML = items.map(function (flag) {
      const targetName = flag.targetType === "venue" ? (flag.venueName || "Venue no longer available") : ("Rating " + (flag.ratingScore == null ? "" : flag.ratingScore + "/5"));
      const actions = flag.status === "pending"
        ? '<button class="secondary-btn" data-action="resolve-flag" data-status="reviewed" data-id="' + escapeHtml(flag.id) + '">Mark reviewed</button>' +
          '<button class="secondary-btn" data-action="resolve-flag" data-status="dismissed" data-id="' + escapeHtml(flag.id) + '">Dismiss</button>' +
          '<button class="danger-btn" data-action="resolve-flag" data-status="action_taken" data-id="' + escapeHtml(flag.id) + '">Action taken</button>'
        : '<span class="status-pill status-' + escapeHtml(flag.status) + '">' + escapeHtml(flag.status.replace(/_/g, " ")) + '</span>';
      return '<article class="record-row"><div class="record-main"><strong>' + escapeHtml(flag.reason) + '</strong><p>' + escapeHtml(flag.targetType) + ' · ' + escapeHtml(targetName) + '</p>' +
        '<p>' + escapeHtml(flag.details || "No additional details") + '</p><p>Reported by ' + escapeHtml(flag.reporterName || flag.reporterEmail || "Unknown user") + ' · ' + escapeHtml(formatDate(flag.created_at)) + '</p>' +
        (flag.resolutionNotes ? '<p>Resolution: ' + escapeHtml(flag.resolutionNotes) + '</p>' : '') + '<small>Flag #' + escapeHtml(flag.id) + ' · Target ID: ' + escapeHtml(flag.targetId) + '</small></div>' +
        '<div class="record-actions">' + actions + '</div></article>';
    }).join("");
  } catch (err) { showEmpty("flagList", err.message); }
}
async function resolveFlag(id, status) {
  const notes = window.prompt("Resolution notes (required for audit trail):", "");
  if (notes === null) return;
  try {
    await api("/admin/flags/" + encodeURIComponent(id), { method: "PATCH", body: { status: status, notes: notes.trim() } });
    showToast("Moderation decision saved."); await loadFlags(); await loadDashboard();
  } catch (err) { showToast(err.message, true); }
}

async function loadUsers() {
  showLoading("userList", "Loading users…");
  const search = document.getElementById("userSearch").value.trim();
  try {
    const data = await api("/admin/users?" + queryString({ search: search, page: pages.users, limit: PAGE_SIZE }));
    setPageInfo("users", data);
    const items = data.items || [];
    if (!items.length) return showEmpty("userList", "No users match this search.");
    document.getElementById("userList").innerHTML = items.map(function (u) {
      const self = user && String(user.id || "") === String(u.id);
      const action = self ? '<span class="status-pill">Current account</span>' :
        (u.suspended
          ? '<button class="success-btn" data-action="unsuspend-user" data-id="' + escapeHtml(u.id) + '">Restore access</button>'
          : '<button class="danger-btn" data-action="suspend-user" data-id="' + escapeHtml(u.id) + '">Suspend</button>');
      return '<article class="record-row"><div class="record-main"><strong>' + escapeHtml(u.name) + '</strong><p>' + escapeHtml(u.email) + '</p>' +
        '<p>Joined ' + escapeHtml(formatDate(u.created_at)) + ' · Age ' + escapeHtml(u.age) + ' · Sensitivity ' + escapeHtml(u.sensitivity) + '</p>' +
        '<p><span class="status-pill ' + (u.suspended ? 'status-deleted' : 'status-approved') + '">' + (u.suspended ? 'suspended' : 'active') + '</span>' +
        (u.suspended ? ' · ' + escapeHtml(u.suspension_reason || "No reason recorded") : '') + '</p><small>ID: ' + escapeHtml(u.id) + '</small></div><div class="record-actions">' + action + '</div></article>';
    }).join("");
  } catch (err) { showEmpty("userList", err.message); }
}
async function setUserSuspension(id, suspended) {
  let reason = "Access restored by administrator";
  if (suspended) {
    reason = reasonPrompt("Reason for suspending this user:");
    if (reason === null) return;
  } else {
    const input = window.prompt("Reason for restoring access:", reason);
    if (input === null) return;
    reason = input.trim() || reason;
  }
  try {
    await api("/admin/users/" + encodeURIComponent(id) + "/suspension", { method: "PATCH", body: { suspended: suspended, reason: reason } });
    showToast(suspended ? "User suspended." : "User access restored.");
    await loadUsers(); await loadDashboard();
  } catch (err) { showToast(err.message, true); }
}

async function loadAudit() {
  showLoading("auditList", "Loading audit log…");
  const search = document.getElementById("auditSearch").value.trim();
  try {
    const data = await api("/admin/audit?" + queryString({ search: search, page: pages.audit, limit: PAGE_SIZE }));
    setPageInfo("audit", data);
    const items = data.items || [];
    if (!items.length) return showEmpty("auditList", "No audit entries match this search.");
    document.getElementById("auditList").innerHTML = items.map(function (entry) {
      return '<article class="record-row"><div class="record-main"><strong>' + escapeHtml(entry.action.replace(/_/g, " ")) + '</strong><p>' +
        escapeHtml(entry.entity_type) + ' · ' + escapeHtml(entry.entity_id || "—") + '</p><p>Reason: ' + escapeHtml(entry.reason || "—") + '</p>' +
        '<small>Metadata: ' + escapeHtml(JSON.stringify(entry.metadata || {})) + '</small></div><div class="record-meta">' +
        escapeHtml(entry.admin_email) + '<br>' + escapeHtml(formatDate(entry.created_at)) + '</div></article>';
    }).join("");
  } catch (err) { showEmpty("auditList", err.message); }
}

function activatePanel(name) {
  document.querySelectorAll(".nav-tab").forEach(function (button) { button.classList.toggle("active", button.dataset.panel === name); });
  document.querySelectorAll(".admin-panel").forEach(function (panel) { panel.classList.toggle("active", panel.id === "panel-" + name); });
  if (name === "venues") { initMap(); setTimeout(function () { if (map) map.invalidateSize(); }, 80); loadVenues(); }
  if (name === "overview") loadDashboard();
  if (name === "reviews") loadReviews();
  if (name === "moderation") loadFlags();
  if (name === "users") loadUsers();
  if (name === "audit") loadAudit();
}
document.querySelectorAll(".nav-tab").forEach(function (button) {
  button.addEventListener("click", function () { activatePanel(button.dataset.panel); });
});
document.querySelectorAll("[data-open-panel]").forEach(function (button) {
  button.addEventListener("click", function () { activatePanel(button.dataset.openPanel); });
});

document.getElementById("refreshDashboard").addEventListener("click", loadDashboard);
document.getElementById("searchVenues").addEventListener("click", function () { pages.venues = 1; loadVenues(); });
document.getElementById("venueStatus").addEventListener("change", function () { pages.venues = 1; loadVenues(); });
document.getElementById("searchReviews").addEventListener("click", function () { pages.reviews = 1; loadReviews(); });
document.getElementById("reviewStatus").addEventListener("change", function () { pages.reviews = 1; loadReviews(); });
document.getElementById("searchFlags").addEventListener("click", loadFlags);
document.getElementById("flagStatus").addEventListener("change", loadFlags);
document.getElementById("searchUsers").addEventListener("click", function () { pages.users = 1; loadUsers(); });
document.getElementById("searchAudit").addEventListener("click", function () { pages.audit = 1; loadAudit(); });
document.getElementById("scanDuplicates").addEventListener("click", loadDuplicates);
["venueSearch", "reviewSearch", "userSearch", "auditSearch"].forEach(function (id) {
  document.getElementById(id).addEventListener("keydown", function (event) {
    if (event.key !== "Enter") return;
    const key = id === "venueSearch" ? "venues" : id === "reviewSearch" ? "reviews" : id === "userSearch" ? "users" : "audit";
    pages[key] = 1;
    if (key === "venues") loadVenues();
    if (key === "reviews") loadReviews();
    if (key === "users") loadUsers();
    if (key === "audit") loadAudit();
  });
});
function bindPager(key) {
  const uiKey = ({ venues: "venue", reviews: "review", users: "user", audit: "audit" })[key] || key;
  const prev = document.getElementById(uiKey + "Prev");
  const next = document.getElementById(uiKey + "Next");
  prev.addEventListener("click", function () { if (pages[key] > 1) { pages[key]--; loadByKey(key); } });
  next.addEventListener("click", function () { if (pages[key] < Math.ceil(totals[key] / PAGE_SIZE)) { pages[key]++; loadByKey(key); } });
}
function loadByKey(key) {
  if (key === "venues") loadVenues();
  if (key === "reviews") loadReviews();
  if (key === "users") loadUsers();
  if (key === "audit") loadAudit();
}
["venues", "reviews", "users", "audit"].forEach(bindPager);

document.addEventListener("click", function (event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  if (action === "focus-venue") {
    const venue = venues.find(function (v) { return String(v.id) === String(id); });
    if (venue) focusVenue(venue);
  } else if (action === "edit-venue") editVenue(id);
  else if (action === "delete-venue") deleteVenue(id);
  else if (action === "restore-venue") restoreVenue(id);
  else if (action === "approve-venue") changeVenueStatus(id, "approved");
  else if (action === "reject-venue") changeVenueStatus(id, "rejected");
  else if (action === "delete-review") deleteReview(id);
  else if (action === "restore-review") restoreReview(id);
  else if (action === "resolve-flag") resolveFlag(id, button.dataset.status);
  else if (action === "suspend-user") setUserSuspension(id, true);
  else if (action === "unsuspend-user") setUserSuspension(id, false);
});

loadDashboard();
