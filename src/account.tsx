import { FormEvent, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, LogOut, UserRound, X } from "lucide-react";
import { changePin, loadTeacherProfile, pinStatus, saveTeacherProfile, setPin, supabase, type TeacherProfile } from "./cloud";
import { PinDialog } from "./meeting";

const profileListeners = new Set<() => void>();

function notifyProfile() {
  profileListeners.forEach((listener) => listener());
}

function displayLabel(profile: TeacherProfile) {
  return profile.displayName.trim() || profile.email.split("@")[0] || "教师";
}

function initialOf(profile: TeacherProfile) {
  return displayLabel(profile).slice(0, 1);
}

function Avatar({ profile, large = false }: { profile: TeacherProfile; large?: boolean }) {
  return (
    <span className={`account-avatar ${large ? "large" : ""}`}>
      {profile.avatar ? <img src={profile.avatar} alt="" /> : initialOf(profile)}
    </span>
  );
}

async function compressAvatar(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片");
  if (file.size > 8 * 1024 * 1024) throw new Error("图片太大");
  const image = await loadImage(file);
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法处理头像");
  const scale = Math.max(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
  let quality = 0.72;
  let data = canvas.toDataURL("image/jpeg", quality);
  while (data.length > 70000 && quality > 0.4) {
    quality -= 0.1;
    data = canvas.toDataURL("image/jpeg", quality);
  }
  if (data.length > 80000) throw new Error("头像太大，请换一张小一点的图片");
  return data;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("这张图片打不开"));
    };
    image.src = url;
  });
}

export function AccountMenu({ placement = "sidebar" }: { placement?: "sidebar" | "bar" | "stage" }) {
  const root = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<TeacherProfile>({ displayName: "", avatar: "", email: "" });

  useEffect(() => {
    let stop = false;
    const refresh = () => {
      void loadTeacherProfile()
        .then((next) => {
          if (!stop) setProfile(next);
        })
        .catch(() => undefined);
    };
    refresh();
    profileListeners.add(refresh);
    return () => {
      stop = true;
      profileListeners.delete(refresh);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const label = displayLabel(profile);
  const Chevron = placement === "sidebar" ? ChevronUp : ChevronDown;

  return (
    <div className={`account-menu ${placement}`} ref={root}>
      <button
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`${label}的用户菜单`}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <Avatar profile={profile} />
        <span className="account-copy">
          <b>{label}</b>
          <small>{profile.email || "个人信息"}</small>
        </span>
        <Chevron size={16} className="account-chevron" />
      </button>
      {menuOpen && (
        <div className="account-popover" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setProfileOpen(true);
            }}
          >
            <UserRound size={16} /> 个人信息
          </button>
          <button type="button" role="menuitem" className="danger" onClick={() => void supabase.auth.signOut()}>
            <LogOut size={16} /> 退出登录
          </button>
        </div>
      )}
      {profileOpen && (
        <ProfileDialog
          profile={profile}
          onClose={() => setProfileOpen(false)}
          onSaved={(next) => {
            setProfile(next);
            notifyProfile();
          }}
        />
      )}
    </div>
  );
}

function ProfileDialog({
  profile,
  onClose,
  onSaved,
}: {
  profile: TeacherProfile;
  onClose: () => void;
  onSaved: (profile: TeacherProfile) => void;
}) {
  const [name, setName] = useState(profile.displayName);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [pinMode, setPinMode] = useState<"set" | "change" | "">("");
  const [pinLabel, setPinLabel] = useState("读取中…");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const draft = { ...profile, displayName: name, avatar };

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (pinMode) setPinMode("");
      else closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pinMode]);

  useEffect(() => {
    let stop = false;
    void pinStatus()
      .then((status) => {
        if (!stop) setPinLabel(status === "set" ? "已设置" : "尚未设置");
      })
      .catch(() => {
        if (!stop) setPinLabel("暂时无法读取");
      });
    return () => {
      stop = true;
    };
  }, [pinMode]);

  async function chooseAvatar(file?: File) {
    if (!file) return;
    setError("");
    setMessage("");
    try {
      setAvatar(await compressAvatar(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "头像没有换上");
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const nextName = name.trim();
    if (nextName.length > 24) {
      setError("昵称最多 24 个字");
      return;
    }
    setPending(true);
    setError("");
    setMessage("");
    try {
      await saveTeacherProfile(nextName, avatar);
      const next = { ...profile, displayName: nextName, avatar };
      onSaved(next);
      setName(nextName);
      setMessage("已保存");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "没有保存成功");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="pin-layer">
      <form className="gate-card account-card" onSubmit={(event) => void save(event)}>
        <div className="account-dialog-head">
          <h2>个人信息</h2>
          <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <label className="account-photo">
          <Avatar profile={draft} large />
          <span>
            <b>更换头像</b>
            <small>显示在侧栏，点击图片即可更换</small>
          </span>
          <input
            type="file"
            accept="image/*"
            aria-label="更换头像"
            onChange={(event) => {
              void chooseAvatar(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        {avatar && (
          <button
            type="button"
            className="button subtle"
            onClick={() => {
              setAvatar("");
              setMessage("");
            }}
          >
            移除头像
          </button>
        )}
        <label>
          昵称
          <input
            value={name}
            maxLength={24}
            placeholder="例如：王老师"
            onChange={(event) => {
              setName(event.target.value);
              setMessage("");
            }}
          />
        </label>
        <p className="account-email">登录邮箱 {profile.email || "未读取到"}</p>
        <div className="account-pin">
          <div>
            <h3>教师 PIN</h3>
            <p>课堂屏上的加减分、重选区域和退出需要这组 PIN。当前{pinLabel}。</p>
          </div>
          <button
            type="button"
            className="button outline"
            onClick={() =>
              void pinStatus()
                .then((status) => {
                  if (status === "anonymous") {
                    setError("请先登录");
                    return;
                  }
                  setPinMode(status === "set" ? "change" : "set");
                })
                .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "暂时无法读取 PIN"))
            }
          >
            {pinLabel === "已设置" ? "修改 PIN" : "设置 PIN"}
          </button>
        </div>
        {error && <p className="field-error">{error}</p>}
        {message && <p className="account-saved">{message}</p>}
        <button className="button primary full" disabled={pending}>
          {pending ? "保存中…" : "保存"}
        </button>
      </form>
      {pinMode && (
        <PinDialog
          title={pinMode === "set" ? "设置 PIN" : "修改 PIN"}
          confirmNew={pinMode === "set"}
          askCurrent={pinMode === "change"}
          onClose={() => setPinMode("")}
          onSubmit={async (pin, current) => {
            try {
              if (pinMode === "set") await setPin(pin);
              else await changePin(current ?? "", pin);
              setPinMode("");
              setError("");
              return "";
            } catch (cause) {
              return cause instanceof Error ? cause.message : "没有保存成功";
            }
          }}
        />
      )}
    </div>
  );
}
