class Game {
  constructor({ Id, name, description, creator_id, creator_name, thumbnail_version }) {
    this.id = Id;
    this.name = name;
    this.description = description;
    this.creatorId = creator_id;
    this.creatorName = creator_name;
    this.thumbnailVersion = thumbnail_version;
  }

  toString() {
    return `#${this.id} "${this.name}" by ${this.creatorName} — ${this.description}`;
  }

  getThumbnailPath(baseDir = 'thumbnails') {
    return `thumbnails/${this.name}.png`;
  }

}

async function loadGames(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new Error(`Failed to parse JSON from ${url}: ${err.message}`);
  }

  if (!Array.isArray(data)) {
    throw new Error('Expected the JSON file to contain an array of game entries.');
  }

  const requiredFields = ['Id', 'name', 'creator_id', 'creator_name'];
  const games = [];

  data.forEach((entry, index) => {
    const missing = requiredFields.filter((field) => !(field in entry));
    if (missing.length > 0) {
      console.warn(`Skipping entry at index ${index}: missing field(s) ${missing.join(', ')}`);
      return;
    }
    games.push(new Game(entry));
  });

  return games;
}

const app = document.getElementById("app");

/**
 * Client-side navigation: updates the URL without a full page reload,
 * then re-runs the router — same as your Home/Games links already do,
 * just without leaving the SPA.
 */
function navigate(path) {
    history.pushState(null, "", path);
    router();
}

// Handles browser Back/Forward buttons
window.addEventListener("popstate", () => {
    router();
});

// Intercepts clicks on any internal link marked with data-link so
// navigation stays inside the SPA instead of hitting the server again.
document.addEventListener("click", (e) => {
    const link = e.target.closest("a[data-link]");
    if (!link) return;
    e.preventDefault();
    navigate(link.getAttribute("href"));
});

function router() {
    const path = window.location.pathname;

    if (path === "/") {
        navigate("/home");
    }
    else if (path === "/home") {
        homePage();
    }
    else if (path === "/games") {
        gamesPage();
    }
    else if (path.startsWith("/games/")) {
        const id = path.split("/games/")[1];
        gameDetailPage(id);
    }
    else if (path === "/login") {
        loginPage();
    }
    else if (path === "/signup") {
        signupPage();
    }
    else if (path === "/builder") {
        // this is empty on purpose
    }
    else if (path === "/catalog") {
        avatarPage(); // this is always builder/avatar
    }
    else if (path.startsWith("/profile/")) {
        const id = path.split("/profile/")[1];
        profilePage(id);
    }
    else if (path === "/search") {
        searchPage();
    }
    else if (path === "/friends") {
        requestsPage();
    }
    else if (path === "/admin") {
        adminPage();
    }
    else if (path === "/banned") {
        bannedPage();
    }
    else if (path === "/special-page") {
      
    }
    else {
        notFound();
    }
}

function timeOfDayGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "morning";
    if (hour < 18) return "afternoon";
    return "evening";
}

function renderRelationActions(user, onChange) {
    const wrapperId = `relation-actions-${user.id}`;

    setTimeout(() => wireRelationActions(user, onChange), 0);

    let friendBtn;
    switch (user.friendship_status) {
        case "friends":
            friendBtn = `<button class="relation-btn danger" data-action="remove-friend">Remove Friend</button>`;
            break;
        case "pending_outgoing":
            friendBtn = `<button class="relation-btn secondary" data-action="cancel-request">Cancel Request</button>`;
            break;
        case "pending_incoming":
            friendBtn = `
                <button class="relation-btn primary" data-action="accept-request">Accept</button>
                <button class="relation-btn secondary" data-action="decline-request">Decline</button>
            `;
            break;
        case "not_friends":
            friendBtn = `<button class="relation-btn primary" data-action="add-friend">Add Friend</button>`;
            break;
        default: // "self"
            friendBtn = "";
    }

    let followBtn = "";
    if (user.follow_status === "following") {
        followBtn = `<button class="relation-btn secondary" data-action="unfollow">Unfollow</button>`;
    } else if (user.follow_status === "not_following") {
        followBtn = `<button class="relation-btn secondary" data-action="follow">Follow</button>`;
    }

    return `<div class="relation-actions" id="${wrapperId}">${friendBtn}${followBtn}</div>`;
}

