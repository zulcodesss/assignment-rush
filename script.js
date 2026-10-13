const $ = (id) => document.getElementById(id);

const player = $("player"), gameArea = $("gameArea");
const scoreText = $("score"), livesText = $("lives"), timeText = $("time");
const comboText = $("comboText"), comboBox = $("comboBox");
const levelText = $("levelText"), highScoreText = $("highScoreText");
const startBtn = $("startBtn"), pauseBtn = $("pauseBtn");
const muteBtn = $("muteBtn"), restartBtn = $("restartBtn");
const gameOverScreen = $("gameOverScreen"), pauseScreen = $("pauseScreen");
const countdownEl = $("countdown"), flashEl = $("flash");
const leaderboardList = $("leaderboardList"), particles = $("particles");

// ---------- Constants ----------
const MAX_LIVES = 3, ROUND_TIME = 60;
const PLAYER_W = 55, PLAYER_BOTTOM = 20, PLAYER_SPEED = 450; // px per second
const OBJ_SIZE = 60;
const HIT_INSET_PLAYER = 8, HIT_INSET_OBJ = 9; // shrink hitboxes (~15%)
// speed in px/second, rate in ms between spawns
const LEVELS = [
    { speed: 170, rate: 1500 },
    { speed: 235, rate: 1000 },
    { speed: 335, rate: 700 }
];
const GOOD = ["notebook", "assignment", "document"];
const BAD = ["phone", "game", "sleep"];
const MEDALS = ["🥇", "🥈", "🥉"];

// ---------- Sound ----------
const sounds = {
    collect: new Audio("sounds/collect.mp3"),
    damage: new Audio("sounds/damage.mp3"),
    gameover: new Audio("sounds/gameover.mp3")
};
let soundOn = true;

function playSound(name) {
    if (!soundOn) return;
    // Clone so overlapping sounds don't cut each other off
    sounds[name].cloneNode().play().catch(() => {});
}

// Mobile browsers block audio until the first user gesture
function unlockAudio() {
    Object.values(sounds).forEach((a) => {
        a.muted = true;
        a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; })
            .catch(() => { a.muted = false; });
    });
    document.removeEventListener("pointerdown", unlockAudio);
}
document.addEventListener("pointerdown", unlockAudio);

// ---------- State ----------
let state = "idle"; // idle | countdown | running | paused | over
let score, lives, timeLeft, combo, highestCombo, collected, distractions;
let level, spawnTimer, playerX, objects = [], lastFrame = 0;
let countdownTimeouts = [];
const keys = { left: false, right: false };

let highScore = Number(localStorage.getItem("assignmentRushHighScore")) || 0;
highScoreText.textContent = highScore;

function centerPlayer() {
    playerX = (gameArea.clientWidth - PLAYER_W) / 2;
    player.style.left = playerX + "px";
}

function movePlayer(amount) {
    const max = gameArea.clientWidth - PLAYER_W;
    playerX = Math.max(0, Math.min(max, playerX + amount));
    player.style.left = playerX + "px";
}

// ---------- HUD helpers ----------
function renderLives() {
    livesText.textContent = "❤️".repeat(Math.max(lives, 0)) + "🖤".repeat(MAX_LIVES - Math.max(lives, 0));
}

function setCombo(value) {
    combo = value;
    comboText.textContent = combo;
    if (combo > 3) {
        comboBox.classList.remove("pulse");
        void comboBox.offsetWidth; // restart animation
        comboBox.classList.add("pulse");
    }
}

function showPopup(text, x, y, cls) {
    const popup = document.createElement("div");
    popup.className = cls;
    popup.textContent = text;
    popup.style.left = x + "px";
    popup.style.top = y + "px";
    gameArea.appendChild(popup);
    setTimeout(() => popup.remove(), 600);
}

function damageEffect() {
    gameArea.classList.remove("hit");
    void gameArea.offsetWidth;
    gameArea.classList.add("hit");
}

// ---------- Leaderboard ----------
function updateLeaderboard() {
    const scores = JSON.parse(localStorage.getItem("assignmentRushLeaderboard")) || [];
    leaderboardList.innerHTML = "";

    if (scores.length === 0) {
        leaderboardList.innerHTML = "<li>No scores yet</li>";
        return;
    }
    scores.forEach((s, i) => {
        const li = document.createElement("li");
        li.textContent = (MEDALS[i] || i + 1 + ".") + "  " + s;
        leaderboardList.appendChild(li);
    });
}

