(function(){

  var CATEGORIES = ["all","cafe","restaurant","library","gym","coworking"];
  var CATEGORY_LABELS = {all:"All", cafe:"Cafés", restaurant:"Restaurants", library:"Libraries", gym:"Gyms", coworking:"Coworking"};

  var venues = [
    {id:1, name:"Tangerine Reading Room", category:"library", lat:12.0068, lng:79.8107, quiet:5, time:"afternoon", access:true, toilet:true},
    {id:2, name:"Marigold Coworking", category:"coworking", lat:12.0022, lng:79.8073, quiet:3, time:"morning", access:true, toilet:true},
    {id:3, name:"Two Rivers Café", category:"cafe", lat:11.9989, lng:79.8135, quiet:2, time:"afternoon", access:false, toilet:false},
    {id:4, name:"Solaris Fitness Studio", category:"gym", lat:12.0105, lng:79.8051, quiet:1, time:"evening", access:true, toilet:false},
    {id:5, name:"Amber Leaf Restaurant", category:"restaurant", lat:11.9955, lng:79.8098, quiet:2, time:"evening", access:false, toilet:true},
    {id:6, name:"Quiet Hour Books & Coffee", category:"cafe", lat:12.0041, lng:79.8161, quiet:4, time:"morning", access:true, toilet:true},
    {id:7, name:"Origin Community Library", category:"library", lat:11.9917, lng:79.8047, quiet:5, time:"morning", access:true, toilet:false},
    {id:8, name:"The Loft Coworking", category:"coworking", lat:12.0084, lng:79.8189, quiet:3, time:"afternoon", access:false, toilet:true}
  ];

  var nextId = 9;
  var state = {category:"all", search:"", accessOnly:false, toiletOnly:false, selected:null, userLocation:null, sortByDistance:false};

  function quietColor(q){
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

  function dbEstimate(quiet){
    var table = {1:"~78 dB", 2:"~65 dB", 3:"~52 dB", 4:"~42 dB", 5:"~34 dB"};
    return table[quiet] || "";
  }

  function quietLabel(q){
    return {1:"Loud", 2:"Lively", 3:"Moderate", 4:"Calm", 5:"Silent"}[q];
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
      html:'<div class="ss-marker" style="background:'+quietColor(v.quiet)+'"></div>',
      iconSize:[16,16]
    });
    var m = L.marker([v.lat, v.lng], {icon:icon}).addTo(map);
    m.bindPopup(popupHTML(v));
    m.on('click', function(){ selectVenue(v.id, false); });
    markers[v.id] = m;
  }

  function popupHTML(v){
    return '<div class="popup-body"><h3>'+escapeHTML(v.name)+'</h3>' +
      '<p class="popup-cat">'+CATEGORY_LABELS[v.category].replace(/s$/,'')+' · '+quietLabel(v.quiet)+' · '+dbEstimate(v.quiet)+'</p>' +
      '<button class="popup-rate-btn" onclick="window.__ssOpenRate('+v.id+')">Rate this place</button></div>';
  }

  function escapeHTML(s){
    return s.replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; });
  }

  venues.forEach(buildMarker);

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
      visible.sort(function(a,b){ return b.quiet - a.quiet; });
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
      var card = document.createElement("div");
      card.className = "venue-card" + (state.selected === v.id ? " selected" : "");
      card.setAttribute("tabindex","0");
      card.setAttribute("role","button");
      card.setAttribute("aria-label", v.name + ", " + quietLabel(v.quiet));

      var top = document.createElement("div");
      top.className = "venue-top";
      var left = document.createElement("div");
      var distLabel = distanceLabel(v);
      var metaLine = CATEGORY_LABELS[v.category].replace(/s$/,'') + ' · ' + v.time + (distLabel ? ' · ' + distLabel : '');
      left.innerHTML = '<p class="venue-name">'+escapeHTML(v.name)+'</p><p class="venue-cat">'+metaLine+'</p>';
      var right = document.createElement("div");
      right.className = "db-reading";
      right.textContent = dbEstimate(v.quiet);
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
      renderWaveform(wf, v.quiet, v.id * 13);
    });
  }

  function selectVenue(id, flyTo){
    state.selected = id;
    renderList();
    var v = venues.find(function(x){ return x.id === id; });
    if(v){
      if(flyTo) map.flyTo([v.lat, v.lng], 15, {duration:0.6});
      markers[id].openPopup();
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

  // Minimal styles for the "you are here" marker, injected so home.css
  // doesn't need to be touched. Move this into home.css if you'd rather.
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
        // API: once you have a real backend, swap the client-side sort above
        // for a direct query, e.g.
        // fetch(`/api/venues/nearby?lat=${lat}&lng=${lng}&radius=2000`)
        // using the PostGIS ST_DWithin query from the venues schema.
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

  // ---------- Audio clip: record via mic, or upload a file (5-10s) ----------
  var MIN_CLIP_SECONDS = 5;
  var MAX_CLIP_SECONDS = 10;

  var pendingAudioBlob = null;
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

  var quietSliderField = document.getElementById("quiet-slider").closest(".field");
  quietSliderField.parentNode.insertBefore(audioField, quietSliderField);

  function setAudioStatus(msg, kind){
    audioStatus.textContent = msg;
    audioStatus.style.color = kind === "error" ? "#D9695A" : (kind === "success" ? "#1E4F4F" : "#5B6472");
  }

  function resetAudioClip(){
    pendingAudioBlob = null;
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

  var AUDIO_API_BASE = 'http://localhost:4000/api/audio';

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
        var slider = document.getElementById("quiet-slider");
        slider.value = suggested;
        updateSliderPreview();
        var maxLine = (data.max_volume_dbfs !== null && data.max_volume_dbfs !== undefined)
          ? " (peak " + data.max_volume_dbfs + " dBFS)"
          : "";
        setAudioStatus(
          "Measured " + data.mean_volume_dbfs + " dBFS avg" + maxLine + " — suggested \"" + suggested + " · " + quietLabel(suggested) + "\", adjust the slider if needed.",
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
      document.getElementById("modal-title").textContent = "Add a venue";
      document.getElementById("modal-sub").textContent = "Log a place and its quietness so others know before they go.";
      newFields.style.display = "";
      document.getElementById("venue-name").value = "";
      document.getElementById("venue-category").value = "cafe";
      document.getElementById("venue-access").checked = false;
      document.getElementById("venue-toilet").checked = false;
    } else {
      var v = venues.find(function(x){ return x.id === venueId; });
      document.getElementById("modal-title").textContent = "Rate " + v.name;
      document.getElementById("modal-sub").textContent = "Add your own quietness reading for this place.";
      newFields.style.display = "none";
    }
    document.getElementById("quiet-slider").value = 3;
    updateSliderPreview();
    overlay.classList.remove("hidden");
    document.getElementById("venue-name").focus ? (mode==="new" && document.getElementById("venue-name").focus()) : null;
  }

  function closeModal(){ overlay.classList.add("hidden"); }

  function updateSliderPreview(){
    var q = parseInt(document.getElementById("quiet-slider").value, 10);
    document.getElementById("slider-readout").textContent = q + " · " + quietLabel(q);
    renderWaveform(document.getElementById("preview-waveform"), q, 999);
  }

  document.getElementById("quiet-slider").addEventListener("input", updateSliderPreview);
  document.getElementById("open-add-venue").addEventListener("click", function(){ openModal("new"); });
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  overlay.addEventListener("click", function(e){ if(e.target === overlay) closeModal(); });

  document.getElementById("modal-submit").addEventListener("click", function(){
    var q = parseInt(document.getElementById("quiet-slider").value, 10);
    var time = document.getElementById("venue-time").value;

    if(modalMode === "new"){
      var name = document.getElementById("venue-name").value.trim();
      if(!name){ document.getElementById("venue-name").focus(); return; }
      var category = document.getElementById("venue-category").value;
      var access = document.getElementById("venue-access").checked;
      var toilet = document.getElementById("venue-toilet").checked;
      var center = map.getCenter();
      var jitterLat = (pseudoRandom(nextId*7) - 0.5) * 0.01;
      var jitterLng = (pseudoRandom(nextId*11) - 0.5) * 0.01;
      var v = {id:nextId, name:name, category:category, lat:center.lat+jitterLat, lng:center.lng+jitterLng, quiet:q, time:time, access:access, toilet:toilet};
      venues.push(v);
      buildMarker(v);
      nextId++;
    
    } else {
      var target = venues.find(function(x){ return x.id === ratingTargetId; });
      if(target){
        target.quiet = Math.round((target.quiet + q) / 2);
        target.time = time;
        markers[target.id].setIcon(L.divIcon({
          className:"",
          html:'<div class="ss-marker" style="background:'+quietColor(target.quiet)+'"></div>',
          iconSize:[16,16]
        }));
        markers[target.id].setPopupContent(popupHTML(target));
      }
    }
    renderList();
    updateMarkerVisibility();
    closeModal();
  });

  window.__ssOpenRate = function(id){ openModal("rate", id); };

  renderChips();
  renderList();
})();