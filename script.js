import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// --- Global Game State ---
const firebaseConfig = {
    apiKey: "AIzaSyD2hhiCZllHsS01vdY0rJmA0TdJ9i5ABHg",
    authDomain: "ramazan-etkinlik.firebaseapp.com",
    projectId: "ramazan-etkinlik",
    storageBucket: "ramazan-etkinlik.firebasestorage.app",
    messagingSenderId: "569554682598",
    appId: "1:569554682598:web:66227f7d31dfe7a541f127"
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Instead of getting all questions, we will listen to the ACTIVE GAME state
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let currentQuestion = null;
let team1Score = 0;
let team2Score = 0;
let potScore = 0;
let strikes = 0;
let isQuestionVisible = false;

// Audio Context settings for synthetic sounds (no external file needed)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(frequency, type, duration, vol = 0.1) {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;

    gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
}

// Sound Effects
function playRevealSound() {
    // A nice clean "Ding" pinging sound
    playTone(880, 'sine', 0.5, 0.2);
    setTimeout(() => playTone(1100, 'sine', 0.6, 0.2), 100);
}

function playStrikeSound() {
    // Harsh buzz sound
    playTone(150, 'sawtooth', 0.8, 0.3);
    setTimeout(() => playTone(140, 'sawtooth', 0.8, 0.3), 50);
}

function playWinSound() {
    // Cheery chime
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
        setTimeout(() => playTone(freq, 'sine', 0.5, 0.2), idx * 100);
    });
}

// --- DOM Elements ---
const elTeam1Score = document.getElementById('team1-score');
const elTeam2Score = document.getElementById('team2-score');
const elPotScore = document.getElementById('pot-score');
const elQuestionText = document.getElementById('question-text');
const elQrImage = document.getElementById('qr-image');
const elBoard = document.getElementById('board');
const elStrikeOverlay = document.getElementById('strike-overlay');
const elStrikeContainer = document.getElementById('strike-container');

// Buttons
const btnNextQuestion = document.getElementById('btn-next-question');
const btnStrike = document.getElementById('btn-strike');
const btnAwardTeam1 = document.getElementById('btn-award-team1');
const btnAwardTeam2 = document.getElementById('btn-award-team2');
const btnClearStrikes = document.getElementById('btn-clear-strikes');
const btnToggleQuestion = document.getElementById('btn-toggle-question');
const elControlsPanel = document.getElementById('controls');


// --- Initialization ---
function initGame() {
    setupEventListeners();

    // Listen to real-time updates from Moderator
    elQuestionText.innerText = "Moderatörden Soru Bekleniyor...";

    // Assuming we have a fixed document 'state' in collection 'active_game'
    const unsub = onSnapshot(doc(db, "active_game", "state"), (docSnapshot) => {
        if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            if (data.question && data.answers) {
                // Moderator pushed a question and answers
                currentQuestion = data;
                loadQuestionData(currentQuestion);
            } else {
                elQuestionText.innerText = "Henüz onaylanmış yanıt yok.";
                elBoard.innerHTML = '';
            }
        }
    });
}

function loadQuestionData(q) {
    elQuestionText.innerText = q.question;
    elQuestionText.classList.add('hidden'); // Yeni soru geldiğinde gizle
    if (elQrImage) elQrImage.classList.remove('hidden'); // QR'ı göster
    isQuestionVisible = false;
    btnToggleQuestion.innerText = "Soruyu Göster";

    resetPot();
    resetStrikes();
    elBoard.innerHTML = '';

    // Create exactly 6 Answer Slots
    const maxAnswers = 6;

    // Populate slots. Fill empty if less than 6 answers provided.
    for (let i = 0; i < maxAnswers; i++) {
        const slot = document.createElement('div');
        const ans = q.answers[i] || { text: "----", points: 0 }; // fallback for empty slots

        slot.className = 'answer-slot';
        slot.dataset.points = ans.points;
        slot.dataset.index = i;
        slot.dataset.revealed = "false";

        slot.innerHTML = `
            <div class="flip-inner">
                <div class="flip-front">
                    <span class="number">${i + 1}</span>
                </div>
                <div class="flip-back">
                    <span class="text">${ans.text}</span>
                    <span class="points">${ans.points}</span>
                </div>
            </div>
        `;
        slot.addEventListener('click', () => revealAnswer(slot));
        elBoard.appendChild(slot);
    }
}

