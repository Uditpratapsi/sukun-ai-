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
    const q = String(question || "").trim();
    const lower = q.toLowerCase();
    if (/^(sukoon|sukoon ai|सुकून|सुनो सुकून)$/.test(lower)) return "हाँ जानू, बोलो ना! मैं सुन रही हूँ। 💙";
    if (/(kaisi ho|कैसी हो|how are you|haal chaal|हाल चाल|क्या हाल)/i.test(q)) return "मैं ठीक हूँ जानू, तुम बताओ तुम्हारा क्या हाल है? आज दिन कैसा जा रहा है? 💙";
    if (/(pareshan|परेशान|udaas|उदास|dukhi|दुखी|tension|टेंशन|akela|अकेला)/i.test(q)) return "अरे जानू, क्या हुआ? आराम से बताओ, मैं सुन रही हूँ। तुम्हें सलाह चाहिए या बस अपनी बात बतानी है?";
    if (/(baat karo|बात करो|sun rahi|सुन रही|mujhse baat|मुझसे बात)/i.test(q)) return "हाँ जानू, मैं यहीं हूँ और तुम्हारी बात सुन रही हूँ। बताओ, मन में क्या चल रहा है? 💙";
    const url = "https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=" +
      encodeURIComponent(q) + "&gsrlimit=3&gsrnamespace=0&prop=extracts&exintro=1&explaintext=1&exsentences=5&format=json&origin=*";
    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) throw new Error("ONLINE_INFO_HTTP_" + response.status);
    const data = await response.json();
    const pages = Object.values(data?.query?.pages || {}).filter(p => p.extract && p.title);
    if (!pages.length) throw new Error("NO_ONLINE_RESULT");
    const best = pages.sort((a,b) => (b.extract || "").length - (a.extract || "").length)[0];
    return "जानू, इंटरनेट पर मिली जानकारी के अनुसार — " + best.title + ": " +
      String(best.extract).replace(/\\s+/g, " ").trim().slice(0, 1200) +
      " (स्रोत: Wikipedia; ज़रूरी तथ्यों को जाँच लेना।)";
  }

  function offlineProjectHelp(question) {
  const q = String(question || "").toLowerCase().replace(/[?!.।,]/g, " ").replace(/\s+/g, " ").trim();
  const has = (...words) => words.some(word => q.includes(word));
  if (!q) return "अपना सवाल लिखो या माइक से बोलो।";
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