function saveScore() {
    let scores = JSON.parse(localStorage.getItem("assignmentRushLeaderboard")) || [];
    scores.push(score);
    scores.sort((a, b) => b - a);
    localStorage.setItem("assignmentRushLeaderboard", JSON.stringify(scores.slice(0, 5)));
    updateLeaderboard();
}

// ---------- Objects ----------
function spawnObject() {
    const type = [...GOOD, ...BAD][Math.floor(Math.random() * 6)];
    const node = document.createElement("div");
    node.className = "falling-object";
    node.innerHTML = `<img src="assets/${type}.png" alt="${type}">`;

    const o = { node, type, x: Math.random() * (gameArea.clientWidth - OBJ_SIZE), y: -OBJ_SIZE };
    node.style.transform = `translate(${o.x}px, ${o.y}px)`;
    gameArea.appendChild(node);
    objects.push(o);
}

function overlaps(o) {
    const H = gameArea.clientHeight;
    const px = playerX + HIT_INSET_PLAYER;
    const py = H - PLAYER_BOTTOM - PLAYER_W + HIT_INSET_PLAYER;
    const ps = PLAYER_W - HIT_INSET_PLAYER * 2;
    const ox = o.x + HIT_INSET_OBJ, oy = o.y + HIT_INSET_OBJ;
    const os = OBJ_SIZE - HIT_INSET_OBJ * 2;
    return px < ox + os && px + ps > ox && py < oy + os && py + ps > oy;
}

function collect(o) {
    if (GOOD.includes(o.type)) {
        setCombo(combo + 1);
        collected++;
        highestCombo = Math.max(highestCombo, combo);

        let points = 10;
        if (combo > 3) {
            const multiplier = combo - 2;
            points = multiplier * 10;
            showPopup("x" + multiplier + " COMBO 🔥", o.x, o.y - 30, "score-popup");
        }
        score += points;
        scoreText.textContent = score;
        playSound("collect");
        showPopup("+" + points, o.x, o.y, "score-popup");
    } else {
        setCombo(0);
        distractions++;
        lives--;
        renderLives();
        playSound("damage");
        damageEffect();
        showPopup("-1 LIFE", o.x, o.y, "damage-popup");
    }
}

function clearObjects() {
    objects.forEach((o) => o.node.remove());
    objects = [];
}

// ---------- Game loop ----------
function update(dt) {
    timeLeft -= dt;
    const newLevel = timeLeft > 40 ? 1 : timeLeft > 20 ? 2 : 3;
    if (newLevel !== level) {
        level = newLevel;
        levelText.textContent = level;
    }
    const { speed, rate } = LEVELS[level - 1];

    // Smooth keyboard movement
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (dir) movePlayer(dir * PLAYER_SPEED * dt);

    spawnTimer += dt * 1000;
    if (spawnTimer >= rate) {
        spawnTimer = 0;
        spawnObject();
    }

    const H = gameArea.clientHeight;
    for (let i = objects.length - 1; i >= 0; i--) {
        const o = objects[i];
        o.y += speed * dt;
        o.node.style.transform = `translate(${o.x}px, ${o.y}px)`;

        if (overlaps(o)) {
            collect(o);
            o.node.remove();
            objects.splice(i, 1);
        } else if (o.y > H) {
            if (GOOD.includes(o.type)) {
                setCombo(0);
                showPopup("MISSED!", o.x, H - 80, "damage-popup");
            }
            o.node.remove();
            objects.splice(i, 1);
        }
    }

    timeText.textContent = Math.max(0, Math.ceil(timeLeft));

    // End immediately when lives hit 0
    if (lives <= 0 || timeLeft <= 0) endGame();
}

function loop(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    if (state === "running") update(dt);
    requestAnimationFrame(loop);
}

