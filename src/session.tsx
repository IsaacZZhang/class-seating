import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Eye, EyeOff, Mail } from "lucide-react";
import { AccountMenu } from "./account";
import App from "./App";
import { isExistingSignup, passwordChecks, passwordStrength } from "./auth-flow";
import { pullProject, supabase } from "./cloud";
import { ProjectData } from "./model";
import { makeEmptyClass } from "./seating";

function Boot({ label }: { label: string }) {
  return (
    <main className="gate">
      <p>{label}</p>
    </main>
  );
}

type AuthStep = "email" | "credentials" | "reset-request" | "reset-password" | "email-sent";

function AuthScreen({ recovery = false, onRecoveryDone }: { recovery?: boolean; onRecoveryDone?: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [step, setStep] = useState<AuthStep>(recovery ? "reset-password" : "email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sentReason, setSentReason] = useState<"signup" | "reset">("signup");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "success">("error");
  const [pending, setPending] = useState(false);
  const checks = passwordChecks(password);
  const strength = passwordStrength(password);
  const creatingPassword = mode === "signup" || step === "reset-password";

  function navigate(next: AuthStep, nextMode = mode) {
    setStep(next);
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setMessage("");
  }

  function feedback(text: string, kind: "error" | "success" = "error") {
    setMessage(text);
    setMessageKind(kind);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const normalizedEmail = email.trim();
    if (step === "email") {
      setEmail(normalizedEmail);
      navigate("credentials");
      return;
    }
    if (creatingPassword && step !== "reset-request") {
      if (!checks.length || !checks.mixed) {
        feedback("密码需要至少 8 位，同时包含字母和数字。");
        return;
      }
      if (step === "credentials" && password !== confirmPassword) {
        feedback("两次输入的密码不一致，请检查后重试。");
        return;
      }
    }

    setPending(true);
    setMessage("");
    try {
      if (step === "reset-request") {
        const redirectTo = window.location.origin + window.location.pathname;
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
        if (error) feedback("暂时无法发送邮件，请稍后再试。");
        else {
          setSentReason("reset");
          navigate("email-sent");
        }
        return;
      }
      if (step === "reset-password") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) feedback("密码未能更新，请重新打开邮件中的链接再试。");
        else onRecoveryDone?.();
        return;
      }
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error?.code === "email_not_confirmed") feedback("邮箱尚未验证，请先打开确认邮件中的链接。");
        else if (error?.code === "invalid_credentials") feedback("邮箱或密码不正确，请检查后重试。");
        else if (error) feedback("暂时无法登录，请稍后重试。");
        return;
      }
      const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password });
      if (isExistingSignup(error, data.user?.identities)) {
        feedback("这个邮箱已有账号，请返回登录。忘记密码可在登录页重设。");
      } else if (error) {
        feedback(error.code === "weak_password" ? "密码未达到服务端要求，请换一个更强的密码。" : "暂时无法创建账号，请稍后重试。");
      } else if (!data.session) {
        setSentReason("signup");
        navigate("email-sent");
      }
    } catch {
      feedback("网络连接出现问题，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-shell">
      <header className="auth-brand" aria-label="班级座位助手">
        <span className="brand-mark"><BookOpen size={20} strokeWidth={2.2} /></span>
        <span>班级座位助手</span>
      </header>
      <div className="auth-layout">
        <section className="auth-left">
          <div className="auth-content">
            <div className="auth-intro">
              <span className="auth-eyebrow">把每一个位置，都安排得刚刚好</span>
              <h1>让班级管理，<br />从容一点。</h1>
              <p>从座位安排到小组积分，轻松打理每一天。</p>
            </div>
            <form className="auth-card" onSubmit={(event) => void submit(event)}>
              {step !== "email" && step !== "reset-password" && step !== "email-sent" && (
                <button className="auth-back" type="button" disabled={pending} onClick={() => navigate("email")}>
                  <ArrowLeft size={16} /> 返回
                </button>
              )}
              {step === "email-sent" ? (
                <div className="auth-complete" role="status">
                  <span className="auth-complete-icon"><Mail size={25} /></span>
                  <h2>请查收邮件</h2>
                  <p>{sentReason === "signup" ? "如果这是新账号，确认邮件会发送至你的邮箱。点击邮件中的链接后，即可登录并开始使用。" : "如果这个邮箱已注册，你会收到重设链接。请按邮件中的提示设置新密码。"}</p>
                  <button className="auth-primary" type="button" onClick={() => navigate("email", "login")}>返回登录 <ArrowRight size={17} /></button>
                </div>
              ) : (
                <>
                  <div className="auth-card-heading">
                    <h2>{step === "email" ? "使用邮箱继续" : step === "reset-request" ? "找回密码" : step === "reset-password" ? "设置新密码" : mode === "login" ? "欢迎回来" : "创建账号"}</h2>
                    {step === "reset-request" && <p>我们会向你的邮箱发送重设密码链接。</p>}
                    {step === "reset-password" && <p>为账号设置一个新的安全密码。</p>}
                  </div>
                  {step === "email" || step === "reset-request" ? (
                    <label className="auth-field" htmlFor="auth-email">
                      <span>邮箱地址</span>
                      <input id="auth-email" type="email" autoComplete="username" inputMode="email" placeholder="name@example.com" value={email} onChange={(event) => { setEmail(event.target.value); setMessage(""); }} required autoFocus />
                    </label>
                  ) : step === "credentials" ? (
                    <div className="auth-email-chip"><Mail size={16} /><span>{email}</span><button type="button" disabled={pending} onClick={() => navigate("email")}>更换</button></div>
                  ) : null}
                  {(step === "credentials" || step === "reset-password") && (
                    <>
                      <label className="auth-field" htmlFor="auth-password"><span>{creatingPassword ? "设置密码" : "密码"}</span></label>
                      <div className="auth-password-input">
                        <input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={creatingPassword ? "new-password" : "current-password"} placeholder={creatingPassword ? "至少 8 位，包含字母和数字" : "输入你的密码"} value={password} onChange={(event) => { setPassword(event.target.value); setMessage(""); }} required autoFocus />
                        <button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword} onClick={() => setShowPassword((shown) => !shown)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                      </div>
                      {creatingPassword && (
                        <div className="auth-strength" aria-live="polite">
                          <div className="auth-strength-top"><span>密码强度</span><strong>{["", "较弱", "可使用", "较强", "很强"][strength]}</strong></div>
                          <div className="auth-strength-bars" role="meter" aria-label="密码强度" aria-valuemin={0} aria-valuemax={4} aria-valuenow={strength}>
                            {[1, 2, 3, 4].map((level) => <span key={level} className={strength >= level ? "filled strength-" + strength : ""} />)}
                          </div>
                          <p className={checks.length ? "met" : ""}>{checks.length ? "✓" : "○"} 至少 8 位字符</p>
                          <p className={checks.mixed ? "met" : ""}>{checks.mixed ? "✓" : "○"} 同时包含字母和数字</p>
                        </div>
                      )}
                      {mode === "signup" && step === "credentials" && (
                        <label className="auth-field" htmlFor="auth-confirm"><span>确认密码</span><input id="auth-confirm" type="password" autoComplete="new-password" placeholder="再次输入密码" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setMessage(""); }} required /></label>
                      )}
                      {mode === "login" && step === "credentials" && <button className="auth-forgot" type="button" onClick={() => navigate("reset-request")}>忘记密码？</button>}
                    </>
                  )}
                  {message && <p className={messageKind === "error" ? "auth-feedback error" : "auth-feedback success"} role="alert">{message}</p>}
                  <button className="auth-primary" disabled={pending} type="submit">
                    {pending ? "请稍候…" : step === "email" ? mode === "signup" ? "继续创建账号" : "使用邮箱继续" : step === "reset-request" ? "发送重设邮件" : step === "reset-password" ? "保存新密码" : mode === "signup" ? "创建账号" : "登录"}
                    {!pending && <ArrowRight size={17} />}
                  </button>
                  {step !== "reset-password" && step !== "reset-request" && (
                    <p className="auth-switch">{mode === "login" ? "第一次使用？" : "已经有账号？"}<button type="button" disabled={pending} onClick={() => navigate(step, mode === "login" ? "signup" : "login")}>{mode === "login" ? "创建账号" : "返回登录"}</button></p>
                  )}
                </>
              )}
            </form>
            <p className="auth-footnote">安全同步座位、小组与积分，随时接着上次的进度。</p>
          </div>
        </section>
        <aside className="auth-visual" aria-label="教师在教室中规划班级安排">
          <img src="/auth-classroom.webp" alt="教师在教室里整理座位安排与教学资料" />
        </aside>
      </div>
    </main>
  );
}

