const player = document.getElementById("player");
const gameArea = document.getElementById("gameArea");
const instructionBox = document.getElementById("instructionBox");

const scoreText = document.getElementById("score");
const livesText = document.getElementById("lives");
const timeText = document.getElementById("time");
const comboTextDisplay = document.getElementById("comboText");
const levelText = document.getElementById("levelText");
const highScoreText = document.getElementById("highScoreText");

const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const muteBtn = document.getElementById("muteBtn");
const restartBtn = document.getElementById("restartBtn");

const gameOverScreen = document.getElementById("gameOverScreen");
const pauseScreen = document.getElementById("pauseScreen");

const finalScore = document.getElementById("finalScore");
const bestScoreFinal = document.getElementById("bestScoreFinal");
const highestComboText = document.getElementById("highestComboText");
const assignmentsCollectedText = document.getElementById("assignmentsCollectedText");
const distractionsHitText = document.getElementById("distractionsHitText");

const leaderboardList = document.getElementById("leaderboardList");
const particles = document.getElementById("particles");

const collectSound = new Audio("sounds/collect.mp3");
const damageSound = new Audio("sounds/damage.mp3");
const gameOverSound = new Audio("sounds/gameover.mp3");

// Mobile browsers block sound until the user touches the screen first.
// This silently unlocks audio on the very first tap anywhere on the page.
function unlockAudio() {
    collectSound.play().catch(function() {});
    damageSound.play().catch(function() {});
    gameOverSound.play().catch(function() {});

    collectSound.pause();
    damageSound.pause();
    gameOverSound.pause();

    collectSound.currentTime = 0;
    damageSound.currentTime = 0;
    gameOverSound.currentTime = 0;

    document.removeEventListener("touchstart", unlockAudio);
}

document.addEventListener("touchstart", unlockAudio);

let score = 0;
let lives = 3;
let time = 60;
let combo = 0;
let highestCombo = 0;
let assignmentsCollected = 0;
let distractionsHit = 0;
let level = 1;

let highScore = localStorage.getItem("assignmentRushHighScore") || 0;
highScoreText.innerHTML = highScore;

let gameStarted = false;
let gameRunning = false;
let isPaused = false;
let soundOn = true;

let objectSpawner;
let timer;

let playerX = 320;
const playerSpeed = 30;
let fallSpeed = 5;
let spawnRate = 1500;

function movePlayer(direction) {
    playerX += direction;

    if (playerX < 0) {
        playerX = 0;
    }

    if (playerX > gameArea.clientWidth - 50) {
        playerX = gameArea.clientWidth - 50;
    }

    player.style.left = playerX + "px";
}

document.addEventListener("keydown", function(event) {
    if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        movePlayer(-playerSpeed);
    }

    if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
        movePlayer(playerSpeed);
    }

    if (event.key === "Escape") {
        togglePause();
    }
});

// --- Mobile touch: drag finger to move player ---

// --- Swipe on the game area ---
// We record where the finger started (touchStartX)
// then as the finger moves (touchmove) we work out
// how far it travelled and move the player to match

let touchStartX = null;
let lastTouchX = null;

gameArea.addEventListener("touchstart", function(e) {
    touchStartX = e.touches[0].clientX;
    lastTouchX = e.touches[0].clientX;
}, { passive: true });

gameArea.addEventListener("touchmove", function(e) {
    if (!gameRunning || lastTouchX === null) {
        return;
    }

    // Work out how far the finger moved since last frame
    const currentX = e.touches[0].clientX;
    const dragAmount = currentX - lastTouchX;

    // Move the player by that same amount
    movePlayer(dragAmount);

    // Update lastTouchX so next frame calculates from here
    lastTouchX = currentX;
}, { passive: true });

gameArea.addEventListener("touchend", function() {
    touchStartX = null;
    lastTouchX = null;
});

function showScorePopup(text, x, y) {
    const popup = document.createElement("div");
    popup.classList.add("score-popup");
    popup.innerHTML = text;
    popup.style.left = x + "px";
    popup.style.top = y + "px";

    gameArea.appendChild(popup);

    setTimeout(function() {
        popup.remove();
    }, 600);
}

