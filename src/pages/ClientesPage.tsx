/**
 * ClientesPage — CRUD de clientes com busca, histórico e importação.
 * Design: Glass Dashboard.
 */
import { useState, useMemo, useEffect } from "react";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, Pencil, Trash2, Users, Phone, Mail, Search, ChevronRight,
  Calendar, RefreshCw, Smartphone, DollarSign, TrendingUp, Clock, Star
} from "lucide-react";
import { clientsStore, appointmentsStore, type Client } from "@/lib/store";
import { isValid, toNum, calcClientReturnFrequency } from "@/lib/analytics";

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Agendado", confirmed: "Confirmado", in_progress: "Em andamento",
  completed: "Concluído", cancelled: "Cancelado", no_show: "Faltou",
};

export default function ClientesPage() {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchingContacts, setSearchingContacts] = useState(false);

  useEffect(() => {
    const onUpdate = () => setRefreshKey(k => k + 1);
    window.addEventListener("clients_updated", onUpdate);
    window.addEventListener("store_updated", onUpdate);
    return () => {
      window.removeEventListener("clients_updated", onUpdate);
      window.removeEventListener("store_updated", onUpdate);
    };
  }, []);
  const [form, setForm] = useState({ name: "", email: "", phone: "", birthDate: "", cpf: "", address: "", notes: "" });

  const clients = useMemo(() => clientsStore.list(), [refreshKey]);
  const allAppointments = useMemo(() => appointmentsStore.list({}), [refreshKey]);

  const clientAppointments = useMemo(() => {
    const map: Record<number, typeof allAppointments> = {};
    clients.forEach(c => {
      map[c.id] = allAppointments.filter(a =>
        a.clientId === c.id || a.clientName?.toLowerCase() === c.name.toLowerCase()
      );
    });
    return map;
  }, [clients, allAppointments]);

  const filtered = useMemo(() => {
    if (!search) return clients;
    const q = search.toLowerCase();
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  }, [clients, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", email: "", phone: "", birthDate: "", cpf: "", address: "", notes: "" });
    setModalOpen(true);
  };

  const handleSearchPhoneContacts = async () => {
    setSearchingContacts(true);
    try {
      if (!('contacts' in navigator)) {
        toast.error("Seu navegador nao suporta acesso a contatos");
        setSearchingContacts(false);
        return;
      }
      const contacts = await (navigator as any).contacts.select(
        ['name', 'tel', 'email'],
        { multiple: true }
      );
      if (!contacts || contacts.length === 0) {
        toast.info("Nenhum contato selecionado");
        setSearchingContacts(false);
        return;
      }
      const toAdd: Omit<Client, "id" | "createdAt">[] = [];
      for (const contact of contacts) {
        const name = contact.name?.[0] || "";
        const phone = contact.tel?.[0] || "";
        const email = contact.email?.[0] || "";
        if (!name.trim()) continue;
        const exists = clients.some(c => c.name.toLowerCase() === name.toLowerCase());
        if (!exists) {
          toAdd.push({
            name: name.trim(),
            phone: phone || null,
            email: email || null,
            birthDate: null,
            cpf: null,
            address: null,
            notes: null,
          });
        }
      }
      if (toAdd.length > 0) {
        await clientsStore.createMany(toAdd);
        toast.success(`${toAdd.length} contato(s) importado(s) com sucesso!`);
        setRefreshKey(k => k + 1);
      } else {
        toast.info("Todos os contatos ja estao cadastrados");
      }
    } catch (err: any) {
      if (err.name === 'SecurityError' || err.name === 'NotAllowedError') {
        toast.error("Permissao negada para acessar contatos");
      } else if (err.name === 'AbortError') {
        toast.info("Selecao de contatos cancelada");
      } else {
        console.error("Erro ao buscar contatos:", err);
        toast.error("Erro ao buscar contatos do celular");
      }
    } finally {
      setSearchingContacts(false);
    }
  };

  const openEdit = (client: Client) => {
    setEditingId(client.id);
    setForm({
      name: client.name,
      email: client.email ?? "",
      phone: client.phone ?? "",
      birthDate: client.birthDate ?? "",
      cpf: client.cpf ?? "",
      address: client.address ?? "",
      notes: client.notes ?? "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email || null,
        phone: form.phone || null,
        birthDate: form.birthDate || null,
        cpf: form.cpf || null,
        address: form.address || null,
        notes: form.notes || null,
      };
      if (editingId) {
        await clientsStore.update(editingId, payload);
        toast.success("Cliente atualizado!");
      } else {
        await clientsStore.create(payload);
        toast.success("Cliente cadastrado!");
      }
      setModalOpen(false);
      setRefreshKey(k => k + 1);
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Excluir este cliente?")) return;
    try {
      await clientsStore.delete(id);
      toast.success("Cliente excluído");
      setRefreshKey(k => k + 1);
    } catch { toast.error("Erro ao excluir cliente"); }
  };

  const handleClearAll = async () => {
    setClearingAll(true);
    try {
      await clientsStore.clearAll();
      toast.success("Todos os clientes foram removidos");
      setClearAllOpen(false);
      setRefreshKey(k => k + 1);
    } catch {
      toast.error("Erro ao remover clientes");
    } finally {
      setClearingAll(false);
    }
  };

  const selectedClientData = selectedClient ? clients.find(c => c.id === selectedClient) : null;
  const selectedClientAppts = selectedClient ? (clientAppointments[selectedClient] ?? []) : [];

  // Cálculos Financeiros do Cliente Selecionado
  const financialData = useMemo(() => {
    if (!selectedClientAppts.length) return null;
    const completed = selectedClientAppts.filter(isValid);
    const totalSpent = completed.reduce((s, a) => s + toNum(a.totalPrice), 0);
    const lastVisit = completed.length > 0 ? completed.sort((a, b) => b.startTime.localeCompare(a.startTime))[0].startTime : null;
    const nextVisit = selectedClientAppts.filter(a => ["scheduled", "confirmed"].includes(a.status) && new Date(a.startTime) > new Date()).sort((a, b) => a.startTime.localeCompare(b.startTime))[0]?.startTime;
    
    const serviceCounts: Record<string, number> = {};
    completed.forEach(a => {
      a.services.forEach(s => {
        serviceCounts[s.name] = (serviceCounts[s.name] || 0) + 1;
      });
    });
    const topServices = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);

    return {
      totalSpent,
      visitCount: completed.length,
      avgTicket: completed.length > 0 ? totalSpent / completed.length : 0,
      returnFrequency: calcClientReturnFrequency(completed),
      lastVisit,
      nextVisit,
      topServices,
      daysSinceLastVisit: lastVisit ? differenceInDays(new Date(), parseISO(lastVisit)) : null
    };
  }, [selectedClientAppts]);

  const accentColor = localStorage.getItem("salon_config") ? JSON.parse(localStorage.getItem("salon_config")!).accentColor : "#ec4899";

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Clientes</h2>
          <p className="text-sm text-muted-foreground">{clients.length} cadastrados</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleSearchPhoneContacts}
            disabled={searchingContacts}
            variant="outline"
            className="gap-2 text-xs bg-transparent"
            title="Importar contatos do seu celular"
          >
            <Smartphone className="w-3.5 h-3.5" />
            {searchingContacts ? "Carregando..." : "Importar Contatos"}
          </Button>
          {clients.length > 0 && (
            <Button onClick={() => setClearAllOpen(true)} variant="outline" className="gap-2 text-destructive hover:text-destructive bg-transparent text-xs">
              <Trash2 className="w-3.5 h-3.5" />Limpar Tudo
            </Button>
          )}
          <Button onClick={openCreate} className="gap-2 text-xs">
            <Plus className="w-3.5 h-3.5" />Novo Cliente
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, telefone ou e-mail..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Lista de Clientes */}
        <div className="lg:col-span-1 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">{search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}</p>
            </div>
          ) : (
            filtered.map(client => {
              const apptCount = (clientAppointments[client.id] ?? []).length;
              return (
                <div
                  key={client.id}
                  className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all duration-200 hover:border-primary/50 ${selectedClient === client.id ? "border-primary bg-primary/5" : "border-border bg-card/50"}`}
                  onClick={() => setSelectedClient(selectedClient === client.id ? null : client.id)}
                >
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-primary/20 text-primary font-semibold text-sm">
                      {client.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{client.name}</span>
                      {apptCount > 0 && (
                        <Badge variant="secondary" className="text-[10px]">{apptCount} visita{apptCount !== 1 ? "s" : ""}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {client.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{client.phone}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={e => { e.stopPropagation(); openEdit(client); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${selectedClient === client.id ? "rotate-90" : ""}`} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Detalhes do Cliente */}
        <div className="lg:col-span-2">
          {selectedClientData ? (
            <Card className="border-primary/30 bg-card/50 overflow-hidden rounded-[32px]">
              <CardHeader className="bg-primary/5 border-b border-primary/10 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Avatar className="w-16 h-16 border-2 border-primary/20">
                      <AvatarFallback className="bg-primary/20 text-primary text-2xl font-bold">
                        {selectedClientData.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="text-xl font-bold">{selectedClientData.name}</h3>
                      <p className="text-sm text-muted-foreground">{selectedClientData.phone || "Sem telefone"}</p>
                    </div>
                  </div>
                  <Button variant="destructive" size="sm" className="gap-2" onClick={() => handleDelete(selectedClientData.id)}>
                    <Trash2 className="w-4 h-4" /> Excluir Cliente
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Tabs defaultValue="financeiro" className="w-full">
                  <TabsList className="w-full justify-start rounded-none bg-transparent border-b border-border h-12 px-6">
                    <TabsTrigger value="financeiro" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full">Financeiro</TabsTrigger>
                    <TabsTrigger value="historico" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full">Histórico</TabsTrigger>
                    <TabsTrigger value="info" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full">Informações</TabsTrigger>
                  </TabsList>

                  <TabsContent value="financeiro" className="p-6 space-y-6 animate-in fade-in slide-in-from-top-2">
                    {financialData ? (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                            <div className="flex items-center gap-2 mb-2 text-primary/60">
                              <DollarSign className="w-4 h-4" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Total Gasto</span>
                            </div>
                            <div className="text-xl font-bold">R$ {financialData.totalSpent.toFixed(2)}</div>
                          </div>
                          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                            <div className="flex items-center gap-2 mb-2 text-primary/60">
                              <TrendingUp className="w-4 h-4" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Ticket Médio</span>
                            </div>
                            <div className="text-xl font-bold">R$ {financialData.avgTicket.toFixed(2)}</div>
                          </div>
                          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                            <div className="flex items-center gap-2 mb-2 text-primary/60">
                              <Clock className="w-4 h-4" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Frequência</span>
                            </div>
                            <div className="text-xl font-bold">{financialData.returnFrequency ? `${financialData.returnFrequency.toFixed(0)} dias` : "---"}</div>
                          </div>
                          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                            <div className="flex items-center gap-2 mb-2 text-primary/60">
                              <Calendar className="w-4 h-4" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Visitas</span>
                            </div>
                            <div className="text-xl font-bold">{financialData.visitCount}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                              <Clock className="w-4 h-4" /> Retenção
                            </h4>
                            <div className="space-y-3">
                              <div className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-white/5">
                                <span className="text-sm text-muted-foreground">Última Visita</span>
                                <span className="text-sm font-medium">{financialData.lastVisit ? format(parseISO(financialData.lastVisit), "dd/MM/yyyy") : "Nunca"}</span>
                              </div>
                              <div className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-white/5">
                                <span className="text-sm text-muted-foreground">Dias sem vir</span>
                                <span className={cn("text-sm font-bold", (financialData.daysSinceLastVisit || 0) > 45 ? "text-red-500" : "text-white")}>
                                  {financialData.daysSinceLastVisit ?? 0} dias
                                </span>
                              </div>
                              <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                                <span className="text-sm text-emerald-500/60">Próxima Visita</span>
                                <span className="text-sm font-bold text-emerald-500">{financialData.nextVisit ? format(parseISO(financialData.nextVisit), "dd/MM/yyyy") : "Sem agendamento"}</span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                              <Star className="w-4 h-4" /> Serviços Preferidos
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {financialData.topServices.length > 0 ? financialData.topServices.map((s, i) => (
                                <Badge key={i} variant="secondary" className="px-3 py-1.5 text-xs">{s}</Badge>
                              )) : <p className="text-sm text-muted-foreground italic">Nenhum serviço registrado</p>}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="py-12 text-center text-muted-foreground">
                        <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-10" />
                        <p>Nenhum dado financeiro disponível para este cliente.</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="historico" className="p-6 animate-in fade-in slide-in-from-top-2">
                    {selectedClientAppts.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">Nenhum agendamento encontrado</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedClientAppts.sort((a, b) => b.startTime.localeCompare(a.startTime)).slice(0, 20).map(appt => (
                          <div key={appt.id} className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/[0.08] transition-all">
                            <div className={cn("w-2 h-2 rounded-full", appt.status === "completed" ? "bg-emerald-400" : appt.status === "cancelled" ? "bg-red-400" : "bg-blue-400")} />
                            <div className="flex-1">
                              <div className="text-sm font-medium">{appt.services.map(s => s.name).join(", ")}</div>
                              <div className="text-[10px] text-muted-foreground">{format(parseISO(appt.startTime), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold">R$ {toNum(appt.totalPrice).toFixed(2)}</div>
                              <Badge variant="outline" className="text-[8px] uppercase">{STATUS_LABELS[appt.status] || appt.status}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="info" className="p-6 space-y-6 animate-in fade-in slide-in-from-top-2">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <Label className="text-muted-foreground">E-mail</Label>
                        <p className="text-sm font-medium">{selectedClientData.email || "Não informado"}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-muted-foreground">Aniversário</Label>
                        <p className="text-sm font-medium">{selectedClientData.birthDate ? format(parseISO(selectedClientData.birthDate), "dd/MM/yyyy") : "Não informado"}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-muted-foreground">CPF</Label>
                        <p className="text-sm font-medium">{selectedClientData.cpf || "Não informado"}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-muted-foreground">Endereço</Label>
                        <p className="text-sm font-medium">{selectedClientData.address || "Não informado"}</p>
                      </div>
                    </div>
                    {selectedClientData.notes && (
                      <div className="p-4 bg-secondary/50 rounded-2xl border border-border">
                        <Label className="text-muted-foreground mb-2 block">Observações / Preferências</Label>
                        <p className="text-sm leading-relaxed">{selectedClientData.notes}</p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-[32px] p-12 text-center">
              <Users className="w-16 h-16 mb-4 opacity-10" />
              <h3 className="text-lg font-medium">Selecione um cliente</h3>
              <p className="max-w-xs text-sm">Clique em um cliente na lista ao lado para ver seu histórico financeiro e detalhes.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal - Novo/Editar */}
      <Dialog open={modalOpen} onOpenChange={v => !v && setModalOpen(false)}>
        <DialogContent className="max-w-md rounded-[32px]">
          <DialogHeader><DialogTitle>{editingId ? "Editar Cliente" : "Novo Cliente"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome completo" className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="(11) 99999-9999" className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@exemplo.com" className="rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>CPF</Label>
                <Input value={form.cpf} onChange={e => setForm(p => ({ ...p, cpf: e.target.value }))} placeholder="000.000.000-00" className="rounded-xl" />
              </div>
              <div className="space-y-1">
                <Label>Data de nascimento</Label>
                <Input type="date" value={form.birthDate} onChange={e => setForm(p => ({ ...p, birthDate: e.target.value }))} className="rounded-xl" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Endereço</Label>
              <Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Rua, número, bairro, cidade..." className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>Observações / Preferências</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Preferências, alergias, observações..." rows={3} className="rounded-xl" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={loading} className="rounded-xl">Cancelar</Button>
            <Button onClick={handleSubmit} disabled={loading} className="rounded-xl">{loading ? "Salvando..." : editingId ? "Salvar" : "Cadastrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal - Limpar Tudo */}
      <Dialog open={clearAllOpen} onOpenChange={v => !v && setClearAllOpen(false)}>
        <DialogContent className="max-w-sm rounded-[32px]">
          <DialogHeader><DialogTitle>Limpar todos os clientes?</DialogTitle></DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Esta ação vai deletar <span className="font-semibold text-foreground">{clients.length} cliente(s)</span> permanentemente.
            </p>
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-sm text-destructive">Atenção: esta ação não pode ser desfeita.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearAllOpen(false)} disabled={clearingAll} className="rounded-xl">Cancelar</Button>
            <Button variant="destructive" onClick={handleClearAll} disabled={clearingAll} className="gap-2 rounded-xl">
              {clearingAll ? <><RefreshCw className="w-4 h-4 animate-spin" />Deletando...</> : <><Trash2 className="w-4 h-4" />Deletar Tudo</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

