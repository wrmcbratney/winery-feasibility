// Steady-state cellar flow: every lot of several overlapping vintages, day by day, by location, in gallons and vessels.
// Day 0 = Aug 1 of the harvest year. Vintages k=-3..1 are identical and offset by 365 days, so days 0 to 364
// are a normal year once the brand is running, with older vintages still in barrel or bottle.
const LOCS=[['pad','Crush pad'],['press','Press'],['redTank','Red ferment tanks'],['whiteTank','White tanks'],['storage','Lot tanks: ML and storage'],['blend','Blending and bottling tanks'],['barrel','Barrels'],['bottled','Bottled, not yet sold']];
const UNIT={pad:['bin','bins'],press:['press load','press loads'],redTank:['tank','tanks'],whiteTank:['tank','tanks'],storage:['tank','tanks'],blend:['tank','tanks'],barrel:['barrel','barrels'],bottled:['pallet','pallets']};
const AUG1=213, MIDOCT=288-213, MO=30.44, GAL_CASE=2.378, BBL=59.4, STD_TANK=[500,750,1000,1500,2000,2500,3000,4000,5000,6000,8000];
const flowCache={};
const _X=typeof exception==='function'?{exception}:require('./exceptions.js');
const _W=typeof lotParams==='function'?{wineryFor,lotParams,crushHours,jacketBTU,PRESS_CYCLE_HRS,SORT_LABOR,CRUSH_RATE,crushHoursPerDay,dailyArrival,sortRate}:require('./winery.js');
function lotSim(v,tons,pick,W,simulate){
  const p=_W.lotParams(v,tons,pick,W),k=JSON.stringify(p);
  if(!flowCache[k])flowCache[k]=simulate(p);
  return flowCache[k];
}
const stdTank=gal=>STD_TANK.find(s=>s>=gal)||STD_TANK[STD_TANK.length-1];
function lotPlan(V,G,simulate){
  const lots=[], short={}, exc=[], seen=new Set(), flag=(key,cls,o)=>{if(!seen.has(key)){seen.add(key);exc.push(_X.exception(cls,o))}};
  // Fermentors are a design choice (VEN 235 set one size and counted how many). Each day's pick goes into the fermentor
  // being filled for that variety until it is full or the fill window closes; a pick that overflows is split. A lot is
  // one filled fermentor: its ferment starts when the fill completes, and the tank is occupied from the first pick.
  const W=_W.wineryFor(V,G,stdTank(G.redFermGal)), pressT=W.press.tons, harvest=[];
  V.forEach((v,wi)=>{
    const red=v.color==='red', q=_W.lotParams(v,1,v.pick??270,W);
    const perTon=red?q.mustGal*(1+q.headspace/100):170*1.1, tankGal=stdTank(red?G.redFermGal:G.whiteFermGal);
    const capT=Math.min(G.lotTons,tankGal/perTon), minT=capT*G.minFillPct/100, days=_W.dailyArrival(v,v.cases/v.cpt,G), total=days.reduce((a,d)=>a+d.tons,0);
    days.forEach(d=>harvest.push({wi,name:v.name,color:v.color,day:d.day,tons:d.tons}));
    const fills=[];let cur=null;
    for(const d of days){let rem=d.tons;
      while(rem>1e-9){
        // a fermentor closes when full, or when the fill window has passed and it holds at least the minimum fill;
        // a thin shoulder of the harvest keeps filling the open tank rather than taking one of its own
        if(!cur||cur.tons>=capT-1e-9||(d.day-cur.first>=G.fillDays&&cur.tons>=minT-1e-9)){cur={first:d.day,picks:[],tons:0};fills.push(cur)}
        const take=Math.min(rem,capT-cur.tons);cur.picks.push({day:d.day,tons:take});cur.tons+=take;rem-=take}}
    // a small last fill joins the tank before it when it fits
    if(fills.length>1){const last=fills[fills.length-1],prev=fills[fills.length-2];if(last.tons<minT-1e-9&&prev.tons+last.tons<=capT+1e-9){prev.picks.push(...last.picks);prev.tons+=last.tons;fills.pop()}}
    const n=fills.length;
    const bm=Math.min(v.bottle??(v.barrel>0?Math.round((red?6:0.5)+v.barrel+1):5),v.release),bottle=MIDOCT+bm*MO, release=MIDOCT+v.release*MO;
    fills.forEach((F,j)=>{
      const lt=F.tons, cases=v.cases*lt/total, pick=F.first, p=pick-AUG1, fd=F.picks[F.picks.length-1].day-F.first, S=[];
      const seg=(loc,a,b,gal,units,x)=>{if(b>a)S.push({loc,a:p+a,b:p+b,gal,units,...x})};
      const ev=(loc,a,gal,units)=>S.push({loc,a:p+a,b:p+a+1,gal,units,ev:true});
      const bot=bottle-p, bl=bot-21, wineGal=v.cases*GAL_CASE*1.03, bins=F.picks.reduce((a,k)=>a+Math.ceil(k.tons/0.5-1e-9),0);
      // barrel time as set, unless bottling cuts it short; a gap under 60 days before blending is absorbed into barrel
      // time rather than a short tank stay. Either way it is a change to how the wine is made, so it is reported.
      const barrelOut=inDay=>{
        let out=Math.min(inDay+v.barrel*MO,bl);
        if(inDay+v.barrel*MO>bl+7){short[wi]=(bl-inDay)/MO;
          flag('short'+wi,'method',{constraint:'Bottling date',wine:v.name,process:'Barrel aging',what:`bottles before its barrel time is up: about ${Math.round((bl-inDay)/MO)} of ${v.barrel} months in barrel`,consequences:'less oak and less time on lees than intended',remedies:'move bottling later in the wine table, or accept the shorter barrel time'})}
        if(bl-out<60&&bl>out){
          flag('ext'+wi,'method',{constraint:'Blending date',wine:v.name,process:'Barrel aging',what:`barrel time extended from ${v.barrel} to about ${((bl-inDay)/MO).toFixed(1)} months, so the wine goes straight from barrel to blending instead of spending ${Math.round(bl-out)} days in a lot tank`,consequences:'more oak contact and barrels held longer than set',remedies:'set bottling so the barrel time ends at blending, or allow a short tank stay'});
          out=bl}
        return out;
      };
      F.picks.forEach(k=>ev('pad',k.day-F.first,k.tons*180,Math.ceil(k.tons/0.5-1e-9)));
      let crushHrs=F.picks.reduce((a,k)=>a+_W.crushHours(k.tons,v.color,W.sort),0),pressHrs,loads;
      if(red){
        const q=_W.lotParams(v,lt,pick+fd,W), nT=Math.ceil(lt*q.mustGal*(1+q.headspace/100)/W.redTankGal-1e-9), r=lotSim(v,lt,pick+fd,{...W,coolBTU:nT*W.coolBTU},simulate);
        if(r.stuck)flag('stuck'+wi+'|'+j,'method',{constraint:'Fermentation kinetics',wine:v.name,lot:j,process:'Primary fermentation',what:`did not finish: ${Math.round(r.S)} g/L sugar left after ${Math.round(r.pressDay)} days`,consequences:'the lot holds its fermenter to the end of the simulated window and is pressed with sugar left, so that tank turns over late and the wine is exposed until it is restarted',remedies:'pick at lower Brix, add nutrients, warm the tank, or restart with an acclimated yeast'});
        if(r.mlStuck)flag('ml'+wi+'|'+j,'method',{constraint:'Malolactic kinetics',wine:v.name,lot:j,process:'Malolactic fermentation',what:'did not finish within 300 days of pressing',consequences:'malic acid left in the wine going to barrel',remedies:'reinoculate, warm the wine, or check SO2 and pH'});
        if(r.barrelForced)flag('bf'+wi+'|'+j,'reschedule',{constraint:'Cellar temperature',wine:v.name,lot:j,process:'Barrel down',what:'the cellar never reached the barrel-down temperature, so the lot went to barrel 300 days after pressing',consequences:'the lot tank is held all winter and spring',remedies:'heat the cellar or move to barrel on a date instead of a temperature'});
        const barrelDay=Math.min(fd+r.barrelDay,bot-30), bg=r.barrelGal;loads=Math.ceil(lt/pressT-1e-9);
        seg('redTank',0,fd+r.pressEnd,r.tankGal);ev('press',fd+Math.floor(r.pressDay),r.gal,loads);
        if(v.barrel>0){seg('storage',fd+r.pressEnd,barrelDay,r.gal);const out=barrelOut(barrelDay);seg('barrel',barrelDay,out,bg,Math.ceil(bg/BBL-1e-9));seg('storage',out,bl,bg)}
        else seg('storage',fd+r.pressEnd,bl,r.gal);
        seg('blend',bl,bot,bg,null,{wine:wineGal,n});
        pressHrs=r.pressHrs;
      }else{
        // whole clusters go straight to the press on each pick day; the juice settles two days after the tank is full
        const juice=lt*170;loads=0;
        F.picks.forEach(k=>{const ld=Math.ceil(k.tons/pressT-1e-9);loads+=ld;ev('press',k.day-F.first,k.tons*170,ld)});
        seg('whiteTank',0,fd+2,juice*1.1);
        if(v.barrel>0){const out=barrelOut(fd+2);seg('barrel',fd+2,out,juice*0.96,Math.ceil(juice*0.96/BBL-1e-9));seg('storage',out,bl,juice*0.94)}
        else{seg('whiteTank',fd+2,fd+21,juice*1.1);seg('storage',fd+21,bl,juice*0.96)}
        seg('blend',bl,bot,juice*0.94,null,{wine:wineGal,n});
        pressHrs=loads*_W.PRESS_CYCLE_HRS.white;
      }
      const bg=cases*GAL_CASE, rel=release-p;
      seg('bottled',bot,rel,bg,cases/56);
      for(let k=0;k<12;k++){const f=1-(k+0.5)/12;seg('bottled',rel+k*MO,rel+(k+1)*MO,bg*f,cases*f/56)}
      lots.push({wi,name:v.name,j,n,tons:lt,cases,wineCases:v.cases,pick,p,fillDays:fd,picks:F.picks,color:v.color,segs:S,bottle,release,bins,loads,crushHrs,pressHrs,mustGal:lt*180});
    });
  });
  // One day's crush line and press against everything picked that day; more than fits is overtime or a second shift.
  const hrs=_W.crushHoursPerDay(G),rate=Math.min(_W.CRUSH_RATE,_W.sortRate(W.sort)),byDay={};
  harvest.forEach(h=>{const b=byDay[h.day]||(byDay[h.day]={red:0,white:0,loads:0,names:new Set()});b[h.color]+=h.tons;if(h.color==='white')b.loads+=Math.ceil(h.tons/pressT-1e-9);b.names.add(h.name)});
  for(const d in byDay){const b=byDay[d],line=b.red/rate,press=b.loads*_W.PRESS_CYCLE_HRS.white,names=[...b.names].join(' and ');
    if(line>hrs+1e-9)exc.push(_X.exception('overtime',{constraint:'Crush line hours',wine:names,process:'Crush',what:`${dayLabel(+d)}: ${b.red.toFixed(1)} tons of reds need ${line.toFixed(1)} line hours against ${hrs} in the crush window`,consequences:'fruit waits on the pad or the crew works a longer day',remedies:'add a crush shift, spread the picks, or sort faster'}));
    if(press>G.workDayHrs+1e-9)exc.push(_X.exception('overtime',{constraint:'White press hours',wine:names,process:'Pressing',what:`${dayLabel(+d)}: ${b.loads} white press loads need ${press.toFixed(1)} hours against a ${G.workDayHrs}-hour day`,consequences:'whole clusters wait for the press',remedies:'spread the picks or use a larger press'}));
  }
  return {lots,pressT,short,exceptions:exc,winery:W,crushHrsDay:hrs,harvest,byDay};
}
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function dayLabel(doy){const dt=new Date(Date.UTC(2027,0,1)+(doy-1)*864e5);return MONTHS[dt.getUTCMonth()]+' '+dt.getUTCDate()}
function flow(V,G,simulate){
  const {lots:base,pressT,short,exceptions,winery,harvest,crushHrsDay}=lotPlan(V,G,simulate), kk=Math.max(1,G.lotsPerTank||1);
  // enough overlaid vintages that every lot's whole life, from pick to the last case sold, lands in the normal-year window
  const maxEnd=Math.max(...base.flatMap(L=>L.segs.map(s=>s.b))), K=Math.max(3,Math.floor(maxEnd/365)), D=Math.max(365*4,Math.ceil((maxEnd+1)/365)*365);
  // one tank size per tank type: fermentors are the size chosen (lots are filled to fit them); lot and blending tanks
  // are the smallest standard size that holds the largest lot there
  const size={};['redTank','whiteTank','storage','blend'].forEach(k=>{const mx=Math.max(0,...base.flatMap(l=>l.segs.filter(s=>s.loc===k).map(s=>k==='blend'?Math.max(s.wine,s.gal*s.n):k==='storage'?s.gal*Math.min(kk,l.n):s.gal)));size[k]=k==='redTank'?Math.max(stdTank(G.redFermGal),stdTank(mx)):k==='whiteTank'?Math.max(stdTank(G.whiteFermGal),stdTank(mx)):stdTank(mx)});
  base.forEach(l=>l.segs.forEach(s=>{if(s.loc==='storage')s.units=1/Math.min(kk,l.n);else if(s.units==null)// a blend tank holds what actually arrives from barrel or tank, which until the lot ledger exists can exceed the finished volume
    s.units=s.loc==='blend'?Math.ceil(Math.max(s.wine,s.gal*s.n)/size.blend-1e-9)/s.n:Math.ceil(s.gal/size[s.loc]-1e-9)}));
  const mk=()=>{const o={};LOCS.forEach(([k])=>o[k]=new Float64Array(D));return o};
  const lanes=mk(),lanes0=mk(),ves=mk(),ves0=mk(),bWine=V.map(()=>new Float64Array(D)),grp={};
  for(let k=-K;k<=1;k++)base.forEach(L=>L.segs.forEach(s=>{
    const a=s.a+365*k,b=s.b+365*k;
    for(let d=Math.max(0,Math.floor(a));d<Math.min(D,Math.ceil(b));d++){
      const w=s.ev?1:Math.min(b,d+1)-Math.max(a,d);if(w<=0)continue;
      lanes[s.loc][d]+=s.gal*w;if(k===0)lanes0[s.loc][d]+=s.gal*w;
      // a vessel counts as in use on any day it holds wine, so on a transfer day both vessels count
      const u=s.loc==='bottled'?s.units*w:s.units;
      if(s.loc==='storage'){if(u){const g=grp[L.wi+'|'+k]||(grp[L.wi+'|'+k]={u:new Float64Array(D),gal:new Float64Array(D)});g.u[d]+=u;g.gal[d]+=s.gal}}else{ves[s.loc][d]+=u;if(k===0)ves0[s.loc][d]+=u;}
      if(s.loc==='barrel'&&u)bWine[L.wi][d]+=u;
    }
  }));
  // lots of one wine share lot tanks up to lotsPerTank, but never more wine than the tanks hold
  for(const key in grp){const g=grp[key],k0=key.endsWith('|0');for(let d=0;d<D;d++)if(g.u[d]>0){const n=Math.max(Math.ceil(g.u[d]-1e-9),Math.ceil(g.gal[d]/size.storage-1e-9));ves.storage[d]+=n;if(k0)ves0.storage[d]+=n}}
  const peak=(a)=>{let mx=0,at=0;for(let d=0;d<365;d++)if(a[d]>mx){mx=a[d];at=d}return{v:mx,at}};
  const need={};LOCS.forEach(([k])=>need[k]=peak(ves[k]));
  // VEN 235 floor: fermenting volume divided by tank size, as if lots could be split freely across tanks. Whole lots in
  // whole tanks can never do better, so the vessel count must sit at or above it.
  const floorOf=k=>{let m=0;for(let d=0;d<365;d++)m=Math.max(m,lanes[k][d]/size[k]);return m};
  const fermFloor={redTank:size.redTank?floorOf('redTank'):0,whiteTank:size.whiteTank?floorOf('whiteTank'):0};
  const bPeak=bWine.map(a=>peak(a).v);
  const end=Math.max(...base.map(L=>L.release+365));
  const installedB=Math.ceil(need.barrel.v*(G.barrelSpare||1.05)-1e-9);let emptyBarrelDays=0;for(let d=0;d<365;d++)emptyBarrelDays+=Math.max(0,installedB-ves.barrel[d]);
  // installed barrels are the combined peak plus spares; each wine's share of them follows its own peak
  const sumB=bPeak.reduce((a,b)=>a+b,0), bStock=bPeak.map(b=>sumB?installedB*b/sumB:0);
  return {harvest,crushHrsDay,lots:base,lanes,lanes0,ves,ves0,size,need,fermFloor,bPeak,bStock,installedB,pressT,D,K,end,short,exceptions,winery,emptyBarrelDays};
}

