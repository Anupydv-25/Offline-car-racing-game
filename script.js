const levelDisplay = document.getElementById("level");
let score = 0;
let highScore = localStorage.getItem("highScore") || 0;

const highScoreDisplay = document.getElementById("highScore");
highScoreDisplay.innerText = highScore;
const scoreDisplay = document.getElementById("score");

function getCurrentSpeed() {
    let speed = 7 + Math.floor(score / 20) * 1;
    if (speed > 50) speed = 50;
    return speed;
}

function getRoadWidth(){
    return road ? road.clientWidth : 320;
}
function getMaxLaneX(){
    const playerWidth = player ? player.clientWidth : 50;
    return Math.max(0, getRoadWidth() - playerWidth - 12);
}

document.addEventListener("keydown", function(event) {
    if (event.key === "ArrowLeft") {
        movePlayerLeft();
    }

    if (event.key === "ArrowRight") {
        movePlayerRight();
    }

    if (event.key === "Enter") {
        if (home.style.display !== "none") {
            enterLocalMode();
        } else if (gameOver.style.display !== "none") {
            restartBtn.click();
        }
    }

    if (event.key === " " || event.key === "Spacebar") {
        if (gameOver.style.display === "none") {
            event.preventDefault();
            if (isPaused) {
                resumeGame();
            } else {
                pauseGame();
            }
        }
    }
});

const home = document.getElementById("home");
const homePlayBtn = document.getElementById("homePlayBtn");
const themeCards = document.querySelectorAll('.theme-card');
const pauseBtn = document.getElementById("pauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const gameContainer = document.querySelector(".game-container");
const road = document.getElementById("road");
const player = document.getElementById("player");
const gameOver = document.getElementById("gameOver");

let isPaused = false;
let isGameOver = false;
let sceneAnimId = null;
let lanePositions = [0, 0, 0];
let currentLane = 1;
let audioContext = null;
let engineOscillator = null;
let engineGainNode = null;
let engineFilterNode = null;
let controlMode = 'buttons';
let lastFrameTime = null;
let playerX = 0;
let playerTargetX = 0;
let holdMoveTimer = null;
let holdMoveDirection = 0;

function ensureAudioContext() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {}
    }
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
    return audioContext;
}

function playTone(frequency, duration, type = 'square', volume = 0.04) {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.value = volume;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    oscillator.stop(ctx.currentTime + duration);
}

function playStartSound() {
    playTone(660, 0.08, 'triangle', 0.03);
    setTimeout(() => playTone(880, 0.1, 'square', 0.025), 60);
}

function playCrashSound() {
    playTone(180, 0.18, 'sawtooth', 0.04);
    setTimeout(() => playTone(90, 0.2, 'square', 0.03), 80);
}

function playScoreSound() {
    playTone(520, 0.05, 'triangle', 0.025);
}

function playEngineRev() {
    if (!isEngineSoundEnabled()) return;
    playTone(160, 0.08, 'triangle', 0.026);
    setTimeout(() => playTone(210, 0.07, 'triangle', 0.024), 55);
    setTimeout(() => playTone(260, 0.08, 'triangle', 0.022), 110);
}

function isEngineSoundEnabled() {
    return engineSoundEl ? engineSoundEl.checked : false;
}

function isCrashSoundEnabled() {
    return crashSoundEl ? crashSoundEl.checked : false;
}

function startEngineSound() {
    if (!isEngineSoundEnabled()) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;

    if (engineOscillator && engineGainNode && engineFilterNode) {
        try {
            engineOscillator.disconnect();
        } catch (e) {}
        engineFilterNode.disconnect();
        engineGainNode.disconnect();
    }

    engineOscillator = ctx.createOscillator();
    engineOscillator.type = 'triangle';
    engineFilterNode = ctx.createBiquadFilter();
    engineFilterNode.type = 'lowpass';
    engineFilterNode.frequency.value = 780;
    engineFilterNode.Q.value = 1.5;

    engineGainNode = ctx.createGain();
    engineGainNode.gain.value = 0.014;

    engineOscillator.connect(engineFilterNode);
    engineFilterNode.connect(engineGainNode);
    engineGainNode.connect(ctx.destination);
    engineOscillator.start();
    updateEnginePitch();
}