function wireRelationActions(user, onChange) {
    const wrapper = document.getElementById(`relation-actions-${user.id}`);
    if (!wrapper) return; // page already navigated away

    wrapper.querySelectorAll("button[data-action]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const action = btn.dataset.action;
            wrapper.querySelectorAll("button").forEach(b => b.disabled = true);

            const actions = {
                "add-friend": () => postJSON("/api/friends/request", { target_id: user.id }),
                "cancel-request": () => postJSON("/api/friends/remove", { target_id: user.id }),
                "remove-friend": () => postJSON("/api/friends/remove", { target_id: user.id }),
                "accept-request": () => postJSON("/api/friends/accept", { requester_id: user.id }),
                "decline-request": () => postJSON("/api/friends/decline", { requester_id: user.id }),
                "follow": () => postJSON("/api/follow", { target_id: user.id }),
                "unfollow": () => postJSON("/api/unfollow", { target_id: user.id }),
            };

            const res = await actions[action]();
            if (res.status === 401) {
                navigate("/login");
                return;
            }
            onChange();
        });
    });
}

async function postJSON(url, body) {
    return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

async function homePage() {
    app.innerHTML = `<p>Loading...</p>`;

    const meRes = await fetch("/api/me");

    if (!meRes.ok) {
        navigate("/login");
        return;
    }

    const me = await meRes.json();
    if (me.is_banned) {
        navigate("/banned");
        return;
    }

    document.title = `RADIAN | Home`;

    app.innerHTML = `
        <div class="home-body">
            <h1 class="home-greeting">Good ${timeOfDayGreeting()}, ${me.username}</h1>
            <div class="home-stats">
                <span>${me.friend_count} Friends</span>
                <span>${me.follower_count} Followers</span>
                <span>${me.following_count} Following</span>
            </div>

            <div class="home-panel">
                <a href="/profile/${me.id}" data-link class="home-panel-header">Friends &rarr;</a>
                <div id="home-friends-row" class="home-tile-row">
                    <p class="home-empty-state">Loading friends...</p>
                </div>
            </div>

            <div class="home-panel-2">
                <a href="/games" data-link class="home-panel-header">Last played &rarr;</a>
                <div id="home-lastplayed-row" class="home-tile-row">
                    <p class="home-empty-state">Loading games...</p>
                </div>
            </div>
        </div>
    `;

    loadHomeFriends();
    loadHomeLastPlayed();
}

/**
 * Populates the Friends panel via GET /api/me/friends. Falls back to a
 * clear empty state if the request fails for any reason instead of
 * showing fake placeholder people.
 */
async function loadHomeFriends() {
    const row = document.getElementById("home-friends-row");
    if (!row) return; // user already navigated away

    try {
        const res = await fetch("/api/me/friends");
        if (!res.ok) throw new Error("no friends endpoint yet");

        const data = await res.json();
        const friends = data.friends || [];
        if (friends.length === 0) {
            row.innerHTML = `<p class="home-empty-state">No friends yet.</p>`;
            return;
        }

        row.innerHTML = friends.map(friend => `
            <a class="friend-tile" href="/profile/${friend.user_id}" data-link>
                <div class="friend-tile-thumb"></div>
                <div class="friend-tile-name">${friend.username}</div>
            </a>
        `).join("");
    } catch (err) {
        // Expected until a real /api/me/friends endpoint exists server-side.
        console.log(err)
        //row.innerHTML = `<p class="home-empty-state">No friends yet.</p>`;
    }
}

/**
 * Populates the Last Played panel. server.py's games.json is a catalog,
 * not a per-user play-history log, so this shows the first few games from
 * the catalog rather than genuine "recently played" data -- swap this out
 * once there's a real endpoint for that.
 */
async function loadHomeLastPlayed() {
    const row = document.getElementById("home-lastplayed-row");
    if (!row) return;

    try {
        const games = await loadGames("/api/games.json");
        if (games.length === 0) {
            row.innerHTML = `<p class="home-empty-state">No games yet.</p>`;
            return;
        }

        row.innerHTML = games.slice(0, 100).map(game => `
            <a class="game-tile" href="/games/${game.id}" data-link>
                <div class="game-tile-thumb">
                    <img src="thumbnails/games/${game.name}.png" alt="${game.name}"
                         onerror="this.parentElement.textContent='${game.name.replace(/'/g, "\\'")}'">
                </div>
                <div class="game-tile-name">${game.name}</div>
                <div class="game-tile-meta">Players: 0</div>
            </a>
        `).join("");
    } catch (err) {
        row.innerHTML = `<p class="home-empty-state">Could not load games.</p>`;
    }
}


/**
 * Game detail page (/games/<id>) -- matches the "Image / GameName / By
 * User / Description / Play" concept art. Reuses the same games.json
 * catalog as the Games grid rather than needing a new endpoint, since
 * Game already carries description/creatorName.
 */
async function gameDetailPage(id) {

    app.innerHTML = `<div class="home-body"><p>Loading...</p></div>`;

    let games;
    try {
        games = await loadGames("/api/games.json");
    } catch (err) {
        console.error("gameDetailPage: failed to load games.json:", err);
        app.innerHTML = `<div class="home-body"><h1>Games</h1><p>Could not load this game: ${err.message}</p></div>`;
        return;
    }

    const game = games.find(g => String(g.id) === String(id));
    if (!game) {
        console.error(`gameDetailPage: no game with id "${id}" in`, games);
        app.innerHTML = `<div class="home-body"><h1>Games</h1><p>Couldn't find that game.</p></div>`;
        return;
    }

    document.title = `RADIAN | ${game.name}`;

    app.innerHTML = `
        <div class="home-body">
            <div class="game-detail-panel">
                <div class="game-detail-main">
                    <div class="game-detail-image">
                        <img src="/thumbnails/${game.name}.png" alt="${game.name}"
                             onerror="this.parentElement.textContent='${game.name.replace(/'/g, "\\'")}'">
                    </div>
                    <div class="game-detail-footer">
                        <div>
                            <div class="game-detail-title">${game.name}</div>
                            <div class="game-detail-byline">By ${game.creatorName}</div>
                        </div>
                        <a class="game-detail-play-btn" href="/play/?id=${game.id}">Play</a>
                    </div>
                </div>
                <div class="game-detail-description">
                    <h3>Description</h3>
                    <p>${game.description || "No description yet."}</p>
                </div>
            </div>
        </div>
    `;
}

window.gameDetailPage = gameDetailPage


async function gamesPage() {
    document.title = `RADIAN | Games`;
    app.innerHTML = `<h1>Games</h1><p>Loading games...</p>`;

    const meRes = await fetch("/api/me");
    const me = await meRes.json();
    if (me.is_banned) {
        navigate("/banned");
        return;
    }

    let games;
    try {
        games = await loadGames("/api/games.json");
    } catch (err) {
        app.innerHTML = `<h1>Games</h1><p>Could not load games: ${err.message}</p>`;
        return;
    }

    if (games.length === 0) {
        app.innerHTML = `<h1>Games</h1><p>No games yet.</p>`;
        return;
    }

    const cards = games.map(game => `
        <a class="game-card" href="/games/${game.id}" data-link>
            <div class="game-card-thumb">
                <img src="${game.getThumbnailPath()}" width="180" alt="${game.name}">
            </div>
            <div class="game-card-body">
                <div class="game-card-title">${game.name}</div>
                <div class="game-card-meta" id="game-meta-${game.id}">0 playing</div>
            </div>
        </a>
    `).join("");

    app.innerHTML = `
        <h1 style="padding: 1rem 1rem 0;">Games</h1>
        <div class="games-grid">
            ${cards}
        </div>
    `;
}


/**
 * Turns an ISO timestamp into a friendly relative label:
 * "Just now", "5 minutes ago", "Yesterday", "3 days ago", or a plain date
 * once it's more than a week old.
 */
function formatLastSeen(isoString) {
    const then = new Date(isoString);
    const diffMs = Date.now() - then.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;

    return then.toLocaleDateString();
}

async function profilePage(id) {
    app.innerHTML = `<p>Loading profile...</p>`;

    const profileRes = await fetch(`/api/profile/${encodeURIComponent(id)}`);

    if (!profileRes.ok) {
        app.innerHTML = `<h1>Player not found</h1><p>No player with id ${id}.</p>`;
        return;
    }

    const user = await profileRes.json();

    // Check whether the logged-in player owns this profile, to decide
    // whether to show the "Edit Bio" button at all.
    let isOwner = false;
    const meRes = await fetch("/api/me");
    if (meRes.ok) {
        const me = await meRes.json();
        isOwner = me.id === user.id;
    }

    renderProfile(user, isOwner);
}

function renderProfile(user, isOwner) {
    app.innerHTML = `
        <div class="home-body">
        <div class="profile">
            <h1 class="player-greeting">${user.username}</h1>
            <div class="home-stats">
                <span>${user.friend_count} Friends</span>
                <span>${user.follower_count} Followers</span>
                <span>${user.following_count} Following</span>
            </div>
            ${!isOwner ? renderRelationActions(user, () => profilePage(user.id)) : ""}
            <div class="bio" id="bio-container">
                <p>${user.bio || "No bio yet."}</p>
            </div>
            ${isOwner ? `<button class="button" id="edit-bio-btn" style="margin-top:10px; border:none; cursor:pointer;">Edit Bio</button>` : ""}
        </div>
        </div>
    `;

    if (!isOwner) return;

    document.getElementById("edit-bio-btn").addEventListener("click", () => {
        showBioEditor(user);
    });
}

function showBioEditor(user) {
    const bioContainer = document.getElementById("bio-container");

    bioContainer.innerHTML = `
        <textarea id="bio-input" class="bio-input" maxlength="300" rows="4">${user.bio || ""}</textarea>
        <div id="bio-error" style="display:none; color:#ff8080; font-size:13px; margin-top:6px;">
        </div>

        <div class="bio-buttons">
            <button class="save-button" id="save-bio-btn" style="margin-top:0;">Save</button>
            <button class="cancel-button" id="cancel-bio-btn" style="border:none; cursor:pointer;">Cancel</button>
        </div>
    `;

    document.getElementById("cancel-bio-btn").addEventListener("click", () => {
        renderProfile(user, true);
    });

    document.getElementById("save-bio-btn").addEventListener("click", async () => {
        const errorBox = document.getElementById("bio-error");
        const newBio = document.getElementById("bio-input").value;

        const res = await fetch("/api/me/bio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bio: newBio })
        });

        const data = await res.json();

        if (!res.ok) {
            errorBox.textContent = data.error || "Could not save bio.";
            errorBox.style.display = "block";
            return;
        }

        renderProfile(data, true);
    });
}