function CreateClass({ onReady }: { onReady: (project: ProjectData) => void }) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const created = makeEmptyClass(trimmed);
    const project = { classes: [created], activeClassId: created.id };
    const { pushProject } = await import("./cloud");
    const ok = await pushProject(project);
    if (ok !== true) {
      setMessage("班级没有保存成功，请再试一次。");
      return;
    }
    onReady(await pullProject());
  }

  return (
    <main className="gate">
      <section className="gate-card">
        <h1>创建第一个班级</h1>
        <p>创建后可以导入学生、分小组，并在班会上投屏选座。</p>
        <label>
          班级名称
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：七年级 3 班" />
        </label>
        {message && <p className="field-error">{message}</p>}
        <button className="button primary full" disabled={!name.trim()} onClick={() => void create()}>
          创建班级
        </button>
        <AccountMenu />
      </section>
    </main>
  );
}

export default function Root() {
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [project, setProject] = useState<ProjectData | null>();
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setSessionReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") setRecovering(false);
      setSignedIn(!!session);
      if (!session) setProject(undefined);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!signedIn || recovering) return;
    setProject(undefined);
    void pullProject()
      .then(setProject)
      .catch((error: Error) => setLoadError(error.message));
  }, [signedIn, recovering]);

  if (!sessionReady || (signedIn && !recovering && project === undefined && !loadError)) return <Boot label="正在连接班级数据…" />;
  if (recovering) return <AuthScreen key="recovery" recovery onRecoveryDone={() => setRecovering(false)} />;
  if (!signedIn) return <AuthScreen key="normal" />;
  if (loadError) {
    return (
      <main className="gate">
        <section className="gate-card">
          <h1>没有读到班级</h1>
          <p>{loadError}</p>
        </section>
      </main>
    );
  }
  if (!project?.classes.length) return <CreateClass onReady={setProject} />;
  return <App initial={project} />;
}