function updateEnginePitch() {
    if (!engineOscillator || !engineGainNode) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const speed = getCurrentSpeed();
    const pitch = 100 + Math.min(speed * 8, 420);
    const volume = 0.014 + Math.min(speed * 0.00028, 0.018);
    const cutoff = 680 + Math.min(speed * 5, 260);
    engineOscillator.frequency.setTargetAtTime(pitch, ctx.currentTime, 0.05);
    engineFilterNode.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.05);
    engineGainNode.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
}

function stopEngineSound() {
    if (engineOscillator) {
        try { engineOscillator.stop(); } catch (e) {}
        try { engineOscillator.disconnect(); } catch (e) {}
        engineOscillator = null;
    }
    if (engineFilterNode) {
        try { engineFilterNode.disconnect(); } catch (e) {}
        engineFilterNode = null;
    }
    if (engineGainNode) {
        try { engineGainNode.disconnect(); } catch (e) {}
        engineGainNode = null;
    }
}

function animateCrashEffect(enemy) {
    if (!enemy) return;
    enemy.classList.add('crash-impact');
    setTimeout(() => enemy.classList.remove('crash-impact'), 900);
}

function showScorePopup(text, x = 50, y = 80) {
    const layer = document.getElementById('feedbackLayer');
    if (!layer) return;
    const popup = document.createElement('div');
    popup.className = 'score-popup';
    popup.textContent = text;
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    layer.appendChild(popup);
    setTimeout(() => popup.remove(), 700);
}

function triggerCrashFlash() {
    const layer = document.getElementById('feedbackLayer');
    if (!layer) return;
    layer.classList.remove('crash-flash');
    void layer.offsetWidth;
    layer.classList.add('crash-flash');
    setTimeout(() => layer.classList.remove('crash-flash'), 220);
}

function triggerRoadShake() {
    const roadElement = document.getElementById('road');
    if (!roadElement) return;
    roadElement.classList.remove('crash-shake');
    void roadElement.offsetWidth;
    roadElement.classList.add('crash-shake');
    setTimeout(() => roadElement.classList.remove('crash-shake'), 350);
}

function triggerLaneBoost() {
    if (!player) return;
    player.classList.remove('boost-move');
    void player.offsetWidth;
    player.classList.add('boost-move');
    setTimeout(() => player.classList.remove('boost-move'), 220);
}

gameContainer.style.display = "none";

function enterLocalMode() {
    home.style.display = "none";
    gameContainer.style.display = "block";
    gameContainer.classList.remove('game-enter');
    void gameContainer.offsetWidth;
    gameContainer.classList.add('game-enter');
    playStartSound();
    window.requestAnimationFrame(() => {
        pauseBtn.disabled = false;
        resumeBtn.disabled = true;
        startGame();
    });
}

homePlayBtn.addEventListener("click", enterLocalMode);

themeCards.forEach(card => {
    card.addEventListener('click', function(){
        const theme = card.dataset.theme;
        themeCards.forEach(c => c.classList.toggle('selected', c === card));
        setTheme(theme);
    });
});

function setTheme(theme){
    if (!theme) return;
    const road = document.getElementById('road');
    const container = document.querySelector('.game-container');
    ['city','desert','snow'].forEach(name => {
        if (road) road.classList.toggle('theme-' + name, theme === name);
        if (container) container.classList.toggle('theme-' + name, theme === name);
    });
    try {
        localStorage.setItem('raceTheme', theme);
    } catch (e) {}
}

function loadTheme(){
    try {
        const saved = localStorage.getItem('raceTheme') || 'city';
        const selectedCard = Array.from(themeCards).find(c => c.dataset.theme === saved);
        if (selectedCard) selectedCard.classList.add('selected');
        setTheme(saved);
    } catch (e) {
        setTheme('city');
    }
}

pauseBtn.addEventListener("click", function () {
    pauseGame();
});