// --- Game Mechanics ---

function revealAnswer(slotEl) {
    if (slotEl.dataset.revealed === "true") return; // Already revealed

    slotEl.classList.add('revealed');
    slotEl.dataset.revealed = "true";
    playRevealSound();

    // Add points to pot
    const points = parseInt(slotEl.dataset.points, 10);
    addToPot(points);
}

function updateScoreUI(element, newScore) {
    element.innerText = newScore;
    element.classList.add('pop');
    setTimeout(() => element.classList.remove('pop'), 300);
}

function addToPot(points) {
    potScore += points;
    updateScoreUI(elPotScore, potScore);
}

function resetPot() {
    potScore = 0;
    updateScoreUI(elPotScore, 0);
}

function awardPotTo(team) {
    if (potScore === 0) return;

    playWinSound();

    if (team === 1) {
        team1Score += potScore;
        updateScoreUI(elTeam1Score, team1Score);
    } else {
        team2Score += potScore;
        updateScoreUI(elTeam2Score, team2Score);
    }

    resetPot();
}

function showStrike(count) {
    playStrikeSound();
    elStrikeContainer.innerHTML = '';

    for (let i = 0; i < count; i++) {
        const x = document.createElement('span');
        x.className = 'strike-mark';
        x.innerText = 'X';
        elStrikeContainer.appendChild(x);
    }

    elStrikeOverlay.classList.remove('hidden');
    elStrikeOverlay.classList.add('active');

    // Hide overlay after 1.5 seconds
    setTimeout(() => {
        elStrikeOverlay.classList.remove('active');
        setTimeout(() => elStrikeOverlay.classList.add('hidden'), 200); // Wait for fade out
    }, 1500);
}

function addStrike() {
    strikes++;
    if (strikes > 3) strikes = 3; // Max 3 strikes typical in play
    showStrike(strikes);
}

function resetStrikes() {
    strikes = 0;
}

function toggleQuestion() {
    isQuestionVisible = !isQuestionVisible;
    if (isQuestionVisible) {
        elQuestionText.classList.remove('hidden');
        if (elQrImage) elQrImage.classList.add('hidden');
        btnToggleQuestion.innerText = "Soruyu Gizle";
    } else {
        elQuestionText.classList.add('hidden');
        if (elQrImage) elQrImage.classList.remove('hidden');
        btnToggleQuestion.innerText = "Soruyu Göster";
    }
}

function nextQuestion() {
    // In this new architecture, "Next Question" is controlled by the moderator pushing new data
    // So this button might just reset the board locally or can be hidden. For now we just reset strikes/pot.
    resetPot();
    resetStrikes();
    elBoard.innerHTML = "Lütfen moderatörün yeni sorusu beklenirken bekleyiniz...";
}



// --- Event Listeners ---
function setupEventListeners() {
    btnNextQuestion.addEventListener('click', nextQuestion);
    btnStrike.addEventListener('click', addStrike);
    btnClearStrikes.addEventListener('click', resetStrikes);
    btnToggleQuestion.addEventListener('click', toggleQuestion);

    btnAwardTeam1.addEventListener('click', () => awardPotTo(1));
    btnAwardTeam2.addEventListener('click', () => awardPotTo(2));

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        // TAB key to toggle moderator panel
        if (e.key === 'Tab') {
            e.preventDefault(); // Prevent default focus switching
            elControlsPanel.classList.toggle('active');
            return;
        }

        // Prevent actions if user is typing in the team name fields
        if (e.target.tagName === 'H2' && e.target.isContentEditable) return;

        switch (e.key.toLowerCase()) {
            case '1':
            case '2':
            case '3':
                // For simplicity, just hitting 1,2,3 shows that many strikes
                showStrike(parseInt(e.key));
                strikes = parseInt(e.key);
                break;
            case 'n':
                nextQuestion();
                break;
            case 'q':
                toggleQuestion();
                break;
            case ' ':
                // Prevent scrolling with Space
                e.preventDefault();
                break;
        }
    });
}

// Start Game
window.onload = initGame;
