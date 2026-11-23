import React, { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, Boxes, Users, Truck, ShoppingCart, Factory, Receipt,
  Wallet, ChartNoAxesCombined, ClipboardList, Settings, Search, Bell,
  ChevronDown, CalendarDays, ArrowDownToLine, ArrowUpFromLine, Banknote,
  CreditCard, Landmark, PackagePlus, RefreshCw, LogOut, Menu, X, LockKeyhole
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

const money = (v=0) => new Intl.NumberFormat("ar-JO", {style:"currency",currency:"JOD",maximumFractionDigits:2}).format(Number(v)||0);
const nav = [
  ["لوحة التحكم",LayoutDashboard],["الحساب الأسبوعي",CalendarDays],["العملاء والذمم",Users],
  ["الموردون",Truck],["المخزون",Boxes],["مشتريات المخزون",PackagePlus],
  ["المبيعات والفواتير",ShoppingCart],["التصنيع",Factory],["المصاريف",Wallet],
  ["الصندوق والدفعات",Banknote],["الجرد والتقارير",ClipboardList],["الأرباح والخسائر",ChartNoAxesCombined]
];

function Stat({label,value,sub,icon:Icon,tone="blue"}) {
  return <article className="stat"><div className={`stat-icon ${tone}`}><Icon size={19}/></div><div><span>{label}</span><strong>{value}</strong>{sub&&<small>{sub}</small>}</div></article>
}

function Login({onLogin,loading,error}) {
  const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  return <div className="login-wrap"><form className="login-card" onSubmit={e=>{e.preventDefault();onLogin(email,password)}}>
    <div className="brand-mark">iF</div><h1>iFactory ERP</h1><p>نظام إدارة المصنع والحسابات</p>
    <label>البريد الإلكتروني<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label>
    <label>كلمة المرور<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/></label>
    {error&&<div className="error">{error}</div>}
    <button className="primary full" disabled={loading}>{loading?"جارٍ الدخول...":"تسجيل الدخول"}</button>
    <small className="muted">يجب إنشاء حساب المستخدم وتعيين صلاحياته في Supabase أولاً.</small>
  </form></div>
}

export default function App(){
  const [session,setSession]=useState(null), [loginLoading,setLoginLoading]=useState(false), [loginError,setLoginError]=useState("");
  const [active,setActive]=useState("لوحة التحكم"), [weeks,setWeeks]=useState([]), [weekId,setWeekId]=useState("");
  const [summary,setSummary]=useState({sales:0,received:0,expenses:0,purchases:0,debts:0});
  const [loading,setLoading]=useState(false), [error,setError]=useState(""), [mobileOpen,setMobileOpen]=useState(false);
  const [partyRows,setPartyRows]=useState([]), [partySearch,setPartySearch]=useState(""), [partyBusy,setPartyBusy]=useState(false);
  const [partyForm,setPartyForm]=useState({name:"",phone:"",email:"",address:"",notes:""});

  useEffect(()=>{ if(!supabase)return;
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>setSession(s));
    return ()=>subscription.unsubscribe();
  },[]);

  async function login(email,password){
    setLoginLoading(true);setLoginError("");
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error)setLoginError("تعذر تسجيل الدخول. تحقق من الحساب وكلمة المرور والصلاحيات.");
    setLoginLoading(false);
  }

  async function loadDashboard(){
    if(!supabase||!session)return;
    setLoading(true);setError("");
    try{
      const {data:ws,error:we}=await supabase.from("accounting_weeks").select("id,week_start,week_end,status").order("week_start",{ascending:false}).limit(30);
      if(we)throw we;
      setWeeks(ws||[]);
      const current=(ws||[]).find(w=>w.status==="open")||(ws||[])[0];
      if(!current){setSummary({sales:0,received:0,expenses:0,purchases:0,debts:0});setLoading(false);return;}
      setWeekId(current.id);
      const [inv,pay,exp] = await Promise.all([
        supabase.from("invoices").select("invoice_type,total,paid_amount").eq("accounting_week_id",current.id).in("status",["issued","partially_paid","paid"]),
        supabase.from("invoice_payments").select("amount").eq("accounting_week_id",current.id),
        supabase.from("expenses").select("amount,expense_scope").eq("accounting_week_id",current.id)
      ]);
      if(inv.error)throw inv.error;if(pay.error)throw pay.error;if(exp.error)throw exp.error;
      const invoices=inv.data||[], payments=pay.data||[], expenses=exp.data||[];
      setSummary({
        sales:invoices.filter(x=>x.invoice_type==="sales").reduce((a,x)=>a+Number(x.total||0),0),
        purchases:invoices.filter(x=>x.invoice_type==="purchase").reduce((a,x)=>a+Number(x.total||0),0),
        received:payments.reduce((a,x)=>a+Number(x.amount||0),0),
        expenses:expenses.filter(x=>x.expense_scope==="factory").reduce((a,x)=>a+Number(x.amount||0),0),
        debts:invoices.filter(x=>x.invoice_type==="sales").reduce((a,x)=>a+Number(x.total||0)-Number(x.paid_amount||0),0)
      });
    }catch(e){setError("تعذر تحميل بيانات الأسبوع. تأكد من صلاحيات المستخدم وربط الجداول.");}
    setLoading(false);
  }

  async function loadParties(kind=active){
    if(!supabase||!session)return;
    setPartyBusy(true);setError("");
    const isCustomer=kind==="العملاء والذمم";
    const table=isCustomer?"customers":"suppliers";
    const view=isCustomer?"customer_balances":"supplier_balances";
    const {data,error}=await supabase.from(table).select("*").order("created_at",{ascending:false});
    if(error){setError("تعذر تحميل السجلات. تحقق من صلاحيات دور المستخدم.");setPartyBusy(false);return;}
    const {data:balances,balanceError}=await supabase.from(view).select("*");
    const balanceMap=new Map((balances||[]).map(x=>[isCustomer?x.customer_id:x.supplier_id,Number(x.outstanding_amount||0)]));
    setPartyRows((data||[]).map(x=>({...x,outstanding_amount:balanceMap.get(x.id)||0})));
    setPartyBusy(false);
  }
  async function saveParty(e){
    e.preventDefault();
    const isCustomer=active==="العملاء والذمم";
    const payload=isCustomer
      ? {full_name:partyForm.name.trim(),phone:partyForm.phone||null,email:partyForm.email||null,address:partyForm.address||null,notes:partyForm.notes||null}
      : {company_name:partyForm.name.trim(),contact_name:partyForm.contact_name||null,phone:partyForm.phone||null,email:partyForm.email||null,address:partyForm.address||null,notes:partyForm.notes||null};
    if(!payload[isCustomer?"full_name":"company_name"])return;
    setPartyBusy(true);setError("");
    const {error}=await supabase.from(isCustomer?"customers":"suppliers").insert(payload);
    if(error){setError("لم يتم الحفظ. تأكد أن المستخدم لديه دور المبيعات للعملاء أو المستودع للموردين.");setPartyBusy(false);return;}
    setPartyForm({name:"",phone:"",email:"",address:"",notes:""});
    await loadParties(active);
  }

  useEffect(()=>{loadDashboard()},[session]);
  useEffect(()=>{if(session&&(active==="العملاء والذمم"||active==="الموردون"))loadParties(active)},[session,active]);

  if(!isSupabaseConfigured)return <div className="setup"><div className="setup-card"><div className="brand-mark">iF</div><h1>iFactory ERP</h1><h2>ملفات الواجهة جاهزة للربط</h2><p>أضف رابط مشروع Supabase ومفتاح Publishable أو anon داخل ملف <b>.env</b> بعد نسخه من <b>.env.example</b>.</p><p className="warning">لا تضع service_role أو أي مفتاح سري داخل الواجهة.</p><ol><li>افتح مجلد المشروع.</li><li>انسخ .env.example إلى .env.</li><li>أدخل بيانات الاتصال العامة من إعدادات Supabase.</li><li>شغّل npm install ثم npm run dev.</li></ol></div></div>;
  if(!session)return <Login onLogin={login} loading={loginLoading} error={loginError}/>;

  const current=weeks.find(w=>w.id===weekId)||weeks.find(w=>w.status==="open")||weeks[0];
  const net=summary.received-summary.expenses-summary.purchases;
  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen?"open":""}`}>
      <div className="brand"><div className="brand-mark">iF</div><div><b>iFactory ERP</b><small>إدارة المصنع الذكية</small></div><button className="close-nav" onClick={()=>setMobileOpen(false)}><X/></button></div>
      <div className="nav-caption">القائمة الرئيسية</div>
      <nav>{nav.map(([label,Icon])=><button key={label} className={active===label?"nav-item selected":"nav-item"} onClick={()=>{setActive(label);setMobileOpen(false)}}><Icon size={18}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><button className="nav-item"><Settings size={18}/>الإعدادات</button><button className="nav-item" onClick={()=>supabase.auth.signOut()}><LogOut size={18}/>تسجيل الخروج</button></div>
    </aside>
    {mobileOpen&&<div className="scrim" onClick={()=>setMobileOpen(false)}></div>}
    <main className="main">
      <header className="topbar"><button className="mobile-menu" onClick={()=>setMobileOpen(true)}><Menu/></button><div><span className="crumb">الرئيسية</span><b>{active}</b></div><div className="top-actions"><button className="icon-btn"><Search/></button><button className="icon-btn"><Bell/></button><div className="user-chip"><div className="avatar">{session.user.email?.[0]?.toUpperCase()}</div><span>{session.user.email}</span><ChevronDown size={15}/></div></div></header>
      <section className="content">
        <div className="page-heading"><div><h1>{active==="لوحة التحكم"?"مرحباً بك في iFactory ERP":active}</h1><p>متابعة أعمال المصنع والحسابات من مكان واحد.</p></div><button className="soft-btn" onClick={loadDashboard}><RefreshCw size={16}/> تحديث البيانات</button></div>
        {error&&<div className="error banner">{error}</div>}
        {active==="لوحة التحكم"||active==="الحساب الأسبوعي"?<>
          <div className="week-panel"><div><span className="eyebrow">الفترة المحاسبية الحالية</span><h2>{current?`من ${current.week_start} إلى ${current.week_end}`:"لا توجد فترة أسبوعية بعد"}</h2><p>{current?.status==="closed"?"أسبوع مغلق":"الأسبوع يبدأ الأحد وينتهي السبت"}</p></div><div className="week-status">{current?.status==="closed"?"مغلق":"مفتوح"}</div><select value={weekId} onChange={e=>setWeekId(e.target.value)} aria-label="اختر الأسبوع">{weeks.map(w=><option key={w.id} value={w.id}>{w.week_start} — {w.week_end} ({w.status==="open"?"مفتوح":"مغلق"})</option>)}</select></div>
          <div className="stats-grid">
            <Stat label="مبيعات الأسبوع" value={money(summary.sales)} icon={ShoppingCart}/>
            <Stat label="المقبوضات" value={money(summary.received)} icon={ArrowDownToLine} tone="green"/>
            <Stat label="مصاريف المصنع" value={money(summary.expenses)} icon={Wallet} tone="orange"/>
            <Stat label="مشتريات المخزون" value={money(summary.purchases)} icon={Boxes} tone="purple"/>
          </div>
          <div className="columns"><section className="panel"><div className="panel-title"><div><h3>ملخص حركة الأسبوع</h3><p>الأرقام المسجلة ضمن الفترة المختارة</p></div><CalendarDays/></div>
            <div className="summary-row"><span>صافي النقد (المقبوضات − المصاريف − المشتريات)</span><b className={net>=0?"positive":"negative"}>{money(net)}</b></div>
            <div className="summary-row"><span>ذمم العملاء الجديدة المتبقية</span><b>{money(summary.debts)}</b></div>
            <div className="summary-row"><span>المبيعات</span><b>{money(summary.sales)}</b></div>
          </section><section className="panel"><div className="panel-title"><div><h3>تنبيهات المتابعة</h3><p>تذكير بما يجب مراجعته</p></div><ClipboardList/></div>
            <div className="notice"><span className="notice-dot blue-dot"></span><div><b>راجع الديون المفتوحة</b><small>الديون تبقى مرتبطة بالعميل ولا تختفي عند بدء أسبوع جديد.</small></div></div>
            <div className="notice"><span className="notice-dot green-dot"></span><div><b>راجع حركات المخزون</b><small>رصيد المخزون تراكمي ولا يبدأ من الصفر أسبوعياً.</small></div></div>
            <div className="notice"><span className="notice-dot orange-dot"></span><div><b>إغلاق الأسبوع</b><small>يتم بعد مراجعة الفواتير والدفعات والمصاريف.</small></div></div>
          </section></div>
          <section className="panel table-panel"><div className="panel-title"><div><h3>الأسابيع المحفوظة</h3><p>كل أسبوع مستقل ويمكن الرجوع إليه</p></div><CalendarDays/></div>
            <div className="table-wrap"><table><thead><tr><th>بداية الأسبوع</th><th>نهاية الأسبوع</th><th>الحالة</th><th>اختيار</th></tr></thead><tbody>{weeks.map(w=><tr key={w.id}><td>{w.week_start}</td><td>{w.week_end}</td><td><span className={`pill ${w.status}`}>{w.status==="open"?"مفتوح":"مغلق"}</span></td><td><button className="text-btn" onClick={()=>setWeekId(w.id)}>عرض الكشف</button></td></tr>)}</tbody></table>{weeks.length===0&&<div className="empty">لا توجد أسابيع مسجلة حتى الآن.</div>}</div>
          </section>
        </>:active==="العملاء والذمم"||active==="الموردون"?<>
          <section className="panel party-panel">
            <div className="panel-title"><div><h3>{active==="العملاء والذمم"?"إضافة عميل":"إضافة مورد"}</h3><p>تُنشأ بطاقة مستقلة ويُولد رقم الملف تلقائياً</p></div><Users/></div>
            <form className="party-form" onSubmit={saveParty}>
              <label>الاسم<input required value={partyForm.name} onChange={e=>setPartyForm({...partyForm,name:e.target.value})} placeholder={active==="العملاء والذمم"?"اسم العميل":"اسم المورد أو الشركة"}/></label>
              <label>رقم الهاتف<input value={partyForm.phone} onChange={e=>setPartyForm({...partyForm,phone:e.target.value})} placeholder="07xxxxxxxx"/></label>
              <label>البريد الإلكتروني<input type="email" value={partyForm.email} onChange={e=>setPartyForm({...partyForm,email:e.target.value})} placeholder="اختياري"/></label>
              <label>العنوان<input value={partyForm.address} onChange={e=>setPartyForm({...partyForm,address:e.target.value})} placeholder="اختياري"/></label>
              <label className="wide">ملاحظات<input value={partyForm.notes} onChange={e=>setPartyForm({...partyForm,notes:e.target.value})} placeholder="ملاحظات إضافية"/></label>
              <button className="primary" disabled={partyBusy}>حفظ {active==="العملاء والذمم"?"العميل":"المورد"}</button>
            </form>
          </section>
          <section className="panel table-panel">
            <div className="panel-title"><div><h3>{active==="العملاء والذمم"?"كشف العملاء والذمم":"كشف الموردين والذمم"}</h3><p>الرصيد المتبقي محسوب من الفواتير المعتمدة والدفعات المسجلة</p></div><button className="soft-btn" onClick={()=>loadParties(active)}><RefreshCw size={15}/> تحديث</button></div>
            <div className="party-toolbar"><input value={partySearch} onChange={e=>setPartySearch(e.target.value)} placeholder="ابحث بالاسم أو الهاتف أو الرقم..."/><span>{partyRows.length} سجل</span></div>
            <div className="table-wrap"><table><thead><tr><th>رقم الملف</th><th>الاسم</th><th>الهاتف</th><th>المبلغ المتبقي</th><th>الحالة</th></tr></thead><tbody>
              {partyRows.filter(x=>`${x.full_name||x.company_name||""} ${x.phone||""} ${x.customer_no||x.supplier_no||""}`.toLowerCase().includes(partySearch.toLowerCase())).map(x=><tr key={x.id}><td>{x.customer_no||x.supplier_no}</td><td>{x.full_name||x.company_name}</td><td>{x.phone||"—"}</td><td className={x.outstanding_amount>0?"negative":"positive"}>{money(x.outstanding_amount)}</td><td><span className={`pill ${x.is_active?"open":"closed"}`}>{x.is_active?"نشط":"غير نشط"}</span></td></tr>)}
            </tbody></table>{partyRows.length===0&&<div className="empty">{partyBusy?"جارٍ التحميل...":"لا توجد سجلات بعد. أضف أول سجل من النموذج أعلاه."}</div>}</div>
          </section>
        </>:<section className="panel coming"><div className="coming-icon"><LockKeyhole/></div><h2>{active}</h2><p>تم تجهيز مكان هذا القسم في الواجهة. سيتم ربط شاشته بالجداول واختبار الحفظ والصلاحيات قبل تفعيله.</p><button className="soft-btn" onClick={()=>setActive("لوحة التحكم")}>العودة إلى لوحة التحكم</button></section>}
        <footer>iFactory ERP <span>•</span> الدينار الأردني JOD <span>•</span> واجهة أولية قيد التطوير</footer>
      </section>
    </main>
  </div>
}