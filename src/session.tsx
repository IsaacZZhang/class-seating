import { FormEvent, useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { AccountMenu } from "./account";
import App from "./App";
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

function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const credentials = { email: email.trim(), password };
    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);
    setPending(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    if (mode === "signup" && !result.data.session) {
      setMessage("注册成功。请到邮箱点开确认信，然后再登录。");
    }
  }

  return (
    <main className="gate">
      <form className="gate-card" onSubmit={submit}>
        <span className="brand-mark">
          <BookOpen size={22} />
        </span>
        <h1>班级座位助手</h1>
        <p>教师登录后，座位、小组和积分会在你的设备之间同步。</p>
        <div className="gate-switch">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            登录
          </button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
            注册
          </button>
        </div>
        <label>
          邮箱
          <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          密码
          <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {message && <p className="field-error">{message}</p>}
        <button className="button primary full" disabled={pending}>
          {pending ? "请稍候…" : mode === "login" ? "登录" : "注册"}
        </button>
      </form>
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
  const [project, setProject] = useState<ProjectData | null>();
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setSessionReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session);
      if (!session) setProject(undefined);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    setProject(undefined);
    void pullProject()
      .then(setProject)
      .catch((error: Error) => setLoadError(error.message));
  }, [signedIn]);

  if (!sessionReady || (signedIn && project === undefined && !loadError)) return <Boot label="正在连接班级数据…" />;
  if (!signedIn) return <AuthScreen />;
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
