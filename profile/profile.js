
/* Keep the profile page in sync with the map and login theme preference. */
(function(){
  var key = "soundscout_theme";
  var saved = localStorage.getItem(key);
  var theme = saved === "light" || saved === "dark" ? saved : "dark";
  var root = document.documentElement;
  var button = document.getElementById("themeToggle");

  function applyTheme(next){
    theme = next;
    root.setAttribute("data-theme", theme);
    localStorage.setItem(key, theme);
    if(button){
      button.textContent = theme === "dark" ? "☀" : "☾";
      button.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
      button.title = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    }
  }

  applyTheme(theme);
  if(button){
    button.addEventListener("click", function(){
      applyTheme(theme === "dark" ? "light" : "dark");
    });
  }
})();

(function(){

  var API_BASE = "/api";
  var LOGIN_PAGE_URL = "../index.html";

  var TIME_BUCKET_LABELS = {morning:"Morning", afternoon:"Afternoon", evening:"Evening", night:"Night"};
  var CATEGORY_LABELS = {cafe:"Café", restaurant:"Restaurant", library:"Library", gym:"Gym", coworking:"Coworking"};

  function escapeHTML(value){

  return String(value).replace(
    /[&<>"']/g,
    function(character){

      return {

        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"

      }[character];

    }
  );

}

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

  fetch(API_BASE + "/partner/venues", {
    headers: { "Authorization": "Bearer " + token }
  }).then(function(response) {
    if (!response.ok) throw new Error("No partner access");
    return response.json();
  }).then(function(data) {
    var partnerVenues = data.venues || [];
    if (!partnerVenues.length) return;
    document.getElementById("partnerAccessSection").hidden = false;
    document.getElementById("partnerVenueSummary").textContent =
      "You can manage announcements for " + partnerVenues.map(function(venue) { return venue.venue_name; }).join(", ") + ".";
  }).catch(function() {});

  var announcementPreference = document.getElementById("announcementPreference");
  var announcementPreferenceStatus = document.getElementById("announcementPreferenceStatus");
  fetch(API_BASE + "/users/me/preferences", {
    headers: { "Authorization": "Bearer " + token }
  }).then(function(response) {
    if (!response.ok) throw new Error("Could not load email preferences.");
    return response.json();
  }).then(function(data) {
    announcementPreference.checked = data.announcementOptIn === true;
  }).catch(function(error) {
    announcementPreferenceStatus.textContent = error.message;
  });

  announcementPreference.addEventListener("change", function() {
    var subscribed = announcementPreference.checked;
    announcementPreference.disabled = true;
    announcementPreferenceStatus.textContent = "Saving…";
    fetch(API_BASE + "/users/me/preferences/announcements", {
      method: "PATCH",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ subscribed: subscribed })
    }).then(function(response) {
      return response.json().then(function(data) {
        if (!response.ok) throw new Error(data.error || "Could not update email preferences.");
        return data;
      });
    }).then(function(data) {
      announcementPreference.checked = data.announcementOptIn === true;
      announcementPreferenceStatus.textContent = data.announcementOptIn
        ? "You're subscribed to SoundScout product updates."
        : "You're unsubscribed from product updates.";
    }).catch(function(error) {
      announcementPreference.checked = !subscribed;
      announcementPreferenceStatus.textContent = error.message;
    }).finally(function() {
      announcementPreference.disabled = false;
    });
  });


  // ==========================================
// Load venues created by this user
// ==========================================

function loadMyVenues(){

  fetch(
    API_BASE + "/users/me/venues",
    {
      headers: {
        "Authorization":
          "Bearer " + token
      }
    }
  )

    .then(function(res){

      if(res.status === 401){

        localStorage.removeItem(
          "soundscout_token"
        );

        localStorage.removeItem(
          "soundscout_user"
        );

        window.location.href =
          LOGIN_PAGE_URL;

        return null;

      }

      if(!res.ok){

        throw new Error(
          "Could not load your venues."
        );

      }

      return res.json();

    })

    .then(function(myVenues){

      if(myVenues === null) return;

      venuesCountEl.textContent =
        myVenues.length +
        (
          myVenues.length === 1
            ? " venue"
            : " venues"
        );

      if(!myVenues.length){

        venuesListEl.innerHTML =
          '<div class="empty-state">' +
          'You haven\'t added any venues yet. ' +
          '<a href="../home/home.html">' +
          'Add your first venue →' +
          '</a>' +
          '</div>';

        return;

      }


      venuesListEl.innerHTML = "";


      myVenues.forEach(function(v){

        var card =
          document.createElement("div");

        card.className =
          "added-venue-card";


        // -------------------------
        // Average score
        // -------------------------

        var score =
          v.averageScore !== null &&
          v.averageScore !== undefined
            ? Number(v.averageScore)
            : null;

        if(
          score !== null &&
          !Number.isFinite(score)
        ){
          score = null;
        }

        var ratingCount =
          Number(v.ratingCount || 0);

        var averageMeasuredDb =
          v.averageMeasuredDb !== null &&
          v.averageMeasuredDb !== undefined &&
          Number.isFinite(Number(v.averageMeasuredDb))
            ? Number(v.averageMeasuredDb)
            : null;


        var scoreBadge =
          document.createElement("div");

        scoreBadge.className =
          "added-venue-score";


        if(score !== null){

          scoreBadge.textContent =
            score.toFixed(1);

          scoreBadge.style.background =
            quietColor(score);

        } else {

          scoreBadge.textContent = "—";

          scoreBadge.style.background =
            "#9AA3AD";

        }


        // -------------------------
        // Venue information
        // -------------------------

        var body =
          document.createElement("div");

        body.className =
          "added-venue-body";


        var tagsHTML = "";


        if(v.access){

          tagsHTML +=
            '<span class="added-venue-tag">' +
            'Step-free' +
            '</span>';

        }


        if(v.toilet){

          tagsHTML +=
            '<span class="added-venue-tag">' +
            'Gender-neutral' +
            '</span>';

        }


        var ratingText;


        if(score === null){

          ratingText =
            "No ratings yet";

        } else {

          ratingText =
            quietLabel(score) +
            (
              averageMeasuredDb !== null
                ? " · " +
                  averageMeasuredDb.toFixed(1) +
                  " dBFS"
                : ""
            ) +
            " · " +
            ratingCount +
            (
              ratingCount === 1
                ? " rating"
                : " ratings"
            );

        }


        body.innerHTML =

          '<p class="added-venue-name">' +

            escapeHTML(v.name) +

          '</p>' +


          '<p class="added-venue-meta">' +

            (
              CATEGORY_LABELS[v.category] ||
              v.category
            ) +

            ' · ' +

            ratingText +

            ' · Added ' +

            relativeTime(
              new Date(
                v.created_at
              ).getTime()
            ) +

          '</p>' +


          (

            tagsHTML

              ? '<div class="added-venue-tags">' +

                  tagsHTML +

                '</div>'

              : ''

          );


        card.appendChild(
          scoreBadge
        );

        card.appendChild(
          body
        );

        venuesListEl.appendChild(
          card
        );

      });

    })

    .catch(function(err){

      venuesListEl.innerHTML =
        '<div class="empty-state">' +

        err.message +

        '</div>';

    });

}

  // ---------- Fetch real ratings from the backend ----------
  var statsRow = document.getElementById("statsRow");

var listEl =
  document.getElementById("ratingsList");

var venuesListEl =
  document.getElementById("venuesList");

var venuesCountEl =
  document.getElementById("venuesCount");

  function statBox(value, label){
    var box = document.createElement("div");
    box.className = "stat-box";
    box.innerHTML = '<div class="stat-value">' + value + '</div><div class="stat-label">' + label + '</div>';
    return box;
  }
loadMyVenues();
  fetch(API_BASE + "/users/me/ratings", {
    headers: { "Authorization": "Bearer " + token }
  })
    .then(function(res){
      if(res.status === 401){
        // Token expired or invalid — send them back to log in again
        localStorage.removeItem("soundscout_token");
        localStorage.removeItem("soundscout_user");
        window.location.href = LOGIN_PAGE_URL;
        return null;
      }
      if(!res.ok) throw new Error("Could not load your ratings.");
      return res.json();
    })
    .then(function(myRatings){
      if(myRatings === null) return; // redirected above

      var totalRatings = myRatings.length;
      var avgScore = totalRatings ? (myRatings.reduce(function(s,r){ return s+r.score; }, 0) / totalRatings) : null;
      var uniqueVenues = new Set(myRatings.map(function(r){ return r.venueName; })).size;

      statsRow.appendChild(statBox(totalRatings, "Ratings submitted"));
      statsRow.appendChild(statBox(avgScore !== null ? avgScore.toFixed(1) : "—", "Avg quietness given"));
      statsRow.appendChild(statBox(uniqueVenues, "Venues rated"));

      document.getElementById("ratingsCount").textContent =
        totalRatings + (totalRatings === 1 ? " rating" : " ratings");

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

          var measuredDbText = "";

          if(
            r.measured_db !== null &&
            r.measured_db !== undefined &&
            Number.isFinite(Number(r.measured_db))
          ){
            measuredDbText =
              " · " +
              Number(r.measured_db).toFixed(1) +
              " dBFS";
          }

          body.innerHTML =
            '<p class="rating-venue-name">' +
              escapeHTML(r.venueName) +
            '</p>' +
            '<p class="rating-meta">' +
              escapeHTML(
                CATEGORY_LABELS[r.category] ||
                r.category ||
                "Other"
              ) +
              ' · ' +
              quietLabel(r.score) +
              measuredDbText +
              ' · ' +
              escapeHTML(
                TIME_BUCKET_LABELS[r.time] ||
                r.time ||
                "Unknown time"
              ) +
              ' · ' +
              relativeTime(Number(r.timestamp)) +
            '</p>' +
            (
              tagsHTML
                ? '<div class="rating-tags">' +
                    tagsHTML +
                  '</div>'
                : ''
            );

          card.appendChild(badge);
          card.appendChild(body);
          listEl.appendChild(card);
        });
    })
    .catch(function(err){
      listEl.innerHTML = '<div class="empty-state">' + err.message + '</div>';
    });

})();