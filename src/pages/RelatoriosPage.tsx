/**
 * RelatoriosPage — Relatórios completos + comparativo de períodos + despesas.
 * Fonte de verdade: agendamentos (100%). Despesas: expensesStore.
 * Caixa não é usado em nenhum cálculo.
 */
import { useState, useMemo } from "react";
import { format, subDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  TrendingUp, Users, DollarSign, Award, Calendar,
  Scissors, Percent, X, ChevronRight, Receipt,
  ArrowUpCircle, ArrowDownCircle, Minus,
} from "lucide-react";
import { appointmentsStore, employeesStore, expensesStore } from "@/lib/store";
import {
  calcPeriodStats, calcRevenueByDay, calcRevenueByEmployee,
  calcPopularServices, calcMostProfitableServices,
  getAppointmentsInPeriod, getPeriodDates,
  toNum, type Period,
} from "@/lib/analytics";

const tooltipStyle = {
  backgroundColor: "hsl(240 6% 10%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8, color: "#fff", fontSize: 12,
};
const tickStyle = { fontSize: 11, fill: "hsl(0 0% 55%)" };

const PERIODS: { key: Period; label: string }[] = [
  { key: "hoje",      label: "Hoje"    },
  { key: "semana",    label: "Semana"  },
  { key: "mes",       label: "Mês"     },
  { key: "trimestre", label: "90 dias" },
  { key: "ano",       label: "Ano"     },
  { key: "custom",    label: "Custom"  },
];

const EXPENSE_CATEGORIES: Record<string, { label: string; color: string }> = {
  aluguel:    { label: "Aluguel",     color: "#f97316" },
  energia:    { label: "Energia",     color: "#eab308" },
  agua:       { label: "Água",        color: "#06b6d4" },
  internet:   { label: "Internet",    color: "#6366f1" },
  produtos:   { label: "Produtos",    color: "#ec4899" },
  manutencao: { label: "Manutenção",  color: "#f59e0b" },
  marketing:  { label: "Marketing",   color: "#8b5cf6" },
  taxas:      { label: "Taxas",       color: "#ef4444" },
  salarios:   { label: "Salários",    color: "#10b981" },
  impostos:   { label: "Impostos",    color: "#dc2626" },
  estoque:    { label: "Estoque",     color: "#0ea5e9" },
  outras:     { label: "Outras",      color: "#6b7280" },
};

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getAccent() {
  try { return JSON.parse(localStorage.getItem("salon_config") || "{}").accentColor || "#ec4899"; }
  catch { return "#ec4899"; }
}

