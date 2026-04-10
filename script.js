let playerLeft;
let playerRight;
let songs = [];
let songsLost = [];
let indexLeft = 0;
let indexRight = 1;
let unfocusTime = 0;
let categorizedGames;

function $(id) { return document.getElementById(id); }
const ls = localStorage;

if (ls.getItem("songs")) {
    songs = JSON.parse(ls.getItem("songs"));
    songsLost = JSON.parse(ls.getItem("songsLost"));
    indexLeft = Number(ls.getItem("indexLeft"));
    indexRight = Number(ls.getItem("indexRight"));
    sendWebhookPoll();
} else {
    $("previousRoundButton").disabled = true;
    $("setupModal").classList.add("preventClose");
    toggleSetupModal();
}

function startGame() {
    resetGame();

    for (const child of $("gameSelect").children) {
        if (child.nodeName !== "INPUT" || child.id === "selectAll") {
            continue;
        }
        if (child.checked) {
            songs.push(...categorizedGames[child.id]);
        }
    }

    songs = shuffle(songs);

    const limitValue = Number($("limitSelect").value);
    if (limitValue) {
        songs = songs.slice(0, limitValue);
    }

    renderSongScreen();
    sendWebhookPoll();
    $("setupModal").classList.remove("visible", "preventClose");
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function getRoundText() {
    const nearestEvenSongLength = 2 * Math.floor(songs.length / 2);
    const roundNumber = ((indexLeft + 2) / 2);
    const songsLength = Math.floor(songs.length / 2);
    let roundText = `Round of ${nearestEvenSongLength}`
        + ` (${roundNumber}/${songsLength})`;

    if (songs.length == 2) {
        roundText = "Final Round";
    }

    return roundText;
}

function renderSongScreen() {
    if (!songs) {
        return;
    }
    playerLeft.loadVideoById(songs[indexLeft].urlId);
    playerRight.loadVideoById(songs[indexRight].urlId);
    $("titleLeft").textContent = songs[indexLeft].name;
    $("titleRight").textContent = songs[indexRight].name;
    $("round").innerText = getRoundText();
}

function previousRound() {
    if (!Number(ls.getItem("backupIndexLeft")) === indexLeft) {
        return;
    }
    $("previousRoundButton").disabled = true;
    unfocusTime = 0;
    songs = JSON.parse(ls.getItem("backupSongs"));
    songsLost = JSON.parse(ls.getItem("backupSongsLost"));
    indexLeft = Number(ls.getItem("backupIndexLeft"));
    indexRight = Number(ls.getItem("backupIndexRight"));
    renderSongScreen();
    sendWebhookPoll();
}

function nextRound(songWinner, songLoser) {
    unfocusTime = 0;
    $("previousRoundButton").disabled = false;
    ls.setItem("backupSongs", JSON.stringify(songs));
    ls.setItem("backupSongsLost", JSON.stringify(songsLost));
    ls.setItem("backupIndexLeft", indexLeft);
    ls.setItem("backupIndexRight", indexRight);

    songsLost.unshift(songLoser);

    if (songs.length === 2) {
        renderWinnerScreen();
        return;
    }

    indexLeft = (indexLeft + 2);
    indexRight = (indexRight + 2);

    const nearestEvenSongLength = 2 * Math.floor(songs.length / 2);
    if (indexLeft >= nearestEvenSongLength) {
        songs = shuffle(songs.filter(song => !songsLost.some(
            lost => JSON.stringify(lost) == JSON.stringify(song))));
        indexLeft = 0;
        indexRight = 1;
    }

    ls.setItem("songs", JSON.stringify(songs));
    ls.setItem("songsLost", JSON.stringify(songsLost));
    ls.setItem("indexLeft", indexLeft);
    ls.setItem("indexRight", indexRight);
    renderSongScreen();
    sendWebhookPoll(songWinner.name);
}

function renderWinnerScreen() {
    songs = songs.filter(song => !songsLost.some(
        lost => JSON.stringify(lost) == JSON.stringify(song)));

    playerLeft.mute();
    playerRight.mute();

    $("winnerIframe").src = `
        https://www.youtube.com/embed/${songs[0].urlId}?autoplay=1`;
    $("winnerText").textContent = `Winner: ${songs[0].name}`;

    const pastGames = [];
    songsLost.forEach(function (song, index) {
        const gameName = song.name.split(" - ", 1)[0];
        const paragraphSongLost = document.createElement("p");

        paragraphSongLost.textContent = `${index + 2}. ${song.name}`;

        if (!pastGames.includes(gameName)) {
            paragraphSongLost.className = "highlighted";
        }

        pastGames.push(gameName);
        $("lostList").appendChild(paragraphSongLost);
    });

    resetGame();
    $("resultsModal").classList.add("visible", "preventClose");
}

function resetGame() {
    songs = [];
    songsLost = [];
    indexLeft = 0;
    indexRight = 1;
    ls.removeItem("songs");
    ls.removeItem("songsLost");
    ls.removeItem("indexLeft");
    ls.removeItem("indexRight");
    ls.removeItem("backupSongs");
    ls.removeItem("backupSongsLost");
    ls.removeItem("backupIndexLeft");
    ls.removeItem("backupIndexRight");
    ls.removeItem("lastSentWebhook");
}

async function sendWebhookPoll(previousSongWinnerName = '') {
    if (!ls.getItem("webhookUrl")) {
        return;
    }

    pollWebhook = {
        "username": "Game OST Poll",
        "poll": {
            "question": { "text": getRoundText() },
            "answers": [
                {
                    "poll_media": {
                        "text": songs[indexLeft].name.slice(0, 55)
                    }
                },
                {
                    "poll_media": {
                        "text": songs[indexRight].name.slice(0, 55)
                    }
                }
            ],
            "duration": 750
        }
    };

    if (previousSongWinnerName) {
        pollWebhook.content = `
            Winner of previous poll: **${previousSongWinnerName}**`;
    }

    const postUrl = ls.getItem("webhookUrl") + "?wait=true";
    const postOptions = {
        method: "POST",
        headers: new Headers({ "Content-Type": "application/json" }),
        body: JSON.stringify(pollWebhook)
    };

    const response = await fetch(new Request(postUrl, postOptions));

    if (response.status != 200) {
        console.error(response);
        return;
    }

    const deleteUrl = ls.getItem("webhookDeleteUrl");
    const deleteOptions = { method: "DELETE" };

    if (deleteUrl) {
        const delResponse = await fetch(new Request(deleteUrl, deleteOptions));

        if (delResponse.status != 204) {
            console.error(delResponse);
        }
    }

    const data = await response.json();
    const newDeleteUrl = `
        ${ls.getItem('webhookUrl')}/messages/${data.id}`;

    ls.setItem("webhookDeleteUrl", newDeleteUrl);
}

// Modals
function toggleWebhookModal() {
    $("webhookModal").classList.toggle("visible");
    $("webhookUrlInput").value = ls.getItem("webhookUrl");
};

function submitWebhook() {
    ls.setItem("webhookUrl", $("webhookUrlInput").value);
    $("webhookModal").classList.toggle("visible");
    sendWebhookPoll();
}

function uncheckSelectAllCheckmark() {
    $("selectAll").checked = false;
    updateStartGameButtonDisabled();
}

function toggleSelectAll() {
    const checkedState = $("selectAll").checked;

    for (const child of $("gameSelect").children) {
        if (child.nodeName === "INPUT" && child.id !== "selectAll") {
            child.checked = checkedState;
        }
    }
    updateStartGameButtonDisabled();
}

function updateStartGameButtonDisabled() {
    for (const child of $("gameSelect").children) {
        if (child.nodeName !== "INPUT") {
            continue;
        }
        if (child.checked) {
            $("startGameButton").disabled = false;
            break;
        }
        $("startGameButton").disabled = true;
    }
}

async function categorizeGames() {
    let songData = await fetch("videos.json").then(r => r.json());
    const games = {};
    const seriesNames = [
        "Mario", "Danganronpa", "Kingdom Hearts", "Kirby",
        "Sonic", "NieR", "Persona", "Shovel Knight", "Katamari",
        "Final Fantasy", "Half-Life", "Professor Layton",
        "Super Smash Bros.", "Touhou", "Wario Ware", "Zelda",
        "Devil May Cry", "The World Ends with You", "Hollow Knight",
        "Crash", "Digimon", "Phantasy Star Online", "Umurangi Generation",
        "Jet Set Radio", "Animal Crossing", "Splatoon", "Dark Souls",
        "Outer Wilds", "Shin Megami Tensei", "Mega Man", "Pokémon",
        "Metal Gear Solid", "Cuphead", "Silent Hill", "Slime Rancher",
        "Xenoblade Chronicles", "Yoshi", "Guilty Gear", "Celeste",
        "Grand Theft Auto", "Bayonetta", "Left 4 Dead", "Portal",
        "Rabi Ribi", "Rhythm Heaven", "Donkey Kong Country", "Castlevania",
        "Bomberman", "DOOM", "Momodora", "Yakuza", "Cyberpunk",
        "Snipperclips"];

    for (const song of songData) {
        let gameName = song.name.split(" - ")[0];

        for (const series of seriesNames) {
            const seriesNaming = `${series} Series`;
            if (!Object.keys(games).includes(seriesNaming)) {
                games[seriesNaming] = [];
            }
            if (gameName.includes(series)) {
                games[seriesNaming].push(song);
                songData = songData.filter(item => item != song);
            }
        }
    }

    for (const song of songData) {
        let gameName = song.name.split(" - ")[0];

        if (!Object.keys(games).includes(gameName)) {
            games[gameName] = [];
        }

        games[gameName].push(song);
    }

    games["Others"] = [];
    for (let key in games) {
        if (games[key].length < 6) {
            games["Others"].push(...games[key]);
            delete games[key];
        }
    }

    return games;
}

async function toggleSetupModal() {
    if (!$("gameSelect").innerHTML) {
        const games = await categorizeGames();
        categorizedGames = games;

        let sortedGames = Object.keys(games).sort((a, b) => {
            return games[b].length - games[a].length;
        });

        sortedGames = sortedGames.filter(item => item != "Others");
        sortedGames.push("Others");

        let checkbox = document.createElement("input");
        let label = document.createElement("label");
        checkbox.type = "checkbox";
        checkbox.id = "selectAll";
        checkbox.checked = true;
        checkbox.onclick = toggleSelectAll;
        label.setAttribute("for", "selectAll");
        label.innerText = "[Select all]";

        $("gameSelect").appendChild(checkbox);
        $("gameSelect").appendChild(label);

        for (const name of sortedGames) {
            let checkbox = document.createElement("input");
            let label = document.createElement("label");
            checkbox.type = "checkbox";
            checkbox.id = name;
            checkbox.checked = true;
            checkbox.onclick = uncheckSelectAllCheckmark;
            label.setAttribute("for", name);
            label.innerHTML = `
                <span class="darker">
                (${games[name].length})</span> ${name}`;

            $("gameSelect").appendChild(checkbox);
            $("gameSelect").appendChild(label);
        };
    }

    $("setupModal").classList.add("visible");
}

window.onclick = (event) => {
    if (!event.target.classList.contains("visible")) {
        return;
    }
    if (event.target.classList.contains("preventClose")) {
        return;
    }
    event.target.classList.remove("visible");
};

$("titleLeft").addEventListener("click", () => {
    nextRound(songs[indexLeft], songs[indexRight]);
});
$("titleRight").addEventListener("click", () => {
    nextRound(songs[indexRight], songs[indexLeft]);
});


// Prepare YouTube iFrames
function onYouTubeIframeAPIReady() {
    function onReadySetup(event) {
        const section = event.target.getIframe().closest('section');

        section.addEventListener("mouseenter", () => {
            const otherPlayer = (
                playerLeft === event.target ? playerRight : playerLeft
            );

            if (event.target.isMuted()) {
                event.target.seekTo(unfocusTime);
                unfocusTime = otherPlayer.getCurrentTime();
            }

            event.target.g.className = "iFrameActive";
            event.target.unMute();
            otherPlayer.g.className = "";
            otherPlayer.mute();
        });

        renderSongScreen();
    }

    function onStateChangeReplay(event) {
        if (event.data === YT.PlayerState.ENDED) {
            event.target.playVideo();
        }
    }

    const player_properties = {
        videoId: "",  // player.loadVideoById() for loading a video later
        playerVars: {
            "autoplay": 1,
            "playsinline": 1,
            "loop": 1,
            "fs": 0,
            "iv_load_policy": 3
        },
        events: {
            "onReady": onReadySetup,
            "onStateChange": onStateChangeReplay
        }
    };

    playerLeft = new YT.Player("playerLeft", player_properties);
    playerRight = new YT.Player("playerRight", player_properties);
}