resumeBtn.addEventListener("click", function () {
    resumeGame();
});

const lines = document.querySelectorAll(".line");

// Coins
const coinsDisplay = document.getElementById('coins');
let coinsCollected = 0;
const coins = [];
let coinTops = [];
let coinLaneIndexes = [];

function moveRoad(deltaSeconds = 0.016) {
    if (isGameOver || isPaused) return;

    const speed = getCurrentSpeed() * 60 * deltaSeconds;

    lines.forEach(function(line) {
        let top = parseInt(line.style.top);

        top += speed;

        if (top > 600) {
            top = -100;
        }

        line.style.top = top + "px";
    });
}

const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");
const controlPad = document.getElementById("controlPad");
let swipeStartX = null;

function syncControlVisibility() {
    if (!controlPad) return;
    controlPad.classList.toggle('is-hidden', controlMode === 'swipe');
}

function setControlMode(mode) {
    const normalizedMode = mode === 'swipe' ? 'swipe' : 'buttons';
    controlMode = normalizedMode;
    syncControlVisibility();
}

function handleSwipeStart(event) {
    if (controlMode !== 'swipe') return;
    const point = event.touches && event.touches[0] ? event.touches[0] : event;
    if (!point) return;
    swipeStartX = point.clientX;
}

function handleSwipeMove(event) {
    if (controlMode !== 'swipe' || swipeStartX === null) return;
    const point = event.touches && event.touches[0] ? event.touches[0] : event;
    if (!point) return;
    const deltaX = point.clientX - swipeStartX;
    if (Math.abs(deltaX) < 24) return;
    if (deltaX < 0) {
        swipeStartX = point.clientX;
        movePlayerLeft();
    } else {
        swipeStartX = point.clientX;
        movePlayerRight();
    }
}

function handleSwipeEnd(event) {
    if (controlMode !== 'swipe') return;
    if (swipeStartX === null) return;
    const point = event.changedTouches && event.changedTouches[0] ? event.changedTouches[0] : event;
    if (!point) return;
    const deltaX = point.clientX - swipeStartX;
    swipeStartX = null;
    if (Math.abs(deltaX) < 24) return;
    if (deltaX < 0) {
        movePlayerLeft();
    } else {
        movePlayerRight();
    }
}

function setPlayerLane(targetLane) {
    if (isGameOver || isPaused) return;
    const clampedLane = Math.min(Math.max(targetLane, 0), lanePositions.length - 1);
    if (clampedLane === currentLane) return;
    currentLane = clampedLane;
    playerTargetX = lanePositions[currentLane] || 0;
    playerX = playerTargetX;
    if (player) {
        player.style.left = playerTargetX + "px";
    }
    triggerLaneBoost();
}

function movePlayerLeft() {
    if (isGameOver || isPaused) return;
    if (currentLane > 0) {
        setPlayerLane(currentLane - 1);
    }
}

function movePlayerRight() {
    if (isGameOver || isPaused) return;
    if (currentLane < lanePositions.length - 1) {
        setPlayerLane(currentLane + 1);
    }
}

function startHoldMove(direction) {
    if (isGameOver || isPaused) return;
    holdMoveDirection = direction;
    if (holdMoveTimer) {
        clearInterval(holdMoveTimer);
    }
    const step = () => {
        if (holdMoveDirection < 0) {
            movePlayerLeft();
        } else if (holdMoveDirection > 0) {
            movePlayerRight();
        }
    };
    step();
    holdMoveTimer = setInterval(step, 95);
}

function stopHoldMove() {
    if (holdMoveTimer) {
        clearInterval(holdMoveTimer);
        holdMoveTimer = null;
    }
    holdMoveDirection = 0;
}