// ---------- Flow ----------
function resetValues() {
    score = 0; lives = MAX_LIVES; timeLeft = ROUND_TIME;
    combo = 0; highestCombo = 0; collected = 0; distractions = 0;
    level = 1; spawnTimer = 0;
    keys.left = keys.right = false;

    clearObjects();
    scoreText.textContent = 0;
    renderLives();
    timeText.textContent = ROUND_TIME;
    comboText.textContent = 0;
    levelText.textContent = 1;
    gameOverScreen.style.display = "none";
    pauseScreen.style.display = "none";
    pauseBtn.textContent = "Pause";
    centerPlayer();
}

function startGame() {
    if (state === "countdown" || state === "running" || state === "paused") return;

    resetValues();
    state = "countdown";
    startBtn.style.display = "none";
    pauseBtn.style.display = "inline-block";

    const steps = ["3", "2", "1", "GO!"];
    steps.forEach((text, i) => {
        countdownTimeouts.push(setTimeout(() => {
            countdownEl.textContent = text;
            countdownEl.style.display = "block";
            countdownEl.classList.remove("tick");
            void countdownEl.offsetWidth;
            countdownEl.classList.add("tick");
        }, i * 700));
    });
    countdownTimeouts.push(setTimeout(() => {
        countdownEl.style.display = "none";
        state = "running";
    }, steps.length * 700));
}

function endGame() {
    state = "over";

    if (score > highScore) {
        highScore = score;
        localStorage.setItem("assignmentRushHighScore", highScore);
        highScoreText.textContent = highScore;
    }
    saveScore();

    $("finalScore").textContent = score;
    $("bestScoreFinal").textContent = highScore;
    $("highestComboText").textContent = highestCombo;
    $("assignmentsCollectedText").textContent = collected;
    $("distractionsHitText").textContent = distractions;

    gameOverScreen.style.display = "block";
    pauseBtn.style.display = "none";
    startBtn.style.display = "inline-block";
    playSound("gameover");
}

function togglePause() {
    if (state === "running") {
        state = "paused";
        pauseBtn.textContent = "Resume";
        pauseScreen.style.display = "block";
    } else if (state === "paused") {
        state = "running";
        pauseBtn.textContent = "Pause";
        pauseScreen.style.display = "none";
    }
}

// ---------- Input ----------
document.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") { keys.left = true; e.preventDefault(); }
    if (k === "arrowright" || k === "d") { keys.right = true; e.preventDefault(); }
    if (e.key === "Escape") togglePause();
});

document.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") keys.left = false;
    if (k === "arrowright" || k === "d") keys.right = false;
});

// If the tab loses focus, release keys so the player doesn't drift
window.addEventListener("blur", () => { keys.left = keys.right = false; });

// Drag finger to move the player (touch-action: none in CSS stops page scroll)
let lastTouchX = null;
gameArea.addEventListener("touchstart", (e) => { lastTouchX = e.touches[0].clientX; }, { passive: true });
gameArea.addEventListener("touchmove", (e) => {
    if (state !== "running" || lastTouchX === null) return;
    const x = e.touches[0].clientX;
    movePlayer(x - lastTouchX);
    lastTouchX = x;
}, { passive: true });
gameArea.addEventListener("touchend", () => { lastTouchX = null; });

window.addEventListener("resize", () => movePlayer(0));

startBtn.addEventListener("click", startGame);
pauseBtn.addEventListener("click", togglePause);

// "Play Again" starts a new round directly
restartBtn.addEventListener("click", () => {
    state = "idle";
    startGame();
});

// Small screens: Help & Scores slide-over (pauses the game while open)
$("infoBtn").addEventListener("click", () => {
    if (state === "running") togglePause();
    document.body.classList.add("show-info");
});
$("closeInfoBtn").addEventListener("click", () => document.body.classList.remove("show-info"));

muteBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    muteBtn.textContent = soundOn ? "Sound: On" : "Sound: Off";
});

// ---------- Init ----------
updateLeaderboard();
resetValues();
requestAnimationFrame((t) => { lastFrame = t; requestAnimationFrame(loop); });

for (let i = 0; i < 30; i++) {
    const star = document.createElement("div");
    star.className = "star";
    star.style.left = Math.random() * 100 + "%";
    star.style.top = Math.random() * 100 + "%";
    star.style.animationDelay = Math.random() * 3 + "s";
    particles.appendChild(star);
}
