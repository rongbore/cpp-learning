import {clean} from './core.js';
import {studentKey} from './analysis.js';
export const canonicalGroup = value => ({'莲华实验':'莲花实验班','莲华实验班':'莲花实验班','莲花实验':'莲花实验班','滨州一中':'滨州一中班'}[clean(value)] || clean(value));
const labels={id:['账号','账户','用户名','学号','学生编号','id'],name:['姓名','学生姓名','name'],group:['班级','培训班级','group'],grade:['年级','年级班级','原班级','grade'],phone:['手机号码','手机号','电话','家长电话','phone']};
export function parseRoster(table, fallback='') {
  if(table.length<2||table.length>5001)throw Error('名单需要表头和1–5000行学生信息');
  const headers=table[0].map(clean);
  const cols=Object.fromEntries(Object.entries(labels).map(([key,aliases])=>[key,headers.findIndex(h=>aliases.includes(h.toLowerCase()))]));
  if(cols.id<0||cols.name<0)throw Error('名单需要“姓名”和“账号”（或学号）列');
  const rows=[],errors=[];
  table.slice(1).forEach((values,i)=>{
    if(!values.some(v=>clean(v)))return;
    const get=key=>cols[key]>=0?clean(values[cols[key]]):'';
    const row={id:get('id'),name:get('name').replace(/<br\s*\/?\s*>/gi,''),group:canonicalGroup(get('group')||fallback),grade:get('grade'),phone:get('phone')};
    if(!row.id||!row.name||!row.group){errors.push(`第${i+2}行缺少姓名、账号或班级`);return;}
    if(row.id.length>120||row.name.length>120||row.group.length>80||row.grade.length>40||row.phone.length>30){errors.push(`第${i+2}行字段过长`);return;}
    rows.push(row);
  });
  if(errors.length)throw Error(errors.slice(0,10).join('；'));
  return combineRoster([],rows);
}
export function combineRoster(current,incoming) {
  const map=new Map(current.map(r=>[studentKey(r),{...r}]));
  for(const row of incoming){
    const key=studentKey(row),old=map.get(key);
    if(old){
      for(const field of ['name','grade','phone'])if(old[field]&&row[field]&&old[field]!==row[field])throw Error(`同一班级账号 ${row.id} 的${{name:'姓名',grade:'年级',phone:'电话'}[field]}与已有名册冲突，请先核对文件；本次未导入`);
      map.set(key,{...old,...Object.fromEntries(Object.entries(row).filter(([,v])=>v!==''))});
    }else map.set(key,{...row});
  }return [...map.values()];
}
export function linkRoster(records, roster) {
  return records.map(record=>{
    const group=canonicalGroup(record.group);
    const candidates=roster.filter(s=>(!group||s.group===group)&&(record.id?s.id===record.id:s.name===record.name));
    if(candidates.length!==1)return {...record,group};
    const student=candidates[0];return {...record,group:student.group,id:student.id,name:record.name||student.name};
  });
}
export const maskedPhone = value => !value?'未提供':value.length===11?value.slice(0,3)+'****'+value.slice(-4):'已提供';