function showDamagePopup(text, x, y) {
    const popup = document.createElement("div");
    popup.classList.add("damage-popup");
    popup.innerHTML = text;
    popup.style.left = x + "px";
    popup.style.top = y + "px";

    gameArea.appendChild(popup);

    setTimeout(function() {
        popup.remove();
    }, 600);
}

function updateLeaderboard() {
    let scores = JSON.parse(localStorage.getItem("assignmentRushLeaderboard")) || [];

    leaderboardList.innerHTML = "";

    if (scores.length === 0) {
        leaderboardList.innerHTML = "<li>No scores yet</li>";
        return;
    }

    scores.forEach(function(savedScore) {
        leaderboardList.innerHTML += "<li>" + savedScore + "</li>";
    });
}

function saveScore() {
    let scores = JSON.parse(localStorage.getItem("assignmentRushLeaderboard")) || [];

    scores.push(score);
    scores.sort(function(a, b) {
        return b - a;
    });

    scores = scores.slice(0, 5);

    localStorage.setItem("assignmentRushLeaderboard", JSON.stringify(scores));
    updateLeaderboard();
}

function createObject() {
    const object = document.createElement("div");

    const items = [
        "notebook",
        "assignment",
        "document",
        "phone",
        "game",
        "sleep"
    ];

    const selectedItem = items[Math.floor(Math.random() * items.length)];

    object.dataset.type = selectedItem;
    object.innerHTML = `<img src="assets/${selectedItem}.png" alt="${selectedItem}">`;

    object.classList.add("falling-object");
    object.style.position = "absolute";

    let randomX = Math.random() * (gameArea.clientWidth - 60);

    object.style.left = randomX + "px";
    object.style.top = "0px";

    gameArea.appendChild(object);

    let objectY = 0;

    const goodItems = [
        "notebook",
        "assignment",
        "document"
    ];

    let fall = setInterval(function() {
        if (!gameRunning) {
            return;
        }

        objectY += fallSpeed;
        object.style.top = objectY + "px";

        const playerRect = player.getBoundingClientRect();
        const objectRect = object.getBoundingClientRect();

        if (
            playerRect.left < objectRect.right &&
            playerRect.right > objectRect.left &&
            playerRect.top < objectRect.bottom &&
            playerRect.bottom > objectRect.top
        ) {
            clearInterval(fall);

            if (goodItems.includes(object.dataset.type)) {
                combo++;
                assignmentsCollected++;

                if (combo > highestCombo) {
                    highestCombo = combo;
                }

                comboTextDisplay.innerHTML = combo;

                let points = 10;
                let comboText = "";

                if (combo > 3) {
                    let multiplier = combo - 2;
                    points = multiplier * 10;
                    comboText = "x" + multiplier + " COMBO 🔥";
                }

                score += points;
                scoreText.innerHTML = score;

                if (soundOn) {
                    collectSound.currentTime = 0;
                    collectSound.play();
                }

                if (comboText !== "") {
                    showScorePopup(comboText, object.offsetLeft, objectY - 30);
                }

                showScorePopup("+" + points, object.offsetLeft, objectY);
            } else {
                combo = 0;
                distractionsHit++;

                comboTextDisplay.innerHTML = combo;

                lives--;
                livesText.innerHTML = lives;

                if (soundOn) {
                    damageSound.currentTime = 0;
                    damageSound.play();
                }

                showDamagePopup("-1 LIFE", object.offsetLeft, objectY);
            }

            object.remove();
        }

        if (objectY > gameArea.clientHeight) {
            clearInterval(fall);

            if (goodItems.includes(object.dataset.type)) {
                combo = 0;
                comboTextDisplay.innerHTML = combo;

                showDamagePopup(
                    "MISSED!",
                    object.offsetLeft,
                    gameArea.clientHeight - 80
                );
            }

            object.remove();
        }
    }, 30);
}

function startSpawner() {
    objectSpawner = setInterval(function() {
        if (gameRunning) {
            createObject();
        }
    }, spawnRate);
}