/**
 * Player search page (/search). Reads an initial ?q= from the URL so
 * results are shareable/bookmarkable, then searches live as the user
 * types (debounced) or submits the form.
 */
function searchPage() {
    const initialQuery = new URLSearchParams(window.location.search).get("q") || "";

    app.innerHTML = `
        <div class="home-body">
            <h1 class="home-greeting">Search Players</h1>
            <form class="search-box" id="search-form">
                <input type="text" id="search-input" class="search-input"
                       placeholder="Search by username..." value="${initialQuery}" autofocus>
            </form>
            <div id="search-results"></div>
        </div>
    `;

    const input = document.getElementById("search-input");
    const form = document.getElementById("search-form");
    const resultsBox = document.getElementById("search-results");

    let debounceTimer = null;

    async function runSearch(term) {
        history.replaceState(null, "", term ? `/search?q=${encodeURIComponent(term)}` : "/search");

        if (!term.trim()) {
            resultsBox.innerHTML = `<p class="home-empty-state">Type a username to search.</p>`;
            return;
        }

        resultsBox.innerHTML = `<p class="home-empty-state">Searching...</p>`;

        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        if (!res.ok) {
            resultsBox.innerHTML = `<p class="home-empty-state">Search failed.</p>`;
            return;
        }

        const results = await res.json();
        if (results.length === 0) {
            resultsBox.innerHTML = `<p class="home-empty-state">No players found.</p>`;
            return;
        }

        resultsBox.innerHTML = results.map(user => `
            <div class="search-result-row">
                <a class="search-result-name" href="/profile/${user.id}" data-link>
                    <span class="online-dot ${user.online ? 'online' : ''}"></span>
                    ${user.username}
                </a>
                <div id="relation-actions-${user.id}"></div>
            </div>
        `).join("");

        results.forEach(user => {
            const slot = document.getElementById(`relation-actions-${user.id}`);
            if (slot) slot.outerHTML = renderRelationActions(user, () => runSearch(input.value));
        });
    }

    input.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => runSearch(input.value), 300);
    });

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        clearTimeout(debounceTimer);
        runSearch(input.value);
    });

    if (initialQuery) runSearch(initialQuery);
    else resultsBox.innerHTML = `<p class="home-empty-state">Type a username to search.</p>`;
}

