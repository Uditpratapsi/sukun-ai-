import { SpeechRecognition } from "@capacitor-community/speech-recognition";

const statusEl = document.getElementById("status");
const answerEl = document.getElementById("answer");
const mic = document.getElementById("mic");
const hint = document.getElementById("hint");
const form = document.getElementById("chat");
const typed = document.getElementById("typed");
let busy = false;

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "hi-IN";
  utter.rate = 0.92;
  utter.pitch = 1.05;
  window.speechSynthesis.speak(utter);
}
function demoReply(question) {
  const q = question.toLowerCase();
  if (q.includes("naam")) return "Jaanu, mera naam Sukoon AI hai.";
  if (q.includes("kaise ho")) return "Main taiyar hoon jaanu. Tum kaise ho?";
  if (q.includes("namaste") || q.includes("hello") || q.includes("hi")) return "Namaste jaanu! Batao, kya baat hai?";
  if (q.includes("band") || q.includes("ruk")) return "Theek hai jaanu, main sun rahi hoon.";
  return "Jaanu, maine suna: " + question + ". Abhi is app mein asli AI service connect nahi hai, isliye main abhi sahi AI jawab nahi de sakti.";
}
function answerQuestion(question) {
  const q = (question || "").trim();
  if (!q) return;
  answerEl.textContent = demoReply(q);
  speak(answerEl.textContent);
  statusEl.textContent = "Sukoon ne tumhari baat suni";
}
async function listen() {
  if (busy) return;
  busy = true;
  mic.classList.add("listening");
  statusEl.textContent = "Sun rahi hoon jaanu…";
  hint.textContent = "Ab bolo…";
  try {
    const available = await SpeechRecognition.available();
    if (!available.available) throw new Error("NOT_AVAILABLE");
    // Only ask Android for permission when it has not already been granted.
    let permission = await SpeechRecognition.checkPermissions();
    if (permission.speechRecognition !== "granted") {
      permission = await SpeechRecognition.requestPermissions();
    }
    if (permission.speechRecognition !== "granted") throw new Error("PERMISSION_DENIED");
    const result = await SpeechRecognition.start({
      language: "hi-IN",
      maxResults: 1,
      partialResults: false,
      popup: true
    });
    const transcript = result && result.matches && result.matches[0];
    if (transcript) answerQuestion(transcript);
    else {
      statusEl.textContent = "Awaaz samajh nahi aayi";
      answerEl.textContent = "Jaanu, ek baar phir mic dabakar bolo.";
    }
  } catch (error) {
    const msg = String(error && (error.message || error));
    if (msg.includes("PERMISSION_DENIED") || msg.toLowerCase().includes("denied")) {
      statusEl.textContent = "Microphone permission band hai";
      answerEl.textContent = "Jaanu, Android Settings mein Sukoon AI ka Microphone Allow karo.";
    } else if (msg.includes("NOT_AVAILABLE")) {
      statusEl.textContent = "Speech recognition available nahi";
      answerEl.textContent = "Is phone par speech recognition service available nahi hai. Google app/Speech Services update karke dekho.";
    } else {
      statusEl.textContent = "Mic shuru nahi ho paya";
      answerEl.textContent = "Jaanu, mic shuru nahi hua. Internet aur phone ki speech service check karo, phir dobara koshish karo.";
    }
  } finally {
    busy = false;
    mic.classList.remove("listening");
    hint.textContent = "Dobara bolne ke liye mic dabao";
  }
}
mic.addEventListener("click", listen);
form.addEventListener("submit", event => {
  event.preventDefault();
  answerQuestion(typed.value);
  typed.value = "";
});
