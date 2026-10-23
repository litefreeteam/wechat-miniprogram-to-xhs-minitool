(function () {
  'use strict';
  const $ = function (id) { return document.getElementById(id); };
  const LEVELS = {easy:{n:6,mines:6,hearts:3},normal:{n:7,mines:10,hearts:3},hard:{n:8,mines:15,hearts:3}};
  const QUESTIONS = [
    ['默契第一题','你们俩谁更容易在约会时迷路？','想好再选，别偷看对方。'],
    ['恋爱小秘密','你们俩谁更可能偷吃最后一口甜品？','选一个最像的人吧。'],
    ['我的安全感','谁更会在另一半难过时第一时间发现？','不一定是那个看起来更细心的人。'],
    ['恋爱脑洞','谁更可能突然提议一场说走就走的旅行？','今天终于可以大胆说出来。'],
    ['奇怪却可爱','你们俩谁更容易忘记纪念日？','两个人的答案可能大不一样。'],
    ['甜蜜的偏爱','谁更愿意先说「对不起」？','选完后可以拥抱一下。'],
    ['恋爱生存指南','谁更可能在恐怖片里先捂住眼睛？','选中自己也没关系。'],
    ['未来预告片','谁会成为二十年后的家庭气氛组？','每一对搭档的答案都不同。']
  ];
  const SCENES = {
    sunset:{name:'落日海岸',sash:'2.5D · 落日海岸',chapter:'CHAPTER 01 · SUNSET COAST',heading:'海风里的心动冒险',stages:['一起赶海','发现一枚贝壳','等最后一场日落'],moments:['海风把你们的脚印吹到了一起。','有一枚贝壳，好像藏着今天的约定。','太阳要落山了，最后几步一起走吧。'],
      sky:['#ffe9cd','#f6e1dc','#dceee4'],closed:['#ffe9d8','#f7ded6'],opened:['#e5f1e4','#d9ecdc'],side:['#ddb9ac','#cba69f','#a5c7b5','#91b2a6'],island:['#f8e7cb','#b3bfaa','#9aa995']},
    sakura:{name:'樱花公园',sash:'2.5D · 樱花公园',chapter:'CHAPTER 02 · SAKURA GARDEN',heading:'樱花树下的默契',stages:['一起赏花','收集樱花心愿','走过樱花小径'],moments:['第一片樱花落在了你们中间。','原来藏在树下的，是两个人的默契。','樱花快落完了，最后的约定还在等你们。'],
      sky:['#fce5ef','#fff2f0','#e8f4e4'],closed:['#ffe4ee','#f9d9e5'],opened:['#e6f3dc','#d5eddf'],side:['#e2bacb','#d3a9bc','#b5c8af','#94bca7'],island:['#f3deea','#c0b9bd','#9fada4']},
    starlight:{name:'星河露营',sash:'2.5D · 星河露营',chapter:'CHAPTER 03 · STAR CAMP',heading:'在星空下并肩探路',stages:['点亮营地','交换星星的秘密','许下流星心愿'],moments:['两个人的小帐篷，终于亮起了第一盏灯。','天上是星星，脚下是一起走过的安全格。','等一颗流星吧，你们马上就走到终点了。'],
      sky:['#172944','#374e73','#797393'],closed:['#e6dfef','#dcd7ee'],opened:['#e0f0e8','#cde3e8'],side:['#b6acc9','#aaa2c2','#a8c9c0','#8aafba'],island:['#d8cce1','#9a90b0','#858ba7']}
  };
  const NUM_COLORS = ['#658d87','#3b9ba8','#d38561','#c26786','#8871aa','#548f84','#a87275','#567b8d','#af665f'];
  const settings = {mode:'duo',level:'normal',scene:'sunset',names:['小满','阿野'],photos:[null,null],code:''};
  let game = null, inputMode='dig', soundOn=true, audioCtx=null, modalOpen=false, activeScene='home', toastTimer=null, rescueTimer=null, followBusy=false, followStatus=-1;
  const bridge=window.HeartfieldXHS;
  const SAVE_KEY='HEARTFIELD_ESCAPE_ACTIVE_V4',HISTORY_KEY='HEARTFIELD_ESCAPE_HISTORY_V4';
  let saveChain=Promise.resolve(),commentSupported=false,motionOn=false,gyroShift={x:0,y:0},sceneSafe=false;
  const canvas = $('gameCanvas'), heroCanvas = $('heroCanvas');
  const gameCtx = canvas.getContext('2d'), heroCtx = heroCanvas.getContext('2d');
  let gameSize = {w:400,h:350}, heroSize = {w:400,h:307}, lastFrame=0, touchDown=null, longPressTimer=null;
  const demoGame = makeDemo();
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function makeSeedHash(s) { let h=2166136261; for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);} return h>>>0; }
  function randGen(seed) { let x=seed||123456789; return function(){ x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296; }; }
  function randomCode() {const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let out='';for(let i=0;i<6;i++){out+=alphabet[Math.floor(Math.random()*alphabet.length)];}return out;}
  function neighbours(r,c,n){const a=[];for(let y=Math.max(0,r-1);y<=Math.min(n-1,r+1);y++){for(let x=Math.max(0,c-1);x<=Math.min(n-1,c+1);x++){if(x!==c||y!==r)a.push([y,x]);}}return a;}
  // The playable goal is to move a shared two-person party from bottom-left to top-right.
  // A code-derived corridor is kept mine-free, so every board has a valid four-direction route.
  // This corridor is NOT exposed to the player; clues and optional tools decide their journey.
  function escapeRoute(level,code){
    const n=LEVELS[level].n,rng=randGen(makeSeedHash(code+'|'+level+'|HEARTFIELD-ESCAPE-V4'));
    let r=n-1,c=0;const route=[{r:r,c:c}];
    while(r>0||c<n-1){
      if(r===0)c++;
      else if(c===n-1)r--;
      else if(rng()<.5)r--;
      else c++;
      route.push({r:r,c:c});
    }
    return route;
  }
  function createBoard(level,code){
    const info=LEVELS[level],n=info.n,route=escapeRoute(level,code),safePath={};
    route.forEach(function(p){safePath[p.r+','+p.c]=true;});
    const rng=randGen(makeSeedHash(code+'|'+level+'|HEARTFIELD-MINES-V4'));
    const cells=Array.from({length:n},()=>Array.from({length:n},()=>({mine:false,num:0,open:false,flag:false,exploded:false,rescued:false,special:false,scanned:null,revealAt:0})));
    const candidates=[];
    for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(!safePath[r+','+c])candidates.push([r,c]);
    for(let i=candidates.length-1;i>0;i--){const j=Math.floor(rng()*(i+1)),a=candidates[i];candidates[i]=candidates[j];candidates[j]=a;}
    for(let i=0;i<info.mines;i++){const cell=candidates[i];cells[cell[0]][cell[1]].mine=true;}
    for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(!cells[r][c].mine){
      cells[r][c].num=neighbours(r,c,n).filter(p=>cells[p[0]][p[1]].mine).length;
    }
    const specials=[];
    for(let r=0;r<n;r++)for(let c=0;c<n;c++){
      if(!safePath[r+','+c]||r===n-1&&c===0||r===0&&c===n-1)continue;
      if(cells[r][c].num>0)specials.push([r,c]);
    }
    for(let i=specials.length-1;i>0;i--){const j=Math.floor(rng()*(i+1)),a=specials[i];specials[i]=specials[j];specials[j]=a;}
    specials.slice(0,Math.min(2,specials.length)).forEach(p=>cells[p[0]][p[1]].special=true);
    return cells;
  }
  function isNextStep(r,c){return !!(game&&Math.abs(r-game.pos.r)+Math.abs(c-game.pos.c)===1);}
  function remainingSteps(){return game?(game.pos.r+game.n-1-game.pos.c):0;}
  function moveTogether(r,c){
    if(!game)return;
    game.pos={r:r,c:c};game.steps++;game.trail.push({r:r,c:c});
    if(game.trail.length>120)game.trail.shift();
    startAvatarMove(0,r,c,1.15);
    if(settings.mode==='duo')startAvatarMove(1,r,c,.94);
    game.bondAt=performance.now();
  }

  function makeDemo(){
    const cells=createBoard('easy','HERO88');
    [[2,2],[2,3],[3,3],[3,2],[4,3],[2,4],[4,4],[1,2],[4,2],[1,3]].forEach(p=>{if(!cells[p[0]][p[1]].mine)cells[p[0]][p[1]].open=true;});
    cells[1][1].flag=true;
    return {n:6,cells:cells,avatarPos:[{r:3.65,c:.6},{r:1.1,c:4.6}],active:0,flash:[],isDemo:true};
  }
  function startGame(){
    cancelRescueTimer();
    settings.names=[($('nameOne').value||'小满').trim().slice(0,6)||'小满',($('nameTwo').value||'阿野').trim().slice(0,6)||'阿野'];
    settings.code=($('challengeCode').value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)||randomCode();
    $('challengeCode').value=settings.code;
    const info=LEVELS[settings.level],n=info.n,c=Math.floor(n/2), cells=createBoard(settings.level,settings.code),route=escapeRoute(settings.level,settings.code);
    game={n:n,code:settings.code,level:settings.level,cells:cells,mines:info.mines,hearts:info.hearts,safeOpened:0,flags:0,
      hits:0,radars:2,shields:2,rescueCharges:settings.mode==='duo'?2:1,rescuePending:null,saved:0,quizTotal:0,quizMatched:0,storyStage:0,lastCheer:0,roleSteps:[0,0],shieldArmed:false,active:0,streak:0,bestStreak:0,turn:0,score:0,memories:0,questions:[],
      pos:{r:n-1,c:0},goal:{r:0,c:n-1},route:route,trail:[{r:n-1,c:0}],steps:0,
      avatarPos:[{r:n-1,c:0},{r:n-1,c:0}],animations:[null,null],reactions:[null,null],bondAt:0,flash:[],scans:[],isDemo:false,
      startedAt:Date.now(),pauseStart:0,pausedMs:0,finished:false,won:false,elapsed:0,session:Date.now()};
    inputMode='dig'; activeScene='game'; setScreen();
    $('gameChapter').textContent=SCENES[settings.scene].chapter;
    $('gameHeading').textContent=SCENES[settings.scene].heading;
    $('scenePill').textContent='✦ '+SCENES[settings.scene].name;
    $('playSceneWrap').dataset.scene=settings.scene;
    $('playerStrip').classList.toggle('solo-mode',settings.mode==='solo');
    $('encourageBtn').textContent=settings.mode==='solo'?'♥ 给自己打气':'♥ 给 TA 打气';
    revealStart(); updateHud(); resizeAll(); setStatus('从左下角的绿色起点出发，走向右上角金色终点！','只走发光的上下左右相邻格。第一步已帮你点亮；数字表示周围八格雷数。');
    queueSave();window.scrollTo(0,0); sound('start');
  }
  function revealStart(){
    const start=game.pos,first=game.route[1];
    floodReveal(start.r,start.c,[]);
    // One clearly visible, assured first step eliminates the opening blind guess.
    const tile=game.cells[first.r][first.c];
    if(!tile.open){tile.open=true;tile.revealAt=performance.now();game.safeOpened++;}
    tile.tutorial=true;
    game.score+=10;
  }
  function setScreen(){ $('homeScreen').classList.toggle('hidden',activeScene!=='home');$('playScreen').classList.toggle('hidden',activeScene!=='game'); }
  function resetToHome(){if(game&&!game.finished)queueSave();cancelRescueTimer();clearLongPress();modalOpen=false;hideModal();activeScene='home';game=null;setScreen();resizeAll();refreshHomeData();window.scrollTo(0,0);}
  function updateHud(){if(!game)return;
    const safe=game.n*game.n-game.mines;
    $('safeCount').textContent=remainingSteps().toString();
    $('mineCount').textContent=game.flags.toString();
    $('heartCount').textContent=Array.from({length:3},(_,i)=>i<game.hearts?'♥':'♡').join(' ');
    $('timeCount').textContent=fmtTime(game.elapsed);
    $('comboPill').textContent=game.streak>=3?'♥ 连击 '+game.streak:'默契 '+game.streak+' 连';
    $('rescueCount').textContent='拉一把 × '+game.rescueCharges+(game.saved?' · 成功'+game.saved+'次':'');
    const safeTotal=game.n*game.n-game.mines;
    const progress=1-remainingSteps()/(2*(game.n-1));
    $('storyProgressFill').style.width=Math.round(progress*100)+'%';
    const scene=SCENES[settings.scene];
    const stageIndex=Math.max(0,Math.min(2,game.storyStage-1));
    $('storyStageTitle').textContent='🚩 通往终点 · '+Math.round(progress*100)+'%';
    $('storyStageDetail').textContent='距离终点还差 '+remainingSteps()+' 步 · '+(game.storyStage===0?'数字提示附近 8 格的雷数':scene.moments[game.storyStage-1]);
    $('radarCount').textContent='剩余 '+game.radars+' 次';
    $('shieldCount').textContent=game.shieldArmed?'遇到雷才消耗':'剩余 '+game.shields+' 次';
    $('shieldBtn').classList.toggle('selected',game.shieldArmed);
    $('radarBtn').disabled=game.radars===0&&!isRadarMode();
    $('shieldBtn').disabled=game.shields===0&&!game.shieldArmed;
    $('playerOneName').textContent=settings.names[0];$('playerTwoName').textContent=settings.names[1];
    const p0=game.active===0,p1=game.active===1;
    $('playerOneBtn').classList.toggle('active',p0);$('playerTwoBtn').classList.toggle('active',p1);
    $('playerOneSub').textContent=settings.mode==='solo'?'独自探险 · 探路师':p0?'探路师 · 正在行动':'探路师 · 雷达充能';
    $('playerTwoSub').textContent=p1?'守护师 · 正在行动':'守护师 · 护盾充能';
    $('turnText').textContent=(settings.mode==='duo'?'轮到 ':'操控 ')+settings.names[game.active]+'啦！';
    $('digBtn').classList.toggle('selected',inputMode==='dig');$('flagBtn').classList.toggle('selected',inputMode==='flag');$('radarBtn').classList.toggle('selected',inputMode==='radar');
    $('sceneInstruction').textContent= inputMode==='flag'?'插旗标记怀疑有雷的格子':inputMode==='radar'?'雷达：只扫描相邻格':game.shieldArmed?'守护就绪：踩雷自动抵挡':'发光四邻格可走 → 金色终点';
    $('routeStep').textContent='第 '+(game.steps+1)+' 步';
  }
  function fmtTime(sec){const m=Math.floor(sec/60);const s=sec%60;return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
  function updateTime(){if(!game||game.finished)return;game.elapsed=Math.floor((Date.now()-game.startedAt-game.pausedMs-(game.pauseStart?Date.now()-game.pauseStart:0))/1000);$('timeCount').textContent=fmtTime(game.elapsed);}
  function pauseTime(){if(game&&!game.finished&&!game.pauseStart)game.pauseStart=Date.now();}
  function resumeTime(){if(game&&game.pauseStart){game.pausedMs+=Date.now()-game.pauseStart;game.pauseStart=0;}}
  function setStatus(title,detail){ $('statusLine').textContent=title;$('messageTitle').textContent=title;$('messageDetail').textContent=detail; }
  function switchTurn(){if(!game||game.finished)return;game.turn++;if(settings.mode==='duo'){game.active=1-game.active;}updateHud();queueSave();}
  function changeAction(mode){if(!game||game.finished||modalOpen)return;
    if(mode==='radar'&&game.radars===0){showToast('雷达次数已经用完啦');return;}
    game.shieldArmed=false;
    inputMode=mode;updateHud();if(mode==='radar')showToast('点击一块未打开的格子，查看是否有雷');
  }
  function changePlayer(index){if(!game||game.finished||modalOpen)return;showToast(settings.mode==='duo'?'接力模式自动换人，下一步轮到 '+settings.names[game.active]:'单人模式由你独自完成探险');}
  function armShield(){if(!game||game.finished||modalOpen)return;
    if(game.shieldArmed){game.shieldArmed=false;updateHud();showToast('已经关闭守护');return;}
    if(game.shields<=0){showToast('爱的守护已用完');return;}
    game.shieldArmed=true;inputMode='dig';updateHud();showToast('守护已开启：遇雷会挡住一次并自动插旗');
  }
  function isRadarMode(){return inputMode==='radar';}
  function hitCell(r,c,forcedFlag){
    if(!game||game.finished||modalOpen||r<0||c<0||r>=game.n||c>=game.n)return;
    const t=game.cells[r][c];
    if(forcedFlag||inputMode==='flag'){
      if(t.open){showToast('已探明的安全格无需插旗');return;}
      t.flag=!t.flag;game.flags+=t.flag?1:-1;
      if(t.flag&&t.mine&&!t.scoreFlagged){game.score+=16;t.scoreFlagged=true;}
      sound('flag');feedback('light');
      setStatus(t.flag?'已标记一处怀疑有雷的格子':'旗帜已收回','插旗只是推断，不能排除地雷。走路只能选人物旁边发光的格子。');
      switchTurn();return;
    }
    if(!isNextStep(r,c)){
      showToast('只能走人物上下左右相邻的发光格子');
      setStatus('不能跨格跳过去！','请从两个人脚下的格子出发，一步一步走向金色终点。');
      return;
    }
    if(inputMode==='radar'){
      if(t.flag){showToast('先收回旗帜才能对这个格子使用雷达');return;}
      if(t.open){showToast('这格已经是安全区域了');return;}
      game.radars--;t.scanned={mine:t.mine,at:performance.now()};
      game.scans.push({r:r,c:c,mine:t.mine,at:performance.now()});
      inputMode='dig';
      setStatus(t.mine?'雷达警报：这格是雷，快插旗！':'雷达确认：这一步安全，可以前进','雷达不让小人移动。切回探索，踩安全格前进。');
      sound(t.mine?'warning':'radar');feedback('medium');switchTurn();return;
    }
    if(t.flag){showToast('这格已插旗，先收回旗帜才能走');return;}
    if(t.exploded){showToast('前方是已经发现的雷，请绕路前进');return;}
    if(t.mine){
      // The party never walks into a mine: rescue/damage takes place on their last safe step.
      game.streak=0;
      const hasShield=game.shieldArmed;
      if(hasShield){
        game.shields--;game.shieldArmed=false;t.flag=true;t.rescued=true;game.flags++;game.score+=35;
        setStatus('守护成功！挡住前方的一颗雷','危险格已标记，双方仍留在上一块安全格。可以绕路。');
        game.flash.push({kind:'shield',r:r,c:c,at:performance.now()});react(game.active,'我保护你！','protect');react(1-game.active,'好险呀！','joy');sound('shield');feedback('medium');
        switchTurn();return;
      }
      // A failed step becomes visible but does not change the party's position.
      t.open=true;t.exploded=true;t.revealAt=performance.now();game.hits++;
      game.flash.push({kind:'boom',r:r,c:c,at:performance.now()});
      react(game.active,'差点被炸到！','shock');react(1-game.active,'快回来！','worry');
      sound('boom');feedback('heavy');
      if(game.rescueCharges>0){beginRescue(r,c,game.active);updateHud();return;}
      game.hearts--;setStatus(game.hearts?'前面有雷，换条路！':'最后一颗爱心用掉了！',game.hearts?'你们没有移动，可以从安全位置重新选方向。':'下一局试试先使用雷达和护盾。');
      if(game.hearts<=0){endGame(false);return;}
      switchTurn();return;
    }
    // Safe tiles can be walked on again. Unexplored tiles reveal classic mine numbers.
    const newlyDiscovered=!t.open,opened=[];
    if(newlyDiscovered)floodReveal(r,c,opened);
    moveTogether(r,c);
    game.streak++;game.bestStreak=Math.max(game.bestStreak,game.streak);
    game.score+=newlyDiscovered?14+Math.min(10,game.streak)*3:2;
    game.flash.push({kind:'safe',r:r,c:c,at:performance.now()});
    sound(newlyDiscovered&&opened.length>1?'flood':'safe');feedback('light');
    setStatus(remainingSteps()===0?'两个人抵达了终点！':newlyDiscovered?'顺利前进！又探索了一步':'沿着安全道路继续走',
      '现在距离金色终点还差 '+remainingSteps()+' 步；只有上下左右相邻格可走。');
    if(newlyDiscovered)chargeRoleSkill(game.active);updateStoryMoment();
    if(game.streak>0&&game.streak%3===0){react(game.active,'跟紧我！','joy');react(1-game.active,'一起冲！','joy');sound('bond');}
    switchTurn();
    const specialOpened=t.special?[[r,c]]:[];
    if(specialOpened.length){specialOpened.forEach(p=>{
      game.cells[p[0]][p[1]].special=false;game.memories++;
      game.questions.push(QUESTIONS[(makeSeedHash(game.code+'-'+p[0]+'-'+p[1]))%QUESTIONS.length]);
    });setTimeoutMaybe(350,showNextQuestion);}
    else checkWin();
    updateHud();
  }
  function react(i,label,kind){if(!game)return;
    game.reactions[i]={text:label,kind:kind||'joy',at:performance.now()};}
  function cancelRescueTimer(){if(rescueTimer){clearInterval(rescueTimer);rescueTimer=null;}}
  function updateStoryMoment(){if(!game||game.finished)return;
    const ratio=1-remainingSteps()/(2*(game.n-1));
    const stage=ratio>=.78?3:ratio>=.46?2:ratio>=.16?1:0;
    if(stage<=game.storyStage)return;
    game.storyStage=stage;
    game.bondAt=performance.now();
    react(0,stage===3?'快到了！':'看，有惊喜！','joy');
    react(1,stage===3?'一起冲线！':'我们继续！','joy');
    setStatus('故事新篇章 · '+SCENES[settings.scene].stages[stage-1],SCENES[settings.scene].moments[stage-1]);
    sound('bond');
  }
  function encourage(){if(!game||game.finished||modalOpen)return;
    if(Date.now()-game.lastCheer<950){showToast('先让心动落到地上～');return;}
    game.lastCheer=Date.now();game.bondAt=performance.now();
    react(game.active,settings.mode==='solo'?'今天也要勇敢 ♥':'加油！有我呢 ♥','joy');
    if(settings.mode==='duo')react(1-game.active,'收到！并肩走吧','joy');
    sound('bond');feedback('light');
    setStatus('收到了 TA 的鼓励！','这一下不会改变地雷或分数，但会让你们的冒险更甜。');
  }
  function beginRescue(r,c,actor){
    if(!game||game.rescueCharges<=0)return;
    game.rescueCharges--;
    game.rescuePending={r:r,c:c,actor:actor,taps:0,needed:5};
    setStatus('紧急！踩到地雷！','交给搭档：5 秒内连点 5 下，把 TA 拉回来。');
    const session=game.session;
    window.setTimeout(function(){if(game&&game.session===session&&game.rescuePending)showRescuePrompt();},280);
  }
  function showRescuePrompt(){
    if(!game||!game.rescuePending)return;
    const pending=game.rescuePending,other=1-pending.actor;
    clearTimeout(toastTimer);$('toast').classList.add('hidden');
    const extra=document.createElement('div');extra.className='rescue-extra';
    const faces=document.createElement('div');faces.className='rescue-faces';faces.textContent='😱  ───  💗';
    const description=document.createElement('div');description.className='rescue-description';description.textContent=settings.mode==='solo'?'快速连点，把自己从雷区旁边拉回来！':settings.names[other]+'，快把 '+settings.names[pending.actor]+' 拉回安全区！';
    const progress=document.createElement('div');progress.className='rescue-progress';const fill=document.createElement('span');progress.appendChild(fill);
    const counter=document.createElement('strong');counter.className='rescue-counter';counter.textContent='0 / '+pending.needed+' 次';
    const time=document.createElement('div');time.className='rescue-time';time.textContent='剩余 5.0 秒';
    extra.appendChild(faces);extra.appendChild(description);extra.appendChild(counter);extra.appendChild(progress);extra.appendChild(time);
    showModal({icon:'⚡',eyebrow:'SOS · 5 SECOND RESCUE',title:settings.mode==='solo'?'快！紧急闪避！':'快！拉住 TA 的手！',desc:'快速点击爱心 5 次，成功就能保住一颗爱心。',extra:extra,buttons:[]});
    $('modalRoot').dataset.kind='rescue';
    const buttons=$('modalButtons');const save=document.createElement('button'),giveup=document.createElement('button');
    save.type='button';save.className='primary rescue-tap';save.textContent=settings.mode==='solo'?'♥  闪避危险！':'♥  拉住 TA！';
    giveup.type='button';giveup.className='rescue-giveup';giveup.textContent='来不及了';
    save.addEventListener('click',function(){if(!game||game.rescuePending!==pending)return;
      pending.taps++;counter.textContent=pending.taps+' / '+pending.needed+' 次';fill.style.width=(pending.taps/pending.needed*100)+'%';
      sound('tap');feedback('light');
      if(pending.taps>=pending.needed)resolveRescue(true);
    });
    giveup.addEventListener('click',function(){resolveRescue(false);});buttons.appendChild(giveup);buttons.appendChild(save);
    const deadline=Date.now()+5000;
    rescueTimer=setInterval(function(){if(!game||game.rescuePending!==pending){cancelRescueTimer();return;}
      const left=Math.max(0,(deadline-Date.now())/1000);time.textContent='剩余 '+left.toFixed(1)+' 秒';
      if(left<=0)resolveRescue(false);
    },60);
  }
  function resolveRescue(saved){
    if(!game||!game.rescuePending)return;
    cancelRescueTimer();
    const pending=game.rescuePending,t=game.cells[pending.r][pending.c];
    game.rescuePending=null;closeModal();$('modalRoot').dataset.kind='';
    if(saved){
      t.open=false;t.exploded=false;t.flag=true;t.rescued=true;game.flags++;game.saved++;game.score+=65;
      game.flash.push({kind:'shield',r:pending.r,c:pending.c,at:performance.now()});
      game.bondAt=performance.now();
      if(settings.mode==='duo')startAvatarMove(1-pending.actor,pending.r,pending.c,.8);
      react(pending.actor,settings.mode==='solo'?'漂亮的闪避！':'你真的拉住我了！','saved');
      if(settings.mode==='duo')react(1-pending.actor,'有我呢！','protect');
      setStatus('救援成功！爱心保住啦！','搭档成功拉回了你，危险格自动标记。剩余救援 '+game.rescueCharges+' 次。');
      sound('rescue');feedback('medium');
    }else{
      game.hearts--;game.streak=0;
      react(pending.actor,'被炸懵了…','shock');if(settings.mode==='duo')react(1-pending.actor,'下次一定救到！','worry');
      setStatus(game.hearts?'没拉住，但我们还能继续！':'这次冒险结束了！',game.hearts?'扣除一颗爱心。下一步让搭档小心探索。':'试试先用雷达和护盾，再向深处探路。');
      sound('lose');feedback('heavy');
    }
    if(game.hearts<=0){endGame(false);return;}
    switchTurn();updateHud();queueSave();
  }
  function chargeRoleSkill(actor){
    if(!game)return;
    game.roleSteps[actor]++;
    if(game.roleSteps[actor]%4!==0)return;
    if(actor===0&&game.radars<4){game.radars++;game.score+=15;setStatus(settings.names[0]+'的直觉觉醒！雷达 +1','探路师每完成四次安全探索，可以为队伍补充雷达。');sound('radar');}
    if(actor===1&&game.shields<4){game.shields++;game.score+=15;setStatus(settings.names[1]+'的守护觉醒！护盾 +1','守护师每完成四次安全探索，可以为队伍补充护盾。');sound('shield');}
  }
  function floodReveal(r,c,opened){
    const queue=[[r,c]],seen={};const now=performance.now();
    while(queue.length){const p=queue.shift(),key=p[0]+','+p[1];if(seen[key])continue;seen[key]=true;
      const t=game.cells[p[0]][p[1]];if(t.open||t.flag||t.mine)continue;
      t.open=true;t.revealAt=now+opened.length*14;opened.push(p);game.safeOpened++;
      if(t.num===0){neighbours(p[0],p[1],game.n).forEach(nb=>{const n=game.cells[nb[0]][nb[1]];if(!n.mine&&!n.flag&&!n.open)queue.push(nb);});}
    }
  }
  function setTimeoutMaybe(delay,fn){const session=game&&game.session;window.setTimeout(function(){if(game&&game.session===session&&!game.finished)fn();},delay);}
  function showNextQuestion(){if(!game||game.finished||modalOpen)return;
    const q=game.questions.shift();if(!q){checkWin();return;}
    pauseTime();
    if(settings.mode==='solo'){
      showModal({icon:'💌',eyebrow:'A LITTLE SECRET',title:q[0],desc:q[1]+'\n'+q[2],
        buttons:[{label:'继续冒险',primary:true,action:function(){game.score+=20;closeModal();showNextOrWin();}}]});
      return;
    }
    showCoupleQuiz(q);
  }
  function showCoupleQuiz(q){
    let step=0;const votes=[null,null],options=[settings.names[0],settings.names[1],'都一样'];
    const extra=document.createElement('div');extra.className='vote-extra';
    showModal({icon:'💌',eyebrow:'NO PEEK · 默契双选',title:q[0],desc:q[1],extra:extra,buttons:[]});
    $('modalRoot').dataset.kind='quiz';
    function render(){
      const buttons=$('modalButtons');buttons.textContent='';extra.textContent='';
      if(step<2){
        $('modalEyebrow').textContent='第 '+(step+1)+' / 2 人 · 别偷看答案';
        $('modalTitle').textContent=(step===0?settings.names[0]:settings.names[1])+' 的秘密选择';
        $('modalDesc').textContent=q[1];
        const hint=document.createElement('p');hint.textContent=step===0?'选完之后把手机递给 TA，答案会暂时保密。':'上一位的答案藏起来了，轮到你啦！';extra.appendChild(hint);
        const grid=document.createElement('div');grid.className='vote-options';
        options.forEach(function(o,index){const b=document.createElement('button');b.type='button';b.textContent=o;b.className='vote-option';b.addEventListener('click',function(){votes[step]=index;step++;sound('switch');render();});grid.appendChild(b);});extra.appendChild(grid);
      }else{
        const matched=votes[0]===votes[1];game.quizTotal++;if(matched){game.quizMatched++;game.score+=60;game.bondAt=performance.now();
          if(game.shields<4)game.shields++;else if(game.radars<4)game.radars++;
          react(0,'居然一样！','joy');react(1,'真的好懂我！','joy');sound('bond');}
          else{game.score+=15;react(0,'被你猜错啦','shy');react(1,'下次会懂你！','joy');}
        $('modalEyebrow').textContent='默契答案 · '+game.quizMatched+'/'+game.quizTotal;
        $('modalTitle').textContent=matched?'你们竟然选了一样的！':'原来你们想得不一样';
        $('modalDesc').textContent=matched?'默契奖励：分数 +60，赠送一次守护/雷达！':'彼此不同也很可爱，下一题继续猜猜对方。';
        const box=document.createElement('div');box.className='vote-reveal';
        [0,1].forEach(function(i){const d=document.createElement('div');const who=document.createElement('small');who.textContent=settings.names[i];const ans=document.createElement('strong');ans.textContent=options[votes[i]];d.appendChild(who);d.appendChild(ans);box.appendChild(d);});extra.appendChild(box);
        const b=document.createElement('button');b.textContent='继续并肩探险 ♥';b.className='primary';b.addEventListener('click',function(){closeModal();updateHud();showNextOrWin();});buttons.appendChild(b);
        updateHud();queueSave();
      }
    }
    render();
  }
  function showNextOrWin(){if(game&&game.questions.length)setTimeoutMaybe(150,showNextQuestion);else checkWin();}
  function checkWin(){if(!game||game.finished||modalOpen)return;
    if(game.questions.length){showNextQuestion();return;}
    if(game.pos.r===game.goal.r&&game.pos.c===game.goal.c){endGame(true);}
  }
  function endGame(won){if(!game||game.finished)return;updateTime();game.finished=true;game.won=won;game.pauseStart=0;
    if(won){game.score+=game.hearts*110+Math.max(0,180-game.elapsed)+game.memories*50;storeHighScore(game.score);sound('win');}else sound('lose');
    storeGameHistory();queueEraseSave();
    updateHud();setTimeout(function(){if(game&&game.finished&&game.won===won)showResult();},400);
  }
  function matchScore(){if(!game)return 0;
    const progress=game.safeOpened/(game.n*game.n-game.mines);
    const percent=Math.round(46+25*progress+Math.min(12,game.bestStreak*2.2)+Math.min(9,game.memories*3)+game.quizMatched*6+game.saved*4-(game.quizTotal-game.quizMatched)*2-game.hits*8);
    return clamp(percent,0,100);
  }
  function showResult(){if(!game)return;const won=game.won;const percent=matchScore();
    const title=settings.mode==='solo'?(won?'一个人也能闪闪发光！':'下一次会走得更远！'):won?(percent>=90?'传说中的神仙搭档！':'今天也有被你们甜到'):'踩雷也算一种默契吧！';
    const extra=document.createElement('div');extra.innerHTML='<div class="result-stats"><div><strong>'+percent+'%</strong><small>游戏默契值</small></div><div><strong>'+game.saved+'</strong><small>成功救援</small></div><div><strong>'+game.quizMatched+'/'+game.quizTotal+'</strong><small>默契猜对</small></div></div><p class="result-detail">'+SCENES[settings.scene].name+' · '+game.steps+' 步逃脱 · '+game.safeOpened+' 格安全探明 · '+fmtTime(game.elapsed)+'</p><div class="code-badge">'+game.code+'</div>';
    showModal({icon:won?'🏆':'💗',eyebrow:won?'MISSION COMPLETE':'THE STORY CONTINUES',title:title,
      desc:won?'两个人都到达金色终点！你们真的一起逃出来了。':'还没走到终点，下次换一种走法吧！',extra:extra,
      buttons:[{label:'再玩一次',action:function(){closeModal();startGame();}},{label:'生成情侣战报 ↗',primary:true,action:showPoster}]});
  }

  // -------------------- 2.5D renderer --------------------
  function resizeCanvas(el) {
    const rect=el.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height);
    const dpr=Math.min(2,window.devicePixelRatio||1);
    const dw=Math.round(w*dpr),dh=Math.round(h*dpr);
    if(el.width!==dw||el.height!==dh){el.width=dw;el.height=dh;}
    const c=el.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);
    return {w:w,h:h};
  }
  function resizeAll(){
    if(activeScene==='game'){gameSize=resizeCanvas(canvas);}
    else{heroSize=resizeCanvas(heroCanvas);}
  }
  function geometry(w,h,n,hero){
    const tw=Math.min(hero?55:54,(w-31)/n),th=tw*.66;
    const oy=hero?Math.max(55,h*.192):(h<285?58:Math.max(71,h*.215));
    return {w:w,h:h,tw:tw,th:th,oy:oy,n:n,ox:w/2,hero:hero};
  }
  function iso(g,r,c){return {x:g.ox+(c-r)*g.tw*.5,y:g.oy+(r+c)*g.th*.5};}
  function rounded(ctx,x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}
  function poly(ctx,points){ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();}
  function diamond(ctx,x,y,hw,hh){poly(ctx,[[x,y-hh],[x+hw,y],[x,y+hh],[x-hw,y]]);}
  function ellipse(ctx,x,y,rx,ry,fill){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();}
  function drawAmbient(ctx,w,h,now,hero,sceneKey){
    const key=sceneKey||'sunset',theme=SCENES[key];
    ctx.save();
    const bg=ctx.createLinearGradient(0,0,w,h);
    bg.addColorStop(0,theme.sky[0]);bg.addColorStop(.53,theme.sky[1]);bg.addColorStop(1,theme.sky[2]);
    ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    ctx.save();ctx.translate(gyroShift.x,gyroShift.y);
    const soft=ctx.createRadialGradient(w*.72,h*.15,4,w*.58,h*.24,w*.68);
    soft.addColorStop(0,key==='starlight'?'rgba(175,172,221,.15)':'rgba(255,255,255,.7)');soft.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=soft;ctx.fillRect(0,0,w,h);
    if(key==='sunset'){
      // Waterline, sun and sailboat: a tiny hand-painted coastal diorama.
      ellipse(ctx,w*.79,h*.22,41,41,'rgba(255,207,144,.27)');
      ellipse(ctx,w*.79,h*.22,30,30,'#ffe9ba');
      ctx.lineWidth=2;ctx.strokeStyle='rgba(255,255,255,.56)';
      for(let j=0;j<7;j++){
        const y=h*(.70+j*.047);
        ctx.beginPath();for(let x=0;x<=w;x+=8){const yy=y+Math.sin(x*.033+j+now/1400)*1.6;if(x===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);}ctx.stroke();
      }
      ctx.save();ctx.translate(w*.12,h*.61);ctx.scale(.86,.86);
      ctx.fillStyle='#bc8d83';poly(ctx,[[-22,5],[24,5],[13,13],[-13,13]]);ctx.fill();
      ctx.strokeStyle='#a87c74';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,5);ctx.lineTo(0,-26);ctx.stroke();
      ctx.fillStyle='#fffaf1';poly(ctx,[[0,-24],[0,3],[17,3]]);ctx.fill();ctx.restore();
      for(let j=0;j<7;j++){
        const x=w*((j*.191+.11)%1),y=h*(.85+.04*(j%3));
        ctx.save();ctx.translate(x,y);ctx.rotate(j*.8);ellipse(ctx,0,0,5,3,'rgba(232,171,154,.6)');ctx.restore();
      }
    }else if(key==='sakura'){
      // Little blossom tree canopies remain outside the central game grid.
      [[w*.09,h*.17,1],[w*.93,h*.28,.8]].forEach((p,j)=>{
        const x=p[0],y=p[1],sc=p[2];
        ctx.lineCap='round';ctx.strokeStyle='rgba(151,106,113,.45)';ctx.lineWidth=8*sc;
        ctx.beginPath();ctx.moveTo(x,y+30*sc);ctx.lineTo(x+3*sc,y-24*sc);ctx.lineTo(x-22*sc,y-44*sc);ctx.moveTo(x+3*sc,y-18*sc);ctx.lineTo(x+27*sc,y-43*sc);ctx.stroke();
        [[-26,-38,26],[-5,-55,30],[23,-35,32],[4,-32,25]].forEach((v,i)=>{
          ellipse(ctx,x+v[0]*sc,y+v[1]*sc,v[2]*sc,v[2]*.77*sc,i%2?'rgba(246,169,193,.69)':'rgba(255,215,224,.77)');
        });
      });
      for(let i=0;i<18;i++){
        const x=((i*71+24)%100)/100*w+Math.sin(now/1650+i)*8;
        const y=(h*((i*31+10)%100)/100+now*(.012+i%3*.005))%(h+18)-9;
        ctx.save();ctx.translate(x,y);ctx.rotate(i+now/2200);ellipse(ctx,0,0,3.7,1.8,'rgba(232,136,168,.55)');ctx.restore();
      }
      const bx=w*.86,by=h*.84;
      ctx.strokeStyle='#9f7e7b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(bx-19,by+7);ctx.lineTo(bx-19,by-4);ctx.moveTo(bx+19,by+7);ctx.lineTo(bx+19,by-4);ctx.stroke();
      ctx.fillStyle='#c9a99c';rounded(ctx,bx-26,by-8,52,7,3);ctx.fill();
    }else{
      // Starfield, crescent moon, cozy tent and fireflies.
      for(let i=0;i<54;i++){
        const x=((i*71+17)%101)/101*w,y=((i*43+19)%101)/101*h;
        const twinkle=(Math.sin(now/750+i*1.4)+1)*.5;
        ellipse(ctx,x,y,(i%7===0?2.0:1.0)*(1+twinkle*.35),(i%7===0?2.0:1.0)*(1+twinkle*.35),`rgba(255,247,223,${.28+twinkle*.60})`);
      }
      ellipse(ctx,w*.83,h*.17,29,29,'rgba(248,234,200,.16)');
      ellipse(ctx,w*.83,h*.17,20,20,'#fce7bb');
      ellipse(ctx,w*.85,h*.15,19,18,'#263b5d');
      ctx.save();ctx.translate(w*.82,h*.79);
      poly(ctx,[[-40,16],[0,-40],[37,16]]);ctx.fillStyle='#b7b0d0';ctx.fill();
      poly(ctx,[[0,-40],[4,16],[37,16]]);ctx.fillStyle='#867baf';ctx.fill();
      poly(ctx,[[-8,16],[1,-14],[13,16]]);ctx.fillStyle='#4f526f';ctx.fill();
      ctx.strokeStyle='#e4d8c8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-44,18);ctx.lineTo(42,18);ctx.stroke();ctx.restore();
      ellipse(ctx,w*.16,h*.86,25,7,'rgba(16,25,46,.3)');
      ctx.strokeStyle='#8c7189';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(w*.13,h*.9);ctx.lineTo(w*.19,h*.82);ctx.moveTo(w*.19,h*.9);ctx.lineTo(w*.13,h*.82);ctx.stroke();
      for(let i=0;i<5;i++){
        const fy=h*.85+Math.sin(now/260+i)*4-i*5;
        ellipse(ctx,w*.16+Math.sin(now/400+i)*3,fy,2.6-i*.32,4.3-i*.55,i%2?'#f8b674':'#ffdc8a');
      }
      for(let i=0;i<8;i++){
        const x=w*((i*13+10)%100)/100, y=h*((i*21+12)%100)/100;
        ellipse(ctx,x,y,2.3,2.3,`rgba(218,250,193,${.20+(Math.sin(now/640+i)+1)*.29})`);
      }
    }
    if(key!=='starlight'){
      // Pearlescent dust and subtle green plants, with an open, airy playfield.
      for(let i=0;i<17;i++){
        const x=((i*87+41)%100)/100*w,y=((i*59+19)%100)/100*h;
        ellipse(ctx,x+Math.sin(now/2000+i)*2,y,1.25+(i%4)*.33,1.2+(i%4)*.33,`rgba(255,255,255,${.23+(Math.sin(now/680+i)+1)*.16})`);
      }
      [[.10,.68],[.91,.75],[.12,.92]].forEach(function(p,i){
        const x=w*p[0],y=h*p[1];ellipse(ctx,x,y,13,4,'rgba(79,117,92,.13)');
        ellipse(ctx,x-4,y-3,5,5,i%2?'#d2dbaa':'#afd2b1');ellipse(ctx,x+6,y-5,4,4,'#9bbd96');
      });
    }
    ctx.restore();ctx.restore();
  }
  function drawIsland(ctx,g,sceneKey){
    const theme=SCENES[sceneKey||'sunset'];
    const tw=g.tw,th=g.th,n=g.n,x=g.ox,y=g.oy;
    const top=[x,y-th*.63-6],right=[x+(n*tw)/2+6,y+(n-1)*th/2],bottom=[x,y+(n-1)*th+th*.63+6],left=[x-(n*tw)/2-6,y+(n-1)*th/2];
    ctx.save();
    ctx.shadowColor=sceneKey==='starlight'?'rgba(5,18,48,.48)':'rgba(68,89,94,.18)';ctx.shadowBlur=21;ctx.shadowOffsetY=18;
    poly(ctx,[top,right,bottom,left]);ctx.fillStyle=theme.island[0];ctx.fill();
    ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    const depth=19;
    poly(ctx,[left,bottom,[bottom[0],bottom[1]+depth],[left[0],left[1]+depth*.64]]);ctx.fillStyle=theme.island[1];ctx.fill();
    poly(ctx,[bottom,right,[right[0],right[1]+depth*.64],[bottom[0],bottom[1]+depth]]);ctx.fillStyle=theme.island[2];ctx.fill();
    poly(ctx,[top,right,bottom,left]);ctx.fillStyle=theme.island[0];ctx.fill();
    ctx.strokeStyle=sceneKey==='starlight'?'rgba(243,240,255,.60)':'rgba(255,250,239,.91)';ctx.lineWidth=3;ctx.stroke();ctx.restore();
  }
  function drawTile(ctx,g,r,c,cell,now,preview,sceneKey){
    const theme=SCENES[sceneKey||'sunset'];
    const p=iso(g,r,c),x=p.x,y=p.y,hw=g.tw*.491,hh=g.th*.486;
    const closed=!cell.open,alt=(r+c)%2===0;
    let topColor=closed?theme.closed[alt?0:1]:theme.opened[alt?0:1];
    let side1=closed?theme.side[0]:theme.side[2],side2=closed?theme.side[1]:theme.side[3];
    if(cell.exploded){topColor='#df8990';side1='#ad6371';side2='#905766';}
    if(cell.flag){topColor=sceneKey==='starlight'?'#f3e7ee':'#fff0e7';}
    ctx.save();
    const depth=closed?9:5;
    poly(ctx,[[x-hw,y],[x,y+hh],[x,y+hh+depth],[x-hw,y+depth]]);ctx.fillStyle=side1;ctx.fill();
    poly(ctx,[[x,y+hh],[x+hw,y],[x+hw,y+depth],[x,y+hh+depth]]);ctx.fillStyle=side2;ctx.fill();
    diamond(ctx,x,y,hw,hh);ctx.fillStyle=topColor;ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.83)';ctx.lineWidth=1.15;ctx.stroke();
    if(closed){
      ctx.strokeStyle='rgba(255,255,255,.43)';ctx.lineWidth=1.3;
      ctx.beginPath();ctx.moveTo(x-hw*.77,y-hh*.09);ctx.lineTo(x,y-hh*.77);ctx.lineTo(x+hw*.60,y-hh*.17);ctx.stroke();
      if((r*11+c*17)%6===0&&!cell.flag){ctx.fillStyle=sceneKey==='starlight'?'#bcabd3':'#e5b9b3';ctx.font='bold '+Math.max(11,g.tw*.21)+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('✦',x,y-1);}
      if(cell.flag)drawFlag(ctx,x,y,g.tw,cell.rescued);
    }else if(cell.exploded){
      ellipse(ctx,x,y,hw*.33,hh*.45,'#a65a69');
      ctx.font='bold '+Math.max(16,g.tw*.31)+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff2ee';ctx.fillText('✕',x,y-1);
    }else if(cell.num){
      ctx.fillStyle=NUM_COLORS[cell.num]||'#745979';
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 '+Math.max(14,g.tw*.34)+'px -apple-system,BlinkMacSystemFont,Arial,sans-serif';ctx.fillText(String(cell.num),x,y+1);
    }else{
      ellipse(ctx,x,y,Math.max(1.6,g.tw*.047),Math.max(1.6,g.tw*.047),sceneKey==='starlight'?'#85baaf':'#a7d0b9');
    }
    if(cell.open&&!cell.exploded&&cell.special){
      ctx.fillStyle='#e37c91';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText('♥',x+hw*.43,y-hh*.30);
    }
    if(cell.scanned){
      const life=cell.open?Math.max(0,1-(now-cell.scanned.at)/6500):.82;
      if(life>0){diamond(ctx,x,y,hw*.82,hh*.79);ctx.strokeStyle=cell.scanned.mine?`rgba(218,73,90,${life*.95})`:`rgba(59,169,113,${life*.95})`;ctx.lineWidth=3;ctx.stroke();
        ctx.fillStyle=cell.scanned.mine?`rgba(198,66,79,${life})`:`rgba(47,142,104,${life})`;ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText(cell.scanned.mine?'!':'✓',x,y+1);
      }
    }
    if(cell.open&&!preview&&cell.revealAt&&now-cell.revealAt<530){
      const a=Math.max(0,1-(now-cell.revealAt)/530);diamond(ctx,x,y,hw*(1.15+a*.1),hh*(1.15+a*.1));ctx.strokeStyle=`rgba(255,255,255,${a*.7})`;ctx.lineWidth=2;ctx.stroke();
    }
    ctx.restore();
  }
  function drawFlag(ctx,x,y,tw,rescued){
    ctx.save();ctx.translate(x,y-3);const sc=tw/53;ctx.scale(sc,sc);
    ctx.strokeStyle=rescued?'#72a68d':'#967487';ctx.lineWidth=2.4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-1,9);ctx.lineTo(-1,-10);ctx.stroke();
    poly(ctx,[[-1,-10],[11,-7],[2,-2],[-1,-3]]);ctx.fillStyle=rescued?'#80b9a0':'#de6c86';ctx.fill();
    ellipse(ctx,-1,9,4,1.5,'#9d9b8c');ctx.restore();
  }
  function avatarPose(actor,i,now){
    const base=actor.avatarPos[i],anim=actor.animations&&actor.animations[i];
    if(!anim)return {r:base.r,c:base.c,hop:0,moving:false,face:i===0?1:-1,step:0};
    const t=clamp((now-anim.at)/anim.ms,0,1);
    if(t>=1){actor.avatarPos[i]={r:anim.points[anim.points.length-1].r,c:anim.points[anim.points.length-1].c};actor.animations[i]=null;
      return {r:actor.avatarPos[i].r,c:actor.avatarPos[i].c,hop:0,moving:false,face:anim.face||1,step:0};}
    const parts=anim.points.length-1,phase=t*parts,index=Math.min(parts-1,Math.floor(phase)),part=phase-index;
    const smooth=part*part*(3-2*part),a=anim.points[index],b=anim.points[index+1];
    const face=((b.c-a.c)-(b.r-a.r))>=0?1:-1;
    return {r:a.r+(b.r-a.r)*smooth,c:a.c+(b.c-a.c)*smooth,
      hop:reducedMotion?0:Math.sin(part*Math.PI)*(parts>1?7:10),moving:true,face:face,
      step:Math.sin(part*Math.PI*4)*3.2};
  }
  function drawAvatar(ctx,g,actor,i,now,photo,active,hero,pose){
    pose=pose||avatarPose(actor,i,now);
    const p=iso(g,pose.r,pose.c),size=clamp(g.tw/47,.78,1.15);
    const reaction=actor.reactions&&actor.reactions[i];
    const emotion=reaction&&now-reaction.at<2200?reaction.kind:'normal';
    const bob=reducedMotion?0:(pose.moving?pose.hop:Math.sin(now/350+i*2)*1.45);
    const recentBlast=actor.flash&&actor.flash.length&&actor.flash[actor.flash.length-1].kind==='boom'&&now-actor.flash[actor.flash.length-1].at<340;
    const shake=!reducedMotion&&recentBlast?Math.sin(now/24+i)*2:0;
    const other=actor.animations?avatarPose(actor,1-i,now):actor.avatarPos[1-i];
    const overlap=Math.abs(other.r-pose.r)<.28&&Math.abs(other.c-pose.c)<.28;
    const x=p.x+shake+(overlap?(i===0?-g.tw*.15:g.tw*.15):0),y=p.y-bob;
    ctx.save();ctx.translate(x,y);ctx.scale(size,size);
    // Shadow remains rooted to the tile, while the body performs distinct hops.
    ellipse(ctx,0,3+bob,15+Math.min(5,bob*.25),4,'rgba(48,58,75,.23)');
    if(active&&!hero){ellipse(ctx,0,3+bob,20,5,'rgba(255,250,246,.28)');}
    ctx.rotate(pose.moving&&!reducedMotion?pose.face*.065:0);
    const step=pose.step||0;
    ctx.strokeStyle='#50556d';ctx.lineWidth=4.2;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-4,-12);ctx.lineTo(-5+step,0);ctx.moveTo(4,-12);ctx.lineTo(5-step,0);ctx.stroke();
    ellipse(ctx,-5+step,0,4.5,2.6,'#554a60');ellipse(ctx,5-step,0,4.5,2.6,'#554a60');
    const coat=i===0?'#ee8c98':'#6fbaa6',coatDark=i===0?'#c96d85':'#4a8e81';
    // More legible two-frame opposite arm swing.
    ctx.strokeStyle=coatDark;ctx.lineWidth=4.4;
    ctx.beginPath();ctx.moveTo(-9,-27);ctx.lineTo(-14-step*.72,-18+step*.30);
    ctx.moveTo(9,-27);ctx.lineTo(14+step*.72,-18-step*.30);ctx.stroke();
    ctx.fillStyle=coatDark;rounded(ctx,-11,-31,22,23,7);ctx.fill();
    ctx.fillStyle=coat;rounded(ctx,-10,-33,20,20,7);ctx.fill();
    // Jacket ribbon, pocket, and clasp, rather than a shapeless cylinder.
    ctx.fillStyle='rgba(255,255,255,.78)';poly(ctx,[[-4,-32],[0,-27],[4,-32]]);ctx.fill();
    ctx.fillStyle='rgba(58,61,75,.15)';rounded(ctx,4,-24,4,5,1);ctx.fill();
    if(photo&&photo.complete&&photo.naturalWidth){
      ctx.save();ctx.beginPath();ctx.arc(0,-44,13,0,Math.PI*2);ctx.clip();
      const w=photo.naturalWidth,h=photo.naturalHeight,side=Math.min(w,h),sx=(w-side)/2,sy=(h-side)/2;
      try{ctx.drawImage(photo,sx,sy,side,side,-13,-57,26,26);}catch(e){}
      ctx.restore();ctx.strokeStyle='#fffdf9';ctx.lineWidth=2.2;ctx.beginPath();ctx.arc(0,-44,13.5,0,Math.PI*2);ctx.stroke();
    }else{
      ellipse(ctx,0,-45,13,14,i===0?'#f5b89e':'#d6a38a');
      ctx.fillStyle=i===0?'#684c62':'#414354';
      ctx.beginPath();ctx.arc(0,-46,13,Math.PI*1.01,Math.PI*1.99);
      ctx.quadraticCurveTo(14,-57,10,-50);ctx.quadraticCurveTo(0,-55,-11,-50);ctx.fill();
      if(i===0){ellipse(ctx,-11,-43,4,9,'#684c62');ellipse(ctx,10,-42,3,8,'#684c62');}
      else{poly(ctx,[[-12,-50],[-5,-61],[-1,-54],[6,-59],[12,-50]]);ctx.fillStyle='#414354';ctx.fill();}
      const wide=emotion==='shock'||emotion==='worry';
      ellipse(ctx,-4,-44,wide?1.7:1.12,wide?2.0:1.3,'#493b42');
      ellipse(ctx,4,-44,wide?1.7:1.12,wide?2.0:1.3,'#493b42');
      ctx.strokeStyle='#ae6c6f';ctx.lineWidth=1.1;ctx.beginPath();
      if(wide)ctx.ellipse(0,-38,1.5,2.4,0,0,Math.PI*2);
      else ctx.arc(0,-42,2.6,0,Math.PI);ctx.stroke();
      ellipse(ctx,-7,-40,2,1.3,'rgba(229,108,119,.29)');ellipse(ctx,7,-40,2,1.3,'rgba(229,108,119,.29)');
    }
    if(active&&!hero){
      ctx.fillStyle='#fffdf8';ctx.strokeStyle=i===0?'#eba2b0':'#93cdbd';ctx.lineWidth=1;
      rounded(ctx,-10,-72,20,12,6);ctx.fill();ctx.stroke();
      ctx.fillStyle=i===0?'#d87792':'#60a890';ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.fillText('♥',0,-63.7);
    }
    if(reaction&&!hero&&now-reaction.at<2200){
      const age=(now-reaction.at)/2200,alpha=Math.min(1,(1-age)*3);
      ctx.globalAlpha=alpha;ctx.font='bold 11px -apple-system,"PingFang SC",sans-serif';
      const text=reaction.text.slice(0,11),width=Math.min(123,Math.max(67,ctx.measureText(text).width+19));
      const offset=(1-age)*-11;
      ctx.fillStyle=emotion==='shock'?'#fff1df':emotion==='saved'?'#e7fff2':'#fffdfa';
      ctx.strokeStyle='rgba(141,114,133,.2)';ctx.lineWidth=1;
      rounded(ctx,-width/2,-109+offset,width,26,10);ctx.fill();ctx.stroke();
      poly(ctx,[[-5,-83+offset],[5,-83+offset],[0,-77+offset]]);ctx.fill();
      ctx.fillStyle='#735b70';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,0,-96+offset);
      ctx.globalAlpha=1;
    }
    ctx.restore();
  }
  function drawBondEffect(ctx,g,actor,now,poses){
    if(!actor.bondAt||now-actor.bondAt>1350)return;
    const t=(now-actor.bondAt)/1350,a=iso(g,poses[0].r,poses[0].c),b=iso(g,poses[1].r,poses[1].c);
    const midX=(a.x+b.x)/2,midY=(a.y+b.y)/2-35;
    ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle='rgba(235,143,161,.64)';ctx.lineWidth=2;ctx.setLineDash([3,5]);
    ctx.beginPath();ctx.moveTo(a.x,a.y-40);ctx.quadraticCurveTo(midX,midY-24,b.x,b.y-40);ctx.stroke();ctx.setLineDash([]);
    for(let i=0;i<6;i++){
      ctx.fillStyle=i%2?'#fff0da':'#f797ae';ctx.textAlign='center';ctx.font='bold '+(10+i%3*3)+'px Arial';
      ctx.fillText('♥',midX+Math.sin(i*2.7+t*3)*(6+t*27),midY+Math.cos(i*1.8)*(3+t*16)-t*27);
    }
    ctx.restore();
  }
  function drawVisualEffects(ctx,g,actor,now){
    if(!actor.flash)return;
    actor.flash=actor.flash.filter(e=>now-e.at<720);
    actor.flash.forEach(e=>{
      const age=now-e.at,p=iso(g,e.r,e.c),t=age/720;
      if(e.kind==='safe'||e.kind==='shield'){
        const color=e.kind==='shield'?'#64b9b2':'#fffdf5';
        ctx.strokeStyle=color;ctx.globalAlpha=1-t;ctx.lineWidth=3*(1-t)+.3;ctx.beginPath();ctx.ellipse(p.x,p.y,g.tw*(.12+t*.60),g.th*(.12+t*.56),0,0,Math.PI*2);ctx.stroke();
        for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.fillStyle=e.kind==='shield'?'#76cec0':'#fffdfa';ellipse(ctx,p.x+Math.cos(a)*(5+t*19),p.y+Math.sin(a)*(5+t*12),2.2*(1-t),2.2*(1-t),ctx.fillStyle);}
        ctx.globalAlpha=1;
      }else{
        ctx.strokeStyle='#df7782';ctx.lineWidth=3;ctx.globalAlpha=1-t;ctx.beginPath();ctx.arc(p.x,p.y,g.tw*(t*.64+.18),0,Math.PI*2);ctx.stroke();
        for(let i=0;i<8;i++){const a=i*Math.PI/4+t*.3;ellipse(ctx,p.x+Math.cos(a)*t*35,p.y+Math.sin(a)*t*22,4*(1-t),4*(1-t),'#e29a78');}
        ctx.globalAlpha=1;
      }
    });
  }
  function drawEscapeMarkers(ctx,g,actor,now){
    // No canvas hit rectangles change: purely decorative markers and valid-step rings.
    if(!actor.pos)return;
    const pulse=.70+.25*Math.sin(now/300),goal=iso(g,actor.goal.r,actor.goal.c),start=iso(g,actor.n-1,0),here=iso(g,actor.pos.r,actor.pos.c);
    ctx.save();
    [[start,'起点','#4aab88'],[goal,'终点','#d79c49']].forEach(function(info){
      const p=info[0],color=info[2],dy=Math.sin(now/380)*2;
      ellipse(ctx,p.x,p.y+3,g.tw*.37,g.th*.38,color==='#4aab88'?'rgba(72,177,135,.26)':'rgba(243,185,78,.38)');
      // Labels have fixed clamps so they remain visible even near the edge of the canvas.
      const labelX=clamp(p.x,27,g.w-27),labelY=p.y-30+dy;
      ctx.fillStyle=color;rounded(ctx,labelX-24,labelY-12,48,22,11);ctx.fill();
      ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 12px -apple-system,Arial,sans-serif';ctx.fillText(info[1],labelX,labelY-1);
    });
    neighbours(actor.pos.r,actor.pos.c,actor.n).filter(function(p){return Math.abs(p[0]-actor.pos.r)+Math.abs(p[1]-actor.pos.c)===1;}).forEach(function(coord){
      const r=coord[0],c=coord[1],cell=actor.cells[r][c],p=iso(g,r,c);
      if(cell.flag||cell.exploded)return;
      const hw=g.tw*.47,hh=g.th*.47;
      diamond(ctx,p.x,p.y,hw,hh);ctx.strokeStyle=cell.open?'rgba(48,154,131,.95)':'rgba(255,255,255,.94)';
      ctx.lineWidth=2.4+1.15*pulse;ctx.stroke();
      if(cell.tutorial&&!actor.steps){
        ctx.fillStyle='#3c9c76';ctx.font='900 '+Math.max(11,g.tw*.23)+'px sans-serif';ctx.textAlign='center';ctx.fillText('✓',p.x,p.y+2);
      }
    });
    diamond(ctx,here.x,here.y,g.tw*.48,g.th*.48);ctx.strokeStyle='rgba(64,143,127,.80)';ctx.lineWidth=2.3;ctx.stroke();
    // A tiny directional cue above the shared party (both characters stay together).
    const mx=(here.x+goal.x)*.5,my=(here.y+goal.y)*.5;
    if(actor.steps===0){ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.fillStyle='#568a75';ctx.fillText('从这里出发 →',clamp(here.x+35,52,g.w-52),here.y+35);}
    ctx.restore();
  }
  function drawScene(ctx,w,h,actor,now,hero,poster){
    if(!w||!h)return;
    ctx.clearRect(0,0,w,h);
    const sceneKey=settings.scene||'sunset';
    drawAmbient(ctx,w,h,now,hero,sceneKey);
    const g=geometry(w,h,actor.n,hero);
    if(poster){g.tw=Math.min(73,(w-44)/actor.n);g.th=g.tw*.57;g.oy=53;}
    ctx.save();
    if(!reducedMotion&&!hero){
      const blast=actor.flash&&actor.flash.find(e=>e.kind==='boom'&&now-e.at<340);
      if(blast){const intensity=(1-(now-blast.at)/340)*2.8;
        ctx.translate(Math.sin(now/22)*intensity,Math.cos(now/18)*intensity*.55);}
    }
    drawIsland(ctx,g,sceneKey);
    for(let k=0;k<actor.n*2-1;k++){
      for(let r=0;r<actor.n;r++){
        const c=k-r;if(c<0||c>=actor.n)continue;
        drawTile(ctx,g,r,c,actor.cells[r][c],now,hero,sceneKey);
      }
    }
    if(!hero&&!actor.isDemo)drawEscapeMarkers(ctx,g,actor,now);
    drawVisualEffects(ctx,g,actor,now);
    const poses=[avatarPose(actor,0,now),avatarPose(actor,1,now)];
    const people=(!hero&&settings.mode==='solo'?[0]:[0,1]).sort((a,b)=>poses[a].r+poses[a].c-poses[b].r-poses[b].c);
    people.forEach(i=>drawAvatar(ctx,g,actor,i,now,hero?null:settings.photos[i],i===actor.active,hero,poses[i]));
    if(settings.mode==='duo'||hero)drawBondEffect(ctx,g,actor,now,poses);
    if(hero){ctx.save();const q=iso(g,3,3);ctx.fillStyle=sceneKey==='starlight'?'#f5dca1':'#e88391';ctx.font='bold 17px sans-serif';ctx.textAlign='center';ctx.fillText('♥',q.x,q.y-14+Math.sin(now/360)*2);ctx.restore();}
    ctx.restore();
  }
  function screenToCell(x,y){
    if(!game)return null;const g=geometry(gameSize.w,gameSize.h,game.n,false),dx=x-g.ox,dy=y-g.oy;
    const c=Math.round(dy/g.th+dx/g.tw),r=Math.round(dy/g.th-dx/g.tw);
    if(c<0||r<0||c>=game.n||r>=game.n)return null;
    const p=iso(g,r,c);
    if(Math.abs(x-p.x)/(g.tw*.5)+Math.abs(y-p.y)/(g.th*.5)>1.23)return null;
    return {r:r,c:c};
  }
  function startAvatarMove(i,r,c,speed){
    if(!game)return;
    const now=performance.now(),current=avatarPose(game,i,now);
    const from={r:current.r,c:current.c};
    const waypoints=[from],n=game.n,fr=Math.round(from.r),fc=Math.round(from.c);
    // Walk across already-clear tiles where possible. Unreachable targets use a
    // purposeful cinematic leap, not a line of imaginary footsteps through mines.
    if(fr>=0&&fc>=0&&fr<n&&fc<n&&game.cells[fr][fc].open&&!game.cells[fr][fc].mine){
      const seen=Array.from({length:n},()=>Array(n).fill(false));
      const queue=[{r:fr,c:fc,path:[]}];seen[fr][fc]=true;
      let answer=null;
      while(queue.length){const node=queue.shift();if(node.r===r&&node.c===c){answer=node.path;break;}
        neighbours(node.r,node.c,n).forEach(function(next){
          const nr=next[0],nc=next[1],target=(nr===r&&nc===c);
          if(seen[nr][nc]||(!target&&(!game.cells[nr][nc].open||game.cells[nr][nc].mine)))return;
          seen[nr][nc]=true;queue.push({r:nr,c:nc,path:node.path.concat([{r:nr,c:nc}])});
        });
      }
      if(answer&&answer.length<=12)answer.forEach(p=>waypoints.push(p));
    }
    if(waypoints.length===1||waypoints[waypoints.length-1].r!==r||waypoints[waypoints.length-1].c!==c)waypoints.push({r:r,c:c});
    const distance=Math.abs(r-from.r)+Math.abs(c-from.c);
    game.animations[i]={points:waypoints,at:now,
      ms:(reducedMotion?80:clamp(380+(waypoints.length-1)*150+distance*42,430,1500))/(speed||1)};
  }
  function frame(now){
    requestAnimationFrame(frame);
    if(now-lastFrame<29)return;
    lastFrame=now;
    if(!motionOn){gyroShift.x*=.91;gyroShift.y*=.91;}
    if(activeScene==='game'&&game)drawScene(gameCtx,gameSize.w,gameSize.h,game,now,false);
    else drawScene(heroCtx,heroSize.w,heroSize.h,demoGame,now,true);
  }

  // -------------------- Native capabilities & audio --------------------
  function audio(){if(!soundOn)return null;
    try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return null;if(!audioCtx)audioCtx=new A();if(audioCtx.state==='suspended')audioCtx.resume().catch(function(){});return audioCtx;}catch(e){return null;}
  }
  function tone(f,d,type,vol,offset){const a=audio();if(!a)return;
    try{const t=a.currentTime+(offset||0),osc=a.createOscillator(),gain=a.createGain();osc.type=type||'sine';osc.frequency.setValueAtTime(f,t);gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(vol||.055,t+.015);gain.gain.exponentialRampToValueAtTime(.001,t+d);osc.connect(gain);gain.connect(a.destination);osc.start(t);osc.stop(t+d+.02);}catch(e){}
  }
  function sound(type){if(!soundOn)return;
    if(type==='safe'){tone(490,.12,'sine',.06);tone(720,.13,'sine',.035,.09);}
    if(type==='flood'){tone(430,.12,'sine',.045);tone(570,.12,'sine',.045,.11);tone(760,.13,'sine',.040,.22);}
    if(type==='flag'){tone(470,.10,'triangle',.052);}
    if(type==='start'){tone(390,.11,'sine',.025);tone(520,.15,'sine',.035,.13);}
    if(type==='switch'){tone(450,.10,'sine',.026);}
    if(type==='radar'){tone(900,.11,'sine',.055);tone(1150,.13,'sine',.045,.14);}
    if(type==='warning'){tone(310,.20,'triangle',.035);tone(290,.21,'triangle',.027,.24);}
    if(type==='shield'){tone(610,.15,'sine',.06);tone(910,.18,'sine',.045,.17);}
    if(type==='boom'){tone(120,.33,'sawtooth',.040);tone(83,.27,'triangle',.06,.03);}
    if(type==='win'){[430,570,710,960].forEach((v,i)=>tone(v,.27,'sine',.052,i*.16));}
    if(type==='lose'){[360,260,170].forEach((v,i)=>tone(v,.25,'sine',.034,i*.15));}
    if(type==='bond'){tone(660,.12,'sine',.032);tone(790,.13,'sine',.034,.10);tone(1046,.16,'sine',.039,.22);}
    if(type==='tap'){tone(460+Math.random()*160,.09,'triangle',.026);}
    if(type==='rescue'){[540,720,880,1120].forEach((v,i)=>tone(v,.18,'sine',.045,i*.10));}
  }
  function feedback(type){const x=window.xhs&&window.xhs.miniTool;
    if(x&&typeof x.vibrateShort==='function'){
      try{Promise.resolve(x.vibrateShort({type:type})).catch(function(){});}catch(e){}
    }
  }
  function getBuildVersion(){
    const x=window.xhs;if(!x)return Promise.resolve(0);
    const launch=x.launchOptions;if(launch&&launch.miniToolEnv&&launch.miniToolEnv.buildVersion)return Promise.resolve(Number(launch.miniToolEnv.buildVersion)||0);
    const m=x.miniTool;if(!m||typeof m.getLaunchOptions!=='function')return Promise.resolve(0);
    return m.getLaunchOptions().then(function(o){return Number(o&&o.miniToolEnv&&o.miniToolEnv.buildVersion)||0;}).catch(function(){return 0;});
  }
  function renderFollowStatus(status){
    followStatus=status;
    const button=$('followBtn');
    button.disabled=followBusy||status===1||status===2;
    button.textContent=status===1?'♥ 已关注':status===2?'作者本人':followBusy?'正在打开关注…':'＋ 关注作者';
  }
  function initFollowUi(){
    const tool=window.xhs&&window.xhs.miniTool;
    if(!tool||typeof tool.followAuthor!=='function'||typeof tool.getFollowStatus!=='function')return;
    getBuildVersion().then(function(v){
      if(Math.floor(v/1000)<9510)return;
      $('followPanel').classList.remove('hidden');
      return tool.getFollowStatus().then(function(res){
        if(res&&typeof res.follow_status==='number')renderFollowStatus(res.follow_status);
      }).catch(function(){renderFollowStatus(-1);});
    }).catch(function(){});
  }
  function followAuthor(){
    if(followBusy||followStatus===1||followStatus===2)return;
    const tool=window.xhs&&window.xhs.miniTool;
    if(!tool||typeof tool.followAuthor!=='function')return;
    followBusy=true;renderFollowStatus(followStatus);
    try{
      Promise.resolve(tool.followAuthor()).then(function(result){
        if(!result||result.follow_status===-1){showToast('暂时无法完成关注，请稍后再试');return;}
        if(result.follow_status===1)showToast('关注成功！下次一起玩更多小游戏 ♥');
        renderFollowStatus(result.follow_status);
      }).catch(function(err){
        if(err&&err.errCode===20002)return; // 用户主动取消确认，保持中立
        if(err&&err.errCode===10003)return; // 平台正在处理关注确认
        showToast(err&&err.errCode===15404?'今日关注引导次数已达上限':'暂时无法关注，请稍后再试');
      }).then(function(){followBusy=false;renderFollowStatus(followStatus);});
    }catch(e){followBusy=false;renderFollowStatus(followStatus);showToast('当前无法打开关注流程');}
  }
  function highScoreKey(){return 'HEARTFIELD_BEST_'+settings.level;}
  function storeHighScore(score){const key=highScoreKey(),data=JSON.stringify({score:score,at:Date.now()});const m=window.xhs&&window.xhs.miniTool;
    getBuildVersion().then(function(v){if(Math.floor(v/1000)>=9460&&m&&typeof m.getStorage==='function'&&typeof m.setStorage==='function'){
      return m.getStorage({key:key}).then(function(old){let previous=0;try{previous=JSON.parse(old.data).score||0;}catch(e){}if(score>previous)return m.setStorage({key:key,data:data});}).catch(function(){});
    }else{try{const old=JSON.parse(localStorage.getItem(key)||'null');if(!old||score>old.score)localStorage.setItem(key,data);}catch(e){}}
    }).catch(function(){});
  }

  // -------------------- Local progress / achievements & new MiniTool capabilities --------------------
  function sessionSnapshot(){
    if(!game||game.finished||game.rescuePending)return null;
    return {
      schema:4,settings:{mode:settings.mode,level:settings.level,scene:settings.scene,names:settings.names.slice(),code:game.code},
      elapsed:game.elapsed, state:{hearts:game.hearts,hits:game.hits,radars:game.radars,shields:game.shields,
        rescueCharges:game.rescueCharges,saved:game.saved,quizTotal:game.quizTotal,quizMatched:game.quizMatched,
        storyStage:game.storyStage,roleSteps:game.roleSteps.slice(),shieldArmed:game.shieldArmed,
        pos:{r:game.pos.r,c:game.pos.c},steps:game.steps,trail:game.trail.slice(-120),
        active:game.active,streak:game.streak,bestStreak:game.bestStreak,turn:game.turn,
        score:game.score,memories:game.memories,questions:game.questions.slice(),
        cells:game.cells.map(function(row){return row.map(function(c){return {
          open:c.open,flag:c.flag,exploded:c.exploded,rescued:c.rescued,special:c.special,scanned:!!c.scanned,scoreFlagged:!!c.scoreFlagged
        };});}) }
    };
  }
  function queueSave(){
    var snapshot=sessionSnapshot();if(!snapshot)return;
    saveChain=saveChain.catch(function(){}).then(function(){return bridge.setJson(SAVE_KEY,snapshot);});
    saveChain.then(function(ok){if(activeScene==='home')refreshHomeData();}).catch(function(){});
  }
  function queueEraseSave(){
    saveChain=saveChain.catch(function(){}).then(function(){return bridge.removeJson(SAVE_KEY);});
    saveChain.catch(function(){});
  }
  function validSnapshot(saved){
    if(!saved||saved.schema!==4||!saved.settings||!saved.state)return false;
    var s=saved.settings,t=saved.state,lev=LEVELS[s.level];
    return !!(lev&&SCENES[s.scene]&&['duo','solo'].indexOf(s.mode)>=0&&typeof s.code==='string'&&
      /^[A-Z0-9]{1,8}$/.test(s.code)&&Array.isArray(s.names)&&s.names.length===2&&
      t.pos&&Number.isInteger(t.pos.r)&&Number.isInteger(t.pos.c)&&
      t.pos.r>=0&&t.pos.r<lev.n&&t.pos.c>=0&&t.pos.c<lev.n&&
      Array.isArray(t.cells)&&t.cells.length===lev.n&&t.cells.every(function(row){return Array.isArray(row)&&row.length===lev.n;}));
  }
  function restoreSession(saved){
    if(!validSnapshot(saved)){showToast('旧进度无法读取，请开启新冒险');return;}
    cancelRescueTimer();var s=saved.settings,t=saved.state;settings.mode=s.mode;settings.level=s.level;
    settings.scene=s.scene;settings.code=s.code;settings.names=s.names.map(function(n,i){return String(n||['小满','阿野'][i]).slice(0,6);});
    $('nameOne').value=settings.names[0];$('nameTwo').value=settings.names[1];$('challengeCode').value=settings.code;
    ['mode','level','scene'].forEach(function(k){document.querySelectorAll('[data-'+k+']').forEach(function(b){b.classList.toggle('selected',b.dataset[k]===settings[k]);});});
    $('heroSash').textContent=SCENES[settings.scene].sash;
    var board=createBoard(settings.level,settings.code),n=LEVELS[settings.level].n;
    var safe=0,flag=0;
    for(var r=0;r<n;r++)for(var c=0;c<n;c++){
      var orig=t.cells[r][c];if(!orig||typeof orig!=='object'){showToast('存档信息不完整');return;}
      var dest=board[r][c];dest.open=!!orig.open;dest.flag=!!orig.flag&&!dest.open;
      dest.exploded=!!orig.exploded&&dest.mine;dest.rescued=!!orig.rescued;dest.special=!!orig.special;
      dest.scoreFlagged=!!orig.scoreFlagged;dest.scanned=!!orig.scanned?{mine:dest.mine,at:performance.now()}:null;
      if(dest.open&&!dest.mine)safe++;if(dest.flag)flag++;
      if(dest.exploded&&!dest.open)dest.exploded=false;
    }
    function num(v,min,max){return clamp(Number.isFinite(Number(v))?Number(v):min,min,max);}
    var route=escapeRoute(settings.level,settings.code);
    if(board[t.pos.r][t.pos.c].mine||!board[t.pos.r][t.pos.c].open){showToast('当前存档位置异常，无法继续');return;}
    game={n:n,code:settings.code,level:settings.level,cells:board,mines:LEVELS[settings.level].mines,
      hearts:num(t.hearts,1,3),safeOpened:safe,flags:flag,hits:num(t.hits,0,100),radars:num(t.radars,0,4),
      shields:num(t.shields,0,4),rescueCharges:num(t.rescueCharges,0,2),rescuePending:null,
      saved:num(t.saved,0,100),quizTotal:num(t.quizTotal,0,100),quizMatched:num(t.quizMatched,0,100),
      storyStage:num(t.storyStage,0,3),lastCheer:0,roleSteps:Array.isArray(t.roleSteps)?t.roleSteps.slice(0,2):[0,0],
      shieldArmed:!!t.shieldArmed,active:t.active===1&&settings.mode==='duo'?1:0,
      streak:num(t.streak,0,100),bestStreak:num(t.bestStreak,0,100),turn:num(t.turn,0,1000),score:num(t.score,0,999999),
      memories:num(t.memories,0,100),questions:Array.isArray(t.questions)?t.questions.filter(function(q){return Array.isArray(q)&&q.length===3;}).slice(0,12):[],
      pos:{r:t.pos.r,c:t.pos.c},goal:{r:0,c:n-1},route:route,
      steps:num(t.steps,0,400),trail:Array.isArray(t.trail)?t.trail.filter(function(p){return p&&Number.isInteger(p.r)&&Number.isInteger(p.c)&&p.r>=0&&p.c>=0&&p.r<n&&p.c<n&&!board[p.r][p.c].mine;}).slice(-120):[{r:t.pos.r,c:t.pos.c}],
      avatarPos:[{r:t.pos.r,c:t.pos.c},{r:t.pos.r,c:t.pos.c}],animations:[null,null],reactions:[null,null],
      bondAt:0,flash:[],scans:[],isDemo:false,startedAt:Date.now()-num(saved.elapsed,0,86400)*1000,
      pauseStart:0,pausedMs:0,finished:false,won:false,elapsed:num(saved.elapsed,0,86400),session:Date.now()};
    activeScene='game';inputMode='dig';setScreen();$('gameChapter').textContent=SCENES[settings.scene].chapter;
    $('gameHeading').textContent=SCENES[settings.scene].heading;$('scenePill').textContent='✦ '+SCENES[settings.scene].name;
    $('playSceneWrap').dataset.scene=settings.scene;$('playerStrip').classList.toggle('solo-mode',settings.mode==='solo');
    $('encourageBtn').textContent=settings.mode==='solo'?'♥ 给自己打气':'♥ 给 TA 打气';
    updateHud();resizeAll();setStatus('冒险已恢复，两个人还在同一格','继续走人物旁边发光的格子，朝右上角金色终点前进！');window.scrollTo(0,0);
    if(game.pos.r===0&&game.pos.c===n-1&&!game.questions.length)checkWin();
  }
  function refreshHomeData(){
    if(activeScene!=='home')return;
    bridge.getJson(SAVE_KEY).then(function(s){if(activeScene!=='home')return;
      $('resumeBtn').classList.toggle('hidden',!validSnapshot(s));
    });
    bridge.getJson(HISTORY_KEY).then(function(items){if(activeScene!=='home')return;
      $('historyBtn').textContent=Array.isArray(items)&&items.length?'✧ 我的情侣战绩 · '+items.length:'✧ 我的情侣战绩';
    });
  }
  function storeGameHistory(){
    if(!game)return;
    var entry={at:Date.now(),mode:settings.mode,level:settings.level,scene:settings.scene,steps:game.steps,remaining:remainingSteps(),
      code:game.code,won:game.won,match:matchScore(),elapsed:game.elapsed,score:game.score,saved:game.saved};
    bridge.getJson(HISTORY_KEY).then(function(rows){rows=Array.isArray(rows)?rows:[];
      return bridge.setJson(HISTORY_KEY,[entry].concat(rows).slice(0,12));
    }).catch(function(){});
  }
  function showHistory(){
    bridge.getJson(HISTORY_KEY).then(function(records){
      var box=document.createElement('div');box.className='history-list';records=Array.isArray(records)?records:[];
      if(!records.length){var empty=document.createElement('p');empty.textContent='还没有战绩。开始一场冒险，就会留下你的第一份回忆。';box.appendChild(empty);}
      records.forEach(function(record){
        var item=document.createElement('div');item.className='history-entry';
        var meta=document.createElement('div'),a=document.createElement('strong'),b=document.createElement('small'),score=document.createElement('b');
        a.textContent=(record.won?'♥ 共同通关':'♡ 下次再战')+' · '+(SCENES[record.scene]||SCENES.sunset).name;
        b.textContent=(record.code||'')+' · '+fmtTime(record.elapsed||0)+' · '+(record.steps||0)+'步 · '+(record.score||0)+'分';
        score.textContent=(record.match||0)+'%';meta.appendChild(a);meta.appendChild(b);item.appendChild(meta);item.appendChild(score);box.appendChild(item);
      });
      showModal({icon:'🏅',eyebrow:'OUR LITTLE ALBUM',title:'每次心动都值得记录',desc:'仅在当前小工具设备保存最近12次结算；清理数据可能丢失。',extra:box,
        buttons:[{label:'回到首页',primary:true,action:closeModal}]});
    }).catch(function(){showToast('战绩暂时无法读取');});
  }
  function commentChallenge(){
    if(!game||!commentSupported)return;
    var output;
    try{output=drawPoster();}catch(e){showToast('战报图片暂时生成失败');return;}
    var snap={v:1,page:'challenge',code:game.code,level:settings.level,scene:settings.scene,mode:settings.mode};
    var text='情侣扫雷PK来了！我在《心动雷区》挑战 '+game.code+'，默契值 '+matchScore()+'%，谁敢来同图挑战？';
    bridge.comment(output,text,snap).then(function(result){
      if(result&&result.routed)showToast('已打开评论编辑器，记得确认发送');
      else showToast('评论区暂时无法打开');
    }).catch(function(){showToast('未能打开评论区，请检查客户端版本');});
  }
  function enablePlatformFeatures(){
    if(!bridge)return;
    bridge.safeWindow();
    bridge.has('interactionOpenApi',9490).then(function(ok){return bridge.has('writeTempFile',0).then(function(write){commentSupported=ok&&write;});});
    Promise.all(['onGyroscopeChange','offGyroscopeChange','startGyroscope','stopGyroscope'].map(function(n){return bridge.has(n,9500);})).then(function(a){
      if(a.every(function(x){return x;}))$('motionBtn').classList.remove('hidden');
    });
    refreshHomeData();
  }
  function toggleMotion(){
    if(motionOn){motionOn=false;$('motionBtn').classList.remove('motion-on');$('motionBtn').setAttribute('aria-label','开启场景体感');
      bridge.stopGyro();showToast('体感背景已关闭');return;}
    bridge.startGyro(function(frame){
      // The platform gives angular velocity (rad/s), not an absolute device tilt angle.
      // A decorative offset reacts to motion and decays; grid geometry stays unchanged.
      if(!frame||!motionOn)return;
      gyroShift.x=clamp(gyroShift.x*.80+(Number(frame.y)||0)*4,-12,12);
      gyroShift.y=clamp(gyroShift.y*.80-(Number(frame.x)||0)*4,-9,9);
    }).then(function(ok){if(!ok){showToast('当前设备没有可用的体感数据');return;}
      motionOn=true;$('motionBtn').classList.add('motion-on');$('motionBtn').setAttribute('aria-label','关闭场景体感');showToast('场景体感已开启，轻轻移动手机看看背景');
    });
  }

  // -------------------- Dialogs and sharing --------------------
  function showModal(opts){
    modalOpen=true;pauseTime();$('modalRoot').classList.remove('hidden');
    $('modalIcon').textContent=opts.icon||'♥';$('modalEyebrow').textContent=opts.eyebrow||'HEARTFIELD';
    $('modalTitle').textContent=opts.title||'';$('modalDesc').textContent=opts.desc||'';
    const extra=$('modalExtra'),buttons=$('modalButtons');extra.textContent='';buttons.textContent='';
    if(opts.extra)extra.appendChild(opts.extra);
    (opts.buttons||[{label:'我知道啦',primary:true,action:closeModal}]).forEach(function(config){
      const button=document.createElement('button');button.type='button';button.textContent=config.label;
      if(config.primary)button.classList.add('primary');
      button.addEventListener('click',function(){try{config.action();}catch(err){showToast('操作没有成功，请重试');}});
      buttons.appendChild(button);
    });
  }
  function hideModal(){$('modalRoot').classList.add('hidden');}
  function closeModal(){if(game&&game.rescuePending)return;modalOpen=false;hideModal();$('modalRoot').dataset.kind='';resumeTime();}
  function showToast(text){const el=$('toast');el.textContent=text;el.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.classList.add('hidden');},2500);}
  function showHelp(){const extra=document.createElement('div');extra.style.cssText='text-align:left;background:#faf4f1;border-radius:13px;padding:11px 15px;font-size:12px;line-height:2;color:#776571;';
    extra.textContent='① 目标：从左下角绿色起点走到右上角金色终点\n② 两人站在同一格，轮流选择下一步，上下左右一次只能走一格\n③ 发光的四邻格可以走。数字代表该格周围 8 格的雷数\n④ 长按插旗标记怀疑有雷的格子；雷达查看相邻格，守护避免扣血\n⑤ 踩雷会触发 5 秒 SOS 救援，两人仍留在原安全格\n⑥ 走到心愿格可能触发情侣默契双选，奖励道具\n⑦ 两人一起走到金色终点即通关，不必翻完所有格子';
    extra.style.whiteSpace='pre-line';showModal({icon:'🧭',eyebrow:'HOW TO PLAY',title:'带 TA 逃出雷区',desc:'起点到终点，一人一步；看数字、避雷、必要时互相救援！',extra:extra,buttons:[{label:'我明白了，出发 ♥',primary:true,action:closeModal}]});
  }
  function confirmBack(){showModal({icon:'🏝',eyebrow:'PAUSE THE ADVENTURE',title:'要先回到出发点吗？',desc:'本局会自动存为本机续局，你可以从首页继续。',buttons:[{label:'继续冒险',action:closeModal},{label:'返回首页',primary:true,action:function(){closeModal();resetToHome();}}]});}
  function restartConfirm(){showModal({icon:'↻',eyebrow:'TRY AGAIN',title:'用这张地图再来一次？',desc:'会使用同一挑战码重新开始，方便两人公平比一比。',buttons:[{label:'先不重开',action:closeModal},{label:'重新开始',primary:true,action:function(){closeModal();startGame();}}]});}
  function showCode(){if(!game)return;
    const d=document.createElement('div');const b=document.createElement('div');b.className='code-badge';b.textContent=game.code;
    const p=document.createElement('p');p.style.cssText='font-size:11px;line-height:1.7;color:#9a8992;margin:11px 0 0';p.textContent='两人选择相同难度和挑战码，就会得到相同起点、终点和地雷布局。挑战码不是在线房间。';d.appendChild(b);d.appendChild(p);
    const actions=[{label:'继续探险',action:closeModal},{label:'做一张挑战海报',primary:true,action:showPoster}];
    if(commentSupported)actions.push({label:'📣 评论区同题PK',action:commentChallenge});
    showModal({icon:'⌗',eyebrow:'SAME MAP CHALLENGE',title:'把雷区交给 TA',desc:'你们可以分别扫同一张地图，比拼时间、爱心与分数。',extra:d,buttons:actions});
  }
  function drawPoster(){
    const p=document.createElement('canvas');p.width=720;p.height=960;const ctx=p.getContext('2d');const w=720,h=960;
    let bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#fff2ef');bg.addColorStop(.58,'#fff8ed');bg.addColorStop(1,'#e9f3eb');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    ctx.fillStyle='rgba(236,133,146,.14)';ellipse(ctx,70,80,150,135,ctx.fillStyle);ellipse(ctx,680,800,210,170,'rgba(135,191,170,.18)');
    ctx.textAlign='center';ctx.fillStyle='#ce7488';ctx.font='bold 23px Arial,sans-serif';ctx.fillText('H E A R T F I E L D',w/2,94);
    ctx.fillStyle='#503b49';ctx.font='900 65px "PingFang SC",sans-serif';ctx.fillText('心 动 雷 区',w/2,177);
    ctx.font='22px "PingFang SC",sans-serif';ctx.fillStyle='#a7828c';ctx.fillText('两个人，一起走到终点',w/2,223);
    rounded(ctx,58,257,604,430,34);ctx.fillStyle='#fffdf8';ctx.fill();
    // Celebration confetti / a miniature isometric board.
    if(game){
      const art=document.createElement('canvas');art.width=630;art.height=390;
      const artCtx=art.getContext('2d');
      drawScene(artCtx,630,390,game,performance.now(),false,true);
      ctx.save();rounded(ctx,70,273,580,398,24);ctx.clip();ctx.drawImage(art,70,281,580,360);ctx.restore();
    }
    ctx.font='bold 22px "PingFang SC",sans-serif';ctx.fillStyle='#a77b8b';ctx.fillText(settings.mode==='solo'?settings.names[0]+' · 独自闪耀':settings.names[0]+'  ♥  '+settings.names[1],360,673);
    const completed=game&&game.won;
    ctx.fillStyle=completed?'#4d8a76':'#ca7989';rounded(ctx,187,697,346,54,27);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 24px "PingFang SC",sans-serif';ctx.fillText((settings.mode==='solo'?'单人扫雷挑战':'情侣默契挑战')+(completed?' · 成功逃出':' · 进行中'),360,732);
    const pct=game?matchScore():0;
    ctx.fillStyle='#5a4551';ctx.font='900 73px Arial,sans-serif';ctx.fillText(pct+'%',360,832);
    ctx.fillStyle='#af8c97';ctx.font='20px "PingFang SC",sans-serif';ctx.fillText('默 契 指 数   ·   '+(game?fmtTime(game.elapsed):'00:00'),360,868);
    ctx.font='bold 21px Arial,sans-serif';ctx.fillStyle='#688f83';ctx.fillText('同题挑战码  '+(game?game.code:'------'),360,921);
    return p.toDataURL('image/png');
  }
  function showPoster(){
    if(!game)return;
    var imageUrl=drawPoster(),extra=document.createElement('div'),preview=document.createElement('img');
    preview.className='poster-preview';preview.src=imageUrl;preview.alt='情侣扫雷挑战海报预览';extra.appendChild(preview);
    var note=document.createElement('p');note.style.cssText='font-size:10px;color:#a9949b;margin:8px 0 0';
    note.textContent='战报包含挑战码；如使用了真人头像，分享前请征得双方同意。';extra.appendChild(note);
    var buttons=[{label:'保存海报',primary:true,action:function(){savePoster(imageUrl);}}];
    var native=bridge.tool();
    if(native&&typeof native.postNote==='function')buttons.unshift({label:'发小红书笔记',action:function(){publishPoster(imageUrl);}});
    else buttons.unshift({label:'关闭预览',action:closeModal});
    if(commentSupported)buttons.push({label:'📣 评论区PK',action:commentChallenge});
    showModal({icon:'📸',eyebrow:'MADE FOR TWO',title:'你们的专属冒险战报',desc:'记录今天是谁带谁成功离开雷区。',extra:extra,buttons:buttons});
  }
  function savePoster(dataUrl){
    var native=bridge.tool();
    if(native&&typeof native.saveImageToPhotosAlbum==='function'){
      bridge.album(dataUrl).then(function(){showToast('战报已经保存到相册 ♥');}).catch(function(){showToast('保存失败，请检查相册权限或重试');});
    }else if(!native){
      try{var a=document.createElement('a');a.href=dataUrl;a.download='心动雷区-情侣挑战.png';document.body.appendChild(a);a.click();a.remove();showToast('已尝试下载战报');}
      catch(e){showToast('预览中可手动保存图片');}
    }else showToast('当前客户端暂不支持保存相册');
  }
  function publishPoster(dataUrl){
    var native=bridge.tool();if(!native||typeof native.postNote!=='function'){showToast('请在小红书小工具中打开');return;}
    var title='我们的扫雷默契有'+matchScore()+'%！';
    var content='和'+settings.names[1]+'一起玩了《心动雷区》💗\n挑战码：'+game.code+'\n谁先踩雷，谁负责哄！\n#情侣游戏 #双人小游戏 #扫雷';
    bridge.note(dataUrl,title,content).then(function(){showToast('已打开笔记编辑页，请自行确认发布');}).catch(function(){showToast('未能打开笔记编辑页');});
  }

  // -------------------- Events and lifecycle --------------------
  function pictureUpload(file,index){if(!file)return;
    if(!/^image\//.test(file.type)){showToast('请选择图片文件');return;}
    if(file.size>8*1024*1024){showToast('建议选择小于 8MB 的照片');return;}
    const reader=new FileReader();reader.onerror=function(){showToast('图片读取失败，请换一张');};
    reader.onload=function(){const img=new Image();img.onload=function(){
      try{
        const off=document.createElement('canvas');const ctx=off.getContext('2d');off.width=192;off.height=192;
        const side=Math.min(img.naturalWidth,img.naturalHeight),sx=(img.naturalWidth-side)/2,sy=(img.naturalHeight-side)/2;
        ctx.drawImage(img,sx,sy,side,side,0,0,192,192);
        const cropped=off.toDataURL('image/jpeg',.82);const small=new Image();small.onload=function(){settings.photos[index]=small;
          const id=index===0?'avatarOnePreview':'avatarTwoPreview';const e=$(id);e.textContent='';e.style.backgroundImage='url("'+cropped+'")';
          updatePlayerPreviews();showToast('真人头像替换成功');
        };small.src=cropped;
      }catch(e){showToast('图片处理失败，请换一张');}
    };img.onerror=function(){showToast('图片格式不支持');};img.src=reader.result;};
    try{reader.readAsDataURL(file);}catch(e){showToast('无法读取这张照片');}
  }
  function updatePlayerPreviews(){
    [0,1].forEach(function(i){const el=$(i===0?'playerOneAvatar':'playerTwoAvatar');if(settings.photos[i]){el.style.backgroundImage='url("'+settings.photos[i].src+'")';el.textContent='';}else{el.style.backgroundImage='';el.textContent=i===0?'A':'B';}});
  }
  function bindButton(id,fn){$(id).addEventListener('click',fn);}
  function readCanvasEvent(event){const rect=canvas.getBoundingClientRect();const x=(event.clientX-rect.left)*gameSize.w/rect.width;const y=(event.clientY-rect.top)*gameSize.h/rect.height;return screenToCell(x,y);}
  function clearLongPress(){if(longPressTimer){clearTimeout(longPressTimer);longPressTimer=null;}touchDown=null;}
  function handlePointerDown(e){if(!game||game.finished||modalOpen)return;
    if(e.button!==undefined&&e.button!==0)return;
    const cell=readCanvasEvent(e);if(!cell)return;
    touchDown={cell:cell,x:e.clientX,y:e.clientY,pointerId:e.pointerId,long:false};
    clearTimeout(longPressTimer);
    longPressTimer=setTimeout(function(){if(touchDown&&!touchDown.long){touchDown.long=true;hitCell(cell.r,cell.c,true);}},490);
  }
  function handlePointerMove(e){if(touchDown&&Math.hypot(e.clientX-touchDown.x,e.clientY-touchDown.y)>13)clearLongPress();}
  function handlePointerUp(e){if(!touchDown||touchDown.pointerId!==e.pointerId)return;
    const old=touchDown;clearLongPress();if(old.long)return;
    const cell=readCanvasEvent(e);if(cell&&cell.r===old.cell.r&&cell.c===old.cell.c)hitCell(cell.r,cell.c,false);
  }
  function bindEvents(){
    document.querySelectorAll('[data-mode]').forEach(function(btn){btn.addEventListener('click',function(){settings.mode=btn.dataset.mode;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b===btn));});});
    document.querySelectorAll('[data-level]').forEach(function(btn){btn.addEventListener('click',function(){settings.level=btn.dataset.level;document.querySelectorAll('[data-level]').forEach(b=>b.classList.toggle('selected',b===btn));});});
    document.querySelectorAll('[data-scene]').forEach(function(btn){btn.addEventListener('click',function(){settings.scene=btn.dataset.scene;document.querySelectorAll('[data-scene]').forEach(b=>b.classList.toggle('selected',b===btn));$('heroSash').textContent=SCENES[settings.scene].sash;});});
    bindButton('followBtn',followAuthor);
    bindButton('resumeBtn',function(){bridge.getJson(SAVE_KEY).then(restoreSession);});
    bindButton('historyBtn',showHistory);bindButton('motionBtn',toggleMotion);
    bindButton('randomCodeBtn',function(){$('challengeCode').value=randomCode();showToast('已生成新挑战码');});
    bindButton('startBtn',startGame);bindButton('helpBtn',showHelp);
    bindButton('soundBtn',function(){soundOn=!soundOn;$('soundBtn').textContent=soundOn?'♪':'♩';$('soundBtn').setAttribute('aria-label',soundOn?'关闭音效':'打开音效');showToast(soundOn?'音效已经打开':'音效已经关闭');});
    bindButton('backHomeBtn',confirmBack);bindButton('restartBtn',restartConfirm);bindButton('shareCodeBtn',showCode);bindButton('encourageBtn',encourage);
    bindButton('digBtn',function(){changeAction('dig');});bindButton('flagBtn',function(){changeAction('flag');});
    bindButton('radarBtn',function(){changeAction('radar');});bindButton('shieldBtn',armShield);
    bindButton('playerOneBtn',function(){changePlayer(0);});bindButton('playerTwoBtn',function(){changePlayer(1);});
    [0,1].forEach(function(i){
      const file=$(i===0?'photoOne':'photoTwo');const badge=document.querySelectorAll('.photo-badge')[i];
      badge.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();file.click();});
      file.addEventListener('change',function(){pictureUpload(file.files&&file.files[0],i);file.value='';});
    });
    canvas.addEventListener('pointerdown',handlePointerDown);
    canvas.addEventListener('pointermove',handlePointerMove);
    canvas.addEventListener('pointerup',handlePointerUp);
    canvas.addEventListener('pointercancel',clearLongPress);
    canvas.addEventListener('contextmenu',function(e){e.preventDefault();});
    // Keyboard for laptop demos and accessibility.
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape'&&modalOpen){if(game&&(game.finished||game.rescuePending))return;if($('modalRoot').dataset.kind==='quiz')return;closeModal();}
      if(!game||activeScene!=='game'||modalOpen)return;
      if(e.key==='1')changeAction('dig');if(e.key==='2')changeAction('flag');if(e.key==='3')changeAction('radar');if(e.key==='4')armShield();
    });
    document.addEventListener('visibilitychange',function(){
      if(document.hidden){if(game&&!game.finished){updateTime();queueSave();pauseTime();}if(motionOn)bridge.stopGyro().then(function(){motionOn=false;$('motionBtn').classList.remove('motion-on');});}
      else {if(game&&!game.finished&&!modalOpen)resumeTime();bridge.safeWindow();if(activeScene==='home'){refreshHomeData();refreshFollowOnReturn();}}
    });
    window.addEventListener('resize',function(){resizeAll();bridge.safeWindow();});
    // No timers, images, or game data are sent to any server.
  }
  function refreshFollowOnReturn(){var m=bridge.tool();if(!m||typeof m.getFollowStatus!=='function')return;
    bridge.has('getFollowStatus',9510).then(function(ok){if(!ok)return;m.getFollowStatus().then(function(r){if(r&&typeof r.follow_status==='number')renderFollowStatus(r.follow_status);}).catch(function(){});});}
  bindEvents();initFollowUi();enablePlatformFeatures();resizeAll();requestAnimationFrame(frame);setInterval(updateTime,1000);
  if(window.__HEARTMINE_TEST__){window.__heartMineDebug={getState:function(){if(!game)return null;return {pos:{r:game.pos.r,c:game.pos.c},goal:game.goal,steps:game.steps,route:game.route.slice(),n:game.n,mines:game.mines,hearts:game.hearts,safeOpened:game.safeOpened,flags:game.flags,active:game.active,finished:game.finished,won:game.won,radars:game.radars,shields:game.shields,rescueCharges:game.rescueCharges,rescuePending:!!game.rescuePending,saved:game.saved,quizTotal:game.quizTotal,quizMatched:game.quizMatched,scene:settings.scene,storyStage:game.storyStage,shieldArmed:game.shieldArmed,code:game.code,cells:game.cells.map(row=>row.map(c=>({mine:c.mine,open:c.open,flag:c.flag,num:c.num}))) };},cellToScreen:function(r,c){if(!game)return null;const g=geometry(gameSize.w,gameSize.h,game.n,false);return iso(g,r,c);},startGame:startGame,hitCell:hitCell};}
})();