/**
 * Incoming friend requests page (/requests) -- where "accepting someone's
 * friend request" actually happens.
 */
async function requestsPage() {
    app.innerHTML = `<div class="home-body"><p>Loading...</p></div>`;

    const res = await fetch("/api/me/friend-requests");
    if (res.status === 401) {
        navigate("/login");
        return;
    }

    document.title = `RADIAN | Friends`;

    const requests = await res.json();

    app.innerHTML = `
        <div class="home-body">
            <h1 class="home-greeting">Friend Requests</h1>
            <div id="requests-list" style="margin-top:16px;">
                ${requests.length === 0
                    ? `<p class="home-empty-state">No pending friend requests.</p>`
                    : requests.map(r => `
                        <div class="request-row">
                            <a class="search-result-name" href="/profile/${r.id}" data-link>${r.username}</a>
                            <div class="relation-actions">
                                <button class="relation-btn primary" data-accept="${r.id}">Accept</button>
                                <button class="relation-btn secondary" data-decline="${r.id}">Decline</button>
                            </div>
                        </div>
                    `).join("")
                }
            </div>
        </div>
    `;

    document.querySelectorAll("[data-accept]").forEach(btn => {
        btn.addEventListener("click", async () => {
            btn.closest(".request-row").querySelectorAll("button").forEach(b => b.disabled = true);
            await postJSON("/api/friends/accept", { requester_id: Number(btn.dataset.accept) });
            requestsPage();
        });
    });

    document.querySelectorAll("[data-decline]").forEach(btn => {
        btn.addEventListener("click", async () => {
            btn.closest(".request-row").querySelectorAll("button").forEach(b => b.disabled = true);
            await postJSON("/api/friends/decline", { requester_id: Number(btn.dataset.decline) });
            requestsPage();
        });
    });
}

