import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "firebase/firestore";

// ─── Firebase config ─────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toApp = (doc) => {
  const d = doc.data();
  return {
    id:              doc.id,
    product:         d.product,
    requestedBy:     d.requestedBy,
    qty:             d.qty,
    unit:            d.unit,
    brand:           d.brand || "",
    notes:           d.notes || "",
    urgente:         d.urgente || false,
    status:          d.status,
    approved:        d.approved ?? null,
    approvedBy:      d.approvedBy || "",
    purchasedBy:     d.purchasedBy || "",
    empresa:         d.empresa || "",
    value:           d.value ?? "",
    reprovadoMotivo: d.reprovadoMotivo || "",
    createdAt:       d.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    editedAt:        d.editedAt?.toDate?.()?.toISOString() || null,
  };
};

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS = {
  pendente:     { label: "Pendente",     bg: "#f1f5f9", tx: "#475569", dot: "#94a3b8" },
  em_orcamento: { label: "Em orçamento", bg: "#eff6ff", tx: "#1d4ed8", dot: "#3b82f6" },
  em_analise:   { label: "Em análise",   bg: "#fffbeb", tx: "#b45309", dot: "#f59e0b" },
  concluido:    { label: "Concluído",    bg: "#f0fdf4", tx: "#15803d", dot: "#22c55e" },
  reprovado:    { label: "Reprovado",    bg: "#fef2f2", tx: "#dc2626", dot: "#ef4444" },
};

const UNITS  = ["un","cx","kg","L","par","rolo","peça","saco","fardo","mt","g","ml"];
const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const ptD     = (s) => s ? new Date(s).toLocaleDateString("pt-BR") : "—";
const ptDT    = (s) => s ? new Date(s).toLocaleString("pt-BR", { dateStyle:"short", timeStyle:"short" }) : "—";
const daysSince = (s) => Math.floor((Date.now() - new Date(s)) / 86400000);
const brl     = (v) => (v !== "" && v != null) ? (+v).toLocaleString("pt-BR", { style:"currency", currency:"BRL" }) : "—";
const empty   = (s) => !s || s.trim() === "";

