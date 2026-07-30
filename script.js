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
  var state = {category:"all", search:"", accessOnly:false, toiletOnly:false, selected:null};

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

  var map = L.map('map', {zoomControl:true}).setView([12.0022, 79.8100], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);

  var markers = {};

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
    var visible = venues.filter(matchesFilters).sort(function(a,b){ return b.quiet - a.quiet; });
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
      left.innerHTML = '<p class="venue-name">'+escapeHTML(v.name)+'</p><p class="venue-cat">'+CATEGORY_LABELS[v.category].replace(/s$/,'')+' · '+v.time+'</p>';
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

  var overlay = document.getElementById("modal-overlay");
  var modalMode = "new";
  var ratingTargetId = null;

  function openModal(mode, venueId){
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