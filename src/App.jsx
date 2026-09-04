import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend, BarChart, Bar,
} from "recharts";
import {
  Home, Wallet, TrendingDown, Target, ShieldCheck, Sparkles, FileBarChart,
  Settings, Plus, Trash2, ChevronLeft, ChevronRight, LogOut, Copy, Check,
  AlertTriangle, TrendingUp, Users, ArrowRight, X, MoreHorizontal,
  Calculator, CalendarDays, Bell, Download, Upload, Moon, Sun, Pencil,
} from "lucide-react";
import { storage, hasRealBackend } from "./lib/storage.js";

/* ============================== TOKENS ============================== */
const CAT_COLORS = {
  Moradia: "#0f6b63", Alimentação: "#d99a3d", Transporte: "#5b7fa6",
  Saúde: "#b3564a", Educação: "#7a6bb0", Lazer: "#3fa792",
  Compras: "#c77b3f", Assinaturas: "#8a8560", Dívidas: "#a34848",
  Investimentos: "#2f6f5e", Outros: "#8a8f98",
};
const EXPENSE_CATEGORIES = Object.keys(CAT_COLORS);
const INCOME_CATEGORIES = ["Salário", "Renda extra", "Freelance", "Investimentos", "Outros"];
const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

/* ============================== HELPERS ============================== */
const uid = () => Math.random().toString(36).slice(2, 10);
const fmtBRL = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const monthKey = (dateStr) => (dateStr || "").slice(0, 7);
const todayKey = () => new Date().toISOString().slice(0, 10);
const currentMonthKey = () => new Date().toISOString().slice(0, 7);
const labelForMonthKey = (mk) => {
  if (!mk) return "";
  const [y, m] = mk.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
};
const shiftMonthKey = (mk, delta) => {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthlyEquivalent = (income) => {
  if (income.frequency === "Semanal") return income.value * 4.33;
  return income.value;
};

function monthlyTotals(data, mk) {
  const incomes = (data.incomes || []).filter((i) => {
    if (i.frequency === "Única") return monthKey(i.date) === mk;
    return i.date <= `${mk}-31`;
  });
  const expenses = (data.expenses || []).filter((e) => monthKey(e.dueDate) === mk);
  const receita = incomes.reduce((s, i) => s + monthlyEquivalent(i), 0);
  const despesa = expenses.reduce((s, e) => s + Number(e.value || 0), 0);
  return { receita, despesa, saldo: receita - despesa, incomes, expenses };
}

function categoryBreakdown(expenses) {
  const map = {};
  expenses.forEach((e) => { map[e.category] = (map[e.category] || 0) + Number(e.value || 0); });
  const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(map)
    .map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) }))
    .sort((a, b) => b.value - a.value);
}

function expenseStatus(e) {
  if (e.paidDate) return "Pago";
  if (e.dueDate && e.dueDate < todayKey()) return "Atrasado";
  return "Pendente";
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr + "T00:00:00") - new Date(todayKey() + "T00:00:00");
  return Math.round(ms / 86400000);
}

function generateInsights(data, mk) {
  const insights = [];
  const cur = monthlyTotals(data, mk);
  const prevMk = shiftMonthKey(mk, -1);
  const prev = monthlyTotals(data, prevMk);
  const comprometimento = cur.receita > 0 ? (cur.despesa / cur.receita) * 100 : 0;

  if (cur.receita === 0) {
    insights.push({ type: "tip", text: "Cadastre suas receitas para que a análise financeira comece a funcionar." });
  } else if (comprometimento >= 80) {
    insights.push({ type: "alert", text: `Você está comprometendo ${comprometimento.toFixed(0)}% da sua renda este mês. O ideal é manter abaixo de 70% para ter folga no orçamento.` });
  } else if (comprometimento <= 50) {
    insights.push({ type: "success", text: `Ótimo controle! Você está comprometendo apenas ${comprometimento.toFixed(0)}% da sua renda este mês.` });
  } else {
    insights.push({ type: "tip", text: `Você compromete ${comprometimento.toFixed(0)}% da sua renda este mês — dentro de uma faixa razoável, mas dá para melhorar.` });
  }

  const curCat = categoryBreakdown(cur.expenses);
  const prevCat = categoryBreakdown(prev.expenses);
  curCat.forEach((c) => {
    const prevValue = (prevCat.find((p) => p.name === c.name) || {}).value || 0;
    if (prevValue > 0) {
      const variacao = ((c.value - prevValue) / prevValue) * 100;
      if (variacao >= 20) {
        insights.push({ type: "alert", text: `Gastos com ${c.name} subiram ${variacao.toFixed(0)}% em relação ao mês anterior.` });
      }
    }
  });

  const discretionary = ["Lazer", "Assinaturas", "Compras"];
  const discretionaryTotal = curCat.filter((c) => discretionary.includes(c.name)).reduce((s, c) => s + c.value, 0);
  if (discretionaryTotal > 0) {
    const potencial = discretionaryTotal * 0.2;
    insights.push({ type: "tip", text: `Reduzindo 20% em lazer, assinaturas e compras, você pode economizar ${fmtBRL(potencial)} por mês.` });
  }

  const ef = data.emergencyFund || {};
  if (ef.target > 0) {
    const pct = Math.min(100, ((ef.currentSaved || 0) / ef.target) * 100);
    if (pct >= 100) insights.push({ type: "success", text: "Sua reserva de emergência está completa. Parabéns pela disciplina!" });
    else if (pct < 30) insights.push({ type: "alert", text: `A reserva de emergência está em apenas ${pct.toFixed(0)}% da meta. Priorizar esse fundo traz mais segurança para você.` });
  }

  (data.goals || []).forEach((g) => {
    const restante = g.targetValue - (g.savedValue || 0);
    const meses = Math.max(1, monthsUntil(g.targetDate));
    const necessario = restante / meses;
    const disponivel = cur.saldo;
    if (restante > 0 && necessario > disponivel && disponivel > 0) {
      insights.push({ type: "alert", text: `Para atingir a meta "${g.name}" no prazo, seria necessário guardar ${fmtBRL(necessario)}/mês, mas o saldo disponível é de ${fmtBRL(disponivel)}.` });
    }
  });

  if (insights.length === 1) {
    insights.push({ type: "success", text: "Nenhum ponto crítico identificado além do resumo acima. Continuem registrando os dados para uma análise cada vez mais precisa." });
  }
  return insights;
}

function monthsUntil(dateStr) {
  if (!dateStr) return 1;
  const target = new Date(dateStr);
  const now = new Date();
  return Math.max(1, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()));
}

function last6MonthKeys(mk) {
  const arr = [];
  for (let i = 5; i >= 0; i--) arr.push(shiftMonthKey(mk, -i));
  return arr;
}

/* ============================== STORAGE ============================== */
const USERS_KEY = "financas-a-dois:users";
const THEME_KEY = "financas-a-dois:theme";
const normalizeUser = (value) => value.trim().toLowerCase();
function loadUsers() {
  try { return JSON.parse(window.localStorage.getItem(USERS_KEY) || "{}"); } catch { return {}; }
}
function saveUsers(users) { window.localStorage.setItem(USERS_KEY, JSON.stringify(users)); }
async function hashPin(pin) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function loadHousehold(code) {
  try {
    const res = await storage.get(`household:${code}`, true);
    return res ? JSON.parse(res.value) : null;
  } catch { return null; }
}
async function saveHousehold(code, data) {
  try { await storage.set(`household:${code}`, JSON.stringify(data), true); }
  catch (e) { console.error("Erro ao salvar dados:", e); }
}
async function loadSession() {
  try {
    const res = await storage.get("session", false);
    return res ? JSON.parse(res.value) : null;
  } catch { return null; }
}
async function saveSession(session) {
  try { await storage.set("session", JSON.stringify(session), false); }
  catch (e) { console.error("Erro ao salvar sessão:", e); }
}
async function clearSession() {
  try { await storage.delete("session", false); } catch {}
}

/* ============================== BACKUP MANUAL ============================== */
// Exporta/importa um arquivo .json com todos os dados da conta.
// Serve tanto para levar os dados de um aparelho para outro (mesmo sem banco
// de dados real configurado) quanto como cópia de segurança extra.
function downloadBackup(code, data) {
  const payload = { app: "financas-a-dois", version: 1, code, exportedAt: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `controle-gestao-financeira-backup-${code}-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== "object") {
          reject(new Error("Arquivo de backup vazio ou inválido."));
          return;
        }
        const financialData = parsed.data || parsed;
        if (!financialData || typeof financialData !== "object") {
          reject(new Error("Este arquivo não parece ser um backup válido do Controle e Gestão Financeira."));
          return;
        }
        const normalizedData = {
          name: financialData.name || "Minhas Finanças",
          members: Array.isArray(financialData.members) && financialData.members.length > 0 ? financialData.members : [],
          incomes: Array.isArray(financialData.incomes) ? financialData.incomes : [],
          expenses: Array.isArray(financialData.expenses) ? financialData.expenses : [],
          goals: Array.isArray(financialData.goals) ? financialData.goals : [],
          emergencyFund: financialData.emergencyFund || { avgMonthlyExpense: 0, monthsDesired: 6, currentSaved: 0, goalMonths: 12, target: 0 },
          createdAt: financialData.createdAt || new Date().toISOString(),
        };
        resolve({ ...parsed, data: normalizedData });
      } catch {
        reject(new Error("Não foi possível ler este arquivo. Confira se é o .json exportado pelo app."));
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo."));
    reader.readAsText(file);
  });
}

/* ============================== UI PRIMITIVES ============================== */
function DuoRings({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="16" cy="20" r="12" fill="#0f6b63" opacity="0.9" />
      <circle cx="24" cy="20" r="12" fill="#d99a3d" opacity="0.85" style={{ mixBlendMode: "multiply" }} />
    </svg>
  );
}

const Card = React.forwardRef(function Card({ children, className = "" }, ref) {
  return (
    <div ref={ref} className={`bg-white rounded-2xl border border-stone-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
});

