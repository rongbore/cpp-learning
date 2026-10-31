import {fields,infer,csv,normalize,merge,feedback,exportCSV,clean} from './core.js';
import {readXLSX} from './xlsx.js';
import {DEFAULT_CLASSES} from './school.js';
import {parseRoster,combineRoster,linkRoster,maskedPhone} from './roster.js';
import {studentKey,topicKey,studentsIn,masteryForStudent,aggregateTopics,evidence,learningPlan,fmt,mean} from './analysis.js';
import {$,el,fillSelect,bar,badge,download} from './ui.js';
import {studentReport,classReport} from './reports.js';

let records=[],pending=null,allRows=[],visible=[],importNames=[],example=false;
let classes=[],topics=[],editing=null,selectedStudents=new Set(),roster=[],allStudents=[];
const ROSTER_STORE='zhike-roster-v1';
const STORE='zhike-course-v2';
function validateConfig(value){
  if(!value||!Array.isArray(value.classes)||!Array.isArray(value.topics)||value.classes.length>200||value.topics.length>1000)throw Error('课程设置格式或数量无效');
  const text=(v,max)=>typeof v==='string'&&v.length<=max;
  if(!value.classes.every(c=>text(c,80)&&clean(c))||!value.topics.every(t=>t&&text(t.lesson,80)&&clean(t.lesson)&&text(t.title,120)&&clean(t.title)&&['objective','practice','resource'].every(k=>t[k]===undefined||text(t[k],k==='practice'?2000:1000))))throw Error('课程设置内容不完整或超出长度限制');
  const normalized=value.topics.map(t=>({lesson:clean(t.lesson),title:clean(t.title),objective:t.objective||'',practice:t.practice||'',resource:t.resource||''}));
  if(new Set(normalized.map(topicKey)).size!==normalized.length)throw Error('课程设置包含重复知识点');
  return {classes:[...new Set(value.classes.map(clean))],topics:normalized};
}
try{const saved=localStorage.getItem(STORE);if(saved)({classes,topics}=validateConfig(JSON.parse(saved)));}catch{ $('globalNotice').textContent='本机课程设置无法读取，可重新添加或导入备份。';}
try{const saved=localStorage.getItem(ROSTER_STORE);if(saved){const data=JSON.parse(saved);if(!Array.isArray(data))throw Error('invalid');roster=parseRoster([['账号','姓名','班级','年级','手机号码'],...data.map(r=>[r.id,r.name,r.group,r.grade,r.phone])]);$('rememberRoster').checked=true;}}catch{$('rosterNotice').textContent='已保存名册无法读取，请重新导入；原存储未修改。';}
// Merge school defaults with existing local settings instead of replacing teacher work.
classes=[...new Set([...DEFAULT_CLASSES,...classes])];
function notify(text){$('globalNotice').textContent=text;}
function saveConfig(){try{localStorage.setItem(STORE,JSON.stringify({classes,topics}));}catch{notify('浏览器未能保存课程设置，请使用“导出课程设置”备份。');}}
const lessonsSelected=()=> $('lessonFilter').value?[$('lessonFilter').value]:[];
const scopeText=()=>`${$('groupFilter').selectedOptions[0]?.textContent||'全部班级'} / ${$('lessonFilter').value||'全部课次'}`;
const grade=r=>[r.classroomConflict?'待核对':r.classroom??'待补齐',r.homeworkConflict?'待核对':r.homework??'待补齐'];
function syncOptions(){
  const groups=[...new Set([...classes,...roster.map(r=>r.group),...allRows.map(r=>r.group).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'zh'));
  fillSelect($('importGroup'),groups.map(g=>[g,g]),['未指定（导入后为未分班）','']);
  fillSelect($('rosterGroup'),groups.map(g=>[g,g]),['请指定班级（或使用文件班级列）','']);
  fillSelect($('rosterViewGroup'),groups.map(g=>[g,g]),['全部班级','']);
  fillSelect($('groupFilter'),[...groups.map(g=>[g,g]),...allRows.some(r=>!r.group)?[['未分班','__ungrouped__']]:[]],['全部班级','']);
  const lessons=[...new Set([...topics.map(t=>t.lesson),...allRows.map(r=>r.lesson)])].sort((a,b)=>a.localeCompare(b,'zh',{numeric:true}));
  fillSelect($('lessonFilter'),lessons.map(l=>[l,l]),['全部课次','']);
  $('lessonNames').replaceChildren(...lessons.map(l=>new Option(l,l)));
  $('classTags').replaceChildren(...groups.map(g=>el('span',g,'class-tag')));
  fillSelect($('scoreStudent'),allStudents.map(s=>[`${s.group||'未分班'} · ${s.name||s.id} (${s.id||'无学号'})`,studentKey(s)]));
  fillSelect($('scoreLesson'),lessons.map(l=>[l,l]));syncScoreTopics();
}
function syncScoreTopics(){fillSelect($('scoreTopic'),topics.filter(t=>t.lesson===$('scoreLesson').value).map(t=>[t.title,t.title]));loadScore();}
function loadScore(){const row=allRows.find(r=>studentKey(r)===$('scoreStudent').value&&r.lesson===$('scoreLesson').value&&r.topic===$('scoreTopic').value);$('scoreClassroom').value=row?.classroom??'';$('scoreHomework').value=row?.homework??'';}
function renderTopics(){
  $('topicList').replaceChildren(...topics.map(t=>{const card=el('div',undefined,'topic-item');const body=el('div');body.append(el('strong',`${t.lesson} / ${t.title}`),el('p',t.objective||'未填写具体目标','small muted'));const actions=el('div',undefined,'actions');const edit=el('button','编辑','secondary');edit.type='button';edit.onclick=()=>{editing=topicKey(t);$('topicLesson').value=t.lesson;$('topicTitle').value=t.title;$('topicObjective').value=t.objective;$('topicPractice').value=t.practice;$('topicResource').value=t.resource;$('saveTopic').textContent='保存编辑';$('topicLesson').focus();};const remove=el('button','删除','text-btn');remove.type='button';remove.onclick=()=>{if(!confirm('删除此知识点设置？已导入的成绩仍保留，之后可以重新添加设置。'))return;topics=topics.filter(x=>topicKey(x)!==topicKey(t));saveConfig();render();};actions.append(edit,remove);card.append(body,actions);return card;}));
}
function scopedStudents(){
  const group=$('groupFilter').value,q=$('search').value.trim().toLowerCase();
  const matching=example?[]:roster.filter(r=>(!group||(group==='__ungrouped__'?!r.group:r.group===group))&&(!q||`${r.name} ${r.id}`.toLowerCase().includes(q)));
  return studentsIn([...visible,...matching]);
}
function persistRoster(){try{if($('rememberRoster').checked)localStorage.setItem(ROSTER_STORE,JSON.stringify(roster));else localStorage.removeItem(ROSTER_STORE);}catch{$('rosterNotice').textContent='本机名册保存失败，请导出名册备份。';}}
function renderRoster(){
 const group=$('rosterViewGroup').value,q=$('rosterSearch').value.trim().toLowerCase();const matches=roster.filter(r=>(!group||r.group===group)&&(!q||`${r.name} ${r.id}`.toLowerCase().includes(q)));
 const counts=new Map();for(const r of roster)counts.set(r.group,(counts.get(r.group)||0)+1);
 $('rosterCount').textContent=`全部名册 ${roster.length} 人；当前显示 ${matches.length} 人。`+[...counts].map(([g,n])=>`${g} ${n} 人`).join('；');
 $('rosterRows').replaceChildren(...matches.map(r=>{const tr=el('tr');for(const value of [r.group,r.name,r.grade||'未提供',r.id,maskedPhone(r.phone)])tr.append(el('td',value));return tr;}));
}
function render(){
  const merged=merge(linkRoster(records,example?[]:roster));allRows=merged.rows;allStudents=studentsIn([...allRows,...(example?[]:roster)]);syncOptions();renderTopics();renderRoster();
  const group=$('groupFilter').value,lesson=$('lessonFilter').value,q=$('search').value.trim().toLowerCase();
  visible=allRows.filter(r=>(!group||(group==='__ungrouped__'?!r.group:r.group===group))&&(!lesson||r.lesson===lesson)&&(!q||`${r.name} ${r.id}`.toLowerCase().includes(q)));
  const students=scopedStudents(),lessons=lessonsSelected();
  $('scopeLabel').textContent=`当前：${scopeText()} · ${students.length} 位学生 · ${visible.length} 条证据记录${q?' · 已应用搜索条件':''}`;
  const topicRows=visible.filter(r=>r.topic),valid=topicRows.filter(r=>evidence(r).score!==null);
  const metrics=[['当前范围学生',students.length],['知识点指标均值',fmt(mean(valid.map(r=>evidence(r).score)))],['双源齐全 / 知识点记录',`${valid.filter(r=>evidence(r).count===2).length} / ${topicRows.length}`],['优先补强 / 双源记录',topicRows.filter(r=>evidence(r).status==='优先补强').length]];
  $('metrics').replaceChildren(...metrics.map(([label,value])=>{const card=el('div',undefined,'metric');card.append(el('span',label),el('strong',String(value)));return card;}));
  renderClassChart(students,lessons);
  fillSelect($('studentFilter'),students.map(s=>[`${s.group||'未分班'} · ${s.name||s.id} (${s.id||'无学号'})`,studentKey(s)]),['请选择学生','']);
  renderStudent();renderChecklist(students);
  $('results').replaceChildren(...visible.map(r=>{const tr=el('tr');const student=el('td');student.append(el('strong',r.name||'未填姓名'),el('small',r.id||'无学号'));tr.append(student);for(const value of [r.group||'未分班',r.lesson,r.topic||'整课总分',...grade(r)])tr.append(el('td',String(value)));const cell=el('td');const ev=evidence(r);cell.append(r.topic?badge(ev.status):el('span',feedback(r)[0]),el('small',r.topic?`指标 ${fmt(ev.score)} · ${ev.count}/2 来源`:'整课成绩，不推算知识点'));tr.append(cell);return tr;}));
  $('empty').hidden=visible.length>0;$('empty').textContent=records.length?'当前筛选范围没有记录。':'暂无数据。导入表格，或载入多班级示例。';
  $('issues').replaceChildren(...merged.conflicts.map(x=>el('li',x)));$('imports').textContent=(example?'当前数据为虚构示例。 ':'')+(importNames.length?'已导入：'+importNames.join('、'):'');
}
function renderClassChart(students,lessons){
  const stats=aggregateTopics(visible,topics,lessons,students);
  $('classChart').replaceChildren(...stats.map(s=>{const card=el('div',undefined,'topic-chart');card.append(el('h3',`${s.topic.lesson} / ${s.topic.title}`));const matching=visible.filter(r=>r.lesson===s.topic.lesson&&r.topic===s.topic.title&&!r.classroomConflict&&!r.homeworkConflict);card.append(bar('课堂练习',s.classroom,matching.filter(r=>r.classroom!==null).length),bar('课后作业',s.homework,matching.filter(r=>r.homework!==null).length,'homework-color'),el('p',`综合指标 ${fmt(s.score)} · 有证据 ${s.count}/${s.total} 人 · 双源齐全 ${s.complete} 人 · 优先补强 ${s.weak} 人`,'small muted'));return card;}));
  if(!stats.length)$('classChart').append(el('p','尚无课程知识点。请添加每课知识点或导入包含“知识点”列的成绩。','empty'));
  $('heatmap').replaceChildren();if(!students.length||!stats.length)return;
  const table=el('table',undefined,'heatmap');const caption=el('caption','知识点掌握矩阵：双源均分 / 单源标记 * / 缺失 — / 冲突 !');table.append(caption);const head=el('thead'),hr=el('tr');hr.append(el('th','学生'));for(const s of stats)hr.append(el('th',`${s.topic.lesson} / ${s.topic.title}`));head.append(hr);const body=el('tbody');
  for(const student of students){const tr=el('tr');const name=el('td');const button=el('button',`${student.group||'未分班'} · ${student.name||student.id}`,'link-button');button.onclick=()=>{$('studentFilter').value=studentKey(student);renderStudent();$('studentFilter').scrollIntoView({behavior:'smooth',block:'center'});};name.append(button);tr.append(name);for(const s of stats){const row=visible.find(r=>studentKey(r)===studentKey(student)&&r.lesson===s.topic.lesson&&r.topic===s.topic.title);const ev=evidence(row);const cell=el('td',ev.status==='待核对'?'!':ev.score===null?'—':fmt(ev.score)+(ev.count===1?' *':''),ev.score===null?'heat-missing':ev.count===1?'heat-single':ev.score<60?'heat-low':ev.score<80?'heat-mid':'heat-good');cell.title=`${s.topic.title}：${ev.status}；有效来源 ${ev.count}/2`;tr.append(cell);}body.append(tr);}table.append(head,body);$('heatmap').append(table);
}
function renderStudent(){
  $('studentChart').replaceChildren();$('plans').replaceChildren();const student=scopedStudents().find(s=>studentKey(s)===$('studentFilter').value);if(!student){$('studentChart').append(el('p','选择一位学生查看知识点证据与具体方案，也可点击上方矩阵中的姓名。','empty'));return;}
  const items=masteryForStudent(visible,topics,student,lessonsSelected());
  for(const item of items){const card=el('div',undefined,'topic-chart');card.append(el('h3',`${item.topic.lesson} / ${item.topic.title}`),bar('课堂练习',item.row?.classroomConflict?null:item.row?.classroom??null),bar('课后作业',item.row?.homeworkConflict?null:item.row?.homework??null,undefined,'homework-color'),badge(item.status),el('p',`综合指标 ${fmt(item.score)} · 证据来源 ${item.count}/2`,'small muted'));$('studentChart').append(card);
    const plan=el('article',undefined,'plan-card');plan.append(el('h3',`${item.topic.lesson} / ${item.topic.title}`),badge(item.status));const list=el('ol');for(const [title,detail] of learningPlan(item)){const li=el('li');li.append(el('strong',title),el('p',detail));list.append(li);}plan.append(list);$('plans').append(plan);}
  if(!items.length)$('studentChart').append(el('p','请先设置本课知识点；整课总分不能替代知识点评分。','empty'));
}
function renderChecklist(students){
  $('studentChecklist').replaceChildren(...students.map(s=>{const label=el('label',undefined,'student-choice'),input=el('input');input.type='checkbox';input.checked=selectedStudents.has(studentKey(s));input.addEventListener('change',()=>{if(input.checked)selectedStudents.add(studentKey(s));else selectedStudents.delete(studentKey(s));});label.append(input,el('span',`${s.group||'未分班'} · ${s.name||s.id} · ${s.id||'无学号'}`));return label;}));
}

$('rosterFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5*1024*1024)throw Error('名册文件最多5MB');const lower=file.name.toLowerCase();const table=lower.endsWith('.xlsx')?await readXLSX(file):lower.endsWith('.csv')?csv(await file.text()):(()=>{throw Error('请选择 CSV 或 XLSX 文件');})();const incoming=parseRoster(table,$('rosterGroup').value);const next=combineRoster(roster,incoming);if(next.length>5000)throw Error('本机名册最多5000位学生');roster=next;classes=[...new Set([...classes,...roster.map(r=>r.group)])];if(example){records=[];example=false;importNames=[];selectedStudents.clear();}saveConfig();persistRoster();render();$('rosterNotice').textContent=`已处理 ${incoming.length} 位学生，当前名册 ${roster.length} 人；同班同账号去重。`+($('rememberRoster').checked?'已保存到当前设备。':'尚未勾选本机保存，刷新后清除。');notify('学员已按班级导入，可选择学生录入知识点成绩。未评分学生显示证据不足，不计为零分。');}catch(err){$('rosterNotice').textContent='名册未导入：'+err.message;}e.target.value='';});
$('rememberRoster').addEventListener('change',()=>{persistRoster();$('rosterNotice').textContent=$('rememberRoster').checked?'名单仅保存到当前设备浏览器，不会同步或上传。':'已关闭本机保存并移除保存副本；当前页面仍可使用，刷新后清除。';});
for(const id of ['rosterViewGroup','rosterSearch'])$(id).addEventListener('input',renderRoster);
$('rosterTemplate').onclick=()=>download('学员名册模板.csv',exportCSV([['班级','姓名','账号','年级','手机号码']]));
$('rosterExport').onclick=()=>{if(!roster.length){notify('名册为空。');return;}download('班级学员名册.csv',exportCSV([['班级','姓名','账号','年级','手机号码'],...roster.map(r=>[r.group,r.name,r.id,r.grade,r.phone])]));};
$('rosterClear').onclick=()=>{if(roster.length&&!confirm('清空全部学员名册及本机保存副本？已录入成绩保留。'))return;roster=[];selectedStudents.clear();persistRoster();render();$('rosterNotice').textContent='名册已清空，已录入成绩保留。';};

$('classForm').addEventListener('submit',e=>{e.preventDefault();const group=clean($('className').value);if(!group)return;classes=[...new Set([...classes,group])];saveConfig();$('classForm').reset();render();$('importGroup').value=group;notify(`已添加班级“${group}”，可在导入时选择。`);});
$('topicForm').addEventListener('submit',e=>{e.preventDefault();const t={lesson:clean($('topicLesson').value),title:clean($('topicTitle').value),objective:$('topicObjective').value.trim(),practice:$('topicPractice').value.trim(),resource:$('topicResource').value.trim()};if(!t.lesson||!t.title)return;
 const key=topicKey(t);if(topics.some(x=>topicKey(x)===key&&topicKey(x)!==editing)){notify('本课已有同名知识点，请点击编辑。');return;}
 if(editing&&editing!==key&&records.some(r=>topicKey(r)===editing)){notify('此知识点已有成绩。为避免破坏关联，请保留课次和名称；可修改目标、练习与材料。');return;}
 topics=topics.filter(x=>topicKey(x)!==editing);topics.push(t);saveConfig();$('resetTopic').click();render();notify('知识点已保存。请录入对应评分证据，系统不会把整课总分分配到知识点。');});
$('resetTopic').onclick=()=>{editing=null;$('topicForm').reset();$('saveTopic').textContent='保存知识点';};
for(const id of ['groupFilter','lessonFilter','search'])$(id).addEventListener('input',render);
$('studentFilter').addEventListener('change',renderStudent);
$('scoreLesson').addEventListener('change',syncScoreTopics);for(const id of ['scoreStudent','scoreTopic'])$(id).addEventListener('change',loadScore);
$('scoreForm').addEventListener('submit',e=>{e.preventDefault();const student=allStudents.find(s=>studentKey(s)===$('scoreStudent').value),lesson=$('scoreLesson').value,topic=$('scoreTopic').value;if(!student||!lesson||!topic){notify('请先添加学生记录和本课知识点。');return;}const read=id=>$(id).value===''?null:Number($(id).value);const classroom=read('scoreClassroom'),homework=read('scoreHomework');if([classroom,homework].some(v=>v!==null&&(!Number.isFinite(v)||v<0||v>100))){notify('成绩须为0–100，留空表示缺失。');return;}const existing=allRows.find(r=>studentKey(r)===studentKey(student)&&r.lesson===lesson&&r.topic===topic);if(existing&&!confirm('替换此学生本课该知识点的两项成绩？留空的成绩将变为缺失。'))return;const indices=new Set(existing?.sourceIndices||[]);records=records.filter((_,i)=>!indices.has(i));records.push({id:student.id,name:student.name,group:student.group,lesson,topic,classroom,homework});render();notify('已保存知识点成绩，图表与学习方案已更新。');});

$('file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;$('mapping').hidden=true;pending=null;$('notice').textContent='正在读取表格…';try{if(file.size>20*1024*1024)throw Error('文件超过20MB，请拆分');const rows=file.name.toLowerCase().endsWith('.xlsx')?await readXLSX(file):file.name.toLowerCase().endsWith('.csv')?csv(await file.text()):(()=>{throw Error('请选择 .xlsx 或 .csv');})();if(rows.length<2||rows.length>50001)throw Error('表格需要表头和1–50000行数据');pending={headers:rows[0],rows:rows.slice(1),name:file.name};showMapping();$('notice').textContent=`读取 ${pending.rows.length} 行，请确认列匹配。`;}catch(err){$('notice').textContent='读取失败：'+err.message;}e.target.value='';});
function showMapping(){if(!pending)return;const auto=infer(pending.headers),mode=$('mode').value;$('mapping').replaceChildren(el('h3','确认列匹配'));const grid=el('div',undefined,'controls');for(const key of ['id','name','group','lesson','topic',...(mode==='combined'?['classroom','homework']:['score'])]){const label=el('label',fields[key]),select=el('select');select.id='map-'+key;select.append(new Option('未选择',-1),...pending.headers.map((h,i)=>new Option(h||`第 ${i+1} 列`,i)));select.value=auto[key];label.append(select);grid.append(label);}$('mapping').append(grid);const button=el('button','确认并导入');button.onclick=()=>{try{const mapping=Object.fromEntries(Object.keys(fields).map(k=>[k,$('map-'+k)?Number($('map-'+k).value):-1]));if(mode==='combined'&&mapping.classroom<0&&mapping.homework<0)throw Error('请至少选择一列成绩');if(mode!=='combined'&&mapping.score<0)throw Error('请选择成绩列');const {result,errors}=normalize(pending.rows,mapping,mode,$('lesson').value,Number($('max').value),$('importGroup').value);if(errors.length){$('notice').textContent=`未导入：${errors.length}行错误，请修正后重新导入。`;$('issues').replaceChildren(...errors.slice(0,100).map(x=>el('li',x)));return;}if(example){records=[];importNames=[];example=false;selectedStudents.clear();}records.push(...result);classes=[...new Set([...classes,...result.map(r=>r.group).filter(Boolean)])];importNames.push(pending.name);for(const row of result)if(row.topic&&!topics.some(t=>topicKey(t)===topicKey(row)))topics.push({lesson:row.lesson,title:row.topic,objective:'',practice:'',resource:''});saveConfig();pending=null;$('mapping').hidden=true;render();$('notice').textContent=`成功导入 ${result.length} 行。`;notify('导入完成，可按班级筛选并查看知识点分析。');}catch(err){$('notice').textContent=err.message;}};$('mapping').append(button);$('mapping').hidden=false;}
$('mode').addEventListener('change',showMapping);
$('template').onclick=()=>download('知识点成绩导入模板.csv',exportCSV([['学号','姓名','班级','课次','知识点','课堂练习成绩','课后作业成绩'],['001','示例学生','七年级一班','第1课','移项与等式性质',50,60],['001','示例学生','七年级一班','第1课','方程检验',80,90]]));
$('export').onclick=()=>{if(!visible.length){notify('当前范围没有可导出的数据。');return;}download('学情分析与知识点方案.csv',exportCSV([['学号','姓名','班级','课次','知识点','课堂(%)','作业(%)','知识点指标','状态','详细方案'],...visible.map(r=>{const ev=evidence(r),t=topics.find(t=>topicKey(t)===topicKey(r))||{lesson:r.lesson,title:r.topic};return [r.id,r.name,r.group,r.lesson,r.topic||'整课总分',...grade(r),r.topic?fmt(ev.score):'',r.topic?ev.status:feedback(r)[0],r.topic?learningPlan({topic:t,row:r,...ev}).map(([title,detail])=>title+'：'+detail).join('\n'):feedback(r)[1]];})]));};

function preview(pages,title){$('reportPages').replaceChildren(...pages);$('reportTitle').textContent=title;$('reportPreview').hidden=false;document.body.classList.add('preview-open');$('closeReport').focus();}
$('selectAll').onclick=()=>{for(const s of scopedStudents())selectedStudents.add(studentKey(s));renderChecklist(scopedStudents());};
$('selectNone').onclick=()=>{selectedStudents.clear();renderChecklist(scopedStudents());};
$('batchReport').onclick=()=>{const selected=scopedStudents().filter(s=>selectedStudents.has(studentKey(s)));if(!selected.length){notify('请在当前范围勾选至少一位学生。');return;}preview(selected.map(s=>studentReport(s,visible,topics,lessonsSelected())),`${scopeText()} · ${selected.length} 位学生的报告`);};
$('classReport').onclick=()=>{if(!scopedStudents().length){notify('当前范围没有学生记录，无法生成班级报告。');return;}preview([classReport(visible,topics,lessonsSelected(),scopeText(),scopedStudents())],'班级报告 · '+scopeText());};
$('printReport').onclick=()=>window.print();
$('closeReport').onclick=()=>{$('reportPreview').hidden=true;document.body.classList.remove('preview-open');$('batchReport').focus();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('reportPreview').hidden)$('closeReport').click();});
$('backup').onclick=()=>download('知课课程设置.json',JSON.stringify({version:2,classes,topics},null,2),'application/json');
$('restore').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>3*1024*1024)throw Error('设置文件过大');const config=validateConfig(JSON.parse(await file.text()));if(!confirm('用此文件替换本机班级与课程设置？学生成绩不变。'))return;({classes,topics}=config);saveConfig();render();notify('课程设置已恢复。');}catch(err){notify('设置导入失败：'+err.message);}e.target.value='';};
$('clear').onclick=()=>{if(records.length&&!confirm('清空全部学生成绩？请先导出需要保留的报告；课程知识点设置会保留。'))return;records=[];importNames=[];pending=null;example=false;selectedStudents.clear();$('mapping').hidden=true;render();notify('学生成绩已清空，课程设置保留。');};
$('demo').onclick=()=>{
 if(records.length&&!confirm('替换当前成绩为虚构示例？课程设置会保留。'))return;
 classes=[...new Set([...classes,'示例一班','示例二班'])];
 const demoTopics=[{lesson:'示例第1课',title:'移项与等式性质',objective:'说明等式变形的依据，正确完成移项并处理符号。',practice:'完成教师提供的3道移项基础题、2道含括号变式题，每一步注明等式性质并代入检验。',resource:'本课方程学习单：等式性质与移项'},{lesson:'示例第1课',title:'方程检验',objective:'将解代回原方程，独立判断左右两边是否相等。',practice:'检验3个给定方程的候选解；说明不成立时是计算错误还是候选解错误。',resource:'本课检验步骤卡'},{lesson:'示例第2课',title:'实际问题建模',objective:'从文字条件中识别未知量、单位和相等关系，并建立方程。',practice:'完成2道数量关系分析和1道情境建模题，先画关系图，再列式，最后核对单位。',resource:'实际问题建模任务单'}];
 for(const t of demoTopics)if(!topics.some(x=>topicKey(x)===topicKey(t)))topics.push(t);
 records=[];for(const [g,group] of ['示例一班','示例二班'].entries())for(const [i,name] of ['林同学','陈同学','周同学','吴同学','郑同学'].entries())for(const [j,t] of demoTopics.entries()){const a=[92,72,42,56,80][i]+g*4-j*3,b=[95,48,52,85,88][i]+g*3-j*2;records.push({id:String(g*100+i+1).padStart(3,'0'),name,group,lesson:t.lesson,topic:t.title,classroom:i===4&&j===2?null:a,homework:i===4&&j===0?null:b});}
 example=true;importNames=[];selectedStudents.clear();saveConfig();render();$('groupFilter').value='示例一班';render();notify('已载入2个班级、10位虚构学生、2节课、3个知识点的示例。');
};
render();
