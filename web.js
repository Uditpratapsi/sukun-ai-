(() => {
  // Browser fallback and APK fallback: use the same Gemini-backed conversation.
  if (window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform()) return;

  const statusEl = document.getElementById("status");
  const answerEl = document.getElementById("answer");
  const mic = document.getElementById("mic");
  const hint = document.getElementById("hint");
  const form = document.getElementById("chat");
  const typed = document.getElementById("typed");
  const KEY_NAME = "sukoon_gemini_api_key";
  let busy = false;
  let listening = false;

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "hi-IN";
    utter.rate = 0.92;
    utter.pitch = 1.05;
    window.speechSynthesis.speak(utter);
  }

  async function askGemini(question) {
    let apiKey = (localStorage.getItem(KEY_NAME) || "").trim();
    if (!apiKey) {
      apiKey = (window.prompt("Sukoon AI ko jawab dene ke liye Google AI Studio ki Gemini API key paste karein. Key isi phone par save hogi:") || "").trim();
      if (!apiKey) throw new Error("NO_API_KEY");
      if (!apiKey.startsWith("AIza")) throw new Error("BAD_API_KEY");
      localStorage.setItem(KEY_NAME, apiKey);
    }

    const models = ["gemini-3.8-flash", "gemini-2.5-flash"];
    let lastError = "";
    for (const model of models) {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: "Tum Sukoon AI ho, Ritesh ki Hindi bolne wali, pyaar se baat karne wali personal assistant. Saral Hindi/Hinglish mein seedha aur sahi jawab do. Apne aap ko AI assistant batao; jhootha dawa mat karo. Agar jaankari na ho to saaf batao. User ko jaanu keh sakti ho, lekin har line mein nahi." }] },
            contents: [{ role: "user", parts: [{ text: question }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 900 }
          })
        }
      );

      let data = {};
      try { data = await response.json(); } catch (_) {}
      if (response.status === 404 && model !== models[models.length - 1]) {
        lastError = data?.error?.message || ("Model " + model + " available nahi hai");
        continue;
      }
      if (!response.ok) {
        const detail = String(data?.error?.message || ("HTTP " + response.status)).slice(0, 450);
        const error = new Error("GEMINI_HTTP_" + response.status + ": " + detail);
        error.status = response.status;
        throw error;
      }
      const reply = data?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
      if (!reply) throw new Error("EMPTY_REPLY: " + (data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || "Khali jawab"));
      return reply;
    }
    throw new Error("MODEL_NOT_FOUND: " + lastError);
  }

  function offlineProjectHelp(question) {
  const q = String(question || "").toLowerCase();
  const robot = /robot|रोबोट|arduino|raspberry|sensor|सेंसर/.test(q);
  const website = /website|वेबसाइट|web site|html|css|javascript|वेब साइट/.test(q);
  const app = /android app|app banana|ऐप बन|एप बन|application|apk|मोबाइल ऐप|ऐप तैयार/.test(q);
  const code = /code|कोड|program|प्रोग्राम|python|java|javascript/.test(q);
  if (robot) return "अभी ऑफलाइन मदद: रोबोट बनाने के लिए पहले काम तय करें (जैसे लाइन-फॉलोअर या रिमोट-कंट्रोल), फिर Arduino/ESP32 कंट्रोलर, मोटर ड्राइवर, मोटर, बैटरी और सेंसर चुनें। वायरिंग और कोड हार्डवेयर के अनुसार बदलेंगे। बिजली जोड़ने से पहले वोल्टेज/पिन जाँचें। इंटरनेट जुड़ने पर मैं पूरा पार्ट्स-लिस्ट, वायरिंग और कोड बनाने में मदद करूँगी।";
  if (website) return "अभी ऑफलाइन मदद: वेबसाइट के लिए 3 फाइलें बनती हैं—index.html (ढाँचा), style.css (डिज़ाइन), script.js (बटन/फीचर)। पहले पेज का उद्देश्य और फीचर लिखें, फिर मोबाइल-फ्रेंडली लेआउट बनाकर ब्राउज़र में जाँचें। इंटरनेट उपलब्ध होने पर मैं तुम्हारे लिए पूरा कोड तैयार कर सकती हूँ।";
  if (app) return "अभी ऑफलाइन मदद: Android ऐप की योजना—(1) स्क्रीन/फीचर सूची, (2) UI, (3) लॉजिक, (4) permissions, (5) APK build, (6) फोन पर install/test। मौजूदा Sukoon ऐप में बदलाव करेंगे, अलग नया प्रोजेक्ट नहीं बनाएँगे। इंटरनेट उपलब्ध होने पर मैं वास्तविक फाइलों में बदलाव और build जाँच आगे बढ़ा सकती हूँ।";
  if (code) return "अभी ऑफलाइन मदद: कोड लिखने से पहले भाषा, इनपुट, अपेक्षित आउटपुट और error तय करें। कोड को छोटे हिस्सों में चलाकर जाँचें। इस APK में अभी पूरा स्थानीय AI मॉडल मौजूद होने की पुष्टि नहीं है, इसलिए जटिल नया कोड बनाने के लिए इंटरनेट AI की ज़रूरत होगी।";
  return null;
}