if (leftBtn) {
    leftBtn.addEventListener("click", movePlayerLeft);
    leftBtn.addEventListener("pointerdown", () => startHoldMove(-1));
    leftBtn.addEventListener("pointerup", stopHoldMove);
    leftBtn.addEventListener("pointerleave", stopHoldMove);
    leftBtn.addEventListener("pointercancel", stopHoldMove);
}
if (rightBtn) {
    rightBtn.addEventListener("click", movePlayerRight);
    rightBtn.addEventListener("pointerdown", () => startHoldMove(1));
    rightBtn.addEventListener("pointerup", stopHoldMove);
    rightBtn.addEventListener("pointerleave", stopHoldMove);
    rightBtn.addEventListener("pointercancel", stopHoldMove);
}
document.addEventListener("pointerup", stopHoldMove);
document.addEventListener("pointercancel", stopHoldMove);
if (road) {
    road.addEventListener('touchstart', handleSwipeStart, { passive: true });
    road.addEventListener('touchmove', handleSwipeMove, { passive: true });
    road.addEventListener('touchend', handleSwipeEnd, { passive: true });
    road.addEventListener('touchcancel', () => { swipeStartX = null; }, { passive: true });
    road.addEventListener('pointerdown', handleSwipeStart, { passive: true });
    road.addEventListener('pointermove', handleSwipeMove, { passive: true });
    road.addEventListener('pointerup', handleSwipeEnd, { passive: true });
    road.addEventListener('pointercancel', () => { swipeStartX = null; }, { passive: true });
}

const enemies = document.querySelectorAll(".enemy");
let enemyTops = [];
let enemyLaneIndexes = [];

function getSpawnTop(index) {
    const otherTops = enemyTops.filter((_, i) => i !== index);
    const highestTop = otherTops.length ? Math.min(...otherTops) : -100;
    return highestTop - 260 - Math.random() * 80;
}

function updatePlayerPosition() {
    currentLane = Math.min(Math.max(currentLane, 0), lanePositions.length - 1);
    playerTargetX = lanePositions[currentLane] || 0;
    playerX = playerTargetX;
    if (player) {
        player.style.left = playerTargetX + "px";
    }
}

function updatePlayerVisual(deltaSeconds = 0.016) {
    if (!player) return;
    const easing = 1 - Math.exp(-deltaSeconds * 12);
    playerX += (playerTargetX - playerX) * easing;
    player.style.left = Math.round(playerX) + "px";
}

function getLanePositions(width){
    const playerWidth = player ? player.clientWidth : 50;
    const halfCar = playerWidth / 2;
    const positions = [1/4, 2/4, 3/4].map(fraction => Math.round(width * fraction - halfCar));
    return positions.map(x => Math.min(Math.max(x, 0), width - playerWidth));
}

function updateLanePositions(){
    lanePositions = getLanePositions(getRoadWidth());
}

function initializeEnemies() {
    updateLanePositions();

    enemyLaneIndexes = Array.from(enemies).map(() => Math.floor(Math.random() * lanePositions.length));
    enemyTops = Array.from(enemies).map((enemy, index) => {
        const start = -100 - index * 260;
        enemy.style.top = start + "px";
        enemy.style.left = lanePositions[enemyLaneIndexes[index]] + "px";
        return start;
    });
}

function moveEnemies(deltaSeconds = 0.016) {
    if (isGameOver || isPaused) return;
    updateEnginePitch();

    const lanes = lanePositions;
    const speed = getCurrentSpeed() * 60 * deltaSeconds;

    enemies.forEach((enemy, index) => {
        enemyTops[index] += speed;

        if (enemyTops[index] > 600) {
            score++;
            scoreDisplay.innerText = score;
            playScoreSound();
            showScorePopup(`+1`, 120, 80);

            let level = Math.floor(score / 20) + 1;
            levelDisplay.innerText = "Level : " + level;

            if (score > highScore) {
                highScore = score;
                localStorage.setItem("highScore", highScore);
                highScoreDisplay.innerText = highScore;
            }

            enemyTops[index] = getSpawnTop(index);
            enemyLaneIndexes[index] = Math.floor(Math.random() * lanes.length);
            enemy.style.left = lanes[enemyLaneIndexes[index]] + "px";
        }

        enemy.style.top = enemyTops[index] + "px";
    });
}

