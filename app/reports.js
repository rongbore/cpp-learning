import {aggregateTopics, masteryForStudent, learningPlan, fmt} from './analysis.js';
import {el, bar, badge} from './ui.js';

function reportHeader(title, subtitle) {
  const header=el('div',undefined,'report-heading');
  header.append(el('p','知课 / LEARNING EVIDENCE','eyebrow'),el('h1',title),el('p',subtitle));
  return header;
}
function methodNote() {
  return el('p','方法：有效课堂与作业百分制得分等权平均；缺失不计零分，单源仅作暂定，冲突不计入。阈值为教学参考（60 / 80 / 90），不是标准化能力测量。学习方案需结合教师观察确认。报告不自动判断学习态度或错误原因。','report-note');
}
export function studentReport(student, rows, topics, lessons) {
  const article=el('article',undefined,'report-page');
  article.append(reportHeader('学生学习分析与改进报告',`${student.group||'未分班'} · ${student.name||'未填姓名'} · 学号 ${student.id||'未填写'} · ${lessons.length?lessons.join('、'):'全部课次'} · ${new Date().toLocaleDateString('zh-CN')}`));
  article.append(methodNote());
  const items=masteryForStudent(rows,topics,student,lessons);
  article.append(el('h2','知识点掌握示意图'));
  if(!items.length) article.append(el('p','尚无课程知识点。请先设置每课知识点并录入对应成绩。'));
  for(const item of items) {
    const chart=el('div',undefined,'report-chart-item');chart.append(el('h3',`${item.topic.lesson} / ${item.topic.title}`),bar('课堂练习',item.row?.classroomConflict?null:item.row?.classroom??null,undefined),bar('课后作业',item.row?.homeworkConflict?null:item.row?.homework??null,undefined,'homework-color'),el('p',`指标 ${fmt(item.score)} · ${item.status} · 有效来源 ${item.count}/2`));article.append(chart);
  }
  article.append(el('h2','知识点学习方案'));
  for(const item of items) {
    const block=el('section',undefined,'report-plan');const heading=el('h3',`${item.topic.lesson} / ${item.topic.title} `);heading.append(badge(item.status));block.append(heading);
    const list=el('ol');for(const [title,detail] of learningPlan(item)){const li=el('li');li.append(el('strong',title+'：'),el('span',detail));list.append(li);}block.append(list);article.append(block);
  }
  const totals=rows.filter(r=>!r.topic&&r.group===student.group&&(student.id?r.id===student.id:r.name===student.name));
  if(totals.length){article.append(el('h2','整课总分（不用于推算知识点）'));for(const row of totals)article.append(el('p',`${row.lesson}：课堂 ${row.classroomConflict?'待核对':row.classroom??'缺失'}；作业 ${row.homeworkConflict?'待核对':row.homework??'缺失'}`));}
  return article;
}
export function classReport(rows,topics,lessons,scope) {
  const article=el('article',undefined,'report-page');article.append(reportHeader('班级知识点分析与教学改进报告',`${scope} · ${new Date().toLocaleDateString('zh-CN')}`),methodNote());
  const stats=aggregateTopics(rows,topics,lessons);
  if(!stats.length)article.append(el('p','本范围尚无知识点评分证据或课程设置。'));
  for(const s of stats){const section=el('section',undefined,'report-plan');section.append(el('h2',`${s.topic.lesson} / ${s.topic.title}`),bar('课堂练习',s.classroom),bar('课后作业',s.homework,undefined,'homework-color'),el('p',`知识点指标 ${fmt(s.score)} / 100；有证据 ${s.count}/${s.total} 人；双源齐全 ${s.complete} 人；优先补强 ${s.weak} 人；无有效证据 ${s.missing} 人。分母为当前范围内有记录的学生。`));
    section.append(el('p',`教学建议：先为 ${s.missing} 位无有效证据的学生补充诊断；为 ${s.weak} 位双源均分低于60分的学生安排小组讲解与基础练习；其余学生按个人报告分层巩固。第7天用新题复测，复核干预效果。`));
    if(s.topic.objective)section.append(el('p','学习目标：'+s.topic.objective));
    if(s.topic.practice)section.append(el('p','指定练习：'+s.topic.practice));
    article.append(section);
  }return article;
}