function endGame() {
    gameRunning = false;

    clearInterval(timer);
    clearInterval(objectSpawner);

    if (score > highScore) {
        highScore = score;

        localStorage.setItem("assignmentRushHighScore", highScore);
        highScoreText.innerHTML = highScore;
    }

    saveScore();

    finalScore.innerHTML = score;
    bestScoreFinal.innerHTML = highScore;
    highestComboText.innerHTML = highestCombo;
    assignmentsCollectedText.innerHTML = assignmentsCollected;
    distractionsHitText.innerHTML = distractionsHit;

    gameOverScreen.style.display = "block";

    if (soundOn) {
        gameOverSound.currentTime = 0;
        gameOverSound.play();
    }
}

function startGame() {
    gameStarted = true;
    gameRunning = true;

    startBtn.style.display = "none";
    pauseBtn.style.display = "inline-block";

    startSpawner();

    timer = setInterval(function() {
        if (!gameRunning) {
            return;
        }

        time--;
        timeText.innerHTML = time;

        if (time <= 40) {
            level = 2;
            levelText.innerHTML = level;
            fallSpeed = 7;

            if (time === 40) {
                clearInterval(objectSpawner);
                spawnRate = 1000;
                startSpawner();
            }
        }

        if (time <= 20) {
            level = 3;
            levelText.innerHTML = level;
            fallSpeed = 10;

            if (time === 20) {
                clearInterval(objectSpawner);
                spawnRate = 700;
                startSpawner();
            }
        }

        if (time <= 0 || lives <= 0) {
            endGame();
        }
    }, 1000);
}

startBtn.addEventListener("click", function() {
    if (gameStarted) {
        return;
    }

    startGame();
});

function resetGame() {
    // Step 1: Stop everything that's currently running
    clearInterval(timer);
    clearInterval(objectSpawner);

    // Step 2: Remove all falling objects still on screen
    const fallingObjects = gameArea.querySelectorAll(".falling-object");
    fallingObjects.forEach(function(obj) {
        obj.remove();
    });

    // Step 3: Reset all game variables back to starting values
    score = 0;
    lives = 3;
    time = 60;
    combo = 0;
    highestCombo = 0;
    assignmentsCollected = 0;
    distractionsHit = 0;
    level = 1;
    fallSpeed = 5;
    spawnRate = 1500;
    gameStarted = false;
    gameRunning = false;
    isPaused = false;

    // Step 4: Reset the player position back to center
    playerX = 320;
    player.style.left = playerX + "px";

    // Step 5: Update all the display text on screen
    scoreText.innerHTML = 0;
    livesText.innerHTML = 3;
    timeText.innerHTML = 60;
    comboTextDisplay.innerHTML = 0;
    levelText.innerHTML = 1;

    // Step 6: Hide game over screen, hide pause screen
    gameOverScreen.style.display = "none";
    pauseScreen.style.display = "none";

    // Step 7: Reset the pause button text and show start button again
    pauseBtn.innerHTML = "Pause";
    pauseBtn.style.display = "none";
    startBtn.style.display = "inline-block";
}

restartBtn.addEventListener("click", function() {
    resetGame();
});

function togglePause() {
    if (!gameStarted || gameOverScreen.style.display === "block") {
        return;
    }

    isPaused = !isPaused;

    if (isPaused) {
        gameRunning = false;
        pauseBtn.innerHTML = "Resume";
        pauseScreen.style.display = "block";
    } else {
        gameRunning = true;
        pauseBtn.innerHTML = "Pause";
        pauseScreen.style.display = "none";
    }
}

pauseBtn.addEventListener("click", togglePause);

muteBtn.addEventListener("click", function() {
    soundOn = !soundOn;

    if (soundOn) {
        muteBtn.innerHTML = "Sound: On";
    } else {
        muteBtn.innerHTML = "Sound: Off";
    }
});

updateLeaderboard();

for (let i = 0; i < 30; i++) {
    let star = document.createElement("div");

    star.classList.add("star");
    star.style.left = Math.random() * 100 + "%";
    star.style.top = Math.random() * 100 + "%";
    star.style.animationDelay = Math.random() * 3 + "s";

    particles.appendChild(star);
}