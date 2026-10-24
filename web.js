(function () {
  // GitHub Pages/browser fallback only. Native APK uses the Android plugin bundle.
  if (window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform()) return;
  const statusEl = document.getElementById("status");
  const answerEl = document.getElementById("answer");
  const mic = document.getElementById("mic");
  const hint = document.getElementById("hint");
  const form = document.getElementById("chat");
  const typed = document.getElementById("typed");
  let busy = false;
  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "hi-IN";
    utter.rate = 0.92;
    utter.pitch = 1.05;
    speechSynthesis.speak(utter);
  }
  function answerQuestion(q) {
    q = (q || "").trim();
    if (!q) return;
    const lower = q.toLowerCase();
    let reply = "Jaanu, maine suna: " + q + ". Abhi asli AI service connect nahi hai, isliye main abhi AI jawab nahi de sakti.";
    if (lower.includes("naam")) reply = "Jaanu, mera naam Sukoon AI hai.";
    else if (lower.includes("kaise ho")) reply = "Main taiyar hoon jaanu. Tum kaise ho?";
    else if (lower.includes("namaste") || lower.includes("hello") || lower.includes("hi")) reply = "Namaste jaanu! Batao, kya baat hai?";
    answerEl.textContent = reply;
    statusEl.textContent = "Sukoon ne tumhari baat suni";
    speak(reply);
  }
  mic.addEventListener("click", function () {
    if (busy) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      statusEl.textContent = "Browser voice input available nahi";
      answerEl.textContent = "Jaanu, Chrome mein try karo. APK mein native speech recognition use hota hai.";
      return;
    }
    try {
      const recognition = new SR();
      recognition.lang = "hi-IN";
      recognition.continuous = false;
      recognition.interimResults = false;
      busy = true;
      mic.classList.add("listening");
      statusEl.textContent = "Sun rahi hoon jaanu…";
      hint.textContent = "Ab bolo…";
      recognition.onresult = event => answerQuestion(event.results[0][0].transcript);
      recognition.onerror = () => {
        statusEl.textContent = "Awaaz nahi mil payi";
        answerEl.textContent = "Jaanu, microphone allow karo aur dobara try karo.";
      };
      recognition.onend = () => {
        busy = false;
        mic.classList.remove("listening");
        hint.textContent = "Dobara bolne ke liye mic dabao";
      };
      recognition.start();
    } catch (_) {
      busy = false;
      mic.classList.remove("listening");
      statusEl.textContent = "Mic dobara try karo";
    }
  });
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    answerQuestion(typed.value);
    typed.value = "";
  });
})();