// ─── Shared styles ────────────────────────────────────────────────────────────
const ls = {
  label:  { fontSize:11, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase", color:"#64748b", display:"block", marginBottom:5 },
  input:  { width:"100%", boxSizing:"border-box", padding:"11px 13px", border:"1.5px solid #e2e8f0", borderRadius:9, fontSize:15, color:"#0f172a", background:"#fff", outline:"none", fontFamily:"inherit" },
  select: { width:"100%", boxSizing:"border-box", padding:"11px 13px", border:"1.5px solid #e2e8f0", borderRadius:9, fontSize:15, color:"#0f172a", background:"#fff", fontFamily:"inherit" },
  btn:    { borderRadius:8, padding:"9px 16px", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:5 },
  badge:  { display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px", borderRadius:20, fontSize:12, fontWeight:600 },
  card:   { background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:16, marginBottom:12 },
  muted:  { fontSize:12, color:"#94a3b8" },
  pill:   { display:"inline-block", background:"#f1f5f9", color:"#64748b", borderRadius:6, padding:"2px 8px", fontSize:12, fontWeight:500 },
};

// ─── Reusable components ──────────────────────────────────────────────────────
const Input = ({ label, required, style={}, ...p }) => (
  <div style={{ marginBottom:14 }}>
    {label && <label style={ls.label}>{label}{required && <span style={{ color:"#ef4444" }}>*</span>}</label>}
    <input style={{ ...ls.input, ...style }} {...p} />
  </div>
);

const Sel = ({ label, children, required, ...p }) => (
  <div style={{ marginBottom:14 }}>
    {label && <label style={ls.label}>{label}{required && <span style={{ color:"#ef4444" }}>*</span>}</label>}
    <select style={ls.select} {...p}>{children}</select>
  </div>
);

const Badge = ({ s }) => (
  <span style={{ ...ls.badge, background:STATUS[s]?.bg, color:STATUS[s]?.tx }}>
    <span style={{ width:6, height:6, borderRadius:"50%", background:STATUS[s]?.dot, display:"inline-block" }} />
    {STATUS[s]?.label}
  </span>
);

const Btn = ({ variant="ghost", children, style={}, ...p }) => {
  const v = {
    primary: { background:"#f59e0b", color:"#fff",    border:"none" },
    danger:  { background:"#fef2f2", color:"#dc2626", border:"1px solid #fca5a5" },
    ghost:   { background:"#f1f5f9", color:"#475569", border:"1px solid #e2e8f0" },
  };
  return <button style={{ ...ls.btn, ...v[variant], ...style }} {...p}>{children}</button>;
};

// ─── SolicitarTab ─────────────────────────────────────────────────────────────
function SolicitarTab({ onAdd }) {
  const init = { product:"", requestedBy:"", qty:"", unit:"un", brand:"", notes:"", urgente:false };
  const [form, setForm]     = useState(init);
  const [sent, setSent]     = useState(false);
  const [err, setErr]       = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (empty(form.product))      return setErr("Informe o nome do produto.");
    if (empty(form.requestedBy))  return setErr("Informe quem está solicitando.");
    if (!form.qty || +form.qty <= 0) return setErr("Informe a quantidade.");
    setErr("");
    setSaving(true);
    await onAdd({ ...form, product:form.product.trim(), requestedBy:form.requestedBy.trim(), qty:+form.qty, brand:form.brand.trim(), notes:form.notes.trim() });
    setSaving(false);
    setSent(true);
    setForm(init);
    setTimeout(() => setSent(false), 4000);
  };

  return (
    <div style={{ maxWidth:500, margin:"0 auto" }}>
      <div style={{ background:"#0f172a", borderRadius:12, padding:"18px 20px", marginBottom:20, color:"#fff" }}>
        <div style={{ fontSize:20, fontWeight:700 }}>Nova solicitação</div>
        <div style={{ fontSize:13, color:"#94a3b8", marginTop:3 }}>Preencha os campos e envie para análise</div>
      </div>

      {sent && <div style={{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:10, padding:"12px 16px", marginBottom:16, color:"#15803d", fontWeight:600, fontSize:14 }}>✓ Solicitação enviada! Você pode fazer uma nova.</div>}
      {err  && <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10, padding:"10px 14px", marginBottom:14, color:"#dc2626", fontSize:14 }}>{err}</div>}

      <div style={ls.card}>
        <Input label="Produto"        required placeholder="Ex: Óleo lubrificante 20W50" value={form.product}      onChange={e => set("product", e.target.value)} />
        <Input label="Solicitado por" required placeholder="Seu nome"                    value={form.requestedBy}  onChange={e => set("requestedBy", e.target.value)} />
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Input label="Quantidade" required type="number" min="0" step="1" placeholder="0" value={form.qty} onChange={e => set("qty", e.target.value)} />
          <Sel   label="Unidade" value={form.unit} onChange={e => set("unit", e.target.value)}>
            {UNITS.map(u => <option key={u}>{u}</option>)}
          </Sel>
        </div>
        <Input label="Marca (opcional)" placeholder="Ex: Castrol, 3M, Tramontina..." value={form.brand} onChange={e => set("brand", e.target.value)} />
        <div style={{ marginBottom:14 }}>
          <label style={ls.label}>Observações (opcional)</label>
          <textarea style={{ ...ls.input, resize:"vertical", minHeight:70 }} placeholder="Informe detalhes adicionais se necessário..." value={form.notes} onChange={e => set("notes", e.target.value)} />
        </div>
        <label onClick={() => set("urgente", !form.urgente)} style={{ display:"flex", alignItems:"center", gap:12, cursor:"pointer", padding:"12px 14px", borderRadius:10, border:`2px solid ${form.urgente ? "#ef4444" : "#e2e8f0"}`, background:form.urgente ? "#fff8f8" : "#f8fafc", marginTop:4, userSelect:"none" }}>
          <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${form.urgente ? "#ef4444" : "#cbd5e1"}`, background:form.urgente ? "#ef4444" : "#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            {form.urgente && <span style={{ color:"#fff", fontSize:13, fontWeight:700, lineHeight:1 }}>✓</span>}
          </div>
          <div>
            <div style={{ fontWeight:700, fontSize:14, color:form.urgente ? "#dc2626" : "#475569" }}>🚨 Solicitação urgente</div>
            <div style={{ fontSize:12, color:form.urgente ? "#ef4444" : "#94a3b8", marginTop:1 }}>Marque se o produto é necessário com urgência</div>
          </div>
        </label>
      </div>

      <Btn variant="primary" style={{ width:"100%", justifyContent:"center", padding:"14px", fontSize:16, background:form.urgente ? "#dc2626" : "#f59e0b", opacity:saving ? 0.7 : 1 }} onClick={submit} disabled={saving}>
        {saving ? "Enviando..." : form.urgente ? "🚨 Enviar como URGENTE" : "Enviar solicitação"}
      </Btn>
    </div>
  );
}

// ─── EditModal ────────────────────────────────────────────────────────────────
function EditModal({ req, onSave, onClose }) {
  const [form, setForm] = useState({
    product:         req.product,
    requestedBy:     req.requestedBy,
    qty:             req.qty,
    unit:            req.unit,
    brand:           req.brand || "",
    notes:           req.notes || "",
    status:          req.status,
    approved:        req.approved === true ? "sim" : req.approved === false ? "nao" : "pendente",
    approvedBy:      req.approvedBy || "",
    purchasedBy:     req.purchasedBy || "",
    empresa:         req.empresa || "",
    value:           req.value ?? "",
    reprovadoMotivo: req.reprovadoMotivo || "",
  });
  const [err, setErr]       = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (form.status === "concluido" && (form.value === "" || form.value == null)) return setErr("Informe o valor da compra para marcar como Concluído.");
    if (form.status === "concluido" && !form.empresa.trim())                      return setErr("Informe a empresa onde a compra foi realizada.");
    if (form.status === "reprovado" && !form.reprovadoMotivo.trim())              return setErr("Informe o motivo da reprovação.");
    setErr("");
    setSaving(true);
    await onSave({
      product:         form.product.trim(),
      requestedBy:     form.requestedBy.trim(),
      qty:             +form.qty,
      unit:            form.unit,
      brand:           form.brand.trim(),
      notes:           form.notes.trim(),
      status:          form.status,
      approved:        form.approved === "sim" ? true : form.approved === "nao" ? false : null,
      approvedBy:      form.approvedBy.trim(),
      purchasedBy:     form.purchasedBy.trim(),
      empresa:         form.empresa.trim(),
      value:           form.value === "" ? null : +form.value,
      reprovadoMotivo: form.reprovadoMotivo.trim(),
    });
    setSaving(false);
    onClose();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:200, display:"flex", alignItems:"flex-end" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:"#fff", borderRadius:"16px 16px 0 0", width:"100%", maxHeight:"92vh", overflow:"auto", padding:"20px 20px 32px", boxSizing:"border-box" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <div style={{ fontSize:17, fontWeight:700 }}>Editar solicitação</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:"#94a3b8", lineHeight:1 }}>×</button>
        </div>

        <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase", color:"#94a3b8", marginBottom:10 }}>Dados do produto</div>
        <Input label="Produto"        value={form.product}      onChange={e => set("product", e.target.value)} />
        <Input label="Solicitado por" value={form.requestedBy}  onChange={e => set("requestedBy", e.target.value)} />
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Input label="Quantidade" type="number" value={form.qty}  onChange={e => set("qty", e.target.value)} />
          <Sel   label="Unidade"                  value={form.unit} onChange={e => set("unit", e.target.value)}>
            {UNITS.map(u => <option key={u}>{u}</option>)}
          </Sel>
        </div>
        <Input label="Marca" value={form.brand} onChange={e => set("brand", e.target.value)} />
        <div style={{ marginBottom:14 }}>
          <label style={ls.label}>Observações</label>
          <textarea style={{ ...ls.input, resize:"vertical", minHeight:60 }} value={form.notes} onChange={e => set("notes", e.target.value)} />
        </div>

        <div style={{ borderTop:"1px solid #f1f5f9", margin:"16px 0" }} />
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase", color:"#94a3b8", marginBottom:10 }}>Status e aprovação</div>

        <Sel label="Status" value={form.status} onChange={e => { set("status", e.target.value); setErr(""); }}>
          {Object.entries(STATUS)
            .filter(([k]) => !(req.status === "reprovado" && k === "concluido"))
            .map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </Sel>

        {form.status === "reprovado" && (
          <div style={{ marginBottom:14 }}>
            <label style={ls.label}>Motivo da reprovação<span style={{ color:"#ef4444" }}>*</span></label>
            <textarea style={{ ...ls.input, resize:"vertical", minHeight:72, borderColor:err && !form.reprovadoMotivo.trim() ? "#ef4444" : "#e2e8f0" }}
              placeholder="Descreva o motivo pelo qual a solicitação foi reprovada..."
              value={form.reprovadoMotivo} onChange={e => { set("reprovadoMotivo", e.target.value); setErr(""); }} />
          </div>
        )}

        <Sel label="Aprovação" value={form.approved} onChange={e => set("approved", e.target.value)}>
          <option value="pendente">Aguardando aprovação</option>
          <option value="sim">Aprovado</option>
          <option value="nao">Reprovado</option>
        </Sel>

        <Input label="Aprovado por" placeholder="Nome" value={form.approvedBy} onChange={e => set("approvedBy", e.target.value)} />

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Input label="Realizado por" placeholder="Nome" value={form.purchasedBy} onChange={e => set("purchasedBy", e.target.value)} />
          <Input
            label={<>Empresa{form.status === "concluido" && <span style={{ color:"#ef4444" }}> *</span>}</>}
            placeholder="Ex: Leroy Merlin"
            value={form.empresa}
            onChange={e => { set("empresa", e.target.value); setErr(""); }}
            style={{ borderColor:err && form.status === "concluido" && !form.empresa.trim() ? "#ef4444" : "#e2e8f0" }}
          />
        </div>

        <Input
          label={<>Valor da compra (R$){form.status === "concluido" && <span style={{ color:"#ef4444" }}> *</span>}</>}
          type="number" min="0" step="0.01" placeholder="0,00"
          value={form.value}
          onChange={e => { set("value", e.target.value); setErr(""); }}
          style={{ borderColor:err && form.status === "concluido" && !form.value ? "#ef4444" : "#e2e8f0" }}
        />

        {err && <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", marginBottom:12, color:"#dc2626", fontSize:13, fontWeight:500 }}>{err}</div>}

        <div style={{ display:"flex", gap:10, marginTop:8 }}>
          <Btn variant="ghost"   style={{ flex:1, justifyContent:"center" }} onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" style={{ flex:2, justifyContent:"center", opacity:saving ? 0.7 : 1 }} onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── SolicitacoesTab ──────────────────────────────────────────────────────────
function SolicitacoesTab({ requests, onEdit, onDelete, onStatusChange }) {
  const [filterStatus,  setFilterStatus]  = useState("all");
  const [search,        setSearch]        = useState("");
  const [expanded,      setExpanded]      = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const filtered = requests.filter(r => {
    if (filterStatus === "pendente"  && (r.status === "concluido" || r.status === "reprovado")) return false;
    if (filterStatus !== "all" && filterStatus !== "pendente" && r.status !== filterStatus)     return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.product.toLowerCase().includes(q) && !r.requestedBy.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0));

  const pendingCount   = requests.filter(r => r.status !== "concluido" && r.status !== "reprovado").length;
  const concluidoCount = requests.filter(r => r.status === "concluido").length;
  const reprovadoCount = requests.filter(r => r.status === "reprovado").length;

  const filters = [
    { key:"all",       label:`Todos (${requests.length})`,     bg:"#0f172a" },
    { key:"pendente",  label:`Pendentes (${pendingCount})`,    bg:"#f59e0b" },
    { key:"concluido", label:`Concluídos (${concluidoCount})`, bg:"#22c55e" },
    { key:"reprovado", label:`Reprovados (${reprovadoCount})`, bg:"#ef4444" },
  ];

  return (
    <div>
      <div style={{ display:"flex", gap:8, marginBottom:14, overflowX:"auto", paddingBottom:4, scrollbarWidth:"none" }}>
        {filters.map(f => (
          <button key={f.key} onClick={() => setFilterStatus(f.key)}
            style={{ ...ls.btn, flex:"none", background:filterStatus===f.key ? f.bg : "#f1f5f9", color:filterStatus===f.key ? "#fff" : "#475569", border:"none", fontSize:13 }}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom:14, position:"relative" }}>
        <input style={{ ...ls.input, paddingLeft:36 }} placeholder="Buscar produto ou solicitante..." value={search} onChange={e => setSearch(e.target.value)} />
        <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#94a3b8", fontSize:15, pointerEvents:"none" }}>⌕</span>
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign:"center", padding:"40px 20px", color:"#94a3b8" }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
          <div style={{ fontWeight:600 }}>Nenhuma solicitação encontrada</div>
          <div style={{ fontSize:13, marginTop:4 }}>Ajuste os filtros ou faça uma nova solicitação</div>
        </div>
      )}

      {filtered.map(r => {
        const daysAgo    = daysSince(r.createdAt);
        const isPending  = r.status !== "concluido" && r.status !== "reprovado";
        const isExpanded = expanded === r.id;

        return (
          <div key={r.id} style={{ ...ls.card, ...(r.urgente ? { border:"2px solid #ef4444", background:"#fff8f8" } : {}) }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:3 }}>
                  {r.urgente && <span style={{ background:"#dc2626", color:"#fff", fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:20, letterSpacing:"0.05em", flexShrink:0 }}>URGENTE</span>}
                  <div style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>{r.product}</div>
                </div>
                <div style={{ fontSize:13, color:"#64748b" }}>por <strong>{r.requestedBy}</strong> • {ptD(r.createdAt)}</div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6, marginLeft:8 }}>
                <Badge s={r.status} />
                {isPending && daysAgo > 0 && (
                  <span style={{ ...ls.muted, fontWeight:600, color:daysAgo > 7 ? "#dc2626" : daysAgo > 3 ? "#d97706" : "#94a3b8" }}>
                    {daysAgo}d pendente
                  </span>
                )}
              </div>
            </div>

            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
              <span style={ls.pill}>{r.qty} {r.unit}</span>
              {r.brand      && <span style={ls.pill}>Marca: {r.brand}</span>}
              {r.approved === true  && <span style={{ ...ls.pill, background:"#f0fdf4", color:"#15803d" }}>✓ Aprovado{r.approvedBy ? ` por ${r.approvedBy}` : ""}</span>}
              {r.approved === false && <span style={{ ...ls.pill, background:"#fef2f2", color:"#dc2626" }}>✗ Reprovado</span>}
              {r.value !== "" && r.value != null && <span style={{ ...ls.pill, background:"#fffbeb", color:"#b45309" }}>💰 {brl(r.value)}</span>}
              {r.empresa     && <span style={{ ...ls.pill, background:"#f0fdf4", color:"#15803d" }}>🏪 {r.empresa}</span>}
              {r.purchasedBy && <span style={ls.pill}>Comprado por: {r.purchasedBy}</span>}
            </div>

            {(r.notes || r.editedAt || (r.status === "reprovado" && r.reprovadoMotivo)) && (
              <div style={{ marginBottom:10 }}>
                {r.notes && <div style={{ fontSize:13, color:"#64748b", fontStyle:"italic" }}>"{r.notes}"</div>}
                {r.status === "reprovado" && r.reprovadoMotivo && (
                  <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:7, padding:"8px 12px", marginTop:r.notes ? 6 : 0 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:"#dc2626", textTransform:"uppercase", letterSpacing:"0.05em" }}>Motivo: </span>
                    <span style={{ fontSize:13, color:"#b91c1c" }}>{r.reprovadoMotivo}</span>
                  </div>
                )}
                {r.editedAt && <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>Editado em {ptDT(r.editedAt)}</div>}
              </div>
            )}

            <div style={{ borderTop:"1px solid #f8fafc", paddingTop:10, display:"flex", gap:8, flexWrap:"wrap" }}>
              <div style={{ display:"flex", gap:6, flex:1 }}>
                {!isExpanded && <Btn variant="ghost" style={{ fontSize:12, padding:"6px 12px" }} onClick={() => setExpanded(r.id)}>Mudar status ▾</Btn>}
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <Btn variant="ghost" style={{ fontSize:12, padding:"6px 12px" }} onClick={() => onEdit(r)}>Editar</Btn>
                {confirmDelete === r.id ? (
                  <>
                    <span style={{ fontSize:12, color:"#dc2626", alignSelf:"center", fontWeight:600 }}>Confirmar?</span>
                    <Btn variant="danger" style={{ fontSize:12, padding:"6px 12px" }} onClick={() => { onDelete(r.id); setConfirmDelete(null); }}>Sim, excluir</Btn>
                    <Btn variant="ghost"  style={{ fontSize:12, padding:"6px 12px" }} onClick={() => setConfirmDelete(null)}>Cancelar</Btn>
                  </>
                ) : (
                  <Btn variant="danger" style={{ fontSize:12, padding:"6px 12px" }} onClick={() => setConfirmDelete(r.id)}>Excluir</Btn>
                )}
              </div>
            </div>

            {isExpanded && (
              <div style={{ marginTop:10, display:"flex", flexWrap:"wrap", gap:6 }}>
                <div style={{ fontSize:12, color:"#64748b", width:"100%", marginBottom:2 }}>Alterar para:</div>
                {Object.entries(STATUS)
                  .filter(([k]) => k !== r.status && !(r.status === "reprovado" && k === "concluido"))
                  .map(([k, v]) => (
                    <button key={k} onClick={() => {
                      if (k === "concluido" || k === "reprovado") { onEdit(r); setExpanded(null); return; }
                      onStatusChange(r.id, k); setExpanded(null);
                    }} style={{ ...ls.btn, background:v.bg, color:v.tx, border:"none", fontSize:12, padding:"5px 11px" }}>
                      {v.label}
                    </button>
                  ))}
                <button onClick={() => setExpanded(null)} style={{ ...ls.btn, background:"#f1f5f9", color:"#94a3b8", border:"none", fontSize:12, padding:"5px 11px" }}>Cancelar</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── RelatoriosTab ────────────────────────────────────────────────────────────
function RelatoriosTab({ requests }) {
  const now = new Date();
  const [year,          setYear]          = useState(now.getFullYear());
  const [month,         setMonth]         = useState("all");
  const [productFilter, setProductFilter] = useState("");
  const [view,          setView]          = useState("geral");

  const years = [...new Set(requests.map(r => new Date(r.createdAt).getFullYear()))].sort((a,b) => b-a);
  if (!years.includes(now.getFullYear())) years.unshift(now.getFullYear());

  const filtered = requests.filter(r => {
    if (r.status !== "concluido") return false;
    const d = new Date(r.createdAt);
    if (d.getFullYear() !== year) return false;
    if (month !== "all" && d.getMonth() + 1 !== +month) return false;
    if (productFilter && !r.product.toLowerCase().includes(productFilter.toLowerCase())) return false;
    return true;
  });

  const totalSpent = filtered.reduce((s, r) => s + (r.value != null && r.value !== "" ? +r.value : 0), 0);
  const approved   = filtered.filter(r => r.approved === true).length;

  const byProduct = filtered.reduce((acc, r) => {
    const k = r.product.toLowerCase().trim();
    if (!acc[k]) acc[k] = { name:r.product, count:0, totalValue:0, lastDate:r.createdAt };
    acc[k].count++;
    if (r.value != null && r.value !== "") acc[k].totalValue += +r.value;
    if (r.createdAt > acc[k].lastDate) acc[k].lastDate = r.createdAt;
    return acc;
  }, {});

  const byMonth = Array.from({ length:12 }, (_, i) => {
    const m = i + 1;
    const items = requests.filter(r => {
      const d = new Date(r.createdAt);
      return r.status === "concluido" && d.getFullYear() === year && d.getMonth() + 1 === m;
    });
    return { month:MONTHS[i], count:items.length, spent:items.reduce((s,r) => s + (r.value != null && r.value !== "" ? +r.value : 0), 0) };
  });

  const thStyle = { padding:"10px 12px", textAlign:"left", color:"#64748b", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", borderBottom:"1px solid #e2e8f0", whiteSpace:"nowrap" };
  const tdStyle = { padding:"10px 12px", borderBottom:"1px solid #f1f5f9" };

  const statCard = (label, value, sub, color="#0f172a") => (
    <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, padding:"14px 16px", flex:"1 1 120px", minWidth:100 }}>
      <div style={{ fontSize:11, color:"#94a3b8", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:700, color }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <select style={{ ...ls.select, flex:1, minWidth:80 }}  value={year}  onChange={e => setYear(+e.target.value)}>
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
        <select style={{ ...ls.select, flex:2, minWidth:120 }} value={month} onChange={e => setMonth(e.target.value)}>
          <option value="all">Todos os meses</option>
          {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <input style={{ ...ls.input, flex:2, minWidth:140 }} placeholder="Filtrar por produto..." value={productFilter} onChange={e => setProductFilter(e.target.value)} />
      </div>

      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:20 }}>
        {statCard("Concluídas", filtered.length)}
        {statCard("Gasto total", totalSpent > 0 ? brl(totalSpent) : "R$ 0", null, "#b45309")}
        {statCard("Aprovadas", approved, `de ${filtered.length}`)}
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        {[["geral","Lista geral"],["por_produto","Por produto"],["mensal","Por mês"]].map(([k,l]) => (
          <button key={k} onClick={() => setView(k)} style={{ ...ls.btn, background:view===k ? "#0f172a" : "#f1f5f9", color:view===k ? "#fff" : "#475569", border:"none", fontSize:13 }}>{l}</button>
        ))}
      </div>

      {view === "geral" && (
        filtered.length === 0
          ? <div style={{ textAlign:"center", padding:"40px", color:"#94a3b8" }}>Nenhum item concluído no período</div>
          : <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead><tr style={{ background:"#f8fafc" }}>
                  {["Data","Produto","Qtd","Solicitado por","Aprovação","Empresa","Valor"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id}>
                      <td style={tdStyle}>{ptD(r.createdAt)}</td>
                      <td style={tdStyle}><div style={{ fontWeight:600 }}>{r.product}</div>{r.brand && <div style={{ fontSize:11, color:"#94a3b8" }}>{r.brand}</div>}</td>
                      <td style={tdStyle}>{r.qty} {r.unit}</td>
                      <td style={tdStyle}>{r.requestedBy}</td>
                      <td style={tdStyle}>
                        {r.approved === true  && <span style={{ color:"#15803d", fontWeight:600 }}>✓ Aprovado</span>}
                        {r.approved === false && <span style={{ color:"#dc2626", fontWeight:600 }}>✗ Reprovado</span>}
                        {r.approved === null  && <span style={{ color:"#94a3b8" }}>—</span>}
                        {r.approvedBy && <div style={{ fontSize:11, color:"#94a3b8" }}>{r.approvedBy}</div>}
                      </td>
                      <td style={tdStyle}>{r.empresa || "—"}</td>
                      <td style={{ ...tdStyle, fontWeight:600, color:"#b45309", whiteSpace:"nowrap" }}>{r.value != null && r.value !== "" ? brl(r.value) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                {totalSpent > 0 && (
                  <tfoot><tr style={{ background:"#fffbeb" }}>
                    <td colSpan={6} style={{ padding:"10px 12px", fontWeight:700, color:"#b45309", textAlign:"right" }}>Total:</td>
                    <td style={{ padding:"10px 12px", fontWeight:700, color:"#b45309", whiteSpace:"nowrap" }}>{brl(totalSpent)}</td>
                  </tr></tfoot>
                )}
              </table>
            </div>
      )}

      {view === "por_produto" && (
        Object.keys(byProduct).length === 0
          ? <div style={{ textAlign:"center", padding:"40px", color:"#94a3b8" }}>Nenhum item no período</div>
          : <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead><tr style={{ background:"#f8fafc" }}>
                  {["Produto","Qtd compras","Valor total","Última compra"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {Object.values(byProduct).sort((a,b) => b.count - a.count).map(p => (
                    <tr key={p.name} style={{ borderBottom:"1px solid #f1f5f9" }}>
                      <td style={tdStyle}><span style={{ fontWeight:600 }}>{p.name}</span></td>
                      <td style={tdStyle}>{p.count}×</td>
                      <td style={{ ...tdStyle, fontWeight:600, color:"#b45309" }}>{p.totalValue > 0 ? brl(p.totalValue) : "—"}</td>
                      <td style={{ ...tdStyle, color:"#64748b" }}>{ptD(p.lastDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
      )}

      {view === "mensal" && (
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead><tr style={{ background:"#f8fafc" }}>
              {["Mês","Compras concluídas","Total gasto"].map(h => <th key={h} style={thStyle}>{h}</th>)}
            </tr></thead>
            <tbody>
              {byMonth.map((m,i) => (
                <tr key={i} style={{ borderBottom:"1px solid #f1f5f9", background:m.count > 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ ...tdStyle, fontWeight:m.count > 0 ? 600 : 400, color:m.count > 0 ? "#0f172a" : "#cbd5e1" }}>{m.month}</td>
                  <td style={{ ...tdStyle, color:m.count > 0 ? "#0f172a" : "#cbd5e1" }}>{m.count > 0 ? m.count : "—"}</td>
                  <td style={{ ...tdStyle, fontWeight:600, color:m.spent > 0 ? "#b45309" : "#cbd5e1" }}>{m.spent > 0 ? brl(m.spent) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── App (root) ───────────────────────────────────────────────────────────────
const NAV = [
  { key:"solicitar",    label:"Solicitar",   icon:"＋" },
  { key:"solicitacoes", label:"Solicitações", icon:"☰" },
  { key:"relatorios",   label:"Relatórios",  icon:"📊" },
];

export default function App() {
  const [tab,      setTab]      = useState("solicitar");
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(null);
  const [toast,    setToast]    = useState(null);

  const notify = (msg, type="success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Realtime listener ──
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "solicitacoes"),
      (snap) => {
        const docs = snap.docs
          .map(toApp)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setRequests(docs);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  // ── CRUD ──
  const addRequest = async (data) => {
    try {
      await addDoc(collection(db, "solicitacoes"), {
        product:         data.product,
        requestedBy:     data.requestedBy,
        qty:             data.qty,
        unit:            data.unit,
        brand:           data.brand,
        notes:           data.notes,
        urgente:         data.urgente,
        status:          "pendente",
        approved:        null,
        approvedBy:      "",
        purchasedBy:     "",
        empresa:         "",
        value:           null,
        reprovadoMotivo: "",
        createdAt:       serverTimestamp(),
        editedAt:        null,
      });
      notify("Solicitação enviada com sucesso!");
    } catch { notify("Erro ao salvar. Tente novamente.", "error"); }
  };

  const updateRequest = async (id, changes) => {
    try {
      const payload = {
        product:         changes.product,
        requestedBy:     changes.requestedBy,
        qty:             changes.qty,
        unit:            changes.unit,
        brand:           changes.brand,
        notes:           changes.notes,
        status:          changes.status,
        approved:        changes.approved,
        approvedBy:      changes.approvedBy,
        purchasedBy:     changes.purchasedBy,
        empresa:         changes.empresa,
        value:           changes.value === "" ? null : changes.value,
        reprovadoMotivo: changes.reprovadoMotivo,
        editedAt:        serverTimestamp(),
      };
      await updateDoc(doc(db, "solicitacoes", id), payload);
      notify("Atualizado com sucesso!");
    } catch { notify("Erro ao atualizar. Tente novamente.", "error"); }
  };

  const deleteRequest = async (id) => {
    try {
      await deleteDoc(doc(db, "solicitacoes", id));
      notify("Solicitação excluída.", "info");
    } catch { notify("Erro ao excluir. Tente novamente.", "error"); }
  };

  const statusChange = (id, status) => updateRequest(id, { ...requests.find(r => r.id === id), status });

  const pending = requests.filter(r => r.status !== "concluido" && r.status !== "reprovado").length;

  if (loading) return (
    <div style={{ display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", minHeight:"100vh", gap:12, color:"#94a3b8", fontFamily:"system-ui, sans-serif" }}>
      <div style={{ width:32, height:32, border:"3px solid #e2e8f0", borderTop:"3px solid #f59e0b", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      <div style={{ fontSize:14 }}>Carregando solicitações...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  return (
    <div style={{ fontFamily:"system-ui, -apple-system, sans-serif", minHeight:"100vh", background:"#f8fafc", paddingBottom:72 }}>
      <div style={{ background:"#0f172a", padding:"14px 20px 16px", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ maxWidth:700, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ color:"#f59e0b", fontSize:11, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:2 }}>FRISPAR — MANUTENÇÃO</div>
            <div style={{ color:"#fff", fontSize:17, fontWeight:700 }}>Solicitações de Compra</div>
          </div>
          {pending > 0 && (
            <div style={{ background:"#f59e0b", color:"#000", borderRadius:20, padding:"4px 12px", fontSize:13, fontWeight:700 }}>
              {pending} pendente{pending > 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth:700, margin:"0 auto", padding:"20px 16px" }}>
        {tab === "solicitar"    && <SolicitarTab onAdd={addRequest} />}
        {tab === "solicitacoes" && <SolicitacoesTab requests={requests} onEdit={setEditing} onDelete={deleteRequest} onStatusChange={statusChange} />}
        {tab === "relatorios"   && <RelatoriosTab requests={requests} />}
      </div>

      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"#fff", borderTop:"1px solid #e2e8f0", display:"flex", zIndex:100, paddingBottom:"env(safe-area-inset-bottom)" }}>
        {NAV.map(n => (
          <button key={n.key} onClick={() => setTab(n.key)} style={{ flex:1, padding:"10px 4px 8px", background:"none", border:"none", cursor:"pointer", color:tab===n.key ? "#f59e0b" : "#94a3b8", display:"flex", flexDirection:"column", alignItems:"center", gap:3, fontFamily:"inherit" }}>
            <span style={{ fontSize:18, lineHeight:1 }}>{n.icon}</span>
            <span style={{ fontSize:11, fontWeight:tab===n.key ? 700 : 400 }}>{n.label}</span>
          </button>
        ))}
      </div>

      {editing && (
        <EditModal req={editing} onSave={(changes) => updateRequest(editing.id, changes)} onClose={() => setEditing(null)} />
      )}

      {toast && (
        <div style={{ position:"fixed", bottom:80, left:"50%", transform:"translateX(-50%)", background:toast.type==="success" ? "#16a34a" : toast.type==="info" ? "#3b82f6" : "#dc2626", color:"#fff", padding:"10px 20px", borderRadius:20, fontSize:14, fontWeight:600, zIndex:300, whiteSpace:"nowrap" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
