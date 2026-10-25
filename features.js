import { LocalNotifications } from "@capacitor/local-notifications";

const TASKS_KEY = "sukoon_local_tasks_v1";
const PIN_KEY = "sukoon_security_pin_v1";
const ALERTS_KEY = "sukoon_security_alerts_v1";

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || ""); } catch (_) { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}
function makeId() {
  return Math.floor(Date.now() % 2000000000);
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function showMessage(text) {
  const status = document.getElementById("featureStatus");
  if (status) status.textContent = text;
}
async function askNotificationPermission() {
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== "granted") p = await LocalNotifications.requestPermissions();
    return p.display === "granted";
  } catch (_) {
    return false;
  }
}
async function scheduleReminder(task) {
  if (!task.dueAt || task.done) return false;
  const at = new Date(task.dueAt);
  if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) return false;
  const granted = await askNotificationPermission();
  if (!granted) return false;
  try {
    await LocalNotifications.schedule({ notifications: [{
      id: task.id,
      title: "Sukoon AI — yaad dilane ka samay",
      body: task.title,
      schedule: { at },
      extra: { taskId: task.id }
    }]});
    return true;
  } catch (_) { return false; }
}
function renderTasks() {
  const list = document.getElementById("taskList");
  if (!list) return;
  const tasks = readJSON(TASKS_KEY, []);
  if (!tasks.length) {
    list.innerHTML = '<div class="empty-state">Abhi koi kaam save nahi hai.</div>';
    return;
  }
  list.innerHTML = tasks.slice().sort((a,b) => Number(a.done)-Number(b.done) || (a.dueAt||"").localeCompare(b.dueAt||"")).map(task =>
    '<div class="task-row"><div class="task-copy"><strong>' + escapeHtml(task.title) + '</strong><small>' +
    (task.dueAt ? escapeHtml(new Date(task.dueAt).toLocaleString("hi-IN", {dateStyle:"medium",timeStyle:"short"})) : "Samay set nahi") +
    (task.done ? " · पूरा" : "") + '</small></div><button type="button" class="task-done" data-task-done="' + task.id + '"' + (task.done ? " disabled" : "") + '>' +
    (task.done ? "पूरा" : "पूरा हुआ") + '</button></div>'
  ).join("");
  list.querySelectorAll("[data-task-done]").forEach(button => button.addEventListener("click", async () => {
    const id = Number(button.getAttribute("data-task-done"));
    const updated = readJSON(TASKS_KEY, []).map(t => t.id === id ? {...t, done:true} : t);
    saveJSON(TASKS_KEY, updated);
    try { await LocalNotifications.cancel({notifications:[{id}]}); } catch (_) {}
    renderTasks();
    showMessage("Kaam ko poora mark kar diya. 💙");
  }));
}
async function addTask(title, dueAt) {
  const clean = String(title || "").trim();
  if (!clean) return {ok:false, message:"Pehle kaam ka naam likho."};
  const tasks = readJSON(TASKS_KEY, []);
  const task = {id:makeId(), title:clean.slice(0,180), dueAt:dueAt || "", done:false, createdAt:new Date().toISOString()};
  tasks.push(task);
  saveJSON(TASKS_KEY, tasks);
  let message = "Kaam Sukoon ki list mein save ho gaya.";
  if (task.dueAt) {
    const scheduled = await scheduleReminder(task);
    message += scheduled ? " Reminder bhi laga diya." : " Reminder notification set nahi ho paya; notification permission aur time check karo.";
  }
  renderTasks();
  showMessage(message);
  return {ok:true, message};
}
function relativeDueFromText(q) {
  const s = String(q).toLowerCase();
  const hour = s.match(/(?:in|after|mein|baad|ke baad)\s*(\d+)\s*(?:hour|hours|ghante|ghanta|घंटे|घंटा)/i) ||
    s.match(/(\d+)\s*(?:hour|hours|ghante|ghanta|घंटे|घंटा)/i);
  const minute = s.match(/(?:in|after|mein|baad|ke baad)\s*(\d+)\s*(?:minute|minutes|min|मिनट)/i) ||
    s.match(/(\d+)\s*(?:minute|minutes|min|मिनट)/i);
  if (hour) return new Date(Date.now() + Number(hour[1]) * 3600000).toISOString();
  if (minute) return new Date(Date.now() + Number(minute[1]) * 60000).toISOString();
  if (/ek ghante|एक घंटे|one hour/i.test(s)) return new Date(Date.now() + 3600000).toISOString();
  return "";
}
export async function handleLocalCommand(question) {
  const q = String(question || "").trim();
  const lower = q.toLowerCase();
  const awayTask = /(lautunga|lautungi|wapas|aaunga|aaungi|वापस|लौटूँगा|लौटूंगा).*(kaam|काम)/i.test(lower);
  if (!/(yaad dil|remind|reminder|task add|add task|save task|kaam save|kaam yaad|काम याद|याद दिला)/i.test(lower) && !awayTask) return null;
  const dueAt = relativeDueFromText(q);
  if (awayTask && !dueAt) { /* A reminder without a time can still be saved. */ }
  let title = awayTask ? "Wapas aane par bataye gaye kaam ki sthiti check karna" : q
    .replace(/^(sukoon|sukoon ai|सुकून|हे सुकून)[,\s]*/i, "")
    .replace(/(mujhe|mujhko|please|yaad dila dena|yaad dilana|remind me|remind|reminder|in|after|mein|baad|ke baad|ek ghante|one hour|\d+\s*(?:hour|hours|ghante|ghanta|minute|minutes|min|घंटे|घंटा|मिनट)|to|ki|kar dena|कर देना|याद दिला देना|याद दिलाना)/gi, " ")
    .replace(/^[\s,:-]+|[\s,:-]+$/g, "").trim();
  if (!title || title.length < 2) title = "Apne bataye hue kaam ko check karna";
  const result = await addTask(title, dueAt);
  return result.message + (dueAt ? " Yaad rahe: main is samay sirf reminder de sakti hoon; phone band/background mein khud se poora kaam karne ka remote system abhi connect nahi hai." : " Reminder ke liye neeche samay chuno. Main abhi khud se background mein kaam execute nahi karti.");
}