function renderCatalogGrid(items, equippedIds, onEquipChange) {
    if (items.length === 0) {
        return `<p class="catalog-empty">No items in the catalog yet.</p>`;
    }

    return items.slice(0, 10).map(item => {
        const isEquipped = equippedIds && equippedIds.has(item.Id);
        const clickable = equippedIds !== null;
        return `
            <div class="catalog-item ${isEquipped ? 'equipped' : ''}"
                 ${clickable ? `data-item-id="${item.Id}" data-equipped="${isEquipped}"` : ""}>
                <div class="catalog-item-thumb">
                    <img src="thumbnails/items/${item.name}.png" alt="${item.name}"
                         onerror="this.replaceWith(Object.assign(document.createElement('span'), {textContent: 'IMAGE'}))">
                </div>
                <div class="catalog-item-name">${item.name}</div>
                <div class="catalog-item-price">${item.price ? `${item.price} R$` : "Free"}</div>
            </div>
        `;
    }).join("");
}

function wireCatalogGridClicks(container, onEquipChange) {
    if (!onEquipChange) return;
    container.querySelectorAll(".catalog-item[data-item-id]").forEach(card => {
        card.addEventListener("click", async () => {
            const itemId = Number(card.dataset.itemId);
            const currentlyEquipped = card.dataset.equipped === "true";
            const res = await postJSON("/api/me/avatar/accessory", {
                item_id: itemId,
                equipped: !currentlyEquipped,
            });
            if (res.status === 401) {
                navigate("/login");
                return;
            }
            onEquipChange();
        });
    });
}

async function catalogPage() {
    app.innerHTML = `<p>Loading...</p>`;

    let items = [];
    try {
        const res = await fetch('/api/items.json');
        if (res.ok) items = await res.json();
    } catch (err) {
        // No items.json yet -- fall through to the empty state below.
    }

    app.innerHTML = `
        <div class="catalog-layout">
            <div class="avatar-panel">Avatar</div>

            <div class="catalog-main">
                <div class="catalog-top">
                    <div class="categories-panel">Categories</div>

                    <div class="catalog-panel">
                        <div class="catalog-header">
                            <h1>Catalog</h1>
                            <span class="catalog-subtitle">RADIAN accessories</span>
                        </div>
                        <div class="catalog-grid">
                            ${renderCatalogGrid(items, null, null)}
                        </div>
                    </div>
                </div>

                ${items.length > 0 ? `<button class="view-more-btn" id="view-more-btn">View More Items</button>` : ""}
            </div>
        </div>
    `;

    const viewMoreBtn = document.getElementById("view-more-btn");
    if (viewMoreBtn) {
        viewMoreBtn.addEventListener("click", () => {
            console.log("View More Items -- catalog pagination isn't built yet.");
        });
    }
}

const AVATAR_PARTS = ["head", "torso", "right_arm", "left_arm", "right_leg", "left_leg"];
const AVATAR_PART_LABELS = {
    head: "Head", torso: "Torso", right_arm: "right arm",
    left_arm: "left arm", right_leg: "right leg", left_leg: "left leg",
};

async function avatarPage() {
    app.innerHTML = `<p>Loading...</p>`;

    const [avatarRes, itemsRes] = await Promise.all([
        fetch('/api/me/avatar'),
        fetch('/api/items.json').catch(() => null),
    ]);

    if (avatarRes.status === 401) {
        navigate("/login");
        return;
    }

    const avatar = await avatarRes.json();
    const items = (itemsRes && itemsRes.ok) ? await itemsRes.json() : [];

    renderAvatarPage(avatar, items);
}

const AVATAR_PREVIEW_MESH_NAMES = {
    head: ["Head_1"],
    torso: ["Torso_1"],
    left_arm: ["Arm1"],
    right_arm: ["Right2"],
    left_leg: ["Leg1"],
    right_leg: ["Leg2"],
};

let avatarPreviewHandle = null;