function initializeCoins(){
    updateLanePositions();
    // remove existing coin elements
    coins.forEach(c=>{ if (c && c.parentNode) c.parentNode.removeChild(c); });
    coins.length = 0; coinTops.length = 0; coinLaneIndexes.length = 0;
    const coinCount = 2;
    for (let i=0;i<coinCount;i++){
        const div = document.createElement('div');
        div.className = 'coin';
        div.style.position = 'absolute';
        div.style.width = '22px';
        div.style.height = '22px';
        div.style.borderRadius = '50%';
        div.style.background = 'gold';
        div.style.border = '2px solid #b8860b';
        div.style.zIndex = 30;
        road.appendChild(div);
        coins.push(div);
        coinLaneIndexes[i] = Math.floor(Math.random() * lanePositions.length);
        const start = -120 - i * 260;
        coinTops[i] = start;
        div.style.top = start + 'px';
        div.style.left = (lanePositions[coinLaneIndexes[i]] + 20) + 'px';
    }
}

function moveCoins(deltaSeconds = 0.016){
    if (isGameOver || isPaused) return;
    const lanes = lanePositions;
    const speed = getCurrentSpeed() * 60 * deltaSeconds;
    coins.forEach((coin, index) => {
        coinTops[index] += speed;
        if (coinTops[index] > 600){
            // respawn above
            coinTops[index] = getSpawnTop(index);
            coinLaneIndexes[index] = Math.floor(Math.random() * lanes.length);
            coin.style.left = (lanes[coinLaneIndexes[index]] + 20) + 'px';
        }
        coin.style.top = coinTops[index] + 'px';
    });
}

function checkCollision() {
    if (isGameOver || isPaused) return;

    const playerRect = player.getBoundingClientRect();

    // check coin collisions first
    for (let i = 0; i < coins.length; i++) {
        const coin = coins[i];
        if (!coin) continue;
        const coinRect = coin.getBoundingClientRect();
        if (
            playerRect.left < coinRect.right &&
            playerRect.right > coinRect.left &&
            playerRect.top < coinRect.bottom &&
            playerRect.bottom > coinRect.top
        ) {
            // collected
            coinsCollected += 1;
            if (coinsDisplay) coinsDisplay.innerText = coinsCollected;
            // respawn coin
            coinTops[i] = getSpawnTop(i);
            coinLaneIndexes[i] = Math.floor(Math.random() * lanePositions.length);
            coin.style.left = (lanePositions[coinLaneIndexes[i]] + 20) + 'px';
        }
    }

    for (const enemy of enemies) {
        const enemyRect = enemy.getBoundingClientRect();

        if (
            playerRect.left + 15 < enemyRect.right &&
            playerRect.right - 15 > enemyRect.left &&
            playerRect.top + 15 < enemyRect.bottom &&
            playerRect.bottom - 15 > enemyRect.top
        ) {
            isGameOver = true;
            stopEngineSound();
            if (player) player.classList.remove('engine-thrust');
            animateCrashEffect(enemy);
            if (player) {
                player.classList.add('crash-impact');
                setTimeout(() => player.classList.remove('crash-impact'), 900);
            }
            showGameOverSummary();
            if (isCrashSoundEnabled()) playCrashSound();
            triggerCrashFlash();
            triggerRoadShake();
            return;
        }
    }
}

function runSceneFrame(timestamp) {
    if (!lastFrameTime) {
        lastFrameTime = timestamp;
    }

    const deltaSeconds = Math.min((timestamp - lastFrameTime) / 1000, 0.03);
    lastFrameTime = timestamp;

    if (!isGameOver && !isPaused) {
        moveRoad(deltaSeconds);
        moveEnemies(deltaSeconds);
        moveCoins(deltaSeconds);
        updatePlayerVisual(deltaSeconds);
        checkCollision();
        updateEnginePitch();
    }

    sceneAnimId = requestAnimationFrame(runSceneFrame);
}

function startSceneLoop() {
    if (sceneAnimId) {
        cancelAnimationFrame(sceneAnimId);
    }
    lastFrameTime = null;
    sceneAnimId = requestAnimationFrame(runSceneFrame);
}

