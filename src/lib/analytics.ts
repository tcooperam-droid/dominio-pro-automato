/**
 * analytics.ts — Fonte única de verdade para cálculos financeiros.
 * Todos os dados derivam dos agendamentos (appointments).
 */
import { appointmentsStore, type Appointment, type Employee } from "./store";
import { format, isWithinInterval, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, differenceInDays } from "date-fns";

export const toNum = (v: unknown) => parseFloat(String(v ?? 0)) || 0;

export const EXCLUDED = ["cancelled", "no_show"] as const;
export const isValid = (a: Appointment) => !EXCLUDED.includes(a.status as any) && toNum(a.totalPrice) > 0;

export type Period = "hoje" | "semana" | "mes" | "trimestre" | "ano" | "custom";

export function getPeriodDates(period: Period, customStart?: string, customEnd?: string) {
  const now = new Date();
  switch (period) {
    case "hoje":
      return {
        start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0),
        end:   new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59),
        label: "Hoje",
      };
    case "semana":
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end:   endOfWeek(now,   { weekStartsOn: 1 }),
        label: "Esta semana",
      };
    case "mes":
      return { start: startOfMonth(now), end: endOfMonth(now), label: "Este mês" };
    case "trimestre":
      return { start: subDays(now, 89), end: now, label: "Últimos 90 dias" };
    case "ano":
      return { start: startOfYear(now), end: endOfYear(now), label: "Este ano" };
    case "custom":
      return {
        start: customStart ? parseISO(customStart) : subDays(now, 30),
        end:   customEnd   ? parseISO(customEnd)   : now,
        label: "Período personalizado",
      };
  }
}

export function getAppointmentsInPeriod(start: Date, end: Date): Appointment[] {
  return appointmentsStore.list({}).filter(a => {
    try {
      return isWithinInterval(parseISO(a.startTime), { start, end });
    } catch { return false; }
  });
}

export function calcMaterialCost(appt: Appointment): number {
  return (appt.services ?? []).reduce((sum, s) => {
    return sum + ((s.price ?? 0) * ((s.materialCostPercent ?? 0) / 100));
  }, 0);
}

export function calcCommission(appt: Appointment, emp: Employee): number {
  return (appt.services ?? []).reduce((sum, s) => {
    const price = toNum(s.price);
    const matCost = price * (toNum(s.materialCostPercent) / 100);
    const mode = s.commissionMode ?? "cost_first";
    
    if (mode === "commission_first") {
      return sum + (price * (emp.commissionPercent / 100));
    }
    // cost_first
    const base = Math.max(0, price - matCost);
    return sum + (base * (emp.commissionPercent / 100));
  }, 0);
}

export interface PeriodStats {
  totalRevenue:      number;
  totalMaterial:     number;
  totalCommissions:  number;
  netRevenue:        number;
  count:             number;
  avgTicket:         number;
  cancelCount:       number;
  cancelRate:        number;
  scheduledRevenue:  number;
  scheduledCount:    number;
}

export function calcPeriodStats(appts: Appointment[], employees: Employee[]): PeriodStats {
  const empMap = new Map(employees.map(e => [e.id, e]));

  const valid    = appts.filter(isValid);
  const future   = appts.filter(a => ["scheduled", "confirmed"].includes(a.status) && new Date(a.startTime) > new Date());
  const cancelled = appts.filter(a => EXCLUDED.includes(a.status as any));

  let totalRevenue     = 0;
  let totalMaterial    = 0;
  let totalCommissions = 0;

  for (const a of valid) {
    const rev  = toNum(a.totalPrice);
    const mat  = calcMaterialCost(a);
    const emp  = empMap.get(a.employeeId);
    const comm = emp ? calcCommission(a, emp) : 0;
    totalRevenue     += rev;
    totalMaterial    += mat;
    totalCommissions += comm;
  }

  const netRevenue      = totalRevenue - totalMaterial - totalCommissions;
  const scheduledRevenue = future.reduce((s, a) => s + toNum(a.totalPrice), 0);

  return {
    totalRevenue,
    totalMaterial,
    totalCommissions,
    netRevenue,
    count:            valid.length,
    avgTicket:        valid.length > 0 ? totalRevenue / valid.length : 0,
    cancelCount:      cancelled.length,
    cancelRate:       appts.length > 0 ? (cancelled.length / appts.length) * 100 : 0,
    scheduledRevenue,
    scheduledCount:   future.length,
  };
}

export function calcRevenueByDay(appts: Appointment[], days: number = 7): { date: string; label: string; revenue: number; count: number }[] {
  const result: { date: string; label: string; revenue: number; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(new Date(), i);
    const key = format(d, "yyyy-MM-dd");
    const dayAppts = appts.filter(a => {
      try { return format(parseISO(a.startTime), "yyyy-MM-dd") === key; } catch { return false; }
    }).filter(isValid);
    result.push({
      date:    key,
      label:   format(d, "dd/MM"),
      revenue: dayAppts.reduce((s, a) => s + toNum(a.totalPrice), 0),
      count:   dayAppts.length,
    });
  }
  return result;
}