export function initFeatures() {
  const taskForm = document.getElementById("taskForm");
  const taskTitle = document.getElementById("taskTitle");
  const taskDue = document.getElementById("taskDue");
  if (taskForm) taskForm.addEventListener("submit", async event => {
    event.preventDefault();
    const result = await addTask(taskTitle?.value, taskDue?.value ? new Date(taskDue.value).toISOString() : "");
    if (result.ok) { taskTitle.value = ""; taskDue.value = ""; }
  });
  renderTasks();

  const securityToggle = document.getElementById("securityToggle");
  const securitySetup = document.getElementById("securitySetup");
  const pinForm = document.getElementById("pinForm");
  const pinInput = document.getElementById("securityPin");
  const pinState = document.getElementById("securityState");
  const lockScreen = document.getElementById("securityLock");
  const unlockForm = document.getElementById("unlockForm");
  const unlockPin = document.getElementById("unlockPin");
  const alertList = document.getElementById("securityAlerts");
  let armed = Boolean(localStorage.getItem(PIN_KEY));
  let attempts = 0;

  function renderAlerts() {
    if (!alertList) return;
    const alerts = readJSON(ALERTS_KEY, []);
    alertList.innerHTML = alerts.length ? alerts.slice(0,5).map(a => '<div class="alert-entry">⚠ ' + escapeHtml(a.text) + '<small>' + escapeHtml(new Date(a.at).toLocaleString("hi-IN")) + '</small></div>').join("") : '<div class="empty-state">Abhi koi security alert nahi.</div>';
  }
  function setArmed(value) {
    armed = value;
    if (securityToggle) securityToggle.textContent = armed ? "सुरक्षा बंद करें" : "सुरक्षा चालू करें";
    if (pinState) pinState.textContent = armed ? "सुरक्षा चालू है — यह केवल Sukoon ऐप को लॉक करती है, पूरे Android फोन को नहीं।" : "सुरक्षा बंद है।";
    if (securitySetup) securitySetup.hidden = !armed;
    if (armed && lockScreen) lockScreen.hidden = false;
  }
  if (securityToggle) securityToggle.addEventListener("click", () => {
    if (!localStorage.getItem(PIN_KEY)) {
      if (pinState) pinState.textContent = "पहले 4 अंकों का PIN बनाओ और सेव करो।";
      if (securitySetup) securitySetup.hidden = false;
      if (pinInput) pinInput.focus();
      return;
    }
    if (armed) {
      setArmed(false);
      if (lockScreen) lockScreen.hidden = true;
    } else {
      setArmed(true);
      if (pinState) pinState.textContent = "सुरक्षा चालू है। ऐप लॉक स्क्रीन पर रहेगा।";
    }
  });
  if (pinForm) pinForm.addEventListener("submit", event => {
    event.preventDefault();
    const pin = String(pinInput?.value || "").trim();
    if (!/^\d{4,8}$/.test(pin)) { if (pinState) pinState.textContent = "4 से 8 अंकों का PIN डालो।"; return; }
    localStorage.setItem(PIN_KEY, pin);
    if (pinInput) pinInput.value = "";
    setArmed(true);
    if (pinState) pinState.textContent = "PIN सेव हुआ और सुरक्षा चालू है।";
  });
  if (unlockForm) unlockForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (String(unlockPin?.value || "").trim() === localStorage.getItem(PIN_KEY)) {
      attempts = 0;
      if (unlockPin) unlockPin.value = "";
      if (lockScreen) lockScreen.hidden = true;
      showMessage("Sukoon khul gayi. 💙");
      return;
    }
    attempts += 1;
    if (unlockPin) unlockPin.value = "";
    const msg = "Sukoon app par galat PIN ki koshish (" + attempts + ")";
    if (pinState) pinState.textContent = msg;
    const alerts = readJSON(ALERTS_KEY, []);
    alerts.unshift({text:msg, at:new Date().toISOString()});
    saveJSON(ALERTS_KEY, alerts.slice(0,20));
    renderAlerts();
    if (attempts >= 3) {
      const granted = await askNotificationPermission();
      if (granted) {
        try { await LocalNotifications.schedule({notifications:[{id:makeId(),title:"Sukoon security alert",body:"Sukoon app par kai galat PIN attempts hue. App ke andar alert log dekho."}]}); } catch (_) {}
      }
      showMessage("Security alert log ho gaya. Dhyan rahe: yeh poore phone ki lock-screen activity nahi dekh sakta.");
    }
  });
  if (securitySetup) securitySetup.hidden = true;
  if (lockScreen) lockScreen.hidden = true;
  renderAlerts();
  if (armed) setArmed(true);
}
