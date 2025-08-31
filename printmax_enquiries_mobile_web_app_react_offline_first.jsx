import React, { useEffect, useMemo, useState } from "react";

// PRINTMAX ENQUIRIES – single-file React app
// Mobile-first, offline-friendly (localStorage). No backend required.
// Features: Login (Admin/Staff), custom users, categories, enquiry CRUD, statuses,
// filters/search, reminders, WhatsApp quick-reply, import/export backup.
// Tailwind classes are used for styling.

// ----------------------- Types -----------------------
const STATUSES = ["Pending", "In Progress", "Completed", "Cancelled"] as const;
const CHANNELS = ["In-shop", "WhatsApp", "Call", "Online"] as const;

type Status = typeof STATUSES[number];
type Channel = typeof CHANNELS[number];

type User = {
  id: string;
  name: string;
  role: "admin" | "staff";
};

type Enquiry = {
  id: string;
  title: string;
  category: string;
  customerName: string;
  phone?: string;
  channel: Channel;
  status: Status;
  createdAt: string; // ISO
  dueAt?: string; // ISO
  notes?: string;
  assignedTo?: string; // userId
};

type Store = {
  users: User[];
  categories: string[];
  enquiries: Enquiry[];
  currentUserId?: string;
};

// ----------------------- Storage -----------------------
const LS_KEY = "printmax_enquiries_v1";
function loadStore(): Store {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    users: [
      { id: crypto.randomUUID(), name: "Admin", role: "admin" },
      { id: crypto.randomUUID(), name: "Shop", role: "staff" },
    ],
    categories: [
      "Signage",
      "Sticker Fixing",
      "Gift Printing",
      "Document Printing",
      "Plotting",
      "T-shirt",
    ],
    enquiries: [],
  };
}

function saveStore(s: Store) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

// ----------------------- Helpers -----------------------
const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "—");
const todayISO = () => new Date().toISOString();
const dateOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isOverdue = (iso?: string) => {
  if (!iso) return false;
  const due = new Date(iso);
  const now = new Date();
  return due.getTime() < now.getTime();
};

// Builds a WhatsApp deeplink with optional text
function waLink(phone?: string, text?: string) {
  const base = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : "https://wa.me";
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return base + q;
}

// ----------------------- UI Primitives -----------------------
function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`px-2 py-1 rounded-full text-xs font-medium ${className}`}>{children}</span>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 ${className}`}>{children}</div>
  );
}

function Button({ children, onClick, type = "button", className = "", disabled = false }:{ children: React.ReactNode; onClick?: () => void; type?: "button" | "submit"; className?: string; disabled?: boolean }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-2xl border text-sm shadow-sm active:scale-[.99] disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

function Input({ value, onChange, placeholder = "", type = "text", className = "", required=false }:{ value?: any; onChange?: any; placeholder?: string; type?: string; className?: string; required?: boolean }){
  return (
    <input value={value} onChange={onChange} placeholder={placeholder} type={type}
      required={required}
      className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 ${className}`} />
  );
}

function TextArea({ value, onChange, placeholder = "", className = "" }:{ value?: any; onChange?: any; placeholder?: string; className?: string }){
  return (
    <textarea value={value} onChange={onChange} placeholder={placeholder}
      className={`w-full border rounded-xl px-3 py-2 text-sm min-h-[90px] focus:outline-none focus:ring-2 focus:ring-black/5 ${className}`} />
  );
}

function Select({ value, onChange, children, className = "" }:{ value: any; onChange: any; children: React.ReactNode; className?: string }){
  return (
    <select value={value} onChange={onChange}
      className={`w-full border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/5 ${className}`}>
      {children}
    </select>
  );
}