async function initAvatarPreview(avatar, items) {
    const canvas = document.getElementById("avatar-model-canvas");
    if (!canvas) return { setColor() {}, cleanup() {} };

    const [THREE, { GLTFLoader }, { OrbitControls }] = await Promise.all([
        import("https://esm.sh/three@0.174.0"),
        import("https://esm.sh/three@0.174.0/loaders/GLTFLoader.js"),
        import("https://esm.sh/three@0.174.0/controls/OrbitControls.js"),
    ]);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight || 1, 0.1, 100);
    camera.position.set(0, 1.4, 2.6);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(2, 4, 3);
    scene.add(dirLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 1.5;
    controls.maxDistance = 5;
    controls.update();

    const partMeshes = {}; // part key -> array of meshes, for live picker updates
    const loader = new GLTFLoader();
    const textureLoader = new THREE.TextureLoader();

    try {
        const gltf = await loader.loadAsync("models/model.gltf");
        const model = gltf.scene;
        model.traverse((obj) => {
            if (!obj.isMesh) return;
            for (const [part, meshNames] of Object.entries(AVATAR_PREVIEW_MESH_NAMES)) {
                if (meshNames.includes(obj.name)) {
                    obj.material = obj.material.clone();
                    if (avatar.colors[part]) obj.material.color.set(avatar.colors[part]);
                    (partMeshes[part] ||= []).push(obj);
                }
            }
        });
        scene.add(model);

        const equippedIds = new Set(avatar.accessories.ids);
        const equippedItems = items.filter((item) => equippedIds.has(item.Id));

        const shirtMesh = model.getObjectByName("T-shirt");
        if (shirtMesh) {
            shirtMesh.material = shirtMesh.material.clone();
            shirtMesh.visible = false;
        }

        for (const item of equippedItems) {
            if (item.type === "T-shirt") {
                if (!shirtMesh || !item.texture) continue;
                try {
                    const tex = await textureLoader.loadAsync(item.texture);
                    tex.colorSpace = THREE.SRGBColorSpace;
                    shirtMesh.material.map = tex;
                    shirtMesh.material.needsUpdate = true;
                    shirtMesh.visible = true;
                } catch (err) {
                    console.warn(`[avatar preview] could not load shirt texture for item ${item.Id}`, err);
                }
            } else if (item.type === "Hat") {
                if (!item.model) continue;
                try {
                    const hatGltf = await loader.loadAsync(item.model);
                    const hat = hatGltf.scene;

                    let hatTexture = null;
                    if (item.texture) {
                        hatTexture = await textureLoader.loadAsync(item.texture);
                        hatTexture.colorSpace = THREE.SRGBColorSpace;
                    }
                    hat.traverse((obj) => {
                        if (!obj.isMesh) return;
                        obj.material = obj.material.clone();
                        if (hatTexture) {
                            obj.material.map = hatTexture;
                            obj.material.needsUpdate = true;
                        }
                    });

                    const headMesh = partMeshes.head?.[0];
                    if (headMesh) {
                        const headBox = new THREE.Box3().setFromObject(headMesh);
                        hat.position.set(
                            (headBox.min.x + headBox.max.x) / 2,
                            headBox.max.y,
                            (headBox.min.z + headBox.max.z) / 2
                        );
                    }
                    model.add(hat);
                } catch (err) {
                    console.warn(`[avatar preview] could not load hat model for item ${item.Id}`, err);
                }
            }
        }
    } catch (err) {
        console.warn("[avatar preview] could not load model, showing placeholder", err);
        const placeholder = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.4, 1, 4, 8),
            new THREE.MeshStandardMaterial({ color: 0x888888 })
        );
        placeholder.position.y = 1;
        scene.add(placeholder);
    }

    let frameId = null;
    function animate() {
        frameId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    function handleResize() {
        if (!canvas.clientWidth || !canvas.clientHeight) return;
        camera.aspect = canvas.clientWidth / canvas.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    }
    window.addEventListener("resize", handleResize);

    return {
        setColor(part, hex) {
            (partMeshes[part] || []).forEach((mesh) => mesh.material.color.set(hex));
        },
        cleanup() {
            cancelAnimationFrame(frameId);
            window.removeEventListener("resize", handleResize);
            controls.dispose();
            renderer.dispose();
        },
    };
}

