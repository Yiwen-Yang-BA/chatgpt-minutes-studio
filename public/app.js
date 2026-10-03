import {
  $,
  escape,
  load,
  save,
  toast,
  download,
  markdown,
  csv,
  init,
  run,
  busy,
  resultMeta,
  fileText,
} from "./ui.js";
let meeting = null;
let pending = false;
let importing = false;
const draft = load("minutes-studio-v1", null);
function lock(on) {
  [
    "#title",
    "#transcript",
    "#file",
    "#sample",
    "#save",
    "#mode",
    "#summarize",
  ].forEach((s) => ($(s).disabled = on));
  document.querySelectorAll("[data-done]").forEach((el) => (el.disabled = on));
}
function render() {
  if (!meeting) return;
  const d = meeting.data;
  $("#summary").innerHTML =
    `<div class="meta">${resultMeta(meeting.meta)}</div><h3>${escape(meeting.title)}</h3>${markdown(d.summary)}`;
  $("#stats").innerHTML =
    `<div class="stat"><strong>${d.stats.speakers}</strong><span>位已标注发言者</span></div><div class="stat"><strong>${d.stats.utterances}</strong><span>段发言</span></div><div class="stat"><strong>${d.actions.filter((a) => a.done).length}/${d.actions.length}</strong><span>行动已完成</span></div>`;
  $("#decisions").innerHTML =
    "<h3>已形成的决定</h3>" +
    d.decisions
      .map(
        (v) =>
          `<article class="card"><p>${escape(v.text)}</p><details><summary>核对原话</summary><p>${escape(v.evidence)}</p></details></article>`,
      )
      .join("") +
    (d.decisions.length ? "" : '<p class="muted">未识别到明确决定。</p>');
  $("#questions").innerHTML =
    '<div class="divider"></div><h3>尚待确认</h3>' +
    d.questions.map((q) => `<p class="muted">• ${escape(q)}</p>`).join("");
  $("#actions").innerHTML = d.actions.length
    ? d.actions
        .map(
          (a) =>
            `<article class="card action"><label class="check-label"><input type="checkbox" data-done="${escape(a.id)}" ${a.done ? "checked" : ""} ${pending ? "disabled" : ""}><strong>${escape(a.task)}</strong></label><div class="row meta"><span class="pill">负责人 · ${escape(a.owner)}</span><span class="muted">期限 · ${escape(a.due)}</span></div><details><summary>原文证据</summary><p>${escape(a.evidence)}</p></details></article>`,
        )
        .join("")
    : '<p class="muted">没有明确行动项；可以补充更清晰的转录内容。</p>';
  $("#utterances").innerHTML = d.utterances
    .map(
      (u) =>
        `<article class="card"><div class="row"><span class="pill">${escape(u.time || "无时间标记")}</span><strong>${escape(u.speaker)}</strong></div><p>${escape(u.text)}</p></article>`,
    )
    .join("");
}
$("#sample").onclick = () => {
  $("#title").value = "网站改版 · 进度协调";
  $("#transcript").value =
    "[00:00] 林晨：今天确认网站改版。\n[00:12] 王宁：决定先发布移动版，再完善桌面细节。\n[00:25] 林晨：我负责整理文案，本周五完成。\n[00:42] 周岚：我负责检查移动端表单，2026-10-09 之前完成。\n[01:02] 王宁：预算还需要确认，下次会议讨论。";
};
$("#file").onchange = async (e) => {
  if (pending || importing) return;
  importing = true;
  lock(true);
  try {
    const f = e.target.files[0];
    if (!f) return;
    if (!/\.txt$/i.test(f.name)) throw Error("请导入 TXT 文本文件");
    const t = await fileText(f, 120000);
    if (t.length > 30000) throw Error("转录最多 30,000 字符");
    $("#transcript").value = t;
    if (!$("#title").value)
      $("#title").value = f.name.replace(/\.txt$/i, "").slice(0, 160);
  } catch (err) {
    toast(err.message, true);
  } finally {
    importing = false;
    e.target.value = "";
    lock(false);
  }
};
$("#minutes-form").onsubmit = async (e) => {
  e.preventDefault();
  if (pending || importing) return;
  pending = true;
  busy($("#summarize"), true, "整理与提取中…");
  lock(true);
  const title = $("#title").value;
  const transcript = $("#transcript").value;
  try {
    const r = await run({ title, transcript });
    meeting = { title, transcript, data: r.data, meta: r.meta };
    render();
  } catch (err) {
    toast(err.message, true);
  } finally {
    pending = false;
    busy($("#summarize"), false);
    lock(false);
  }
};
$("#actions").onchange = (e) => {
  if (!meeting || pending || importing) return;
  const id = e.target.dataset.done;
  if (id) {
    const action = meeting.data.actions.find((a) => a.id === id);
    action.done = e.target.checked;
    render();
  }
};
$("#save").onclick = () => {
  if (!meeting) return toast("先整理一次会议后再保存", true);
  if (save("minutes-studio-v1", meeting)) toast("会议和行动状态已保存");
};
$("#export-csv").onclick = () => {
  if (!meeting) return toast("请先整理会议", true);
  download(
    "meeting-actions.csv",
    csv([
      ["任务", "负责人", "期限", "状态", "原文证据"],
      ...meeting.data.actions.map((a) => [
        a.task,
        a.owner,
        a.due,
        a.done ? "已完成" : "待完成",
        a.evidence,
      ]),
    ]),
    "text/csv;charset=utf-8",
  );
};
$("#export-md").onclick = () => {
  if (!meeting) return toast("请先整理会议", true);
  const d = meeting.data;
  download(
    "meeting-minutes.md",
    `# ${meeting.title}\n\n模式：${meeting.meta.mode}\n\n${d.summary}\n\n## 决策\n\n` +
      d.decisions.map((v) => `- ${v.text}\n  > ${v.evidence}`).join("\n") +
      "\n\n## 行动项\n\n" +
      d.actions
        .map(
          (a) =>
            `- [${a.done ? "x" : " "}] ${a.task} — ${a.owner} / ${a.due}\n  > ${a.evidence}`,
        )
        .join("\n") +
      "\n\n## 待确认\n\n" +
      d.questions.map((q) => "- " + q).join("\n"),
  );
};
await init();
if (draft?.data) {
  meeting = draft;
  $("#title").value = meeting.title;
  $("#transcript").value = meeting.transcript;
  render();
}
