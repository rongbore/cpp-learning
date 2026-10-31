from pathlib import Path
from playwright.sync_api import sync_playwright
import subprocess
import os
import tempfile
out=Path(tempfile.mkdtemp(prefix='zhike-smoke-'));print('Artifacts:',out)
(out/'topics.csv').write_text('学号,姓名,课次,知识点,课堂练习成绩,课后作业成绩\n101,测试甲,第1课,移项,20,40\n101,测试甲,第1课,检验,90,95\n102,测试乙,第1课,移项,60,80\n',encoding='utf-8-sig')
(out/'legacy.csv').write_text('学号,姓名,班级,课次,课堂练习成绩,课后作业成绩\n103,总分同学,测试班,第1课,99,99\n',encoding='utf-8-sig')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1050})
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 page.goto(os.environ.get('ZHIKE_TEST_URL','http://127.0.0.1:8001'))
 for group in ['莲花实验班','滨州实验1班','滨州实验2班','滨州一中班']:
  assert group in page.locator('#classTags').inner_text()
 page.evaluate("localStorage.setItem('zhike-course-v2',JSON.stringify({classes:['既有班级'],topics:[]}))")
 page.reload()
 assert '既有班级' in page.locator('#classTags').inner_text()
 assert '莲花实验班' in page.locator('#classTags').inner_text()
 page.locator('#demo').click()
 assert page.locator('#groupFilter').input_value()=='示例一班'
 assert page.locator('#results tr').count()==15
 page.locator('#studentFilter').select_option(index=1)
 assert page.locator('#studentChart .topic-chart').count()==3
 assert '第7天' in page.locator('#plans').inner_text()
 assert '方程学习单' in page.locator('#plans').inner_text()
 page.screenshot(path=str(out/'desktop.png'),full_page=True)
 page.locator('#groupFilter').select_option('示例二班')
 assert page.locator('#results tr').count()==15
 assert '示例一班' not in page.locator('#results').inner_text()
 page.locator('#lessonFilter').select_option('示例第1课')
 assert page.locator('#results tr').count()==10
 page.locator('#selectAll').click()
 assert page.locator('#studentChecklist input:checked').count()==5
 page.locator('#batchReport').click()
 assert page.locator('#reportPages > article').count()==5
 assert '示例一班' not in page.locator('#reportPages').inner_text()
 assert '示例第2课' not in page.locator('#reportPages').inner_text()
 page.evaluate('() => {window.__printed=0;window.print=()=>window.__printed++;}')
 page.locator('#printReport').click();page.wait_for_function('window.__printed===1')
 page.pdf(path=str(out/'students.pdf'),format='A4',print_background=True,prefer_css_page_size=True)
 page.locator('#closeReport').click()
 page.locator('#classReport').click()
 assert '示例二班' in page.locator('#reportPages').inner_text()
 assert '优先补强' in page.locator('#reportPages').inner_text()
 page.pdf(path=str(out/'class.pdf'),format='A4',print_background=True,prefer_css_page_size=True)
 page.locator('#closeReport').click()
 # Responsive layout and class dropdown.
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 page.screenshot(path=str(out/'mobile.png'),full_page=True)
 page.set_viewport_size({'width':1440,'height':1050})
 # Course persistence excludes private grades.
 page.reload()
 assert page.locator('#results tr').count()==0
 assert '示例一班' in page.locator('#classTags').inner_text()
 page.locator('#className').fill('测试班');page.locator('#classForm button').click()
 page.locator('#topicForm').evaluate('(f)=>f.closest("details").open=true')
 page.locator('#topicLesson').fill('第1课');page.locator('#topicTitle').fill('移项')
 page.locator('#topicObjective').fill('正确识别移项变号')
 page.locator('#topicPractice').fill('教材第10页第1至3题')
 page.locator('#topicResource').fill('第1课讲义')
 page.locator('#saveTopic').click()
 page.locator('#file').set_input_files(out/'topics.csv')
 page.get_by_role('button',name='确认并导入',exact=True).click()
 assert page.locator('#results tr').count()==3
 page.locator('#groupFilter').select_option('测试班');page.locator('#lessonFilter').select_option('第1课')
 page.locator('#studentFilter').select_option(index=1)
 assert '教材第10页第1至3题' in page.locator('#plans').inner_text()
 assert '优先补强' in page.locator('#studentChart').inner_text()
 # Manual corrections replace source records, never create duplicate conflicts.
 page.locator('#scoreForm').evaluate('(f)=>f.closest("details").open=true')
 page.locator('#scoreStudent').select_option(index=0)
 page.locator('#scoreLesson').select_option('第1课');page.locator('#scoreTopic').select_option('移项')
 page.locator('#scoreClassroom').fill('80');page.locator('#scoreHomework').fill('90')
 page.locator('#scoreForm button').click()
 assert '达到目标' in page.locator('#studentChart').inner_text()
 assert page.locator('#issues li').count()==0
 page.locator('#file').set_input_files(out/'legacy.csv')
 page.get_by_role('button',name='确认并导入',exact=True).click()
 page.locator('#studentFilter').select_option(label='测试班 · 总分同学 (103)')
 assert '证据不足' in page.locator('#studentChart').inner_text()
 assert '整课总分不能代替' in page.locator('#plans').inner_text()
 with page.expect_download() as d:page.locator('#export').click()
 d.value.save_as(out/'analysis.csv')
 assert '详细方案' in (out/'analysis.csv').read_text(encoding='utf-8-sig')
 # Course settings backup, reload and restore.
 with page.expect_download() as d:page.locator('#backup').click()
 d.value.save_as(out/'settings.json')
 page.reload();assert page.locator('#results tr').count()==0
 page.locator('#restore').set_input_files(out/'settings.json')
 assert '课程设置已恢复' in page.locator('#globalNotice').inner_text()
 # Roster-only students, persistence and account-based score association (fictional data).
 (out/'roster.csv').write_text('班级,姓名,账号,年级,手机号码\n名册测试班,名册甲,roster01,7.10,13000000000\n名册测试班,名册乙,roster02,,\n',encoding='utf-8-sig')
 page.locator('#rosterSection').evaluate('(d)=>d.open=true')
 page.locator('#rememberRoster').check()
 page.locator('#rosterFile').set_input_files(out/'roster.csv')
 page.wait_for_function('document.querySelectorAll("#rosterRows tr").length===2')
 assert page.locator('#rosterRows tr').count()==2
 assert '7.10' in page.locator('#rosterRows').inner_text()
 assert '130****0000' in page.locator('#rosterRows').inner_text()
 assert '13000000000' not in page.locator('#rosterRows').inner_text()
 page.locator('#groupFilter').select_option('名册测试班')
 page.locator('#lessonFilter').select_option('第1课')
 assert '2 位学生' in page.locator('#scopeLabel').inner_text()
 assert page.locator('#results tr').count()==0
 page.locator('#studentFilter').select_option(label='名册测试班 · 名册乙 (roster02)')
 assert '证据不足' in page.locator('#studentChart').inner_text()
 (out/'account-scores.csv').write_text('账号,课次,知识点,课堂练习成绩,课后作业成绩\nroster01,第1课,移项,80,90\n',encoding='utf-8-sig')
 page.locator('#importGroup').select_option('')
 page.locator('#file').set_input_files(out/'account-scores.csv')
 page.get_by_role('button',name='确认并导入',exact=True).click()
 assert page.locator('#results tr').count()==1
 assert '名册甲' in page.locator('#results').inner_text()
 assert '有证据 1/2 人' in page.locator('#classChart').inner_text()
 page.locator('#selectAll').click();page.locator('#batchReport').click()
 assert page.locator('#reportPages > article').count()==2
 assert '13000000000' not in page.locator('#reportPages').inner_text()
 assert '130****0000' not in page.locator('#reportPages').inner_text()
 page.locator('#closeReport').click()
 page.reload()
 page.locator('#rosterSection').evaluate('(d)=>d.open=true')
 assert page.locator('#rosterRows tr').count()==2
 assert page.locator('#results tr').count()==0
 page.locator('#rememberRoster').uncheck();page.reload()
 assert page.locator('#rosterRows tr').count()==0
 assert not errors,errors
 browser.close()
for pdf in ['students','class']:
 subprocess.run(['pdftotext','-layout',str(out/(pdf+'.pdf')),str(out/(pdf+'.txt'))],check=True)
 text=(out/(pdf+'.txt')).read_text()
 assert '知识点' in text,text[:1000]
 assert '示例二班' in text
 assert '示例一班' not in text
 assert '打印 / 保存 PDF' not in text
print('PASS: multi-class isolation, lesson scopes, charts, teacher-specific plans, manual correction, legacy no-inference, config persistence, CSV export, 5-student and class Chinese PDF, responsive layout; no browser errors')