function renderAvatarPage(avatar, items) {
    if (avatarPreviewHandle) {
        avatarPreviewHandle.cleanup();
        avatarPreviewHandle = null;
    }

    const equippedIds = new Set(avatar.accessories.ids);

    document.title = `RADIAN | Catalog`;

    app.innerHTML = `
        <div class="avatar-builder-layout">
            <div class="avatar-builder-left">
                <h1>Avatar</h1>
                <div class="avatar-preview-panel"><canvas id="avatar-model-canvas" class="ModelCanvas"></canvas></div>
                <div class="avatar-swatch-grid">
                    ${AVATAR_PARTS.map(part => `
                        <div class="avatar-swatch" data-part="${part}"
                             style="background-color: ${avatar.colors[part]};"
                             title="Click to change ${AVATAR_PART_LABELS[part]} color">
                            ${AVATAR_PART_LABELS[part]}
                        </div>
                    `).join("")}
                </div>
                <div class="avatar-color-picker" id="avatar-color-picker">
                    <p class="avatar-color-picker-label" id="avatar-color-picker-label">Select a body part above to change its color</p>
                    <div class="avatar-color-picker-controls" id="avatar-color-picker-controls">
                        <input type="color" id="avatar-color-input" class="avatar-color-input">
                        <input type="text" id="avatar-color-hex-input" class="avatar-color-hex-input" maxlength="7" placeholder="#ffffff">
                        <div id="avatar-color-swatch-preview" class="avatar-color-swatch-preview"></div>
                    </div>
                </div>
            </div>

            <div class="catalog-panel avatar-builder-catalog">
                <div class="catalog-header"><h1>Catalog</h1></div>
                <div class="catalog-grid" id="avatar-catalog-grid">
                    ${renderCatalogGrid(items, equippedIds, null)}
                </div>
            </div>
        </div>
    `;

    const colorInput = document.getElementById("avatar-color-input");
    const hexInput = document.getElementById("avatar-color-hex-input");
    const swatchPreview = document.getElementById("avatar-color-swatch-preview");
    const pickerLabel = document.getElementById("avatar-color-picker-label");
    const pickerControls = document.getElementById("avatar-color-picker-controls");
    let activePart = null;

    function setPickerColor(hex) {
        colorInput.value = hex;
        hexInput.value = hex;
        swatchPreview.style.backgroundColor = hex;
    }

    function selectPart(part, swatchEl) {
        activePart = part;
        const hex = rgbToHex(getComputedStyle(swatchEl).backgroundColor) || "#ffffff";
        setPickerColor(hex);
        pickerLabel.textContent = `Editing color: ${AVATAR_PART_LABELS[part]}`;
        pickerControls.classList.add("active");

        document.querySelectorAll(".avatar-swatch").forEach(s => s.classList.remove("avatar-swatch-active"));
        swatchEl.classList.add("avatar-swatch-active");
    }

    async function applyColor(hex) {
        if (!activePart) return;
        const swatch = document.querySelector(`.avatar-swatch[data-part="${activePart}"]`);
        if (swatch) swatch.style.backgroundColor = hex; // instant feedback
        if (avatarPreviewHandle) avatarPreviewHandle.setColor(activePart, hex);

        const res = await postJSON("/api/me/avatar/color", { part: activePart, color: hex });
        if (res.status === 401) navigate("/login");
    }

    document.querySelectorAll(".avatar-swatch").forEach(swatch => {
        swatch.addEventListener("click", () => selectPart(swatch.dataset.part, swatch));
    });

    colorInput.addEventListener("input", () => {
        setPickerColor(colorInput.value);
        applyColor(colorInput.value);
    });

    hexInput.addEventListener("change", () => {
        const value = hexInput.value.trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
            hexInput.value = colorInput.value; // revert invalid input
            return;
        }
        setPickerColor(value);
        applyColor(value);
    });

    wireCatalogGridClicks(
        document.getElementById("avatar-catalog-grid"),
        async () => {
            const res = await fetch('/api/me/avatar');
            const freshAvatar = await res.json();
            renderAvatarPage(freshAvatar, items); // re-render with the updated equipped set
        }
    );

    initAvatarPreview(avatar, items).then((handle) => {
        avatarPreviewHandle = handle;
    });
}

/** Browsers report computed background-color as "rgb(r, g, b)" -- the
 * native <input type="color"> element requires a #rrggbb hex value, so
 * this converts between the two when opening the picker pre-filled with
 * the swatch's current color. */
function rgbToHex(rgbString) {
    const match = rgbString.match(/\d+/g);
    if (!match) return null;
    return "#" + match.slice(0, 3).map(n => Number(n).toString(16).padStart(2, "0")).join("");
}

window.catalogPage = catalogPage


function loginPage() {
    app.innerHTML = `
        <div class="login-page">
            <div class="login-card">
                <p class="subtitle">Login to continue</p>
                <div id="error-box" style="display:none; color:#ff8080; text-align:center; margin-bottom:12px; font-size:14px;"></div>
                <form class="login-form" id="login-form">
                    <label for="username">Username</label>
                    <input type="text" id="username" name="username" placeholder="Username" required autocomplete="username">

                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" placeholder="Password" required autocomplete="current-password">

                    <button type="submit" class="login-button">Login</button>
                </form>
                <p class="text" style="margin-top:16px;">
                    Dont have an account<br>
                    <a href="/signup" data-link style="color:#fff;">Sign Up</a>
                </p>
            </div>
        </div>
    `;

    const form = document.getElementById("login-form");
    const errorBox = document.getElementById("error-box");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        errorBox.style.display = "none";

        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;

        const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (res.status === 403) {
            navigate("/banned");
            return;
        }

        if (!res.ok) {
            errorBox.textContent = data.error || "Login failed.";
            errorBox.style.display = "block";
            return;
        }

        navigate("/home");
    });
}