// Daily cellar work and equipment time, built lot by lot from the same calendar as the flow.
const TASKS=[['crush','Crush days and sorting'],['press','Pressing'],['cap','Pumpovers and punchdowns'],['checks','Ferment checks and additions'],['moves','Transfers, racking, tank cleaning'],['barrel','Barrel work'],['bottling','Bottling'],['cases','Case goods and shipping'],['general','Rounds, cleaning, upkeep']];
const EQUIP=[['crushline','Sorting and destemming line'],['press','Press'],['mustpump','Must pump'],['popump','Pumpover pumps'],['xfer','Transfer pumps'],['washer','Barrel washer'],['bottler','Mobile bottling line'],['forklift','Forklift']];
function work(FL,V,G,sz){
  const D=FL.D,mk=K=>Object.fromEntries(K.map(([k])=>[k,new Float64Array(D)]));
  const T=mk(TASKS),T0=mk(TASKS),E=mk(EQUIP),E0=mk(EQUIP);
  const sortH=_W.SORT_LABOR[G.sort]??2.5,grav=G.buildTier==='gravity',GPH=3000,perHr=G.bottlePerDay/8;
  const put=(A,A0,key,d,h,k)=>{d=Math.floor(d);if(d<0||d>=D||!(h>0))return;A[key][d]+=h;if(k===0)A0[key][d]+=h};
  const spread=(A,A0,key,a,b,h,k)=>{if(!(h>0))return;for(let d=Math.max(0,Math.floor(a));d<Math.min(D,Math.ceil(b));d++){const w=Math.min(b,d+1)-Math.max(a,d);if(w>0){A[key][d]+=h*w;if(k===0)A0[key][d]+=h*w}}};
  const rate=Math.min(_W.CRUSH_RATE,_W.sortRate(G.sort||'none')),setup=G.crushSetupHrs??2;
  for(let k=-(FL.K||3);k<=1;k++){const o=365*k,crushDay={};FL.lots.forEach(L=>{
    const S=L.segs,red=L.color==='red',p=L.p+o;
    // crush on each pick day: sorting hours per ton now, the crew's day once all the day's picks are known
    L.picks.forEach(pk=>{const d=pk.day-AUG1+o,line=pk.tons/(red?rate:_W.CRUSH_RATE);crushDay[d]=(crushDay[d]||0)+line;
      put(T,T0,'crush',d,pk.tons*(red?sortH:0.8),k);put(E,E0,'crushline',d,red?line:0,k);put(E,E0,'forklift',d,Math.ceil(pk.tons/0.5-1e-9)*0.1,k);
      if(red&&!grav)put(E,E0,'mustpump',d,pk.tons*180/GPH+1,k)});
    S.filter(s=>s.loc==='press').forEach(ps=>{const h=red?L.pressHrs:ps.units*_W.PRESS_CYCLE_HRS.white;put(E,E0,'press',ps.a+o,h,k);put(T,T0,'press',ps.a+o,2*h+2*ps.units,k)});
    S.filter(s=>s.loc==='redTank').forEach(s=>{spread(T,T0,'cap',s.a+o,s.b+o,2*G.capHrs,k);spread(E,E0,'popump',s.a+o,s.b+o,0.5,k);spread(T,T0,'checks',s.a+o,s.b+o,0.25,k)});
    if(!red)S.filter(s=>s.loc==='whiteTank').forEach(s=>spread(T,T0,'checks',s.a+o,s.b+o,0.25,k));
    const ws=S.filter(s=>!s.ev&&s.loc!=='bottled').sort((x,y)=>x.a-y.a);
    for(let i=1;i<ws.length;i++){const fr=ws[i-1],to=ws[i],d=to.a+o;
      put(E,E0,'xfer',d,grav&&to.loc==='barrel'?0.25:to.gal/GPH+0.5,k);put(T,T0,'moves',d,2+(fr.loc==='barrel'?0:2),k);
      if(to.loc==='barrel')put(T,T0,'barrel',d,to.units*0.1,k);
      if(fr.loc==='barrel'){put(E,E0,'washer',d,fr.units*0.15,k);put(T,T0,'barrel',d,fr.units*0.25,k)}}
    S.filter(s=>s.loc==='barrel').forEach(s=>{spread(T,T0,'barrel',s.a+o,s.b+o,s.units*1.5/365,k);
      if(s.b-s.a>120){const m=(s.a+s.b)/2+o;put(T,T0,'barrel',m,s.units*0.4,k);put(E,E0,'xfer',m,s.units*BBL/GPH+1,k);put(E,E0,'washer',m,s.units*0.15,k)}});
    S.filter(s=>s.loc==='storage').forEach(s=>spread(T,T0,'moves',s.a+o,s.b+o,s.units*20/365,k));
    const bot=L.bottle+o,bd=Math.max(1,Math.ceil(L.wineCases/G.bottlePerDay-1e-9)),lh=L.cases/perHr;
    spread(T,T0,'bottling',bot,bot+bd,(6*lh+4/L.n)/bd,k);spread(E,E0,'bottler',bot,bot+bd,lh/bd,k);spread(E,E0,'forklift',bot,bot+bd,L.cases/56*0.1/bd,k);
    put(T,T0,'moves',bot,2,k);
    spread(T,T0,'cases',L.release+o,L.release+o+365,L.cases*0.03/365,k);
  });
  for(const d in crushDay)put(T,T0,'crush',+d,G.crushCrew*(setup+crushDay[d]),k)}
  const inst=sz&&sz.barrels||0,active=new Uint8Array(D);
  for(let d=0;d<D;d++){active[d]=FL.lanes.redTank[d]+FL.lanes.whiteTank[d]>0?1:0;
    const empty=Math.max(0,inst-FL.ves.barrel[d])*0.1/42, g=(active[d]?6:G.generalHrs/7)+empty;
    T.general[d]+=g;T0.general[d]+=g}
  const units={crushline:1,press:1,mustpump:grav?0:1,popump:Math.max(1,Math.ceil((sz&&sz.nRed||4)/4)),xfer:(sz&&sz.allTons>60)?2:1,washer:inst?1:0,bottler:1,forklift:1};
  return {T,T0,E,E0,active,units};
}
if(typeof module!=='undefined')module.exports={flow,lotPlan,work,LOCS,UNIT,TASKS,EQUIP,AUG1,MO};
