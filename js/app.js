import {
  auth,
  db,
  firebaseEnabled,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  doc,
  getDoc,
  setDoc,
  onSnapshot
} from "../firebase.js";

const STORAGE_KEY = "flowboard.tasks.v1";
const DEMO_AUTH_KEY = "flowboard.demo.auth.v1";
const DEMO_SESSION_KEY = "flowboard.demo.session.v1";
const DEMO_TASKS_KEY = "flowboard.demo.tasks.v1";
const STATUSES = ["todo", "doing", "done"];

const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const loginForm = document.getElementById("login-form");
const authMessage = document.getElementById("auth-message");
const togglePasswordButton = document.getElementById("toggle-password");
const passwordInput = document.getElementById("login-password");
const createAccountButton = document.getElementById("create-account-button");
const openModalButton = document.getElementById("open-modal");
const backdrop = document.getElementById("modal-backdrop");
const taskForm = document.getElementById("task-form");
const titleInput = document.getElementById("task-title");
const descriptionInput = document.getElementById("task-description");
const logoutButton = document.getElementById("logout-button");
const backHomeButton = document.getElementById("back-home-button");
const totalCount = document.getElementById("total-count");
const boardMessage = document.getElementById("board-message");

let tasks = [];
let currentUser = null;
let boardUnsubscribe = null;
let isDemoMode = !firebaseEnabled;
let isCreateMode = false;
let draggedTaskId = null;

function setMessage(text, type = "error") {
  authMessage.textContent = text || "";
  authMessage.classList.toggle("is-success", type === "success");
}

function showScreen(screenName) {
  const showApp = screenName === "app";
  loginScreen.classList.toggle("hidden", showApp);
  appScreen.classList.toggle("hidden", !showApp);
}

function showBoardError(error, action) {
  console.error(`Não foi possível ${action}.`, error);
  const code = error && error.code ? ` (${error.code})` : "";
  const message = error && error.code === "permission-denied"
    ? "Acesso negado pelo Firestore. Confira e publique as regras de acesso."
    : `Não foi possível ${action}${code}. Confira se o Firestore foi criado e se as regras foram publicadas.`;
  boardMessage.textContent = message;
}

function safeReadJson(key, fallback = []) {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored);
    return parsed;
  } catch (error) {
    return fallback;
  }
}

function createUserId(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const safe = normalized.replace(/[^a-z0-9]/g, "").slice(0, 16) || "user";
  return `demo-${safe}-${Date.now().toString(36)}`;
}

async function hashValue(value) {
  if (!window.crypto || !window.crypto.subtle) {
    return value;
  }
  const digest = await window.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value))
  );
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readDemoUsers() {
  const stored = safeReadJson(DEMO_AUTH_KEY, {});
  if (!stored || typeof stored !== "object") {
    return {};
  }
  return stored;
}

function writeDemoUsers(users) {
  localStorage.setItem(DEMO_AUTH_KEY, JSON.stringify(users));
}

function readDemoSession() {
  return safeReadJson(DEMO_SESSION_KEY, null);
}

function writeDemoSession(user) {
  localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ uid: user.uid, email: user.email }));
}

function clearDemoSession() {
  localStorage.removeItem(DEMO_SESSION_KEY);
}

async function loginDemoUser(email, password) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const users = readDemoUsers();
  const storedHash = users[normalizedEmail];
  const candidateHash = await hashValue(password);

  if (!storedHash) {
    users[normalizedEmail] = candidateHash;
    writeDemoUsers(users);
  } else if (storedHash !== candidateHash) {
    throw new Error("E-mail ou senha inválidos.");
  }

  const user = {
    uid: createUserId(normalizedEmail),
    email: normalizedEmail
  };

  writeDemoSession(user);
  currentUser = user;
  tasks = safeReadJson(DEMO_TASKS_KEY, []);
  render();
  showScreen("app");
  return user;
}

async function createDemoAccount(email, password) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const users = readDemoUsers();

  if (users[normalizedEmail]) {
    throw new Error("Já existe uma conta com este e-mail no modo de demonstração.");
  }

  users[normalizedEmail] = await hashValue(password);
  writeDemoUsers(users);
  return loginDemoUser(normalizedEmail, password);
}

function restoreDemoSession() {
  const session = readDemoSession();
  if (!session || !session.email) {
    return;
  }

  currentUser = { uid: session.uid || createUserId(session.email), email: session.email };
  tasks = safeReadJson(DEMO_TASKS_KEY, []);
  showScreen("app");
  render();
}