function startGame() {
    isGameOver = false;
    isPaused = false;
    if (sceneAnimId) { cancelAnimationFrame(sceneAnimId); sceneAnimId = null; }
    stopHoldMove();
    stopEngineSound();
    playStartSound();
    playEngineRev();
    startEngineSound();
    if (player) player.classList.add('engine-thrust');
    gameOver.style.display = "none";
    score = 0;
    scoreDisplay.innerText = score;
    coinsCollected = 0;
    if (coinsDisplay) coinsDisplay.innerText = coinsCollected;
    updateLanePositions();
    currentLane = 1;
    updatePlayerPosition();
    syncControlVisibility();
    pauseBtn.disabled = false;
    resumeBtn.disabled = true;

    initializeEnemies();
    initializeCoins();
    startSceneLoop();
}

window.addEventListener('resize', function() {
    updateLanePositions();
    updatePlayerPosition();
    enemyLaneIndexes.forEach((laneIndex, index) => {
        if (enemies[index]) {
            enemies[index].style.left = lanePositions[laneIndex] + 'px';
        }
    });
    // reposition coins if present
    coinLaneIndexes.forEach((laneIndex, index) => {
        if (coins[index]) coins[index].style.left = (lanePositions[laneIndex] + 20) + 'px';
    });
});

function pauseGame() {
    if (isGameOver || isPaused) return;
    isPaused = true;
    pauseBtn.disabled = true;
    resumeBtn.disabled = false;
    stopEngineSound();
    if (player) player.classList.remove('engine-thrust');
    if (sceneAnimId) {
        cancelAnimationFrame(sceneAnimId);
        sceneAnimId = null;
    }
    stopHoldMove();
}

function resumeGame() {
    if (isGameOver || !isPaused) return;
    isPaused = false;
    pauseBtn.disabled = false;
    resumeBtn.disabled = true;
    stopEngineSound();
    startEngineSound();
    if (player) player.classList.add('engine-thrust');
    playEngineRev();
    startSceneLoop();
}

const finalScoreEl = document.getElementById('finalScore');
const finalLevelEl = document.getElementById('finalLevel');
const finalCoinsEl = document.getElementById('finalCoins');
const restartBtn = document.getElementById("restartBtn");
const goBackBtn = document.getElementById("goBackBtn");

function showGameOverSummary() {
    if (finalScoreEl) finalScoreEl.innerText = score;
    if (finalLevelEl) finalLevelEl.innerText = Math.floor(score / 20) + 1;
    if (finalCoinsEl) finalCoinsEl.innerText = coinsCollected;
    syncControlVisibility();
    gameOver.style.display = "flex";
}

restartBtn.addEventListener("click", function () {
    isGameOver = false;
    isPaused = false;
    gameOver.style.display = "none";
    stopHoldMove();
    stopEngineSound();
    playStartSound();
    score = 0;
    scoreDisplay.innerText = score;
    if (coinsDisplay) coinsDisplay.innerText = 0;
    coinsCollected = 0;
    pauseBtn.disabled = false;
    resumeBtn.disabled = true;
    updateLanePositions();
    currentLane = 1;
    updatePlayerPosition();
    syncControlVisibility();
    initializeEnemies();
    initializeCoins();
    setControlMode(controlMode);
    startSceneLoop();
});

if (goBackBtn) goBackBtn.addEventListener("click", function () {
    // stop animations and return to home
    if (sceneAnimId) { cancelAnimationFrame(sceneAnimId); sceneAnimId = null; }
    stopHoldMove();
    stopEngineSound();
    if (player) player.classList.remove('engine-thrust');
    isPaused = false;
    isGameOver = false;
    gameOver.style.display = "none";
    gameContainer.style.display = "none";
    home.style.display = "block";
    pauseBtn.disabled = true;
    resumeBtn.disabled = true;
    score = 0;
    scoreDisplay.innerText = score;
});

