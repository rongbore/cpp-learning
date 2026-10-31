export const fields = {id:'学号',name:'姓名',group:'班级',lesson:'课次',classroom:'课堂练习成绩',homework:'课后作业成绩',score:'成绩',topic:'知识点'};
const aliases = {topic:['知识点','课程知识点','考点','topic'],id:['账号','账户','用户名','学号','学生编号','学生id','id'],name:['姓名','学生姓名','学生','name'],group:['班级','班别','class'],lesson:['课次','课程','课节','课时','上课日期','日期','lesson'],classroom:['课堂练习成绩','课堂成绩','课堂练习','随堂测验','随堂成绩'],homework:['课后作业成绩','作业成绩','课后作业','家庭作业'],score:['成绩','分数','得分','score']};
export const clean = v => String(v ?? '').normalize('NFKC').trim();
export function infer(headers){return Object.fromEntries(Object.entries(aliases).map(([k, list])=>[k,headers.findIndex(h=>list.includes(clean(h).toLowerCase()))]));}
export function csv(text){
 const rows=[];let row=[],cell='',quoted=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted || !cell)quoted=!quoted;else throw Error('CSV 引号格式错误');}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('CSV 存在未闭合的引号');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
export function normalize(rows,mapping,mode,lessonFallback,maxScore,groupFallback=''){
 if(!Number.isFinite(maxScore)||!(maxScore>0))throw Error('满分必须大于 0');
 if(mapping.id<0&&mapping.name<0)throw Error('请选择学号或姓名列');
 const result=[], errors=[];
 rows.forEach((row,i)=>{const get=k=>mapping[k]>=0?clean(row[mapping[k]]):'';const id=get('id'),name=get('name'),lesson=get('lesson')||clean(lessonFallback),group=get('group')||clean(groupFallback),topic=get('topic');
 if(!row.some(v=>clean(v)))return;
 if(!(id||name)||!lesson){errors.push(`第 ${i+2} 行：缺少学生标识或课次`);return;}
 const item={id,name,lesson,group,topic,classroom:null,homework:null};let bad=false;
 for(const kind of ['classroom','homework']){const raw=mode==='combined'?get(kind):mode===kind?get('score'):'';if(raw==='')continue;const value=Number(raw);if(!Number.isFinite(value)||value<0||value>maxScore){errors.push(`第 ${i+2} 行：${fields[kind]}必须在 0–${maxScore} 之间`);bad=true;}else item[kind]=Math.round(value/maxScore*10000)/100;}
 if(!bad)result.push(item);
 });return {result,errors};
}
export function merge(records){
 // A name may bridge an ID-less row only when it identifies exactly one student.
 const names=new Map();for(const r of records){const key=JSON.stringify([r.group,r.name]);if(r.id&&r.name){if(!names.has(key))names.set(key,new Set());names.get(key).add(r.id);}}
 const rows=new Map(),conflicts=[];
 for(const [sourceIndex,r] of records.entries()){const ids=names.get(JSON.stringify([r.group,r.name]));const id=r.id||(ids?.size===1?[...ids][0]:'');const ambiguous=!r.id&&ids?.size>1;
 const identity=id?['id',id]:['name',r.name];const key=JSON.stringify([r.group,identity,r.lesson,r.topic||'']);
 if(ambiguous){conflicts.push(`${r.name} / ${r.lesson}：同名学生有多个学号，该行未参与匹配`);continue;}
 if(!rows.has(key))rows.set(key,{...r,id,topic:r.topic||'',classroom:null,homework:null,sourceIndices:[]});const dst=rows.get(key);dst.sourceIndices.push(sourceIndex);
 for(const k of ['classroom','homework'])if(r[k]!==null&&r[k]!==undefined){if(dst[k]!==null&&dst[k]!==r[k]){conflicts.push(`${r.name||id} / ${r.lesson}：${fields[k]}重复且不一致，请修正源表后重新导入`);dst[k]=null;dst[k+'Conflict']=true;}else if(!dst[k+'Conflict'])dst[k]=r[k];}
 }return {rows:[...rows.values()],conflicts};
}
export function feedback(row){
 if(row.classroomConflict||row.homeworkConflict)return ['待核对','重复成绩冲突，请核对源表后重新导入。'];
 if(row.classroom===null||row.homework===null)return ['待补齐','尚未匹配到完整成绩，请核对课次、学生标识及作业提交情况。'];
 const a=row.classroom,b=row.homework;
 if(a<60&&b<60)return ['重点跟进','下节课前安排 10 分钟基础概念辅导；完成 3 道基础题，下一课复测。'];
 if(a-b>=20)return ['作业跟进','课堂表现较好，课后巩固不足；核查作业难点，分步订正并在下一课复测。'];
 if(b-a>=20)return ['课堂跟进','作业表现较好，课堂掌握需核实；安排独立限时练习，观察思路并即时反馈。'];
 if(Math.min(a,b)<60)return ['需要巩固','针对薄弱环节安排 3 道分层练习，逐题反馈，下一课复测。'];
 if(Math.min(a,b)>=85)return ['表现稳定','基础掌握较好；增加 1 道迁移拓展题，并请学生解释解题思路。'];
 return ['持续巩固','整理本课错题，完成 2 道同类题，下一课检查掌握情况。'];
}
export function exportCSV(rows){return '\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""').replace(/^[=+@\-\t\r]/,"'$&")+'"').join(',')).join('\r\n');}