async function persistTasks() {
  if (!firebaseEnabled && currentUser) {
    try {
      localStorage.setItem(DEMO_TASKS_KEY, JSON.stringify(tasks));
      boardMessage.textContent = "";
      return true;
    } catch (error) {
      showBoardError(error, "salvar as tarefas no navegador");
      return false;
    }
  }

  if (firebaseEnabled && db && currentUser && currentUser.uid) {
    try {
      const userBoardRef = doc(db, "users", currentUser.uid, "kanban", "state");
      await setDoc(userBoardRef, { tasks }, { merge: true });
      boardMessage.textContent = "";
      return true;
    } catch (error) {
      showBoardError(error, "salvar as tarefas no Firestore");
      return false;
    }
  }

  showBoardError(new Error("Usuário ou conexão com o Firebase indisponível."), "salvar as tarefas");
  return false;
}

async function subscribeToBoard(uid) {
  if (!firebaseEnabled || !db || !uid) {
    return;
  }

  if (boardUnsubscribe) {
    boardUnsubscribe();
  }

  const boardRef = doc(db, "users", uid, "kanban", "state");

  boardUnsubscribe = onSnapshot(boardRef, (snapshot) => {
    if (!snapshot.exists()) {
      setDoc(boardRef, { tasks: [] }, { merge: true })
        .then(() => {
          tasks = [];
          render();
        })
        .catch((error) => showBoardError(error, "inicializar o quadro no Firestore"));
      return;
    }

    const savedTasks = snapshot.data()?.tasks;
    tasks = Array.isArray(savedTasks) ? savedTasks : [];
    render();
  }, (error) => {
    showBoardError(error, "carregar o quadro do Firestore");
  });
}

function openModal() {
  backdrop.hidden = false;
  document.body.style.overflow = "hidden";
  titleInput.focus();
}

function closeModal() {
  backdrop.hidden = true;
  document.body.style.overflow = "";
  taskForm.reset();
  openModalButton.focus();
}

function buildTaskCard(task) {
  const card = document.createElement("article");
  card.className = "task-card";
  card.draggable = true;
  card.dataset.taskId = task.id;

  const top = document.createElement("div");
  top.className = "task-card-top";

  const title = document.createElement("h3");
  title.textContent = task.title;

  const removeButton = document.createElement("button");
  removeButton.className = "delete-button";
  removeButton.type = "button";
  removeButton.setAttribute("aria-label", `Excluir tarefa: ${task.title}`);

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("aria-hidden", "true");

  const iconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  iconPath.setAttribute("d", "M4 7h16M10 11v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3");
  iconPath.setAttribute("stroke", "currentColor");
  iconPath.setAttribute("stroke-width", "1.7");
  iconPath.setAttribute("stroke-linecap", "round");
  iconPath.setAttribute("stroke-linejoin", "round");

  icon.appendChild(iconPath);
  removeButton.appendChild(icon);
  removeButton.addEventListener("click", async () => {
    const previousTasks = tasks;
    tasks = tasks.filter((item) => item.id !== task.id);
    const saved = await persistTasks();
    if (!saved) tasks = previousTasks;
    render();
  });

  top.append(title, removeButton);

  const description = document.createElement("p");
  description.className = "task-description";
  description.textContent = task.description || "";

  const meta = document.createElement("div");
  meta.className = "task-meta";

  const label = document.createElement("span");
  label.className = "task-label";
  label.textContent = "Tarefa";

  const date = document.createElement("time");
  date.className = "task-date";
  date.dateTime = task.createdAt;

  const createdAt = new Date(task.createdAt);
  date.textContent = Number.isNaN(createdAt.getTime())
    ? ""
    : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(createdAt);

  meta.append(label, date);
  card.append(top, description, meta);

  card.addEventListener("dragstart", (event) => {
    draggedTaskId = task.id;
    card.classList.add("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", task.id);
    }
  });

  card.addEventListener("dragend", () => {
    draggedTaskId = null;
    card.classList.remove("is-dragging");
    document.querySelectorAll(".column.is-over").forEach((column) => column.classList.remove("is-over"));
  });

  return card;
}

function render() {
  let total = 0;

  document.querySelectorAll(".task-list").forEach((list) => {
    const matchingTasks = tasks.filter((task) => task.status === list.dataset.list);
    list.replaceChildren();

    matchingTasks.forEach((task) => {
      list.appendChild(buildTaskCard(task));
    });

    if (matchingTasks.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "empty-state";
      emptyState.textContent = "Solte uma tarefa aqui ou adicione uma nova.";
      list.appendChild(emptyState);
    }

    const countElement = list.closest(".column").querySelector(".column-count");
    countElement.textContent = String(matchingTasks.length);
    countElement.setAttribute("aria-label", `${matchingTasks.length} ${matchingTasks.length === 1 ? "tarefa" : "tarefas"}`);
    total += matchingTasks.length;
  });

  totalCount.textContent = String(total);
}