//=====Username filtering=====\\
// Same list/logic as the in-game chat filter, kept in sync manually since
// this page doesn't share code with the game client. Add words below
// (lowercase). Usernames get REJECTED (not censored) if they match.
const bannedWords = [
    "fuck", "shit", "bitch", "bastard", "cunt", "piss", "slut", "whore", "ass",
    "faggot", "retard", "nigger", "nigga", "asshole", "cock", "dick", "motherfucker", "dickbeaters", "cocksucker", "asscracker", "dickmonger", "cunt", "assjacker", "bullshit", "twat", "hitler"
];

function buildBannedWordPattern(word) {
	const letters = word.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	const gap = '[\\s_\\-.]*';
	const core = letters.join(gap);
	const suffix = `${gap}(?:s|es|ed|ing|er|ers)?`;
	return new RegExp(`(?<![a-zA-Z0-9])${core}${suffix}(?![a-zA-Z0-9])`, 'gi');
}

function containsBannedWord(text) {
	return bannedWords.some(word => buildBannedWordPattern(word).test(text));
}


async function signupPage() {

    try {
        const meRes = await fetch("/api/me", { credentials: "include" });

        if (meRes.ok) {
            const me = await meRes.json();
            navigate(me.is_banned ? "/banned" : "/home");
            return;
        }
    } catch (err) {
        // Not logged in, or the check failed -- either way, fall through
        // and show the signup form. This must never block signup itself.
        console.error("Failed to check for an existing session:", err);
    }

    app.innerHTML = `
        <div class="login-page">
            <div class="login-card">
                <p class="subtitle">Create an account</p>
                <div id="error-box" style="display:none; color:#ff8080; text-align:center; margin-bottom:12px; font-size:14px;"></div>
                <form class="login-form" id="signup-form">
                    <label for="username">Username</label>
                    <input type="text" id="username" name="username" placeholder="Username" required autocomplete="username">

                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" placeholder="Password" required autocomplete="new-password" minlength="6">

                    <label for="confirm-password">Confirm Password</label>
                    <input type="password" id="confirm-password" placeholder="Confirm Password" required autocomplete="new-password" minlength="6">

                    <button type="submit" class="login-button">Sign Up</button>
                </form>
                <p class="text" style="margin-top:16px;">
                    Already have an account<br>
                    <a href="/login" data-link style="color:#fff;">Login</a>
                </p>
            </div>
        </div>
    `;

    const form = document.getElementById("signup-form");
    const errorBox = document.getElementById("error-box");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        errorBox.style.display = "none";

        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirm-password").value;

        if (password !== confirmPassword) {
            errorBox.textContent = "Passwords do not match.";
            errorBox.style.display = "block";
            return;
        }

        if (containsBannedWord(username)) {
            errorBox.textContent = "That username isn't allowed. Please choose another.";
            errorBox.style.display = "block";
            return;
        }

        const res = await fetch("/api/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (!res.ok) {
            errorBox.textContent = data.error || "Signup failed.";
            errorBox.style.display = "block";
            return;
        }

        navigate("/home");
    });
}


function notFound() {
    app.innerHTML = `
        <h1>404</h1>
        <p>Page not found</p>
    `;
}


function bannedPage() {
    app.innerHTML = `
        <div class="banned">
            <h1>You have been banned</h1>
        </div>
    `;
   document.title = `RADIAN | Banned`;
}


async function adminPage() {
    app.innerHTML = `<p>Loading...</p>`;

    const meRes = await fetch("/api/me");
    if (!meRes.ok) {
        navigate("/login");
        return;
    }

    document.title = `RADIAN | Admin`;

    const me = await meRes.json();
    if (!me.is_staff && !me.is_moderator) {
        app.innerHTML = `<h1>Not authorized</h1><p>You don't have permission to view this page.</p>`;
        return;
    }

    app.innerHTML = `
        <div class="admin">
            <h1>Admin Panel</h1>
            <h3>Ban user</h3>
            <input type="number" id="ban-id-input" name="Id" placeholder="User Id">
            <div id="admin-error" style="display:none; color:#ff8080; font-size:14px; margin-top:8px;"></div>
            <div id="admin-success" style="display:none; color:#8fd88f; font-size:14px; margin-top:8px;"></div>
            <div class="padiv">
                <button class="button2" id="ban-btn">Ban</button>
            </div>
        </div>
    `;

    document.getElementById("ban-btn").addEventListener("click", async () => {
        const errorBox = document.getElementById("admin-error");
        const successBox = document.getElementById("admin-success");
        errorBox.style.display = "none";
        successBox.style.display = "none";

        const idValue = document.getElementById("ban-id-input").value;

        const res = await fetch("/api/admin/ban", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: Number(idValue) })
        });

        const data = await res.json();

        if (!res.ok) {
            errorBox.textContent = data.error || "Could not ban that user.";
            errorBox.style.display = "block";
            return;
        }

        successBox.textContent = `Banned ${data.username} (id ${data.id}).`;
        successBox.style.display = "block";
    });
}

router();
