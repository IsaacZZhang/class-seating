import { useEffect, useState } from "react";
import { ArrowRight, Plus, Trash2, Users, X } from "lucide-react";
import { groupPoints } from "./groups";
import { ClassData, StudyGroup } from "./model";

type Props = {
  klass: ClassData;
  checked: string[];
  onClearChecked: () => void;
  onCreate: (name: string, studentIds: string[]) => void;
  onAssign: (studentIds: string[], groupId: string) => void;
  onRename: (groupId: string, name: string) => void;
  onDissolve: (groupId: string) => void;
  onInspect: (studentId: string) => void;
};

function GroupCard({ group, klass, checked, onClearChecked, onAssign, onRename, onDissolve, onInspect }: Props & { group: StudyGroup }) {
  const [name, setName] = useState(group.name);
  const [dragOver, setDragOver] = useState(false);
  useEffect(() => setName(group.name), [group.name]);
  const members = klass.students.filter((student) => student.groupId === group.id);
  const checkedOutside = checked.filter((id) => !members.some((student) => student.id === id));
  function saveName() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== group.name) onRename(group.id, trimmed);
    else setName(group.name);
  }
  return <article className={`roster-group-card ${dragOver ? "drag-over" : ""}`} style={{ borderTopColor: group.color }}
    onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
    onDragLeave={() => setDragOver(false)}
    onDrop={(event) => {
      event.preventDefault(); setDragOver(false);
      const studentId = event.dataTransfer.getData("text/plain");
      if (klass.students.some((student) => student.id === studentId)) onAssign([studentId], group.id);
    }}>
    <div className="roster-group-head">
      <i style={{ background: group.color }} />
      <input aria-label="小组名称" value={name} maxLength={24} onChange={(event) => setName(event.target.value)} onBlur={saveName} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
      <span>{members.length} 人 · {groupPoints(klass.students, group.id)} 分</span>
      <button className="icon-button" title={`解散${group.name}`} aria-label={`解散${group.name}`} onClick={() => onDissolve(group.id)}><Trash2 size={15} /></button>
    </div>
    <div className="roster-group-members">
      {members.map((student) => <div className="roster-group-member" key={student.id} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", student.id)}>
        <button className="member-name" onClick={() => onInspect(student.id)} title={`定位到名单中的${student.name}`}>{student.name}</button>
        <button title={`${student.name}移出小组`} aria-label={`${student.name}移出小组`} onClick={() => onAssign([student.id], "")}><X size={13} /></button>
      </div>)}
      {!members.length && <p>从左侧勾选学生加入，或拖动姓名到这里。</p>}
    </div>
    <button className="button mini roster-group-add" disabled={!checkedOutside.length} onClick={() => { onAssign(checkedOutside, group.id); onClearChecked(); }}><ArrowRight size={14} /> 加入已选学生{checkedOutside.length ? ` (${checkedOutside.length})` : ""}</button>
  </article>;
}

export function RosterGroups(props: Props) {
  const { klass, checked, onClearChecked, onCreate, onAssign } = props;
  const [name, setName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const ungrouped = klass.students.filter((student) => !student.groupId || !(klass.groups ?? []).some((group) => group.id === student.groupId));
  const link = klass.displayToken ? `${location.origin}${location.pathname}#/board/${klass.displayToken}` : "";
  return <div className="roster-groups">
    <div className="roster-groups-intro"><h2>小组管理</h2><p>在左侧勾选学生后创建小组或加入已有小组；也可以拖动姓名调整。</p></div>
    <form className="roster-group-create" onSubmit={(event) => {
      event.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) return;
      onCreate(trimmed, checked);
      onClearChecked();
      setName("");
    }}><input aria-label="新小组名称" value={name} maxLength={24} onChange={(event) => setName(event.target.value)} placeholder="输入新小组名称" /><button className="button primary mini" disabled={!name.trim()}><Plus size={14} /> 创建{checked.length ? `并加入 ${checked.length} 人` : "小组"}</button></form>
    <div className="roster-groups-summary"><Users size={15} /> {klass.groups?.length ?? 0} 个小组 · {ungrouped.length} 人未分组{checked.length > 0 && <strong> · 已选 {checked.length} 人</strong>}</div>
    <div className="roster-group-list">{(klass.groups ?? []).map((group) => <GroupCard key={group.id} {...props} group={group} />)}</div>
    <div className={`roster-ungrouped ${dragOver ? "drag-over" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(event) => {
      event.preventDefault(); setDragOver(false);
      const studentId = event.dataTransfer.getData("text/plain");
      if (klass.students.some((student) => student.id === studentId)) onAssign([studentId], "");
    }}><div><strong>未分组</strong><span>{ungrouped.length} 人</span></div><p>{ungrouped.length ? ungrouped.map((student) => student.name).join("、") : "全部学生都已分组"}</p><button className="button mini" disabled={!checked.some((id) => klass.students.find((student) => student.id === id)?.groupId)} onClick={() => { onAssign(checked, ""); onClearChecked(); }}>将已选学生移出小组</button></div>
    {link && <div className="roster-display-link"><strong>课堂展示链接</strong><p>在另一块屏幕打开，可查看座位、小组和积分。</p><button className="button mini" onClick={() => void navigator.clipboard.writeText(link)}>复制链接</button></div>}
  </div>;
}