async function handleAuthSubmit(isAccountCreation) {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (!email || !password) {
    setMessage("Preencha todos os campos antes de continuar.");
    return;
  }

  if (!email.includes("@") && !email.includes(".")) {
    setMessage("Digite um e-mail válido para autenticação.");
    return;
  }

  if (password.length < 6) {
    setMessage("A senha deve conter pelo menos 6 caracteres.");
    return;
  }

  try {
    if (firebaseEnabled && auth) {
      if (isAccountCreation) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      return;
    }

    if (isAccountCreation) {
      await createDemoAccount(email, password);
      setMessage("Conta criada com sucesso.", "success");
    } else {
      await loginDemoUser(email, password);
      setMessage("Login realizado com sucesso.", "success");
    }
  } catch (error) {
    const message = error && error.message ? error.message : "Não foi possível concluir a operação.";
    setMessage(message.replace("Firebase:", "").trim());
  }
}

async function handleLogout() {
  try {
    if (firebaseEnabled && auth) {
      await signOut(auth);
    } else {
      clearDemoSession();
      currentUser = null;
      tasks = [];
      showScreen("login");
      setMessage("", "success");
      loginForm.reset();
      passwordInput.type = "password";
      togglePasswordButton.textContent = "Mostrar";
    }
  } catch (error) {
    setMessage("Não foi possível sair da conta no momento.");
  }
}

function hookBoardInteractions() {
  document.querySelectorAll(".column").forEach((column) => {
    column.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      column.classList.add("is-over");
    });

    column.addEventListener("dragleave", (event) => {
      if (!column.contains(event.relatedTarget)) {
        column.classList.remove("is-over");
      }
    });

    column.addEventListener("drop", async (event) => {
      event.preventDefault();
      column.classList.remove("is-over");
      const taskId = event.dataTransfer.getData("text/plain") || draggedTaskId;
      const task = tasks.find((item) => item.id === taskId);
      const nextStatus = column.dataset.status;

      if (!task || !STATUSES.includes(nextStatus)) {
        return;
      }

      const previousStatus = task.status;
      task.status = nextStatus;
      const saved = await persistTasks();
      if (!saved) task.status = previousStatus;
      render();
    });
  });
}

function installTaskForm() {
  taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();

    if (!title) {
      titleInput.focus();
      return;
    }

    const newTask = {
      id: window.crypto && typeof window.crypto.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      description: descriptionInput.value.trim(),
      status: "todo",
      createdAt: new Date().toISOString()
    };
    tasks.unshift(newTask);

    const saved = await persistTasks();
    if (!saved) {
      tasks = tasks.filter((task) => task.id !== newTask.id);
      render();
      return;
    }
    render();
    closeModal();
  });
}

function bindAuthEvents() {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const shouldCreateAccount = isCreateMode;
    isCreateMode = false;
    await handleAuthSubmit(shouldCreateAccount);
  });

  createAccountButton.addEventListener("click", () => {
    isCreateMode = true;
    setMessage("Crie sua conta para continuar.");
    loginForm.requestSubmit();
  });

  togglePasswordButton.addEventListener("click", () => {
    const showPassword = passwordInput.type === "password";
    passwordInput.type = showPassword ? "text" : "password";
    togglePasswordButton.textContent = showPassword ? "Ocultar" : "Mostrar";
    togglePasswordButton.setAttribute("aria-label", showPassword ? "Ocultar senha" : "Mostrar senha");
  });

  openModalButton.addEventListener("click", openModal);
  document.getElementById("close-modal").addEventListener("click", closeModal);
  document.getElementById("cancel-modal").addEventListener("click", closeModal);

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !backdrop.hidden) {
      closeModal();
    }
  });

  logoutButton.addEventListener("click", () => {
    handleLogout();
  });

  backHomeButton.addEventListener("click", () => {
    handleLogout();
  });
}

if (firebaseEnabled && auth) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = {
        uid: user.uid,
        email: user.email || ""
      };
      tasks = [];
      await subscribeToBoard(user.uid);
      showScreen("app");
      render();
    } else {
      currentUser = null;
      tasks = [];
      showScreen("login");
      setMessage("", "success");
    }
  });
} else {
  restoreDemoSession();
}

bindAuthEvents();
hookBoardInteractions();
installTaskForm();
render();