// Dispara a função de envio ao pressionar Enter em um campo de texto do formulário.
function handleEnterKey(e, submitFn) {
  if (e.key === "Enter") {
    e.preventDefault();
    submitFn();
  }
}

function ProgressBar({ pct, color = "#0f6b63" }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="w-full h-2.5 rounded-full bg-stone-100 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${clamped}%`, backgroundColor: color }} />
    </div>
  );
}

function ProgressRing({ pct, size = 88, stroke = 9, color = "#0f6b63" }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0eee9" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={c - (c * clamped) / 100} strokeLinecap="round" />
      <text x={size / 2} y={size / 2} fill="#292524" fontSize="15" fontWeight="600" textAnchor="middle"
        transform={`rotate(90 ${size / 2} ${size / 2})`} style={{ fontFamily: "Inter" }}>{clamped.toFixed(0)}%</text>
    </svg>
  );
}

function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-stone-100 text-stone-600",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-rose-50 text-rose-700",
  };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tones[tone]}`}>{children}</span>;
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center text-stone-400">
      <Icon size={30} strokeWidth={1.5} className="mb-2" />
      <p className="text-sm max-w-xs">{text}</p>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-stone-500 mb-1 block">{label}</span>
      {children}
    </label>
  );
}
const inputCls = "w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-teal-700/30 focus:border-teal-700";

/* ============================== NAV ============================== */
const NAV_ITEMS = [
  { key: "dashboard", label: "Início", icon: Home },
  { key: "receitas", label: "Receitas", icon: Wallet },
  { key: "despesas", label: "Despesas", icon: TrendingDown },
  { key: "metas", label: "Metas", icon: Target },
  { key: "reserva", label: "Reserva", icon: ShieldCheck },
  { key: "simulador", label: "Simulador", icon: Calculator },
  { key: "calendario", label: "Calendário", icon: CalendarDays },
  { key: "analise", label: "Análise", icon: Sparkles },
  { key: "relatorios", label: "Relatórios", icon: FileBarChart },
  { key: "config", label: "Ajustes", icon: Settings },
];

// No mobile só cabem ~4-5 abas com conforto de toque; as demais ficam num atalho "Mais".
const MOBILE_PRIMARY_KEYS = ["dashboard", "despesas", "metas", "analise"];

function Nav({ screen, setScreen }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = NAV_ITEMS.filter((it) => MOBILE_PRIMARY_KEYS.includes(it.key));
  const rest = NAV_ITEMS.filter((it) => !MOBILE_PRIMARY_KEYS.includes(it.key));

  function go(key) { setScreen(key); setMoreOpen(false); }

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex md:flex-col md:w-56 md:shrink-0 border-r border-stone-200 bg-white h-screen sticky top-0 py-6 px-3">
        <div className="flex items-center gap-2 px-3 mb-8">
          <DuoRings size={32} />
          <span style={{ fontFamily: "Fraunces" }} className="text-base font-semibold text-stone-800 leading-tight">Controle e Gestão Financeira</span>
        </div>
        <div className="flex flex-col gap-1">
          {NAV_ITEMS.map((it) => (
            <button
              data-testid={`nav-${it.key}`}
              key={it.key}
              onClick={() => setScreen(it.key)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 ${screen === it.key ? "bg-teal-900 text-white" : "text-stone-500 hover:bg-stone-50"}`}
            >
              <it.icon size={18} strokeWidth={2} />{it.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 flex justify-around py-1.5 z-20">
        {primary.map((it) => (
          <button
            data-testid={`mobile-nav-${it.key}`}
            key={it.key}
            onClick={() => go(it.key)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-medium min-w-0 ${screen === it.key ? "text-teal-800" : "text-stone-400"}`}
          >
            <it.icon size={19} strokeWidth={2} /><span className="truncate max-w-[56px]">{it.label}</span>
          </button>
        ))}
        <button
          data-testid="mobile-nav-more"
          onClick={() => setMoreOpen(true)}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-medium ${rest.some((it) => it.key === screen) ? "text-teal-800" : "text-stone-400"}`}
        >
          <MoreHorizontal size={19} strokeWidth={2} />Mais
        </button>
      </nav>

      {/* Mobile overflow sheet */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-30 flex items-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setMoreOpen(false)} />
          <div className="relative w-full bg-white rounded-t-2xl p-4 pb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-stone-700">Mais opções</p>
              <button onClick={() => setMoreOpen(false)} className="text-stone-400 hover:text-stone-700 p-1"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {rest.map((it) => (
                <button
                  data-testid={`mobile-nav-${it.key}`}
                  key={it.key}
                  onClick={() => go(it.key)}
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl text-sm font-medium ${screen === it.key ? "bg-teal-900 text-white" : "bg-stone-50 text-stone-600"}`}
                >
                  <it.icon size={17} strokeWidth={2} />{it.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MobileTopBar({ screen }) {
  const currentLabel = (NAV_ITEMS.find((it) => it.key === screen) || {}).label || "";
  return (
    <div className="md:hidden sticky top-0 z-20 flex items-center gap-2 bg-white border-b border-stone-200 px-4 py-2.5 shrink-0">
      <DuoRings size={26} />
      <div className="leading-tight min-w-0">
        <p style={{ fontFamily: "Fraunces" }} className="text-sm font-semibold text-stone-800 -mb-0.5 truncate">Controle e Gestão Financeira</p>
        <p className="text-[11px] text-stone-400">{currentLabel}</p>
      </div>
    </div>
  );
}

/* ============================== LOGIN ============================== */
function LoginScreen({ onEnter, theme, onToggleTheme }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [backupParsed, setBackupParsed] = useState(null);
  const [backupFileName, setBackupFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const validPin = (value) => /^\d{4}$/.test(value);
  const setPinValue = (setter) => (e) => setter(e.target.value.replace(/\D/g, "").slice(0, 4));

  async function handleCreate() {
    const cleanUser = normalizeUser(username);
    if (!cleanUser) { setError("Informe o nome de usuário."); return; }
    if (!validPin(pin)) { setError("A senha deve conter exatamente 4 números."); return; }
    if (pin !== confirmPin) { setError("A confirmação da senha não confere."); return; }
    const users = loadUsers();
    if (users[cleanUser]) { setError("Este usuário já possui cadastro."); return; }
    setBusy(true);
    const code = `user-${cleanUser}`;
    const data = {
      name: householdName.trim() || `Finanças de ${username.trim()}`,
      members: [{ name: username.trim() }],
      incomes: [],
      expenses: [],
      goals: [],
      emergencyFund: { avgMonthlyExpense: 0, monthsDesired: 6, currentSaved: 0, goalMonths: 12, target: 0 },
      createdAt: new Date().toISOString(),
    };
    await saveHousehold(code, data);
    users[cleanUser] = { username: cleanUser, name: username.trim(), code, pinHash: await hashPin(pin), createdAt: new Date().toISOString() };
    saveUsers(users);
    const session = { username: cleanUser, code, name: username.trim() };
    await saveSession(session);
    setBusy(false);
    onEnter(session, data);
  }

  async function handleLogin() {
    const cleanUser = normalizeUser(username);
    if (!cleanUser) { setError("Informe o nome de usuário."); return; }
    if (!validPin(pin)) { setError("A senha deve conter exatamente 4 números."); return; }
    setBusy(true);
    const user = loadUsers()[cleanUser];
    if (!user || user.pinHash !== (await hashPin(pin))) {
      setError("Usuário ou senha incorretos.");
      setBusy(false);
      return;
    }
    const data = await loadHousehold(user.code);
    if (!data) {
      setError("Os dados deste usuário não foram encontrados.");
      setBusy(false);
      return;
    }
    const session = { username: cleanUser, code: user.code, name: user.name };
    await saveSession(session);
    setBusy(false);
    onEnter(session, data);
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBackupParsed(await readBackupFile(file));
      setBackupFileName(file.name);
      setError("");
    } catch (err) {
      setBackupParsed(null);
      setBackupFileName("");
      setError(err.message);
    }
  }

  async function handleRestore() {
    const cleanUser = normalizeUser(username);
    if (!cleanUser) { setError("Informe o nome de usuário."); return; }
    if (!validPin(pin)) { setError("A senha deve conter exatamente 4 números."); return; }
    if (pin !== confirmPin) { setError("A confirmação da senha não confere."); return; }
    if (!backupParsed) { setError("Selecione um arquivo de backup (.json)."); return; }
    const users = loadUsers();
    if (users[cleanUser]) { setError("Este usuário já possui cadastro."); return; }
    setBusy(true);
    const code = `user-${cleanUser}`;
    const data = backupParsed.data;
    if (!data.members.find((m) => m.name && m.name.toLowerCase() === username.trim().toLowerCase())) {
      data.members.push({ name: username.trim() });
    }
    await saveHousehold(code, data);
    users[cleanUser] = { username: cleanUser, name: username.trim(), code, pinHash: await hashPin(pin), createdAt: new Date().toISOString() };
    saveUsers(users);
    const session = { username: cleanUser, code, name: username.trim() };
    await saveSession(session);
    setBusy(false);
    onEnter(session, data);
  }

  const submit = mode === "create" ? handleCreate : mode === "restore" ? handleRestore : handleLogin;
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4 relative">
      <button
        data-testid="theme-toggle-button"
        onClick={onToggleTheme}
        className="absolute right-4 top-4 p-2 text-stone-500 hover:text-stone-800 transition-colors"
        aria-label="Alternar tema"
      >
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <DuoRings size={52} />
          <h1 style={{ fontFamily: "Fraunces" }} className="text-2xl font-semibold text-stone-800 mt-3 text-center">
            Controle e Gestão Financeira
          </h1>
          <p className="text-sm text-stone-500 mt-1 text-center">
            O seu consultor financeiro, sempre disponível.
          </p>
        </div>
        <Card className="p-5">
          <div className="flex bg-stone-100 rounded-lg p-1 mb-5">
            <button
              data-testid="auth-login-tab"
              onClick={() => { setMode("login"); setError(""); }}
              className={`flex-1 text-xs sm:text-sm font-medium py-1.5 rounded-md transition-colors ${mode === "login" ? "bg-white shadow-sm text-teal-900" : "text-stone-500 hover:text-stone-800"}`}
            >
              Entrar
            </button>
            <button
              data-testid="auth-register-tab"
              onClick={() => { setMode("create"); setError(""); }}
              className={`flex-1 text-xs sm:text-sm font-medium py-1.5 rounded-md transition-colors ${mode === "create" ? "bg-white shadow-sm text-teal-900" : "text-stone-500 hover:text-stone-800"}`}
            >
              Criar cadastro
            </button>
            <button
              data-testid="auth-restore-tab"
              onClick={() => { setMode("restore"); setError(""); }}
              className={`flex-1 text-xs sm:text-sm font-medium py-1.5 rounded-md transition-colors ${mode === "restore" ? "bg-white shadow-sm text-teal-900" : "text-stone-500 hover:text-stone-800"}`}
            >
              Restaurar
            </button>
          </div>
          <div className="space-y-3">
            <Field label="Usuário">
              <input
                data-testid="auth-username-input"
                className={inputCls}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: joao"
                autoComplete="username"
              />
            </Field>
            {mode === "create" && (
              <Field label="Nome do seu ambiente financeiro (opcional)">
                <input
                  data-testid="auth-household-name-input"
                  className={inputCls}
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder="Ex: Minhas Finanças"
                />
              </Field>
            )}
            <Field label="Senha de 4 dígitos">
              <input
                data-testid="auth-pin-input"
                className={inputCls}
                value={pin}
                onChange={setPinValue(setPin)}
                inputMode="numeric"
                maxLength={4}
                type="password"
                placeholder="••••"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </Field>
            {(mode === "create" || mode === "restore") && (
              <Field label="Confirmar senha">
                <input
                  data-testid="auth-confirm-pin-input"
                  className={inputCls}
                  value={confirmPin}
                  onChange={setPinValue(setConfirmPin)}
                  inputMode="numeric"
                  maxLength={4}
                  type="password"
                  placeholder="••••"
                  autoComplete="new-password"
                />
              </Field>
            )}
            {mode === "restore" && (
              <Field label="Arquivo de backup (.json)">
                <input
                  data-testid="auth-backup-input"
                  type="file"
                  accept="application/json,.json"
                  onChange={handleFileChange}
                  className="w-full text-xs text-stone-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-stone-100 file:text-stone-600 file:text-xs file:font-medium"
                />
                {backupFileName && (
                  <p className="text-xs text-emerald-600 mt-1.5">Arquivo carregado: {backupFileName}</p>
                )}
              </Field>
            )}
            {error && (
              <p data-testid="auth-error-message" className="text-xs text-rose-600">{error}</p>
            )}
            <button
              data-testid="auth-submit-button"
              disabled={busy}
              onClick={submit}
              className="w-full bg-teal-900 hover:bg-teal-800 text-white text-sm font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
            >
              {busy ? "Aguarde..." : mode === "login" ? "Entrar" : mode === "create" ? "Cadastrar" : "Restaurar backup"}
              <ArrowRight size={16} />
            </button>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-100 flex flex-col items-center gap-1.5 text-xs text-stone-500">
            {mode === "login" ? (
              <>
                <button
                  data-testid="switch-to-register-button"
                  type="button"
                  onClick={() => { setMode("create"); setError(""); }}
                  className="text-teal-800 font-medium hover:underline"
                >
                  AINDA NÃO TENHO CADASTRO
                </button>
                <button
                  data-testid="switch-to-restore-button"
                  type="button"
                  onClick={() => { setMode("restore"); setError(""); }}
                  className="text-stone-400 hover:text-stone-600 hover:underline text-[11px]"
                >
                  Restaurar backup de outro aparelho
                </button>
              </>
            ) : mode === "create" ? (
              <button
                data-testid="switch-to-login-button"
                type="button"
                onClick={() => { setMode("login"); setError(""); }}
                className="text-teal-800 font-medium hover:underline"
              >
                JÁ TENHO CADASTRO · FAZER LOGIN
              </button>
            ) : (
              <button
                data-testid="switch-to-login-button"
                type="button"
                onClick={() => { setMode("login"); setError(""); }}
                className="text-teal-800 font-medium hover:underline"
              >
                VOLTAR PARA O LOGIN
              </button>
            )}
          </div>
        </Card>
        <p data-testid="auth-helper-text" className="text-xs text-stone-400 text-center mt-4">
          {mode === "login"
            ? "Entre para acessar seus dados financeiros."
            : mode === "create"
            ? "Seu cadastro e seus dados ficam salvos neste dispositivo."
            : "Use um backup para trazer seus dados de outro dispositivo."}
        </p>
      </div>
    </div>
  );
}

/* ============================== DASHBOARD ============================== */
function MonthPicker({ mk, setMk }) {
  return (
    <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-lg px-2 py-1">
      <button onClick={() => setMk(shiftMonthKey(mk, -1))} className="p-1 text-stone-400 hover:text-stone-700"><ChevronLeft size={16} /></button>
      <span className="text-sm font-medium text-stone-700 w-24 text-center">{labelForMonthKey(mk)}</span>
      <button onClick={() => setMk(shiftMonthKey(mk, 1))} className="p-1 text-stone-400 hover:text-stone-700"><ChevronRight size={16} /></button>
    </div>
  );
}

function StatCard({ label, value, sub, tone = "default" }) {
  const toneCls = { default: "text-stone-800", danger: "text-rose-600", success: "text-emerald-700" }[tone];
  return (
    <Card className="p-4 min-w-0">
      <p className="text-xs text-stone-500 font-medium truncate">{label}</p>
      <p className={`text-lg sm:text-xl font-semibold mt-1 break-words ${toneCls}`} style={{ fontFamily: "Fraunces" }}>{value}</p>
      {sub && <p className="text-[11px] text-stone-400 mt-0.5 truncate">{sub}</p>}
    </Card>
  );
}

function DashboardScreen({ data, mk, setMk, session }) {
  const t = monthlyTotals(data, mk);
  const comprometimento = t.receita > 0 ? (t.despesa / t.receita) * 100 : 0;
  const cats = categoryBreakdown(t.expenses);
  const trend = last6MonthKeys(mk).map((m) => {
    const mt = monthlyTotals(data, m);
    return { mes: labelForMonthKey(m).slice(0, 3), Receita: Math.round(mt.receita), Despesas: Math.round(mt.despesa), Economia: Math.round(mt.saldo) };
  });
  const upcomingAll = (data.expenses || [])
    .filter((e) => {
      const st = expenseStatus(e);
      if (st === "Atrasado") return true;
      if (st === "Pendente") { const d = daysUntil(e.dueDate); return d !== null && d <= 10; }
      return false;
    })
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  const upcoming = upcomingAll;
  const totalUpcoming = upcomingAll.reduce((s, e) => s + Number(e.value || 0), 0);
  const insights = generateInsights(data, mk).slice(0, 2);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontFamily: "Fraunces" }} className="text-2xl font-semibold text-stone-800">Olá, {session.name.split(" ")[0]}</h1>
          <p className="text-sm text-stone-500">{data.name} · resumo de {labelForMonthKey(mk).toLowerCase()}</p>
        </div>
        <MonthPicker mk={mk} setMk={setMk} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Receita total" value={fmtBRL(t.receita)} />
        <StatCard label="Despesas totais" value={fmtBRL(t.despesa)} />
        <StatCard label="Saldo disponível" value={fmtBRL(t.saldo)} tone={t.saldo >= 0 ? "success" : "danger"} />
        <StatCard label="Renda comprometida" value={`${comprometimento.toFixed(0)}%`} tone={comprometimento > 80 ? "danger" : comprometimento < 60 ? "success" : "default"} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <p className="text-sm font-semibold text-stone-700 mb-2">Gastos por categoria</p>
          {cats.length ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={cats} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {cats.map((c) => <Cell key={c.name} fill={CAT_COLORS[c.name] || "#999"} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtBRL(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState icon={TrendingDown} text="Nenhuma despesa registrada neste mês ainda." />}
          {cats.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
              {cats.map((c) => (
                <span key={c.name} className="flex items-center gap-1 text-[11px] text-stone-500">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CAT_COLORS[c.name] }} /> {c.name} {c.pct}%
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-sm font-semibold text-stone-700 mb-2">Evolução (6 meses)</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0eee9" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip formatter={(v) => fmtBRL(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Receita" stroke="#0f6b63" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Despesas" stroke="#b3564a" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Economia" stroke="#d99a3d" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <p className="text-sm font-semibold text-stone-700 mb-3">Próximos vencimentos (10 dias)</p>
          {upcoming.length ? (
            <>
              <div className="space-y-2">
                {upcoming.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="text-stone-700 font-medium truncate">{e.name}</p>
                      <p className="text-xs text-stone-400">{e.dueDate}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-stone-700 whitespace-nowrap">{fmtBRL(e.value)}</p>
                      <Badge tone={expenseStatus(e) === "Atrasado" ? "danger" : "warning"}>{expenseStatus(e)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-stone-200">
                <span className="text-sm font-semibold text-stone-700">Total</span>
                <span className="text-sm font-semibold text-amber-700">{fmtBRL(totalUpcoming)}</span>
              </div>
            </>
          ) : <EmptyState icon={Check} text="Nenhuma conta pendente. Tudo em dia!" />}
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-stone-700">Análise inteligente</p>
            <Sparkles size={16} className="text-amber-500" />
          </div>
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <div key={i} className={`text-sm rounded-lg px-3 py-2 ${ins.type === "alert" ? "bg-rose-50 text-rose-700" : ins.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {ins.text}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ============================== RECEITAS ============================== */
function ReceitasScreen({ data, mk, mutate, session }) {
  const emptyForm = { name: "", value: "", date: todayKey(), category: INCOME_CATEGORIES[0], frequency: "Mensal" };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const formCardRef = useRef(null);
  const t = monthlyTotals(data, mk);
  const byCategory = {};
  t.incomes.forEach((i) => { byCategory[i.category] = (byCategory[i.category] || 0) + monthlyEquivalent(i); });
  const filteredIncomes = search.trim()
    ? t.incomes.filter((i) => i.name.toLowerCase().includes(search.trim().toLowerCase()))
    : t.incomes;

  function submitIncome() {
    if (!form.name.trim() || !form.value) return;
    if (editingId) {
      mutate((d) => ({
        ...d,
        incomes: d.incomes.map((i) => i.id === editingId
          ? { ...i, ...form, value: Number(form.value), updatedAt: new Date().toISOString() }
          : i),
      }));
      setEditingId(null);
    } else {
      const record = { id: uid(), ...form, value: Number(form.value), responsible: session.name, createdBy: session.name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      mutate((d) => ({ ...d, incomes: [...(d.incomes || []), record] }));
    }
    setForm(emptyForm);
  }
  function startEditIncome(i) {
    setEditingId(i.id);
    setForm({ name: i.name, value: String(i.value), date: i.date, category: i.category, frequency: i.frequency || "Mensal" });
    formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function cancelEditIncome() {
    setEditingId(null);
    setForm(emptyForm);
  }
  function removeIncome(id) {
    mutate((d) => ({ ...d, incomes: d.incomes.filter((i) => i.id !== id) }));
    if (editingId === id) cancelEditIncome();
  }

  return (
    <div className="space-y-5">
      <h1 style={{ fontFamily: "Fraunces" }} className="text-2xl font-semibold text-stone-800">Receitas</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Renda total do mês" value={fmtBRL(t.receita)} />
        {Object.entries(byCategory).map(([cat, val]) => (
          <StatCard key={cat} label={cat} value={fmtBRL(val)} sub={t.receita > 0 ? `${((val / t.receita) * 100).toFixed(0)}% da renda` : ""} />
        ))}
      </div>

      <Card ref={formCardRef} className="p-4">
        <p className="text-sm font-semibold text-stone-700 mb-3">{editingId ? "Editar receita" : "Adicionar receita"}</p>
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Nome"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => handleEnterKey(e, submitIncome)} placeholder="Ex: Salário" /></Field>
          <Field label="Valor (R$)"><input type="number" step="0.01" className={inputCls} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} onKeyDown={(e) => handleEnterKey(e, submitIncome)} placeholder="0,00" /></Field>
          <Field label="Data"><input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} onKeyDown={(e) => handleEnterKey(e, submitIncome)} /></Field>
          <Field label="Categoria">
            <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {INCOME_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={submitIncome} className="flex items-center gap-1.5 bg-teal-900 hover:bg-teal-800 text-white text-sm font-medium px-4 py-2 rounded-lg">
            {editingId ? <Check size={16} /> : <Plus size={16} />}{editingId ? "Salvar alterações" : "Adicionar receita"}
          </button>
          {editingId && (
            <button onClick={cancelEditIncome} className="text-sm font-medium text-stone-500 hover:text-stone-700 px-3 py-2">Cancelar</button>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-sm font-semibold text-stone-700">Receitas cadastradas</p>
          <input
            className={`${inputCls} w-auto`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome..."
          />
        </div>
        {t.incomes.length === 0 ? <EmptyState icon={Wallet} text="Nenhuma receita cadastrada ainda." /> : filteredIncomes.length === 0 ? (
          <EmptyState icon={Wallet} text="Nenhuma receita encontrada para essa busca." />
        ) : (
          <div className="space-y-2">
            {filteredIncomes.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 text-sm border-b border-stone-100 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="font-medium text-stone-700 truncate">{i.name} <span className="text-stone-400 font-normal">· {i.category}</span></p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-stone-700 font-medium whitespace-nowrap">{fmtBRL(i.value)}</span>
                  <button onClick={() => startEditIncome(i)} className="text-stone-300 hover:text-teal-700"><Pencil size={15} /></button>
                  <button onClick={() => removeIncome(i.id)} className="text-stone-300 hover:text-rose-500"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============================== DESPESAS ============================== */
// Atrasadas primeiro, depois pendentes, depois pagas; dentro de cada grupo, vencimento mais próximo primeiro.
const EXPENSE_STATUS_ORDER = { Atrasado: 0, Pendente: 1, Pago: 2 };
function sortExpensesByDueDate(list) {
  return [...list].sort((a, b) => {
    const statusDiff = EXPENSE_STATUS_ORDER[expenseStatus(a)] - EXPENSE_STATUS_ORDER[expenseStatus(b)];
    if (statusDiff !== 0) return statusDiff;
    return (a.dueDate || "").localeCompare(b.dueDate || "");
  });
}

function DespesasScreen({ data, mk, mutate, session }) {
  const emptyForm = { name: "", category: EXPENSE_CATEGORIES[0], value: "", dueDate: todayKey(), paidDate: "", type: "Variável" };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [filterCat, setFilterCat] = useState("Todas");
  const [search, setSearch] = useState("");
  const formCardRef = useRef(null);
  const t = monthlyTotals(data, mk);
  const byCategoryCount = {};
  t.expenses.forEach((e) => { byCategoryCount[e.category] = (byCategoryCount[e.category] || 0) + 1; });
  const catFiltered = filterCat === "Todas" ? t.expenses : t.expenses.filter((e) => e.category === filterCat);
  const searched = search.trim()
    ? catFiltered.filter((e) => e.name.toLowerCase().includes(search.trim().toLowerCase()))
    : catFiltered;
  const filtered = sortExpensesByDueDate(searched);
  const totalPago = t.expenses.filter((e) => expenseStatus(e) === "Pago").reduce((s, e) => s + Number(e.value || 0), 0);
  const totalEmAberto = t.expenses.filter((e) => expenseStatus(e) !== "Pago").reduce((s, e) => s + Number(e.value || 0), 0);

  function submitExpense() {
    if (!form.name.trim() || !form.value) return;
    if (editingId) {
      mutate((d) => ({
        ...d,
        expenses: d.expenses.map((e) => e.id === editingId
          ? { ...e, ...form, value: Number(form.value), updatedAt: new Date().toISOString() }
          : e),
      }));
      setEditingId(null);
    } else {
      const record = { id: uid(), ...form, value: Number(form.value), responsible: session.name, createdBy: session.name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      mutate((d) => ({ ...d, expenses: [...(d.expenses || []), record] }));
    }
    setForm(emptyForm);
  }
  function startEditExpense(e) {
    setEditingId(e.id);
    setForm({ name: e.name, category: e.category, value: String(e.value), dueDate: e.dueDate, paidDate: e.paidDate || "", type: e.type });
    formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function cancelEditExpense() {
    setEditingId(null);
    setForm(emptyForm);
  }
  function togglePaid(e) {
    mutate((d) => ({ ...d, expenses: d.expenses.map((x) => x.id === e.id ? { ...x, paidDate: x.paidDate ? "" : todayKey(), updatedAt: new Date().toISOString() } : x) }));
  }
  function removeExpense(id) {
    mutate((d) => ({ ...d, expenses: d.expenses.filter((e) => e.id !== id) }));
    if (editingId === id) cancelEditExpense();
  }

  return (
    <div className="space-y-5">
      <h1 style={{ fontFamily: "Fraunces" }} className="text-2xl font-semibold text-stone-800">Despesas</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label={`Total de ${labelForMonthKey(mk).toLowerCase()}`} value={fmtBRL(t.despesa)} />
        <StatCard label="Pago" value={fmtBRL(totalPago)} tone="success" />
        <StatCard label="Em aberto" value={fmtBRL(totalEmAberto)} tone="danger" />
      </div>

      <Card ref={formCardRef} className="p-4">
        <p className="text-sm font-semibold text-stone-700 mb-3">{editingId ? "Editar despesa" : "Adicionar despesa"}</p>
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Nome"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => handleEnterKey(e, submitExpense)} placeholder="Ex: Mercado" /></Field>
          <Field label="Valor (R$)"><input type="number" step="0.01" className={inputCls} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} onKeyDown={(e) => handleEnterKey(e, submitExpense)} placeholder="0,00" /></Field>
          <Field label="Categoria">
            <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Vencimento"><input type="date" className={inputCls} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} onKeyDown={(e) => handleEnterKey(e, submitExpense)} /></Field>
          <Field label="Tipo">
            <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>Fixa</option><option>Variável</option>
            </select>
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={submitExpense} className="flex items-center gap-1.5 bg-teal-900 hover:bg-teal-800 text-white text-sm font-medium px-4 py-2 rounded-lg">
            {editingId ? <Check size={16} /> : <Plus size={16} />}{editingId ? "Salvar alterações" : "Adicionar despesa"}
          </button>
          {editingId && (
            <button onClick={cancelEditExpense} className="text-sm font-medium text-stone-500 hover:text-stone-700 px-3 py-2">Cancelar</button>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-sm font-semibold text-stone-700">Despesas de {labelForMonthKey(mk).toLowerCase()}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              className={`${inputCls} w-auto`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome..."
            />
            <select className={`${inputCls} w-auto`} value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
              <option value="Todas">Todas ({t.expenses.length})</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c} ({byCategoryCount[c] || 0})</option>)}
            </select>
          </div>
        </div>
        {filtered.length === 0 ? <EmptyState icon={TrendingDown} text="Nenhuma despesa encontrada para esse filtro/busca." /> : (
          <div className="space-y-2">
            {filtered.map((e) => {
              const st = expenseStatus(e);
              return (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-sm border-b border-stone-100 pb-2 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CAT_COLORS[e.category] }} />
                    <div className="min-w-0">
                      <p className="font-medium text-stone-700 truncate">{e.name} <span className="text-stone-400 font-normal">· {e.category}</span></p>
                      <p className="text-xs text-stone-400 truncate">{e.type} · vence {e.dueDate}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-auto">
                    <span className="text-stone-700 font-medium whitespace-nowrap">{fmtBRL(e.value)}</span>
                    <button onClick={() => togglePaid(e)}><Badge tone={st === "Pago" ? "success" : st === "Atrasado" ? "danger" : "warning"}>{st}</Badge></button>
                    <button onClick={() => startEditExpense(e)} className="text-stone-300 hover:text-teal-700"><Pencil size={15} /></button>
                    <button onClick={() => removeExpense(e.id)} className="text-stone-300 hover:text-rose-500"><Trash2 size={15} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============================== METAS ============================== */
function MetasScreen({ data, mk, mutate, session }) {
  const [form, setForm] = useState({ name: "", targetValue: "", targetDate: "", savedValue: "0" });
  const t = monthlyTotals(data, mk);

  function addGoal() {
    if (!form.name.trim() || !form.targetValue || !form.targetDate) return;
    const record = { id: uid(), name: form.name, targetValue: Number(form.targetValue), targetDate: form.targetDate, savedValue: Number(form.savedValue || 0), createdBy: session.name, createdAt: new Date().toISOString() };
    mutate((d) => ({ ...d, goals: [...(d.goals || []), record] }));
    setForm({ name: "", targetValue: "", targetDate: "", savedValue: "0" });
  }
  function updateSaved(id, delta) {
    mutate((d) => ({ ...d, goals: d.goals.map((g) => g.id === id ? { ...g, savedValue: Math.max(0, (g.savedValue || 0) + delta) } : g) }));
  }
  function removeGoal(id) { mutate((d) => ({ ...d, goals: d.goals.filter((g) => g.id !== id) })); }

  return (
    <div className="space-y-5">
      <h1 style={{ fontFamily: "Fraunces" }} className="text-2xl font-semibold text-stone-800">Meus objetivos</h1>

      <Card className="p-4">
        <p className="text-sm font-semibold text-stone-700 mb-3">Criar novo objetivo</p>
        <div className="grid md:grid-cols-4 gap-3">
          <Field label="Nome"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Viagem" /></Field>
          <Field label="Valor necessário (R$)"><input type="number" className={inputCls} value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })} /></Field>
          <Field label="Data desejada"><input type="date" className={inputCls} value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></Field>
          <Field label="Já acumulado (R$)"><input type="number" className={inputCls} value={form.savedValue} onChange={(e) => setForm({ ...form, savedValue: e.target.value })} /></Field>
        </div>
        {form.targetValue && form.targetDate && (() => {
          const meses = monthsUntil(form.targetDate);
          const necessario = (Number(form.targetValue) - Number(form.savedValue || 0)) / meses;
          const disponivel = t.saldo;
          const feasible = necessario <= disponivel;
          return (
            <div className={`mt-3 text-sm rounded-lg px-3 py-2 ${feasible ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              Para alcançar essa meta em {meses} {meses === 1 ? "mês" : "meses"}, você precisa guardar <b>{fmtBRL(necessario)}/mês</b>.
              {!feasible && ` O saldo disponível hoje é de ${fmtBRL(disponivel)} — considerem revisar gastos em lazer, assinaturas ou compras, ou ampliar o prazo.`}
            </div>
          );
        })()}
        <button onClick={addGoal} className="mt-3 flex items-center gap-1.5 bg-teal-900 hover:bg-teal-800 text-white text-sm font-medium px-4 py-2 rounded-lg"><Plus size={16} />Criar objetivo</button>
      </Card>

      {(!data.goals || data.goals.length === 0) ? (
        <Card className="p-4"><EmptyState icon={Target} text="Nenhum objetivo criado ainda. Que tal começar com uma reserva para uma viagem ou reforma?" /></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {data.goals.map((g) => {
            const pct = Math.min(100, ((g.savedValue || 0) / g.targetValue) * 100);
            const meses = monthsUntil(g.targetDate);
            const necessario = Math.max(0, (g.targetValue - (g.savedValue || 0)) / meses);
            return (
              <Card key={g.id} className="p-4 flex gap-4 items-center">
                <div className="shrink-0"><ProgressRing pct={pct} color="#d99a3d" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-stone-800 truncate">{g.name}</p>
                    <button onClick={() => removeGoal(g.id)} className="text-stone-300 hover:text-rose-500 shrink-0"><Trash2 size={15} /></button>
                  </div>
                  <p className="text-xs text-stone-400 mb-1">{fmtBRL(g.savedValue || 0)} de {fmtBRL(g.targetValue)} · até {g.targetDate}</p>
                  <p className="text-xs text-stone-500 mb-2">Necessário: <b>{fmtBRL(necessario)}/mês</b> · {meses} {meses === 1 ? "mês restante" : "meses restantes"}</p>
                  <div className="flex gap-2">
                    <button onClick={() => updateSaved(g.id, 100)} className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-600 px-2 py-1 rounded-md">+R$100</button>
                    <button onClick={() => updateSaved(g.id, 500)} className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-600 px-2 py-1 rounded-md">+R$500</button>
                    <button onClick={() => updateSaved(g.id, -100)} className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-600 px-2 py-1 rounded-md">-R$100</button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================== RESERVA DE EMERGÊNCIA ============================== */
function addMonthsLabel(n) {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return `${MONTH_NAMES[d.getMonth()]}/${d.getFullYear()}`;
}
const WITHDRAW_REASONS = ["Emergência médica", "Manutenção do veículo", "Perda de renda", "Conta inesperada", "Outro"];
const PRAZO_PRESETS = [3, 6, 12, 18, 24];

function ReservaScreen({ data, mk, mutate }) {
  const ef = data.emergencyFund || {};
  const target = Number(ef.target || 0);
  const currentSaved = Number(ef.currentSaved || 0);
  const monthlyContribution = Number(ef.monthlyContribution || 0);
  const history = ef.history || [];

  const t = monthlyTotals(data, mk);
  const sobra = t.saldo;
  const sugMin = sobra > 0 ? Math.max(0, Math.round((sobra * 0.4) / 10) * 10) : 0;
  const sugMax = sobra > 0 ? Math.max(sugMin, Math.round((sobra * 0.6) / 10) * 10) : 0;

  const remaining = Math.max(0, target - currentSaved);
  const pct = target > 0 ? Math.min(100, (currentSaved / target) * 100) : 0;
  const monthsRemaining = monthlyContribution > 0 && remaining > 0 ? Math.ceil(remaining / monthlyContribution) : remaining <= 0 ? 0 : null;
  const forecastLabel = monthsRemaining === null ? "defina um valor mensal para calcular" : monthsRemaining === 0 ? "meta já atingida" : addMonthsLabel(monthsRemaining);

  // Formulário de meta/valor mensal (local até perder o foco, aí salva)
  const [targetInput, setTargetInput] = useState(target ? String(target) : "");
  const [monthlyInput, setMonthlyInput] = useState(monthlyContribution ? String(monthlyContribution) : "");
  const [customPrazo, setCustomPrazo] = useState("");
  useEffect(() => { setTargetInput(target ? String(target) : ""); }, [target]);
  useEffect(() => { setMonthlyInput(monthlyContribution ? String(monthlyContribution) : ""); }, [monthlyContribution]);

  function commitTarget() {
    const v = Math.max(0, Number(targetInput) || 0);
    mutate((d) => ({ ...d, emergencyFund: { ...(d.emergencyFund || {}), target: v } }));
  }
  function commitMonthly() {
    const v = Math.max(0, Number(monthlyInput) || 0);
    mutate((d) => ({ ...d, emergencyFund: { ...(d.emergencyFund || {}), monthlyContribution: v } }));
  }
  function applyPrazo(meses) {
    const val = remaining > 0 ? Math.ceil(remaining / meses) : 0;
    setMonthlyInput(String(val));
    mutate((d) => ({ ...d, emergencyFund: { ...(d.emergencyFund || {}), monthlyContribution: val } }));
  }
  function applySuggested() {
    const val = sugMax || sugMin;
    setMonthlyInput(String(val));
    mutate((d) => ({ ...d, emergencyFund: { ...(d.emergencyFund || {}), monthlyContribution: val } }));
  }

  // Adicionar / retirar dinheiro
  const [showAdd, setShowAdd] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [addForm, setAddForm] = useState({ value: "", date: todayKey(), note: "" });
  const [withdrawForm, setWithdrawForm] = useState({ value: "", reason: WITHDRAW_REASONS[0], date: todayKey() });
  const [lastAction, setLastAction] = useState(null); // "deposito" | "retirada" | null

  function saveMovement(type, value, date, note) {
    const v = Math.abs(Number(value) || 0);
    if (v <= 0) return;
    mutate((d) => {
      const cur = d.emergencyFund || {};
      const newSaved = type === "deposito" ? (cur.currentSaved || 0) + v : Math.max(0, (cur.currentSaved || 0) - v);
      const entry = { id: uid(), type, value: v, date: date || todayKey(), note: note || "" };
      return { ...d, emergencyFund: { ...cur, currentSaved: newSaved, history: [entry, ...(cur.history || [])] } };
    });
    setLastAction(type);
  }
  function handleAdd() {
    saveMovement("deposito", addForm.value, addForm.date, addForm.note);
    setAddForm({ value: "", date: todayKey(), note: "" });
    setShowAdd(false);
  }
  function handleWithdraw() {
    saveMovement("retirada", withdrawForm.value, withdrawForm.date, withdrawForm.reason);
    setWithdrawForm({ value: "", reason: WITHDRAW_REASONS[0], date: todayKey() });
    setShowWithdraw(false);
  }

  // Alerta inteligente
  let alert = null;
  if (target > 0) {
    if (pct >= 100) alert = { tone: "success", text: "Parabéns! Você completou sua reserva de emergência." };
    else if (lastAction === "retirada") alert = { tone: "alert", text: "Atenção: sua reserva diminuiu. Considere aumentar os próximos aportes." };
    else if (pct >= 80) alert = { tone: "tip", text: `Você está quase lá! Faltam ${fmtBRL(remaining)} para completar sua reserva.` };
    else if (currentSaved > 0) alert = { tone: "success", text: "Parabéns! Você está no caminho para completar sua reserva." };
  }

  return (
    <div className="space-y-5">
      <h1 style={{ fontFamily: "Fraunces" }} className="text-2xl font-semibold text-stone-800">Reserva de emergência</h1>

      {/* Minha evolução — primeiro e maior destaque da tela */}
      <Card className="p-5">
        <p className="text-sm font-semibold text-stone-700 mb-4">Minha evolução</p>
        <div className="grid grid-cols-3 gap-3 text-center mb-4">
          <div>
            <p className="text-xs text-stone-400 mb-1">Já guardado</p>
            <p className="text-lg sm:text-2xl font-semibold text-teal-800">{fmtBRL(currentSaved)}</p>
          </div>
          <div>
            <p className="text-xs text-stone-400 mb-1">Falta</p>
            <p className="text-lg sm:text-2xl font-semibold text-stone-700">{fmtBRL(remaining)}</p>
          </div>
          <div>
            <p className="text-xs text-stone-400 mb-1">Previsão</p>
            <p className="text-lg sm:text-2xl font-semibold text-stone-700">{forecastLabel}</p>
          </div>
        </div>
        <ProgressBar pct={pct} />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-stone-400">Meta: <b className="text-stone-600">{fmtBRL(target)}</b></p>
          <p className="text-xs text-stone-400">{pct.toFixed(0)}%</p>
        </div>
        {alert && <ResultBanner tone={alert.tone}>{alert.text}</ResultBanner>}
        <div className="flex gap-2 mt-4">
          <button onClick={() => { setShowAdd((s) => !s); setShowWithdraw(false); }}
            className="flex-1 flex items-center justify-center gap-1.5 bg-teal-900 hover:bg-teal-800 text-white text-sm font-medium py-2.5 rounded-lg">
            <Plus size={16} /> Adicionar dinheiro
          </button>
          <button onClick={() => { setShowWithdraw((s) => !s); setShowAdd(false); }}
            className="flex-1 flex items-center justify-center gap-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium py-2.5 rounded-lg">
            <TrendingDown size={16} /> Retirar dinheiro
          </button>
        </div>

        {showAdd && (
          <div className="mt-4 pt-4 border-t border-stone-200 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Valor (R$)">
                <input type="number" className={inputCls} value={addForm.value} onChange={(e) => setAddForm({ ...addForm, value: e.target.value })} placeholder="Ex: 500" />
              </Field>
              <Field label="Data">
                <input type="date" className={inputCls} value={addForm.date} onChange={(e) => setAddForm({ ...addForm, date: e.target.value })} />
              </Field>
            </div>
            <Field label="Observação (opcional)">
              <input className={inputCls} value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })} placeholder="Ex: Aporte mensal" />
            </Field>
            <button onClick={handleAdd} className="bg-teal-900 hover:bg-teal-800 text-white text-sm font-medium px-4 py-2 rounded-lg">Salvar depósito</button>
          </div>
        )}
        {showWithdraw && (
          <div className="mt-4 pt-4 border-t border-stone-200 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Valor retirado (R$)">
                <input type="number" className={inputCls} value={withdrawForm.value} onChange={(e) => setWithdrawForm({ ...withdrawForm, value: e.target.value })} placeholder="Ex: 300" />
              </Field>
              <Field label="Data">
                <input type="date" className={inputCls} value={withdrawForm.date} onChange={(e) => setWithdrawForm({ ...withdrawForm, date: e.target.value })} />
              </Field>
            </div>
            <Field label="Motivo da retirada">
              <select className={inputCls} value={withdrawForm.reason} onChange={(e) => setWithdrawForm({ ...withdrawForm, reason: e.target.value })}>
                {WITHDRAW_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <button onClick={handleWithdraw} className="bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium px-4 py-2 rounded-lg">Confirmar retirada</button>
          </div>
        )}
      </Card>

      {/* Análise financeira automática */}
      <Card className="p-4">
        <p className="text-sm font-semibold text-stone-700 mb-3">Quanto você pode guardar por mês</p>
        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          <div><p className="text-xs text-stone-400">Receita</p><p className="text-sm font-semibold text-stone-700">{fmtBRL(t.receita)}</p></div>
          <div><p className="text-xs text-stone-400">Despesas</p><p className="text-sm font-semibold text-stone-700">{fmtBRL(t.despesa)}</p></div>
          <div><p className="text-xs text-stone-400">Sobra</p><p className={`text-sm font-semibold ${sobra >= 0 ? "text-emerald-700" : "text-rose-600"}`}>{fmtBRL(sobra)}</p></div>
        </div>
        {sobra > 0 ? (
          <ResultBanner tone="tip">
            Com base na sua situação financeira, recomendamos guardar entre <b>{fmtBRL(sugMin)}</b> e <b>{fmtBRL(sugMax)}</b> por mês para sua reserva de emergência.
            {" "}<button onClick={applySuggested} className="underline font-medium">Usar sugestão</button>
          </ResultBanner>
        ) : (
          <ResultBanner tone="alert">Suas despesas estão iguais ou maiores que a receita este mês, então não há sobra para sugerir um valor de reserva agora. Isso é só uma recomendação — ajuste como preferir abaixo.</ResultBanner>
        )}
      </Card>

      {/* Meta e prazo */}
      <Card className="p-4">
        <p className="text-sm font-semibold text-stone-700 mb-3">Meta e prazo</p>
        <div className="space-y-3">
          <Field label="Qual é a sua meta de reserva? (R$)">
            <input type="number" className={inputCls} value={targetInput} onChange={(e) => setTargetInput(e.target.value)} onBlur={commitTarget} placeholder="Ex: 12000" />
          </Field>
          <div>
            <span className="text-xs font-medium text-stone-500 mb-1.5 block">Em quanto tempo você quer construir essa reserva?</span>
            <div className="flex flex-wrap gap-2">
              {PRAZO_PRESETS.map((p) => (
                <button key={p} onClick={() => applyPrazo(p)}
                  className="text-xs font-medium bg-stone-100 hover:bg-teal-50 hover:text-teal-800 text-stone-600 px-3 py-1.5 rounded-full transition-colors">
                  {p} meses
                </button>
              ))}
              <div className="flex items-center gap-1.5">
                <input type="number" className="w-20 rounded-full border border-stone-200 px-3 py-1.5 text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-teal-700/30" placeholder="Outro" value={customPrazo} onChange={(e) => setCustomPrazo(e.target.value)} />
                <button onClick={() => customPrazo && applyPrazo(Number(customPrazo))}
                  className="text-xs font-medium bg-stone-100 hover:bg-teal-50 hover:text-teal-800 text-stone-600 px-3 py-1.5 rounded-full transition-colors">Aplicar</button>
              </div>
            </div>
          </div>
          <Field label="Quanto você deseja guardar por mês? (R$)">
            <input type="number" className={inputCls} value={monthlyInput} onChange={(e) => setMonthlyInput(e.target.value)} onBlur={commitMonthly} placeholder="Ex: 1000" />
          </Field>
          {monthlyContribution > 0 && target > 0 && (
            <p className="text-xs text-stone-500">
              {monthsRemaining === 0
                ? "Você já atingiu sua meta de reserva."
                : `Guardando ${fmtBRL(monthlyContribution)} por mês, você terá ${fmtBRL(target)} em ${monthsRemaining} ${monthsRemaining === 1 ? "mês" : "meses"} (${forecastLabel}).`}
            </p>
          )}
        </div>
      </Card>

      {/* Histórico */}
      <Card className="p-4">
        <p className="text-sm font-semibold text-stone-700 mb-3">Histórico de movimentações</p>
        {history.length ? (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between text-sm border-b border-stone-100 last:border-0 pb-2 last:pb-0">
                <div className="min-w-0">
                  <p className="text-stone-700">{h.date}</p>
                  {h.note && <p className="text-xs text-stone-400 truncate">{h.note}</p>}
                </div>
                <p className={`font-semibold shrink-0 ${h.type === "deposito" ? "text-emerald-700" : "text-rose-600"}`}>
                  {h.type === "deposito" ? "+ " : "− "}{fmtBRL(h.value)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={ShieldCheck} text="Nenhuma movimentação registrada ainda. Use os botões acima para adicionar ou retirar dinheiro da reserva." />
        )}
      </Card>
    </div>
  );
}

/* ============================== SIMULADOR FINANCEIRO ============================== */
function SimBlock({ title, children }) {
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold text-stone-700 mb-3">{title}</p>
      {children}
    </Card>
  );
}
function ResultBanner({ tone = "tip", children }) {
  const cls = tone === "success" ? "bg-emerald-50 text-emerald-700" : tone === "alert" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700";
  return <div className={`text-sm rounded-lg px-3 py-2.5 mt-3 ${cls}`}>{children}</div>;
}

function SimuladorScreen({ data, mk }) {
  const t = monthlyTotals(data, mk);

  const [poup, setPoup] = useState({ valor: "500", meses: "12" });
  const poupTotal = Number(poup.valor || 0) * Number(poup.meses || 0);

  const [renda, setRenda] = useState({ aumento: "1000" });
  const novoSaldo = t.saldo + Number(renda.aumento || 0);
  const novaReceita = t.receita + Number(renda.aumento || 0);
  const novoComprometimento = novaReceita > 0 ? (t.despesa / novaReceita) * 100 : 0;

  const [parcela, setParcela] = useState({ valor: "600", meses: "24" });
  const folgaAposParcela = t.saldo - Number(parcela.valor || 0);
  const parcelaViavel = folgaAposParcela >= 0;
  const comprometimentoComParcela = t.receita > 0 ? ((t.despesa + Number(parcela.valor || 0)) / t.receita) * 100 : 0;

  const [meta, setMeta] = useState({ valor: "12000", mensal: "1000" });
  const mesesNecessarios = Number(meta.mensal) > 0 ? Math.ceil(Number(meta.valor || 0) / Number(meta.mensal)) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontFamily: "Fraunces" }} className="text-2xl font-semibold text-stone-800">Simulador financeiro</h1>
        <p className="text-sm text-stone-500">Testem cenários usando como base o saldo disponível de {labelForMonthKey(mk).toLowerCase()}: <b>{fmtBRL(t.saldo)}</b>.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <SimBlock title="Se economizarmos um valor fixo por mês...">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor mensal (R$)"><input type="number" className={inputCls} value={poup.valor} onChange={(e) => setPoup({ ...poup, valor: e.target.value })} /></Field>
            <Field label="Por quantos meses"><input type="number" className={inputCls} value={poup.meses} onChange={(e) => setPoup({ ...poup, meses: e.target.value })} /></Field>
          </div>
          <ResultBanner tone="success">Economizando {fmtBRL(poup.valor)}/mês por {poup.meses || 0} meses, você terá <b>{fmtBRL(poupTotal)}</b> guardados (sem considerar rendimento de investimento).</ResultBanner>
        </SimBlock>

        <SimBlock title="Se sua renda aumentar...">
          <Field label="Aumento de renda (R$/mês)"><input type="number" className={inputCls} value={renda.aumento} onChange={(e) => setRenda({ aumento: e.target.value })} /></Field>
          <ResultBanner tone="success">
            O saldo disponível passaria de {fmtBRL(t.saldo)} para <b>{fmtBRL(novoSaldo)}</b>, e a renda comprometida cairia para <b>{novoComprometimento.toFixed(0)}%</b>.
          </ResultBanner>
        </SimBlock>

        <SimBlock title="Podemos assumir uma nova parcela?">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor da parcela (R$)"><input type="number" className={inputCls} value={parcela.valor} onChange={(e) => setParcela({ ...parcela, valor: e.target.value })} /></Field>
            <Field label="Duração (meses)"><input type="number" className={inputCls} value={parcela.meses} onChange={(e) => setParcela({ ...parcela, meses: e.target.value })} /></Field>
          </div>
          <ResultBanner tone={parcelaViavel ? "success" : "alert"}>
            {parcelaViavel
              ? <>Sim — sobrariam <b>{fmtBRL(folgaAposParcela)}</b> por mês, e a renda comprometida ficaria em <b>{comprometimentoComParcela.toFixed(0)}%</b> durante os {parcela.meses || 0} meses da parcela.</>
              : <>Com o saldo atual, essa parcela deixaria o orçamento negativo em <b>{fmtBRL(Math.abs(folgaAposParcela))}</b>/mês. A renda comprometida subiria para <b>{comprometimentoComParcela.toFixed(0)}%</b> — vale reconsiderar o valor ou o prazo.</>}
          </ResultBanner>
        </SimBlock>

        <SimBlock title="Quanto tempo até alcançar uma meta?">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor da meta (R$)"><input type="number" className={inputCls} value={meta.valor} onChange={(e) => setMeta({ ...meta, valor: e.target.value })} /></Field>
            <Field label="Guardando por mês (R$)"><input type="number" className={inputCls} value={meta.mensal} onChange={(e) => setMeta({ ...meta, mensal: e.target.value })} /></Field>
          </div>
          <ResultBanner tone="success">
            Guardando {fmtBRL(meta.mensal)}/mês, você alcança {fmtBRL(meta.valor)} em <b>{mesesNecessarios} {mesesNecessarios === 1 ? "mês" : "meses"}</b> (aproximadamente {(mesesNecessarios / 12).toFixed(1)} anos).
          </ResultBanner>
        </SimBlock>
      </div>
    </div>
  );
}

/* ============================== CALENDÁRIO / CONTROLE DE CONTAS ============================== */
function CalendarioScreen({ data, mk }) {
  const t = monthlyTotals(data, mk);
  const allExpenses = data.expenses || [];
  // Atrasadas e pendentes valem independentemente do mês em exibição — uma conta que vence
  // no mês seguinte não pode simplesmente sumir da visão de contas a pagar.
  const atrasadas = allExpenses.filter((e) => expenseStatus(e) === "Atrasado").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const pendentes = allExpenses.filter((e) => expenseStatus(e) === "Pendente").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const pagas = t.expenses.filter((e) => expenseStatus(e) === "Pago").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const totalAtrasadas = atrasadas.reduce((s, e) => s + Number(e.value || 0), 0);
  const totalPendentes = pendentes.reduce((s, e) => s + Number(e.value || 0), 0);
  const totalPagas = pagas.reduce((s, e) => s + Number(e.value || 0), 0);
  const venceEmBreve = pendentes.filter((e) => { const d = daysUntil(e.dueDate); return d !== null && d <= 3 && d >= 0; });

  const cats = categoryBreakdown(t.expenses);
  const discretionaryAlerts = cats.filter((c) => ["Lazer", "Compras", "Assinaturas"].includes(c.name) && c.pct >= 25);

  function Row({ e }) {
    const st = expenseStatus(e);
    const d = daysUntil(e.dueDate);
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm border-b border-stone-100 pb-2 last:border-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CAT_COLORS[e.category] }} />
          <div className="min-w-0">
            <p className="font-medium text-stone-700 truncate">{e.name} <span className="text-stone-400 font-normal">· {e.category}</span></p>
            <p className="text-xs text-stone-400">
              {e.dueDate}
              {st !== "Pago" && d !== null && (d < 0 ? ` · ${Math.abs(d)}d atrasada` : d === 0 ? " · vence hoje" : ` · vence em ${d}d`)}
            </p>
          </div>
        </div>
        <span className="text-stone-700 font-medium whitespace-nowrap shrink-0">{fmtBRL(e.value)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 style={{ fontFamily: "Fraunces" }} className="text-2xl font-semibold text-stone-800">Calendário financeiro</h1>

      {(venceEmBreve.length > 0 || atrasadas.length > 0 || discretionaryAlerts.length > 0) && (
        <div className="space-y-2">
          {atrasadas.length > 0 && (
            <div className="flex items-start gap-2 bg-rose-50 text-rose-700 text-sm rounded-lg px-3 py-2.5">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{atrasadas.length === 1 ? "1 conta está atrasada" : `${atrasadas.length} contas estão atrasadas`}: {atrasadas.map((e) => e.name).join(", ")}.</span>
            </div>
          )}
          {venceEmBreve.map((e) => (
            <div key={e.id} className="flex items-start gap-2 bg-amber-50 text-amber-700 text-sm rounded-lg px-3 py-2.5">
              <Bell size={16} className="shrink-0 mt-0.5" />
              <span>Conta de {e.name} vence {daysUntil(e.dueDate) === 0 ? "hoje" : `em ${daysUntil(e.dueDate)} dia${daysUntil(e.dueDate) > 1 ? "s" : ""}`}.</span>
            </div>
          ))}
          {discretionaryAlerts.map((c) => (
            <div key={c.name} className="flex items-start gap-2 bg-amber-50 text-amber-700 text-sm rounded-lg px-3 py-2.5">
              <Bell size={16} className="shrink-0 mt-0.5" />
              <span>Você está próximo do limite saudável em {c.name}: já é {c.pct}% dos gastos do mês.</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-stone-700">Atrasadas</p><Badge tone="danger">{atrasadas.length}</Badge>
          </div>
          {atrasadas.length ? (
            <>
              <div className="space-y-2">{atrasadas.map((e) => <Row key={e.id} e={e} />)}</div>
              <div className="flex items-center justify-between pt-3 mt-1 border-t border-stone-200">
                <span className="text-sm font-semibold text-stone-700">Total</span>
                <span className="text-sm font-semibold text-rose-600">{fmtBRL(totalAtrasadas)}</span>
              </div>
            </>
          ) : <EmptyState icon={Check} text="Nenhuma conta atrasada." />}
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-stone-700">Próximos vencimentos</p><Badge tone="warning">{pendentes.length}</Badge>
          </div>
          {pendentes.length ? (
            <>
              <div className="space-y-2">{pendentes.map((e) => <Row key={e.id} e={e} />)}</div>
              <div className="flex items-center justify-between pt-3 mt-1 border-t border-stone-200">
                <span className="text-sm font-semibold text-stone-700">Total</span>
                <span className="text-sm font-semibold text-amber-700">{fmtBRL(totalPendentes)}</span>
              </div>
            </>
          ) : <EmptyState icon={CalendarDays} text="Nenhuma conta pendente este mês." />}
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-stone-700">Pagas em {labelForMonthKey(mk).toLowerCase()}</p><Badge tone="success">{pagas.length}</Badge>
          </div>
          {pagas.length ? (
            <>
              <div className="space-y-2">{pagas.map((e) => <Row key={e.id} e={e} />)}</div>
              <div className="flex items-center justify-between pt-3 mt-1 border-t border-stone-200">
                <span className="text-sm font-semibold text-stone-700">Total</span>
                <span className="text-sm font-semibold text-emerald-700">{fmtBRL(totalPagas)}</span>
              </div>
            </>
          ) : <EmptyState icon={Check} text="Nenhuma conta paga ainda este mês." />}
        </Card>
      </div>
    </div>
  );
}

/* ============================== ANÁLISE ============================== */
function AnaliseScreen({ data, mk }) {
  const insights = generateInsights(data, mk);
  const groups = { alert: [], success: [], tip: [] };
  insights.forEach((i) => groups[i.type].push(i.text));
  const sections = [
    { key: "alert", title: "Pontos de atenção", icon: AlertTriangle, tone: "danger" },
    { key: "tip", title: "Sugestões", icon: Sparkles, tone: "warning" },
    { key: "success", title: "Pontos positivos", icon: TrendingUp, tone: "success" },
  ];
  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontFamily: "Fraunces" }} className="text-2xl font-semibold text-stone-800">Minha análise financeira</h1>
        <p className="text-sm text-stone-500">Baseada nos dados de {labelForMonthKey(mk).toLowerCase()}, atualizada automaticamente conforme você registra receitas e despesas.</p>
      </div>
      {sections.map((s) => groups[s.key].length > 0 && (
        <Card key={s.key} className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <s.icon size={17} className={s.tone === "danger" ? "text-rose-500" : s.tone === "success" ? "text-emerald-600" : "text-amber-500"} />
            <p className="text-sm font-semibold text-stone-700">{s.title}</p>
          </div>
          <div className="space-y-2">
            {groups[s.key].map((text, i) => <div key={i} className="text-sm text-stone-600 bg-stone-50 rounded-lg px-3 py-2">{text}</div>)}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ============================== RELATÓRIOS ============================== */
function RelatoriosScreen({ data, mk }) {
  const t = monthlyTotals(data, mk);
  const prevMk = shiftMonthKey(mk, -1);
  const prev = monthlyTotals(data, prevMk);
  const cats = categoryBreakdown(t.expenses);
  const year = mk.slice(0, 4);
  const yearMonths = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const yearTotals = yearMonths.reduce((acc, m) => {
    const mt = monthlyTotals(data, m);
    acc.receita += mt.receita; acc.despesa += mt.despesa; acc.saldo += mt.saldo;
    return acc;
  }, { receita: 0, despesa: 0, saldo: 0 });
  const yearChart = yearMonths.map((m) => {
    const mt = monthlyTotals(data, m);
    return { mes: labelForMonthKey(m).slice(0, 3), Receita: Math.round(mt.receita), Despesas: Math.round(mt.despesa) };
  });

  return (
    <div className="space-y-5">
      <h1 style={{ fontFamily: "Fraunces" }} className="text-2xl font-semibold text-stone-800">Relatórios</h1>

      <Card className="p-4">
        <p className="text-sm font-semibold text-stone-700 mb-3">Relatório mensal · {labelForMonthKey(mk)}</p>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-stone-500 mb-2">Onde você mais gastou</p>
            {cats.length ? cats.slice(0, 5).map((c) => (
              <div key={c.name} className="mb-1.5">
                <div className="flex justify-between text-xs text-stone-600 mb-0.5"><span>{c.name}</span><span>{fmtBRL(c.value)}</span></div>
                <ProgressBar pct={c.pct} color={CAT_COLORS[c.name]} />
              </div>
            )) : <p className="text-sm text-stone-400">Sem despesas neste mês.</p>}
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-stone-500">Receita ({labelForMonthKey(mk)})</span><span className="font-medium text-stone-700">{fmtBRL(t.receita)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Receita ({labelForMonthKey(prevMk)})</span><span className="font-medium text-stone-700">{fmtBRL(prev.receita)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Despesas ({labelForMonthKey(mk)})</span><span className="font-medium text-stone-700">{fmtBRL(t.despesa)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Despesas ({labelForMonthKey(prevMk)})</span><span className="font-medium text-stone-700">{fmtBRL(prev.despesa)}</span></div>
            <div className="flex justify-between border-t border-stone-100 pt-2"><span className="text-stone-500">Economia realizada</span><span className={`font-semibold ${t.saldo >= 0 ? "text-emerald-700" : "text-rose-600"}`}>{fmtBRL(t.saldo)}</span></div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-sm font-semibold text-stone-700 mb-3">Relatório anual · {year}</p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatCard label="Total recebido" value={fmtBRL(yearTotals.receita)} />
          <StatCard label="Total gasto" value={fmtBRL(yearTotals.despesa)} />
          <StatCard label="Total economizado" value={fmtBRL(yearTotals.saldo)} tone={yearTotals.saldo >= 0 ? "success" : "danger"} />
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={yearChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0eee9" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={40} />
            <Tooltip formatter={(v) => fmtBRL(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Receita" fill="#0f6b63" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Despesas" fill="#b3564a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

/* ============================== CONFIGURAÇÕES ============================== */
function ConfigScreen({ data, code, session, mutate, onLogout, theme, onToggleTheme }) {
  const [householdName, setHouseholdName] = useState(data.name);
  useEffect(() => { setHouseholdName(data.name); }, [data.name]);
  const [importMsg, setImportMsg] = useState(null); // { text, ok }

  function saveName() { mutate((d) => ({ ...d, name: householdName })); }
  function handleExport() { downloadBackup(code, data); }

  async function handleImportChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite selecionar o mesmo arquivo de novo depois
    if (!file) return;
    try {
      const parsed = await readBackupFile(file);
      const confirmed = window.confirm(
        "Isso substitui TODOS os dados cadastrados neste ambiente pelos dados do arquivo de backup. Essa ação não pode ser desfeita. Continuar?"
      );
      if (!confirmed) return;
      mutate(() => parsed.data);
      setImportMsg({ text: "Backup restaurado com sucesso.", ok: true });
    } catch (err) {
      setImportMsg({ text: err.message, ok: false });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3"><h1 style={{ fontFamily: "Fraunces" }} className="text-2xl font-semibold text-stone-800">Ajustes</h1><button data-testid="authenticated-theme-toggle" onClick={onToggleTheme} aria-label="Alternar tema" className="flex items-center gap-2 text-sm text-stone-500 border border-stone-200 rounded-lg px-3 py-2">{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}{theme === "dark" ? "Tema claro" : "Tema escuro"}</button></div>

      <Card className="p-4">
        <p className="text-sm font-semibold text-stone-700 mb-3">Meu ambiente financeiro</p>
        <div className="flex gap-2">
          <input data-testid="household-name-input" className={inputCls} value={householdName} onChange={(e) => setHouseholdName(e.target.value)} />
          <button data-testid="save-household-name-button" onClick={saveName} className="bg-teal-900 hover:bg-teal-800 text-white text-sm font-medium px-4 rounded-lg shrink-0">Salvar</button>
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-sm font-semibold text-stone-700 mb-1">Backup manual</p>
        <p className="text-xs text-stone-500 mb-3">Baixe uma cópia de tudo que está cadastrado aqui — útil para levar os dados para outro aparelho (faça login/cadastro lá e restaure o arquivo aqui nesta tela), ou como segurança extra.</p>
        <div className="flex flex-wrap gap-2">
          <button data-testid="download-backup-button" onClick={handleExport} className="flex items-center gap-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium px-4 py-2 rounded-lg"><Download size={15} />Baixar backup</button>
          <label className="flex items-center gap-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium px-4 py-2 rounded-lg cursor-pointer">
            <Upload size={15} />Restaurar backup aqui
            <input data-testid="restore-backup-input" type="file" accept="application/json,.json" className="hidden" onChange={handleImportChange} />
          </label>
        </div>
        {importMsg && <p data-testid="backup-import-message" className={`text-xs mt-2 ${importMsg.ok ? "text-emerald-600" : "text-rose-600"}`}>{importMsg.text}</p>}
      </Card>

      <Card className="p-4">
        <p className="text-sm font-semibold text-stone-700 mb-2">Sobre o armazenamento</p>
        <p className="text-xs text-stone-500 leading-relaxed">Seus dados ficam salvos apenas neste navegador/aparelho, presos à sua conta. Fechar o app, atualizar a página ou sair não apaga nada. Para levar os dados para outro aparelho, use o backup manual acima.</p>
      </Card>

      <button data-testid="logout-button" onClick={onLogout} className="flex items-center gap-2 text-sm font-medium text-rose-600 hover:text-rose-700 px-1">
        <LogOut size={16} /> Sair
      </button>
    </div>
  );
}

/* ============================== APP ============================== */
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = logged out
  const [data, setData] = useState(null);
  const [screen, setScreen] = useState("dashboard");
  const [mk, setMk] = useState(currentMonthKey());
  const [theme, setTheme] = useState(() => window.localStorage.getItem(THEME_KEY) || "light");
  const pollRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark-mode", theme === "dark");
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    (async () => {
      const s = await loadSession();
      if (s) {
        const d = await loadHousehold(s.code);
        if (d) { setSession(s); setData(d); return; }
      }
      setSession(null);
    })();
  }, []);

  useEffect(() => {
    if (!session) return;
    pollRef.current = setInterval(async () => {
      const fresh = await loadHousehold(session.code);
      if (fresh) setData(fresh);
    }, 6000);
    return () => clearInterval(pollRef.current);
  }, [session]);

  async function mutate(updater) {
    setData((prev) => {
      const next = updater(prev);
      saveHousehold(session.code, next);
      return next;
    });
  }

  function handleEnter(nextSession, initialData) {
    setSession(nextSession);
    setData(initialData);
  }

  async function handleLogout() {
    await clearSession();
    setSession(null);
    setData(null);
    setScreen("dashboard");
  }

  if (session === undefined) {
    return <div data-testid="app-loading" className="min-h-screen flex items-center justify-center bg-stone-50"><DuoRings size={44} /></div>;
  }
  if (!session || !data) {
    return (
      <>
        <LoginScreen onEnter={handleEnter} theme={theme} onToggleTheme={() => setTheme((v) => v === "dark" ? "light" : "dark")} />
      </>
    );
  }

  const screens = {
    dashboard: <DashboardScreen data={data} mk={mk} setMk={setMk} session={session} />,
    receitas: <ReceitasScreen data={data} mk={mk} mutate={mutate} session={session} />,
    despesas: <DespesasScreen data={data} mk={mk} mutate={mutate} session={session} />,
    metas: <MetasScreen data={data} mk={mk} mutate={mutate} session={session} />,
    reserva: <ReservaScreen data={data} mk={mk} mutate={mutate} />,
    simulador: <SimuladorScreen data={data} mk={mk} />,
    calendario: <CalendarioScreen data={data} mk={mk} />,
    analise: <AnaliseScreen data={data} mk={mk} />,
    relatorios: <RelatoriosScreen data={data} mk={mk} />,
    config: <ConfigScreen data={data} code={session.code} session={session} mutate={mutate} onLogout={handleLogout} theme={theme} onToggleTheme={() => setTheme((v) => v === "dark" ? "light" : "dark")} />,
  };

  return (
    <div className="flex min-h-screen bg-stone-50" style={{ fontFamily: "Inter" }}>
      <Nav screen={screen} setScreen={setScreen} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileTopBar screen={screen} />
        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 max-w-6xl">
          {screens[screen]}
        </main>
      </div>
    </div>
  );
}
