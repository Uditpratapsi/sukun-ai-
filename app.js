import { SpeechRecognition } from "@capacitor-community/speech-recognition";

const statusEl = document.getElementById("status");
const answerEl = document.getElementById("answer");
const mic = document.getElementById("mic");
const hint = document.getElementById("hint");
const form = document.getElementById("chat");
const typed = document.getElementById("typed");
const keyInput = document.getElementById("apiKey");
const saveKeyButton = document.getElementById("saveKey");
const keyStatus = document.getElementById("keyStatus");

const KEY_NAME = "sukoon_gemini_api_key";
let listening = false;
let thinking = false;

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "hi-IN";
  utter.rate = 0.92;
  utter.pitch = 1.05;
  window.speechSynthesis.speak(utter);
}

function getApiKey() {
  return (localStorage.getItem(KEY_NAME) || "").trim();
}

function showSavedKeyState() {
  const saved = getApiKey();
  keyStatus.textContent = saved ? "Gemini key is saved on this phone." : "AI jawab ke liye Gemini API key ek baar save karein.";
  if (keyInput && saved) keyInput.placeholder = "Key saved — badalne ke liye nayi key paste karein";
}

if (saveKeyButton && keyInput) {
  saveKeyButton.addEventListener("click", () => {
    const value = keyInput.value.trim();
    if (!value) {
      localStorage.removeItem(KEY_NAME);
      keyInput.value = "";
      keyStatus.textContent = "Saved key is cleared.";
      return;
    }
    if (!value.startsWith("AIza")) {
      keyStatus.textContent = "Key ka format sahi nahi lag raha. Google AI Studio wali Gemini API key paste karein.";
      return;
    }
    localStorage.setItem(KEY_NAME, value);
    keyInput.value = "";
    showSavedKeyState();
    keyStatus.textContent = "Key isi phone par save ho gayi. Ab sawaal poochho.";
  });
}
showSavedKeyState();

async function askGemini(question) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("NO_API_KEY");
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=" + encodeURIComponent(apiKey),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: "Tum Sukoon AI ho, Ritesh ki Hindi bolne wali, pyaar se baat karne wali personal assistant. Hamesha saral Hindi/Hinglish mein seedha aur sahi jawab do. Apne aap ko AI assistant batao; jhootha dawa mat karo. Agar current jaankari ki zaroorat ho aur tumhe pata na ho to saaf batao. User ko 'jaanu' keh sakti ho, lekin har line mein nahi."
          }]
        },
        contents: [{ role: "user", parts: [{ text: question }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 700 }
      })
    }
  );

  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("BAD_API_KEY");
    if (response.status === 404) throw new Error("MODEL_NOT_FOUND");
    if (response.status === 429) throw new Error("RATE_LIMIT");
    throw new Error("API_ERROR_" + response.status);
  }
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
  if (!text) throw new Error("EMPTY_REPLY");
  return text;
}

async function answerQuestion(question) {
  const q = (question || "").trim();
  if (!q || thinking) return;
  thinking = true;
  statusEl.textContent = "Sukoon soch rahi hai…";
  answerEl.textContent = "Ek pal jaanu, jawab taiyar kar rahi hoon.";
  try {
    const reply = await askGemini(q);
    answerEl.textContent = reply;
    statusEl.textContent = "Sukoon ka jawab";
    speak(reply);
  } catch (error) {
    const code = String(error && (error.message || error));
    if (code === "NO_API_KEY") {
      answerEl.textContent = "Jaanu, AI jawab chalu karne ke liye neeche Gemini API key ek baar save karo. Key isi phone par rahegi.";
      statusEl.textContent = "Gemini key abhi save nahi hai";
    } else if (code === "BAD_API_KEY") {
      answerEl.textContent = "Jaanu, Gemini API key galat hai ya uski permission nahi hai. Google AI Studio se key check karo.";
      statusEl.textContent = "API key check karo";
    } else if (code === "MODEL_NOT_FOUND") {
      answerEl.textContent = "Jaanu, is API key ke liye Gemini model available nahi hai. Google AI Studio mein available model check karna hoga.";
      statusEl.textContent = "Gemini model available nahi";
    } else if (code === "RATE_LIMIT") {
      answerEl.textContent = "Jaanu, Gemini ki request limit abhi poori ho gayi hai. Thodi der baad dobara try karo.";
      statusEl.textContent = "Thodi der baad try karo";
    } else {
      answerEl.textContent = "Jaanu, AI server se jawab nahi aaya. Internet check karke dobara koshish karo. (" + code + ")";
      statusEl.textContent = "AI connection mein dikkat";
    }
  } finally {
    thinking = false;
  }
}

async function listen() {
  if (listening || thinking) return;
  listening = true;
  mic.classList.add("listening");
  statusEl.textContent = "Sun rahi hoon jaanu…";
  hint.textContent = "Ab bolo…";
  try {
    const available = await SpeechRecognition.available();
    if (!available || !available.available) throw new Error("NOT_AVAILABLE");

    let permission = await SpeechRecognition.checkPermissions();
    if (permission?.speechRecognition !== "granted") {
      await SpeechRecognition.requestPermissions();
      permission = await SpeechRecognition.checkPermissions();
    }
    if (permission?.speechRecognition !== "granted") {
      throw new Error("PERMISSION_DENIED:" + (permission?.speechRecognition || "unknown"));
    }

    const result = await SpeechRecognition.start({
      language: "hi-IN",
      maxResults: 1,
      partialResults: false,
      popup: true,
      prompt: "Sukoon se baat karne ke liye bolo"
    });
    const transcript = result?.matches?.[0]?.trim();
    if (transcript) {
      await answerQuestion(transcript);
    } else {
      statusEl.textContent = "Awaaz samajh nahi aayi";
      answerEl.textContent = "Jaanu, ek baar phir mic dabakar saaf bolo.";
    }
  } catch (error) {
    const msg = String(error && (error.message || error));
    if (msg.includes("PERMISSION_DENIED")) {
      statusEl.textContent = "Android mic permission nahi mili";
      answerEl.textContent = "Jaanu, Settings > Apps > Sukoon AI > Permissions mein Microphone Allow karo. Phir app ko band karke dobara kholo.";
    } else if (msg.includes("NOT_AVAILABLE")) {
      statusEl.textContent = "Speech recognition available nahi";
      answerEl.textContent = "Is phone par speech recognition service nahi mil rahi. Google app ya Speech Services by Google update karo, aur internet check karo.";
    } else {
      statusEl.textContent = "Mic shuru nahi ho paya";
      answerEl.textContent = "Jaanu, mic start nahi hua (" + msg + "). Android mein Microphone permission aur Google speech service check karo.";
    }
  } finally {
    listening = false;
    mic.classList.remove("listening");
    hint.textContent = "Dobara bolne ke liye mic dabao";
  }
}

mic.addEventListener("click", listen);
form.addEventListener("submit", async event => {
  event.preventDefault();
  const question = typed.value;
  typed.value = "";
  await answerQuestion(question);
});