// ─── Sub-componente: Comparativo de Períodos ──────────────
function ComparativoPeriodos() {
  const accent = getAccent();
  const employees = useMemo(() => employeesStore.list(false), []);
  const now = new Date();

  const [periodA, setPeriodA] = useState<Period>("mes");
  const [periodB, setPeriodB] = useState<Period>("trimestre");
  const [customAStart, setCustomAStart] = useState(format(subDays(now, 30), "yyyy-MM-dd"));
  const [customAEnd, setCustomAEnd]     = useState(format(now, "yyyy-MM-dd"));
  const [customBStart, setCustomBStart] = useState(format(subDays(now, 60), "yyyy-MM-dd"));
  const [customBEnd, setCustomBEnd]     = useState(format(subDays(now, 31), "yyyy-MM-dd"));

  const { start: startA, end: endA, label: labelA } = getPeriodDates(periodA, customAStart, customAEnd);
  const { start: startB, end: endB, label: labelB } = getPeriodDates(periodB, customBStart, customBEnd);

  const apptsA = useMemo(() =>
    getAppointmentsInPeriod(startA, endA).filter(a => parseISO(a.startTime) <= now && (a.totalPrice ?? 0) > 0),
    [startA, endA]);
  const apptsB = useMemo(() =>
    getAppointmentsInPeriod(startB, endB).filter(a => parseISO(a.startTime) <= now && (a.totalPrice ?? 0) > 0),
    [startB, endB]);

  const statsA = useMemo(() => calcPeriodStats(apptsA, employees), [apptsA, employees]);
  const statsB = useMemo(() => calcPeriodStats(apptsB, employees), [apptsB, employees]);

  // Despesas por período
  const allExpenses = useMemo(() => expensesStore.list(), []);
  const expA = allExpenses.filter(e =>
    e.date >= startA.toISOString().slice(0, 10) &&
    e.date <= endA.toISOString().slice(0, 10) && e.status === "paga"
  ).reduce((s, e) => s + e.amount, 0);
  const expB = allExpenses.filter(e =>
    e.date >= startB.toISOString().slice(0, 10) &&
    e.date <= endB.toISOString().slice(0, 10) && e.status === "paga"
  ).reduce((s, e) => s + e.amount, 0);

  const lucroA = statsA.totalRevenue - statsA.totalMaterial - statsA.totalCommissions - expA;
  const lucroB = statsB.totalRevenue - statsB.totalMaterial - statsB.totalCommissions - expB;

  const metrics = [
    { label: "Faturamento",   a: statsA.totalRevenue,     b: statsB.totalRevenue,     isCurrency: true  },
    { label: "Atendimentos",  a: statsA.count,            b: statsB.count,            isCurrency: false },
    { label: "Ticket médio",  a: statsA.avgTicket,        b: statsB.avgTicket,        isCurrency: true  },
    { label: "Comissões",     a: statsA.totalCommissions, b: statsB.totalCommissions, isCurrency: true  },
    { label: "Despesas",      a: expA,                    b: expB,                    isCurrency: true  },
    { label: "Lucro real",    a: lucroA,                  b: lucroB,                  isCurrency: true  },
  ];

  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(20px)",
    borderRadius: 16,
    padding: 20,
  };

  return (
    <div style={cardStyle} className="space-y-4">
      <p className="text-sm font-semibold">Comparativo de Períodos</p>

      {/* Seletores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { id: "A", period: periodA, setPeriod: setPeriodA, label: labelA,
            customStart: customAStart, setCustomStart: setCustomAStart,
            customEnd: customAEnd, setCustomEnd: setCustomAEnd },
          { id: "B", period: periodB, setPeriod: setPeriodB, label: labelB,
            customStart: customBStart, setCustomStart: setCustomBStart,
            customEnd: customBEnd, setCustomEnd: setCustomBEnd },
        ].map(({ id, period, setPeriod, label, customStart, setCustomStart, customEnd, setCustomEnd }) => (
          <div key={id} className="p-3 rounded-xl space-y-2"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-xs font-semibold text-muted-foreground">Período {id}</p>
            <div className="flex flex-wrap gap-1.5">
              {PERIODS.map(p => (
                <button key={p.key} onClick={() => setPeriod(p.key)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all"
                  style={period === p.key ? {
                    background: `${accent}30`, color: accent, border: `1px solid ${accent}40`,
                  } : {
                    background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.45)",
                    border: "1px solid transparent",
                  }}>
                  {p.label}
                </button>
              ))}
            </div>
            {period === "custom" && (
              <div className="flex gap-2 flex-wrap">
                <div className="space-y-0.5">
                  <Label className="text-[10px]">De</Label>
                  <Input type="date" value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                    className="h-7 text-xs w-32" />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px]">Até</Label>
                  <Input type="date" value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    className="h-7 text-xs w-32" />
                </div>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabela comparativa */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/8">
              <th className="text-left text-xs text-muted-foreground pb-2 font-medium">Métrica</th>
              <th className="text-right text-xs pb-2 font-medium" style={{ color: accent }}>A</th>
              <th className="text-right text-xs text-muted-foreground pb-2 font-medium">B</th>
              <th className="text-right text-xs text-muted-foreground pb-2 font-medium">Variação</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map(({ label, a, b, isCurrency }) => {
              const diff = b > 0 ? ((a - b) / b) * 100 : 0;
              const isPositive = diff > 0;
              const isZero = Math.abs(diff) < 0.1;
              return (
                <tr key={label} className="border-b border-white/4">
                  <td className="py-2.5 text-muted-foreground">{label}</td>
                  <td className="py-2.5 text-right font-semibold">
                    {isCurrency ? fmt(a) : a}
                  </td>
                  <td className="py-2.5 text-right text-muted-foreground">
                    {isCurrency ? fmt(b) : b}
                  </td>
                  <td className="py-2.5 text-right">
                    <span className={`flex items-center justify-end gap-1 text-xs font-semibold ${
                      isZero ? "text-muted-foreground" :
                      isPositive ? "text-green-400" : "text-red-400"
                    }`}>
                      {isZero
                        ? <><Minus className="w-3 h-3" /> —</>
                        : isPositive
                          ? <><ArrowUpCircle className="w-3 h-3" /> +{diff.toFixed(1)}%</>
                          : <><ArrowDownCircle className="w-3 h-3" /> {diff.toFixed(1)}%</>
                      }
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Sub-componente: Relatório de Despesas ────────────────
function RelatorioDespesas() {
  const accent = getAccent();
  const [period, setPeriod] = useState<Period>("mes");
  const [customStart, setCustomStart] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd]     = useState(format(new Date(), "yyyy-MM-dd"));

  const { start, end, label } = getPeriodDates(period, customStart, customEnd);

  const allExpenses = useMemo(() => expensesStore.list(), []);

  const periodExpenses = useMemo(() => {
    const s = start.toISOString().slice(0, 10);
    const e = end.toISOString().slice(0, 10);
    return allExpenses.filter(ex => ex.date >= s && ex.date <= e);
  }, [allExpenses, start, end]);

  const pago    = periodExpenses.filter(e => e.status === "paga").reduce((s, e) => s + e.amount, 0);
  const pendente = periodExpenses
    .filter(e => e.status === "pendente")
    .reduce((s, e) => s + e.amount, 0);
  const total   = periodExpenses.reduce((s, e) => s + e.amount, 0);

  // Por categoria (gráfico pizza)
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    periodExpenses.forEach(e => {
      map[e.category] = (map[e.category] ?? 0) + e.amount;
    });
    return Object.entries(map)
      .map(([cat, total]) => ({
        name:  EXPENSE_CATEGORIES[cat]?.label ?? cat,
        value: total,
        color: EXPENSE_CATEGORIES[cat]?.color ?? "#6b7280",
      }))
      .sort((a, b) => b.value - a.value);
  }, [periodExpenses]);

  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(20px)",
    borderRadius: 16,
    padding: 20,
  };

  return (
    <div style={cardStyle} className="space-y-4">
      <p className="text-sm font-semibold flex items-center gap-2">
        <Receipt className="w-4 h-4" style={{ color: accent }} />
        Relatório de Despesas
      </p>

      {/* Período */}
      <div className="flex flex-wrap gap-2">
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={period === p.key ? {
              background: `${accent}30`, color: accent, border: `1px solid ${accent}50`,
            } : {
              background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}>
            {p.label}
          </button>
        ))}
      </div>
      {period === "custom" && (
        <div className="flex gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input type="date" value={customStart}
              onChange={e => setCustomStart(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={customEnd}
              onChange={e => setCustomEnd(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total pago",   value: pago,    color: "#10b981" },
          { label: "Pendente",     value: pendente, color: "#f59e0b" },
          { label: "Total período",value: total,   color: accent    },
        ].map(({ label, value, color }) => (
          <div key={label} className="p-3 rounded-xl text-center"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="font-bold text-sm" style={{ color }}>{fmt(value)}</p>
          </div>
        ))}
      </div>

      {/* Gráfico pizza por categoria */}
      {byCategory.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={byCategory} cx="50%" cy="50%"
                innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {byCategory.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle}
                formatter={(v: number) => [fmt(v), "Total"]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2">
            {byCategory.map(({ name, value, color }) => (
              <div key={name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-muted-foreground text-xs">{name}</span>
                </div>
                <span className="font-medium text-xs">{fmt(value)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Receipt className="w-8 h-8 mx-auto mb-2 opacity-20" />
          <p className="text-sm">Nenhuma despesa no período</p>
        </div>
      )}

      {/* Lista por status */}
      {periodExpenses.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Detalhes</p>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {periodExpenses.map(e => {
              const cat = EXPENSE_CATEGORIES[e.category];
              const isAtrasada = e.status === "pendente" && e.date < new Date().toISOString().slice(0, 10);
              return (
                <div key={e.id} className="flex items-center justify-between text-xs py-1.5 border-b border-white/5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cat?.color ?? "#6b7280" }} />
                    <span className="text-muted-foreground truncate">{e.date}</span>
                    <span className="truncate">{e.description}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      e.status === "paga"    ? "bg-green-500/15 text-green-400"  :
                      isAtrasada            ? "bg-red-500/15 text-red-400"       :
                                              "bg-yellow-500/15 text-yellow-400"
                    }`}>
                      {e.status === "paga" ? "Paga" : isAtrasada ? "Atrasada" : "Pendente"}
                    </span>
                    <span className="font-semibold">{fmt(e.amount)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────
export default function RelatoriosPage() {
  const accent = getAccent();
  const [period, setPeriod]           = useState<Period>("mes");
  const [customStart, setCustomStart] = useState(() => format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd]     = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [selectedEmp, setSelectedEmp] = useState<any | null>(null);
  const [activeSection, setActiveSection] = useState<"geral" | "comparativo" | "despesas">("geral");

  const employees = useMemo(() => employeesStore.list(false), []);

  const { start, end, label } = getPeriodDates(period, customStart, customEnd);

  const now = new Date();

  // Regra do salão: tudo que está na agenda vale. Cancelamentos são removidos da agenda.
  const allPeriodAppts = useMemo(() =>
    getAppointmentsInPeriod(start, end).filter(a => {
      try { return parseISO(a.startTime) <= now; }
      catch { return false; }
    }),
    [start, end]);

  const appts = allPeriodAppts;

  const stats    = useMemo(() => calcPeriodStats(allPeriodAppts, employees), [allPeriodAppts, employees]);
  const byDay    = useMemo(() => calcRevenueByDay(allPeriodAppts, Math.min(30, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1)), [allPeriodAppts, start, end]);
  const byEmp    = useMemo(() => calcRevenueByEmployee(allPeriodAppts, employees), [allPeriodAppts, employees]);
  const services = useMemo(() => calcPopularServices(allPeriodAppts), [allPeriodAppts]);
  const profitServices = useMemo(() => calcMostProfitableServices(allPeriodAppts).slice(0, 6), [allPeriodAppts]);

  // Despesas do período (para lucro real)
  const allExpenses = useMemo(() => expensesStore.list(), []);
  const periodExpenses = useMemo(() => {
    const s = start.toISOString().slice(0, 10);
    const e = end.toISOString().slice(0, 10);
    return allExpenses.filter(ex => ex.date >= s && ex.date <= e && ex.status === "paga");
  }, [allExpenses, start, end]);
  const totalExpenses = periodExpenses.reduce((s, e) => s + e.amount, 0);
  const lucroReal = stats.totalRevenue - stats.totalMaterial - stats.totalCommissions - totalExpenses;

  const byStatus = useMemo(() => {
    const map: Record<string, number> = {};
    allPeriodAppts.forEach(a => { map[a.status] = (map[a.status] ?? 0) + 1; });
    const labels: Record<string, string> = {
      scheduled: "Agendado", confirmed: "Confirmado", in_progress: "Em andamento",
      completed: "Concluído", cancelled: "Cancelado", no_show: "Faltou",
    };
    const colors: Record<string, string> = {
      scheduled: "#3b82f6", confirmed: "#10b981", in_progress: "#f59e0b",
      completed: "#22c55e", cancelled: "#ef4444", no_show: "#6b7280",
    };
    return Object.entries(map).map(([st, count]) => ({
      name: labels[st] ?? st, value: count, color: colors[st] ?? "#ec4899",
    }));
  }, [allPeriodAppts]);

  const kpis = [
    { label: "Faturamento",    value: fmt(stats.totalRevenue),     color: accent      },
    { label: "Lucro real",     value: fmt(lucroReal),              color: lucroReal >= 0 ? "#22c55e" : "#ef4444" },
    { label: "Atendimentos",   value: String(stats.count),         color: "#3b82f6"   },
    { label: "Ticket Médio",   value: fmt(stats.avgTicket),        color: "#f59e0b"   },
    { label: "Comissões",      value: fmt(stats.totalCommissions), color: "#8b5cf6"   },
    { label: "Mat. consumido", value: fmt(stats.totalMaterial),    color: "#06b6d4"   },
    { label: "Despesas",       value: fmt(totalExpenses),          color: "#ef4444"   },
    { label: "Taxa cancelam.", value: `${stats.cancelRate.toFixed(1)}%`, color: "#f97316" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* Header + período */}
      <div className="space-y-3">
        <div>
          <h2 className="text-xl font-bold">Relatórios</h2>
          <p className="text-sm text-muted-foreground">Fonte: agenda · {label}</p>
        </div>

        {/* Abas de seção */}
        <div className="flex gap-2">
          {([
            { key: "geral",       label: "Geral"        },
            { key: "comparativo", label: "Comparativo"  },
            { key: "despesas",    label: "Despesas"     },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setActiveSection(key)}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={activeSection === key ? {
                background: `${accent}25`, color: accent, border: `1px solid ${accent}40`,
              } : {
                background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Seção Geral ── */}
      {activeSection === "geral" && (
        <>
          {/* Filtros de período */}
          <div className="flex gap-2 flex-wrap">
            {PERIODS.map(p => (
              <Button key={p.key} size="sm" variant={period === p.key ? "default" : "outline"}
                onClick={() => setPeriod(p.key)} className="h-7 text-xs">
                {p.label}
              </Button>
            ))}
          </div>
          {period === "custom" && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Label className="text-xs">De:</Label>
                <Input type="date" value={customStart}
                  onChange={e => setCustomStart(e.target.value)} className="w-36 h-8 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Até:</Label>
                <Input type="date" value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)} className="w-36 h-8 text-sm" />
              </div>
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {kpis.map(({ label, value, color }) => (
              <Card key={label} className="border-border bg-card/50">
                <CardContent className="pt-4 pb-3">
                  <p className="text-lg font-bold" style={{ color }}>{value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Breakdown lucro real */}
          <Card className="border-border bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Lucro Real</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {[
                { label: "Faturamento bruto",  value:  stats.totalRevenue,     color: "text-foreground" },
                { label: "- Custo material",   value: -stats.totalMaterial,    color: "text-cyan-400"   },
                { label: "- Comissões",        value: -stats.totalCommissions, color: "text-purple-400" },
                { label: "- Despesas pagas",   value: -totalExpenses,          color: "text-red-400"    },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between items-center py-1 border-b border-border">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className={`text-sm font-medium ${color}`}>
                    {value < 0 ? `- ${fmt(Math.abs(value))}` : fmt(value)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-1">
                <span className="font-bold">= Lucro real</span>
                <span className={`text-lg font-bold ${lucroReal >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {fmt(lucroReal)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Margem</span>
                <span className={`text-sm font-semibold ${lucroReal >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {stats.totalRevenue > 0 ? ((lucroReal / stats.totalRevenue) * 100).toFixed(1) : "0.0"}%
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Faturamento por dia */}
          <Card className="border-border bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Faturamento por Dia (concluídos)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byDay} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="label" tick={tickStyle} interval="preserveStartEnd" />
                  <YAxis tick={tickStyle} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={(v: any) => [fmt(Number(v)), "Faturamento"]} />
                  <Bar dataKey="revenue" fill={accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Ranking funcionários */}
            <Card className="border-border bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Award className="w-4 h-4 text-primary" />Ranking de Funcionários
                </CardTitle>
              </CardHeader>
              <CardContent>
                {byEmp.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum dado no período</p>
                ) : (
                  <div className="space-y-4">
                    {byEmp.map((emp, i) => (
                      <div key={emp.id}
                        className="space-y-1 cursor-pointer rounded-lg p-1 hover:bg-white/5 transition-colors"
                        onClick={() => setSelectedEmp(emp)}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}°</span>
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: emp.color }} />
                          <span className="text-sm font-semibold flex-1">{emp.name.split(" ")[0]}</span>
                          <span className="text-sm font-bold" style={{ color: accent }}>{fmt(emp.revenue)}</span>
                          <ChevronRight className="w-3 h-3 text-muted-foreground" />
                        </div>
                        <div className="pl-7 space-y-1">
                          <div className="h-2 rounded-full bg-secondary overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{
                              width: `${byEmp[0] ? (emp.revenue / byEmp[0].revenue) * 100 : 0}%`,
                              backgroundColor: emp.color,
                            }} />
                          </div>
                          <div className="flex gap-3 text-[10px] text-muted-foreground">
                            <span>{emp.count} atend.</span>
                            <span>Comissão: {fmt(emp.commission)}</span>
                            <span className="text-emerald-400">Líq: {fmt(emp.net)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Status */}
            <Card className="border-border bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Distribuição por Status</CardTitle>
              </CardHeader>
              <CardContent>
                {byStatus.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum dado</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={byStatus} cx="50%" cy="50%"
                        innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                        {byStatus.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend formatter={v => <span style={{ fontSize: 11, color: "hsl(0 0% 60%)" }}>{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Serviços populares */}
            <Card className="border-border bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-primary" />Serviços Mais Populares
                </CardTitle>
              </CardHeader>
              <CardContent>
                {services.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum dado</p>
                ) : (
                  <div className="space-y-3">
                    {services.slice(0, 8).map((svc, i) => (
                      <div key={svc.serviceId} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}°</span>
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: svc.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium truncate">{svc.name}</span>
                            <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">{svc.count}x</span>
                          </div>
                          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{
                              width: `${services[0] ? (svc.count / services[0].count) * 100 : 0}%`,
                              backgroundColor: svc.color,
                            }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{fmt(svc.revenue)} gerado</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Serviços mais lucrativos */}
            <Card className="border-border bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />Serviços Mais Lucrativos
                </CardTitle>
              </CardHeader>
              <CardContent>
                {profitServices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum dado</p>
                ) : (
                  <div className="space-y-3">
                    {profitServices.map((svc, i) => (
                      <div key={svc.serviceId} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}°</span>
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: svc.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium truncate">{svc.name}</span>
                            <span className="text-xs font-bold text-green-400">{svc.margin.toFixed(0)}% margem</span>
                          </div>
                          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-green-400" style={{
                              width: `${svc.margin}%`,
                            }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{fmt(svc.revenue)} · {svc.count}x</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ── Seção Comparativo ── */}
      {activeSection === "comparativo" && <ComparativoPeriodos />}

      {/* ── Seção Despesas ── */}
      {activeSection === "despesas" && <RelatorioDespesas />}

      {/* Modal detalhe funcionário */}
      {selectedEmp && (() => {
        const empAppts = getAppointmentsInPeriod(start, end)
          .filter(a => a.employeeId === selectedEmp.id && parseISO(a.startTime) <= now && (a.totalPrice ?? 0) > 0);
        const days = Math.min(30, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
        const empByDay: { label: string; revenue: number; count: number }[] = [];
        for (let i = days - 1; i >= 0; i--) {
          const d = subDays(new Date(), i);
          const key = format(d, "yyyy-MM-dd");
          const dayAppts = empAppts.filter(a => {
            try { return format(parseISO(a.startTime), "yyyy-MM-dd") === key; } catch { return false; }
          });
          empByDay.push({
            label:   format(d, "dd/MM"),
            revenue: dayAppts.reduce((s, a) => s + toNum(a.totalPrice), 0),
            count:   dayAppts.length,
          });
        }
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.7)" }}
            onClick={() => setSelectedEmp(null)}>
            <div className="w-full max-w-md rounded-2xl p-5 space-y-4"
              style={{ background: "hsl(240 6% 10%)", border: "1px solid rgba(255,255,255,0.1)" }}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: selectedEmp.color }} />
                  <h3 className="font-bold text-white">{selectedEmp.name.split(" ")[0]}</h3>
                </div>
                <button onClick={() => setSelectedEmp(null)} className="p-1 rounded-lg hover:bg-white/10">
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Faturamento", value: fmt(selectedEmp.revenue), color: selectedEmp.color },
                  { label: "Comissão",    value: fmt(selectedEmp.commission), color: "#8b5cf6"      },
                  { label: "Atend.",      value: selectedEmp.count,          color: "#3b82f6"       },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-xl p-3 text-center"
                    style={{ background: "rgba(255,255,255,0.05)" }}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-sm font-bold" style={{ color }}>{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Faturamento diário</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={empByDay} barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(0 0% 55%)" }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(0 0% 55%)" }} />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={(v: any) => [fmt(Number(v)), "Faturamento"]} />
                    <Bar dataKey="revenue" fill={selectedEmp.color} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
