import { useState, useEffect } from "react";
import { 
  appointmentsStore, employeesStore, expensesStore, commissionClosingsStore,
  type Appointment, type Employee, type Expense, type CommissionClosing 
} from "@/lib/store";
import { 
  calcPeriodStats, calcRevenueByDay, calcRevenueByEmployee, 
  calcTopClients, calcConversionRate, calcMostProfitableServices,
  getPeriodDates, isValid, toNum, type Period 
} from "@/lib/analytics";
import { format, parseISO, isAfter, subDays, differenceInDays } from "date-fns";
import { 
  TrendingUp, TrendingDown, DollarSign, Users, Calendar, 
  Receipt, AlertCircle, CheckCircle2, Info, ArrowUpRight,
  BarChart3, PieChart, Users2, Star, Clock
} from "lucide-react";
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Cell, AreaChart, Area
} from "recharts";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

export default function FinanceiroDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("mes");
  const [data, setData] = useState<{
    appointments: Appointment[];
    employees: Employee[];
    expenses: Expense[];
    closings: CommissionClosing[];
  }>({ appointments: [], employees: [], expenses: [], closings: [] });

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    try {
      setLoading(true);
      const [appts, emps, exps, clos] = await Promise.all([
        appointmentsStore.fetchAll(),
        employeesStore.fetchAll(),
        expensesStore.fetchAll(),
        commissionClosingsStore.fetchAll()
      ]);
      setData({ appointments: appts, employees: emps, expenses: exps, closings: clos });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const accentColor = localStorage.getItem("salon_config") ? JSON.parse(localStorage.getItem("salon_config")!).accentColor : "#ec4899";

  // --- Processamento de Dados ---
  const { start, end } = getPeriodDates(period);
  const now = new Date();

  // Realizado: completed e startTime <= now
  const realizedAppts = data.appointments.filter(a => 
    a.status === "completed" && new Date(a.startTime) <= now
  );

  // Projeção: scheduled/confirmed e startTime > now
  const projectedAppts = data.appointments.filter(a => 
    ["scheduled", "confirmed"].includes(a.status) && new Date(a.startTime) > now
  );

  // Stats por períodos (KPIs do topo)
  const periods: Period[] = ["hoje", "semana", "mes", "trimestre", "ano"];
  const periodKpis = periods.map(p => {
    const { start: pStart, end: pEnd } = getPeriodDates(p);
    const filtered = realizedAppts.filter(a => {
      const d = parseISO(a.startTime);
      return d >= pStart && d <= pEnd;
    });
    const rev = filtered.reduce((s, a) => s + toNum(a.totalPrice), 0);
    return {
      label: p === "trimestre" ? "90 dias" : p.charAt(0).toUpperCase() + p.slice(1),
      revenue: rev,
      count: filtered.length,
      avg: filtered.length > 0 ? rev / filtered.length : 0
    };
  });

  // Breakdown do período selecionado
  const currentAppts = realizedAppts.filter(a => {
    const d = parseISO(a.startTime);
    return d >= start && d <= end;
  });

  const currentExpenses = data.expenses.filter(e => {
    const d = parseISO(e.date);
    return d >= start && d <= end;
  });

  const stats = calcPeriodStats(currentAppts, data.employees);
  const totalExpenses = currentExpenses.reduce((s, e) => s + e.amount, 0);
  const realProfit = stats.totalRevenue - stats.totalMaterial - stats.totalCommissions - totalExpenses;
  const margin = stats.totalRevenue > 0 ? (realProfit / stats.totalRevenue) * 100 : 0;

  // Gráficos
  const revenueByDay = calcRevenueByDay(currentAppts, period === "mes" ? 30 : 7);
  const revenueByEmployee = calcRevenueByEmployee(currentAppts, data.employees);
  const topServices = calcMostProfitableServices(currentAppts).slice(0, 5);
  const topClients = calcTopClients(currentAppts, 10);

  // Projeção
  const convRate = calcConversionRate(data.appointments);
  const projectedRevenue = projectedAppts.reduce((s, a) => s + toNum(a.totalPrice), 0);
  const adjustedProjectedRevenue = projectedRevenue * (convRate / 100);

  // Alertas
  const alerts = [];
  
  // Clientes sumidos (> 45 dias sem visita e sem agendamento futuro)
  const clientVisits: Record<number, { last: Date; hasFuture: boolean }> = {};
  data.appointments.forEach(a => {
    if (!a.clientId) return;
    const d = new Date(a.startTime);
    if (!clientVisits[a.clientId]) clientVisits[a.clientId] = { last: d, hasFuture: false };
    if (d > now && ["scheduled", "confirmed"].includes(a.status)) clientVisits[a.clientId].hasFuture = true;
    if (d <= now && a.status === "completed" && d > clientVisits[a.clientId].last) clientVisits[a.clientId].last = d;
  });
  const lostClientsCount = Object.values(clientVisits).filter(v => !v.hasFuture && differenceInDays(now, v.last) > 45).length;
  if (lostClientsCount > 0) alerts.push({ type: "error", title: "Clientes Sumidos", text: `${lostClientsCount} clientes não aparecem há mais de 45 dias.`, link: "/clientes" });

  // Comissões pendentes > 30 dias
  const oldClosings = data.closings.filter(c => c.status === "pendente" && differenceInDays(now, parseISO(c.createdAt)) > 30);
  if (oldClosings.length > 0) alerts.push({ type: "warning", title: "Comissões Pendentes", text: `Existem fechamentos pendentes há mais de 30 dias.`, link: "/comissoes" });

  // Despesas atrasadas
  const overdueExpenses = data.expenses.filter(e => e.status === "pendente" && parseISO(e.date) < startOfDay(now));
  if (overdueExpenses.length > 0) alerts.push({ type: "error", title: "Despesas Atrasadas", text: `${overdueExpenses.length} despesas estão com o pagamento atrasado.`, link: "/despesas" });

  function startOfDay(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/5 border border-white/10">
              <TrendingUp className="w-8 h-8" style={{ color: accentColor }} />
            </div>
            Dashboard Financeiro
          </h1>
          <p className="text-white/40 mt-1">Visão completa de faturamento, lucro e projeções</p>
        </div>

        <div className="flex items-center gap-2 p-1 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl">
          {[
            { id: "hoje", label: "Hoje" },
            { id: "semana", label: "Semana" },
            { id: "mes", label: "Mês" },
            { id: "trimestre", label: "90 dias" },
            { id: "ano", label: "Ano" },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setPeriod(opt.id as any)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                period === opt.id ? "bg-white/10 text-white shadow-sm" : "text-white/30 hover:text-white/60"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Alertas */}
      {alerts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {alerts.map((alert, i) => (
            <Link key={i} href={alert.link}>
              <div className={cn(
                "p-4 rounded-3xl border flex items-start gap-3 cursor-pointer transition-all hover:scale-[1.02]",
                alert.type === "error" ? "bg-red-500/10 border-red-500/20 text-red-500" : "bg-amber-500/10 border-amber-500/20 text-amber-500"
              )}>
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">{alert.title}</h4>
                  <p className="text-xs opacity-80">{alert.text}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Seção A: REALIZADO */}
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <div className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-500 text-[10px] font-bold tracking-widest uppercase">
            Realizado
          </div>
          <div className="h-px flex-1 bg-white/5" />
        </div>

        {/* KPIs Horizontais */}
        <div className="flex overflow-x-auto pb-4 gap-4 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-5">
          {periodKpis.map((kpi, i) => (
            <div key={i} className="min-w-[200px] md:min-w-0 p-5 rounded-[32px] bg-white/5 border border-white/10 backdrop-blur-xl">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/30 block mb-2">{kpi.label}</span>
              <div className="text-xl font-bold text-white mb-1">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(kpi.revenue)}
              </div>
              <div className="flex items-center justify-between text-[10px] text-white/40">
                <span>{kpi.count} atend.</span>
                <span>Ticket R$ {kpi.avg.toFixed(0)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Breakdown Financeiro */}
          <div className="p-8 rounded-[40px] bg-white/5 border border-white/10 backdrop-blur-xl space-y-6">
            <h3 className="text-lg font-bold text-white">Resultado do Período</h3>
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Faturamento Bruto</span>
                <span className="text-white font-bold">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.totalRevenue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/40">- Custo de Materiais</span>
                <span className="text-red-400">-{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.totalMaterial)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/40">- Comissões</span>
                <span className="text-red-400">-{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.totalCommissions)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/40">- Despesas Operacionais</span>
                <span className="text-red-400">-{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalExpenses)}</span>
              </div>
              <div className="h-px bg-white/10 my-4" />
              <div className="flex justify-between items-end">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 block">Lucro Real</span>
                  <span className="text-3xl font-black text-white">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(realProfit)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 block">Margem</span>
                  <span className="text-xl font-bold" style={{ color: accentColor }}>{margin.toFixed(1)}%</span>
                </div>
              </div>
              {totalExpenses === 0 && (
                <Link href="/despesas">
                  <button className="w-full mt-4 p-3 rounded-2xl bg-white/5 border border-dashed border-white/20 text-xs text-white/40 hover:text-white hover:border-white/40 transition-all">
                    Cadastrar despesas →
                  </button>
                </Link>
              )}
            </div>
          </div>

          {/* Gráfico de Faturamento por Dia */}
          <div className="lg:col-span-2 p-8 rounded-[40px] bg-white/5 border border-white/10 backdrop-blur-xl space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Faturamento Diário</h3>
              <div className="flex items-center gap-2 text-[10px] font-bold text-white/20">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor }} />
                RECEITA BRUTA
              </div>
            </div>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueByDay}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={accentColor} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={accentColor} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" stroke="rgba(255,255,255,0.2)" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#121212", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px" }}
                    itemStyle={{ color: "#fff", fontSize: "12px", fontWeight: "bold" }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke={accentColor} strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Por Funcionário */}
          <div className="p-8 rounded-[40px] bg-white/5 border border-white/10 backdrop-blur-xl space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Users2 className="w-5 h-5" style={{ color: accentColor }} />
              Ranking de Profissionais
            </h3>
            <div className="space-y-4">
              {revenueByEmployee.map((emp, i) => (
                <div key={emp.id} className="flex items-center gap-4 group">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs" style={{ backgroundColor: emp.color + "20", color: emp.color }}>
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-bold text-white">{emp.name}</span>
                      <span className="text-sm font-bold text-white">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(emp.revenue)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full transition-all duration-1000" style={{ width: `${(emp.revenue / revenueByEmployee[0].revenue) * 100}%`, backgroundColor: emp.color }} />
                    </div>
                    <div className="flex justify-between mt-1 text-[10px] text-white/30">
                      <span>{emp.count} atendimentos</span>
                      <span>Líquido: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(emp.net)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Clientes */}
          <div className="p-8 rounded-[40px] bg-white/5 border border-white/10 backdrop-blur-xl space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Star className="w-5 h-5" style={{ color: accentColor }} />
              Clientes que mais gastaram
            </h3>
            <div className="space-y-3">
              {topClients.map((client, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold text-white/40">
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">{client.clientName}</div>
                      <div className="text-[10px] text-white/30">{client.visitCount} visitas • Ticket Médio {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(client.avgTicket)}</div>
                    </div>
                  </div>
                  <div className="text-sm font-black text-white">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(client.totalSpent)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Seção B: PROJEÇÃO */}
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <div className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-bold tracking-widest uppercase">
            Projeção
          </div>
          <div className="h-px flex-1 bg-white/5" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Card Projeção Principal */}
          <div className="p-8 rounded-[40px] bg-amber-500/[0.03] border border-amber-500/10 backdrop-blur-xl space-y-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <TrendingUp className="w-32 h-32 text-amber-500" />
            </div>
            
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500/60 block">Faturamento Previsto</span>
              <div className="text-4xl font-black text-white">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(projectedRevenue)}
              </div>
            </div>

            <div className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-200/60 flex items-center gap-1">
                  Taxa de Realização Histórica
                  <Info className="w-3 h-3" />
                </span>
                <span className="text-sm font-black text-amber-500">{convRate.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 w-full bg-amber-500/10 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500" style={{ width: `${convRate}%` }} />
              </div>
              <p className="text-[10px] text-amber-200/40 italic">Calculado com base nos agendamentos concluídos vs cancelados dos últimos 90 dias.</p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/60 block">Projeção Ajustada</span>
              <div className="text-2xl font-bold text-white">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(adjustedProjectedRevenue)}
              </div>
              <p className="text-[10px] text-white/20">Valor esperado considerando o fator de cancelamento histórico.</p>
            </div>
          </div>

          {/* Serviços Lucrativos */}
          <div className="lg:col-span-2 p-8 rounded-[40px] bg-white/5 border border-white/10 backdrop-blur-xl space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Star className="w-5 h-5" style={{ color: "#fbbf24" }} />
              Serviços mais Lucrativos
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topServices.map((svc, i) => (
                <div key={i} className="p-4 rounded-3xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: svc.color + "20", color: svc.color }}>
                      <PieChart className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">{svc.name}</div>
                      <div className="text-[10px] text-white/30">{svc.count} vendas • Margem {svc.margin.toFixed(0)}%</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-white">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(svc.revenue)}</div>
                    <div className="text-[10px] text-emerald-500 font-bold">+{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(svc.revenue - svc.materialCost)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
