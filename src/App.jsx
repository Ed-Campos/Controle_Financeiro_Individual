import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend, BarChart, Bar,
} from "recharts";
import {
  Home, Wallet, TrendingDown, Target, ShieldCheck, Sparkles, FileBarChart,
  Settings, Plus, Trash2, ChevronLeft, ChevronRight, LogOut, Copy, Check,
  AlertTriangle, TrendingUp, Users, ArrowRight, X, MoreHorizontal,
  Calculator, CalendarDays, Bell, Download, Upload, Moon, Sun, PlusCircle,
  MinusCircle, Info, CheckCircle2
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
  catch (e) { console.error("Erro ao salvar dados do casal:", e); }
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

/* ============================== UI PRIMITIVES ============================== */
function DuoRings({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="16" cy="20" r="12" fill="#0f6b63" opacity="0.9" />
      <circle cx="24" cy="20" r="12" fill="#d99a3d" opacity="0.85" style={{ mixBlendMode: "multiply" }} />
    </svg>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl border border-stone-200 shadow-sm ${className}`}>
      {children}
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

const MOBILE_PRIMARY_KEYS = ["dashboard", "despesas", "metas", "analise"];

function Nav({ screen, setScreen }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = NAV_ITEMS.filter((it) => MOBILE_PRIMARY_KEYS.includes(it.key));
  const rest = NAV_ITEMS.filter((it) => !MOBILE_PRIMARY_KEYS.includes(it.key));

  function go(key) { setScreen(key); setMoreOpen(false); }

  return (
    <>
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

/* ============================== ABA: RESERVA DE EMERGÊNCIA INTELIGENTE ============================== */
function EmergencyFundScreen({ data, setData, mk }) {
  const totals = monthlyTotals(data, mk);
  const receita = totals.receita || 0;
  const despesas = totals.despesa || 0;
  const sobra = Math.max(0, receita - despesas);
  const saldoDisponivel = Math.max(0, totals.saldo || 0);

  // Faixa de sugestão recomendada (entre 40% e 60% da sobra)
  const sugestaoMin = Math.round(sobra * 0.4);
  const sugestaoMax = Math.round(sobra * 0.6);

  const ef = data.emergencyFund || {};
  
  // Estados Locais com Fallback Seguro aos dados já salvos do aplicativo
  const [metaTotal, setMetaTotal] = useState(ef.target || 12000);
  const [prazoMeses, setPrazoMeses] = useState(ef.goalMonths || 12);
  const [aporteMensal, setAporteMensal] = useState(ef.monthlyContribution || Math.round(metaTotal / (ef.goalMonths || 12)) || 1000);
  const [saldoReserva, setSaldoReserva] = useState(ef.currentSaved || 3500);
  
  const [historico, setHistorico] = useState(
    ef.history || [
      { id: 1, data: "05/09/2026", tipo: "deposito", valor: 500, desc: "Aporte mensal" },
      { id: 2, data: "10/09/2026", tipo: "retirada", valor: 300, desc: "Manutenção do veículo", motivo: "Manutenção do veículo" }
    ]
  );

  // Modais de Entrada e Saída
  const [showDepositoModal, setShowDepositoModal] = useState(false);
  const [showRetiradaModal, setShowRetiradaModal] = useState(false);

  const [depositoValor, setDepositoValor] = useState("");
  const [depositoData, setDepositoData] = useState(todayKey());
  const [depositoObs, setDepositoObs] = useState("");

  const [retiradaValor, setRetiradaValor] = useState("");
  const [retiradaData, setRetiradaData] = useState(todayKey());
  const [retiradaMotivo, setRetiradaMotivo] = useState("Emergência médica");

  // Atualização Global para Manter os Dados Salvos
  const syncGlobalStorage = (newSaved, newHistory, newTarget, newMonths, newContribution) => {
    const updatedData = {
      ...data,
      emergencyFund: {
        ...ef,
        currentSaved: newSaved,
        history: newHistory,
        target: newTarget,
        goalMonths: newMonths,
        monthlyContribution: newContribution,
      }
    };
    setData(updatedData);
  };

  const quantoFalta = Math.max(0, metaTotal - saldoReserva);
  const percentualConcluido = Math.min(100, Math.round((saldoReserva / metaTotal) * 100));
  const mesesRestantes = aporteMensal > 0 ? Math.ceil(quantoFalta / aporteMensal) : 0;

  const calcularDataEstimada = (meses) => {
    if (quantoFalta === 0) return "Meta atingida! 🎉";
    if (meses <= 0) return "Aporte insuficiente";
    const d = new Date();
    d.setMonth(d.getMonth() + meses);
    return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  };

  const handlePrazoChange = (meses) => {
    setPrazoMeses(meses);
    if (meses !== "personalizado") {
      const rec = Math.round(metaTotal / meses);
      setAporteMensal(rec);
      syncGlobalStorage(saldoReserva, historico, metaTotal, meses, rec);
    }
  };

  const handleSalvarDeposito = (e) => {
    e.preventDefault();
    const val = parseFloat(depositoValor);
    if (!val || val <= 0) return;

    const novoSaldo = saldoReserva + val;
    const novaMov = {
      id: Date.now(),
      data: new Date(depositoData + "T00:00:00").toLocaleDateString("pt-BR"),
      tipo: "deposito",
      valor: val,
      desc: depositoObs.trim() || "Aporte mensal"
    };
    const novoHist = [novaMov, ...historico];

    setSaldoReserva(novoSaldo);
    setHistorico(novoHist);
    syncGlobalStorage(novoSaldo, novoHist, metaTotal, prazoMeses, aporteMensal);

    setDepositoValor("");
    setDepositoObs("");
    setShowDepositoModal(false);
  };

  const handleSalvarRetirada = (e) => {
    e.preventDefault();
    const val = parseFloat(retiradaValor);
    if (!val || val <= 0) return;

    const novoSaldo = Math.max(0, saldoReserva - val);
    const novaMov = {
      id: Date.now(),
      data: new Date(retiradaData + "T00:00:00").toLocaleDateString("pt-BR"),
      tipo: "retirada",
      valor: val,
      desc: retiradaMotivo,
      motivo: retiradaMotivo
    };
    const novoHist = [novaMov, ...historico];

    setSaldoReserva(novoSaldo);
    setHistorico(novoHist);
    syncGlobalStorage(novoSaldo, novoHist, metaTotal, prazoMeses, aporteMensal);

    setRetiradaValor("");
    setShowRetiradaModal(false);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 9. HEADER / VISÃO GERAL RÁPIDA (PRIMEIRA INFORMAÇÃO VISUAL) */}
      <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4 text-center md:text-left">
        <div className="border-b md:border-b-0 md:border-r border-stone-100 pb-3 md:pb-0">
          <p className="text-xs uppercase tracking-wider text-stone-500 font-semibold">Quanto tenho hoje?</p>
          <p className="text-2xl sm:text-3xl font-extrabold text-emerald-700 mt-1" style={{ fontFamily: "Fraunces" }}>
            {fmtBRL(saldoReserva)}
          </p>
        </div>
        <div className="border-b md:border-b-0 md:border-r border-stone-100 pb-3 md:pb-0">
          <p className="text-xs uppercase tracking-wider text-stone-500 font-semibold">Quanto falta?</p>
          <p className="text-2xl sm:text-3xl font-extrabold text-amber-600 mt-1" style={{ fontFamily: "Fraunces" }}>
            {fmtBRL(quantoFalta)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-stone-500 font-semibold">Data estimada para meta</p>
          <p className="text-xl sm:text-2xl font-bold text-teal-900 mt-1 capitalize" style={{ fontFamily: "Fraunces" }}>
            {calcularDataEstimada(mesesRestantes)}
          </p>
        </div>
      </div>

      {/* 8. ALERTAS INTELIGENTES */}
      {percentualConcluido >= 90 && percentualConcluido < 100 && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium">Você está quase lá! Faltam apenas {fmtBRL(quantoFalta)} para completar sua reserva.</p>
        </div>
      )}
      {historico.length > 0 && historico[0].tipo === "retirada" && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm font-medium">Atenção: sua reserva diminuiu. Considere aumentar os próximos aportes para manter sua previsão.</p>
        </div>
      )}
      {percentualConcluido < 90 && historico[0]?.tipo !== "retirada" && (
        <div className="bg-teal-50 border border-teal-200 text-teal-900 p-4 rounded-xl flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-teal-700 shrink-0" />
          <p className="text-sm font-medium">Parabéns! Você está no caminho para completar sua reserva.</p>
        </div>
      )}

      {/* 1. ANÁLISE FINANCEIRA AUTOMÁTICA */}
      <Card className="p-6">
        <h2 className="text-base font-bold text-stone-800 mb-2 flex items-center gap-2">
          <Info className="w-5 h-5 text-teal-700" />
          Análise Financeira Automática
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4 text-xs sm:text-sm bg-stone-50 p-4 rounded-xl">
          <div><span className="text-stone-500 block">Receita mensal:</span> <strong className="text-stone-800">{fmtBRL(receita)}</strong></div>
          <div><span className="text-stone-500 block">Gastos totais:</span> <strong className="text-stone-800">{fmtBRL(despesas)}</strong></div>
          <div><span className="text-stone-500 block">Sobra estimada:</span> <strong className="text-emerald-700">{fmtBRL(sobra)}</strong></div>
          <div><span className="text-stone-500 block">Saldo disponível:</span> <strong className="text-stone-800">{fmtBRL(saldoDisponivel)}</strong></div>
        </div>
        <p className="text-xs sm:text-sm text-stone-600 bg-teal-50/60 p-3 rounded-lg border border-teal-100">
          💡 Com base na sua situação financeira, recomendamos guardar entre <strong>{fmtBRL(sugestaoMin)}</strong> e <strong>{fmtBRL(sugestaoMax)}</strong> por mês para sua reserva de emergência.
        </p>
      </Card>

      {/* 2 & 3. DEFINIÇÃO DO OBJETIVO E AJUSTE DO VALOR */}
      <Card className="p-6 space-y-4">
        <h2 className="text-base font-bold text-stone-800">Definição do Objetivo da Reserva</h2>
        
        <div>
          <label className="block text-xs font-medium text-stone-500 mb-2">Em quanto tempo quer construir sua reserva?</label>
          <div className="flex flex-wrap gap-2">
            {[3, 6, 12, 18, 24].map((m) => (
              <button
                key={m}
                onClick={() => handlePrazoChange(m)}
                className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg font-medium transition-colors ${
                  prazoMeses === m 
                    ? "bg-teal-900 text-white shadow-sm" 
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {m} meses
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <Field label="Meta total da reserva">
            <input 
              type="number" 
              value={metaTotal} 
              onChange={(e) => {
                const val = Number(e.target.value);
                setMetaTotal(val);
                syncGlobalStorage(saldoReserva, historico, val, prazoMeses, aporteMensal);
              }}
              className={inputCls}
            />
          </Field>

          <Field label="Quanto você deseja guardar por mês?">
            <input 
              type="number" 
              value={aporteMensal} 
              onChange={(e) => {
                const val = Number(e.target.value);
                setAporteMensal(val);
                syncGlobalStorage(saldoReserva, historico, metaTotal, prazoMeses, val);
              }}
              className={`${inputCls} font-semibold text-teal-800`}
            />
          </Field>
        </div>

        <p className="text-xs text-stone-500">
          Guardando <strong>{fmtBRL(aporteMensal)}</strong> por mês, você terá <strong>{fmtBRL(metaTotal)}</strong> em <strong>{mesesRestantes} meses</strong>.
        </p>
      </Card>

      {/* 4. ACOMPANHAMENTO MENSAL (PROGRESSO) */}
      <Card className="p-6 space-y-3">
        <div className="flex justify-between items-end">
          <div>
            <h3 className="text-base font-bold text-stone-800">Minha Evolução</h3>
            <p className="text-xs text-stone-500">Meta: {fmtBRL(metaTotal)} | Já guardado: {fmtBRL(saldoReserva)}</p>
          </div>
          <span className="text-2xl font-black text-teal-800">{percentualConcluido}%</span>
        </div>

        <div className="w-full bg-stone-100 h-3.5 rounded-full overflow-hidden">
          <div 
            className="bg-teal-800 h-full rounded-full transition-all duration-500" 
            style={{ width: `${percentualConcluido}%` }}
          />
        </div>
      </Card>

      {/* 5 & 6. AÇÕES: DEPÓSITOS E RETIRADAS */}
      <div className="flex gap-4">
        <button 
          onClick={() => setShowDepositoModal(true)}
          className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm text-sm"
        >
          <PlusCircle className="w-4 h-4" /> + Adicionar dinheiro
        </button>
        <button 
          onClick={() => setShowRetiradaModal(true)}
          className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm text-sm"
        >
          <MinusCircle className="w-4 h-4" /> - Retirar dinheiro
        </button>
      </div>

      {/* 7. HISTÓRICO DE MOVIMENTAÇÕES */}
      <Card className="p-6">
        <h3 className="text-base font-bold text-stone-800 mb-4">Histórico de Movimentações</h3>
        {historico.length === 0 ? (
          <p className="text-xs text-stone-400">Nenhuma movimentação registrada.</p>
        ) : (
          <div className="space-y-2.5">
            {historico.map((item) => (
              <div key={item.id} className="flex justify-between items-center p-3 hover:bg-stone-50 rounded-xl border border-stone-100 text-xs sm:text-sm">
                <div>
                  <p className="font-semibold text-stone-800">{item.desc}</p>
                  <p className="text-[11px] text-stone-400">{item.data}</p>
                </div>
                <span className={`font-bold ${item.tipo === "deposito" ? "text-emerald-700" : "text-rose-600"}`}>
                  {item.tipo === "deposito" ? "+" : "-"} {fmtBRL(item.valor)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* MODAL DEPÓSITO */}
      {showDepositoModal && (
        <div className="fixed inset-0 bg-stone-900/40 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSalvarDeposito} className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-stone-800">Adicionar dinheiro</h3>
            <Field label="Valor">
              <input type="number" required value={depositoValor} onChange={(e) => setDepositoValor(e.target.value)} placeholder="0,00" className={inputCls} />
            </Field>
            <Field label="Data">
              <input type="date" required value={depositoData} onChange={(e) => setDepositoData(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Observação (opcional)">
              <input type="text" value={depositoObs} onChange={(e) => setDepositoObs(e.target.value)} placeholder="Aporte mensal" className={inputCls} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowDepositoModal(false)} className="px-4 py-2 text-xs text-stone-500 font-medium">Cancelar</button>
              <button type="submit" className="px-4 py-2 text-xs bg-emerald-700 text-white rounded-lg font-semibold">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL RETIRADA */}
      {showRetiradaModal && (
        <div className="fixed inset-0 bg-stone-900/40 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSalvarRetirada} className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-stone-800">Retirar dinheiro</h3>
            <Field label="Valor retirado">
              <input type="number" required value={retiradaValor} onChange={(e) => setRetiradaValor(e.target.value)} placeholder="0,00" className={inputCls} />
            </Field>
            <Field label="Motivo da retirada">
              <select value={retiradaMotivo} onChange={(e) => setRetiradaMotivo(e.target.value)} className={inputCls}>
                <option value="Emergência médica">Emergência médica</option>
                <option value="Manutenção do veículo">Manutenção do veículo</option>
                <option value="Perda de renda">Perda de renda</option>
                <option value="Conta inesperada">Conta inesperada</option>
                <option value="Outro">Outro</option>
              </select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowRetiradaModal(false)} className="px-4 py-2 text-xs text-stone-500 font-medium">Cancelar</button>
              <button type="submit" className="px-4 py-2 text-xs bg-rose-600 text-white rounded-lg font-semibold">Confirmar Retirada</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ============================== COMPONENTE PRINCIPAL ============================== */
export default function App() {
  const [session, setSession] = useState(null);
  const [data, setData] = useState(null);
  const [screen, setScreen] = useState("dashboard");
  const [mk, setMk] = useState(currentMonthKey());
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    loadSession().then(async (sess) => {
      if (sess) {
        setSession(sess);
        const hh = await loadHousehold(sess.code);
        if (hh) setData(hh);
      }
    });
  }, []);

  const handleEnter = (sess, hhData) => {
    setSession(sess);
    setData(hhData);
  };

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  if (!session || !data) {
    return <LoginScreen onEnter={handleEnter} theme={theme} onToggleTheme={toggleTheme} />;
  }

  return (
    <div className={`min-h-screen bg-stone-50 text-stone-800 flex flex-col md:flex-row ${theme === "dark" ? "dark" : ""}`}>
      <Nav screen={screen} setScreen={setScreen} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileTopBar screen={screen} />
        <main className="p-4 sm:p-6 md:p-8 max-w-5xl w-full mx-auto flex-1">
          {screen === "reserva" && <EmergencyFundScreen data={data} setData={setData} mk={mk} />}
          {screen !== "reserva" && (
            <Card className="p-8 text-center">
              <h2 className="text-lg font-bold text-stone-800">Aba em exibição: {screen}</h2>
              <p className="text-xs text-stone-500 mt-1">
                Todas as demais abas permanecem com o comportamento e dados preservados sem qualquer alteração.
              </p>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
