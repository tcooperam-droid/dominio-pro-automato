/**
 * FinanceiroDashboardPage — Dashboard financeiro unificado.
 * Fonte de verdade: agenda (appointmentsStore). Despesas: expensesStore.
 * Realizado vs Projeção nunca se misturam.
 */
import { useState, useMemo } from "react";
import { format, parseISO, subDays } from "date-fns";
import { useLocation } from "wouter";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import {
  TrendingUp, DollarSign, Scissors,
  AlertCircle, AlertTriangle, CheckCircle, ChevronRight,
} from "lucide-react";
import { appointmentsStore, employeesStore, expensesStore } from "@/lib/store";
import {
  calcPeriodStats, calcRevenueByDay, calcRevenueByEmployee,
  calcTopClients, calcConversionRate, calcMostProfitableServices,
  calcWeeklyRevenue, calcInactiveClients, getPeriodDates,
  toNum, isFinancialAppointment,
} from "@/lib/analytics";

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
          return d >= start && d <= end && d <= now && isFinancialAppointment(a);
        } catch { return false; }
      });
      const revenue = appts.reduce((s, a) => s + toNum(a.totalPrice), 0);
      const count   = appts.length;
      return { period: value, label, revenue, count, avgTicket: count > 0 ? revenue / count : 0 };
    });
  }, [allAppts, now]);

  // ── Breakdown do período selecionado ─────────────────────
  const { start: pStart, end: pEnd } = useMemo(
    () => getPeriodDates(selectedPeriod as any),
    [selectedPeriod]
  );

  const periodAppts = useMemo(
    () => allAppts.filter(a => {
      try {
        const d = parseISO(a.startTime);
        return d >= pStart && d <= pEnd && d <= now && isFinancialAppointment(a);
      } catch { return false; }
    }),
    [pStart, pEnd, allAppts, now]
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
      try { return parseISO(a.startTime) <= now && isFinancialAppointment(a); }
      catch { return false; }
    }), [allAppts, now]);

  const revenueByDay    = useMemo(() => calcRevenueByDay(pastAppts, 30), [pastAppts]);
  const revenueByEmp    = useMemo(() => calcRevenueByEmployee(periodAppts, employees), [periodAppts, employees]);
  const topClients      = useMemo(() => calcTopClients(periodAppts, 10), [periodAppts]);
  const profitServices  = useMemo(() => calcMostProfitableServices(pastAppts).slice(0, 8), [pastAppts]);

  // ── Projeção ─────────────────────────────────────────────
  const convRate = useMemo(() => calcConversionRate(pastAppts), [pastAppts]);

  const futureAppts = useMemo(() => allAppts.filter(a =>
    ["scheduled", "confirmed"].includes(a.status) && parseISO(a.startTime) > now
  ), [allAppts, now]);

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
  }, [futureAppts, convRate, now]);

  // ── Alertas ───────────────────────────────────────────────
  const inactiveClients = useMemo(() => calcInactiveClients(pastAppts, 70), [pastAppts]);

  const overdueExpenses = useMemo(() =>
    allExpenses.filter(e => e.status === "pendente" && e.date < todayStr),
  [allExpenses, todayStr]);

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
        <p className="text-sm text-muted-foreground">Baseado nos agendamentos da agenda</p>
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
                    background: `${accent}08`,
                  } : {})
                }}
                onClick={() => setSelectedPeriod(period)}>
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className="text-lg font-bold" style={{ color: selectedPeriod === period ? accent : "inherit" }}>{fmt(revenue)}</p>
                <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                  <span>{count} atend.</span>
                  <span>T.M. {fmt(avgTicket)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Breakdown do Período ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna Esquerda: Cards e Gráfico Principal */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div style={cardStyle}>
              <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                <DollarSign className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Líquido (Faturamento - Comissões)</span>
              </div>
              <p className="text-2xl font-bold" style={{ color: accent }}>{fmt(pStats.netRevenue)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Faturamento bruto: {fmt(pStats.totalRevenue)}</p>
            </div>
            <div style={cardStyle}>
              <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Lucro Real (Líquido - Despesas)</span>
              </div>
              <p className="text-2xl font-bold text-emerald-400">{fmt(lucroReal)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Margem: {margem.toFixed(1)}%</p>
            </div>
            <div style={cardStyle}>
              <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                <Scissors className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Custo de Material</span>
              </div>
              <p className="text-2xl font-bold text-cyan-400">{fmt(pStats.totalMaterial)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Dedução direta do faturamento</p>
            </div>
          </div>

          {/* Gráfico de Faturamento 30 dias */}
          <div style={cardStyle}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Faturamento (Últimos 30 dias)</h3>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: accent }} />
                <span className="text-[10px] text-muted-foreground">Receita diária</span>
              </div>
            </div>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueByDay}>
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
                    formatter={(v: any) => [fmt(v), "Faturamento"]}
                  />
                  <Line type="monotone" dataKey="revenue" stroke={accent} strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Ranking de Funcionários */}
          <div style={cardStyle}>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Ranking por Profissional</h3>
            <div className="space-y-4">
              {revenueByEmp.map((emp, i) => (
                <div key={emp.id} className="flex items-center gap-4">
                  <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}°</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold">{emp.name}</span>
                      <span className="text-sm font-bold">{fmt(emp.revenue)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full"
                        style={{
                          width: `${(emp.revenue / (revenueByEmp[0]?.revenue || 1)) * 100}%`,
                          backgroundColor: emp.color
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Coluna Direita: Projeção e Top Clientes */}
        <div className="space-y-6">
          {/* Projeção */}
          <div style={projStyle}>
            <div className="flex items-center gap-2 mb-4 text-amber-400">
              <TrendingUp className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">Projeção de Faturamento</h3>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-amber-400/60 uppercase font-bold">Próximos 7 dias</p>
                <p className="text-2xl font-bold text-amber-400">{fmt(projection.week)}</p>
                <p className="text-[10px] text-amber-400/60">Ajustado (histórico): {fmt(projection.weekAdj)}</p>
              </div>
              <div>
                <p className="text-[10px] text-amber-400/60 uppercase font-bold">Até fim do mês</p>
                <p className="text-xl font-bold text-amber-400">{fmt(projection.month)}</p>
              </div>
              <div className="pt-3 border-t border-amber-400/10">
                <p className="text-[10px] text-amber-400/60">Taxa de conversão: {(convRate * 100).toFixed(0)}%</p>
                <p className="text-[10px] text-amber-400/60">{projection.count} agendamentos futuros</p>
              </div>
            </div>
          </div>

          {/* Top Clientes */}
          <div style={cardStyle}>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Top 10 Clientes</h3>
            <div className="space-y-3">
              {topClients.map((c, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.clientName}</p>
                    <p className="text-[10px] text-muted-foreground">{c.visitCount} visitas</p>
                  </div>
                  <p className="text-sm font-bold text-primary">{fmt(c.totalSpent)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Serviços Rentáveis */}
          <div style={cardStyle}>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Serviços Lucrativos</h3>
            <div className="space-y-3">
              {profitServices.map((s, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground truncate flex-1 pr-2">{s.name}</span>
                  <span className="text-xs font-bold text-emerald-400">{s.margin.toFixed(0)}% margem</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
        }