// --- Settings modal logic ---
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const aboutBtn = document.getElementById("aboutBtn");
const aboutModal = document.getElementById("aboutModal");
const closeAboutBtn = document.getElementById("closeAboutBtn");
const engineSoundEl = document.getElementById("engineSound");
const crashSoundEl = document.getElementById("crashSound");
const darkModeEl = document.getElementById("darkModeToggle");
const controlModeInputs = Array.from(document.querySelectorAll('input[name="controlMode"]'));

function getSelectedControlMode() {
    const checked = controlModeInputs.find(input => input.checked);
    return checked && checked.value === 'swipe' ? 'swipe' : 'buttons';
}

function loadSettings() {
    try {
        const raw = localStorage.getItem('gameSettings');
        if (!raw) {
            setControlMode('buttons');
            return;
        }
        const s = JSON.parse(raw);
        if (engineSoundEl) engineSoundEl.checked = !!s.engineSound;
        if (crashSoundEl) crashSoundEl.checked = !!s.crashSound;
        if (darkModeEl) darkModeEl.checked = !!s.darkMode;
        const savedMode = s.controlMode === 'swipe' ? 'swipe' : 'buttons';
        controlModeInputs.forEach(input => {
            input.checked = input.value === savedMode;
        });
        setControlMode(savedMode);
        applyDarkMode(!!s.darkMode);
    } catch (e) {
        setControlMode('buttons');
    }
}

function saveSettings() {
    const s = {
        engineSound: engineSoundEl ? !!engineSoundEl.checked : false,
        crashSound: crashSoundEl ? !!crashSoundEl.checked : false,
        darkMode: darkModeEl ? !!darkModeEl.checked : false,
        controlMode: getSelectedControlMode()
    };
    try { localStorage.setItem('gameSettings', JSON.stringify(s)); } catch (e) {}
    setControlMode(s.controlMode);
    applyDarkMode(s.darkMode);
}

function applyDarkMode(enabled){
    if (enabled) document.body.classList.add('dark');
    else document.body.classList.remove('dark');
}

if (settingsBtn && settingsModal) {
    settingsBtn.addEventListener('click', function(){
        loadSettings();
        settingsModal.style.display = 'flex';
    });
}

if (aboutBtn && aboutModal) {
    aboutBtn.addEventListener('click', function(){
        aboutModal.style.display = 'flex';
    });
}

if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', function(){
    settingsModal.style.display = 'none';
});

if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', function(){
    saveSettings();
    settingsModal.style.display = 'none';
});

if (closeAboutBtn) closeAboutBtn.addEventListener('click', function(){
    aboutModal.style.display = 'none';
});


// close modal when clicking outside dialog
if (settingsModal) settingsModal.addEventListener('click', function(e){
    if (e.target === settingsModal){ settingsModal.style.display = 'none'; }
});

if (aboutModal) aboutModal.addEventListener('click', function(e){
    if (e.target === aboutModal){ aboutModal.style.display = 'none'; }
});

// initialize on load
loadSettings();
loadTheme();
 

// --- Tap animation helper ---
function bindTapAnimation(selector){
    const els = document.querySelectorAll(selector);
    els.forEach(el=>{
        let removeTimer = null;
        const add = ()=>{
            if(removeTimer) clearTimeout(removeTimer);
            el.classList.add('tap-animate');
        };
        const remove = ()=>{
            if(removeTimer) clearTimeout(removeTimer);
            removeTimer = setTimeout(()=> el.classList.remove('tap-animate'), 140);
        };
        el.addEventListener('mousedown', add);
        el.addEventListener('touchstart', add, {passive:true});
        el.addEventListener('mouseup', remove);
        el.addEventListener('mouseleave', remove);
        el.addEventListener('touchend', remove);
        el.addEventListener('touchcancel', remove);
        // ensure keyboard activation shows effect
        el.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' ') add(); });
        el.addEventListener('keyup', (e)=>{ if(e.key==='Enter' || e.key===' ') remove(); });
    });
}

// bind tap animation to home controls
bindTapAnimation('.home-option');
bindTapAnimation('.home-primary');
bindTapAnimation('.home-secondary');
bindTapAnimation('#settingsBtn');
bindTapAnimation('#aboutBtn');

