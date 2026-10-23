from playwright.sync_api import sync_playwright
from pathlib import Path
import json
R=Path(__file__).parent
MOCK='''(() => {
 const data={}; window.__xhsCalls=[]; window.__gyros=[];
 const ok=(name, fields)=>Promise.resolve(Object.assign({errMsg:name+':ok'},fields||{}));
 const rec=(name,arg)=>window.__xhsCalls.push({name:name,arg:arg});
 window.xhs={
   launchOptions:{miniToolEnv:{buildVersion:9510004}},
   miniTool:{
     getLaunchOptions:()=>ok('getLaunchOptions',{miniToolEnv:{buildVersion:9510004}}),
     getWindowInfo:()=>{rec('window');return ok('getWindowInfo',{windowWidth:390,windowHeight:844,safeArea:{top:42,bottom:810},menuButtons:{share:{top:4,bottom:55},back:null,me:null}});},
     getStorage:({key})=>{rec('getStorage',key);return ok('getStorage',{data:Object.prototype.hasOwnProperty.call(data,key)?data[key]:null});},
     setStorage:({key,data:payload})=>{rec('setStorage',{key:key,data:payload});data[key]=payload;return ok('setStorage');},
     removeStorage:({key})=>{rec('removeStorage',key);delete data[key];return ok('removeStorage');},
     writeTempFile:({data})=>{rec('writeTempFile',data.slice(0,30));return ok('writeTempFile',{filePath:'wxfile://temp/heartfield.png'});},
     postNote:(arg)=>{rec('postNote',arg);return ok('postNote');},
     saveImageToPhotosAlbum:(arg)=>{rec('album',arg);return ok('saveImageToPhotosAlbum');},
     interactionOpenApi:(arg)=>{rec('comment',arg);return ok('interactionOpenApi',{routed:true,savedToAlbum:false});},
     getFollowStatus:()=>ok('getFollowStatus',{follow_status:0}),
     followAuthor:()=>ok('followAuthor',{follow_status:1}),
     vibrateShort:(arg)=>ok('vibrateShort'),
     onGyroscopeChange:(fn)=>{rec('gyroOn');window.__gyros.push(fn);},
     offGyroscopeChange:(fn)=>{rec('gyroOff');window.__gyros=window.__gyros.filter(x=>x!==fn);},
     startGyroscope:({interval})=>{rec('gyroStart',interval);return ok('startGyroscope');},
     stopGyroscope:()=>{rec('gyroStop');return ok('stopGyroscope');}
   }
 };
})();'''

def setup(browser,mock=True):
 p=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=2)
 err=[];p.on('pageerror',lambda e:err.append(str(e)))
 p.set_content((R/'index.html').read_text())
 p.add_style_tag(content=(R/'style.css').read_text())
 p.evaluate('window.__HEARTMINE_TEST__=true')
 if mock:p.evaluate(MOCK)
 p.add_script_tag(content=(R/'xhs-adapter.js').read_text())
 p.add_script_tag(content=(R/'game.js').read_text())
 p.wait_for_timeout(180)
 return p,err

def calls(p,name):return p.evaluate('(name)=>window.__xhsCalls.filter(x=>x.name===name)',name)

def test():
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  try:
   p,e=setup(b)
   assert p.locator('#followPanel').is_visible(),'follow hidden'
   assert p.locator('#motionBtn').is_visible(),'gyro UI hidden'
   assert p.evaluate("document.documentElement.style.getPropertyValue('--xhs-avoid-top')")=='61px'
   p.locator('#motionBtn').click()
   assert calls(p,'gyroStart')[-1]['arg']=='ui'
   p.evaluate('window.__gyros[0]({x:2,y:2,z:0})')
   p.locator('#motionBtn').click()
   assert calls(p,'gyroStop')
   p.locator('#startBtn').click()
   p.wait_for_timeout(200)
   assert calls(p,'setStorage')
   s=p.evaluate('window.__heartMineDebug.getState()')
   t=(s['route'][1]['r'],s['route'][1]['c'])
   p.evaluate('([r,c])=>window.__heartMineDebug.hitCell(r,c,false)',list(t))
   p.wait_for_timeout(300)
   actual=p.evaluate('window.__heartMineDebug.getState()')
   assert actual['steps']==1 and actual['pos']=={'r':t[0],'c':t[1]},'party did not advance'
   p.locator('#shareCodeBtn').click()
   p.wait_for_timeout(150)
   assert '评论区同题PK' in p.locator('#modalButtons').inner_text()
   p.get_by_text('评论区同题PK').click()
   p.wait_for_timeout(240)
   comments=calls(p,'comment')
   assert comments, 'comment API not called'
   payload=comments[-1]['arg']['payload']
   assert payload['media_bean'][0]['cover_image_url']=='wxfile://temp/heartfield.png'
   assert json.loads(payload['miniToolSnapshotInfo'])['code']==actual['code']
   p.get_by_text('做一张挑战海报').click()
   p.get_by_text('发小红书笔记').click()
   p.wait_for_timeout(240)
   assert calls(p,'postNote')[-1]['arg']['mediaInfo']['image_resources'][0]['url']=='wxfile://temp/heartfield.png'
   p.get_by_text('保存海报').click()
   p.wait_for_timeout(260)
   assert calls(p,'album')[-1]['arg']['filePath']=='wxfile://temp/heartfield.png'
   p.keyboard.press('Escape')
   p.locator('#backHomeBtn').click()
   p.get_by_text('返回首页',exact=True).click()
   p.wait_for_timeout(300)
   assert p.locator('#resumeBtn').is_visible(), 'resume missing'
   p.locator('#resumeBtn').click()
   p.wait_for_timeout(300)
   restored=p.evaluate('window.__heartMineDebug.getState()')
   assert restored['code']==actual['code'] and restored['safeOpened']==actual['safeOpened']
   assert restored['active']==actual['active'] and restored['pos']==actual['pos']
   assert not e,e
   print('PASS 9.51 SDK: follow, window safe-area, gyroscope, comment local file and snapshot, note, album, storage, resume')
   p.close()
   # Native failure must not fake success or silently cross-read browser storage
   p,e=setup(b,mock=False)
   assert p.locator('#motionBtn').is_hidden()
   assert p.locator('#followPanel').is_hidden()
   p.locator('#startBtn').click();p.wait_for_timeout(180)
   assert p.evaluate('window.__heartMineDebug.getState()')
   assert not e,e
   print('PASS browser fallback: no native buttons, playable, no errors')
   p.close()
  finally:b.close()
if __name__=='__main__': test()