async function answerQuestion(question) {
    const q = (question || "").trim();
    if (!q || busy) return;
    busy = true;
    statusEl.textContent = "Sukoon soch rahi hai…";
    answerEl.textContent = "Ek pal jaanu, jawab taiyar kar rahi hoon.";
    try {
      const reply = await askGemini(q);
      answerEl.textContent = reply;
      statusEl.textContent = "Sukoon ka jawab";
      speak(reply);
    } catch (error) {
      const localReply = offlineProjectHelp(q);
      if (localReply) {
        answerEl.textContent = localReply;
        statusEl.textContent = "Sukoon offline madad";
        speak(localReply);
        return;
      }
      const code = String(error && (error.message || error));
      if (code === "NO_API_KEY") {
        answerEl.textContent = "Jaanu, Gemini API key nahi di gayi. Google AI Studio ki key daal kar phir sawaal poochho.";
        statusEl.textContent = "Gemini key missing";
      } else if (code === "BAD_API_KEY") {
        answerEl.textContent = "Jaanu, key ka format sahi nahi lag raha. Google AI Studio se Gemini API key copy karo.";
        statusEl.textContent = "API key format error";
      } else if (code.startsWith("GEMINI_HTTP_401") || code.startsWith("GEMINI_HTTP_403")) {
        answerEl.textContent = "Gemini ne request reject ki: " + code.replace(/^GEMINI_HTTP_\\d+:?\\s*/, "");
        statusEl.textContent = "Gemini permission / key error";
      } else if (code.startsWith("GEMINI_HTTP_429")) {
        answerEl.textContent = "Gemini ki request limit ya quota khatam ho sakti hai: " + code;
        statusEl.textContent = "Gemini quota limit";
      } else if (code.startsWith("MODEL_NOT_FOUND")) {
        answerEl.textContent = "Jaanu, available Gemini model nahi mila. Detail: " + code;
        statusEl.textContent = "Gemini model error";
      } else {
        answerEl.textContent = "AI se jawab nahi aaya. Internet check karke dobara try karo. Detail: " + code;
        statusEl.textContent = "AI connection error";
      }
    } finally {
      busy = false;
    }
  }

  mic.addEventListener("click", () => {
    if (busy || listening) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      statusEl.textContent = "Voice input available nahi";
      answerEl.textContent = "Jaanu, is jagah par speech recognition available nahi. APK mein mic permission aur Google speech service check karo.";
      return;
    }
    try {
      const recognition = new SR();
      recognition.lang = "hi-IN";
      recognition.continuous = false;
      recognition.interimResults = false;
      listening = true;
      mic.classList.add("listening");
      statusEl.textContent = "Sun rahi hoon jaanu…";
      hint.textContent = "Ab bolo…";
      recognition.onresult = event => answerQuestion(event.results?.[0]?.[0]?.transcript || "");
      recognition.onerror = event => {
        statusEl.textContent = "Awaaz nahi mil payi";
        answerEl.textContent = "Jaanu, mic allow karo aur dobara try karo. " + (event.error || "");
      };
      recognition.onend = () => {
        listening = false;
        mic.classList.remove("listening");
        hint.textContent = "Dobara bolne ke liye mic dabao";
      };
      recognition.start();
    } catch (error) {
    const localReply = offlineProjectHelp(q);
    if (localReply) {
      answerEl.textContent = localReply;
      statusEl.textContent = "Sukoon offline madad";
      speak(localReply);
      return;
    }
      listening = false;
      mic.classList.remove("listening");
      statusEl.textContent = "Mic dobara try karo";
      answerEl.textContent = "Mic shuru nahi hua: " + String(error?.message || error);
    }
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    const question = typed.value;
    typed.value = "";
    answerQuestion(question);
  });
})();