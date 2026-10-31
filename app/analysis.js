// Descriptive evidence, not a psychometric estimate or causal diagnosis.
export const studentKey = r => JSON.stringify([r.group, r.id ? ['id', r.id] : ['name', r.name]]);
export const topicKey = r => JSON.stringify([r.lesson, r.topic || r.title]);
export const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export const fmt = value => value === null ? '—' : value.toFixed(1);

export function evidence(row) {
  if (!row || row.classroomConflict || row.homeworkConflict) {
    return {score: null, count: 0, status: row ? '待核对' : '证据不足', gap: null};
  }
  const values = [row.classroom, row.homework].filter(v => v !== null && v !== undefined);
  if (!values.length) return {score: null, count: 0, status: '证据不足', gap: null};
  const score = mean(values), count = values.length;
  const status = count < 2 ? '单源待验证' : score < 60 ? '优先补强' : score < 80 ? '需要巩固' : score < 90 ? '达到目标' : '拓展提升';
  return {score, count, status, gap: count === 2 ? row.homework - row.classroom : null};
}

export function catalogFor(rows, topics, lessons = []) {
  const map = new Map();
  for (const topic of topics) if (!lessons.length || lessons.includes(topic.lesson)) map.set(topicKey(topic), topic);
  for (const row of rows) if (row.topic && !map.has(topicKey(row))) map.set(topicKey(row), {lesson: row.lesson, title: row.topic, objective: '', practice: '', resource: ''});
  return [...map.values()].sort((a, b) => a.lesson.localeCompare(b.lesson, 'zh', {numeric: true}) || a.title.localeCompare(b.title, 'zh'));
}

export function studentsIn(rows) {
  return [...new Map(rows.map(row => [studentKey(row), row])).values()];
}

export function masteryForStudent(rows, topics, student, lessons = []) {
  const relevant = rows.filter(r => studentKey(r) === studentKey(student) && (!lessons.length || lessons.includes(r.lesson)));
  return catalogFor(relevant, topics, lessons).map(topic => {
    const row = relevant.find(r => r.lesson === topic.lesson && r.topic === topic.title);
    return {topic, row, ...evidence(row)};
  });
}

export function aggregateTopics(rows, topics, lessons = [], population = studentsIn(rows)) {
  const students = studentsIn(population);
  return catalogFor(rows, topics, lessons).map(topic => {
    const entries = students.map(student => evidence(rows.find(r => studentKey(r) === studentKey(student) && r.lesson === topic.lesson && r.topic === topic.title)));
    const scored = entries.filter(e => e.score !== null);
    const matchedRows = rows.filter(r => r.lesson === topic.lesson && r.topic === topic.title);
    const valid = matchedRows.filter(r => !r.classroomConflict && !r.homeworkConflict);
    return {topic, score: mean(scored.map(e => e.score)), count: scored.length,
      classroom: mean(valid.filter(r => r.classroom !== null).map(r => r.classroom)),
      homework: mean(valid.filter(r => r.homework !== null).map(r => r.homework)),
      complete: entries.filter(e => e.count === 2).length,
      weak: entries.filter(e => e.count === 2 && e.score < 60).length,
      missing: entries.filter(e => e.count === 0).length, total: students.length};
  });
}

export function learningPlan(item) {
  const {topic, row, score, count, status, gap} = item;
  const goal = topic.objective || `用自己的话解释「${topic.title}」的关键概念、适用条件，并独立完成对应任务。`;
  const practice = topic.practice || `围绕「${topic.title}」完成 3 道基础题、2 道变式题；每题写明依据、步骤与检查方法。具体题目由教师选取。`;
  if (score === null) return [
    ['证据核验', status === '待核对' ? '先核对重复或冲突分数，再开展诊断；冲突记录不计入掌握指标。' : `尚无「${topic.title}」的直接评分证据。整课总分不能代替知识点评估。`],
    ['补充评估 · 下次课前', `安排 3–5 道覆盖「${topic.title}」的诊断题，记录课堂独立作答与课后巩固成绩（分别注明满分），再生成学习方案。`],
    ['学习目标', goal]
  ];
  const focus = gap !== null && gap <= -20 ? '作业得分低于课堂至少20个百分点。请学生复述独立完成过程，核查迁移、时间安排与题型差异；不据此推断学习态度。' : gap !== null && gap >= 20 ? '作业得分高于课堂至少20个百分点。安排不借助资料的独立限时复测，核查能否解释步骤；不据此推断作业真实性。' : score < 60 ? '先区分概念理解、条件识别、步骤执行或计算检查上的具体错误；请学生口述一道错题的思考过程。' : '检查是否能在题目条件变化后独立运用，关注解题依据与自我检查。';
  const result = [
    ['证据与目标', `${count === 1 ? '目前仅有单一来源，结论暂定。' : '课堂与作业各一条评分证据。'}当前指标 ${fmt(score)}/100。目标：${goal}`],
    ['诊断 · 第1天 / 10分钟', focus],
    ['概念重建 · 第1天 / 15分钟', `重读「${topic.title}」的定义与例题。制作一张“概念—适用条件—易错点”卡片；合上资料口述，并让教师或同伴核对。${topic.resource ? '参考材料：' + topic.resource : '使用本课教材和教师讲义。'}`],
    ['分层练习 · 第2天 / 20分钟', practice],
    ['订正与迁移 · 第3天 / 15分钟', score >= 90 ? `设计或完成 2 道「${topic.title}」跨情境拓展任务，说明为什么适用该方法，并给出一种不适用的情形。` : `选 2 道「${topic.title}」错题，写出错误原因、正确依据，再各做一道同结构新题；不照抄答案。`],
    ['延迟复测 · 第7天 / 10分钟', `使用 5 道覆盖同一目标的新题独立闭卷复测。建议目标 ≥80%，且能解释关键步骤；未达标则返回具体错因，补练后在48小时内再测。复测结果需重新录入，系统不自动认定已改善。`]
  ];
  if (count === 1) result.splice(1, 0, ['补齐证据', `补录${row.classroom === null ? '课堂独立练习' : '课后作业'}成绩后，再比较两种场景下的表现。`]);
  return result;
}
