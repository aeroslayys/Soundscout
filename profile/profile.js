(function(){

  // Adjust this if your login page lives somewhere else relative to /profile/
  var LOGIN_PAGE_URL = "../index.html";

  var TIME_BUCKET_LABELS = {morning:"11am", afternoon:"3pm", evening:"7pm", night:"11pm"};

  function quietColor(score){
    var t = (score - 1) / 4;
    var qc = [0x4E,0x8F,0x73], lc = [0xBD,0x5B,0x45];
    var mix = function(i){ return Math.round(qc[i] + (lc[i]-qc[i]) * (1 - t)); };
    return "rgb(" + mix(0) + "," + mix(1) + "," + mix(2) + ")";
  }

  function quietLabel(score){
    var rounded = Math.max(1, Math.min(5, Math.round(score)));
    return {1:"Loud", 2:"Lively", 3:"Moderate", 4:"Calm", 5:"Silent"}[rounded];
  }

  function dbEstimate(score){
    var anchors = {1:78, 2:65, 3:52, 4:42, 5:34};
    var rounded = Math.max(1, Math.min(5, Math.round(score)));
    return "~" + anchors[rounded] + " dB";
  }

  function relativeTime(timestamp){
    var diffMs = Date.now() - timestamp;
    var diffMin = Math.floor(diffMs / 60000);
    if(diffMin < 1) return "just now";
    if(diffMin < 60) return diffMin + "m ago";
    var diffHr = Math.floor(diffMin / 60);
    if(diffHr < 24) return diffHr + "h ago";
    var diffDay = Math.floor(diffHr / 24);
    if(diffDay < 7) return diffDay + "d ago";
    var diffWeek = Math.floor(diffDay / 7);
    if(diffWeek < 5) return diffWeek + "w ago";
    return new Date(timestamp).toLocaleDateString();
  }

  // ---------- Require login ----------
  var token = localStorage.getItem("soundscout_token");
  var userRaw = localStorage.getItem("soundscout_user");

  if(!token || !userRaw){
    window.location.href = LOGIN_PAGE_URL;
    return;
  }

  var user = JSON.parse(userRaw);

  // ---------- Populate profile header ----------
  function initialsFor(name){
    if(!name) return "?";
    var parts = name.trim().split(/\s+/);
    var initials = parts[0][0] || "";
    if(parts.length > 1) initials += parts[parts.length - 1][0];
    return initials.toUpperCase();
  }

  document.getElementById("avatarInitials").textContent = initialsFor(user.name);
  document.getElementById("profileName").textContent = user.name || "—";
  document.getElementById("profileEmail").textContent = user.email || "—";
  document.getElementById("profileAge").textContent = "Age " + (user.age !== undefined ? user.age : "—");
  document.getElementById("profileSensitivity").textContent = "Sensitivity " + (user.sensitivity !== undefined ? user.sensitivity + "/5" : "—");

  document.getElementById("logoutBtn").addEventListener("click", function(){
    localStorage.removeItem("soundscout_token");
    localStorage.removeItem("soundscout_user");
    window.location.href = LOGIN_PAGE_URL;
  });

  // ---------- Ratings data ----------
  // SAMPLE DATA — structured exactly like what a real backend endpoint
  // should return. Once venues/ratings are persisted server-side and tied
  // to a user id, replace this block with:
  //
  // const res = await fetch('/api/users/me/ratings', {
  //   headers: { Authorization: `Bearer ${token}` }
  // });
  // const myRatings = await res.json();
  var myRatings = [
    { venueName:"Blue Fox Café", category:"Café", score:4, time:"morning", timestamp:Date.now() - 1000*60*60*6, access:true, toilet:false },
    { venueName:"Reading Room Library", category:"Library", score:5, time:"afternoon", timestamp:Date.now() - 1000*60*60*30, access:true, toilet:true },
    { venueName:"Grind House Gym", category:"Gym", score:1, time:"evening", timestamp:Date.now() - 1000*60*60*24*3, access:false, toilet:false },
    { venueName:"Fern & Fork", category:"Restaurant", score:3, time:"afternoon", timestamp:Date.now() - 1000*60*60*24*8, access:true, toilet:true },
    { venueName:"Tangerine Reading Room", category:"Library", score:4, time:"night", timestamp:Date.now() - 1000*60*60*24*16, access:true, toilet:true }
  ];

  // ---------- Stats ----------
  var statsRow = document.getElementById("statsRow");
  var totalRatings = myRatings.length;
  var avgScore = totalRatings ? (myRatings.reduce(function(s,r){ return s+r.score; }, 0) / totalRatings) : null;
  var uniqueVenues = new Set(myRatings.map(function(r){ return r.venueName; })).size;

  function statBox(value, label){
    var box = document.createElement("div");
    box.className = "stat-box";
    box.innerHTML = '<div class="stat-value">' + value + '</div><div class="stat-label">' + label + '</div>';
    return box;
  }

  statsRow.appendChild(statBox(totalRatings, "Ratings submitted"));
  statsRow.appendChild(statBox(avgScore !== null ? avgScore.toFixed(1) : "—", "Avg quietness given"));
  statsRow.appendChild(statBox(uniqueVenues, "Venues rated"));

  // ---------- Ratings list ----------
  document.getElementById("ratingsCount").textContent =
    totalRatings + (totalRatings === 1 ? " rating" : " ratings");

  var listEl = document.getElementById("ratingsList");

  if(!totalRatings){
    listEl.innerHTML = '<div class="empty-state">You haven\'t rated any venues yet. <a href="../home/home.html">Find a venue to rate →</a></div>';
    return;
  }

  myRatings
    .slice()
    .sort(function(a,b){ return b.timestamp - a.timestamp; })
    .forEach(function(r){
      var card = document.createElement("div");
      card.className = "rating-card";

      var badge = document.createElement("div");
      badge.className = "rating-score-badge";
      badge.style.background = quietColor(r.score);
      badge.textContent = r.score;

      var body = document.createElement("div");
      body.className = "rating-body";

      var tagsHTML = "";
      if(r.access) tagsHTML += '<span class="rating-tag">Step-free</span>';
      if(r.toilet) tagsHTML += '<span class="rating-tag">Gender-neutral</span>';

      body.innerHTML =
        '<p class="rating-venue-name">' + r.venueName + '</p>' +
        '<p class="rating-meta">' + r.category + ' · ' + quietLabel(r.score) + ' (' + dbEstimate(r.score) + ') · ' +
          TIME_BUCKET_LABELS[r.time] + ' · ' + relativeTime(r.timestamp) + '</p>' +
        (tagsHTML ? '<div class="rating-tags">' + tagsHTML + '</div>' : '');

      card.appendChild(badge);
      card.appendChild(body);
      listEl.appendChild(card);
    });

})();