import { useState, useEffect } from "react";
import { 
  appointmentsStore, employeesStore, commissionClosingsStore, 
  type Employee, type CommissionClosing 
} from "@/lib/store";
import { calcCommission, calcMaterialCost, isValid, toNum } from "@/lib/analytics";
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Percent, Calendar, Users, ChevronRight, CheckCircle2, 
  Clock, Trash2, Info, X, Calculator, History
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function ComissoesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [closings, setClosings] = useState<CommissionClosing[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"week" | "month" | "lastMonth" | "custom">("month");
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [closingData, setClosingData] = useState<{
    revenue: number;
    commission: number;
    count: number;
    start: string;
    end: string;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [emps, clos] = await Promise.all([
        employeesStore.fetchAll(),
        commissionClosingsStore.fetchAll()
      ]);
      setEmployees(emps.filter(e => e.active));
      setClosings(clos);
    } catch (error) {
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }

  const getDates = () => {
    const now = new Date();
    switch(period) {
      case "week": return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      case "month": return { start: startOfMonth(now), end: endOfMonth(now) };
      case "lastMonth": 
        const last = subMonths(now, 1);
        return { start: startOfMonth(last), end: endOfMonth(last) };
      default: return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const { start, end } = getDates();

  const employeeStats = employees.map(emp => {
    const appts = appointmentsStore.list({ employeeId: emp.id }).filter(a => {
      try {
        const d = parseISO(a.startTime);
        return isValid(a) && isWithinInterval(d, { start, end });
      } catch { return false; }
    });

    const revenue = appts.reduce((sum, a) => sum + toNum(a.totalPrice), 0);
    const commission = appts.reduce((sum, a) => sum + calcCommission(a, emp), 0);
    
    return {
      employee: emp,
      revenue,
      commission,
      count: appts.length,
      hasClosing: closings.some(c => 
        c.employeeId === emp.id && 
        c.periodStart === format(start, "yyyy-MM-dd") && 
        c.periodEnd === format(end, "yyyy-MM-dd")
      )
    };
  });

  async function handleOpenClosing(stats: any) {
    setSelectedEmployee(stats.employee);
    setClosingData({
      revenue: stats.revenue,
      commission: stats.commission,
      count: stats.count,
      start: format(start, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd")
    });
    setIsModalOpen(true);
  }

  async function handleConfirmClosing() {
    if (!selectedEmployee || !closingData) return;
    try {
      await commissionClosingsStore.create({
        employeeId: selectedEmployee.id,
        periodStart: closingData.start,
        periodEnd: closingData.end,
        totalRevenue: closingData.revenue,
        totalCommission: closingData.commission,
        appointmentCount: closingData.count,
        status: "pendente",
        paidAt: null,
        notes: ""
      });
      toast.success("Comissão fechada com sucesso!");
      setIsModalOpen(false);
      loadData();
    } catch (error) {
      toast.error("Erro ao fechar comissão");
    }
  }

  async function handleMarkAsPaid(id: number) {
    try {
      await commissionClosingsStore.markAsPaid(id);
      toast.success("Marcado como pago!");
      loadData();
    } catch (error) {
      toast.error("Erro ao atualizar");
    }
  }

  async function handleDeleteClosing(id: number) {
    if (!confirm("Excluir este fechamento?")) return;
    try {
      await commissionClosingsStore.delete(id);
      toast.success("Fechamento removido");
      loadData();
    } catch (error) {
      toast.error("Erro ao excluir");
    }
  }

  const accentColor = localStorage.getItem("salon_config") ? JSON.parse(localStorage.getItem("salon_config")!).accentColor : "#ec4899";

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/5 border border-white/10">
              <Percent className="w-8 h-8" style={{ color: accentColor }} />
            </div>
            Comissões & Fechamentos
          </h1>
          <p className="text-white/40 mt-1">Gerencie o pagamento dos seus profissionais</p>
        </div>

        <div className="flex items-center gap-2 p-1 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl">
          {[
            { id: "week", label: "Semana" },
            { id: "month", label: "Mês" },
            { id: "lastMonth", label: "Mês Passado" },
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profissionais */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-2 text-white/40 mb-2">
            <Users className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Resumo do Período</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {employeeStats.map(stats => (
              <div key={stats.employee.id} className="group relative p-6 rounded-[32px] bg-white/5 border border-white/10 backdrop-blur-xl overflow-hidden transition-all hover:bg-white/[0.07]">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-white/10 shadow-lg">
                      {stats.employee.photoUrl ? (
                        <img src={stats.employee.photoUrl} alt={stats.employee.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl font-bold" style={{ backgroundColor: stats.employee.color + "20", color: stats.employee.color }}>
                          {stats.employee.name[0]}
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{stats.employee.name}</h3>
                      <span className="text-xs text-white/40">{stats.employee.commissionPercent}% de comissão</span>
                    </div>
                  </div>
                  {stats.hasClosing && (
                    <div className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-500 text-[10px] font-bold uppercase flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Fechado
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                    <span className="text-[10px] text-white/30 uppercase font-bold block mb-1">Faturamento</span>
                    <span className="text-lg font-bold text-white">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.revenue)}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                    <span className="text-[10px] text-white/30 uppercase font-bold block mb-1">Comissão</span>
                    <span className="text-lg font-bold" style={{ color: accentColor }}>
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.commission)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/30">{stats.count} atendimentos</span>
                  <button 
                    disabled={stats.hasClosing || stats.revenue === 0}
                    onClick={() => handleOpenClosing(stats)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                      stats.hasClosing || stats.revenue === 0 
                        ? "bg-white/5 text-white/20 cursor-not-allowed" 
                        : "bg-white text-black hover:bg-white/90 active:scale-95"
                    )}
                  >
                    <Calculator className="w-3 h-3" />
                    Fechar Comissão
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Histórico */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-white/40 mb-2">
            <History className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Últimos Fechamentos</span>
          </div>

          <div className="space-y-3">
            {closings.length === 0 ? (
              <div className="p-12 text-center text-white/20 italic rounded-3xl bg-white/5 border border-white/10">
                Nenhum fechamento registrado.
              </div>
            ) : (
              closings.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10).map(closing => {
                const emp = employees.find(e => e.id === closing.employeeId);
                return (
                  <div key={closing.id} className="p-4 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl group">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{ backgroundColor: (emp?.color || "#fff") + "20", color: emp?.color || "#fff" }}>
                          {emp?.name[0] || "?"}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">{emp?.name || "Profissional"}</h4>
                          <span className="text-[10px] text-white/30">
                            {format(parseISO(closing.periodStart), "dd/MM")} a {format(parseISO(closing.periodEnd), "dd/MM")}
                          </span>
                        </div>
                      </div>
                      <button onClick={() => handleDeleteClosing(closing.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-500 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-white/5">
                      <div className="text-sm font-bold text-white">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(closing.totalCommission)}
                      </div>
                      {closing.status === "paga" ? (
                        <span className="text-[10px] font-bold text-emerald-500 uppercase flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Paga
                        </span>
                      ) : (
                        <button 
                          onClick={() => handleMarkAsPaid(closing.id)}
                          className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-500 text-[10px] font-bold uppercase hover:bg-amber-500/30 transition-all"
                        >
                          Marcar como Pago
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal de Fechamento */}
      {isModalOpen && selectedEmployee && closingData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-md rounded-[32px] bg-[#121212] border border-white/10 shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Calculator className="w-5 h-5" style={{ color: accentColor }} />
                Fechar Comissão
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-full hover:bg-white/5 text-white/40">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8 space-y-6 text-center">
              <div className="w-20 h-20 rounded-3xl mx-auto flex items-center justify-center text-3xl font-bold shadow-2xl" style={{ backgroundColor: selectedEmployee.color + "20", color: selectedEmployee.color, border: `2px solid ${selectedEmployee.color}40` }}>
                {selectedEmployee.name[0]}
              </div>
              
              <div>
                <h4 className="text-2xl font-bold text-white">{selectedEmployee.name}</h4>
                <p className="text-white/40 text-sm">
                  Período: {format(parseISO(closingData.start), "dd/MM/yyyy")} até {format(parseISO(closingData.end), "dd/MM/yyyy")}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                  <span className="text-[10px] text-white/30 uppercase font-bold block mb-1">Total Gerado</span>
                  <span className="text-lg font-bold text-white">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(closingData.revenue)}
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                  <span className="text-[10px] text-white/30 uppercase font-bold block mb-1">Comissão</span>
                  <span className="text-lg font-bold" style={{ color: accentColor }}>
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(closingData.commission)}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex items-start gap-3 text-left">
                <Info className="w-5 h-5 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-200/60 leading-relaxed">
                  Ao confirmar, um registro de fechamento será criado. O status inicial será <strong>pendente</strong> até que você o marque como pago no histórico.
                </p>
              </div>
            </div>

            <div className="p-6 bg-white/[0.02] border-t border-white/5 flex gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-4 rounded-2xl font-bold text-white/40 hover:bg-white/5 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirmClosing}
                className="flex-[2] py-4 rounded-2xl font-bold text-white shadow-lg transition-all active:scale-95"
                style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`, boxShadow: `0 8px 24px ${accentColor}40` }}
              >
                Confirmar Fechamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
