import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { initFeatures, handleLocalCommand } from "./features.js";

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

async function fetchWithRetry(url, options, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      if (attempt === attempts - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (2 ** attempt)));
      continue;
    }
    if (![500, 502, 503, 504].includes(response.status) || attempt === attempts - 1) return response;
    await new Promise(resolve => setTimeout(resolve, 1000 * (2 ** attempt)));
  }
  throw new Error("Network request failed");
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
    const response = await fetchWithRetry("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", {
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
    const response = await fetchWithRetry(
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
          generationConfig: { temperature: 0.7, maxOutputTokens: 300 }
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

function offlineProjectHelp(question) {
  const q = String(question || "").toLowerCase().replace(/[?!.।,]/g, " ").replace(/\s+/g, " ").trim();
  const has = (...words) => words.some(word => q.includes(word));
  if (!q) return "अपना सवाल लिखो या माइक से बोलो।";
  if (has("kaisi ho","कैसी हो","कैसा है","how are you","tum kaisi","तुम कैसी","हाल चाल","हालचाल","क्या हाल","kya haal")) return "मैं ठीक हूँ जानू, तुमसे बात करके अच्छा लग रहा है। 💙 तुम बताओ, तुम्हारा क्या हाल है? आज दिन कैसा जा रहा है?";
  if (has("main theek","मैं ठीक","sab thik","सब ठीक","badhiya","बढ़िया","accha hu","अच्छा हूँ","theek hu","ठीक हूँ")) return "अच्छा लगा सुनकर जानू। 😊 आज कुछ खास हुआ या बस ऐसे ही बात करने आए हो? मैं सुन रही हूँ।";
  if (has("pareshan","परेशान","udaas","उदास","dukhi","दुखी","mann nahi","मन नहीं","tension","टेंशन","akela","अकेला","lonely")) return "अरे जानू, क्या हुआ? आराम से बताओ, मैं सुन रही हूँ। तुम्हें अभी सलाह चाहिए या बस चाहते हो कि मैं तुम्हारी बात सुनूँ?";
  if (has("tum sun rahi","सुन रही","sun rahi ho","सुन रही हो","baat karni","बात करनी","baat karo","बात करो","mere se baat","मुझसे बात")) return "हाँ जानू, मैं यहीं हूँ और तुम्हारी बात सुन रही हूँ। 💙 बताओ, मन में क्या चल रहा है?";
  if (has("shukriya","धन्यवाद","thank you","thanks","sukriya")) return "अरे जानू, धन्यवाद की क्या बात है। 💙 जब चाहो बात करना। और बताओ, अब कैसा महसूस कर रहे हो?";
  if (has("bye","बाय","good night","शुभ रात्रि","so jao","सो जाओ")) return "ठीक है जानू, अपना ध्यान रखना। 💙 जब वापस आओगे, फिर बात करेंगे।";
  if (has("tumhara naam","तुम्हारा नाम","who are you","kaun ho","कौन हो")) return "मैं सुकून हूँ, तुम्हारी फोन वाली हिंदी सहायक। मैं ऑफलाइन कुछ बातचीत और जानकारी दे सकती हूँ, लेकिन बिना इंटरनेट और API के हर नए सवाल का जवाब नहीं जानती।";
  if (has("namaste","hello","hi ","हेलो","नमस्ते","सुकून","sukoon")) return "हाँ जानू, मैं सुन रही हूँ। इंटरनेट AI उपलब्ध न हो तब भी मैं अपनी सीमित ऑफलाइन जानकारी से मदद कर सकती हूँ।";
  if (has("jyotish","ज्योतिष","kundli","कुंडली","rashifal","राशिफल","rashi","राशि","grah","ग्रह","horoscope","shani","शनि","mangal dosh","मंगल दोष")) return "ज्योतिष भारतीय परंपरा है जिसमें जन्म के समय ग्रहों की स्थिति से व्यक्तित्व या भविष्य की व्याख्या की जाती है। इसकी भविष्यवाणियों के लिए मजबूत वैज्ञानिक प्रमाण नहीं हैं, इसलिए इसे निश्चित सत्य या चिकित्सा/पैसे के फैसलों का आधार न मानें। सामान्य राशि-परंपराएँ समझा सकती हूँ; व्यक्तिगत कुंडली के लिए जन्म-तिथि, सही समय और स्थान चाहिए।";
  if (has("human body","insan","इंसान","मानव शरीर","शरीर","body","heart","दिल","हृदय","brain","दिमाग","मस्तिष्क","lungs","फेफड़े","blood","खून","रक्त","kidney","गुर्दा","liver","लीवर")) return "मानव शरीर कई प्रणालियों से मिलकर बना है: मस्तिष्क और नसें नियंत्रण करती हैं; हृदय रक्त पंप करता है; फेफड़े ऑक्सीजन लेते हैं; पाचन तंत्र भोजन से पोषक तत्व लेता है; गुर्दे खून छानकर अपशिष्ट निकालते हैं; हड्डियाँ सहारा देती हैं और मांसपेशियाँ गति कराती हैं। सामान्य जानकारी के लिए यह उपयोगी है, लेकिन लक्षण या इलाज के लिए योग्य डॉक्टर से सलाह लें।";
  if (has("doctor","medical","medicine","दवा","डॉक्टर","चिकित्सा","बीमारी","बुखार","fever","pain","दर्द","health","स्वास्थ्य")) return "स्वास्थ्य की सामान्य जानकारी दे सकती हूँ, लेकिन ऑफलाइन जवाब निदान या डॉक्टर का विकल्प नहीं है। गंभीर साँस की तकलीफ, सीने में दर्द, बेहोशी या अचानक कमजोरी हो तो तुरंत स्थानीय आपातकालीन सहायता लें। दवा शुरू/बंद करने से पहले डॉक्टर या फार्मासिस्ट से पूछें।";
  if (has("computer","कंप्यूटर","cpu","ram","rom","keyboard","कीबोर्ड","mouse","माउस","operating system","ऑपरेटिंग सिस्टम")) return "कंप्यूटर डेटा को इनपुट के रूप में लेता है, CPU निर्देश चलाता है, RAM चल रहे काम का अस्थायी डेटा रखती है, स्टोरेज फाइलें लंबे समय तक रखता है और आउटपुट स्क्रीन/स्पीकर पर दिखता है। Operating System (जैसे Android, Windows, Linux) हार्डवेयर और ऐप्स के बीच काम संभालता है।";
  if (has("internet","इंटरनेट","network","नेटवर्क","wifi","वाईफाई","router","राउटर","ip address","आईपी")) return "नेटवर्क जुड़े हुए डिवाइसों के बीच डेटा भेजता है। Wi‑Fi फोन को स्थानीय वायरलेस नेटवर्क से जोड़ता है; राउटर नेटवर्कों के बीच ट्रैफिक भेजता है; IP address नेटवर्क पर डिवाइस/इंटरफेस की पहचान करता है; DNS डोमेन नाम को IP address में बदलता है। इंटरनेट की वास्तविक स्थिति जाँचने के लिए लाइव कनेक्शन चाहिए।";
  if (has("ai kya","artificial intelligence","एआई","ai ","machine learning","मशीन लर्निंग","chatgpt","कृत्रिम बुद्धिमत्ता")) return "AI यानी कृत्रिम बुद्धिमत्ता ऐसे कंप्यूटर सिस्टम हैं जो भाषा समझने, पैटर्न पहचानने, योजना बनाने या सामग्री बनाने जैसे काम करते हैं। बड़े भाषा मॉडल सीखे हुए पैटर्न से जवाब बनाते हैं; वे गलती भी कर सकते हैं, इसलिए महत्वपूर्ण तथ्य जाँचें। इस ऐप की ऑफलाइन जानकारी सीमित है; पूरा AI मॉडल अभी इसमें शामिल होने की पुष्टि नहीं है।";
  if (has("solar system","सौरमंडल","planet","ग्रह","earth","पृथ्वी","sun","सूर्य","moon","चंद्रमा","space","अंतरिक्ष")) return "हमारे सौरमंडल में सूर्य केंद्र में है और आठ मान्य ग्रह हैं: बुध, शुक्र, पृथ्वी, मंगल, बृहस्पति, शनि, अरुण और वरुण। पृथ्वी सूर्य से तीसरा ग्रह है। चंद्रमा पृथ्वी का प्राकृतिक उपग्रह है।";
  if (has("india","भारत","bharat","राजधानी","capital","प्रधानमंत्री","president","राष्ट्रपति","constitution","संविधान")) return "भारत की राजधानी नई दिल्ली है। भारत एक संसदीय लोकतांत्रिक गणराज्य है और संविधान 26 जनवरी 1950 को लागू हुआ। वर्तमान पदाधिकारियों और बदलते सरकारी आँकड़ों की पुष्टि के लिए इंटरनेट पर नवीनतम आधिकारिक स्रोत देखना चाहिए।";
  if (has("science","विज्ञान","gravity","गुरुत्वाकर्षण","atom","परमाणु","electricity","बिजली","force","बल","photosynthesis","प्रकाश संश्लेषण")) return "विज्ञान प्रकृति को निरीक्षण, प्रयोग और प्रमाण से समझने का तरीका है। गुरुत्वाकर्षण द्रव्यमान वाली वस्तुओं के बीच आकर्षण है। परमाणु पदार्थ की मूल संरचनात्मक इकाई है, जिसमें नाभिक और इलेक्ट्रॉन होते हैं। पौधे प्रकाश संश्लेषण से प्रकाश ऊर्जा का उपयोग करके भोजन बनाते हैं।";
  if (has("website","वेबसाइट","html","css","javascript","वेब साइट")) return "वेबसाइट बनाने की बुनियाद: HTML पेज का ढाँचा बनाता है, CSS उसका रूप/डिज़ाइन तय करता है और JavaScript इंटरैक्शन जोड़ता है। पहले index.html, फिर style.css और script.js बनाकर मोबाइल ब्राउज़र में जाँचें। इंटरनेट उपलब्ध होने पर मैं पूरा कोड और फीचर बनाने में मदद कर सकती हूँ।";
  if (has("app banana","android app","ऐप बन","एप बन","apk","मोबाइल ऐप","ऐप तैयार")) return "Android ऐप बनाने की प्रक्रिया: स्क्रीन और फीचर तय करना, UI बनाना, लॉजिक लिखना, permissions जोड़ना, APK build करना और असली फोन पर टेस्ट करना। हम मौजूदा Sukoon प्रोजेक्ट में ही बदलाव करेंगे; यह ऑफलाइन नोट सिर्फ योजना बताता है, APK build का प्रमाण नहीं है।";
  if (has("robot","रोबोट","arduino","raspberry","sensor","सेंसर","motor","मोटर")) return "रोबोट बनाने के लिए पहले उसका काम चुनें—जैसे लाइन-फॉलोअर या रिमोट कंट्रोल। आम तौर पर controller (Arduino/ESP32), motor driver, motors, battery और जरूरत के अनुसार sensors चाहिए। सही wiring और code चुने हुए parts पर निर्भर हैं; voltage/pin जाँचे बिना बिजली न जोड़ें।";
  if (has("code","कोड","program","प्रोग्राम","python","java","javascript","error","बग","debug")) return "कोडिंग में पहले समस्या को छोटे चरणों में बाँटें: अपेक्षित input, output और error पहचानें; छोटा उदाहरण चलाएँ; error message की पूरी पंक्ति पढ़ें; फिर एक बार में एक बदलाव करके टेस्ट करें। पूरा code लिखने के लिए सवाल के साथ भाषा और इच्छित फीचर बताएं।";
  if (has("math","गणित","percentage","प्रतिशत","जोड़","जोड़ना","multiply","गुणा","divide","भाग")) return "गणित के सवाल में पूरा सवाल और संख्याएँ लिखें। प्रतिशत निकालने का तरीका: (भाग ÷ कुल) × 100। उदाहरण: 20, 80 का 25% है क्योंकि (20 ÷ 80) × 100 = 25।";
  if (has("general knowledge","सामान्य ज्ञान","gk","इतिहास","history","भूगोल","geography")) return "सामान्य ज्ञान में इतिहास, भूगोल, विज्ञान, नागरिक शास्त्र और रोज़मर्रा की तकनीक आती है। ऑफलाइन लाइब्रेरी में अभी कुछ बुनियादी तथ्य हैं, पूरी दुनिया का ज्ञान नहीं। कोई खास सवाल पूछो—जैसे किसी देश की राजधानी, ग्रह, कंप्यूटर या इतिहास का विषय।";
  return "जानू, इस सवाल का जवाब देने के लिए मेरी ऑफलाइन ज्ञान-सूची में पर्याप्त जानकारी नहीं है। अभी यह ऐप इंटरनेट AI से जवाब लेने की कोशिश करता है; API/quota या नेटवर्क न चले तो जवाब सीमित रहेगा। विषय को थोड़ा स्पष्ट लिखो—जैसे कंप्यूटर, विज्ञान, मानव शरीर, ज्योतिष, वेबसाइट, कोड या रोबोट।";
}
async function answerQuestion(question) {
  const q = (question || "").trim();
  if (!q || thinking) return;
  thinking = true;
  statusEl.textContent = "Sukoon soch rahi hai…";
  answerEl.textContent = "Ek pal jaanu, jawab taiyar kar rahi hoon.";
  try {
    const localCommandReply = await handleLocalCommand(q);
    if (localCommandReply) {
      answerEl.textContent = localCommandReply;
      statusEl.textContent = "Sukoon task manager";
      speak(localCommandReply);
      return;
    }
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
    const reply = offlineProjectHelp(cleanQuestion);
    answerEl.textContent = reply;
    statusEl.textContent = "Sukoon ka jawab";
    speak(reply);
  } catch (error) {
    if (history.length && history[history.length - 1].role === "user") history.pop();
    const localReply = offlineProjectHelp(q);
    if (localReply) {
      answerEl.textContent = localReply;
      statusEl.textContent = "Sukoon offline madad";
      speak(localReply);
      return;
    }
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
      speak(answerEl.textContent);
    } else if (msg.includes("NOT_AVAILABLE")) {
      statusEl.textContent = "Speech recognition available nahi";
      answerEl.textContent = "Jaanu, is phone par speech recognition service nahi mil rahi. Google app ya Speech Services by Google update karo. Voice ko text mein badalne ke liye phone ki speech service chahiye; jawab dene ke liye API key nahi maangi jayegi.";
      speak(answerEl.textContent);
    } else {
      statusEl.textContent = "Mic shuru nahi ho paya";
      answerEl.textContent = "Jaanu, mic start nahi hua. Microphone permission aur Google speech service check karo.";
      speak(answerEl.textContent);
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


initFeatures();