// ----------------------- Root App -----------------------
export default function PrintmaxApp(){
  const [store, setStore] = useState<Store>(() => loadStore());
  const currentUser = useMemo(() => store.users.find(u => u.id === store.currentUserId), [store]);
  useEffect(() => { saveStore(store); }, [store]);

  const login = (userId: string) => setStore(s => ({...s, currentUserId: userId }));
  const logout = () => setStore(s => ({...s, currentUserId: undefined }));

  const upsertEnquiry = (e: Enquiry) => setStore(s => ({...s, enquiries: upsertById(s.enquiries, e)}));
  const deleteEnquiry = (id: string) => setStore(s => ({...s, enquiries: s.enquiries.filter(x => x.id !== id)}));

  const addCategory = (name: string) => setStore(s => ({...s, categories: uniq([...s.categories, titleCase(name)])}));
  const removeCategory = (name: string) => setStore(s => ({...s, categories: s.categories.filter(c => c !== name)}));

  const addUser = (name: string, role: User["role"]) => setStore(s => ({...s, users: [...s.users, { id: crypto.randomUUID(), name: titleCase(name), role }]}));
  const removeUser = (id: string) => setStore(s => ({...s, users: s.users.filter(u => u.id !== id)}));

  const exportData = () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `printmax_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const importData = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        setStore(data);
      } catch(e){ alert("Invalid JSON file"); }
    };
    reader.readAsText(file);
  };

  // Reminders: due today or overdue & not completed/cancelled
  const dueSoon = useMemo(() => {
    const now = new Date();
    const todayStart = dateOnly(now).getTime();
    const todayEnd = todayStart + 24*60*60*1000 - 1;
    return store.enquiries.filter(e => e.dueAt && !["Completed","Cancelled"].includes(e.status) && (() => {
      const t = new Date(e.dueAt!).getTime();
      return t <= todayEnd; })());
  }, [store.enquiries]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <TopBar currentUser={currentUser} onLogout={logout} exportData={exportData} importData={importData} />
      <div className="mx-auto max-w-4xl p-4 pb-24">
        {!currentUser ? (
          <Login users={store.users} onLogin={login} onAddUser={addUser} />
        ) : (
          <Main
            store={store}
            setStore={setStore}
            upsertEnquiry={upsertEnquiry}
            deleteEnquiry={deleteEnquiry}
            addCategory={addCategory}
            removeCategory={removeCategory}
            addUser={addUser}
            removeUser={removeUser}
            dueSoon={dueSoon}
          />
        )}
      </div>
      <BottomNav />
    </div>
  );
}

// ----------------------- Components -----------------------
function TopBar({ currentUser, onLogout, exportData, importData }:{ currentUser?: User; onLogout: () => void; exportData: () => void; importData: (f: File) => void; }){
  return (
    <div className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b">
      <div className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🖨️</span>
          <div className="font-bold">PRINTMAX ENQUIRIES</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs hidden sm:block">Backup</label>
          <Button className="border-gray-300" onClick={exportData}>Export</Button>
          <label className="border px-4 py-2 rounded-2xl text-sm shadow-sm cursor-pointer">
            Import<input type="file" accept="application/json" className="hidden" onChange={(e)=>{ if(e.target.files?.[0]) importData(e.target.files[0]); }}/>
          </label>
          {currentUser && (
            <div className="flex items-center gap-2">
              <Pill className="bg-gray-100">{currentUser.name} ({currentUser.role})</Pill>
              <Button className="border-gray-300" onClick={onLogout}>Logout</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BottomNav(){
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-sm">
      <div className="mx-auto max-w-4xl grid grid-cols-3 text-center text-xs">
        <div className="p-2">Mobile-first • Works offline</div>
        <div className="p-2">WhatsApp Quick Reply</div>
        <div className="p-2">Import/Export Backup</div>
      </div>
    </div>
  );
}

function Login({ users, onLogin, onAddUser }:{ users: User[]; onLogin: (id: string)=>void; onAddUser: (name: string, role: User["role"])=>void; }){
  const [name, setName] = useState("");
  const [role, setRole] = useState<User["role"]>("staff");
  return (
    <div className="grid gap-4">
      <Card className="p-4">
        <div className="text-lg font-semibold mb-2">Select User</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {users.map(u => (
            <button key={u.id} onClick={()=>onLogin(u.id)} className="border rounded-xl p-3 text-left hover:bg-gray-50">
              <div className="font-medium">{u.name}</div>
              <div className="text-xs text-gray-500">{u.role}</div>
            </button>
          ))}
        </div>
      </Card>
      <Card className="p-4">
        <div className="text-lg font-semibold mb-2">Add New User</div>
        <div className="grid sm:grid-cols-3 gap-2">
          <Input placeholder="Name" value={name} onChange={(e:any)=>setName(e.target.value)} />
          <Select value={role} onChange={(e:any)=>setRole(e.target.value)}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </Select>
          <Button className="border-gray-300" onClick={()=>{ if(!name.trim()) return; onAddUser(name.trim(), role); setName(""); }}>Add User</Button>
        </div>
      </Card>
    </div>
  );
}

function Main({ store, setStore, upsertEnquiry, deleteEnquiry, addCategory, removeCategory, addUser, removeUser, dueSoon }:{ store: Store; setStore: (s: any)=>void; upsertEnquiry: (e: Enquiry)=>void; deleteEnquiry: (id: string)=>void; addCategory: (n: string)=>void; removeCategory: (n: string)=>void; addUser: (n: string, r: User["role"])=>void; removeUser: (id: string)=>void; dueSoon: Enquiry[]; }){
  const [tab, setTab] = useState<"dashboard" | "enquiries" | "settings">("dashboard");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status | "">("");
  const [cat, setCat] = useState<string | "">("");
  const [channel, setChannel] = useState<Channel | "">("");
  const [assignee, setAssignee] = useState<string | "">("");

  const filtered = useMemo(() => {
    return store.enquiries.filter(e => {
      if (status && e.status !== status) return false;
      if (cat && e.category !== cat) return false;
      if (channel && e.channel !== channel) return false;
      if (assignee && e.assignedTo !== assignee) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = [e.title, e.customerName, e.notes, e.phone].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a,b)=> new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [store.enquiries, status, cat, channel, assignee, query]);

  const pending = store.enquiries.filter(e => e.status === "Pending");
  const inprog = store.enquiries.filter(e => e.status === "In Progress");
  const completed = store.enquiries.filter(e => e.status === "Completed");

  return (
    <div className="grid gap-4">
      <Card className="p-4">
        <div className="flex gap-2 text-sm">
          <TabButton label="Dashboard" active={tab==="dashboard"} onClick={()=>setTab("dashboard")} />
          <TabButton label="Enquiries" active={tab==="enquiries"} onClick={()=>setTab("enquiries")} />
          <TabButton label="Settings" active={tab==="settings"} onClick={()=>setTab("settings")} />
        </div>
      </Card>

      {tab === "dashboard" && (
        <div className="grid sm:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="text-sm text-gray-500">Due Today / Overdue</div>
            <div className="text-3xl font-bold">{dueSoon.length}</div>
            <div className="mt-2 grid gap-2 max-h-64 overflow-auto pr-1">
              {dueSoon.slice(0,6).map(e => (
                <DashRow key={e.id} e={e} onQuick={(status: Status)=>upsertEnquiry({...e, status})} />
              ))}
              {dueSoon.length===0 && <div className="text-sm text-gray-500">All clear 🎉</div>}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-gray-500">Pending</div>
            <div className="text-3xl font-bold">{pending.length}</div>
            <div className="mt-2 text-xs text-gray-500">Keep up with callbacks and WhatsApp replies.</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-gray-500">Completed</div>
            <div className="text-3xl font-bold">{completed.length}</div>
            <div className="mt-2 text-xs text-gray-500">Great job 👏</div>
          </Card>
        </div>
      )}

      {tab === "enquiries" && (
        <Card className="p-4">
          <div className="grid gap-3">
            <div className="grid sm:grid-cols-6 gap-2">
              <Input placeholder="Search" value={query} onChange={(e:any)=>setQuery(e.target.value)} className="sm:col-span-2" />
              <Select value={status} onChange={(e:any)=>setStatus(e.target.value)}>
                <option value="">All Status</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
              <Select value={cat} onChange={(e:any)=>setCat(e.target.value)}>
                <option value="">All Categories</option>
                {store.categories.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Select value={channel} onChange={(e:any)=>setChannel(e.target.value)}>
                <option value="">All Channels</option>
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Select value={assignee} onChange={(e:any)=>setAssignee(e.target.value)}>
                <option value="">All Assignees</option>
                {store.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </div>
            <EnquiryForm categories={store.categories} users={store.users} onCreate={(e)=>upsertEnquiry(e)} />
            <div className="-mx-2">
              {filtered.length === 0 ? (
                <div className="text-sm text-gray-500 px-2">No enquiries yet. Add your first above.</div>
              ) : filtered.map(e => (
                <EnquiryRow key={e.id} e={e} users={store.users} onChange={upsertEnquiry} onDelete={deleteEnquiry} />
              ))}
            </div>
          </div>
        </Card>
      )}

      {tab === "settings" && (
        <SettingsPanel store={store} addCategory={addCategory} removeCategory={removeCategory} addUser={addUser} removeUser={removeUser} setStore={setStore} />
      )}
    </div>
  );
}

function TabButton({ label, active, onClick }:{ label: string; active: boolean; onClick: ()=>void; }){
  return (
    <button onClick={onClick} className={`px-3 py-2 rounded-xl text-sm border ${active?"bg-gray-900 text-white border-gray-900":"border-gray-300 bg-white"}`}>{label}</button>
  );
}

function DashRow({ e, onQuick }:{ e: Enquiry; onQuick: (s: Status)=>void; }){
  return (
    <div className="border rounded-xl p-2 text-sm flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{e.title} <span className="text-gray-400">• {e.category}</span></div>
        <div className="text-xs text-gray-500 truncate">{e.customerName} • Due {fmtDate(e.dueAt)}</div>
      </div>
      <a className="underline text-xs" href={waLink(e.phone, `Hello ${e.customerName}, following up on: ${e.title}`)} target="_blank" rel="noreferrer">WhatsApp</a>
      <Select value="" onChange={(ev:any)=> { const v = ev.target.value as Status; if(v) onQuick(v); }} className="w-[140px]">
        <option value="">Mark as…</option>
        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
      </Select>
    </div>
  );
}

function EnquiryForm({ categories, users, onCreate }:{ categories: string[]; users: User[]; onCreate: (e: Enquiry)=>void; }){
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(categories[0] || "");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<Channel>("In-shop");
  const [status, setStatus] = useState<Status>("Pending");
  const [dueAt, setDueAt] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>(users[0]?.id || "");

  useEffect(()=>{ if(!categories.includes(category) && categories.length>0) setCategory(categories[0]); }, [categories]);
  useEffect(()=>{ if(!users.find(u=>u.id===assignedTo) && users[0]) setAssignedTo(users[0].id); }, [users]);

  const clear = () => {
    setTitle(""); setCustomerName(""); setPhone(""); setNotes("");
    setChannel("In-shop"); setStatus("Pending"); setDueAt("");
  };

  const handleSubmit = (e:any) => {
    e.preventDefault();
    if (!title.trim() || !customerName.trim()) return;
    const item: Enquiry = {
      id: crypto.randomUUID(),
      title: title.trim(),
      category,
      customerName: titleCase(customerName.trim()),
      phone: phone.trim(),
      channel,
      status,
      createdAt: todayISO(),
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      notes: notes.trim(),
      assignedTo,
    };
    onCreate(item); setOpen(false); clear();
  };

  return (
    <div className="border rounded-2xl p-3">
      {!open ? (
        <div className="flex items-center gap-2">
          <Button className="border-gray-300" onClick={()=>setOpen(true)}>+ Add Enquiry</Button>
          <div className="text-xs text-gray-500">Quickly log in-shop / WhatsApp / call enquiries.</div>
        </div>
      ) : (
        <form className="grid sm:grid-cols-2 gap-2" onSubmit={handleSubmit}>
          <Input placeholder="Enquiry Title (e.g., T-shirt printing)" value={title} onChange={(e:any)=>setTitle(e.target.value)} required />
          <Select value={category} onChange={(e:any)=>setCategory(e.target.value)}>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input placeholder="Customer Name" value={customerName} onChange={(e:any)=>setCustomerName(e.target.value)} required />
          <Input placeholder="Phone (WhatsApp)" value={phone} onChange={(e:any)=>setPhone(e.target.value)} />
          <Select value={channel} onChange={(e:any)=>setChannel(e.target.value)}>
            {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select value={status} onChange={(e:any)=>setStatus(e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Input type="datetime-local" value={dueAt} onChange={(e:any)=>setDueAt(e.target.value)} />
          <Select value={assignedTo} onChange={(e:any)=>setAssignedTo(e.target.value)}>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          <div className="sm:col-span-2">
            <TextArea placeholder="Notes (specs, sizes, quantity)" value={notes} onChange={(e:any)=>setNotes(e.target.value)} />
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <Button type="submit" className="border-gray-900 bg-gray-900 text-white">Save</Button>
            <Button className="border-gray-300" onClick={(e)=>{ e.preventDefault(); setOpen(false); }}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}

function EnquiryRow({ e, users, onChange, onDelete }:{ e: Enquiry; users: User[]; onChange: (e: Enquiry)=>void; onDelete: (id:string)=>void; }){
  const assignee = users.find(u => u.id === e.assignedTo);
  const [editing, setEditing] = useState(false);

  const [local, setLocal] = useState<Enquiry>(e);
  useEffect(()=> setLocal(e), [e.id]);

  const save = () => { onChange(local); setEditing(false); };

  return (
    <div className="px-2 py-2">
      <Card className={`p-3 ${isOverdue(e.dueAt) && !["Completed","Cancelled"].includes(e.status) ? "border-red-300" : ""}`}>
        <div className="flex items-center gap-2">
          <Pill className="bg-gray-100">{e.category}</Pill>
          <Pill className="bg-gray-100">{e.channel}</Pill>
          <Pill className={
            e.status === 'Completed' ? 'bg-green-100' : e.status === 'In Progress' ? 'bg-yellow-100' : e.status === 'Cancelled' ? 'bg-gray-200' : 'bg-red-100'
          }>{e.status}</Pill>
          <div className="ml-auto flex items-center gap-2">
            <a className="underline text-xs" href={waLink(e.phone, `Hi ${e.customerName}, update on: ${e.title}`)} target="_blank" rel="noreferrer">WhatsApp</a>
            {!editing && <Button className="border-gray-300" onClick={()=>setEditing(true)}>Edit</Button>}
            {editing && <Button className="border-gray-900 bg-gray-900 text-white" onClick={save}>Save</Button>}
            {editing && <Button className="border-gray-300" onClick={()=>{ setLocal(e); setEditing(false); }}>Cancel</Button>}
            <Button className="border-red-300 text-red-600" onClick={()=>{ if(confirm('Delete enquiry?')) onDelete(e.id); }}>Delete</Button>
          </div>
        </div>
        {!editing ? (
          <div className="mt-2 grid gap-1 text-sm">
            <div className="font-medium">{e.title}</div>
            <div className="text-gray-600">{e.customerName} {e.phone && <>• <a className="underline" href={`tel:${e.phone}`}>{e.phone}</a></>}</div>
            <div className="text-gray-500 text-xs">Created {fmtDate(e.createdAt)} • Due {fmtDate(e.dueAt)} • Assigned to {assignee?.name || '—'}</div>
            {e.notes && <div className="text-gray-700 whitespace-pre-wrap">{e.notes}</div>}
          </div>
        ) : (
          <div className="mt-2 grid sm:grid-cols-2 gap-2 text-sm">
            <Input value={local.title} onChange={(ev:any)=>setLocal({...local, title: ev.target.value})} />
            <Select value={local.category} onChange={(ev:any)=>setLocal({...local, category: ev.target.value})}>
              {/* Options injected via parent at render time through closure? Not accessible; keep as free text alternative */}
              <option value={local.category}>{local.category}</option>
            </Select>
            <Input value={local.customerName} onChange={(ev:any)=>setLocal({...local, customerName: ev.target.value})} />
            <Input value={local.phone} onChange={(ev:any)=>setLocal({...local, phone: ev.target.value})} />
            <Select value={local.channel} onChange={(ev:any)=>setLocal({...local, channel: ev.target.value as Channel})}>
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select value={local.status} onChange={(ev:any)=>setLocal({...local, status: ev.target.value as Status})}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Input type="datetime-local" value={toLocalDT(local.dueAt)} onChange={(ev:any)=>setLocal({...local, dueAt: fromLocalDT(ev.target.value)})} />
            <Select value={local.assignedTo || ""} onChange={(ev:any)=>setLocal({...local, assignedTo: ev.target.value})}>
              <option value="">—</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <div className="sm:col-span-2">
              <TextArea value={local.notes} onChange={(ev:any)=>setLocal({...local, notes: ev.target.value})} />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function SettingsPanel({ store, addCategory, removeCategory, addUser, removeUser, setStore }:{ store: Store; addCategory: (n: string)=>void; removeCategory: (n: string)=>void; addUser: (n: string, r: User["role"])=>void; removeUser: (id: string)=>void; setStore: (s: any)=>void; }){
  const [newCat, setNewCat] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<User["role"]>("staff");

  return (
    <div className="grid gap-4">
      <Card className="p-4">
        <div className="font-semibold mb-2">Categories</div>
        <div className="flex gap-2 mb-2">
          <Input placeholder="Add category (e.g., Sticker Fixing)" value={newCat} onChange={(e:any)=>setNewCat(e.target.value)} />
          <Button className="border-gray-300" onClick={()=>{ if(!newCat.trim()) return; addCategory(newCat.trim()); setNewCat(""); }}>Add</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {store.categories.map(c => (
            <span key={c} className="flex items-center gap-2 border rounded-full px-3 py-1 text-sm">
              {c}
              <button className="text-red-500" onClick={()=>removeCategory(c)}>×</button>
            </span>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="font-semibold mb-2">Users</div>
        <div className="grid sm:grid-cols-3 gap-2 mb-2">
          <Input placeholder="Name" value={name} onChange={(e:any)=>setName(e.target.value)} />
          <Select value={role} onChange={(e:any)=>setRole(e.target.value)}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </Select>
          <Button className="border-gray-300" onClick={()=>{ if(!name.trim()) return; addUser(name.trim(), role); setName(""); }}>Add User</Button>
        </div>
        <div className="grid gap-2">
          {store.users.map(u => (
            <div key={u.id} className="flex items-center gap-2 border rounded-xl p-2">
              <div className="flex-1">
                <div className="font-medium">{u.name}</div>
                <div className="text-xs text-gray-500">{u.role}</div>
              </div>
              <Button className="border-red-300 text-red-600" onClick={()=>removeUser(u.id)}>Remove</Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="font-semibold mb-2">Reset</div>
        <div className="flex items-center gap-2">
          <Button className="border-red-300 text-red-600" onClick={()=>{ if(confirm('Clear all local data?')) { localStorage.removeItem(LS_KEY); location.reload(); } }}>Clear Local Data</Button>
          <div className="text-xs text-gray-500">This only affects this device/browser.</div>
        </div>
      </Card>
    </div>
  );
}

// ----------------------- Utils -----------------------
function upsertById<T extends { id: string }>(arr: T[], item: T): T[] {
  const i = arr.findIndex(x => x.id === item.id);
  if (i === -1) return [item, ...arr];
  const copy = arr.slice();
  copy[i] = item; return copy;
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr as any));
}

function titleCase(s: string){
  return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

function toLocalDT(iso?: string){
  if(!iso) return "";
  const d = new Date(iso);
  const pad = (n:number)=>String(n).padStart(2,'0');
  const y=d.getFullYear(); const m=pad(d.getMonth()+1); const day=pad(d.getDate());
  const hh=pad(d.getHours()); const mm=pad(d.getMinutes());
  return `${y}-${m}-${day}T${hh}:${mm}`;
}
function fromLocalDT(local: string){
  if(!local) return undefined;
  const d = new Date(local);
  return d.toISOString();
}
