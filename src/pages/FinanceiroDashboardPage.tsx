/**
 * FinanceiroDashboardPage — Dashboard financeiro unificado.
 * Fonte de verdade: agenda (appointmentsStore). Despesas: expensesStore.
 * Realizado vs Projeção nunca se misturam.
 */
import { useState, useMemo } from "react";
import { format, parseISO, subDays, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocation } from "wouter";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Users, Scissors,
  AlertCircle, AlertTriangle, CheckCircle, Info, ChevronRight,
  Calendar, Clock,
} from "lucide-react";
import { appointmentsStore, employeesStore, expensesStore } from "@/lib/store";
import {
  calcPeriodStats, calcRevenueByDay, calcRevenueByEmployee,
  calcTopClients, calcConversionRate, calcMostProfitableServices,
  calcWeeklyRevenue, calcInactiveClients, getPeriodDates,
  getAppointmentsInPeriod, toNum,
} from "@/lib/analytics";
import { Button } from "@/components/ui/button";

function getAccent() {
  try { return JSON.parse(localStorage.getItem("salon_config") || "{}").accentColor || "#ec4899"; }
  catch { return "#ec4899"; }
}
function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

type PeriodKey = "hoje" | "semana" | "mes" | "trimestre" | "ano";

const PERIOD_TABS: { value: PeriodKey; label: string }[] = [
  { value: "hoje",      label: "Hoje"    },
  { value: "semana",    label: "Semana"  },
  { value: "mes",       label: "Mês"     },
  { value: "trimestre", label: "90 dias" },
  { value: "ano",       label: "Ano"     },
];

