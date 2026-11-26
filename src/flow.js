// Steady-state cellar flow: every lot of several overlapping vintages, day by day, by location, in gallons and vessels.
// Day 0 = Aug 1 of the harvest year. Vintages k=-3..1 are identical and offset by 365 days, so days 0 to 364
// are a normal year once the brand is running, with older vintages still in barrel or bottle.
const LOCS=[['pad','Crush pad'],['press','Press'],['redTank','Red ferment tanks'],['whiteTank','White tanks'],['storage','Lot tanks: ML and storage'],['blend','Blending and bottling tanks'],['barrel','Barrels'],['bottled','Bottled, not yet sold']];
const UNIT={pad:['bin','bins'],press:['press load','press loads'],redTank:['tank','tanks'],whiteTank:['tank','tanks'],storage:['tank','tanks'],blend:['tank','tanks'],barrel:['barrel','barrels'],bottled:['pallet','pallets']};
const AUG1=213, MIDOCT=288-213, MO=30.44, GAL_CASE=2.378, BBL=59.4, STD_TANK=[500,750,1000,1500,2000,2500,3000,4000,5000,6000,8000];
const flowCache={};
const _X=typeof exception==='function'?{exception}:require('./exceptions.js');
const _W=typeof lotParams==='function'?{wineryFor,lotParams,crushHours,jacketBTU,PRESS_CYCLE_HRS,SORT_LABOR,CRUSH_RATE,crushHoursPerDay,pickCapTons,pickDays,sortRate}:require('./winery.js');
function lotSim(v,tons,pick,W,simulate){
  const p=_W.lotParams(v,tons,pick,W),k=JSON.stringify(p);
  if(!flowCache[k])flowCache[k]=simulate(p);
  return flowCache[k];
}
const stdTank=gal=>STD_TANK.find(s=>s>=gal)||STD_TANK[STD_TANK.length-1];
function lotPlan(V,G,simulate){
  const lots=[], short={}, exc=[], seen=new Set(), flag=(key,cls,o)=>{if(!seen.has(key)){seen.add(key);exc.push(_X.exception(cls,o))}};
  // red ferment tank size first (it depends only on lot volume), so each lot's jacket cooling comes from the tank it sits in
  // A lot is one pick. A variety is picked in as few picks as the winemaker's largest lot and one day's crush or press
  // capacity allow, so a small block comes in all at once.
  const W0=_W.wineryFor(V,G,0);
  const split=v=>{const tons=v.cases/v.cpt,cap=Math.min(G.lotTons,_W.pickCapTons(v.color,W0,G)),n=Math.max(1,Math.ceil(tons/cap-1e-9));return {tons,n,lt:tons/n,cap}};
  const redGal=Math.max(0,...V.filter(v=>v.color==='red').map(v=>{const {lt}=split(v),q=_W.lotParams(v,lt,0,W0);return lt*q.mustGal*(1+q.headspace/100)}));
  const W=_W.wineryFor(V,G,redGal?stdTank(redGal):0), pressT=W.press.tons;
  V.forEach((v,wi)=>{
    const {n,lt}=split(v), cases=v.cases/n, days=_W.pickDays(v,n,G);
    const bm=Math.min(v.bottle??(v.barrel>0?Math.round((v.color==='red'?6:0.5)+v.barrel+1):5),v.release),bottle=MIDOCT+bm*MO, release=MIDOCT+v.release*MO;
    for(let j=0;j<n;j++){
      const pick=days[j], p=pick-AUG1, S=[];
      const seg=(loc,a,b,gal,units,x)=>{if(b>a)S.push({loc,a:p+a,b:p+b,gal,units,...x})};
      const ev=(loc,a,gal,units)=>S.push({loc,a:p+a,b:p+a+1,gal,units,ev:true});
      const bot=bottle-p, bl=bot-21, wineGal=v.cases*GAL_CASE*1.03, bins=Math.ceil(lt/0.5-1e-9), loads=Math.ceil(lt/pressT-1e-9);
      // barrel time as set, unless bottling cuts it short; a gap under 60 days before blending is absorbed into barrel
      // time rather than a short tank stay. Either way it is a change to how the wine is made, so it is reported.
      const barrelOut=(inDay,wantGal)=>{
        let out=Math.min(inDay+v.barrel*MO,bl);
        if(inDay+v.barrel*MO>bl+7){short[wi]=(bl-inDay)/MO;
          flag('short'+wi,'method',{constraint:'Bottling date',wine:v.name,process:'Barrel aging',what:`bottles before its barrel time is up: about ${Math.round((bl-inDay)/MO)} of ${v.barrel} months in barrel`,consequences:'less oak and less time on lees than intended',remedies:'move bottling later in the wine table, or accept the shorter barrel time'})}
        if(bl-out<60&&bl>out){
          flag('ext'+wi,'method',{constraint:'Blending date',wine:v.name,process:'Barrel aging',what:`barrel time extended from ${v.barrel} to about ${((bl-inDay)/MO).toFixed(1)} months, so the wine goes straight from barrel to blending instead of spending ${Math.round(bl-out)} days in a lot tank`,consequences:'more oak contact and barrels held longer than set',remedies:'set bottling so the barrel time ends at blending, or allow a short tank stay'});
          out=bl}
        return out;
      };
      let crushHrs,pressHrs;
      if(v.color==='red'){
        const q=_W.lotParams(v,lt,pick,W), nT=Math.ceil(lt*q.mustGal*(1+q.headspace/100)/W.redTankGal-1e-9), r=lotSim(v,lt,pick,{...W,coolBTU:nT*W.coolBTU},simulate);
        if(r.stuck)flag('stuck'+wi+'|'+j,'method',{constraint:'Fermentation kinetics',wine:v.name,lot:j,process:'Primary fermentation',what:`did not finish: ${Math.round(r.S)} g/L sugar left after ${Math.round(r.pressDay)} days`,consequences:'the lot holds its fermenter to the end of the simulated window and is pressed with sugar left, so that tank turns over late and the wine is exposed until it is restarted',remedies:'pick at lower Brix, add nutrients, warm the tank, or restart with an acclimated yeast'});
        if(r.mlStuck)flag('ml'+wi+'|'+j,'method',{constraint:'Malolactic kinetics',wine:v.name,lot:j,process:'Malolactic fermentation',what:'did not finish within 300 days of pressing',consequences:'malic acid left in the wine going to barrel',remedies:'reinoculate, warm the wine, or check SO2 and pH'});
        if(r.barrelForced)flag('bf'+wi+'|'+j,'reschedule',{constraint:'Cellar temperature',wine:v.name,lot:j,process:'Barrel down',what:'the cellar never reached the barrel-down temperature, so the lot went to barrel 300 days after pressing',consequences:'the lot tank is held all winter and spring',remedies:'heat the cellar or move to barrel on a date instead of a temperature'});
        const barrelDay=Math.min(r.barrelDay,bot-30), bg=r.barrelGal;
        ev('pad',0,r.mustGal,bins);seg('redTank',0,r.pressEnd,r.tankGal);ev('press',Math.floor(r.pressDay),r.gal,loads);
        if(v.barrel>0){seg('storage',r.pressEnd,barrelDay,r.gal);const out=barrelOut(barrelDay);seg('barrel',barrelDay,out,bg,Math.ceil(bg/BBL-1e-9));seg('storage',out,bl,bg)}
        else seg('storage',r.pressEnd,bl,r.gal);
        seg('blend',bl,bot,bg,null,{wine:wineGal,n});
        crushHrs=_W.crushHours(lt,'red',W.sort);pressHrs=r.pressHrs;
      }else{
        const juice=lt*170;
        ev('pad',0,lt*180,bins);ev('press',0,juice,loads);seg('whiteTank',0,2,juice*1.1);
        if(v.barrel>0){const out=barrelOut(2);seg('barrel',2,out,juice*0.96,Math.ceil(juice*0.96/BBL-1e-9));seg('storage',out,bl,juice*0.94)}
        else{seg('whiteTank',2,21,juice*1.1);seg('storage',21,bl,juice*0.96)}
        seg('blend',bl,bot,juice*0.94,null,{wine:wineGal,n});
        crushHrs=_W.crushHours(lt,'white',W.sort);pressHrs=loads*_W.PRESS_CYCLE_HRS.white;
      }
      const bg=cases*GAL_CASE, rel=release-p;
      seg('bottled',bot,rel,bg,cases/56);
      for(let q=0;q<12;q++){const f=1-(q+0.5)/12;seg('bottled',rel+q*MO,rel+(q+1)*MO,bg*f,cases*f/56)}
      lots.push({wi,name:v.name,j,n,tons:lt,cases,wineCases:v.cases,pick,p,color:v.color,segs:S,bottle,release,bins,loads,crushHrs,pressHrs,mustGal:lt*180});
    }
  });
  // One day's crush line and press against what was picked that day; more than fits is overtime or a second shift.
  const hrs=_W.crushHoursPerDay(G),byDay={};
  lots.forEach(L=>{(byDay[L.pick]=byDay[L.pick]||[]).push(L)});
  for(const d in byDay){const Ls=byDay[d],reds=Ls.filter(L=>L.color==='red'),whites=Ls.filter(L=>L.color==='white');
    const line=reds.reduce((a,L)=>a+L.tons/Math.min(_W.CRUSH_RATE,_W.sortRate(W.sort)),0), press=whites.reduce((a,L)=>a+L.loads*_W.PRESS_CYCLE_HRS.white,0);
    const names=[...new Set(Ls.map(L=>L.name))].join(' and ');
    if(line>hrs+1e-9)exc.push(_X.exception('overtime',{constraint:'Crush line hours',wine:names,process:'Crush',what:`pick day ${dayLabel(+d)}: ${reds.reduce((a,L)=>a+L.tons,0).toFixed(1)} tons of reds need ${line.toFixed(1)} line hours against ${hrs} in the crush window`,consequences:'fruit waits on the pad or the crew works a longer day',remedies:'add a crush shift, pick one block a day later, or sort faster'}));
    if(press>G.workDayHrs+1e-9)exc.push(_X.exception('overtime',{constraint:'White press hours',wine:names,process:'Pressing',what:`pick day ${dayLabel(+d)}: ${whites.length} white picks need ${press.toFixed(1)} press hours against a ${G.workDayHrs}-hour day`,consequences:'whole clusters wait for the press',remedies:'pick one block a day later or use a larger press'}));
  }
  return {lots,pressT,short,exceptions:exc,winery:W,crushHrsDay:hrs};
}
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function dayLabel(doy){const dt=new Date(Date.UTC(2027,0,1)+(doy-1)*864e5);return MONTHS[dt.getUTCMonth()]+' '+dt.getUTCDate()}
function flow(V,G,simulate){
  const {lots:base,pressT,short,exceptions,winery}=lotPlan(V,G,simulate), kk=Math.max(1,G.lotsPerTank||1);
  // enough overlaid vintages that every lot's whole life, from pick to the last case sold, lands in the normal-year window
  const maxEnd=Math.max(...base.flatMap(L=>L.segs.map(s=>s.b))), K=Math.max(3,Math.floor(maxEnd/365)), D=Math.max(365*4,Math.ceil((maxEnd+1)/365)*365);
  // one tank size per tank type: the smallest standard size that holds the largest lot there
  const size={};['redTank','whiteTank','storage','blend'].forEach(k=>{const mx=Math.max(0,...base.flatMap(l=>l.segs.filter(s=>s.loc===k).map(s=>k==='blend'?Math.max(s.wine,s.gal*s.n):k==='storage'?s.gal*Math.min(kk,l.n):s.gal)));size[k]=stdTank(mx)});
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
  return {lots:base,lanes,lanes0,ves,ves0,size,need,fermFloor,bPeak,bStock,installedB,pressT,D,K,end,short,exceptions,winery,emptyBarrelDays};
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
  for(let k=-3;k<=1;k++){const o=365*k;FL.lots.forEach(L=>{
    const S=L.segs,red=L.color==='red',p=L.p+o;
    put(T,T0,'crush',p,G.crushCrew*6+L.tons*(red?sortH:0.8),k);
    put(E,E0,'crushline',p,red?L.crushHrs:0,k);put(E,E0,'forklift',p,L.bins*0.1,k);
    if(red&&!grav)put(E,E0,'mustpump',p,L.mustGal/GPH+1,k);
    const ps=S.find(s=>s.loc==='press');if(ps){put(E,E0,'press',ps.a+o,L.pressHrs,k);put(T,T0,'press',ps.a+o,2*L.pressHrs+2*L.loads,k)}
    S.filter(s=>s.loc==='redTank').forEach(s=>{spread(T,T0,'cap',s.a+o,s.b+o,2*G.capHrs,k);spread(E,E0,'popump',s.a+o,s.b+o,0.5,k);spread(T,T0,'checks',s.a+o,s.b+o,0.25,k)});
    if(!red)spread(T,T0,'checks',p+2,p+20,0.25,k);
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
  })}
  const inst=sz&&sz.barrels||0,active=new Uint8Array(D);
  for(let d=0;d<D;d++){active[d]=FL.lanes.redTank[d]+FL.lanes.whiteTank[d]>0?1:0;
    const empty=Math.max(0,inst-FL.ves.barrel[d])*0.1/42, g=(active[d]?6:G.generalHrs/7)+empty;
    T.general[d]+=g;T0.general[d]+=g}
  const units={crushline:1,press:1,mustpump:grav?0:1,popump:Math.max(1,Math.ceil((sz&&sz.nRed||4)/4)),xfer:(sz&&sz.allTons>60)?2:1,washer:inst?1:0,bottler:1,forklift:1};
  return {T,T0,E,E0,active,units};
}
if(typeof module!=='undefined')module.exports={flow,lotPlan,work,LOCS,UNIT,TASKS,EQUIP,AUG1,MO};
