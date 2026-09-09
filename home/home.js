(function(){

  var API_BASE = "http://localhost:4000/api";

  var CATEGORIES = ["all","cafe","restaurant","library","gym","coworking"];
  var CATEGORY_LABELS = {all:"All", cafe:"Cafés", restaurant:"Restaurants", library:"Libraries", gym:"Gyms", coworking:"Coworking"};

  // Venues now load from the real backend instead of being hardcoded here.
  // See loadVenues() near the bottom.
  var venues = [];

  var nextId = 9;
  var state = {category:"all", search:"", accessOnly:false, toiletOnly:false, selected:null, userLocation:null, sortByDistance:false};

  var TIME_BUCKETS = ["morning","afternoon","evening","night"];
  var TIME_BUCKET_LABELS = {morning:"11am", afternoon:"3pm", evening:"7pm", night:"11pm"};

  function currentTimeOfDay(){
    var h = new Date().getHours();
    if(h < 11) return "morning";
    if(h < 16) return "afternoon";
    if(h < 21) return "evening";
    return "night";
  }

  // ---------- Auth helpers ----------
  function getToken(){ return localStorage.getItem("soundscout_token"); }

  function authHeaders(){
    var t = getToken();
    return t ? { "Authorization": "Bearer " + t } : {};
  }

  function requireLogin(actionLabel){
    if(getToken()) return true;
    alert("Please log in to " + (actionLabel || "do that") + ".");
    window.location.href = "../index.html";
    return false;
  }

  function avgScore(v){
    if(!v.ratings || !v.ratings.length) return null;
    var sum = 0;
    v.ratings.forEach(function(r){ sum += r.score; });
    return sum / v.ratings.length;
  }

  function scoreForBucket(v, bucket){
    var rs = (v.ratings || []).filter(function(r){ return r.time === bucket; });
    if(!rs.length) return null;
    var sum = 0;
    rs.forEach(function(r){ sum += r.score; });
    return sum / rs.length;
  }

  function quietColor(q){
    if(q === null || q === undefined) return "rgb(150,150,150)";
    var t = (q - 1) / 4;
    var qc = [0x4E,0x8F,0x73], lc = [0xBD,0x5B,0x45];
    var mix = function(i){ return Math.round(qc[i] + (lc[i]-qc[i]) * (1 - t)); };
    return "rgb(" + mix(0) + "," + mix(1) + "," + mix(2) + ")";
  }

  function pseudoRandom(seed){
    var x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  function renderWaveform(container, quiet, seedBase){
    container.innerHTML = "";
    var bars = 20;
    var color = quietColor(quiet);
    var baseAmp = 8 + quiet * 5;
    for(var i=0;i<bars;i++){
      var jitter = pseudoRandom(seedBase + i * 3.7) * baseAmp;
      var h = Math.max(3, Math.min(34, baseAmp * 0.5 + jitter));
      var bar = document.createElement("span");
      bar.style.height = h + "px";
      bar.style.background = color;
      container.appendChild(bar);
    }
  }

  function dbEstimateValue(score){
    if(score === null || score === undefined) return null;
    var anchors = {1:78, 2:65, 3:52, 4:42, 5:34};
    var lo = Math.max(1, Math.min(5, Math.floor(score)));
    var hi = Math.max(1, Math.min(5, Math.ceil(score)));
    if(lo === hi) return anchors[lo];
    var frac = score - lo;
    return anchors[lo] + (anchors[hi] - anchors[lo]) * frac;
  }

  function dbEstimate(score){
    var val = dbEstimateValue(score);
    return val === null ? "" : "~" + Math.round(val) + " dB";
  }

  function quietLabel(q){
    var rounded = Math.max(1, Math.min(5, Math.round(q)));
    return {1:"Loud", 2:"Lively", 3:"Moderate", 4:"Calm", 5:"Silent"}[rounded];
  }

  function timeBarChartHTML(v){
    var bucketsWithData = TIME_BUCKETS.filter(function(bucket){ return scoreForBucket(v, bucket) !== null; });
    if(!bucketsWithData.length){
      return '<p style="font-size:12px;color:#5B6472;margin:8px 0;">No ratings yet — be the first.</p>';
    }

    var MIN_DB = 30, MAX_DB = 80, MAX_BAR_PX = 54, MIN_BAR_PX = 6;

    var barsHTML = bucketsWithData.map(function(bucket){
      var s = scoreForBucket(v, bucket);
      var db = dbEstimateValue(s);
      var t = Math.max(0, Math.min(1, (db - MIN_DB) / (MAX_DB - MIN_DB)));
      var barPx = Math.round(MIN_BAR_PX + (MAX_BAR_PX - MIN_BAR_PX) * t);
      return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;flex:1;">' +
        '<span style="font-size:9px;font-weight:700;color:#1C2430;">' + Math.round(db) + '</span>' +
        '<div style="width:100%;max-width:32px;height:' + barPx + 'px;background:' + quietColor(s) + ';border-radius:5px 5px 2px 2px;"></div>' +
        '<span style="font-size:9.5px;color:#5B6472;">' + TIME_BUCKET_LABELS[bucket] + '</span>' +
        '</div>';
    }).join('');

    return '<div style="display:flex;align-items:flex-end;gap:8px;height:' + (MAX_BAR_PX + 30) + 'px;margin:10px 0 8px 0;">' + barsHTML + '</div>';
  }

  // ---------- Distance helpers (plain haversine formula, no external API) ----------
  function distanceKm(lat1, lng1, lat2, lng2){
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  function distanceLabel(v){
    if(!state.userLocation) return "";
    var km = distanceKm(state.userLocation.lat, state.userLocation.lng, v.lat, v.lng);
    if(km < 1) return Math.round(km * 1000) + " m away";
    return km.toFixed(1) + " km away";
  }

  var map = L.map('map', {zoomControl:true}).setView([12.0022, 79.8100], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);

  var markers = {};
  var youMarker = null;

  function accessSVG(){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="1.6"/><path d="M6 20l3-8 3 2 3-2 3 8"/><path d="M9 12l1-4h4"/></svg>';
  }
  function toiletSVG(){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="4" r="1.8"/><circle cx="16" cy="4" r="1.8"/><path d="M9 8v12M6 12h6M16 8v12M13.5 13h5"/></svg>';
  }

  function buildMarker(v){
    var icon = L.divIcon({
      className:"",
      html:'<div class="ss-marker" style="background:'+quietColor(avgScore(v))+'"></div>',
      iconSize:[16,16]
    });
    var m = L.marker([v.lat, v.lng], {icon:icon}).addTo(map);
    m.bindPopup(popupHTML(v));
    m.on('click', function(){ selectVenue(v.id, false); });
    markers[v.id] = m;
  }

  function clearMarkers(){
    Object.keys(markers).forEach(function(id){ map.removeLayer(markers[id]); });
    markers = {};
  }

  function popupHTML(v){
    var score = avgScore(v);
    var overallLine = score === null
      ? "No ratings yet"
      : CATEGORY_LABELS[v.category].replace(/s$/,'')+' · '+quietLabel(score)+' · '+dbEstimate(score);
    return '<div class="popup-body"><h3>'+escapeHTML(v.name)+'</h3>' +
      '<p class="popup-cat">'+overallLine+'</p>' +
      timeBarChartHTML(v) +
      '<button class="popup-rate-btn" onclick="window.__ssOpenRate(\''+v.id+'\')">Rate this place</button></div>';
  }

  function escapeHTML(s){
    return s.replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; });
  }

  function matchesFilters(v){
    if(state.category !== "all" && v.category !== state.category) return false;
    if(state.search && v.name.toLowerCase().indexOf(state.search.toLowerCase()) === -1) return false;
    if(state.accessOnly && !v.access) return false;
    if(state.toiletOnly && !v.toilet) return false;
    return true;
  }

  function renderChips(){
    var row = document.getElementById("category-chips");
    row.innerHTML = "";
    CATEGORIES.forEach(function(cat){
      var chip = document.createElement("button");
      chip.className = "chip" + (state.category === cat ? " active" : "");
      chip.textContent = CATEGORY_LABELS[cat];
      chip.type = "button";
      chip.addEventListener("click", function(){
        state.category = cat;
        renderChips();
        renderList();
        updateMarkerVisibility();
      });
      row.appendChild(chip);
    });
  }

  function updateMarkerVisibility(){
    venues.forEach(function(v){
      var m = markers[v.id];
      if(!m) return;
      if(matchesFilters(v)){
        if(!map.hasLayer(m)) m.addTo(map);
      } else {
        if(map.hasLayer(m)) map.removeLayer(m);
      }
    });
  }

  function renderList(){
    var list = document.getElementById("venue-list");
    var visible = venues.filter(matchesFilters);

    if(state.sortByDistance && state.userLocation){
      visible.sort(function(a,b){
        var da = distanceKm(state.userLocation.lat, state.userLocation.lng, a.lat, a.lng);
        var db = distanceKm(state.userLocation.lat, state.userLocation.lng, b.lat, b.lng);
        return da - db;
      });
    } else {
      visible.sort(function(a,b){
        var sa = avgScore(a), sb = avgScore(b);
        if(sa === null) return 1;
        if(sb === null) return -1;
        return sb - sa;
      });
    }
    

    document.getElementById("list-count").textContent = visible.length + (visible.length === 1 ? " venue" : " venues");
    list.innerHTML = "";
    if(visible.length === 0){
      var empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No venues match these filters yet. Try widening your search or be the first to add one.";
      list.appendChild(empty);
      return;
    }
    visible.forEach(function(v){
      var score = avgScore(v);
      var card = document.createElement("div");
      card.className = "venue-card" + (state.selected === v.id ? " selected" : "");
      card.setAttribute("tabindex","0");
      card.setAttribute("role","button");
      card.setAttribute("aria-label", v.name + ", " + (score === null ? "no ratings yet" : quietLabel(score)));

      var top = document.createElement("div");
      top.className = "venue-top";
      var left = document.createElement("div");
      var distLabel = distanceLabel(v);
      var metaLine = CATEGORY_LABELS[v.category].replace(/s$/,'') + (distLabel ? ' · ' + distLabel : '');
      left.innerHTML = '<p class="venue-name">'+escapeHTML(v.name)+'</p><p class="venue-cat">'+metaLine+'</p>';
      var right = document.createElement("div");
      right.className = "db-reading";
      right.textContent = dbEstimate(score);
      top.appendChild(left);
      top.appendChild(right);
      card.appendChild(top);

      var wf = document.createElement("div");
      wf.className = "waveform";
      card.appendChild(wf);

      var tags = document.createElement("div");
      tags.className = "tag-row";
      if(v.access){
        tags.innerHTML += '<span class="tag-pill">'+accessSVG()+'Step-free</span>';
      }
      if(v.toilet){
        tags.innerHTML += '<span class="tag-pill">'+toiletSVG()+'Gender-neutral</span>';
      }
      card.appendChild(tags);

      card.addEventListener("click", function(){ selectVenue(v.id, true); });
      card.addEventListener("keydown", function(e){ if(e.key==="Enter" || e.key===" "){ e.preventDefault(); selectVenue(v.id, true); } });

      list.appendChild(card);
      renderWaveform(wf, score === null ? 3 : score, (typeof v.id === "number" ? v.id : v.id.length) * 13);
    });
  }

  function selectVenue(id, flyTo){
    state.selected = id;
    renderList();
    var v = venues.find(function(x){ return x.id === id; });
    if(v){
      if(flyTo) map.flyTo([v.lat, v.lng], 15, {duration:0.6});
      if(markers[id]) markers[id].openPopup();
    }
  }

  document.getElementById("search-input").addEventListener("input", function(e){
    state.search = e.target.value;
    renderList();
    updateMarkerVisibility();
  });
  document.getElementById("filter-access").addEventListener("change", function(e){
    state.accessOnly = e.target.checked;
    renderList();
    updateMarkerVisibility();
  });
  document.getElementById("filter-toilet").addEventListener("change", function(e){
    state.toiletOnly = e.target.checked;
    renderList();
    updateMarkerVisibility();
  });

  // ---------- Account / profile button ----------
  var PROFILE_PAGE_URL = "../profile/profile.html";
  var LOGIN_PAGE_URL = "../index.html";

  var sidebarHeader = document.querySelector(".sidebar-header");
  if(sidebarHeader) sidebarHeader.style.position = "relative";

  var accountBtn = document.createElement("button");
  accountBtn.type = "button";
  accountBtn.id = "account-btn";
  accountBtn.style.position = "absolute";
  accountBtn.style.top = "20px";
  accountBtn.style.right = "20px";
  accountBtn.style.width = "36px";
  accountBtn.style.height = "36px";
  accountBtn.style.borderRadius = "50%";
  accountBtn.style.display = "flex";
  accountBtn.style.alignItems = "center";
  accountBtn.style.justifyContent = "center";
  accountBtn.style.fontFamily = "'Inter', sans-serif";
  accountBtn.style.fontWeight = "700";
  accountBtn.style.fontSize = "13px";
  accountBtn.style.cursor = "pointer";
  accountBtn.style.border = "1.5px solid #1E4F4F";
  accountBtn.style.padding = "0";

  function initialsFor(name){
    if(!name) return "?";
    var parts = name.trim().split(/\s+/);
    var initials = parts[0][0] || "";
    if(parts.length > 1) initials += parts[parts.length - 1][0];
    return initials.toUpperCase();
  }

  function refreshAccountButton(){
    var token = getToken();
    var userRaw = localStorage.getItem("soundscout_user");

    if(token && userRaw){
      var user = JSON.parse(userRaw);
      accountBtn.textContent = initialsFor(user.name);
      accountBtn.style.background = "#1E4F4F";
      accountBtn.style.color = "#ffffff";
      accountBtn.title = user.name ? "My profile (" + user.name + ")" : "My profile";
    } else {
      accountBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#1E4F4F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>';
      accountBtn.style.background = "#ffffff";
      accountBtn.title = "Log in";
    }
  }

  refreshAccountButton();

  accountBtn.addEventListener("click", function(){
    window.location.href = getToken() ? PROFILE_PAGE_URL : LOGIN_PAGE_URL;
  });

  var accountBtnStyle = document.createElement("style");
  accountBtnStyle.textContent = "#account-btn:hover{opacity:0.85;}";
  document.head.appendChild(accountBtnStyle);

  if(sidebarHeader) sidebarHeader.appendChild(accountBtn);

  // ---------- Geolocation: "find my location" ----------
  // Uses the browser's built-in navigator.geolocation API — nothing to do
  // with Leaflet or Google Maps. Leaflet just draws the result once we have it.

  var locateBtn = document.createElement("button");
  locateBtn.type = "button";
  locateBtn.id = "locate-me-btn";
  locateBtn.textContent = "⦿ Find my location";
  locateBtn.style.display = "block";
  locateBtn.style.width = "100%";
  locateBtn.style.marginTop = "8px";
  locateBtn.style.padding = "10px 14px";
  locateBtn.style.fontFamily = "'Inter', sans-serif";
  locateBtn.style.fontSize = "13.5px";
  locateBtn.style.fontWeight = "600";
  locateBtn.style.color = "#2B6E6E";
  locateBtn.style.background = "#ffffff";
  locateBtn.style.border = "1.5px solid #2B6E6E";
  locateBtn.style.borderRadius = "8px";
  locateBtn.style.cursor = "pointer";

  var addVenueBtn = document.getElementById("open-add-venue");
  addVenueBtn.insertAdjacentElement("afterend", locateBtn);

  var locateStatus = document.createElement("p");
  locateStatus.id = "locate-status";
  locateStatus.style.fontFamily = "'Inter', sans-serif";
  locateStatus.style.fontSize = "12px";
  locateStatus.style.color = "#5B6472";
  locateStatus.style.margin = "6px 0 0 0";
  locateBtn.insertAdjacentElement("afterend", locateStatus);

  var locateBtnStyle = document.createElement("style");
  locateBtnStyle.textContent =
    "#locate-me-btn:hover{background:#EAF3F3;}" +
    "#locate-me-btn:disabled{opacity:0.6;cursor:not-allowed;}";
  document.head.appendChild(locateBtnStyle);

  var youMarkerStyle = document.createElement("style");
  youMarkerStyle.textContent =
    ".ss-you-marker{width:16px;height:16px;border-radius:50%;background:#378ADD;" +
    "border:3px solid #fff;box-shadow:0 0 0 2px #378ADD, 0 1px 4px rgba(0,0,0,0.35);}" +
    ".ss-you-pulse{width:16px;height:16px;border-radius:50%;background:rgba(55,138,212,0.35);" +
    "position:absolute;top:0;left:0;animation:ssYouPulse 1.8s ease-out infinite;}" +
    "@keyframes ssYouPulse{0%{transform:scale(1);opacity:0.7;}100%{transform:scale(2.6);opacity:0;}}";
  document.head.appendChild(youMarkerStyle);

  function youIcon(){
    return L.divIcon({
      className:"",
      html:'<div style="position:relative;width:16px;height:16px;">' +
             '<div class="ss-you-pulse"></div>' +
             '<div class="ss-you-marker"></div>' +
           '</div>',
      iconSize:[16,16],
      iconAnchor:[8,8]
    });
  }

  function locateUser(){
    if(!("geolocation" in navigator)){
      locateStatus.textContent = "Geolocation isn't supported on this browser.";
      return;
    }

    locateBtn.disabled = true;
    locateBtn.textContent = "Locating…";
    locateStatus.textContent = "";

    navigator.geolocation.getCurrentPosition(
      function(position){
        var lat = position.coords.latitude;
        var lng = position.coords.longitude;
        state.userLocation = {lat: lat, lng: lng};
        state.sortByDistance = true;

        if(youMarker){
          youMarker.setLatLng([lat, lng]);
        } else {
          youMarker = L.marker([lat, lng], {icon: youIcon(), zIndexOffset: 1000}).addTo(map);
          youMarker.bindTooltip("You are here");
        }

        map.flyTo([lat, lng], 15, {duration:0.6});

        locateBtn.disabled = false;
        locateBtn.textContent = "⦿ Re-locate me";
        locateStatus.textContent = "Showing venues nearest to you first.";

        renderList();
        // A real PostGIS-backed nearby search is now available too:
        // fetch(`${API_BASE}/venues/nearby?lat=${lat}&lng=${lng}&radius=2000`)
        // — swap to that if you want the DB doing the filtering instead of
        // sorting the full client-side list.
      },
      function(error){
        locateBtn.disabled = false;
        locateBtn.textContent = "⦿ Find my location";
        if(error.code === error.PERMISSION_DENIED){
          locateStatus.textContent = "Location access denied — showing all venues instead.";
        } else {
          locateStatus.textContent = "Couldn't get your location. Try again.";
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  locateBtn.addEventListener("click", locateUser);

  // ---------- Location search (Nominatim, proxied through our backend) ----------
  // Only shown in "Add a venue" mode. Replaces the old map-center-jitter
  // placement — a venue's coordinates now come from a real geocoded address.
  var selectedLocation = null; // { display_name, lat, lng }
  var locationSearchTimeout = null;
  // Temporary pin used while adding a venue.
  var locationPickerMarker = null;
  // Only allow map pin placement while adding a new venue.
  var isPickingVenueLocation = false;
  var locationPickerMode = false;
  var donePinBtn = null;

  var locationField = document.createElement("div");
  locationField.className = "field";
  locationField.id = "location-search-field";

  var locationLabel = document.createElement("label");
  locationLabel.textContent = "Search for the venue's location";
  locationLabel.style.display = "block";
  locationLabel.style.marginBottom = "6px";
  locationField.appendChild(locationLabel);

  var locationInput = document.createElement("input");
  locationInput.type = "text";
  locationInput.id = "location-search-input";
  locationInput.placeholder = "e.g. Blue Fox Café, Auroville";
  locationInput.autocomplete = "off";
  locationField.appendChild(locationInput);

  var locationResults = document.createElement("div");
  locationResults.id = "location-search-results";
  locationResults.style.border = "1px solid #E3DFD3";
  locationResults.style.borderRadius = "8px";
  locationResults.style.marginTop = "4px";
  locationResults.style.maxHeight = "160px";
  locationResults.style.overflowY = "auto";
  locationResults.style.display = "none";
  locationField.appendChild(locationResults);

  var locationSelectedDisplay = document.createElement("p");
  locationSelectedDisplay.id = "location-selected-display";
  locationSelectedDisplay.style.fontSize = "12px";
  locationSelectedDisplay.style.color = "#1E4F4F";
  locationSelectedDisplay.style.fontWeight = "600";
  locationSelectedDisplay.style.margin = "6px 0 0 0";
  locationSelectedDisplay.style.minHeight = "14px";
  locationField.appendChild(locationSelectedDisplay);
  
  var adjustPinBtn = document.createElement("button");

adjustPinBtn.type = "button";

adjustPinBtn.id = "adjust-pin-btn";

adjustPinBtn.textContent = "📍 Adjust exact pin on map";

adjustPinBtn.style.marginTop = "8px";
adjustPinBtn.style.padding = "8px 12px";

adjustPinBtn.style.border = "1.5px solid #2B6E6E";
adjustPinBtn.style.borderRadius = "8px";

adjustPinBtn.style.background = "#ffffff";
adjustPinBtn.style.color = "#2B6E6E";

adjustPinBtn.style.fontFamily = "'Inter', sans-serif";
adjustPinBtn.style.fontSize = "12.5px";
adjustPinBtn.style.fontWeight = "600";

adjustPinBtn.style.cursor = "pointer";

adjustPinBtn.addEventListener("click", function(){

  enterLocationPickerMode();

});

locationField.appendChild(adjustPinBtn);
  var fieldsNewVenue = document.getElementById("fields-new-venue");
  fieldsNewVenue.insertBefore(locationField, fieldsNewVenue.firstChild);

  function clearLocationResults(){
    locationResults.innerHTML = "";
    locationResults.style.display = "none";
  }

  function resetLocationSearch(){
    selectedLocation = null;
    locationInput.value = "";
    locationSelectedDisplay.textContent = "";
    clearLocationResults();
  }

  function setVenueLocation(lat, lng, label){

  selectedLocation = {
    display_name: label || "Custom map location",
    lat: parseFloat(lat),
    lng: parseFloat(lng)
  };

  // Create the temporary pin if it doesn't exist.
  if(!locationPickerMarker){

    locationPickerMarker = L.marker(
      [selectedLocation.lat, selectedLocation.lng],
      {
        draggable: true,
        autoPan: true,
        zIndexOffset: 2000
      }
    ).addTo(map);

    locationPickerMarker.bindTooltip(
      "Drag me to the exact venue location",
      {
        permanent: false,
        direction: "top"
      }
    );

    // Update coordinates when the user drags the pin.
    locationPickerMarker.on("dragend", function(){

      var pos = locationPickerMarker.getLatLng();

      selectedLocation.lat = pos.lat;
      selectedLocation.lng = pos.lng;

      locationSelectedDisplay.textContent =
        "✓ Exact location selected on map";

      locationSelectedDisplay.style.color = "#1E4F4F";
    });

  } else {

    locationPickerMarker.setLatLng([
      selectedLocation.lat,
      selectedLocation.lng
    ]);

  }

  locationSelectedDisplay.textContent =
    "✓ Location selected — drag the pin or click the map to adjust it";

  locationSelectedDisplay.style.color = "#1E4F4F";
}

function enterLocationPickerMode(){

  if(!locationPickerMarker){
    alert("Search for a location first.");
    return;
  }

  locationPickerMode = true;

  // Hide the Add Venue modal.
  overlay.classList.add("hidden");

  // Disable sidebar interaction while picking if you want.
  // The map remains fully usable.

  if(!donePinBtn){

    donePinBtn = document.createElement("button");

    donePinBtn.type = "button";

    donePinBtn.textContent = "✓ Done placing pin";

    donePinBtn.style.position = "fixed";
    donePinBtn.style.top = "20px";
    donePinBtn.style.left = "50%";
    donePinBtn.style.transform = "translateX(-50%)";
    donePinBtn.style.zIndex = "9999";

    donePinBtn.style.padding = "12px 20px";
    donePinBtn.style.border = "none";
    donePinBtn.style.borderRadius = "10px";

    donePinBtn.style.background = "#1E4F4F";
    donePinBtn.style.color = "#ffffff";

    donePinBtn.style.fontFamily = "'Inter', sans-serif";
    donePinBtn.style.fontSize = "14px";
    donePinBtn.style.fontWeight = "700";

    donePinBtn.style.cursor = "pointer";

    donePinBtn.style.boxShadow =
      "0 3px 12px rgba(0,0,0,0.25)";

    document.body.appendChild(donePinBtn);

    donePinBtn.addEventListener("click", function(){

      locationPickerMode = false;

      donePinBtn.style.display = "none";

      // Bring the Add Venue modal back.
      overlay.classList.remove("hidden");

      // Ensure Leaflet redraws correctly after the modal disappears/reappears.
      setTimeout(function(){
        map.invalidateSize();
      }, 100);

    });

  }

  donePinBtn.style.display = "block";

  // Leaflet sometimes needs this after layout changes.
  setTimeout(function(){
    map.invalidateSize();
  }, 100);

}
  locationInput.addEventListener("input", function(){
    selectedLocation = null;
    locationSelectedDisplay.textContent = "";
    var q = locationInput.value.trim();
    clearTimeout(locationSearchTimeout);
    if(q.length < 3){ clearLocationResults(); return; }

    locationSearchTimeout = setTimeout(function(){
      fetch(API_BASE + "/venues/search-location?q=" + encodeURIComponent(q))
        .then(function(res){ return res.json(); })
        .then(function(results){
          if(!results.length){
            locationResults.innerHTML = '<div style="padding:8px 10px;font-size:12.5px;color:#5B6472;">No matches found.</div>';
            locationResults.style.display = "block";
            return;
          }
          locationResults.innerHTML = "";
          results.forEach(function(r){
            var item = document.createElement("div");
            item.textContent = r.display_name;
            item.style.padding = "8px 10px";
            item.style.fontSize = "12.5px";
            item.style.cursor = "pointer";
            item.style.borderBottom = "1px solid #F0EDE3";
            item.addEventListener("mouseenter", function(){ item.style.background = "#F0EDE3"; });
            item.addEventListener("mouseleave", function(){ item.style.background = "transparent"; });
            item.addEventListener("click", function(){

  locationInput.value = r.display_name;

  clearLocationResults();

  setVenueLocation(
    r.lat,
    r.lng,
    r.display_name
  );

  // Move the map to the searched location.
  map.flyTo(
    [r.lat, r.lng],
    17,
    {
      duration: 0.6
    }
  );

});
            locationResults.appendChild(item);
          });
          locationResults.style.display = "block";
        })
        .catch(function(){
          locationResults.innerHTML = '<div style="padding:8px 10px;font-size:12.5px;color:#D9695A;">Search failed. Try again.</div>';
          locationResults.style.display = "block";
        });
    }, 400);
  });
map.on("click", function(e){

  // Don't accidentally move venue locations during normal browsing.
  if(!isPickingVenueLocation) return;

  setVenueLocation(
    e.latlng.lat,
    e.latlng.lng,
    "Custom map location"
  );

});
  // ---------- Audio clip: record via mic, or upload a file (5-10s) ----------
  var MIN_CLIP_SECONDS = 5;
  var MAX_CLIP_SECONDS = 10;

  var pendingAudioBlob = null;
  var lastMeasuredDb = null;
  var mediaRecorder = null;
  var mediaStream = null;
  var recordChunks = [];
  var recordStartTime = null;
  var recordTimerInterval = null;
  var autoStopTimeout = null;

  var audioField = document.createElement("div");
  audioField.className = "field";
  audioField.id = "audio-clip-field";

  var audioLabel = document.createElement("label");
  audioLabel.textContent = "Record or upload a 5–10s clip";
  audioLabel.style.display = "block";
  audioLabel.style.marginBottom = "6px";
  audioField.appendChild(audioLabel);

  var audioControlsRow = document.createElement("div");
  audioControlsRow.style.display = "flex";
  audioControlsRow.style.alignItems = "center";
  audioControlsRow.style.gap = "10px";
  audioControlsRow.style.flexWrap = "wrap";

  var recordBtn = document.createElement("button");
  recordBtn.type = "button";
  recordBtn.id = "record-btn";
  recordBtn.textContent = "● Record clip";
  recordBtn.style.padding = "8px 14px";
  recordBtn.style.fontFamily = "'Inter', sans-serif";
  recordBtn.style.fontSize = "13px";
  recordBtn.style.fontWeight = "600";
  recordBtn.style.color = "#D9695A";
  recordBtn.style.background = "#ffffff";
  recordBtn.style.border = "1.5px solid #D9695A";
  recordBtn.style.borderRadius = "8px";
  recordBtn.style.cursor = "pointer";

  var recordTimerLabel = document.createElement("span");
  recordTimerLabel.id = "record-timer";
  recordTimerLabel.style.fontFamily = "monospace";
  recordTimerLabel.style.fontSize = "12.5px";
  recordTimerLabel.style.color = "#5B6472";
  recordTimerLabel.textContent = "";

  var uploadLabel = document.createElement("label");
  uploadLabel.textContent = "or choose a file";
  uploadLabel.style.fontSize = "12.5px";
  uploadLabel.style.color = "#2B6E6E";
  uploadLabel.style.textDecoration = "underline";
  uploadLabel.style.cursor = "pointer";

  var audioFileInput = document.createElement("input");
  audioFileInput.type = "file";
  audioFileInput.accept = "audio/*";
  audioFileInput.hidden = true;
  uploadLabel.appendChild(audioFileInput);

  audioControlsRow.appendChild(recordBtn);
  audioControlsRow.appendChild(recordTimerLabel);
  audioControlsRow.appendChild(uploadLabel);
  audioField.appendChild(audioControlsRow);

  var audioResult = document.createElement("div");
  audioResult.id = "audio-result";
  audioResult.style.display = "none";
  audioResult.style.marginTop = "10px";
  audioResult.style.alignItems = "center";
  audioResult.style.gap = "10px";
  audioResult.style.flexWrap = "wrap";

  var audioPlayback = document.createElement("audio");
  audioPlayback.controls = true;
  audioPlayback.style.height = "32px";

  var audioDurationBadge = document.createElement("span");
  audioDurationBadge.style.fontFamily = "monospace";
  audioDurationBadge.style.fontSize = "11.5px";
  audioDurationBadge.style.fontWeight = "700";
  audioDurationBadge.style.color = "#1E4F4F";
  audioDurationBadge.style.background = "#E1F5EE";
  audioDurationBadge.style.padding = "2px 8px";
  audioDurationBadge.style.borderRadius = "8px";

  var removeAudioBtn = document.createElement("button");
  removeAudioBtn.type = "button";
  removeAudioBtn.textContent = "Remove";
  removeAudioBtn.style.fontSize = "12px";
  removeAudioBtn.style.color = "#5B6472";
  removeAudioBtn.style.background = "none";
  removeAudioBtn.style.border = "1px solid #E3DFD3";
  removeAudioBtn.style.borderRadius = "6px";
  removeAudioBtn.style.padding = "4px 10px";
  removeAudioBtn.style.cursor = "pointer";

  audioResult.appendChild(audioPlayback);
  audioResult.appendChild(audioDurationBadge);
  audioResult.appendChild(removeAudioBtn);
  audioField.appendChild(audioResult);

  var audioStatus = document.createElement("p");
  audioStatus.id = "audio-status";
  audioStatus.style.fontSize = "12px";
  audioStatus.style.margin = "8px 0 0 0";
  audioStatus.style.minHeight = "14px";
  audioField.appendChild(audioStatus);

  var venueTimeField = document.getElementById("venue-time").closest(".field");
  if(venueTimeField) venueTimeField.style.display = "none";

  var quietSliderField = document.getElementById("quiet-slider").closest(".field");
  quietSliderField.parentNode.insertBefore(audioField, quietSliderField);

  function setAudioStatus(msg, kind){
    audioStatus.textContent = msg;
    audioStatus.style.color = kind === "error" ? "#D9695A" : (kind === "success" ? "#1E4F4F" : "#5B6472");
  }

  function resetAudioClip(){
    pendingAudioBlob = null;
    lastMeasuredDb = null;
    audioFileInput.value = "";
    audioResult.style.display = "none";
    audioPlayback.src = "";
    setAudioStatus("", "");
    recordTimerLabel.textContent = "";
    recordBtn.textContent = "● Record clip";
    recordBtn.disabled = false;
  }

  function finishClip(blob, duration){
    pendingAudioBlob = blob;
    var url = URL.createObjectURL(blob);
    audioPlayback.src = url;
    audioDurationBadge.textContent = duration.toFixed(1) + "s";
    audioResult.style.display = "flex";
    setAudioStatus("Analyzing clip...", "");
    analyzeAudioClip();
  }

  var AUDIO_API_BASE = API_BASE + '/audio';

  function analyzeAudioClip(){
    fetch(AUDIO_API_BASE + '/analyze', {
      method: 'POST',
      body: (function(){
        var form = new FormData();
        form.append('clip', pendingAudioBlob, 'clip.webm');
        return form;
      })()
    })
      .then(function(res){
        if(!res.ok) return res.json().then(function(d){ throw new Error(d.error || 'Analysis failed.'); });
        return res.json();
      })
      .then(function(data){
        var suggested = data.suggested_score;
        lastMeasuredDb = data.mean_volume_dbfs;
        var slider = document.getElementById("quiet-slider");
        slider.value = suggested;
        updateSliderPreview();
        setAudioStatus(
          "Loudness: " + data.loudness_10 + "/10 — suggested \"" + suggested + " · " + quietLabel(suggested) + "\", adjust the slider if needed.",
          "success"
        );
      })
      .catch(function(err){
        setAudioStatus(err.message || "Couldn't analyze that clip. You can still rate manually.", "error");
      });
  }

  removeAudioBtn.addEventListener("click", resetAudioClip);

  audioFileInput.addEventListener("change", function(e){
    if(!e.target.files.length) return;
    var file = e.target.files[0];
    if(file.type.indexOf("audio/") !== 0){
      setAudioStatus("That doesn't look like an audio file.", "error");
      return;
    }
    var probe = new Audio();
    var objUrl = URL.createObjectURL(file);
    probe.preload = "metadata";
    probe.onloadedmetadata = function(){
      URL.revokeObjectURL(objUrl);
      var duration = probe.duration;
      if(duration < MIN_CLIP_SECONDS){
        setAudioStatus("Clip is only " + duration.toFixed(1) + "s — needs to be at least " + MIN_CLIP_SECONDS + "s.", "error");
        return;
      }
      if(duration > MAX_CLIP_SECONDS){
        setAudioStatus("Clip is " + duration.toFixed(1) + "s — please trim to " + MAX_CLIP_SECONDS + "s or under.", "error");
        return;
      }
      finishClip(file, duration);
    };
    probe.onerror = function(){
      setAudioStatus("Couldn't read that file — try a different format.", "error");
    };
    probe.src = objUrl;
  });

  function stopRecordingTimer(){
    clearInterval(recordTimerInterval);
    clearTimeout(autoStopTimeout);
    recordTimerInterval = null;
    autoStopTimeout = null;
  }

  recordBtn.addEventListener("click", function(){
    if(mediaRecorder && mediaRecorder.state === "recording"){
      mediaRecorder.stop();
      return;
    }

    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      setAudioStatus("Microphone recording isn't supported on this browser.", "error");
      return;
    }

    recordBtn.disabled = true;
    setAudioStatus("Requesting microphone access...", "");

    navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: false,
        noiseSuppression: false,
        echoCancellation: false
      }
    }).then(function(stream){
      mediaStream = stream;
      recordChunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = function(e){
        if(e.data.size > 0) recordChunks.push(e.data);
      };

      mediaRecorder.onstop = function(){
        stopRecordingTimer();
        mediaStream.getTracks().forEach(function(t){ t.stop(); });

        var elapsedSeconds = (Date.now() - recordStartTime) / 1000;
        var blob = new Blob(recordChunks, { type: "audio/webm" });

        recordBtn.textContent = "● Record clip";
        recordBtn.disabled = false;

        if(elapsedSeconds < MIN_CLIP_SECONDS){
          setAudioStatus("Recording was only " + elapsedSeconds.toFixed(1) + "s — needs at least " + MIN_CLIP_SECONDS + "s. Try again.", "error");
          return;
        }
        finishClip(blob, elapsedSeconds);
      };

      mediaRecorder.start();
      recordStartTime = Date.now();
      recordBtn.disabled = true;
      recordBtn.textContent = "■ Stop";
      setAudioStatus("Recording... minimum " + MIN_CLIP_SECONDS + "s", "");

      recordTimerInterval = setInterval(function(){
        var elapsed = (Date.now() - recordStartTime) / 1000;
        recordTimerLabel.textContent = elapsed.toFixed(1) + "s";
        if(elapsed >= MIN_CLIP_SECONDS){
          recordBtn.disabled = false;
          recordBtn.textContent = "■ Stop (" + elapsed.toFixed(0) + "s)";
        }
      }, 100);

      autoStopTimeout = setTimeout(function(){
        if(mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
      }, MAX_CLIP_SECONDS * 1000);

    }).catch(function(err){
      recordBtn.disabled = false;
      if(err.name === "NotAllowedError"){
        setAudioStatus("Microphone access denied.", "error");
      } else {
        setAudioStatus("Couldn't access the microphone.", "error");
      }
    });
  });

  var overlay = document.getElementById("modal-overlay");
  var modalMode = "new";
  var ratingTargetId = null;

  function openModal(mode, venueId){
    resetAudioClip();
    if(mediaRecorder && mediaRecorder.state === "recording"){
      mediaRecorder.stop();
    }
    modalMode = mode;
    ratingTargetId = venueId || null;
    var newFields = document.getElementById("fields-new-venue");
    if(mode === "new"){
      if(!requireLogin("add a venue")) return;
      document.getElementById("modal-title").textContent = "Add a venue";
      document.getElementById("modal-sub").textContent = "Log a place and its quietness so others know before they go.";
      newFields.style.display = "";
      document.getElementById("venue-name").value = "";
      document.getElementById("venue-category").value = "cafe";
      document.getElementById("venue-access").checked = false;
      document.getElementById("venue-toilet").checked = false;
      resetLocationSearch();
      isPickingVenueLocation = true;

locationSelectedDisplay.textContent =
  "Search for the venue, then click or drag the pin to its exact location.";

locationSelectedDisplay.style.color = "#5B6472";
    } else {
      isPickingVenueLocation = false;
      if(!requireLogin("rate a venue")) return;
      var v = venues.find(function(x){ return x.id === venueId; });
      document.getElementById("modal-title").textContent = "Rate " + v.name;
      document.getElementById("modal-sub").textContent = "Add your own quietness reading for this place.";
      newFields.style.display = "none";
      document.getElementById("venue-access").checked = v.access;
      document.getElementById("venue-toilet").checked = v.toilet;
    }
    document.getElementById("quiet-slider").value = 3;
    updateSliderPreview();
    overlay.classList.remove("hidden");
    document.getElementById("venue-name").focus ? (mode==="new" && document.getElementById("venue-name").focus()) : null;
  }

  function closeModal(){

  overlay.classList.add("hidden");

  isPickingVenueLocation = false;

  if(locationPickerMarker){

    map.removeLayer(locationPickerMarker);

    locationPickerMarker = null;

  }

}

  function updateSliderPreview(){
    var q = parseInt(document.getElementById("quiet-slider").value, 10);
    document.getElementById("slider-readout").textContent = q + " · " + quietLabel(q);
    renderWaveform(document.getElementById("preview-waveform"), q, 999);
  }

  document.getElementById("quiet-slider").addEventListener("input", updateSliderPreview);
  document.getElementById("open-add-venue").addEventListener("click", function(){ openModal("new"); });
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  overlay.addEventListener("click", function(e){ if(e.target === overlay) closeModal(); });

  var submitBtn = document.getElementById("modal-submit");

  submitBtn.addEventListener("click", function(){
    var q = parseInt(document.getElementById("quiet-slider").value, 10);
    var access = document.getElementById("venue-access").checked;
    var toilet = document.getElementById("venue-toilet").checked;

    if(modalMode === "new"){
      var name = document.getElementById("venue-name").value.trim();
      if(!name){ document.getElementById("venue-name").focus(); return; }
      if(!selectedLocation){
        locationSelectedDisplay.textContent = "Please search and select a location first.";
        locationSelectedDisplay.style.color = "#D9695A";
        document.getElementById("location-search-input").focus();
        return;
      }
      var category = document.getElementById("venue-category").value;

      submitBtn.disabled = true;
      fetch(API_BASE + "/venues", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
        body: JSON.stringify({
          name: name,
          category: category,
          lat: selectedLocation.lat,
          lng: selectedLocation.lng,
          score: q,
          access: access,
          toilet: toilet,
          measured_db: lastMeasuredDb,
          had_audio_clip: !!pendingAudioBlob
        })
      })
        .then(function(res){
          if(!res.ok) return res.json().then(function(d){ throw new Error(d.error || "Could not save venue."); });
          return res.json();
        })
        .then(function(){
          closeModal();
          loadVenues();
        })
        .catch(function(err){
          alert(err.message);
        })
        .finally(function(){ submitBtn.disabled = false; });

    } else {
      submitBtn.disabled = true;
      fetch(API_BASE + "/venues/" + ratingTargetId + "/ratings", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
        body: JSON.stringify({
          score: q,
          access: access,
          toilet: toilet,
          measured_db: lastMeasuredDb,
          had_audio_clip: !!pendingAudioBlob
        })
      })
        .then(function(res){
          if(!res.ok) return res.json().then(function(d){ throw new Error(d.error || "Could not save rating."); });
          return res.json();
        })
        .then(function(){
          closeModal();
          loadVenues();
        })
        .catch(function(err){
          alert(err.message);
        })
        .finally(function(){ submitBtn.disabled = false; });
    }
  });

  window.__ssOpenRate = function(id){ openModal("rate", id); };

  // ---------- Load venues from the real backend ----------
  function loadVenues(){
    fetch(API_BASE + "/venues")
      .then(function(res){ return res.json(); })
      .then(function(data){
        clearMarkers();
        venues = data;
        venues.forEach(buildMarker);
        renderChips();
        renderList();
        updateMarkerVisibility();
      })
      .catch(function(err){
        console.error("Failed to load venues:", err);
        document.getElementById("venue-list").innerHTML =
          '<div class="empty-state">Could not reach the server. Is the backend running?</div>';
      });
  }

  renderChips();
  loadVenues();
})();