export default function FinanceiroDashboardPage() {
  const accent = getAccent();
  const [, setLocation] = useLocation();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>("mes");
  const [showInactive, setShowInactive] = useState(false);

  const allAppts   = useMemo(() => appointmentsStore.list({}), []);
  const employees  = useMemo(() => employeesStore.list(true), []);
  const allExpenses = useMemo(() => expensesStore.list(), []);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // ── KPIs dos 5 períodos simultâneos ──────────────────────
  const multiPeriodStats = useMemo(() => {
    return PERIOD_TABS.map(({ value, label }) => {
      const { start, end } = getPeriodDates(value as any);
      const appts = allAppts.filter(a => {
        try {
          const d = parseISO(a.startTime);
          return d >= start && d <= end && d <= now && toNum(a.totalPrice) > 0;
        } catch { return false; }
      });
      const revenue = appts.reduce((s, a) => s + toNum(a.totalPrice), 0);
      const count   = appts.length;
      return { period: value, label, revenue, count, avgTicket: count > 0 ? revenue / count : 0 };
    });
  }, [allAppts]);

  // ── Breakdown do período selecionado ─────────────────────
  const { start: pStart, end: pEnd } = useMemo(
    () => getPeriodDates(selectedPeriod as any),
    [selectedPeriod]
  );

  const periodAppts = useMemo(
    () => allAppts.filter(a => {
      try {
        const d = parseISO(a.startTime);
        return d >= pStart && d <= pEnd && d <= now && toNum(a.totalPrice) > 0;
      } catch { return false; }
    }),
    [pStart, pEnd, allAppts]
  );

  const pStats = useMemo(
    () => calcPeriodStats(periodAppts, employees),
    [periodAppts, employees]
  );

  const periodExpenses = useMemo(() => {
    const s = pStart.toISOString().slice(0, 10);
    const e = pEnd.toISOString().slice(0, 10);
    return allExpenses.filter(ex => ex.date >= s && ex.date <= e && ex.status === "paga");
  }, [allExpenses, pStart, pEnd]);

  const totalExpenses  = periodExpenses.reduce((s, e) => s + e.amount, 0);
  const lucroReal      = pStats.totalRevenue - pStats.totalMaterial - pStats.totalCommissions - totalExpenses;
  const margem         = pStats.totalRevenue > 0 ? (lucroReal / pStats.totalRevenue) * 100 : 0;

  // ── Gráficos ─────────────────────────────────────────────
  const pastAppts = useMemo(() =>
    allAppts.filter(a => {
      try { return parseISO(a.startTime) <= now && toNum(a.totalPrice) > 0; }
      catch { return false; }
    }), [allAppts]);

  const revenueByDay    = useMemo(() => calcRevenueByDay(pastAppts, 30), [pastAppts]);
  const revenueByEmp    = useMemo(() => calcRevenueByEmployee(periodAppts, employees), [periodAppts, employees]);
  const topClients      = useMemo(() => calcTopClients(periodAppts, 10), [periodAppts]);
  const profitServices  = useMemo(() => calcMostProfitableServices(pastAppts).slice(0, 8), [pastAppts]);

  // ── Projeção ─────────────────────────────────────────────
  const convRate = useMemo(() => calcConversionRate(pastAppts), [pastAppts]);

  const futureAppts = useMemo(() => allAppts.filter(a =>
    ["scheduled", "confirmed"].includes(a.status) && parseISO(a.startTime) > now
  ), [allAppts]);

  const projection = useMemo(() => {
    const thisWeekEnd = new Date(now.getTime() + 7 * 86400000);
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const next90 = new Date(now.getTime() + 90 * 86400000);

    const sumFuture = (end: Date) =>
      futureAppts
        .filter(a => parseISO(a.startTime) <= end)
        .reduce((s, a) => s + toNum(a.totalPrice), 0);

    return {
      week:    sumFuture(thisWeekEnd),
      month:   sumFuture(thisMonthEnd),
      next90:  sumFuture(next90),
      weekAdj: sumFuture(thisWeekEnd) * convRate,
      monthAdj:sumFuture(thisMonthEnd) * convRate,
      count:   futureAppts.length,
    };
  }, [futureAppts, convRate]);

  // ── Alertas ───────────────────────────────────────────────
  const inactiveClients = useMemo(() => calcInactiveClients(pastAppts, 70), [pastAppts]);

  const overdueExpenses = useMemo(() =>
    allExpenses.filter(e => e.status === "pendente" && e.date < todayStr),
  [allExpenses]);

  const pendingCommissions = useMemo(() => {
    // verifica commissionClosingsStore via import direto
    try {
      const { commissionClosingsStore } = require("@/lib/store");
      return commissionClosingsStore.list().filter((c: any) => c.status === "pendente");
    } catch { return []; }
  }, []);

  // Comparativo semana atual vs média das 4 anteriores
  const weeklyData  = useMemo(() => calcWeeklyRevenue(allAppts, 5), [allAppts]);
  const thisWeekRev = weeklyData[weeklyData.length - 1]?.revenue ?? 0;
  const prevAvg     = weeklyData.slice(0, 4).reduce((s, w) => s + w.revenue, 0) / 4;
  const weekVsPrev  = prevAvg > 0 ? ((thisWeekRev - prevAvg) / prevAvg) * 100 : 0;

  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(20px)",
    borderRadius: 16,
    padding: 20,
  };

  const projStyle: React.CSSProperties = {
    background: "rgba(245,158,11,0.06)",
    border: "1px solid rgba(245,158,11,0.15)",
    backdropFilter: "blur(20px)",
    borderRadius: 16,
    padding: 20,
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <TrendingUp className="w-5 h-5" style={{ color: accent }} />
          Painel Financeiro
        </h2>
        <p className="text-sm text-muted-foreground">Baseado nos agendamentos concluídos</p>
      </div>

      {/* ── Alertas proativos ── */}
      <div className="space-y-2">
        {weekVsPrev >= 10 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
            <TrendingUp className="w-4 h-4 text-green-400 flex-shrink-0" />
            <p className="text-sm text-green-400">
              Semana atual {fmtPct(weekVsPrev)} acima da média das 4 semanas anteriores 🎉
            </p>
          </div>
        )}
        {inactiveClients.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl cursor-pointer"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
            onClick={() => setShowInactive(v => !v)}>
            <div className="flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">
                {inactiveClients.length} cliente(s) sem visita há mais de 70 dias
              </p>
            </div>
            <ChevronRight className={`w-4 h-4 text-red-400 transition-transform ${showInactive ? "rotate-90" : ""}`} />
          </div>
        )}
        {showInactive && inactiveClients.length > 0 && (
          <div style={{ ...cardStyle, borderColor: "rgba(239,68,68,0.15)" }} className="space-y-1.5">
            {inactiveClients.slice(0, 10).map((c, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span>{c.clientName}</span>
                <span className="text-red-400 text-xs">{c.daysSince} dias sem visita</span>
              </div>
            ))}
          </div>
        )}
        {overdueExpenses.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
            onClick={() => setLocation("/despesas")}>
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-400">
              {overdueExpenses.length} despesa(s) atrasada(s) · {fmt(overdueExpenses.reduce((s, e) => s + e.amount, 0))} em aberto
            </p>
            <ChevronRight className="w-4 h-4 text-red-400 ml-auto" />
          </div>
        )}
      </div>

      {/* ── REALIZADO — 5 períodos simultâneos ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="w-4 h-4 text-green-400" />
          <span className="text-sm font-semibold text-green-400 uppercase tracking-wider">Realizado</span>
        </div>
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3" style={{ minWidth: "max-content" }}>
            {multiPeriodStats.map(({ period, label, revenue, count, avgTicket }) => (
              <div key={period}
                className={`cursor-pointer transition-all ${selectedPeriod === period ? "ring-2" : ""}`}
                style={{
                  ...cardStyle,
                  minWidth: 160,
                  ...(selectedPeriod === period ? {
                    border: `1px solid ${accent}50`,
                    boxShadow: `0 0 20px ${accent}20`,
                  } : {}),
                }}
                onClick={() => setSelectedPeriod(period as PeriodKey)}>
                <p className="text-xs text-muted-foreground mb-2">{label}</p>
                <p className="text-lg font-bold">{fmt(revenue)}</p>
                <p className="text-xs text-muted-foreground mt-1">{count} atend. · ticket {fmt(avgTicket)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Breakdown financeiro do período selecionado ── */}
      <div style={cardStyle}>
        <p className="text-sm font-semibold mb-4">
          Lucro real — {PERIOD_TABS.find(t => t.value === selectedPeriod)?.label}
        </p>
        <div className="space-y-2">
          {[
            { label: "Faturamento bruto",    value:  pStats.totalRevenue,    color: "text-foreground", sign: "" },
            { label: "- Custo de materiais", value: -pStats.totalMaterial,   color: "text-yellow-400", sign: "−" },
            { label: "- Comissões",          value: -pStats.totalCommissions,color: "text-orange-400", sign: "−" },
            { label: "- Despesas pagas",     value: -totalExpenses,          color: "text-red-400",    sign: "−" },
          ].map(({ label, value, color, sign }) => (
            <div key={label} className="flex items-center justify-between py-1.5 border-b border-white/5">
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className={`text-sm font-medium ${color}`}>
                {value < 0 ? `- ${fmt(Math.abs(value))}` : fmt(value)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-3">
            <span className="font-bold">= Lucro real</span>
            <span className={`text-xl font-bold ${lucroReal >= 0 ? "text-green-400" : "text-red-400"}`}>
              {fmt(lucroReal)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Margem de lucro</span>
            <span className={`text-sm font-medium ${margem >= 0 ? "text-green-400" : "text-red-400"}`}>
              {margem.toFixed(1)}%
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Despesas do período: <span className="font-medium">{PERIOD_TABS.find(t => t.value === selectedPeriod)?.label}</span>
            </p>
            <button className="text-xs underline" style={{ color: accent }} onClick={() => setLocation("/despesas")}>
              Gerenciar →
            </button>
          </div>
          {totalExpenses === 0 && (
            <div className="mt-2 p-3 rounded-lg flex items-center gap-2"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <Info className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                Sem despesas pagas neste período.{" "}
                <button className="underline" style={{ color: accent }} onClick={() => setLocation("/despesas")}>
                  Cadastrar despesas →
                </button>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Gráfico de faturamento por dia ── */}
      <div style={cardStyle}>
        <p className="text-sm font-semibold mb-4">Faturamento diário — últimos 30 dias</p>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={revenueByDay}>
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} interval={4} />
            <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(v: number) => [fmt(v), "Faturamento"]}
              contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
            />
            <Line type="monotone" dataKey="revenue" stroke={accent} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Por funcionário ── */}
      {revenueByEmp.length > 0 && (
        <div style={cardStyle}>
          <p className="text-sm font-semibold mb-4">Por profissional — {PERIOD_TABS.find(t => t.value === selectedPeriod)?.label}</p>
          <div className="space-y-3">
            {revenueByEmp.map(emp => (
              <div key={emp.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: emp.color }} />
                    <span className="text-sm font-medium">{emp.firstName}</span>
                    <span className="text-xs text-muted-foreground">{emp.count} atend.</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold">{fmt(emp.revenue)}</span>
                    <span className="text-xs text-muted-foreground ml-2">comissão {fmt(emp.commission)}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${revenueByEmp[0].revenue > 0 ? (emp.revenue / revenueByEmp[0].revenue) * 100 : 0}%`,
                      background: emp.color,
                    }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Serviços mais lucrativos ── */}
      {profitServices.length > 0 && (
        <div style={cardStyle}>
          <p className="text-sm font-semibold mb-4">Serviços mais lucrativos</p>
          <div className="space-y-2">
            {profitServices.map((svc, i) => (
              <div key={svc.serviceId} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: svc.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{svc.name}</p>
                  <p className="text-xs text-muted-foreground">{svc.count}x · {fmt(svc.revenue)}</p>
                </div>
                <span className="text-sm font-bold text-green-400">{svc.margin.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top clientes ── */}
      {topClients.length > 0 && (
        <div style={cardStyle}>
          <p className="text-sm font-semibold mb-4">
            Clientes que mais gastaram — {PERIOD_TABS.find(t => t.value === selectedPeriod)?.label}
          </p>
          <div className="space-y-2">
            {topClients.map((c, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: `${accent}20`, color: accent }}>
                  {c.clientName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.clientName}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.visitCount} visita(s) · ticket {fmt(c.avgTicket)}
                  </p>
                </div>
                <span className="font-bold text-sm">{fmt(c.totalSpent)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PROJEÇÃO ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-amber-400 uppercase tracking-wider">Projeção</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400">Apenas agendamentos futuros</span>
        </div>
        <div style={projStyle}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {[
              { label: "Esta semana",  raw: projection.week,   adj: projection.weekAdj  },
              { label: "Este mês",     raw: projection.month,  adj: projection.monthAdj },
              { label: "Próx. 90 dias",raw: projection.next90, adj: projection.next90 * convRate },
            ].map(({ label, raw, adj }) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className="text-lg font-bold text-amber-400">{fmt(adj)}</p>
                <p className="text-xs text-muted-foreground">bruto {fmt(raw)}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg"
            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.12)" }}>
            <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-400/80">
              Fator de conversão aplicado: <strong>{(convRate * 100).toFixed(0)}%</strong> baseado no histórico real dos últimos 90 dias
              ({futureAppts.length} agendamentos futuros · {projection.count} agend.)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
