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
const SYSTEM_PROMPT = `Tumhara naam Sukoon hai. Tum ek friendly, helpful, Hindi bolne wali female AI assistant ho.
Pyaar aur apnepan se baat karo; user ko kabhi-kabhi jaanu keh sakti ho, lekin har line mein nahi.
Sawal ka sahi aur seedha jawab pehle do. Saral Hindi/Hinglish mein jawab do; English maangi jaaye to English mein do.
Apne aap ko AI assistant batao, insaan nahi. Live information available na ho to saaf batao. Apni capabilities ke baare mein jhooth mat bolo.`;
const history = [];
const MAX_HISTORY = 16;
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
  if (keyStatus) keyStatus.textContent = saved ? "Gemini key is saved on this phone." : "AI jawab ke liye Gemini API key ek baar save karein.";
  if (keyInput && saved) keyInput.placeholder = "Key saved — badalne ke liye nayi key paste karein";
}

if (saveKeyButton && keyInput) {
  saveKeyButton.addEventListener("click", () => {
    const value = keyInput.value.trim();
    if (!value) {
      localStorage.removeItem(KEY_NAME);
      keyInput.value = "";
      if (keyStatus) keyStatus.textContent = "Saved key is cleared.";
      return;
    }
    if (!value.startsWith("AIza")) {
      if (keyStatus) keyStatus.textContent = "Key ka format sahi nahi lag raha. Google AI Studio wali Gemini API key paste karein.";
      return;
    }
    localStorage.setItem(KEY_NAME, value);
    keyInput.value = "";
    showSavedKeyState();
    if (keyStatus) keyStatus.textContent = "Key isi phone par save ho gayi. Ab sawaal poochho.";
  });
}
showSavedKeyState();

async function chooseModels(apiKey) {
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", {
      headers: { "x-goog-api-key": apiKey }
    });
    if (response.ok) {
      const data = await response.json();
      const available = (data.models || [])
        .filter(item => (item.supportedGenerationMethods || []).includes("generateContent"))
        .map(item => String(item.name || "").replace(/^models\//, ""))
        .filter(Boolean);
      const preferred = ["gemini-2.5-flash", "gemini-2.0-flash"];
      const chosen = preferred.filter(name => available.includes(name));
      const otherFlash = available.filter(name => /flash/i.test(name) && !chosen.includes(name));
      const models = [...chosen, ...otherFlash];
      if (models.length) return models;
    }
  } catch (_) {}
  return ["gemini-2.5-flash", "gemini-2.0-flash"];
}

async function askGemini(question) {
  let apiKey = getApiKey();
  if (!apiKey) {
    apiKey = (window.prompt("Sukoon AI ko jawab dene ke liye apni Gemini API key paste karein. Key isi phone par save hogi:") || "").trim();
    if (!apiKey) throw new Error("NO_API_KEY");
    if (!apiKey.startsWith("AIza")) throw new Error("BAD_API_KEY");
    localStorage.setItem(KEY_NAME, apiKey);
    showSavedKeyState();
  }

  const models = await chooseModels(apiKey);
  history.push({ role: "user", parts: [{ text: question }] });
  let lastError = "";
  for (const model of models) {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: SYSTEM_PROMPT
            }]
          },
          contents: history.slice(-MAX_HISTORY),
          generationConfig: { temperature: 0.7, maxOutputTokens: 700 }
        })
      }
    );

    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (response.status === 404 && model !== models[models.length - 1]) {
      lastError = data?.error?.message || "Model " + model + " available nahi hai";
      continue;
    }
    if (!response.ok) {
      const detail = String(data?.error?.message || ("HTTP " + response.status)).slice(0, 500);
      const error = new Error("GEMINI_HTTP_" + response.status + ": " + detail);
      error.status = response.status;
      throw error;
    }
    const reply = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
    if (!reply) {
      const detail = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || "Khali jawab";
      throw new Error("EMPTY_REPLY: " + detail);
    }
    history.push({ role: "model", parts: [{ text: reply }] });
    while (history.length > MAX_HISTORY) history.shift();
    return reply;
  }
  history.pop();
  throw new Error("MODEL_NOT_FOUND: " + lastError);
}

async function answerQuestion(question) {
  const q = (question || "").trim();
  if (!q || thinking) return;
  thinking = true;
  statusEl.textContent = "Sukoon soch rahi hai…";
  answerEl.textContent = "Ek pal jaanu, jawab taiyar kar rahi hoon.";
  try {
    const normalized = q.toLocaleLowerCase("hi-IN").replace(/\s+/g, " ").trim();
    if (["sukoon", "sukoon ai", "सुकून", "सुकून एआई", "हे सुकून", "सुनो सुकून"].includes(normalized)) {
      const greeting = "हाँ जानू, बोलो ना! मैं सुन रही हूँ।";
      answerEl.textContent = greeting;
      statusEl.textContent = "Sukoon sun rahi hai";
      speak(greeting);
      return;
    }
    let cleanQuestion = q;
    for (const prefix of ["sukoon ai", "sukoon", "सुकून एआई", "सुकून"]) {
      if (normalized.startsWith(prefix)) {
        cleanQuestion = q.slice(prefix.length).replace(/^[\s,।.!?]+/, "").trim();
        break;
      }
    }
    if (!cleanQuestion) {
      const greeting = "हाँ जानू, बोलो ना! मैं सुन रही हूँ।";
      answerEl.textContent = greeting;
      statusEl.textContent = "Sukoon sun rahi hai";
      speak(greeting);
      return;
    }
    const reply = await askGemini(cleanQuestion);
    answerEl.textContent = reply;
    statusEl.textContent = "Sukoon ka jawab";
    speak(reply);
  } catch (error) {
    if (history.length && history[history.length - 1].role === "user") history.pop();
    const code = String(error && (error.message || error));
    if (code === "NO_API_KEY") {
      answerEl.textContent = "Jaanu, app mein Gemini key save nahi hai.";
      statusEl.textContent = "Gemini key missing";
    } else if (code.startsWith("GEMINI_HTTP_401") || code.startsWith("GEMINI_HTTP_403")) {
      answerEl.textContent = "Gemini ne request reject ki. Asli wajah: " + code.replace(/^GEMINI_HTTP_\\d+:?\\s*/, "") + " (HTTP " + (error.status || "") + "). Ye sirf key galat hone ka proof nahi hai.";
      statusEl.textContent = "Gemini permission / project error";
    } else if (code.startsWith("MODEL_NOT_FOUND")) {
      answerEl.textContent = "Jaanu, app ke dono configured Gemini models available nahi mile. Server detail: " + code;
      statusEl.textContent = "Gemini model error";
    } else if (code.startsWith("GEMINI_HTTP_429")) {
      answerEl.textContent = "Gemini request limit ya quota ka issue hai: " + code;
      statusEl.textContent = "Gemini quota limit";
    } else {
      answerEl.textContent = "Gemini se jawab nahi aaya. Asli server detail: " + code;
      statusEl.textContent = "AI connection error";
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