export function calcRevenueByEmployee(appts: Appointment[], employees: Employee[]) {
  return employees.map(emp => {
    const empAppts = appts.filter(a => a.employeeId === emp.id).filter(isValid);
    const revenue  = empAppts.reduce((s, a) => s + toNum(a.totalPrice), 0);
    const material = empAppts.reduce((s, a) => s + calcMaterialCost(a), 0);
    const commission = empAppts.reduce((s, a) => s + calcCommission(a, emp), 0);
    return {
      id:         emp.id,
      name:       emp.name,
      firstName:  emp.name.split(" ")[0],
      color:      emp.color,
      photoUrl:   emp.photoUrl,
      revenue,
      material,
      commission,
      net:        revenue - material - commission,
      count:      empAppts.length,
      commissionPercent: emp.commissionPercent,
    };
  }).filter(e => e.count > 0).sort((a, b) => b.revenue - a.revenue);
}

export function calcPopularServices(appts: Appointment[]) {
  const counts: Record<number, { serviceId: number; name: string; count: number; revenue: number; color: string }> = {};
  appts.filter(isValid).forEach(a => {
    (a.services ?? []).forEach(s => {
      if (!counts[s.serviceId]) {
        counts[s.serviceId] = { serviceId: s.serviceId, name: s.name, count: 0, revenue: 0, color: s.color ?? "#ec4899" };
      }
      counts[s.serviceId].count++;
      counts[s.serviceId].revenue += toNum(s.price);
    });
  });
  return Object.values(counts).sort((a, b) => b.count - a.count);
}

// --- Novas funções solicitadas ---

export function calcTopClients(appts: Appointment[], limit = 10) {
  const valid = appts.filter(isValid);
  const groups: Record<string, { clientId: number | null; clientName: string; totalSpent: number; visitCount: number; lastVisit: string }> = {};

  valid.forEach(a => {
    const key = a.clientId ? String(a.clientId) : (a.clientName || "Desconhecido");
    if (!groups[key]) {
      groups[key] = {
        clientId: a.clientId,
        clientName: a.clientName || "Desconhecido",
        totalSpent: 0,
        visitCount: 0,
        lastVisit: a.startTime
      };
    }
    groups[key].totalSpent += toNum(a.totalPrice);
    groups[key].visitCount += 1;
    if (new Date(a.startTime) > new Date(groups[key].lastVisit)) {
      groups[key].lastVisit = a.startTime;
    }
  });

  return Object.values(groups)
    .map(g => ({ ...g, avgTicket: g.totalSpent / g.visitCount }))
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, limit);
}

export function calcConversionRate(appts: Appointment[]): number {
  const now = new Date();
  const past = appts.filter(a => new Date(a.startTime) <= now);
  if (past.length === 0) return 100;
  
  const completed = past.filter(a => a.status === "completed").length;
  const lost = past.filter(a => ["cancelled", "no_show"].includes(a.status)).length;
  
  if (completed + lost === 0) return 100;
  return (completed / (completed + lost)) * 100;
}

export function calcClientReturnFrequency(appts: Appointment[]): number | null {
  const valid = appts.filter(isValid).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  if (valid.length < 2) return null;

  let totalDays = 0;
  let count = 0;

  for (let i = 1; i < valid.length; i++) {
    const diff = differenceInDays(parseISO(valid[i].startTime), parseISO(valid[i-1].startTime));
    if (diff > 0) {
      totalDays += diff;
      count++;
    }
  }

  return count > 0 ? totalDays / count : null;
}

export function calcMostProfitableServices(appts: Appointment[]) {
  const valid = appts.filter(isValid);
  const counts: Record<number, { serviceId: number; name: string; count: number; revenue: number; materialCost: number; color: string }> = {};

  valid.forEach(a => {
    (a.services ?? []).forEach(s => {
      if (!counts[s.serviceId]) {
        counts[s.serviceId] = { serviceId: s.serviceId, name: s.name, count: 0, revenue: 0, materialCost: 0, color: s.color ?? "#ec4899" };
      }
      const price = toNum(s.price);
      const cost = price * (toNum(s.materialCostPercent) / 100);
      counts[s.serviceId].count++;
      counts[s.serviceId].revenue += price;
      counts[s.serviceId].materialCost += cost;
    });
  });

  return Object.values(counts)
    .map(s => ({
      ...s,
      margin: s.revenue > 0 ? ((s.revenue - s.materialCost) / s.revenue) * 100 : 0
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function calcWeeklyRevenue(appts: Appointment[], weeks: number) {
  const result: { weekLabel: string; revenue: number; count: number }[] = [];
  const now = new Date();

  for (let i = weeks - 1; i >= 0; i--) {
    const start = startOfWeek(subDays(now, i * 7), { weekStartsOn: 1 });
    const end = endOfWeek(start, { weekStartsOn: 1 });
    
    const weekAppts = appts.filter(a => {
      try {
        const d = parseISO(a.startTime);
        return isWithinInterval(d, { start, end });
      } catch { return false; }
    }).filter(isValid);

    result.push({
      weekLabel: `Semana ${format(start, "dd/MM")}`,
      revenue: weekAppts.reduce((s, a) => s + toNum(a.totalPrice), 0),
      count: weekAppts.length
    });
  }
  return result;
}
